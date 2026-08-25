/**
 * The mode tags, in one place.
 *
 * A mode announces itself by a literal bracket tag at the head of the USER's
 * message — `[Plan Mode]`, `[Write Mode]`. Everything downstream reads that
 * tag: which tools the turn may use, which personas run, what the saved
 * conversation is called, which mode the captured dataset row is labelled.
 *
 * Until this file existed, nine hand-written copies of that list disagreed
 * with each other, and the disagreements were invisible because nothing
 * fails when a list is short — it just quietly does less:
 *
 * - `dataset/capture.ts` knew 5 tags where the agent knew 11, so Write,
 *   Desktop, Health, Design, Social and Newsroom turns were all captured
 *   with `mode: 'work'`. Six modes of training data labelled as code.
 * - The extension sidebar's strip list carried the LEGACY `[Security Mode]`
 *   spelling and not the live `[Security Audit Mode]`, so a restored
 *   security conversation showed the user the whole internal briefing where
 *   their own message should have been. Same for Write, Health and Design.
 *
 * So this is a leaf: it imports nothing, which is what lets the Node hosts,
 * the browser bundles and the IDE's sidecar all read the same list instead
 * of each keeping a copy. Same pattern as `auto/routing-modes.ts`.
 *
 * Adding a mode means adding one entry here. If you find yourself typing a
 * bracket tag anywhere else in the codebase, that is the bug.
 */

/**
 * Every mode that answers to a tag.
 *
 * Core carried three different `AvaMode` unions before this — 6 modes in
 * dataset/capture.ts, 10 in dataset/events.ts, 7 in memory/types.ts — none
 * of them agreeing and none of them complete. This is the one that matches
 * what the agent actually detects.
 */
export type AvaModeId =
  | 'work' | 'plan' | 'chat' | 'brainstorm' | 'write' | 'teach'
  | 'security' | 'desktop' | 'health' | 'design' | 'social' | 'news';

export interface ModeTag {
  /** Canonical mode id — the key used by MODE_ALLOWED_TOOLS, personas and the dataset. */
  readonly mode: AvaModeId;
  /** The spelling written into new messages. Exactly one per mode. */
  readonly tag: string;
  /**
   * Historical spellings. Still detected and stripped so old transcripts
   * read correctly, but never emitted.
   */
  readonly legacyTags?: readonly string[];
}

export const MODE_TAGS: readonly ModeTag[] = [
  // Code mode. It carried a tag once, lost it, and spent the intervening
  // months as the untagged default — which is why its tool allowlist never
  // ran. `[Work Mode]` was still sitting in the sidebar's strip list and in
  // SCAFFOLD_TAGS under "legacy" the whole time.
  { mode: 'work', tag: '[Work Mode]' },
  { mode: 'plan', tag: '[Plan Mode]' },
  { mode: 'chat', tag: '[Chat Mode]' },
  { mode: 'brainstorm', tag: '[Brainstorm Mode]' },
  { mode: 'write', tag: '[Write Mode]' },
  { mode: 'teach', tag: '[Teach Mode]' },
  { mode: 'security', tag: '[Security Audit Mode]', legacyTags: ['[Security Mode]'] },
  { mode: 'desktop', tag: '[Desktop Automation Mode]' },
  { mode: 'health', tag: '[Health Room]' },
  { mode: 'design', tag: '[Design Studio]' },
  { mode: 'social', tag: '[Social Studio]' },
  { mode: 'news', tag: '[Newsroom]' },
];

/**
 * Scaffolding that must be peeled off a stored message but that never meant
 * a mode.
 *
 * `[Learning Room]` is the only one: it survives in saved transcripts and in
 * the conversation-surface mapping, but no prefix function emits it and no
 * mode answers to it. Detecting it would silently change which tools an old
 * conversation replays with, so it strips and nothing more.
 */
export const SCAFFOLD_ONLY_TAGS: readonly string[] = ['[Learning Room]'];

/** Every spelling that can appear at the head of a stored user message. */
export const ALL_SCAFFOLD_TAGS: readonly string[] = [
  ...MODE_TAGS.flatMap((m) => [m.tag, ...(m.legacyTags ?? [])]),
  ...SCAFFOLD_ONLY_TAGS,
];

/** The tag a surface should write for this mode, or null if the mode has none. */
export function tagForMode(mode: string): string | null {
  return MODE_TAGS.find((m) => m.mode === mode)?.tag ?? null;
}

/**
 * The mode a message announces, or null if it carries no tag.
 *
 * Null is not "unknown" — every mode including code now tags itself, so an
 * untagged message is one that predates tagging or came from a surface that
 * doesn't set modes (the CLI). Callers that need a mode regardless should
 * read null as 'work', which is what the agent and the coordinator both do.
 */
export function modeForTaggedText(text: string): AvaModeId | null {
  for (const m of MODE_TAGS) {
    if (text.startsWith(m.tag)) return m.mode;
    for (const legacy of m.legacyTags ?? []) {
      if (text.startsWith(legacy)) return m.mode;
    }
  }
  return null;
}
