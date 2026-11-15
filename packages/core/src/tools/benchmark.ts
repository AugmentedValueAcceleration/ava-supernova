import { exec } from 'node:child_process';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AVA_HOME } from '../core/constants.js';
import { writeAtomic } from '../memory-v4/files.js';

const BENCHMARK_TIMEOUT_MS = 300_000;

/** Baselines are timings, not memories: their own file, keyed by folder + name. */
const BASELINES_FILE = () => join(AVA_HOME, 'benchmarks.json');
type Baselines = Record<string, { duration_ms: number; command: string; date: string }>;
async function readBaselines(): Promise<Baselines> {
  try { return JSON.parse(await readFile(BASELINES_FILE(), 'utf-8')) as Baselines; } catch { return {}; }
}

export class BenchmarkTool implements Tool {
  readonly name = 'benchmark';
  readonly description = 'Run a command and measure its execution time, optionally comparing against a stored baseline';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'benchmark',
    description:
      'Run a command (build, test, etc.) and measure execution time. Optionally stores the result as a ' +
      'named baseline for future comparison. Detects regressions when comparing against baselines.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The command to benchmark (e.g., "npm run build", "pytest", "cargo build").',
        },
        name: {
          type: 'string',
          description: 'Name for this benchmark (e.g., "build", "test-suite"). Used as the baseline key.',
        },
        save_baseline: {
          type: 'boolean',
          description: 'Save this result as the new baseline. Default: false.',
        },
        runs: {
          type: 'number',
          description: 'Number of runs to average. Default: 1. Max: 5.',
        },
      },
      required: ['command', 'name'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const command = args.command as string;
    const name = args.name as string;
    const saveBaseline = (args.save_baseline as boolean) ?? false;
    const runs = Math.min(Math.max((args.runs as number) ?? 1, 1), 5);

    const key = `${context.cwd}|${name}`;

    // Run benchmark
    const times: number[] = [];
    let lastExitCode = 0;

    for (let i = 0; i < runs; i++) {
      const result = await this.runCommand(command, context.cwd);
      times.push(result.duration);
      lastExitCode = result.exitCode;

      if (context.onOutput && runs > 1) {
        context.onOutput(`Run ${i + 1}/${runs}: ${(result.duration / 1000).toFixed(2)}s\n`);
      }
    }

    const avgMs = times.reduce((a, b) => a + b, 0) / times.length;
    const avgSec = avgMs / 1000;

    // Load baseline for comparison
    const baseline: number | null = (await readBaselines())[key]?.duration_ms ?? null;

    // Save baseline
    if (saveBaseline) {
      try {
        const all = await readBaselines();
        all[key] = { duration_ms: Math.round(avgMs), command, date: new Date().toISOString() };
        await writeAtomic(BASELINES_FILE(), JSON.stringify(all, null, 2));
      } catch { /* ignore */ }
    }

    // Build report
    let output = `## Benchmark: ${name}\n\n`;
    output += `Command: \`${command}\`\n`;
    output += `Result: ${lastExitCode === 0 ? 'SUCCESS' : `FAILED (exit ${lastExitCode})`}\n`;
    output += `Duration: **${avgSec.toFixed(2)}s**`;
    if (runs > 1) {
      output += ` (avg of ${runs} runs: ${times.map(t => (t / 1000).toFixed(2) + 's').join(', ')})`;
    }
    output += '\n';

    if (baseline !== null) {
      const baselineSec = baseline / 1000;
      const diff = avgMs - baseline;
      const pct = ((diff / baseline) * 100).toFixed(1);
      const faster = diff < 0;

      output += `\nBaseline: ${baselineSec.toFixed(2)}s\n`;
      output += `Change: ${faster ? '' : '+'}${pct}% (${faster ? '' : '+'}${(diff / 1000).toFixed(2)}s)\n`;

      if (diff > baseline * 0.1) {
        output += `\n**WARNING: ${pct}% regression detected!**\n`;
      } else if (faster) {
        output += `\nImprovement of ${Math.abs(+pct)}%.\n`;
      }
    } else {
      output += '\nNo baseline found. Use save_baseline: true to store one.\n';
    }

    if (saveBaseline) {
      output += `\nBaseline saved for "${name}".\n`;
    }

    return {
      success: lastExitCode === 0,
      output,
      metadata: {
        name,
        command,
        durationMs: Math.round(avgMs),
        runs,
        baseline: baseline ?? undefined,
        savedBaseline: saveBaseline,
      },
    };
  }

  private runCommand(command: string, cwd: string): Promise<{ duration: number; output: string; exitCode: number }> {
    return new Promise((resolve) => {
      const start = performance.now();
      exec(command, {
        cwd,
        timeout: BENCHMARK_TIMEOUT_MS,
        maxBuffer: 1024 * 1024 * 5,
        env: { ...process.env, FORCE_COLOR: '0' },
      }, (error, stdout, stderr) => {
        const duration = performance.now() - start;
        let output = '';
        if (stdout) output += stdout;
        if (stderr) output += (output ? '\n' : '') + stderr;
        if (output.length > 5000) output = output.slice(0, 5000) + '\n... (truncated)';
        resolve({ duration, output, exitCode: error?.code ?? 0 });
      });
    });
  }
}
