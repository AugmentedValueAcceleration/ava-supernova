import { exec } from 'node:child_process';
import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

const TEST_TIMEOUT_MS = 300_000; // 5 minutes
const MAX_OUTPUT_LENGTH = 30_000;

interface DetectedRunner {
  name: string;
  command: string;
  fileFlag?: string;
}

export class TestRunTool implements Tool {
  readonly name = 'test_run';
  readonly description = 'Detect the project test framework and run tests (full suite or specific file)';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'test_run',
    description:
      'Detect the test framework in the current project and run tests. ' +
      'Auto-detects Jest, Vitest, Mocha, Pytest, Cargo test, Go test, and more. ' +
      'Can run the full suite or a specific test file. Returns pass/fail counts and failure details.',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Run tests for a specific file only. Omit for full test suite.',
        },
        command: {
          type: 'string',
          description: 'Override auto-detected test command (e.g., "npm test", "pytest -x").',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in seconds. Default: 300 (5 minutes).',
        },
      },
      required: [],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const filePath = args.file_path as string | undefined;
    const commandOverride = args.command as string | undefined;
    const timeout = ((args.timeout as number) ?? 300) * 1000;

    let command: string;

    if (commandOverride) {
      command = filePath ? `${commandOverride} ${filePath}` : commandOverride;
    } else {
      const runner = await this.detectRunner(context.cwd);
      if (!runner) {
        return { success: false, output: 'Could not detect a test framework. Use the "command" parameter to specify one.' };
      }
      command = filePath && runner.fileFlag
        ? `${runner.command} ${runner.fileFlag} ${filePath}`
        : filePath
          ? `${runner.command} ${filePath}`
          : runner.command;
    }

    return new Promise((resolve) => {
      const child = exec(command, {
        cwd: context.cwd,
        timeout: Math.min(timeout, TEST_TIMEOUT_MS),
        maxBuffer: 1024 * 1024 * 10,
        env: { ...process.env, FORCE_COLOR: '0', CI: 'true' },
      }, (error, stdout, stderr) => {
        let output = '';
        if (stdout) output += stdout;
        if (stderr) output += (output ? '\n' : '') + stderr;

        if (error?.killed) {
          output += `\n\nTest timed out after ${Math.round(timeout / 1000)}s`;
        }

        if (output.length > MAX_OUTPUT_LENGTH) {
          output = output.slice(0, MAX_OUTPUT_LENGTH) + '\n... (output truncated)';
        }

        // Parse results
        const parsed = this.parseResults(output);

        let summary = `Command: ${command}\n`;
        summary += `Result: ${error ? 'FAILED' : 'PASSED'}\n`;
        if (parsed) {
          summary += `Tests: ${parsed.passed} passed, ${parsed.failed} failed`;
          if (parsed.skipped > 0) summary += `, ${parsed.skipped} skipped`;
          summary += ` (${parsed.total} total)\n`;
        }
        summary += `\n${output}`;

        resolve({
          success: !error,
          output: summary,
          metadata: { command, ...(parsed || {}) },
        });
      });

      if (context.onOutput) {
        const onOutput = context.onOutput;
        child.stdout?.on('data', (chunk: Buffer) => onOutput(chunk.toString()));
        child.stderr?.on('data', (chunk: Buffer) => onOutput(chunk.toString()));
      }
    });
  }

  private async detectRunner(cwd: string): Promise<DetectedRunner | null> {
    // Check package.json for JS/TS projects
    try {
      const pkg = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf-8'));
      const deps = { ...pkg.devDependencies, ...pkg.dependencies };
      const scripts = pkg.scripts || {};

      if (deps.vitest || scripts.test?.includes('vitest')) {
        return { name: 'Vitest', command: 'npx vitest run', fileFlag: '' };
      }
      if (deps.jest || scripts.test?.includes('jest')) {
        return { name: 'Jest', command: 'npx jest --no-coverage', fileFlag: '' };
      }
      if (deps.mocha || scripts.test?.includes('mocha')) {
        return { name: 'Mocha', command: 'npx mocha', fileFlag: '' };
      }
      if (scripts.test) {
        return { name: 'npm test', command: 'npm test --' };
      }
    } catch { /* not a JS project */ }

    // Python
    try {
      await access(join(cwd, 'pyproject.toml'));
      return { name: 'Pytest', command: 'python -m pytest -v', fileFlag: '' };
    } catch { /* ignore */ }
    try {
      await access(join(cwd, 'setup.py'));
      return { name: 'Pytest', command: 'python -m pytest -v', fileFlag: '' };
    } catch { /* ignore */ }

    // Rust
    try {
      await access(join(cwd, 'Cargo.toml'));
      return { name: 'Cargo', command: 'cargo test', fileFlag: '--' };
    } catch { /* ignore */ }

    // Go
    try {
      await access(join(cwd, 'go.mod'));
      return { name: 'Go', command: 'go test ./...', fileFlag: '-run' };
    } catch { /* ignore */ }

    return null;
  }

  private parseResults(output: string): { passed: number; failed: number; skipped: number; total: number } | null {
    // Jest/Vitest: "Tests:  2 passed, 1 failed, 3 total"
    const jestMatch = output.match(/Tests:\s+(\d+)\s+passed,?\s*(\d+)\s+failed,?\s*(?:(\d+)\s+skipped,?\s*)?(\d+)\s+total/i);
    if (jestMatch) {
      return { passed: +jestMatch[1], failed: +jestMatch[2], skipped: +(jestMatch[3] || 0), total: +jestMatch[4] };
    }

    // Pytest: "2 passed, 1 failed"
    const pytestPassed = output.match(/(\d+)\s+passed/);
    const pytestFailed = output.match(/(\d+)\s+failed/);
    const pytestSkipped = output.match(/(\d+)\s+skipped/);
    if (pytestPassed || pytestFailed) {
      const p = +(pytestPassed?.[1] || 0);
      const f = +(pytestFailed?.[1] || 0);
      const s = +(pytestSkipped?.[1] || 0);
      return { passed: p, failed: f, skipped: s, total: p + f + s };
    }

    // Go: "ok" or "FAIL" lines
    const goOk = (output.match(/^ok\s/gm) || []).length;
    const goFail = (output.match(/^FAIL\s/gm) || []).length;
    if (goOk + goFail > 0) {
      return { passed: goOk, failed: goFail, skipped: 0, total: goOk + goFail };
    }

    // Cargo: "test result: ok. X passed; Y failed"
    const cargoMatch = output.match(/test result:.*?(\d+)\s+passed;\s+(\d+)\s+failed;\s+(\d+)\s+ignored/);
    if (cargoMatch) {
      return { passed: +cargoMatch[1], failed: +cargoMatch[2], skipped: +cargoMatch[3], total: +cargoMatch[1] + +cargoMatch[2] + +cargoMatch[3] };
    }

    return null;
  }
}
