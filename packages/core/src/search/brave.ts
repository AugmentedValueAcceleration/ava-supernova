/**
 * Brave web search, on a key the caller supplies.
 *
 * The single copy (BYOK plan, 1 Nov 2026). The website held its own, reading
 * our server key from the environment; core now owns the request and the
 * website passes its key in like anyone else.
 *
 * With Ava fully bring-your-own-key, a user who adds their own Brave key gets
 * the same search the hub uses. Without one, search falls back to DuckDuckGo —
 * free, but it rate-limits datacenter addresses, so a Brave key is the
 * upgrade for anyone who searches a lot.
 */

export interface BraveResult { title: string; url: string; snippet: string }

export async function braveSearch(
  key: string,
  query: string,
  max = 5,
  freshness?: 'pd' | 'pw' | 'pm' | 'py',
  signal?: AbortSignal,
): Promise<BraveResult[]> {
  const params = new URLSearchParams({
    q: query,
    count: String(Math.min(Math.max(max, 1), 20)),
    extra_snippets: '1',
    safesearch: 'moderate',
  });
  if (freshness) params.set('freshness', freshness);
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params.toString()}`, {
    headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': key },
    signal,
  });
  if (!res.ok) {
    // Thrown, not swallowed: the caller falls back to another search, and an
    // empty list would read as "the web has nothing on this".
    throw new Error(`Brave search ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  }
  const data = (await res.json().catch(() => null)) as { web?: { results?: unknown[] } } | null;
  const results = Array.isArray(data?.web?.results) ? data!.web!.results! : [];
  const strip = (s: unknown) => String(s || '').replace(/<[^>]+>/g, '').trim();
  return results.slice(0, max).map((raw) => {
    const r = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
    const extra = Array.isArray(r.extra_snippets) ? (r.extra_snippets as unknown[]).map(strip).join(' ') : '';
    return { title: strip(r.title), url: String(r.url || ''), snippet: [strip(r.description), extra].filter(Boolean).join(' ').trim() };
  });
}
