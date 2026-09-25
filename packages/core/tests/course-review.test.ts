// The Review's vocabulary, tested against the three defects that prompted it.
//
// 25 Sep 2026, "JavaScript from Scratch". The course passed the gate, and
// reading it found: an answer key marked 15 where the code prints "105"; a
// rubric grading forEach/map output against a prompt asking for a filter; and
// a check accepting "undefined" where its own teach block said Node throws.
// None of the three is findable structurally. All three have a single right
// answer, so all three can be proposed as an exact change and approved with
// one button — which is the whole design.

import { describe, it, expect } from 'vitest';
import {
  parseReviewFinding, reviewFindingToRevision, describeReviewKinds,
  isRepairKind, REVIEW_KINDS, REVIEW_REPAIR_KINDS, REVIEW_RAISE_KINDS,
} from '../src/learning/course-review.js';
import type { CourseModuleInput } from '../src/learning/course-store.js';

const step = (over: Record<string, unknown> = {}) => ({
  teach: 'Adding a number to a string turns the number into text.',
  interaction: {
    kind: 'choice' as const,
    prompt: 'What does console.log(10 + "5") print?',
    options: ['15', '"105"'],
    answer: '15',
    ...(over.interaction ?? {}),
  },
  ...over,
});
const modules = (): CourseModuleInput[] => ([{
  title: 'Running your first code',
  description: null,
  lessons: [
    { title: 'Values', steps: [] },
    { title: 'Numbers and text', steps: [step(), step()] },
  ],
}] as unknown as CourseModuleInput[]);

const ok = (r: unknown) => { if (typeof r === 'string') throw new Error(r); return r; };

describe('the two classes are kept apart', () => {
  it('every kind is either a repair or a raise, and none is both', () => {
    const all = [...REVIEW_REPAIR_KINDS, ...REVIEW_RAISE_KINDS];
    expect(new Set(all).size).toBe(all.length);
    expect(Object.keys(REVIEW_KINDS).sort()).toEqual([...all].sort());
    for (const k of REVIEW_REPAIR_KINDS) expect(isRepairKind(k)).toBe(true);
    for (const k of REVIEW_RAISE_KINDS) expect(isRepairKind(k)).toBe(false);
  });

  it('every kind carries an example, because the brief teaches by example', () => {
    for (const [kind, d] of Object.entries(REVIEW_KINDS)) {
      expect(d.what.length, kind).toBeGreaterThan(30);
      expect(d.example.length, kind).toBeGreaterThan(20);
    }
    expect(describeReviewKinds()).toContain('prints "105"');
  });
});

describe('a repair must be approvable', () => {
  const answerWrong = {
    kind: 'answer_wrong',
    message: 'The step marks 15 correct; 10 + "5" prints "105", as its own teach block explains.',
    location: { module_index: 1, lesson_index: 2, step_index: 1, field: 'answer' },
    fix: { from: '15', to: '"105"' },
  };

  it('the real 25 Sep finding parses', () => {
    const f = ok(parseReviewFinding(answerWrong, 0)) as { kind: string; fix: { to: string } };
    expect(f.kind).toBe('answer_wrong');
    expect(f.fix.to).toBe('"105"');
  });

  it('a repair with no replacement is refused — there would be nothing to approve', () => {
    const r = parseReviewFinding({ ...answerWrong, fix: { from: '15' } }, 0);
    expect(typeof r).toBe('string');
    expect(r as string).toContain('exact replacement, not a description');
  });

  it('a repair that changes nothing is refused', () => {
    const r = parseReviewFinding({ ...answerWrong, fix: { from: '15', to: '15' } }, 0);
    expect(r as string).toContain('nothing would change');
  });

  it('a step repair without its indices is refused', () => {
    const r = parseReviewFinding({ ...answerWrong, location: { field: 'answer' } }, 0);
    expect(r as string).toContain('module_index, lesson_index and step_index');
  });

  it('a field that cannot be repaired in place says to raise it instead', () => {
    const r = parseReviewFinding({ ...answerWrong, location: { ...answerWrong.location, field: 'module_order' } }, 0);
    expect(r as string).toContain('raise it instead');
  });

  it('an unknown kind lists the kinds that exist', () => {
    const r = parseReviewFinding({ ...answerWrong, kind: 'looks_bad' }, 0);
    expect(r as string).toContain('is not a review kind');
    expect(r as string).toContain('answer_wrong');
  });
});

describe('a raise proposes nothing', () => {
  it('it parses without a fix', () => {
    const f = ok(parseReviewFinding({
      kind: 'goal_not_met',
      message: 'The goal promises an interactive page; the course stops before a click is handled.',
      location: { field: 'goal' },
    }, 0)) as { fix?: unknown };
    expect(f.fix).toBeUndefined();
  });

  it('a fix attached to a judgement is dropped, not rendered as a button', () => {
    const f = ok(parseReviewFinding({
      kind: 'stale_fact', message: 'Menu path predates the single-window redesign.',
      location: { module_index: 1, lesson_index: 1, step_index: 1, field: 'teach' },
      fix: { from: 'Windows > Single-Window Mode', to: 'it is the default now' },
    }, 0)) as { fix?: unknown };
    expect(f.fix).toBeUndefined();
  });
});

describe('an approved repair applies exactly what the card showed', () => {
  it('changes the one field and carries the rest of the step through', () => {
    const f = ok(parseReviewFinding({
      kind: 'answer_wrong', message: 'wrong key',
      location: { module_index: 1, lesson_index: 2, step_index: 1, field: 'answer' },
      fix: { from: '15', to: '"105"' },
    }, 0)) as never;
    const rev = ok(reviewFindingToRevision(f, modules())) as { step: { step: { teach: string; interaction: Record<string, unknown> } } };
    expect(rev.step.step.interaction.answer).toBe('"105"');
    // Everything else survives — a repair is not a rewrite.
    expect(rev.step.step.interaction.prompt).toContain('console.log');
    expect(rev.step.step.interaction.options).toEqual(['15', '"105"']);
    expect(rev.step.step.teach).toContain('turns the number into text');
  });

  it('refuses when the value has changed since the review', () => {
    const f = ok(parseReviewFinding({
      kind: 'answer_wrong', message: 'wrong key',
      location: { module_index: 1, lesson_index: 2, step_index: 1, field: 'answer' },
      fix: { from: 'something else entirely', to: '"105"' },
    }, 0)) as never;
    const r = reviewFindingToRevision(f, modules());
    expect(typeof r).toBe('string');
    expect(r as string).toContain('has changed since the review');
    expect(r as string).toContain('Nothing was applied');
  });

  it('refuses when the step is no longer there', () => {
    const f = ok(parseReviewFinding({
      kind: 'answer_wrong', message: 'wrong key',
      location: { module_index: 9, lesson_index: 9, step_index: 9, field: 'answer' },
      fix: { from: '15', to: '"105"' },
    }, 0)) as never;
    expect(reviewFindingToRevision(f, modules()) as string).toContain('not there any more');
  });

  it('a rubric repair reaches evaluation, not answer', () => {
    const mods = modules();
    (mods[0].lessons[1].steps as unknown as Array<Record<string, unknown>>)[0] = step({
      interaction: { kind: 'free_text', prompt: 'Write a filter with a named predicate.', evaluation: 'They used forEach and logged each item.' },
    }) as never;
    const f = ok(parseReviewFinding({
      kind: 'rubric_mismatch', message: 'Grades forEach output against a filter prompt.',
      location: { module_index: 1, lesson_index: 2, step_index: 1, field: 'evaluation' },
      fix: { from: 'They used forEach and logged each item.', to: 'They called filter with a named predicate and kept the matching items.' },
    }, 0)) as never;
    const rev = ok(reviewFindingToRevision(f, mods)) as { step: { step: { interaction: Record<string, unknown> } } };
    expect(rev.step.step.interaction.evaluation).toContain('named predicate');
    expect(rev.step.step.interaction.answer).toBeUndefined();
  });

  it('course-level repairs do not need a step', () => {
    const hours = ok(parseReviewFinding({
      kind: 'estimate_wrong', message: 'Says 14; the lessons sum to 11.',
      location: { field: 'estimated_hours' }, fix: { from: '14', to: '11' },
    }, 0)) as never;
    expect(ok(reviewFindingToRevision(hours, modules()))).toEqual({ meta: { estimated_hours: 11 } });

    const tags = ok(parseReviewFinding({
      kind: 'no_tags', message: 'No tags; learners filter on them.',
      location: { field: 'tags' }, fix: { from: '', to: 'javascript, programming, beginner' },
    }, 0)) as never;
    expect(ok(reviewFindingToRevision(tags, modules()))).toEqual({ meta: { tags: ['javascript', 'programming', 'beginner'] } });
  });

  it('a judgement has nothing to apply', () => {
    const f = ok(parseReviewFinding({ kind: 'jump', message: 'Uses an arrow function before functions exist.', location: { field: 'modules' } }, 0)) as never;
    expect(reviewFindingToRevision(f, modules()) as string).toContain('nothing to apply');
  });
});
