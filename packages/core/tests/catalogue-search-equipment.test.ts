import { describe, it, expect, vi, afterEach } from 'vitest';
import { HealthCatalogueSearchTool } from '../src/tools/health-catalogue-search.js';

/**
 * The equipment filter reaching the catalogue.
 *
 * The room prompt has told Ava to "respect their equipment" for a long time and
 * there was no parameter to do it with: health_catalogue_search took kind,
 * query, category, exercise_type and diet. Web plan generation filtered by kit;
 * the room where she builds a plan WITH you did not, so it could offer a bench
 * press to somebody with no bench.
 *
 * These check the tool actually sends it, and the shapes a model really
 * produces — an array as specced, and a comma-separated string, which happens
 * often enough that refusing it would mean a silently empty filter.
 */

function ctx() {
  return { sharedState: { platformApiBase: 'https://example.test' } } as never;
}

function stubFetch() {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (u: string) => {
    calls.push(String(u));
    return { ok: true, status: 200, json: async () => ({ exercises: [], total: 0 }) } as never;
  }));
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('health_catalogue_search — equipment', () => {
  it('advertises the parameter, for exercises', () => {
    const props = (new HealthCatalogueSearchTool().schema.parameters as { properties: Record<string, unknown> }).properties;
    expect(props.equipment).toBeDefined();
    expect(JSON.stringify(props.equipment)).toMatch(/EVERY piece/i);
  });

  it('sends the slugs as a comma-separated query param', async () => {
    const calls = stubFetch();
    await new HealthCatalogueSearchTool().execute(
      { kind: 'exercise', query: 'press', equipment: ['bodyweight', 'dumbbells', 'bench'] }, ctx(),
    );
    expect(calls[0]).toContain('equipment=bodyweight%2Cdumbbells%2Cbench');
  });

  it('accepts a comma-separated string too, because models produce both', async () => {
    const calls = stubFetch();
    await new HealthCatalogueSearchTool().execute(
      { kind: 'exercise', query: 'press', equipment: 'dumbbells, bench' }, ctx(),
    );
    expect(calls[0]).toContain('equipment=dumbbells%2Cbench');
  });

  it('sends nothing when the profile does not say', async () => {
    // "Not stated" must not become "owns nothing" — that would leave a
    // beginner with almost no exercises.
    const calls = stubFetch();
    await new HealthCatalogueSearchTool().execute({ kind: 'exercise', query: 'press' }, ctx());
    expect(calls[0]).not.toContain('equipment=');
  });

  it('ignores it for recipes', async () => {
    const calls = stubFetch();
    await new HealthCatalogueSearchTool().execute(
      { kind: 'recipe', query: 'chilli', equipment: ['dumbbells'] }, ctx(),
    );
    expect(calls[0]).not.toContain('equipment=');
  });

  it('equipment ALONE is a valid search', async () => {
    // "What can I do with what I have?" is a real question and used to be
    // rejected for having no query.
    const calls = stubFetch();
    const r = await new HealthCatalogueSearchTool().execute(
      { kind: 'exercise', equipment: ['bodyweight'] }, ctx(),
    );
    expect(r.success).not.toBe(false);
    expect(calls[0]).toContain('equipment=bodyweight');
  });

  it('still refuses a search with no criteria at all', async () => {
    const r = await new HealthCatalogueSearchTool().execute({ kind: 'exercise' }, ctx());
    expect(r.success).toBe(false);
    expect(r.output).toMatch(/equipment/);
  });
});
