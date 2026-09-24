// "No course with that id." — where a turn used to stop dead.
//
// 24 Sep 2026: read_course and check_course both failed with it, and there
// was no way to tell from the message whether the id was a seed's, one that
// had been deleted, or whether the library had simply not answered. Ava has
// the seed id in front of her in every brief, one line from the course id
// the tool wants, so that confusion is the likely one — and a lookup that
// FAILED must never read as a course that is gone, or she rewrites work that
// still exists.

import { describe, it, expect } from 'vitest';
import { ReadCourseTool, CheckCourseTool } from '../src/tools/course-tools.js';
import type { CourseStore, IdentifiedId } from '../src/learning/course-store.js';
import type { ToolExecutionContext } from '../src/tools/types.js';

function storeThatCannotFind(identified: IdentifiedId) {
  return {
    async readCourse() { return null; },
    async recheck() { return null; },
    async identify() { return identified; },
  } as unknown as CourseStore;
}
const ctx = (store: CourseStore) => ({ sharedState: { courseStore: store } }) as unknown as ToolExecutionContext;
const ID = '2853fe4f-1bd6-4245-ad31-c9968375e6bf';

describe('an id that finds no course', () => {
  it('names a SEED id and hands over the course written from it', async () => {
    const store = storeThatCannotFind({ kind: 'seed', title: 'JavaScript from Scratch', courseId: '594ca5b3-0ad4-4ae7-80ac-683ab05c9524' });
    const r = await new ReadCourseTool().execute({ course_id: ID }, ctx(store));
    expect(r.success).toBe(false);
    expect(r.output).toContain('SEED id');
    expect(r.output).toContain('JavaScript from Scratch');
    expect(r.output).toContain('594ca5b3-0ad4-4ae7-80ac-683ab05c9524');
  });

  it('a seed with nothing written yet says to write it, not to hunt for it', async () => {
    const store = storeThatCannotFind({ kind: 'seed', title: 'SQL & Databases, Gently', courseId: null });
    const r = await new ReadCourseTool().execute({ course_id: ID }, ctx(store));
    expect(r.output).toContain('write_course');
    expect(r.output).toContain('seed_id');
  });

  it('a LOOKUP FAILURE never reads as a missing course', async () => {
    const store = storeThatCannotFind({ kind: 'lookup_failed', error: 'connection timeout' });
    const r = await new CheckCourseTool().execute({ course_id: ID }, ctx(store));
    expect(r.output).toContain('NOT a missing course');
    expect(r.output).toContain('connection timeout');
    // The two conclusions that cost real work.
    expect(r.output).toContain('do not rewrite it');
    expect(r.output).not.toMatch(/no course with id/i);
  });

  it('an id that is simply gone says to look it up rather than trust memory', async () => {
    const store = storeThatCannotFind({ kind: 'unknown' });
    const r = await new ReadCourseTool().execute({ course_id: ID }, ctx(store));
    expect(r.output).toContain('may have been deleted');
    expect(r.output).toContain('find_course');
  });

  it('something that is not a uuid is called what it is', async () => {
    const store = storeThatCannotFind({ kind: 'malformed' });
    const r = await new ReadCourseTool().execute({ course_id: 'the-javascript-one' }, ctx(store));
    expect(r.output).toContain('not a course id');
  });
});
