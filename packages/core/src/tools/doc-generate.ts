import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { glob } from 'glob';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { validatePath } from './security.js';

export class DocGenerateTool implements Tool {
  readonly name = 'doc_generate';
  readonly description = 'Generate project documentation (README, API docs, architecture overview) from source code';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'doc_generate',
    description:
      'Analyze the project structure and generate documentation. Types: readme (project overview with ' +
      'setup instructions), api (exported functions/classes with signatures), architecture (directory ' +
      'structure, dependencies, data flow), getting-started (quick start guide).',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['readme', 'api', 'architecture', 'getting-started'],
          description: 'Type of documentation to generate.',
        },
        output_path: {
          type: 'string',
          description: 'Output file path. Default: README.md, API.md, ARCHITECTURE.md, or GETTING-STARTED.md in project root.',
        },
      },
      required: ['type'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const type = args.type as string;
    const outputArg = args.output_path as string | undefined;

    const defaultPaths: Record<string, string> = {
      readme: 'README.md',
      api: 'API.md',
      architecture: 'ARCHITECTURE.md',
      'getting-started': 'GETTING-STARTED.md',
    };

    const outputPath = outputArg
      ? validatePath(outputArg, context.cwd)
      : join(context.cwd, defaultPaths[type] || 'DOCS.md');

    // Gather project info
    const info = await this.gatherProjectInfo(context.cwd);

    // Generate content
    let content: string;
    switch (type) {
      case 'readme': content = this.generateReadme(info); break;
      case 'api': content = await this.generateApi(info, context.cwd); break;
      case 'architecture': content = this.generateArchitecture(info); break;
      case 'getting-started': content = this.generateGettingStarted(info); break;
      default: return { success: false, output: `Unknown doc type: ${type}` };
    }

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, content, 'utf-8');

    const lineCount = content.split('\n').length;
    return {
      success: true,
      output: `Generated ${type} documentation:\n  ${outputPath}\n  ${lineCount} lines`,
      metadata: { path: outputPath, type, lineCount },
    };
  }

  private async gatherProjectInfo(cwd: string) {
    const info: Record<string, unknown> = { cwd };

    // package.json
    try {
      const pkg = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf-8'));
      info.name = pkg.name;
      info.version = pkg.version;
      info.description = pkg.description;
      info.scripts = pkg.scripts;
      info.dependencies = Object.keys(pkg.dependencies || {});
      info.devDependencies = Object.keys(pkg.devDependencies || {});
      info.license = pkg.license;
      info.packageManager = 'npm';
      if (pkg.packageManager?.startsWith('pnpm')) info.packageManager = 'pnpm';
      else if (pkg.packageManager?.startsWith('yarn')) info.packageManager = 'yarn';
    } catch { /* not a JS project */ }

    // pyproject.toml
    try {
      const pyproject = await readFile(join(cwd, 'pyproject.toml'), 'utf-8');
      info.pythonProject = true;
      const nameMatch = pyproject.match(/name\s*=\s*"([^"]+)"/);
      if (nameMatch) info.name = nameMatch[1];
    } catch { /* ignore */ }

    // Directory structure (top 2 levels)
    const files = await glob('**/*', { cwd, nodir: true, ignore: ['node_modules/**', 'dist/**', '.git/**', 'build/**', '.next/**'], maxDepth: 3 });
    info.structure = files.slice(0, 100);

    // Source files count
    const srcFiles = await glob('**/*.{ts,tsx,js,jsx,py,go,rs}', { cwd, nodir: true, ignore: ['node_modules/**', 'dist/**'] });
    info.sourceFileCount = srcFiles.length;

    // README exists?
    try {
      info.existingReadme = await readFile(join(cwd, 'README.md'), 'utf-8');
    } catch { /* ignore */ }

    return info;
  }

  private generateReadme(info: Record<string, unknown>): string {
    const name = (info.name as string) || 'Project';
    const desc = (info.description as string) || '';
    const license = (info.license as string) || '';
    const pm = (info.packageManager as string) || 'npm';
    const scripts = (info.scripts as Record<string, string>) || {};
    const deps = (info.dependencies as string[]) || [];

    let out = `# ${name}\n\n`;
    if (desc) out += `${desc}\n\n`;

    out += `## Installation\n\n\`\`\`bash\n${pm} install\n\`\`\`\n\n`;

    if (Object.keys(scripts).length > 0) {
      out += `## Scripts\n\n`;
      for (const [key, value] of Object.entries(scripts)) {
        out += `- \`${pm} run ${key}\` — \`${value}\`\n`;
      }
      out += '\n';
    }

    if (deps.length > 0) {
      out += `## Dependencies\n\n`;
      out += deps.map(d => `- ${d}`).join('\n') + '\n\n';
    }

    if (license) out += `## License\n\n${license}\n`;

    return out;
  }

  private async generateApi(_info: Record<string, unknown>, cwd: string): Promise<string> {
    const files = await glob('**/src/**/*.{ts,js}', { cwd, absolute: true, nodir: true, ignore: ['**/*.test.*', '**/*.spec.*', '**/node_modules/**'] });

    let out = `# API Reference\n\n`;

    for (const file of files.slice(0, 30)) {
      try {
        const content = await readFile(file, 'utf-8');
        const exports = this.extractExports(content);
        if (exports.length === 0) continue;

        const rel = relative(cwd, file);
        out += `## ${rel}\n\n`;
        for (const exp of exports) {
          out += `### \`${exp.name}\`\n\n`;
          out += `- **Type:** ${exp.type}\n`;
          if (exp.signature) out += `- **Signature:** \`${exp.signature}\`\n`;
          out += '\n';
        }
      } catch { /* skip */ }
    }

    return out;
  }

  private generateArchitecture(info: Record<string, unknown>): string {
    const structure = (info.structure as string[]) || [];
    const srcCount = (info.sourceFileCount as number) || 0;

    let out = `# Architecture\n\n`;
    out += `**Source files:** ${srcCount}\n\n`;

    out += `## Directory Structure\n\n\`\`\`\n`;
    // Group by top-level directory
    const dirs = new Map<string, string[]>();
    for (const f of structure) {
      const parts = f.split('/');
      const topDir = parts.length > 1 ? parts[0] : '.';
      if (!dirs.has(topDir)) dirs.set(topDir, []);
      dirs.get(topDir)!.push(f);
    }
    for (const [dir, files] of dirs) {
      out += `${dir}/\n`;
      for (const f of files.slice(0, 10)) {
        out += `  ${f}\n`;
      }
      if (files.length > 10) out += `  ... (${files.length - 10} more)\n`;
    }
    out += `\`\`\`\n\n`;

    return out;
  }

  private generateGettingStarted(info: Record<string, unknown>): string {
    const name = (info.name as string) || 'the project';
    const pm = (info.packageManager as string) || 'npm';
    const scripts = (info.scripts as Record<string, string>) || {};

    let out = `# Getting Started with ${name}\n\n`;

    out += `## Prerequisites\n\n`;
    out += `- Node.js 18+\n`;
    out += `- ${pm}\n\n`;

    out += `## Setup\n\n`;
    out += `\`\`\`bash\ngit clone <repository-url>\ncd ${name}\n${pm} install\n\`\`\`\n\n`;

    if (scripts.dev) {
      out += `## Development\n\n\`\`\`bash\n${pm} run dev\n\`\`\`\n\n`;
    }

    if (scripts.build) {
      out += `## Build\n\n\`\`\`bash\n${pm} run build\n\`\`\`\n\n`;
    }

    if (scripts.test) {
      out += `## Testing\n\n\`\`\`bash\n${pm} test\n\`\`\`\n\n`;
    }

    return out;
  }

  private extractExports(content: string): Array<{ name: string; type: string; signature?: string }> {
    const exports: Array<{ name: string; type: string; signature?: string }> = [];
    const regex = /export\s+(?:default\s+)?(function|const|class|type|interface|enum|async\s+function)\s+(\w+)([^{;]*)/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      exports.push({
        name: match[2],
        type: match[1].replace('async ', 'async '),
        signature: match[3]?.trim()?.slice(0, 100) || undefined,
      });
    }
    return exports;
  }
}
