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
