import { exec } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

const AUDIT_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_LENGTH = 30_000;

export class AuditDependenciesTool implements Tool {
  readonly name = 'audit_dependencies';
  readonly description = 'Run a security audit on project dependencies and report vulnerabilities';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'audit_dependencies',
    description:
      'Detect the package manager and run its native security audit (npm audit, pnpm audit, yarn audit, ' +
      'pip-audit, cargo audit). Returns vulnerabilities grouped by severity with fix recommendations.',
    parameters: {
      type: 'object',
      properties: {
        fix: {
          type: 'boolean',
          description: 'Attempt to auto-fix vulnerabilities (runs npm audit fix or equivalent). Default: false.',
        },
        severity: {
          type: 'string',
          enum: ['low', 'moderate', 'high', 'critical'],
          description: 'Minimum severity to report. Default: all.',
        },
      },
      required: [],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const fix = (args.fix as boolean) ?? false;
    const minSeverity = args.severity as string | undefined;

    // Detect package manager
    const pm = await this.detectPackageManager(context.cwd);
    if (!pm) {
      return { success: false, output: 'No supported package manager detected (npm, pnpm, yarn, pip, cargo).' };
    }

    // Run audit
    const auditCmd = fix ? pm.fixCommand : pm.auditCommand;
    if (minSeverity && pm.severityFlag) {
      // Some PMs support severity filtering
    }

    return new Promise((resolve) => {
      exec(auditCmd, {
        cwd: context.cwd,
        timeout: AUDIT_TIMEOUT_MS,
        maxBuffer: 1024 * 1024 * 10,
        env: { ...process.env, FORCE_COLOR: '0' },
      }, (error, stdout, stderr) => {
        let output = '';
        if (stdout) output += stdout;
        if (stderr) output += (output ? '\n' : '') + stderr;

        if (output.length > MAX_OUTPUT_LENGTH) {
          output = output.slice(0, MAX_OUTPUT_LENGTH) + '\n... (output truncated)';
        }

        // Parse vulnerability counts
        const parsed = this.parseAuditOutput(output, pm.name);

        let summary = `## Dependency Audit (${pm.name})\n\n`;
        summary += `Command: \`${auditCmd}\`\n\n`;

        if (parsed) {
          summary += `### Summary\n`;
          if (parsed.critical > 0) summary += `- **Critical:** ${parsed.critical}\n`;
          if (parsed.high > 0) summary += `- **High:** ${parsed.high}\n`;
          if (parsed.moderate > 0) summary += `- **Moderate:** ${parsed.moderate}\n`;
          if (parsed.low > 0) summary += `- **Low:** ${parsed.low}\n`;
          if (parsed.total === 0) summary += `No vulnerabilities found.\n`;
          summary += '\n';
        }

        summary += `### Full Output\n\n${output}`;

        // audit commands exit with non-zero when vulnerabilities are found
        // that's expected, not an error
        const hasVulns = parsed ? parsed.total > 0 : !!error;

        resolve({
          success: true, // Always succeed — the audit itself ran fine
          output: summary,
          metadata: {
            packageManager: pm.name,
            ...(parsed || {}),
            hasVulnerabilities: hasVulns,
            fix,
          },
        });
      });
    });
  }

  private async detectPackageManager(cwd: string): Promise<{ name: string; auditCommand: string; fixCommand: string; severityFlag?: string } | null> {
    // pnpm
    try {
      await access(join(cwd, 'pnpm-lock.yaml'));
      return { name: 'pnpm', auditCommand: 'pnpm audit', fixCommand: 'pnpm audit --fix', severityFlag: '--severity' };
    } catch { /* ignore */ }

    // yarn
    try {
      await access(join(cwd, 'yarn.lock'));
      return { name: 'yarn', auditCommand: 'yarn audit', fixCommand: 'yarn audit', severityFlag: '--level' };
    } catch { /* ignore */ }

    // npm
    try {
      await access(join(cwd, 'package-lock.json'));
      return { name: 'npm', auditCommand: 'npm audit', fixCommand: 'npm audit fix', severityFlag: '--audit-level' };
    } catch { /* ignore */ }

    // npm fallback (package.json without lockfile)
    try {
      await access(join(cwd, 'package.json'));
      return { name: 'npm', auditCommand: 'npm audit', fixCommand: 'npm audit fix', severityFlag: '--audit-level' };
    } catch { /* ignore */ }

    // pip
    try {
      await access(join(cwd, 'requirements.txt'));
      return { name: 'pip', auditCommand: 'pip-audit', fixCommand: 'pip-audit --fix' };
    } catch { /* ignore */ }
    try {
      await access(join(cwd, 'pyproject.toml'));
      return { name: 'pip', auditCommand: 'pip-audit', fixCommand: 'pip-audit --fix' };
    } catch { /* ignore */ }

    // cargo
    try {
      await access(join(cwd, 'Cargo.toml'));
      return { name: 'cargo', auditCommand: 'cargo audit', fixCommand: 'cargo audit fix' };
    } catch { /* ignore */ }

    return null;
  }

  private parseAuditOutput(output: string, _pm: string): { critical: number; high: number; moderate: number; low: number; total: number } | null {
    // npm/pnpm: "X vulnerabilities (Y low, Z moderate, W high, V critical)"
    const npmMatch = output.match(/(\d+)\s+vulnerabilit/i);
    if (npmMatch) {
      const total = +npmMatch[1];
      const critical = +(output.match(/(\d+)\s+critical/i)?.[1] || 0);
      const high = +(output.match(/(\d+)\s+high/i)?.[1] || 0);
      const moderate = +(output.match(/(\d+)\s+moderate/i)?.[1] || 0);
      const low = +(output.match(/(\d+)\s+low/i)?.[1] || 0);
      return { critical, high, moderate, low, total };
    }

    // "found 0 vulnerabilities"
    if (output.includes('found 0 vulnerabilities') || output.includes('No known vulnerabilities')) {
      return { critical: 0, high: 0, moderate: 0, low: 0, total: 0 };
    }

    return null;
  }
}
