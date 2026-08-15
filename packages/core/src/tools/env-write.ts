import { promises as fs } from 'node:fs';
import { join, basename } from 'node:path';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

/**
 * Project-aware env-file writer for granted secrets.
 *
 * Refuses to run unless the target file is covered by `.gitignore`. Picks the
 * env file based on framework conventions when not explicitly specified:
 *
 *   Next.js     → .env.local
 *   Anything else → .env  (Vite, SvelteKit, Remix, Nuxt, Python, Rails, etc.)
 *
 * The `secretHandle` arg is rewritten by the host's tool-arg preprocessor
 * before this tool runs — by the time execute() sees it, it contains the
 * actual secret value resolved from Ava's working set. We still defensively
 * reject any value that still looks like an unsubstituted handle so we
 * never persist the placeholder.
 */
export class EnvWriteTool implements Tool {
  readonly name = 'env_write';
  readonly description = 'Write a granted secret to the project\'s env file (Next.js→.env.local, others→.env). Hard-fails if the env file is not in .gitignore.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'env_write',
    description:
      'Write a secret to the project\'s env file. The framework is auto-detected — Next.js writes to .env.local, everything else writes to .env. ' +
      'You MUST pass `secretHandle` as a {{secret:<id>}} reference returned by secret_request. ' +
      'Raw values are rejected. The tool refuses if the target file is not in .gitignore.',
    parameters: {
      type: 'object',
      properties: {
        envVarName: {
          type: 'string',
          description: 'The env var name to set, e.g. STRIPE_SECRET_KEY. UPPER_SNAKE_CASE.',
        },
        secretHandle: {
          type: 'string',
          description: 'Handle from secret_request, e.g. {{secret:abc123}}. Raw values are rejected.',
        },
        targetFile: {
          type: 'string',
          description: 'Optional override (e.g. ".env.production"). Defaults to framework-appropriate.',
        },
        framework: {
          type: 'string',
          description: 'Optional framework hint ("next", "vite", "remix", etc.) when auto-detection should be skipped.',
        },
      },
      required: ['envVarName', 'secretHandle'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const envVarName = typeof args.envVarName === 'string' ? args.envVarName.trim() : '';
    const resolvedValue = typeof args.secretHandle === 'string' ? args.secretHandle : '';
    const explicitFile = typeof args.targetFile === 'string' ? args.targetFile.trim() : '';
    const frameworkHint = typeof args.framework === 'string' ? args.framework.trim().toLowerCase() : '';

    if (!envVarName) return { success: false, output: 'env_write requires `envVarName`.' };
    if (!/^[A-Z_][A-Z0-9_]*$/.test(envVarName)) {
      return { success: false, output: `envVarName "${envVarName}" must be UPPER_SNAKE_CASE.` };
    }
    if (envVarName.startsWith('NEXT_PUBLIC_') || envVarName.startsWith('VITE_') || envVarName.startsWith('PUBLIC_')) {
      return {
        success: false,
        output: `Refusing to write secret to "${envVarName}" — that prefix exposes the value to the client bundle. Pick a server-only name (no NEXT_PUBLIC_/VITE_/PUBLIC_ prefix).`,
      };
    }

    if (!resolvedValue) return { success: false, output: 'env_write requires `secretHandle`.' };
    // Defensive: if the placeholder survived substitution the host wiring is
    // broken — refuse so we never write `{{secret:abc}}` into a real .env.
    if (/^\{\{secret:[A-Za-z0-9_-]+\}\}$/.test(resolvedValue)) {
      return {
        success: false,
        output:
          'Secret handle was not substituted by the host. This is a wiring bug — secret_request must succeed and the host must rewrite {{secret:…}} in tool args. Refusing to persist the placeholder.',
      };
    }

    const projectRoot = context.cwd;
    const fileName = explicitFile || pickEnvFile([frameworkHint]);
    const fullPath = join(projectRoot, fileName);

    if (!(await isGitignored(projectRoot, fileName))) {
      return {
        success: false,
        output:
          `Refusing to write to ${fileName} — not in .gitignore. ` +
          `Add an entry like \`${fileName}\` (or \`.env*\`) to .gitignore first, then re-run. ` +
          `If .gitignore does not exist yet, create it. This guard prevents the secret from being committed.`,
      };
    }

    await upsertEnvLine(fullPath, envVarName, resolvedValue);
    return {
      success: true,
      output: `Wrote ${envVarName} to ${basename(fullPath)} (gitignore-verified).`,
    };
  }
}

// ─── Helpers (exported so the host can reuse the same conventions) ──────────

/** Pick the canonical env file given a list of detected/hinted frameworks. */
export function pickEnvFile(frameworks: string[]): string {
  const has = (name: string) => frameworks.some((f) => f && f.toLowerCase().includes(name));
  if (has('next')) return '.env.local';
  return '.env';
}

/** Read .gitignore and return whether `relativePath` is covered. */
export async function isGitignored(projectRoot: string, relativePath: string): Promise<boolean> {
  try {
    const raw = await fs.readFile(join(projectRoot, '.gitignore'), 'utf-8');
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean).filter((l) => !l.startsWith('#'));
    // Crude but covers common cases: exact match, glob `.env*`, prefix glob.
    // Doesn't honour negation rules — fail safe by requiring an explicit entry.
    return lines.some((p) =>
      p === relativePath ||
      p === '.env*' ||
      p === '*.env' ||
      (p.endsWith('*') && relativePath.startsWith(p.slice(0, -1))),
    );
  } catch {
    return false;
  }
}

/** Append `KEY=value` to `filePath`, replacing any existing line for `KEY`. */
export async function upsertEnvLine(filePath: string, key: string, value: string): Promise<void> {
  let body;
  try { body = await fs.readFile(filePath, 'utf-8'); } catch { body = ''; }
  const lines = body.split('\n');
  const re = new RegExp(`^${key}=`);
  const idx = lines.findIndex((l) => re.test(l));
  // Quote if the value contains whitespace or shell-special chars — keeps
  // the .env parseable by every common loader.
  const safeValue = /[\s"'`$\\#]/.test(value) ? `"${value.replace(/(["\\])/g, '\\$1')}"` : value;
  const next = `${key}=${safeValue}`;
  if (idx >= 0) {
    lines[idx] = next;
  } else {
    if (body && !body.endsWith('\n')) lines.push('');
    lines.push(next);
  }
  await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
}
