// Measured tag volume from Bluesky's public search — the rate is how far back
// the newest 100 posts reach. Offline: a fake fetch stands in for Bluesky.
import { describe, it, expect } from 'vitest';
import { blueskyTagVolume, blueskyTagsFor, measureTags, bandFor, type TagFetch } from '../src/social/tag-volume.js';

const NOW = Date.parse('2026-11-01T12:00:00Z');
const postsOver = (n: number, hours: number, at = NOW) => ({
  posts: Array.from({ length: n }, (_, i) => ({ indexedAt: new Date(at - (i / Math.max(n - 1, 1)) * hours * 3_600_000).toISOString() })),
});

describe('tag volume', () => {
  it('reads 100 posts in half a day as about 200 a day', async () => {
    const get: TagFetch = async () => postsOver(100, 12);
    expect(await blueskyTagVolume('#indiedev', get, NOW)).toBe(200);
  });

  it('reads an unused tag as zero, and a failed fetch as unknown', async () => {
    expect(await blueskyTagVolume('nothing', async () => ({ posts: [] }), NOW)).toBe(0);
    expect(await blueskyTagVolume('down', async () => { throw new Error('offline'); }, NOW)).toBeNull();
  });

  it('bands reach, niche and quiet', () => {
    expect(bandFor(276)).toBe('reach');
    expect(bandFor(6)).toBe('niche');
    expect(bandFor(0.3)).toBe('quiet');
  });

  it('harvests the tags people actually use with a subject, from facets', async () => {
    const tagPost = (...tags: string[]) => ({ record: { text: '', facets: [{ features: tags.map((tag) => ({ $type: 'app.bsky.richtext.facet#tag', tag })) }] } });
    const get: TagFetch = async () => ({ posts: [tagPost('LocalFirst', 'opensource'), tagPost('localfirst'), tagPost('rust')] });
    expect((await blueskyTagsFor('local-first software', get))[0]).toBe('localfirst');
  });

  it('measures busiest first and leaves out what it could not measure', async () => {
    const get: TagFetch = async (url) => {
      // measureTags reads the real clock, so these posts are anchored to it
      // (fixed to NOW, the test went stale as the days passed).
      if (url.includes('busy')) return postsOver(100, 6, Date.now());
      if (url.includes('quiet')) return postsOver(3, 24 * 30, Date.now());
      throw new Error('down');
    };
    const m = await measureTags(['#quiet', 'busy', 'broken'], get);
    expect(m.map((x) => x.tag)).toEqual(['busy', 'quiet']);
    expect(m[0].band).toBe('reach');
  });
});
