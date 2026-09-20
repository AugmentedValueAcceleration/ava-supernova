// The Classroom's tools against a fake store: the gate runs BEFORE a save,
// a category that does not exist is refused with the list, and revise_course
// maps the 1-based indices the check reports onto the store's 0-based ones.

import { describe, it, expect } from 'vitest';
import { WriteCourseTool, ReviseCourseTool } from '../src/tools/course-tools.js';
import type { CourseStore, CourseInput, CourseRevision } from '../src/learning/course-store.js';
import type { ToolExecutionContext } from '../src/tools/types.js';

function fakeStore() {
  const saved: CourseInput[] = [];
  const revisions: Array<{ id: string; revision: CourseRevision }> = [];
  const store = {
    async listCategories() { return [{ slug: 'digital_craft', name: 'Digital Craft' }, { slug: 'using_ava', name: 'Using Ava' }]; },
    async save(course: CourseInput) { saved.push(course); return { id: 'course-1' }; },
    async recheck() { return { status: 'pass' as const, checked_at: 'now', findings: [] }; },
    async reviseCourse(id: string, revision: CourseRevision) { revisions.push({ id, revision }); return { ok: true }; },
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
const goodArgs = () => ({
  title: 'GIMP from the First Layer',
  description: 'Open GIMP for the first time and leave able to retouch a photograph, cut a subject out cleanly, and export without guessing.',
  category: 'digital_craft', subject: 'GIMP', level: 'beginner', audience_type: 'Personal interest',
  prerequisites: 'None', target_audience: 'Never opened an image editor.',
  learning_objectives: ['Retouch a photo'],
  modules: [
    { title: 'Workspace', lessons: [lesson('Layers'), lesson('Selections')] },
    { title: 'Retouch', lessons: [lesson('Masks'), lesson('Healing')] },
    { title: 'Out', lessons: [lesson('Export'), lesson('Print')] },
  ],
});

describe('write_course', () => {
  it('lands a course that passes the gate, as a draft', async () => {
    const { store, saved } = fakeStore();
    const r = await new WriteCourseTool().execute(goodArgs(), ctx(store));
    expect(r.success).toBe(true);
    expect(saved).toHaveLength(1);
    expect(saved[0].modules[0].lessons[0].steps[1].interaction.evaluation).toBe('A named layer above the photo.');
    expect(JSON.parse(r.output)).toMatchObject({ ok: true, id: 'course-1', status: 'draft', modules: 3, lessons: 6 });
  });

  it('refuses at the gate and writes nothing', async () => {
    const { store, saved } = fakeStore();
    const args = goodArgs();
    args.modules[0].lessons[0].steps = [];                       // legacy-shaped lesson
    const r = await new WriteCourseTool().execute(args, ctx(store));
    expect(r.success).toBe(false);
    expect(saved).toHaveLength(0);
    expect(JSON.parse(r.output).findings[0]).toMatch(/^no_steps — module 1 "Workspace" › lesson 1 "Layers"/);
  });

  it('refuses a category that does not exist and lists the ones that do', async () => {
    const { store, saved } = fakeStore();
    const r = await new WriteCourseTool().execute({ ...goodArgs(), category: 'crafts' }, ctx(store));
    expect(r.success).toBe(false);
    expect(saved).toHaveLength(0);
    expect(r.output).toContain('digital_craft (Digital Craft)');
    expect(r.output).toContain('propose_category');
  });
});

describe('revise_course', () => {
  it('maps 1-based indices to the store\'s 0-based ones for a step', async () => {
    const { store, revisions } = fakeStore();
    const r = await new ReviseCourseTool().execute(
      { course_id: 'course-1', module_index: 2, lesson_index: 3, step_index: 1, step: step('free_text') },
      ctx(store),
    );
    expect(r.success).toBe(true);
    expect(revisions[0].revision.step).toMatchObject({ module_index: 1, lesson_index: 2, index: 0 });
    expect(revisions[0].revision.step!.step.interaction.evaluation).toBe('A named layer above the photo.');
  });

  it('a lesson revision needs both indices', async () => {
    const { store, revisions } = fakeStore();
    const r = await new ReviseCourseTool().execute({ course_id: 'course-1', module_index: 1, lesson: lesson('Layers') }, ctx(store));
    expect(r.success).toBe(false);
    expect(revisions).toHaveLength(0);
  });

  it('fields alone are a meta revision', async () => {
    const { store, revisions } = fakeStore();
    const r = await new ReviseCourseTool().execute({ course_id: 'course-1', prerequisites: 'None', level: 'beginner', difficulty: 'nope' }, ctx(store));
    expect(r.success).toBe(true);
    expect(revisions[0].revision).toEqual({ meta: { prerequisites: 'None', level: 'beginner' } });
  });

  it('refuses an empty revision', async () => {
    const { store, revisions } = fakeStore();
    const r = await new ReviseCourseTool().execute({ course_id: 'course-1' }, ctx(store));
    expect(r.success).toBe(false);
    expect(revisions).toHaveLength(0);
  });
});
