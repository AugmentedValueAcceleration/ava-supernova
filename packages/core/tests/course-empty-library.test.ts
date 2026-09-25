// An empty library is an empty library, not a catastrophe.
//
// 26 Sep 2026. Asked to write "JavaScript from Scratch", the run searched the
// library, found nothing, and concluded the store had been wiped. It then
// abandoned the course it had been asked for and spent itself rebuilding — a
// GIMP course nobody had asked for, a seed id that does not exist, and nine
// further courses reported lost that had never been in the library at all.
//
// The library had been cleared deliberately an hour earlier, by the operator,
// so that it could be rebuilt. Nothing was wrong. The only thing missing was
// anything telling the reader that an empty result is a normal state.

import { describe, it, expect } from 'vitest';
import { FindCourseTool, ReadCourseTool } from '../src/tools/course-tools.js';
import type { CourseStore } from '../src/learning/course-store.js';
import type { ToolExecutionContext } from '../src/tools/types.js';

const storeWith = (total: number) => ({
  async findCourse() { return []; },
  async browseCourses() { return { total, sample: [] }; },
  async readCourse() { return null; },
  async identify() { return { kind: 'unknown' as const }; },
}) as unknown as CourseStore;
const ctx = (store: CourseStore) => ({ sharedState: { courseStore: store } }) as unknown as ToolExecutionContext;

describe('finding nothing in an empty library', () => {
  it('says an empty library is normal and is not evidence of loss', async () => {
    const r = await new FindCourseTool().execute({ query: 'JavaScript' }, ctx(storeWith(0)));
    expect(r.success).toBe(true);
    const o = JSON.parse(r.output);
    expect(o.total).toBe(0);
    expect(o.read_this).toContain('normal state');
    expect(o.read_this).toContain('NOT evidence that anything was lost');
  });

  it('names the three wrong moves explicitly', async () => {
    const o = JSON.parse((await new FindCourseTool().execute({ query: 'JavaScript' }, ctx(storeWith(1)))).output);
    // Each of these is something that actually happened that morning.
    expect(o.read_this).toContain('Do not conclude a wipe');
    expect(o.read_this).toContain('restore anything from memory');
    expect(o.read_this).toContain('Do not switch to a different course');
    expect(o.read_this).toContain('write that one');
  });

  it('a stocked library gets the ordinary note and no lecture', async () => {
    const o = JSON.parse((await new FindCourseTool().execute({ query: 'JavaScript' }, ctx(storeWith(38)))).output);
    expect(o.note).toContain('38 courses');
    expect(o.read_this).toBeUndefined();
  });

  it('the count is always given, so no result is ever read as no library', async () => {
    const o = JSON.parse((await new FindCourseTool().execute({ query: 'x' }, ctx(storeWith(7)))).output);
    expect(o.total).toBe(7);
  });
});

describe('an id that finds nothing', () => {
  it('is a fact to report, not a loss to make good', async () => {
    const r = await new ReadCourseTool().execute({ course_id: '2853fe4f-1bd6-4245-ad31-c9968375e6bf' }, ctx(storeWith(0)));
    expect(r.output).toContain('fact to REPORT');
    expect(r.output).toContain('do not rebuild it from memory');
    expect(r.output).toContain('change the job you were asked to do');
  });
});
