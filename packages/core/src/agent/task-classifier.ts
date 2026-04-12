/**
 * Task complexity classifier — a lightweight keyword + heuristic scorer that
 * labels each incoming task as `focused`, `moderate`, or `architectural`.
 *
 * The label is injected into the agent's system prompt as a directness hint:
 * focused tasks get a "be direct, minimum exploration" framing that stops the
 * agent from running the full Scout → Architect → Verifier → Sequencer →
 * Challenger → Builder chain for what should have been a one-file edit.
 *
 * Intentionally simple — no ML, no embedding lookup, no LLM round-trip. The
 * scorer runs in microseconds on the user's message, defaults to `moderate`
 * when unsure (safest middle ground), and can be overridden mid-run if the
 * agent detects that the work is actually bigger than the classification
 * suggested (graceful re-classification escalation).
 *
 * The whole point: 3M tokens for a sidebar redesign was the observed
 * pathology. Most of those tokens were the conductor pipeline treating a
 * focused visual change as if it were an architectural task. This classifier
 * is the fix for that specific pattern: it tells the agent "this is small,
 * stay small."
 */

export type TaskComplexity = 'focused' | 'moderate' | 'architectural';

/**
 * Budget hints per complexity class. These are soft targets used by the
 * exploration budget tracker to decide when to nudge the agent. They're not
 * hard limits — hard limits would cut tasks off mid-work, which is worse
 * than the original problem. See exploration budget hook in agent.ts.
 */
export const COMPLEXITY_BUDGETS: Record<TaskComplexity, {
  readCapBeforeFirstWrite: number;
  tokenSoftTarget: number;
}> = {
  focused:      { readCapBeforeFirstWrite:  5, tokenSoftTarget:   200_000 },
  moderate:     { readCapBeforeFirstWrite: 12, tokenSoftTarget:   600_000 },
  architectural:{ readCapBeforeFirstWrite: 30, tokenSoftTarget: 2_000_000 },
};

// ─── Keyword dictionaries ───────────────────────────────────────────────────

const FOCUSED_PHRASES: string[] = [
  // Direct edit verbs
  'tweak', 'adjust', 'rename', 'move', 'remove', 'delete',
  'swap', 'replace', 'change the', 'edit', 'modify',
  // Visual/taste tweaks
  'redesign this', 'redesign the', 'restyle',
  'polish', 'make this', 'make it',
  // Minimising framing
  'quick', 'small', 'simple', 'just ', 'minor',
  'little ', 'trivial', 'one-liner', 'typo',
  // Targeted scope
  'this component', 'this file', 'this function',
  'the sidebar', 'the header', 'the footer', 'the button',
  'the modal', 'the card', 'the nav',
  // Rename refactors
  'rename', 'extract', 'inline',
];

const ARCHITECTURAL_PHRASES: string[] = [
  // Build-from-scratch
  'build a new', 'build the', 'create a new', 'set up',
  'scaffold', 'bootstrap', 'from scratch', 'ground up',
  // Migration / overhaul
  'migrate', 'refactor the whole', 'refactor everything',
  'rewrite', 'overhaul', 'redo the', 'redo all',
  // System-level
  'add support for', 'integrate with', 'connect to',
  'new subsystem', 'new module', 'new service',
  'architect', 'design the system', 'design the architecture',
  // Broad scope
  'across the', 'throughout', 'every', 'all of',
  // Schema / data model
  'schema', 'data model', 'database migration',
];

const MODERATE_PHRASES: string[] = [
  // Medium-scope features
  'add a', 'create a component', 'new page',
  'new feature', 'implement', 'build out',
  // Wiring work
  'connect', 'wire up', 'hook up',
  // Fix that might be deeper
  'fix the bug', 'debug', 'investigate',
];

// File-extension references — rough proxy for scope
const FILE_EXT_PATTERN = /\.(?:tsx?|jsx?|vue|svelte|astro|css|scss|sass|less|py|go|rs|java|rb|php|swift|kt|md|json|yaml|yml|toml|html|svg)\b/g;

// Plural / "every file" signals → architectural
const PLURAL_PHRASES = ['all ', 'every ', 'many ', 'multiple ', 'several ', 'throughout', 'across '];

// ─── Classifier ─────────────────────────────────────────────────────────────

export interface ClassificationResult {
  complexity: TaskComplexity;
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;
}

/**
 * Classify a user message's task complexity. Returns the label plus a short
 * reasoning string used for logs and for injecting into the agent's directness
 * hint (so Ava can see WHY her task was classified the way it was).
 */
export function classifyTaskComplexity(userMessage: string): ClassificationResult {
  const lower = userMessage.toLowerCase().trim();

  // Empty or trivially short messages → moderate default
  if (lower.length < 4) {
    return {
      complexity: 'moderate',
      confidence: 'low',
      reasoning: 'empty or trivial message — defaulting to moderate',
    };
  }

  // Count hits per category
  const focusedHits = FOCUSED_PHRASES.filter(p => lower.includes(p));
  const architecturalHits = ARCHITECTURAL_PHRASES.filter(p => lower.includes(p));
  const moderateHits = MODERATE_PHRASES.filter(p => lower.includes(p));

  // File references and plural signals
  const fileMatches = userMessage.match(FILE_EXT_PATTERN) || [];
  const fileCount = fileMatches.length;
  const hasPluralSignal = PLURAL_PHRASES.some(p => lower.includes(p));

  // ─── Architectural override conditions ─────────────────────────────────
  // Any of these, regardless of other signals, force architectural:
  //   - explicit architectural keyword
  //   - mention of 4+ distinct files
  //   - plural signals + medium-scope keywords
  if (architecturalHits.length > 0) {
    return {
      complexity: 'architectural',
      confidence: 'high',
      reasoning: `architectural keyword${architecturalHits.length > 1 ? 's' : ''}: ${architecturalHits.slice(0, 3).join(', ')}`,
    };
  }
  if (fileCount >= 4) {
    return {
      complexity: 'architectural',
      confidence: 'medium',
      reasoning: `${fileCount} file references → broad-scope work`,
    };
  }
  if (hasPluralSignal && moderateHits.length > 0) {
    return {
      complexity: 'architectural',
      confidence: 'medium',
      reasoning: 'plural scope signal with medium-scope verb',
    };
  }

  // ─── Focused override conditions ──────────────────────────────────────
  // Two or more focused keywords → confident focused
  // One focused keyword + no moderate/architectural signals → confident focused
  // One focused keyword + moderate keyword → moderate
  if (focusedHits.length >= 2 && moderateHits.length === 0) {
    return {
      complexity: 'focused',
      confidence: 'high',
      reasoning: `focused keywords: ${focusedHits.slice(0, 3).join(', ')}`,
    };
  }
  if (focusedHits.length === 1 && moderateHits.length === 0 && fileCount <= 1) {
    return {
      complexity: 'focused',
      confidence: 'medium',
      reasoning: `focused keyword: "${focusedHits[0]}"`,
    };
  }

  // ─── Moderate default ───────────────────────────────────────────────────
  if (moderateHits.length > 0) {
    return {
      complexity: 'moderate',
      confidence: 'medium',
      reasoning: `moderate keyword${moderateHits.length > 1 ? 's' : ''}: ${moderateHits.slice(0, 2).join(', ')}`,
    };
  }

  // Unclear → moderate (safe middle ground)
  return {
    complexity: 'moderate',
    confidence: 'low',
    reasoning: 'no strong signals — defaulting to moderate',
  };
}

/**
 * Format the classification as a directness hint for injection into the
 * system prompt. The hint is short, pointed, and tells the agent exactly
 * how aggressively to scope its work.
 */
export function formatDirectnessHint(result: ClassificationResult): string {
  const budget = COMPLEXITY_BUDGETS[result.complexity];

  if (result.complexity === 'focused') {
    return [
      `**Task classification: FOCUSED** (${result.reasoning}).`,
      `This is a small, targeted task. Be direct. Read at most ${budget.readCapBeforeFirstWrite} files before your first write. No elaborate planning. No "let me also check X" — if the task says "redesign the sidebar", find the sidebar file, redesign it, verify it compiles, stop. One read-then-write beats three reads followed by a write. Target effort: ~${Math.round(budget.tokenSoftTarget / 1000)}k tokens of total work.`,
    ].join(' ');
  }

  if (result.complexity === 'architectural') {
    return [
      `**Task classification: ARCHITECTURAL** (${result.reasoning}).`,
      `This is a system-level task. Take the time to plan carefully, understand the surface area, and verify your approach. The full Scout → Architect → Verifier → Sequencer → Challenger → Builder chain is justified here. Target effort: ~${Math.round(budget.tokenSoftTarget / 1_000_000)}M tokens of total work is reasonable for architectural scope.`,
    ].join(' ');
  }

  // moderate
  return [
    `**Task classification: MODERATE** (${result.reasoning}).`,
    `This is a mid-sized task. Scout the relevant files, plan your approach, execute directly. Don't over-verify small decisions but do verify structural ones. Target effort: ~${Math.round(budget.tokenSoftTarget / 1000)}k tokens of total work.`,
  ].join(' ');
}
