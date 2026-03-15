import { readFile, stat } from 'node:fs/promises';
import { exec } from 'node:child_process';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { validatePath } from './security.js';

const MAX_OUTPUT_LENGTH = 30_000;
const DEFAULT_LINES = 100;
const TAIL_TIMEOUT_MS = 10_000;

export class DebugLogsTool implements Tool {
  readonly name = 'debug_logs';
  readonly description = 'Read and filter log files or command output for debugging';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'debug_logs',
    description:
      'Read log files or capture command output for debugging. Supports filtering by regex pattern, ' +
      'limiting output to last N lines, and parsing common log formats (JSON logs, timestamped logs). ' +
      'Use source as a file path for log files, or a command string to capture live output.',
    parameters: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'File path to a log file, or a shell command to capture output from (e.g., "docker logs app").',
        },
        filter: {
          type: 'string',
          description: 'Regex pattern to filter lines (e.g., "ERROR|WARN", "status.*500").',
        },
        lines: {
          type: 'number',
          description: `Number of lines to return (from end of file/output). Default: ${DEFAULT_LINES}.`,
        },
        level: {
          type: 'string',
          enum: ['error', 'warn', 'info', 'debug', 'all'],
          description: 'Filter by log level (auto-detected from common formats). Default: all.',
        },
      },
      required: ['source'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const source = args.source as string;
    const filter = args.filter as string | undefined;
    const lines = (args.lines as number) ?? DEFAULT_LINES;
    const level = (args.level as string) ?? 'all';

    let rawOutput: string;
    let isFile = false;

    // Try as file path first
    try {
      const filePath = validatePath(source, context.cwd);
      const fileStat = await stat(filePath);
      if (fileStat.isFile()) {
        rawOutput = await readFile(filePath, 'utf-8');
        isFile = true;
      } else {
        return { success: false, output: `"${source}" is not a file.` };
      }
    } catch {
      // Not a file — try as command
      rawOutput = await this.runCommand(source, context.cwd);
    }

    // Split into lines and take last N
    let logLines = rawOutput.split('\n');
    logLines = logLines.slice(-lines);

    // Filter by level
    if (level !== 'all') {
      const levelPatterns: Record<string, RegExp> = {
        error: /\b(error|err|fatal|critical|panic)\b/i,
        warn: /\b(warn|warning)\b/i,
        info: /\b(info)\b/i,
        debug: /\b(debug|trace|verbose)\b/i,
      };
      const levelRegex = levelPatterns[level];
      if (levelRegex) {
        logLines = logLines.filter(l => levelRegex.test(l));
      }
    }

    // Filter by regex
    if (filter) {
      try {
        const regex = new RegExp(filter, 'i');
        logLines = logLines.filter(l => regex.test(l));
      } catch (err) {
        return { success: false, output: `Invalid filter regex: ${(err as Error).message}` };
      }
    }

    // Parse JSON log lines for better formatting
    const formatted = logLines.map(line => this.formatLogLine(line));

    let output = formatted.join('\n');
    if (output.length > MAX_OUTPUT_LENGTH) {
      output = output.slice(0, MAX_OUTPUT_LENGTH) + '\n... (output truncated)';
    }

    const summary = `Source: ${isFile ? 'file' : 'command'} "${source}"\n`;
    const filterInfo = filter ? `Filter: /${filter}/i\n` : '';
    const levelInfo = level !== 'all' ? `Level: ${level}\n` : '';
    const countInfo = `Lines: ${formatted.length}${logLines.length < lines ? '' : ` (last ${lines})`}\n\n`;

    return {
      success: true,
      output: summary + filterInfo + levelInfo + countInfo + output,
      metadata: {
        source,
        isFile,
        lineCount: formatted.length,
        filter: filter ?? undefined,
        level,
      },
    };
  }

  private formatLogLine(line: string): string {
    // Try parsing as JSON log
    try {
      if (line.trim().startsWith('{')) {
        const parsed = JSON.parse(line);
        const ts = parsed.timestamp || parsed.time || parsed.ts || parsed['@timestamp'] || '';
        const lvl = parsed.level || parsed.severity || parsed.lvl || '';
        const msg = parsed.message || parsed.msg || parsed.text || '';
        if (msg) {
          return `[${ts}] ${lvl.toUpperCase()} ${msg}`;
        }
      }
    } catch { /* not JSON */ }

    return line;
  }

  private runCommand(command: string, cwd: string): Promise<string> {
    return new Promise((resolve) => {
      exec(command, {
        cwd,
        timeout: TAIL_TIMEOUT_MS,
        maxBuffer: 1024 * 1024 * 5,
        env: { ...process.env, FORCE_COLOR: '0' },
      }, (_error, stdout, stderr) => {
        resolve((stdout || '') + (stderr || ''));
      });
    });
  }
}
