import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

const PLATFORM_URL = 'https://avasupernova.com';

export class ReleaseNotesTool implements Tool {
  readonly name = 'release_notes';
  readonly description = 'Fetch published release notes for Ava Supernova. Use this to see what has been shipped, reference specific versions, or check what users see when they update.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'release_notes',
    description: this.description,
    parameters: {
      type: 'object',
      properties: {
        version: {
          type: 'string',
          description: 'Optional: fetch a specific version (e.g. "0.11.0")',
        },
        platform: {
          type: 'string',
          description: 'Optional: filter by platform — core, extension, ide, companion',
        },
        limit: {
          type: 'number',
          description: 'Max results to return (default 5)',
        },
      },
    },
  };

  async execute(args: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const version = args.version as string | undefined;
      const platform = args.platform as string | undefined;
      const limit = Math.min((args.limit as number) || 5, 20);

      let url = version
        ? `${PLATFORM_URL}/api/releases?version=${encodeURIComponent(version)}`
        : `${PLATFORM_URL}/api/releases?limit=${limit}`;
      if (platform && !version) url += `&platform=${encodeURIComponent(platform)}`;

      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        return { success: false, output: `Failed to fetch release notes: HTTP ${res.status}` };
      }

      const data: unknown = await res.json();
      const releases = (Array.isArray(data) ? data : (data as Record<string, unknown>).releases || []) as Array<Record<string, unknown>>;

      if (!releases || releases.length === 0) {
        return { success: true, output: version ? `No release notes found for v${version}` : 'No release notes found.' };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const formatted = releases.map((r: any) =>
        `## v${r.version} — ${r.title} [${(r.platform || 'extension').toUpperCase()}]\n${r.body}\n\nHighlights: ${r.highlights.join(', ')}\nPublished: ${new Date(r.published_at).toLocaleDateString('en-GB')}`
      ).join('\n\n---\n\n');

      return { success: true, output: formatted };
    } catch (err) {
      return { success: false, output: `Failed to fetch release notes: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}
