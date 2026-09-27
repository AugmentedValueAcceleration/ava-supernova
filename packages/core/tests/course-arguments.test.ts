// What a refusal has to say when a call arrives wrong.
//
// 25 Sep 2026: write_course refused four courses in a row with "write_course
// requires title, category, level (...) and audience_type (...)" — a message
// that named all four fields whatever the fault was, echoed nothing of what
// had actually arrived, and compared the two prose enums exactly, so
// "Professional Development" was refused for one capital letter. From the
// outside it read as the tool being broken; there was no way to see which
// field to fix, and a whole written course was thrown away each time.

import { describe, it, expect } from 'vitest';
import { WriteCourseTool, ReviseCourseTool } from '../src/tools/course-tools.js';
import type { CourseStore, CourseInput, CourseRevision } from '../src/learning/course-store.js';
import type { ToolExecutionContext } from '../src/tools/types.js';

function fakeStore() {
  const saved: CourseInput[] = [];
  const revisions: Array<{ id: string; revision: CourseRevision }> = [];
  const store = {
    async listCategories() { return [{ slug: 'digital_craft', name: 'Digital Craft' }]; },
    async save(course: CourseInput) { saved.push(course); return { id: 'course-1' }; },
    async recheck() { return { status: 'pass' as const, checked_at: 'now', findings: [] }; },
    async reviseCourse(id: string, revision: CourseRevision) { revisions.push({ id, revision }); return { ok: true }; },
    async identify() { return { kind: 'unknown' as const }; },
  } as unknown as CourseStore;
  return { store, saved, revisions };
}
const ctx = (store: CourseStore) => ({ sharedState: { courseStore: store } }) as unknown as ToolExecutionContext;

const step = (kind = 'choice') => ({
  teach: 'Layers stack.',
  interaction: kind === 'choice' || kind === 'predict'
    ? { kind, prompt: 'Which wins?', options: ['Top', 'Bottom'], answer: 'Top' }
    : { kind, prompt: 'Add a layer and name it.', evaluation: 'A named layer above the photo.' },
});
const lesson = (title: string) => ({ title, estimated_minutes: 12, steps: [step(), step('free_text'), step('predict')] });
const modules = () => [
  { title: 'Workspace', lessons: [lesson('Layers'), lesson('Selections')] },
  { title: 'Retouch', lessons: [lesson('Masks'), lesson('Healing')] },
  { title: 'Out', lessons: [lesson('Export'), lesson('Print')] },
];
const goodArgs = (): Record<string, unknown> => ({
  title: 'GIMP from the First Layer',
  description: 'Open GIMP for the first time and leave able to retouch a photograph, cut a subject out cleanly, and export without guessing.',
  category: 'digital_craft', subject: 'GIMP', level: 'beginner', audience_type: 'Personal interest',
  prerequisites: 'None', target_audience: 'Never opened an image editor.',
  learning_objectives: ['Retouch a photo'],
  modules: modules(),
});

describe('a refusal names the field that is wrong', () => {
  it('blames one field, not all four, and quotes what arrived', async () => {
    const { store, saved } = fakeStore();
    const r = await new WriteCourseTool().execute({ ...goodArgs(), level: 'starter' }, ctx(store));
    expect(r.success).toBe(false);
    expect(r.output).toContain('one field');
    expect(r.output).toContain('"starter"');
    expect(r.output).toContain('level');
    // The three that were fine are not accused.
    expect(r.output).not.toContain('title —');
    expect(r.output).not.toContain('audience_type —');
    expect(saved).toHaveLength(0);
  });

  it('says "nothing" for a field that never arrived', async () => {
    const { store } = fakeStore();
    const args = goodArgs();
    delete args.category;
    const r = await new WriteCourseTool().execute(args, ctx(store));
    expect(r.output).toContain('category — got nothing');
  });

  it('a call with no arguments at all is called that, and suggests a smaller one', async () => {
    const { store } = fakeStore();
    const r = await new WriteCourseTool().execute({}, ctx(store));
    expect(r.output).toContain('no arguments at all');
    expect(r.output).toContain('revise_course');
  });
});

describe('the prose enums forgive case and spacing', () => {
  it.each([
    ['Professional Development', 'Professional development'],
    ['professional development', 'Professional development'],
    ['College or University', 'College or university'],
  ])('%s is accepted as %s', async (sent, stored) => {
    const { store, saved } = fakeStore();
    const r = await new WriteCourseTool().execute({ ...goodArgs(), audience_type: sent }, ctx(store));
    expect(r.success).toBe(true);
    expect(saved[0].audience_type).toBe(stored);
  });

  it('Beginner is still beginner', async () => {
    const { store, saved } = fakeStore();
    const r = await new WriteCourseTool().execute({ ...goodArgs(), level: 'Beginner' }, ctx(store));
    expect(r.success).toBe(true);
    expect(saved[0].level).toBe('beginner');
  });

  it('a value that is genuinely not on the list is still refused', async () => {
    const { store } = fakeStore();
    const r = await new WriteCourseTool().execute({ ...goodArgs(), audience_type: 'Hobbyists' }, ctx(store));
    expect(r.success).toBe(false);
    expect(r.output).toContain('"Hobbyists"');
  });
});

describe('a list sent as JSON text is still a list', () => {
  it('modules arriving as a JSON string are parsed rather than lost', async () => {
    const { store, saved } = fakeStore();
    const r = await new WriteCourseTool().execute({ ...goodArgs(), modules: JSON.stringify(modules()) }, ctx(store));
    expect(r.success).toBe(true);
    expect(saved[0].modules).toHaveLength(3);
    expect(saved[0].modules[0].lessons[0].steps).toHaveLength(3);
  });

  it('a course with no modules says so, instead of being refused as thin', async () => {
    const { store, saved } = fakeStore();
    const args = goodArgs();
    delete args.modules;
    const r = await new WriteCourseTool().execute(args, ctx(store));
    expect(r.success).toBe(false);
    expect(r.output).toContain('no modules');
    expect(r.output).toContain('revise_course');
    expect(saved).toHaveLength(0);
  });

  it('modules that all fail to parse are counted, not silently dropped', async () => {
    const { store } = fakeStore();
    const r = await new WriteCourseTool().execute({ ...goodArgs(), modules: [{ lessons: [] }, { lessons: [] }] }, ctx(store));
    expect(r.output).toContain('None of the 2 modules');
  });
});

describe('revise_course holds the same line', () => {
  it('an empty modules list is refused rather than deleting the course', async () => {
    const { store, revisions } = fakeStore();
    const r = await new ReviseCourseTool().execute({ course_id: 'course-1', modules: [] }, ctx(store));
    expect(r.success).toBe(false);
    expect(r.output).toContain('delete every module');
    expect(revisions).toHaveLength(0);
  });

  it('takes a level in the wrong case without comment', async () => {
    const { store, revisions } = fakeStore();
    const r = await new ReviseCourseTool().execute({ course_id: 'course-1', level: 'Intermediate' }, ctx(store));
    expect(r.success).toBe(true);
    expect(revisions[0].revision.meta?.level).toBe('intermediate');
  });
});

describe('a name never keeps an HTML entity', () => {
  it('&amp; in the title becomes &', async () => {
    const { store, saved } = fakeStore();
    const r = await new WriteCourseTool().execute({ ...goodArgs(), title: 'HTML &amp; CSS: Your First Web Page' }, ctx(store));
    expect(r.success).toBe(true);
    expect(saved[0].title).toBe('HTML & CSS: Your First Web Page');
  });

  it('module and lesson titles are cleaned too', async () => {
    const { store, saved } = fakeStore();
    const args = goodArgs();
    const mods = modules();
    mods[0].title = 'Cut &amp; Paste';
    mods[0].lessons[0].title = 'Copy &amp; Move';
    const r = await new WriteCourseTool().execute({ ...args, modules: mods }, ctx(store));
    expect(r.success).toBe(true);
    expect(saved[0].modules[0].title).toBe('Cut & Paste');
    expect(saved[0].modules[0].lessons[0].title).toBe('Copy & Move');
  });

  it('LESSON TEXT is left alone — a web course has to be able to teach &amp;', async () => {
    const { store, saved } = fakeStore();
    const mods = modules();
    mods[0].lessons[0].steps[0].teach = 'To show an ampersand on a page you write &amp; in the HTML.';
    const r = await new WriteCourseTool().execute({ ...goodArgs(), modules: mods }, ctx(store));
    expect(r.success).toBe(true);
    expect(saved[0].modules[0].lessons[0].steps[0].teach).toContain('&amp;');
  });

  it('revise_course cleans a title the same way', async () => {
    const { store, revisions } = fakeStore();
    await new ReviseCourseTool().execute({ course_id: 'course-1', title: 'Git &amp; GitHub' }, ctx(store));
    expect(revisions[0].revision.meta?.title).toBe('Git & GitHub');
  });
});

describe('a cut-off call and a malformed one are different faults', () => {
  const bigLesson = (n: number) => `{"title":"L${n}","steps":[{"teach":"${'x'.repeat(400)}","interaction":{"kind":"free_text","prompt":"do it","evaluation":"they did"}}]}`;

  it('a string that STOPS at its own end is called cut off', async () => {
    const { store } = fakeStore();
    // Ends mid-token: nothing follows the break.
    const cut = `[{"title":"M1","lessons":[${bigLesson(1)},${bigLesson(2)}`;
    const r = await new WriteCourseTool().execute({ ...goodArgs(), modules: cut }, ctx(store));
    expect(r.output).toContain('CUT OFF in transit');
    expect(r.output).toContain('Send less in one call');
  });

  it('a string that arrives COMPLETE and breaks in the middle is not', async () => {
    const { store, saved } = fakeStore();
    // A bad escape early on, with thousands of valid characters after it —
    // the shape seen live on 26 Sep: 34,437 characters present, broken at
    // 5,565. Telling this author to "send less" wastes their whole run.
    const broken = `[{"title":"M1","description":"a "quote" that was never escaped","lessons":[${bigLesson(1)},${bigLesson(2)},${bigLesson(3)}]}]`;
    const r = await new WriteCourseTool().execute({ ...goodArgs(), modules: broken }, ctx(store));
    expect(r.output).toContain('arrived COMPLETE');
    expect(r.output).toContain('NOT cut off');
    expect(r.output).toContain('sending less will not fix it');
    // It must SHOW the break, since that is the only thing that identifies it.
    expect(r.output).toContain('Around the break:');
    expect(r.output).toContain('quote');
    // And point at the fix that removes the whole class.
    expect(r.output).toContain('real ARRAY');
    expect(saved).toHaveLength(0);
  });

  it('the cut-off message never claims punctuation is fine when it is not', async () => {
    const { store } = fakeStore();
    const broken = `[{"title":"M1","description":"a "quote"","lessons":[${bigLesson(1)},${bigLesson(2)}]}]`;
    const r = await new WriteCourseTool().execute({ ...goodArgs(), modules: broken }, ctx(store));
    expect(r.output).not.toContain('re-checking it will not help');
  });
});

describe('a lost escape is repaired, not refused', () => {
  const step = () => ({
    teach: 'Run this:\n# deploy\ngit push\n\nthen open the live URL and check your change is there.',
    interaction: { kind: 'free_text', prompt: 'Deploy it and paste the URL.', evaluation: 'A live URL that loads.' },
  });
  const mods = () => [
    { title: 'Ship it', lessons: [{ title: 'Push', steps: [step(), step(), step()] }, { title: 'Watch', steps: [step(), step(), step()] }] },
    { title: 'Fix it', lessons: [{ title: 'Read the log', steps: [step(), step(), step()] }, { title: 'Roll back', steps: [step(), step(), step()] }] },
    { title: 'Hand over', lessons: [{ title: 'README', steps: [step(), step(), step()] }, { title: 'Walk them through', steps: [step(), step(), step()] }] },
  ];

  it('modules whose newlines arrived raw still land, with the text intact', async () => {
    const { store, saved } = fakeStore();
    // Exactly what double parsing does to an authored \n.
    const mangled = JSON.stringify(mods()).replace(/\n/g, '\n');
    const r = await new WriteCourseTool().execute({ ...goodArgs(), modules: mangled }, ctx(store));
    expect(r.success).toBe(true);
    expect(saved[0].modules).toHaveLength(3);
    // The prose survives — repairing must not flatten what it recovers.
    expect(saved[0].modules[0].lessons[0].steps[0].teach).toContain('\n# deploy\n');
  });

  it('something genuinely broken is still refused', async () => {
    const { store, saved } = fakeStore();
    const broken = '[{"title":"M","lessons":"he said "no" to that"}]';
    const r = await new WriteCourseTool().execute({ ...goodArgs(), modules: broken }, ctx(store));
    expect(r.success).toBe(false);
    expect(saved).toHaveLength(0);
  });
});

describe('a shape error says what arrived and what was probably meant', () => {
  // "The lesson needs a `title`" fired five times in one run and never once
  // said what HAD arrived. A payload carrying only steps is not a malformed
  // lesson — it is somebody adding steps to a lesson that already exists.
  it('add_lesson with steps but no title points at add_step', async () => {
    const { store } = fakeStore();
    const r = await new ReviseCourseTool().execute({
      course_id: 'c1', module_index: 2, add_lesson: { steps: [{ teach: 'x', interaction: { kind: 'choice', prompt: 'y', answer: 'z' } }] },
    }, ctx(store));
    expect(r.success).toBe(false);
    expect(r.output).toContain('What arrived: steps');
    expect(r.output).toContain('add_step with module_index and lesson_index');
  });

  it('add_lesson with neither says it arrived empty', async () => {
    const { store } = fakeStore();
    const r = await new ReviseCourseTool().execute({ course_id: 'c1', module_index: 1, add_lesson: {} }, ctx(store));
    expect(r.output).toContain('It arrived empty');
  });

  it('a step with teach but no kind says which half is missing', async () => {
    const { store } = fakeStore();
    const r = await new ReviseCourseTool().execute({
      course_id: 'c1', module_index: 1, lesson_index: 1, add_step: { teach: 'Layers stack.', interaction: { prompt: 'do it' } },
    }, ctx(store));
    expect(r.output).toContain('the interaction has no kind');
  });
});
