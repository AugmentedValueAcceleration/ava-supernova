/**
 * Fresh-eyes review — when the agent is stuck in an error loop, run a
 * one-shot independent pass against the same provider+model with a
 * cold conversation context and a critic-shaped system prompt. The
 * model gets the file content + failure history with no chat baggage,
 * gives a structured second opinion, and the main agent receives that
 * opinion as user-role context on its next turn.
 *
 * Architectural note: we don't spawn a sub-Agent.run() with tools and
 * the persona machinery — that's overkill for a "diagnose this stuck
 * fix" handoff and adds latency. A direct provider.createCompletion
 * call gives us the second opinion in one round-trip with no tool
 * orchestration. The fresh-eyes effect comes from the cold context,
 * not from running on different model weights.
 *
 * Works for every routing mode: orchestrated (Maestro/Supernova/Aurora)
 * and direct BYOK alike — the helper just takes a Provider + modelId
 * pair, which any caller can supply.
 */

import type { Provider, ChatCompletionRequest } from '../providers/types.js';
import type { Message } from '../core/types.js';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface FreshEyesInput {
  /** Provider to call. Typically the same one the main agent is using —
   *  the "fresh eyes" come from the clean context, not different weights. */
  provider: Provider;
  /** Model id within that provider. */
  modelId: string;
  /** The user's original task (first user message of the trajectory). */
  originalTask: string;
  /** Files that keep failing verification. The helper reads each one. */
  files: string[];
  /** Working directory for resolving relative paths. */
  cwd: string;
  /** Failure-loop summary from describeFailureLoop(). */
  failureSummary: string;
  /** Most recent verify_change report the main agent saw. */
  lastFailureReport: string;
  /** Optional cancellation hook — propagated to the provider call. */
  signal?: AbortSignal;
}

const FRESH_EYES_SYSTEM_PROMPT = `You are a senior engineer brought in to give a SECOND OPINION on a stuck change. Another agent has been trying to fix the same verification failure for several iterations and isn't making progress — fresh eyes time.

Your job:
1. Read the file content + the verify failure carefully.
2. Diagnose the ACTUAL root cause — don't trust the previous fix attempts.
3. State whether the previous approach is salvageable or whether it needs to be scrapped.
4. Recommend ONE concrete next step in 2–4 sentences. Be specific about what code to change and why.

Be direct. Don't hedge. The other agent will receive your opinion as advice and decide whether to apply it. They can't see your reasoning if it's buried in qualifiers.

If you genuinely don't know, say "I can't see the issue from this output — the agent should ask the user for more context" rather than fabricating a fix.`;

/** Per-file content cap so a giant file doesn't blow the prompt budget. */
const FILE_CHARS_BUDGET = 6_000;
/** Max files to inline. Beyond this, the rest are listed by name only. */
const MAX_FILES_INLINED = 6;
/** Truncation cap on the failure report — verify_change output can be large. */
const REPORT_CHARS_BUDGET = 4_000;
/** Truncation cap on the original task — long PR descriptions don't need to be inline. */
const TASK_CHARS_BUDGET = 800;

/**
 * Runs the fresh-eyes review and returns the model's text response.
 * On any provider error, returns a placeholder string that the caller
 * can still surface — better than throwing into the main agent loop
 * and aborting the recovery flow.
 */
export async function runFreshEyesReview(input: FreshEyesInput): Promise<string> {
  const fileBlocks: string[] = [];
  const inlineFiles = input.files.slice(0, MAX_FILES_INLINED);
  const overflowFiles = input.files.slice(MAX_FILES_INLINED);

  for (const file of inlineFiles) {
    try {
      const path = resolve(input.cwd, file);
      const content = await readFile(path, 'utf8');
      const trimmed =
        content.length > FILE_CHARS_BUDGET
          ? content.slice(0, FILE_CHARS_BUDGET / 2) +
            '\n\n... [truncated for review] ...\n\n' +
            content.slice(-FILE_CHARS_BUDGET / 2)
          : content;
      fileBlocks.push('### ' + file + '\n\n```\n' + trimmed + '\n```');
    } catch {
      fileBlocks.push('### ' + file + '\n\n[file could not be read]');
    }
  }
  if (overflowFiles.length > 0) {
    fileBlocks.push(
      '### Additional files (not inlined):\n\n' + overflowFiles.map((f) => '- ' + f).join('\n'),
    );
  }

  const userPrompt = [
    'Original task from the user:',
    '> ' + input.originalTask.slice(0, TASK_CHARS_BUDGET),
    '',
    'Failure history:',
    input.failureSummary,
    '',
    'Most recent verification report:',
    '```',
    input.lastFailureReport.slice(0, REPORT_CHARS_BUDGET),
    '```',
    '',
    'Files involved:',
    ...fileBlocks,
    '',
    'Give your second opinion now.',
  ].join('\n');

  const messages: Message[] = [
    { role: 'system', content: FRESH_EYES_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];

  const request: ChatCompletionRequest = {
    model: input.modelId,
    messages,
    temperature: 0.2,
    max_tokens: 800,
  };

  try {
    const response = await input.provider.createCompletion(request, input.signal);
    const choice = response.choices[0];
    const text =
      typeof choice?.message?.content === 'string' ? choice.message.content : null;
    return text?.trim() || '[fresh-eyes review produced no output]';
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return `[fresh-eyes review failed to run: ${reason}]`;
  }
}

/**
 * Format the fresh-eyes review output into a user-role context message
 * that the main agent sees on its next turn.
 */
export function buildFreshEyesContext(reviewOutput: string): string {
  return (
    '[fresh-eyes review — independent second opinion]\n\n' +
    'Another agent reviewed your stuck attempts cold and gave the following diagnosis:\n\n' +
    reviewOutput.trim() +
    '\n\n' +
    "Read this carefully. Decide whether to apply their suggested approach or explain why your existing one is correct. Don't ignore — if you disagree, say why explicitly. The user is watching the loop and the only acceptable next moves are: a different fix, or a clear \"I need help\" message."
  );
}
