import { request } from 'node:https';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

const DUCKDUCKGO_URL = 'https://lite.duckduckgo.com/lite/';
const REQUEST_TIMEOUT = 10_000;
const DEFAULT_MAX_RESULTS = 5;

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

function fetchDuckDuckGo(query: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const postData = `q=${encodeURIComponent(query)}`;
    const req = request(
      DUCKDUCKGO_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': 'Ava-Supernova/1.0',
        },
        timeout: REQUEST_TIMEOUT,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
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
      const html = await fetchDuckDuckGo(query);
      const results = parseResults(html, maxResults);

      if (results.length === 0) {
        return {
          success: true,
          output: `No results found for "${query}".`,
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
      return { success: false, output: `Web search failed: ${message}` };
    }
  }
}
