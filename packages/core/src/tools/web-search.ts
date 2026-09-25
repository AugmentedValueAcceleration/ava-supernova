import { request } from 'node:https';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

const DUCKDUCKGO_URL = 'https://lite.duckduckgo.com/lite/';
const REQUEST_TIMEOUT = 15_000;
const DEFAULT_MAX_RESULTS = 5;

/**
 * DuckDuckGo Lite serves a browser, and says so.
 *
 * Measured 26 Sep 2026: the same query with "Ava-Supernova/1.0" returned 200
 * OK, 22KB of HTML and ZERO parseable results; with a browser User-Agent it
 * returned results. Announcing ourselves as a script is answered with a page
 * that looks fine and contains nothing.
 */
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * What being throttled looks like: HTTP 202 and an anomaly page.
 *
 * Not 429, not an error — a 200-shaped response with no results in it. So a
 * block was indistinguishable from "the web has nothing on this", and Ava was
 * told the second thing when the first had happened. Three requests in a row
 * was enough to trigger it from a home connection; from a datacenter address
 * it is worse.
 */
const BLOCKED_RE = /anomaly|captcha|unusual traffic|rate ?limit|too many requests|blocked/i;

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface SearchResponse { status: number; html: string }

function fetchDuckDuckGo(query: string): Promise<SearchResponse> {
  return new Promise((resolve, reject) => {
    const postData = `q=${encodeURIComponent(query)}`;
    const req = request(
      DUCKDUCKGO_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': BROWSER_UA,
          // Sent because a browser sends them, and the page served differs.
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-GB,en;q=0.9',
        },
        timeout: REQUEST_TIMEOUT,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        // The status matters: a throttle arrives as 202 with a page, so a
        // caller that only sees the body cannot tell it from an empty result.
        res.on('end', () => resolve({ status: res.statusCode ?? 0, html: Buffer.concat(chunks).toString('utf-8') }));
        res.on('error', reject);
      },
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Search request timed out'));
    });

    req.write(postData);
    req.end();
  });
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function parseResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];

  // DuckDuckGo Lite returns results in a table structure.
  // Each result has a link in a <a> tag with class "result-link" and a snippet in a <td> with class "result-snippet".
  // We'll use regex patterns to extract them.

  // Pattern 1: Extract result links — <a rel="nofollow" href="URL" class="result-link">TITLE</a>
  const linkPattern = /<a[^>]*class="result-link"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  // Pattern 2: Extract snippets — <td class="result-snippet">(content)</td>
  const snippetPattern = /<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;

  const links: Array<{ url: string; title: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(html)) !== null) {
    const url = match[1].trim();
    const title = match[2].replace(/<[^>]*>/g, '').trim();
    if (url && title && !url.startsWith('/') && url.startsWith('http')) {
      links.push({ url, title });
    }
  }

  const snippets: string[] = [];
  while ((match = snippetPattern.exec(html)) !== null) {
    const snippet = match[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    snippets.push(snippet);
  }

  for (let i = 0; i < Math.min(links.length, maxResults); i++) {
    results.push({
      title: links[i].title,
      url: links[i].url,
      snippet: snippets[i] || '',
    });
  }

  // Fallback: if the class-based patterns didn't match, try a broader approach
  if (results.length === 0) {
    const broadPattern = /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const seen = new Set<string>();
    while ((match = broadPattern.exec(html)) !== null && results.length < maxResults) {
      const url = match[1].trim();
      const title = match[2].replace(/<[^>]*>/g, '').trim();
      // Skip DuckDuckGo internal links and duplicates
      if (url.includes('duckduckgo.com') || !title || seen.has(url)) continue;
      seen.add(url);
      results.push({ title, url, snippet: '' });
    }
  }

  return results;
}

export class WebSearchTool implements Tool {
  readonly name = 'web_search';
  readonly description = 'Search the web using DuckDuckGo';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly outputTrust = 'untrusted' as const;
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'web_search',
    description:
      'Search the web using DuckDuckGo. Returns titles, URLs, and snippets for matching results. ' +
      'Use this when you need documentation, API references, error solutions, or any information from the web.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query',
        },
        max_results: {
          type: 'number',
          description: 'Maximum number of results to return (default: 5, max: 10)',
        },
      },
      required: ['query'],
    },
  };

  async execute(args: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> {
    const query = args.query as string;
    const maxResults = Math.min(Math.max((args.max_results as number) || DEFAULT_MAX_RESULTS, 1), 10);

    if (!query.trim()) {
      return { success: false, output: 'Search query cannot be empty.' };
    }

    try {
      // One retry, because a throttle is often over in a second or two and
      // failing the whole turn for it is expensive.
      let res = await fetchDuckDuckGo(query);
      let blocked = res.status === 202 || BLOCKED_RE.test(res.html);
      if (blocked) {
        await wait(1_500);
        res = await fetchDuckDuckGo(query);
        blocked = res.status === 202 || BLOCKED_RE.test(res.html);
      }

      // BEING REFUSED IS NOT AN EMPTY RESULT. This used to return success with
      // "No results found", so a throttled search told the caller the web had
      // nothing on the subject — a false negative stated as fact, which is
      // worse than an error because it gets believed and acted on.
      if (blocked) {
        return {
          success: false,
          output: `The search was refused, not empty — DuckDuckGo answered with a rate-limit page (HTTP ${res.status}) rather than results. `
            + `This says NOTHING about whether "${query}" has answers on the web; do not conclude there is nothing. `
            + 'Wait a moment and try once more, or carry on from what you already know and say plainly that you could not search.',
          metadata: { count: 0, blocked: true },
        };
      }

      const results = parseResults(res.html, maxResults);

      if (results.length === 0) {
        return {
          // Still a failure: a page with no parseable results is far more
          // often the markup having moved than the web being silent.
          success: false,
          output: `No results could be read for "${query}". The page came back ${res.html.length.toLocaleString()} characters long and HTTP ${res.status}, but nothing in it parsed as a result — `
            + 'which usually means the search page changed shape rather than that there is nothing to find. Do not report this as "no information exists".',
          metadata: { count: 0 },
        };
      }

      const formatted = results.map((r, i) => {
        let entry = `${i + 1}. ${r.title}\n   ${r.url}`;
        if (r.snippet) {
          entry += `\n   ${r.snippet}`;
        }
        return entry;
      });

      return {
        success: true,
        output: `Search results for "${query}":\n\n${formatted.join('\n\n')}`,
        metadata: { count: results.length },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        output: `Web search failed: ${message}. This is the search not reaching an answer, not an answer — `
          + `say you could not search rather than that "${query}" has nothing behind it.`,
      };
    }
  }
}
