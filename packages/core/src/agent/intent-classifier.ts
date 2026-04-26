/**
 * Intent Classifier — heuristic gate between user input and tool use.
 *
 * Runs once per user message (at the top of agent.run) and returns one
 * of three labels. The result drives a "Style note" injected into the
 * system prompt for that turn — conversational/ambiguous classifications
 * nudge the model toward worded replies; task classifications leave
 * tool-use posture unchanged.
 *
 * Why heuristic rather than LLM:
 *   The previous implementation called Qwen Flash on every turn — ~50
 *   tokens in, 1 token out, with a 2-second timeout. On the extension
 *   surface that round-trip ran *before* stream_start fired, so users saw
 *   a 0.5–2 second pause before Ava began thinking. The IDE sidecar
 *   never wired the classifier and felt instant by comparison.
 *
 *   The classification task is binary-ish — most messages fall cleanly
 *   into "verb-led imperative" or "short reaction / meta-question" with
 *   no genuine ambiguity. A regex set captures the same signal at sub-
 *   millisecond cost, runs identically on both surfaces, and removes the
 *   only synchronous LLM hop on the per-turn hot path.
 *
 * Labels:
 *   task          — user wants concrete action (code, commands, build)
 *   conversational — user is talking, asking, reacting, giving feedback
 *   ambiguous     — empty input only; everything else defaults to task
 *                   (the LLM prompt's own rule: "When in doubt, classify
 *                   task. A false 'task' on a chatty message wastes one
 *                   turn; a false 'conversational' on a real task blocks
 *                   tools and produces broken output.")
 *
 * Cost: 0 tokens, 0 RPCs. Same shape as the previous classifier — same
 * call site, same async return type, same UserIntent labels — so the
 * agent's intent-gate code at agent.ts is unchanged.
 */

import type { Provider } from '../providers/types.js';
import type { ModelDefinition } from '../core/types.js';

export type UserIntent = 'task' | 'conversational' | 'ambiguous';

export interface IntentClassifierOptions {
  /** Retained for API compatibility — the heuristic classifier ignores it. */
  provider?: Provider;
  /** Retained for API compatibility — the heuristic classifier ignores it. */
  model?: ModelDefinition;
  /** Retained for API compatibility — no network call to time out. */
  timeoutMs?: number;
}

// Pure reactions, fillers, meta-questions, continuation prompts, and
// feedback on prior work. Each pattern is anchored or scoped tightly so
// it doesn't catch verb-led imperatives that happen to start with the
// same word ("ok fix this" → not conversational; "ok" alone → is).
const CONVERSATIONAL_PATTERNS: readonly RegExp[] = [
  // Standalone reactions / fillers
  /^(really\??|wow|ok|okay|alright|cool|nice|sure|fine|got it)\W*$/i,
  /^(hi|hello|hey|yo|sup|howdy)\b\W*$/i,
  /^(thanks?|thank you|thx|ty|cheers|appreciated)\W*$/i,
  /^(no thanks?|nah|yeah|yep|yes|nope|nvm|never ?mind)\W*$/i,
  /^(hmm+|huh\??|oh\W?|ah+|aha|haha+|lol)\W*$/i,
  // Meta-questions about the agent itself
  /\bwhat (do|are|did) you think\b/i,
  /\bwhat'?s your (take|opinion|view|sense)\b/i,
  /\bwho are you\b/i,
  /\bare you (sure|ok|okay|alright|there)\b/i,
  // Continuation prompts
  /^(go on|go ahead|continue|carry on|keep going|tell me more)\W*$/i,
  // Reactions to prior work
  /^(you('?re| are)\s+(right|wrong|correct))\b/i,
  /^(that('?s| is)\s+(right|wrong|good|bad|cool|nice|fine|ok|okay|perfect|great))\b/i,
];

// Imperative verbs that strongly imply concrete action on files / commands /
// the project. The set mirrors the examples block of the prior LLM prompt.
const TASK_VERBS =
  '(fix|build|run|test|deploy|ship|create|add|remove|delete|edit|update|modify|refactor|investigate|audit|review|analy[sz]e|check|scan|find|debug|implement|write|make|install|rename|move|generate|search|inspect|explore|assess|spot|lint|format|migrate|patch|fork|clone|init|setup|configure|wire|hook|expose|merge|rebase|commit|push|pull|stash|revert|bump|publish|release)';

// Common preambles users put in front of a task verb. Matching against
// this set lets "can you fix the bug" classify as task while keeping
// short polite responses ("could you?", "please") from doing so.
const TASK_VERB_AT_START = new RegExp(
  `^(can you |could you |would you |please |let'?s |let us |i (need|want) you to |i'?d like you to )?${TASK_VERBS}\\b`,
  'i',
);

const TASK_AS_INFINITIVE = new RegExp(
  `\\b(want to|need to|trying to|going to|gonna|let'?s|help me|gotta) ${TASK_VERBS}\\b`,
  'i',
);

// "Look at" / "take a look" / "peek at" — investigative task verbs not
// covered by the simple verb list above because they're phrasal.
const LOOK_AT_PATTERN = /\b(look (at|into)|take a (look|peek)|have a look|peek at|dig into)\b/i;

// Code-context phrases that disambiguate borderline cases toward task.
const CODE_CONTEXT_PATTERNS: readonly RegExp[] = [
  /\b\w+\.(ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|kt|swift|cpp|cc|c|h|hpp|md|json|yaml|yml|toml|css|scss|sass|html|xml|sh|bash|sql|prisma|graphql)\b/i,
  /\b(package\.json|package-lock|pnpm-lock|yarn\.lock|node_modules|tsconfig|webpack|vite\.config|next\.config|tailwind\.config|README|Dockerfile|Makefile)\b/i,
  /\b(the bug|this error|the issue|this code|the function|the class|the method|the file|the test|the build|the migration)\b/i,
];

export class IntentClassifier {
  // Constructor accepts options purely for backwards compatibility with
  // call sites that still pass provider/model/timeoutMs. None are read.
  constructor(_opts: IntentClassifierOptions = {}) {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    void _opts;
  }

  // Async signature retained so the call site can still `await` it. The
  // body is synchronous — there's no network hop, no timeout, no retry.
  async classify(userMessage: string): Promise<UserIntent> {
    return classifyHeuristic(userMessage);
  }
}

function classifyHeuristic(userMessage: string): UserIntent {
  const trimmed = userMessage.trim();

  // Empty input — only true ambiguous case. Everything else defaults to
  // task per the original prompt's "when in doubt" rule.
  if (!trimmed) return 'ambiguous';

  // Very short messages are almost always conversational. Length 6
  // covers "ok", "yes", "no", "wait", "stop" etc. without catching
  // one-word task requests like "test" or "build".
  if (
    trimmed.length <= 6 &&
    !/^(test|build|run|fix|ship|start|launch|lint)$/i.test(trimmed)
  ) {
    return 'conversational';
  }

  // Pure conversational signals first — these are tight enough that
  // false positives on real tasks are rare. Order matters: check
  // conversational before task-verb so "thanks" (anchored ^thanks$)
  // wins over "thank" being matched as part of a longer string.
  for (const pattern of CONVERSATIONAL_PATTERNS) {
    if (pattern.test(trimmed)) return 'conversational';
  }

  // Task signals — verb-led imperatives, infinitive phrases, "look at",
  // and code-context disambiguators.
  if (TASK_VERB_AT_START.test(trimmed)) return 'task';
  if (TASK_AS_INFINITIVE.test(trimmed)) return 'task';
  if (LOOK_AT_PATTERN.test(trimmed)) return 'task';
  for (const pattern of CODE_CONTEXT_PATTERNS) {
    if (pattern.test(trimmed)) return 'task';
  }

  // Default per the original LLM rule. Blocking tools on a real task
  // produces broken output (model emits text-format tool calls);
  // running tools on a chatty message just wastes one turn.
  return 'task';
}
