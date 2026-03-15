import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join, dirname, basename, extname } from 'node:path';
import { glob } from 'glob';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { validatePath } from './security.js';

const MAX_FILE_SIZE = 50_000;

interface TestFrameworkInfo {
  name: string;
  extension: string;
  testDir: string;
  testSuffix: string;
  imports: string;
  template: (fileName: string, content: string) => string;
}

export class TestGenerateTool implements Tool {
  readonly name = 'test_generate';
  readonly description = 'Generate test scaffolding for a source file using the detected test framework';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'test_generate',
    description:
      'Generate a test file for a given source file. Detects the test framework (Jest, Vitest, Pytest, etc.) ' +
      'and creates a test scaffold with imports, describe blocks, and placeholder test cases based on ' +
      'exported functions/classes found in the source file. Looks at existing tests in the project for style consistency.',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to the source file to generate tests for.',
        },
        framework: {
          type: 'string',
          enum: ['jest', 'vitest', 'mocha', 'pytest'],
          description: 'Override auto-detected framework.',
        },
        output_path: {
          type: 'string',
          description: 'Custom output path for the test file. Auto-generated if omitted.',
        },
      },
      required: ['file_path'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const filePath = args.file_path as string;
    const frameworkOverride = args.framework as string | undefined;
    const outputPath = args.output_path as string | undefined;

    let absolutePath: string;
    try {
      absolutePath = validatePath(filePath, context.cwd);
    } catch (err) {
      return { success: false, output: (err as Error).message };
    }

    // Read source file
    let source: string;
    try {
      source = await readFile(absolutePath, 'utf-8');
    } catch {
      return { success: false, output: `Cannot read file: ${filePath}` };
    }

    if (source.length > MAX_FILE_SIZE) {
      source = source.slice(0, MAX_FILE_SIZE) + '\n// ... (truncated for test generation)';
    }

    const ext = extname(absolutePath);
    const name = basename(absolutePath, ext);
    const isPython = ext === '.py';

    // Detect framework
    const framework = frameworkOverride
      ? this.getFramework(frameworkOverride, isPython)
      : await this.detectFramework(context.cwd, isPython);

    if (!framework) {
      return { success: false, output: 'Could not detect test framework. Use the "framework" parameter.' };
    }

    // Extract exports/functions for test scaffolding
    const symbols = isPython
      ? this.extractPythonSymbols(source)
      : this.extractJsSymbols(source);

    // Look for existing test examples for style consistency
    const existingExample = await this.findExistingTest(context.cwd, framework);

    // Generate test content
    const testContent = this.buildTest(framework, name, filePath, symbols, existingExample);

    // Determine output path
    let testPath: string;
    if (outputPath) {
      try {
        testPath = validatePath(outputPath, context.cwd);
      } catch (err) {
        return { success: false, output: (err as Error).message };
      }
    } else {
      testPath = this.resolveTestPath(absolutePath, framework, context.cwd);
    }

    // Check if test file already exists
    try {
      await access(testPath);
      return {
        success: false,
        output: `Test file already exists: ${testPath}\nUse output_path to specify a different location, or delete the existing file first.`,
      };
    } catch { /* good — doesn't exist */ }

    // Write test file
    await mkdir(dirname(testPath), { recursive: true });
    await writeFile(testPath, testContent, 'utf-8');

    const lineCount = testContent.split('\n').length;
    return {
      success: true,
      output: `Generated ${framework.name} test file:\n  ${testPath}\n  ${symbols.length} test cases, ${lineCount} lines\n\nSymbols covered:\n${symbols.map(s => `  - ${s}`).join('\n')}`,
      metadata: { path: testPath, framework: framework.name, symbols, lineCount },
    };
  }

  private extractJsSymbols(source: string): string[] {
    const symbols: string[] = [];
    // export function/const/class
    const exportRegex = /export\s+(?:default\s+)?(?:function|const|class|async\s+function)\s+(\w+)/g;
    let match;
    while ((match = exportRegex.exec(source)) !== null) {
      symbols.push(match[1]);
    }
    // module.exports
    const cjsRegex = /module\.exports\s*=\s*\{?\s*([\w\s,]+)/;
    const cjsMatch = source.match(cjsRegex);
    if (cjsMatch) {
      symbols.push(...cjsMatch[1].split(',').map(s => s.trim()).filter(Boolean));
    }
    return symbols.length > 0 ? symbols : ['default'];
  }

  private extractPythonSymbols(source: string): string[] {
    const symbols: string[] = [];
    const funcRegex = /^(?:def|class|async\s+def)\s+(\w+)/gm;
    let match;
    while ((match = funcRegex.exec(source)) !== null) {
      if (!match[1].startsWith('_')) symbols.push(match[1]);
    }
    return symbols.length > 0 ? symbols : ['main'];
  }

  private async detectFramework(cwd: string, isPython: boolean): Promise<TestFrameworkInfo | null> {
    if (isPython) return this.getFramework('pytest', true);

    try {
      const pkg = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf-8'));
      const deps = { ...pkg.devDependencies, ...pkg.dependencies };
      if (deps.vitest) return this.getFramework('vitest', false);
      if (deps.jest) return this.getFramework('jest', false);
      if (deps.mocha) return this.getFramework('mocha', false);
      // Default to vitest for TS/JS projects
      return this.getFramework('vitest', false);
    } catch {
      return null;
    }
  }

  private getFramework(name: string, isPython: boolean): TestFrameworkInfo | null {
    if (isPython || name === 'pytest') {
      return {
        name: 'pytest',
        extension: '.py',
        testDir: 'tests',
        testSuffix: 'test_',
        imports: '',
        template: (fileName, _content) => `# Tests for ${fileName}`,
      };
    }

    const frameworks: Record<string, TestFrameworkInfo> = {
      jest: {
        name: 'jest', extension: '.test.ts', testDir: '__tests__', testSuffix: '.test',
        imports: '',
        template: (fn) => `import { ${fn} } from`,
      },
      vitest: {
        name: 'vitest', extension: '.test.ts', testDir: '__tests__', testSuffix: '.test',
        imports: "import { describe, it, expect } from 'vitest';",
        template: (fn) => `import { ${fn} } from`,
      },
      mocha: {
        name: 'mocha', extension: '.test.ts', testDir: 'test', testSuffix: '.test',
        imports: "import { expect } from 'chai';",
        template: (fn) => `import { ${fn} } from`,
      },
    };

    return frameworks[name] || null;
  }

  private buildTest(framework: TestFrameworkInfo, name: string, sourcePath: string, symbols: string[], existing: string | null): string {
    if (framework.name === 'pytest') {
      return this.buildPytestFile(name, sourcePath, symbols);
    }
    return this.buildJsTestFile(framework, name, sourcePath, symbols, existing);
  }

  private buildPytestFile(name: string, sourcePath: string, symbols: string[]): string {
    const module = sourcePath.replace(/\.py$/, '').replace(/[/\\]/g, '.');
    let out = `"""Tests for ${name}."""\n\n`;
    out += `from ${module} import ${symbols.join(', ')}\n\n\n`;
    for (const sym of symbols) {
      const isClass = sym[0] === sym[0].toUpperCase() && sym[0] !== sym[0].toLowerCase();
      if (isClass) {
        out += `class Test${sym}:\n`;
        out += `    """Tests for ${sym}."""\n\n`;
        out += `    def test_init(self):\n`;
        out += `        """Test ${sym} initialization."""\n`;
        out += `        instance = ${sym}()\n`;
        out += `        assert instance is not None\n\n`;
      } else {
        out += `def test_${sym}():\n`;
        out += `    """Test ${sym}."""\n`;
        out += `    result = ${sym}()\n`;
        out += `    assert result is not None\n\n\n`;
      }
    }
    return out;
  }

  private buildJsTestFile(framework: TestFrameworkInfo, name: string, sourcePath: string, symbols: string[], _existing: string | null): string {
    const relPath = sourcePath.replace(/\\/g, '/');
    const importPath = relPath.replace(/\.(ts|tsx|js|jsx)$/, '');

    let out = '';
    if (framework.imports) out += `${framework.imports}\n`;
    out += `import { ${symbols.join(', ')} } from '${importPath}';\n\n`;
    out += `describe('${name}', () => {\n`;

    for (const sym of symbols) {
      out += `  describe('${sym}', () => {\n`;
      out += `    it('should exist', () => {\n`;
      out += `      expect(${sym}).toBeDefined();\n`;
      out += `    });\n\n`;
      out += `    it('should work correctly', () => {\n`;
      out += `      // TODO: Add test implementation\n`;
      out += `      expect(true).toBe(true);\n`;
      out += `    });\n`;
      out += `  });\n\n`;
    }

    out += '});\n';
    return out;
  }

  private resolveTestPath(sourcePath: string, framework: TestFrameworkInfo, cwd: string): string {
    const ext = extname(sourcePath);
    const name = basename(sourcePath, ext);
    const dir = dirname(sourcePath);

    if (framework.name === 'pytest') {
      return join(cwd, 'tests', `test_${name}.py`);
    }

    // Co-locate test next to source file
    return join(dir, `${name}${framework.extension}`);
  }

  private async findExistingTest(cwd: string, framework: TestFrameworkInfo): Promise<string | null> {
    try {
      const pattern = framework.name === 'pytest'
        ? 'tests/test_*.py'
        : `**/*${framework.testSuffix}${framework.extension}`;

      const files = await glob(pattern, { cwd, absolute: true, nodir: true });
      if (files.length > 0) {
        const content = await readFile(files[0], 'utf-8');
        return content.slice(0, 2000); // First 2K for style reference
      }
    } catch { /* ignore */ }
    return null;
  }
}
