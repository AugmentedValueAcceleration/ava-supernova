// Growing a course, instead of resending it.
//
// 25 Sep 2026: a Git course took nineteen attempts and never landed at full
// size. Every revise operation REPLACED something at an index, so adding a
// fourth module meant resending all four, and adding one lesson meant
// resending that module's every lesson and every step inside them. The only
// move available was the whole syllabus in one call, and the whole syllabus
// does not fit in one call — so each attempt was cut off in transit and
// nothing was saved. Ava said so herself, correctly, and had no other move.
//
// These are the calls that make a large course possible: one piece each.

import { describe, it, expect } from 'vitest';
import { ReviseCourseTool, CheckCourseTool, ReadCourseTool } from '../src/tools/course-tools.js';
import type { CourseStore, CourseRevision, CourseSnapshot } from '../src/learning/course-store.js';
import type { ToolExecutionContext } from '../src/tools/types.js';

function fakeStore(snapshot?: Partial<CourseSnapshot>, findings: Array<{ kind: string; where: string; message: string }> = []) {
  const revisions: CourseRevision[] = [];
  const store = {
    async listCategories() { return [{ slug: 'software_development', name: 'Software Development' }]; },
    async reviseCourse(_id: string, revision: CourseRevision) { revisions.push(revision); return { ok: true, added: 'lesson 3 "Branches" in module 2' }; },
    async recheck() { return { status: findings.length ? 'fail' as const : 'pass' as const, checked_at: 'now', findings }; },
    async readCourse() { return { id: 'c1', title: 'Git', modules: [], ...snapshot } as unknown as CourseSnapshot; },
    async identify() { return { kind: 'unknown' as const }; },
  } as unknown as CourseStore;
  return { store, revisions };
}
const ctx = (store: CourseStore) => ({ sharedState: { courseStore: store } }) as unknown as ToolExecutionContext;
const out = (r: { output: string }) => JSON.parse(r.output);

const step = { teach: 'A branch is a name for a commit.', interaction: { kind: 'free_text', prompt: 'Make one and switch to it.', evaluation: 'They ran git switch -c and the prompt changed.' } };

describe('add_module appends without touching what is there', () => {
  it('sends only the new module, and says where it landed', async () => {
    const { store, revisions } = fakeStore();
    const r = await new ReviseCourseTool().execute({
      course_id: 'c1',
      add_module: { title: 'Collaboration', lessons: [{ title: 'Pull requests', steps: [step] }] },
    }, ctx(store));
    expect(r.success).toBe(true);
    expect(revisions[0].add_module?.title).toBe('Collaboration');
    // The critical property: no full modules list was sent.
    expect(revisions[0].modules).toBeUndefined();
    expect(out(r).added).toContain('lesson 3 "Branches"');
  });

  it('at_index inserts rather than appends, and is 1-based on the wire', async () => {
    const { store, revisions } = fakeStore();
    await new ReviseCourseTool().execute({
      course_id: 'c1', at_index: 2,
      add_module: { title: 'Undo', lessons: [{ title: 'Reset', steps: [step] }] },
    }, ctx(store));
    expect(revisions[0].add_module?.at_index).toBe(1);
  });

  it('a module with no title is refused, and nothing is sent', async () => {
    const { store, revisions } = fakeStore();
    const r = await new ReviseCourseTool().execute({ course_id: 'c1', add_module: { lessons: [] } }, ctx(store));
    expect(r.success).toBe(false);
    expect(r.output).toContain('needs a `title`');
    expect(revisions).toHaveLength(0);
  });
});

describe('add_lesson and add_step', () => {
  it('a lesson goes to the module named by module_index, 1-based', async () => {
    const { store, revisions } = fakeStore();
    await new ReviseCourseTool().execute({
      course_id: 'c1', module_index: 2,
      add_lesson: { title: 'Branches', type: 'exercise', steps: [step] },
    }, ctx(store));
    expect(revisions[0].add_lesson).toMatchObject({ module_index: 1, title: 'Branches' });
    expect(revisions[0].add_lesson?.steps).toHaveLength(1);
  });

  it('add_lesson without module_index says which index is missing', async () => {
    const { store } = fakeStore();
    const r = await new ReviseCourseTool().execute({ course_id: 'c1', add_lesson: { title: 'Branches' } }, ctx(store));
    expect(r.success).toBe(false);
    expect(r.output).toContain('module_index');
  });

  it('a step goes to one lesson of one module', async () => {
    const { store, revisions } = fakeStore();
    await new ReviseCourseTool().execute({ course_id: 'c1', module_index: 2, lesson_index: 3, add_step: step }, ctx(store));
    expect(revisions[0].add_step).toMatchObject({ module_index: 1, lesson_index: 2 });
    expect(revisions[0].add_step?.step.teach).toContain('A branch is a name');
  });

  it('add_step needs both indices', async () => {
    const { store } = fakeStore();
    const r = await new ReviseCourseTool().execute({ course_id: 'c1', module_index: 1, add_step: step }, ctx(store));
    expect(r.success).toBe(false);
    expect(r.output).toContain('lesson_index');
  });
});

describe('the build plan says what is left', () => {
  const plan = {
    set_at: 'now',
    lessons: [
      { module: 'Setup', lesson: 'Install' },
      { module: 'Setup', lesson: 'Identity' },
      { module: 'Undo', lesson: 'Reset' },
    ],
  };
  const modules = [{ title: 'Setup', lessons: [{ title: 'Install', steps: [step] }] }];

  it('read_course counts what is written and names the next one', async () => {
    const { store } = fakeStore({ build_plan: plan, modules } as Partial<CourseSnapshot>);
    const r = await new ReadCourseTool().execute({ course_id: 'c1' }, ctx(store));
    const o = out(r);
    expect(o.build_plan).toMatchObject({ written: 1, total: 3, next: 'Setup › Identity' });
    expect(o.how).toContain('add_lesson');
  });

  it('a finished plan says so instead of naming a next piece', async () => {
    const done = [{ title: 'Setup', lessons: [{ title: 'Install' }, { title: 'Identity' }] }, { title: 'Undo', lessons: [{ title: 'Reset' }] }];
    const { store } = fakeStore({ build_plan: plan, modules: done } as Partial<CourseSnapshot>);
    const o = out(await new ReadCourseTool().execute({ course_id: 'c1' }, ctx(store)));
    expect(o.build_plan.next).toBeNull();
    expect(o.how).toContain('All 3 planned lessons are written');
  });

  it('no plan means no progress noise', async () => {
    const { store } = fakeStore({ modules } as Partial<CourseSnapshot>);
    const o = out(await new ReadCourseTool().execute({ course_id: 'c1' }, ctx(store)));
    expect(o.build_plan).toBeUndefined();
  });

  it('setting a plan does not change the course', async () => {
    const { store, revisions } = fakeStore();
    const r = await new ReviseCourseTool().execute({
      course_id: 'c1',
      plan: [{ module: 'Setup', lesson: 'Install' }, { module: 'Undo', lesson: 'Reset' }],
    }, ctx(store));
    expect(r.success).toBe(true);
    expect(revisions[0].plan).toHaveLength(2);
    expect(revisions[0].modules).toBeUndefined();
    expect(revisions[0].module).toBeUndefined();
  });
});

describe('a repair arrives as a list, not as "rewrite it"', () => {
  const findings = [
    { kind: 'no_steps', where: 'module 1 "Setup" › lesson 2 "Identity"', message: 'This lesson has no steps.' },
    { kind: 'thin_outline', where: 'module 2 "Undo"', message: '1 lesson in this module.' },
    { kind: 'step_unchecked', where: 'module 1 "Setup" › lesson 1 "Install" › step 2', message: 'No answer and no rubric.' },
  ];

  it('check_course numbers the jobs and names the call for each', async () => {
    const { store } = fakeStore({}, findings);
    const o = out(await new CheckCourseTool().execute({ course_id: 'c1' }, ctx(store)));
    expect(o.worklist).toHaveLength(3);
    expect(o.worklist[0]).toMatch(/^1\. \[no_steps\]/);
    expect(o.worklist[0]).toContain('revise_course lesson');
    // A short module is repaired by APPENDING, which is the whole point.
    expect(o.worklist[1]).toContain('add_lesson');
    expect(o.worklist[2]).toContain('step_index');
  });

  it('it says to work the list one at a time and not to rewrite', async () => {
    const { store } = fakeStore({}, findings);
    const o = out(await new CheckCourseTool().execute({ course_id: 'c1' }, ctx(store)));
    expect(o.how).toContain('ONE entry at a time');
    expect(o.how).toContain('Do not rewrite');
  });

  it('a clean course gets no worklist at all', async () => {
    const { store } = fakeStore({}, []);
    const o = out(await new CheckCourseTool().execute({ course_id: 'c1' }, ctx(store)));
    expect(o.status).toBe('pass');
    expect(o.worklist).toBeUndefined();
  });
});

describe('a truncated call is called truncated', () => {
  it('modules sent as cut-off JSON text says so, with the length', async () => {
    const { store, revisions } = fakeStore();
    const cut = '[{"title":"Setup","lessons":[{"title":"Install","steps":[{"teach":"Run git';
    const r = await new ReviseCourseTool().execute({ course_id: 'c1', modules: cut }, ctx(store));
    expect(r.success).toBe(false);
    expect(r.output).toContain('JSON TEXT');
    expect(r.output).toContain('CUT OFF');
    expect(r.output).toContain(String(cut.length));
    // The two conclusions that wasted the run.
    expect(r.output).toContain('re-checking it will not help');
    expect(r.output).toContain('add_lesson');
    expect(revisions).toHaveLength(0);
  });

  it('nothing-to-change now points at the growth calls', async () => {
    const { store } = fakeStore();
    const r = await new ReviseCourseTool().execute({ course_id: 'c1' }, ctx(store));
    expect(r.success).toBe(false);
    expect(r.output).toContain('add_module');
    expect(r.output).toContain('add_step');
  });
});

describe('what a half-built course is allowed to look like', () => {
  it('only the INCOMPLETE-container faults are exempt from blocking an append', async () => {
    const { COURSE_INCOMPLETE_KINDS, COURSE_REFUSAL_KINDS } = await import('../src/learning/course-check.js');
    // A module with one lesson and a lesson with no steps are the normal
    // state of a course being built a piece at a time; refusing an append for
    // them blocks the very call that was about to fix them.
    expect([...COURSE_INCOMPLETE_KINDS].sort()).toEqual(['no_steps', 'thin_outline']);
    // Everything else stays blocking — a step with no way to check it is a
    // defect in new material, not an unfinished container.
    for (const kind of ['step_unchecked', 'step_no_prompt', 'ask_ai_method', 'vulgar_title', 'no_safety_line']) {
      expect(COURSE_INCOMPLETE_KINDS.has(kind as never)).toBe(false);
    }
    // And both still refuse a write_course, where the course claims to be done.
    for (const kind of COURSE_INCOMPLETE_KINDS) expect(COURSE_REFUSAL_KINDS.has(kind)).toBe(true);
  });
});
