/**
 * The Review — what a course is wrong ABOUT, as against what it is missing.
 *
 * `course-check.ts` is a pure function over the shape of a course: has this
 * lesson steps, is this step checkable, is this module thin. It cannot read.
 * So it passes a course whose answer key is wrong, whose rubric grades a
 * different question from the one it asks, and whose check contradicts the
 * paragraph directly above it.
 *
 * All three of those were found on 25 Sep 2026 in a course that had just
 * passed the gate — found by READING it. This module is the vocabulary for
 * that reading: what the kinds of defect are, which of them have a single
 * right answer and which are a judgement, and how an approved finding becomes
 * the exact revision that fixes it.
 *
 * The review never writes. It works the fix out and stops; the operator
 * presses Apply. So everything here is pure — no store, no I/O — and the
 * function that turns a finding into a revision is the guarantee that what
 * gets applied is what was shown on the card.
 */

import type { CourseModuleInput, CourseRevision, CourseStepInput } from './course-store.js';

/* ── The kinds ─────────────────────────────────────────────────────────── */

export const REVIEW_REPAIR_KINDS = [
  'answer_wrong',
  'rubric_mismatch',
  'teach_contradicts_check',
  'step_not_doing',
  'estimate_wrong',
  'no_tags',
] as const;

export const REVIEW_RAISE_KINDS = [
  'goal_not_met',
  'jump',
  'no_progression',
  'unbalanced',
  'prereq_wrong',
  'stale_fact',
  'unsafe_instruction',
] as const;

export type ReviewRepairKind = (typeof REVIEW_REPAIR_KINDS)[number];
export type ReviewRaiseKind = (typeof REVIEW_RAISE_KINDS)[number];
export type ReviewFindingKind = ReviewRepairKind | ReviewRaiseKind;

const REPAIR = new Set<string>(REVIEW_REPAIR_KINDS);
export const isRepairKind = (kind: string): kind is ReviewRepairKind => REPAIR.has(kind);

/**
 * What each kind is, in the words used to teach it.
 *
 * One definition, read by the prompt that asks for a review and by the rail
 * that displays the result — so the operator's card and the reviewer's brief
 * cannot describe the same finding differently.
 */
export const REVIEW_KINDS: Record<ReviewFindingKind, { what: string; example: string }> = {
  /* repair — a single right answer exists, so an exact change can be proposed */
  answer_wrong: {
    what: 'The answer key is wrong — it contradicts the lesson\'s own teach block, or it is simply false.',
    example: 'A step asks what 10 + "5" prints and marks 15 correct. It prints "105", which the teach block above it explains.',
  },
  rubric_mismatch: {
    what: 'The evaluation rubric grades something other than what the prompt asks for.',
    example: 'The prompt asks for a filter with a named predicate; the rubric describes what forEach and map produce.',
  },
  teach_contradicts_check: {
    what: 'The teach block states one thing and the check accepts the opposite.',
    example: 'Teach says Node throws a ReferenceError on `document`; the answer accepts "undefined".',
  },
  step_not_doing: {
    what: 'The prompt asks the learner to read, consider or think about something rather than DO it. A step the learner can satisfy without touching the tool is not a step.',
    example: '"Consider why layers are useful" instead of "Add a layer above the photo and name it".',
  },
  estimate_wrong: {
    what: 'estimated_hours disagrees with the lessons\' own minutes.',
    example: 'The course says 14 hours; the lessons sum to 11.',
  },
  no_tags: {
    what: 'The course has no tags. Learners filter on them, so a course with none is a course most people never see.',
    example: 'A JavaScript course with tags: [].',
  },

  /* raise — no single right answer, so nothing is proposed */
  goal_not_met: {
    what: 'The course never reaches what its own goal promises.',
    example: 'The goal says "build an interactive web page"; the course stops before a single click is handled.',
  },
  jump: {
    what: 'A step assumes something the course has never taught.',
    example: 'A lesson uses an arrow function three modules before functions are introduced.',
  },
  no_progression: {
    what: 'A lesson asks for the same skill the previous one already established, with nothing new.',
    example: 'Two consecutive lessons both asking the learner to log a variable.',
  },
  unbalanced: {
    what: 'One module carries far more than the rest, so the course lands unevenly.',
    example: 'Five modules of two lessons and one of eleven.',
  },
  prereq_wrong: {
    what: 'The stated prerequisites do not match what the first lesson actually assumes.',
    example: 'Prerequisites say "None"; lesson 1 asks the learner to run a command in a terminal they have never opened.',
  },
  stale_fact: {
    what: 'A version, a menu path, a keyboard shortcut or an API detail that has moved since it was written.',
    example: 'A menu path from before the application\'s single-window redesign.',
  },
  unsafe_instruction: {
    what: 'Trades, electrical, health or food guidance given without the caution it needs. Always raised, never quietly patched.',
    example: 'Wiring a socket with no instruction to isolate the circuit first.',
  },
};

/* ── A finding ─────────────────────────────────────────────────────────── */

/**
 * Where a finding is, precisely enough to act on.
 *
 * Indices are 1-BASED, as every other index in this room is and as the check
 * reports them. Prose alone would not do: the Apply button has to turn this
 * into a revision, and "somewhere in module 1" cannot be applied.
 */
export interface ReviewLocation {
  module_index?: number;
  lesson_index?: number;
  step_index?: number;
  /** The field being spoken about: answer, evaluation, teach, prompt, tags, estimated_hours… */
  field: string;
}

export interface ReviewFinding {
  id: string;
  kind: ReviewFindingKind;
  location: ReviewLocation;
  /** What is wrong, in a sentence, for the card. */
  message: string;
  /**
   * The exact change, on a `repair` only. Both sides verbatim — the card shows
   * these, so a description here ("the correct value") makes the finding
   * unapprovable. A `raise` never carries one.
   */
  fix?: { from: string; to: string };
  /** Why this has no Apply button, when a repair could not be made approvable. */
  note?: string;
}

/** Fields a repair is allowed to touch. Anything else is a rewrite, not a repair. */
const STEP_FIELDS = new Set(['answer', 'evaluation', 'teach', 'prompt']);
const COURSE_FIELDS = new Set(['estimated_hours', 'tags']);

/* ── Reading one back ──────────────────────────────────────────────────── */

const s = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const n = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/**
 * Validate a finding as reported, and say what is wrong with it if it is not.
 *
 * A malformed finding is worse than no finding: it reaches the operator as a
 * card they cannot act on, or worse, as an Apply button that does something
 * other than what it says. So a `repair` without both sides of its change is
 * refused here rather than rendered.
 */
export function parseReviewFinding(raw: unknown, index: number): ReviewFinding | string {
  const o = (raw ?? {}) as Record<string, unknown>;
  const kind = s(o.kind) as ReviewFindingKind;
  if (!REVIEW_KINDS[kind]) {
    return `finding ${index + 1}: "${s(o.kind) || '(none)'}" is not a review kind. The kinds are: ${Object.keys(REVIEW_KINDS).join(', ')}.`;
  }
  const message = s(o.message);
  if (!message) return `finding ${index + 1} (${kind}): needs a message saying what is wrong.`;

  const loc = (o.location ?? {}) as Record<string, unknown>;
  const field = s(loc.field);
  if (!field) return `finding ${index + 1} (${kind}): needs location.field — which field is wrong.`;
  const location: ReviewLocation = {
    field,
    ...(n(loc.module_index) !== undefined ? { module_index: n(loc.module_index) } : {}),
    ...(n(loc.lesson_index) !== undefined ? { lesson_index: n(loc.lesson_index) } : {}),
    ...(n(loc.step_index) !== undefined ? { step_index: n(loc.step_index) } : {}),
  };

  const id = s(o.id) || `f${index + 1}`;
  if (!isRepairKind(kind)) {
    // A judgement has nothing to approve. Carrying a fix here would put an
    // Apply button on something that needs a conversation.
    return { id, kind, location, message };
  }

  /*
   * A repair that cannot be turned into a button is DEMOTED, not discarded.
   *
   * This used to be a refusal, and on 25 Sep 2026 one `estimate_wrong` with no
   * replacement value threw away the ten sound findings sent with it. The
   * thing worth guarding against was a review that LOOKED complete while
   * quietly missing things — not a review that is partly approvable. A finding
   * with no exact change is still a true observation about the course; it just
   * cannot be applied in one click, which is precisely what a judgement is.
   *
   * So it keeps its kind and its message, loses its fix, and carries a note
   * saying why there is no button. Nothing is lost and nothing is hidden.
   */
  const demote = (why: string): ReviewFinding => ({ id, kind, location, message, note: `No Apply button: ${why}` });

  const fix = (o.fix ?? {}) as Record<string, unknown>;
  const from = s(fix.from), to = s(fix.to);
  if (!to) return demote('no exact replacement was given, so there is nothing to approve. Give fix.to — the value itself, not a description of it.');
  if (from === to) return demote('the replacement is the same as what is there, so nothing would change.');
  if (STEP_FIELDS.has(field) && (location.module_index === undefined || location.lesson_index === undefined || location.step_index === undefined)) {
    return demote(`a ${field} repair needs module_index, lesson_index and step_index (1-based) to know which step to change.`);
  }
  if (!STEP_FIELDS.has(field) && !COURSE_FIELDS.has(field)) {
    return demote(`"${field}" cannot be changed in place. Repairable fields are ${[...STEP_FIELDS, ...COURSE_FIELDS].join(', ')}; anything else is a rewrite.`);
  }

  return { id, kind, location, message, fix: { from, to } };
}

/* ── Turning an approved finding into the change that applies it ───────── */

/**
 * The revision that performs an approved repair — and nothing else.
 *
 * This is the guarantee behind the Apply button. The card showed `from` → `to`
 * on one field; this builds a revision that changes that one field and carries
 * every other value through untouched. If the hub built the call itself the
 * two could drift, and then Apply would do something other than what it said.
 *
 * Returns a string when the finding cannot be applied to THIS course — an
 * index that is not there, or a `from` that no longer matches, which means the
 * course has moved since it was read and the review is stale.
 */
export function reviewFindingToRevision(
  finding: ReviewFinding,
  modules: CourseModuleInput[],
): CourseRevision | string {
  if (!finding.fix) return `${finding.kind} is a judgement, not a repair — there is nothing to apply.`;
  const { field } = finding.location;
  const { from, to } = finding.fix;

  if (COURSE_FIELDS.has(field)) {
    if (field === 'estimated_hours') {
      const hours = Number(to);
      if (!Number.isFinite(hours)) return `estimated_hours must be a number; the fix says "${to}".`;
      return { meta: { estimated_hours: hours } };
    }
    // tags — a comma-separated list on the card, because that is what reads.
    return { meta: { tags: to.split(',').map((t) => t.trim()).filter(Boolean) } };
  }

  const mi = (finding.location.module_index ?? 0) - 1;
  const li = (finding.location.lesson_index ?? 0) - 1;
  const si = (finding.location.step_index ?? 0) - 1;
  const step = modules[mi]?.lessons?.[li]?.steps?.[si];
  if (!step) {
    return `module ${mi + 1} › lesson ${li + 1} › step ${si + 1} is not there any more — the course has changed since it was reviewed. Review it again.`;
  }

  // The value must still be what the card showed. If the course moved under
  // the review, applying would overwrite something nobody approved.
  const current = field === 'teach' ? (step.teach ?? '')
    : field === 'prompt' ? (step.interaction?.prompt ?? '')
      : field === 'answer' ? (step.interaction?.answer ?? '')
        : (step.interaction?.evaluation ?? '');
  if (from && current.trim() !== from.trim()) {
    return `The ${field} has changed since the review: it now reads ${JSON.stringify(current.slice(0, 80))}, not ${JSON.stringify(from.slice(0, 80))}. Nothing was applied — review the course again.`;
  }

  // Everything else on the step is carried through verbatim.
  const next: CourseStepInput = {
    ...step,
    ...(field === 'teach' ? { teach: to } : {}),
    interaction: {
      ...step.interaction,
      ...(field === 'prompt' ? { prompt: to } : {}),
      ...(field === 'answer' ? { answer: to } : {}),
      ...(field === 'evaluation' ? { evaluation: to } : {}),
    },
  };
  return { step: { module_index: mi, lesson_index: li, index: si, step: next } };
}

/* ── The brief ─────────────────────────────────────────────────────────── */

/** The kinds, written out for the prompt that asks for a review. */
export function describeReviewKinds(): string {
  const line = (k: ReviewFindingKind) => `- **${k}** — ${REVIEW_KINDS[k].what}\n  e.g. ${REVIEW_KINDS[k].example}`;
  return [
    'REPAIR — a single right answer exists, so give the exact change as fix.from / fix.to:',
    REVIEW_REPAIR_KINDS.map(line).join('\n'),
    '',
    'RAISE — a judgement with no single right answer. Report it; propose nothing:',
    REVIEW_RAISE_KINDS.map(line).join('\n'),
  ].join('\n');
}
