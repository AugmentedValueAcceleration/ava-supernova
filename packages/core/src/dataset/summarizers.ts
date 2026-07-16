/**
 * Argument and result summarisers for dataset capture.
 *
 * The `_summary` fields in event payloads must NEVER contain raw user
 * data. These helpers produce shape-only descriptions: argument names
 * with character counts, result outcome with output length. A reader
 * can tell what kind of call happened without ever seeing what was
 * passed or returned.
 *
 * The redactor in `redactor.ts` is a second line of defence; these
 * summarisers are the first — they don't even produce the raw
 * fragments that the redactor would need to scrub.
 */

/**
 * Summarise tool arguments as `tool(arg1=Nch, arg2=Nch)`. Captures the
 * call shape without any of the values that were passed in.
 *
 * Examples:
 *   summarizeToolArgs('grep', { pattern: 'auth', path: '.' })
 *     → 'grep(pattern=4ch, path=1ch)'
 *   summarizeToolArgs('bash', { cmd: 'rm -rf /important/path' })
 *     → 'bash(cmd=22ch)'
 */
export function summarizeToolArgs(
  toolName: string,
  args: Record<string, unknown>,
): string {
  const keys = Object.keys(args ?? {});
  if (keys.length === 0) return `${toolName}()`;

  const parts = keys.map((k) => {
    const v = (args as Record<string, unknown>)[k];
    let len: number;
    if (typeof v === 'string') {
      len = v.length;
    } else if (v == null) {
      len = 0;
    } else {
      try {
        len = JSON.stringify(v).length;
      } catch {
        len = 0;
      }
    }
    return `${k}=${len}ch`;
  });
  return `${toolName}(${parts.join(', ')})`;
}

/**
 * Summarise a tool result as `<outcome>, Nch`. The actual output is
 * never included.
 */
export function summarizeToolResult(output: string, success: boolean): string {
  const len = typeof output === 'string' ? output.length : 0;
  return `${success ? 'ok' : 'error'}, ${len}ch`;
}

/**
 * Summarise the final assistant response that closed a tool chain.
 * Captures word count and a high-level outcome category — no content.
 */
export function summarizeChainOutcome(finalContent: string | null): string {
  if (!finalContent) return 'no-content';
  const words = finalContent.trim().split(/\s+/).filter(Boolean).length;
  return `closed-with-text, ${words}w`;
}

import { VERIFICATION_TOOLS } from './verification.js';

const EDIT_TOOLS = new Set(['file_write', 'file_edit']);
const COMMIT_TOOLS = new Set(['git_commit', 'git_create_pr', 'rollback']);
const EXEC_TOOLS = new Set(['bash', 'test_run', 'test_generate', 'benchmark']);
const GENERATION_TOOLS = new Set([
  'generate_image', 'generate_video', 'generate_voice', 'remove_background',
]);

/**
 * Derive the *purpose* of a tool call as a stable category — never the
 * model's chain-of-thought. This fills `tool_choice.reasoning_summary`
 * with a process label ('verification', 'targeted-edit', 'recovery'…)
 * computed deterministically from the tool and the trajectory state, so
 * the dataset records WHY a tool was reached for without ever capturing
 * raw reasoning text. `recovering` is set when the prior tool failed and
 * this call is the recovery move.
 */
export function categorizeToolPurpose(
  toolName: string,
  opts?: { recovering?: boolean },
): string {
  if (opts?.recovering) return 'recovery';
  if (VERIFICATION_TOOLS.has(toolName)) return 'verification';
  if (EDIT_TOOLS.has(toolName)) return 'targeted-edit';
  if (COMMIT_TOOLS.has(toolName)) return 'commit-op';
  if (EXEC_TOOLS.has(toolName)) return 'execution';
  if (GENERATION_TOOLS.has(toolName)) return 'generation';
  return 'action';
}
