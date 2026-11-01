/**
 * How much a hashtag is ACTUALLY used — measured, not guessed.
 *
 * Until 1 Nov 2026 every tag Ava picked was harvested from web-search snippets
 * and ranked by how often it appeared there: a guess about popularity with no
 * number behind it. Bluesky's public search (api.bsky.app, no account needed —
 * public.api.bsky.app refuses it) returns the latest posts carrying a tag, and
 * how far back the newest 100 reach IS a usage rate. Measured that day:
 * #indiedev ~555 posts/day, #opensource ~276, #vscode ~6, #localfirst ~2.
 *
 * It measures Bluesky only. No other platform offers free tag volume, so this
 * is a guide to which tags people really use, not a verdict for X or TikTok —
 * and the output says so.
 */

const SEARCH = 'https://api.bsky.app/xrpc/app.bsky.feed.searchPosts';
const TIMEOUT_MS = 6000;

export type TagFetch = (url: string) => Promise<{ posts?: BskyPost[] }>;

interface BskyPost {
  indexedAt?: string;
  record?: { text?: string; facets?: { features?: { $type?: string; tag?: string }[] }[] };
}

export interface MeasuredTag {
  tag: string;
  /** Posts per day on Bluesky, from the span of the newest 100. */
  perDay: number;
  /** reach ≥ 50/day · niche 1–50 · quiet < 1 (nobody is reading it). */
  band: 'reach' | 'niche' | 'quiet';
}

const defaultFetch: TagFetch = async (url) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'ava-supernova-research' } });
    if (!res.ok) return {};
    return (await res.json()) as { posts?: BskyPost[] };
  } finally {
    clearTimeout(t);
  }
};

function tagsOf(p: BskyPost): string[] {
  const fromFacets = (p.record?.facets ?? [])
    .flatMap((f) => f.features ?? [])
    .filter((x) => x.$type === 'app.bsky.richtext.facet#tag' && x.tag)
    .map((x) => String(x.tag));
  if (fromFacets.length) return fromFacets;
  return (p.record?.text?.match(/(?:^|\s)#([\p{L}\p{N}_]{2,40})/gu) ?? []).map((m) => m.trim().slice(1));
}

/** Tags people on Bluesky actually use alongside this subject, most common first. */
export async function blueskyTagsFor(subject: string, get: TagFetch = defaultFetch): Promise<string[]> {
  const url = `${SEARCH}?${new URLSearchParams({ q: subject, limit: '100', sort: 'top' })}`;
  const posts = (await get(url).catch((): { posts?: BskyPost[] } => ({}))).posts ?? [];
  const freq = new Map<string, number>();
  for (const p of posts) for (const t of new Set(tagsOf(p).map((x) => x.toLowerCase()))) freq.set(t, (freq.get(t) ?? 0) + 1);
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

/** Posts per day carrying this tag on Bluesky, or null if it could not be measured. */
export async function blueskyTagVolume(tag: string, get: TagFetch = defaultFetch, now = Date.now()): Promise<number | null> {
  const bare = tag.replace(/^#/, '');
  const url = `${SEARCH}?${new URLSearchParams({ q: `#${bare}`, limit: '100', sort: 'latest' })}`;
  const res = await get(url).catch(() => null);
  if (!res) return null;
  const times = (res.posts ?? []).map((p) => Date.parse(p.indexedAt ?? '')).filter((n) => Number.isFinite(n));
  if (!times.length) return 0;
  const days = Math.max((now - Math.min(...times)) / 86_400_000, 1 / 24);
  return Math.round((times.length / days) * 10) / 10;
}

export function bandFor(perDay: number): MeasuredTag['band'] {
  return perDay >= 50 ? 'reach' : perDay >= 1 ? 'niche' : 'quiet';
}

/** Measure a set of candidate tags, busiest first. Unmeasurable tags are left out. */
export async function measureTags(tags: string[], get: TagFetch = defaultFetch): Promise<MeasuredTag[]> {
  const unique = [...new Set(tags.map((t) => t.replace(/^#/, '').toLowerCase()).filter(Boolean))].slice(0, 10);
  const measured = await Promise.all(unique.map(async (tag) => ({ tag, perDay: await blueskyTagVolume(tag, get) })));
  return measured
    .filter((m): m is { tag: string; perDay: number } => m.perDay !== null)
    .map((m) => ({ ...m, band: bandFor(m.perDay) }))
    .sort((a, b) => b.perDay - a.perDay);
}
