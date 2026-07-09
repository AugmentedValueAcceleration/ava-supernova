import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel, ToolOutputTrust } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { WebSearchFn } from '../social/index.js';

// The players whose words actually move the AI conversation — the closed
// frontier AND the open / EU / China side Ava stands with. Curated for mission
// relevance (open vs closed, access, privacy, local-first, pricing). Each is
// one fresh (past-week) search; the tool returns real snippets + source links.
const AI_PLAYERS: { label: string; query: string }[] = [
  { label: 'OpenAI / Sam Altman', query: 'Sam Altman OpenAI' },
  { label: 'Anthropic / Dario Amodei', query: 'Dario Amodei Anthropic' },
  { label: 'Google DeepMind / Demis Hassabis', query: 'Demis Hassabis DeepMind' },
  { label: 'Meta AI / Yann LeCun', query: 'Yann LeCun Meta AI' },
  { label: 'xAI / Elon Musk', query: 'Elon Musk xAI' },
  { label: 'Mistral / Arthur Mensch', query: 'Arthur Mensch Mistral AI' },
  { label: 'DeepSeek', query: 'DeepSeek AI model' },
  { label: 'Alibaba / Qwen', query: 'Alibaba Qwen AI' },
];

/**
 * Scan what AI leaders + labs are actually saying this week — real statement
 * snippets with SOURCE LINKS — so Ava finds what is worth RESPONDING to
 * (receipts, not vibes). Search is the surface-injected `webSearch` (Brave).
 * Output is untrusted third-party content. The persona does the selection:
 * keep only what touches our lane and can be answered with a grounded angle.
 */
export class ScanIndustryTool implements Tool {
  readonly name = 'scan_industry';
  readonly description =
    'Scan what AI leaders/labs are actually saying this week (real statements + source links) so you find what is worth RESPONDING to — grounded in receipts, not vibes.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly outputTrust: ToolOutputTrust = 'untrusted';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'scan_industry',
    description:
      'Scan what the AI industry leaders and labs are actually saying RIGHT NOW (past week) — OpenAI/Altman, Anthropic/Amodei, DeepMind/Hassabis, Meta/LeCun, xAI/Musk, plus Mistral, DeepSeek, Qwen. Returns real statement snippets WITH their source links, so you respond to what was genuinely said, not a paraphrase. Use it to find topics worth a response — things that touch our lane (open vs closed, access, privacy, local-first, pricing). Optionally bias the scan with `focus`.',
    parameters: {
      type: 'object',
      properties: {
        focus: {
          type: 'string',
          description: 'Optional angle to bias the scan toward, e.g. "privacy", "open source", "pricing", "safety/regulation", "local-first". Omit for a broad scan.',
        },
      },
      required: [],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const webSearch = context.sharedState?.webSearch as WebSearchFn | undefined;
    if (!webSearch) {
      return {
        success: false,
        output: 'Web search is not available in this context. The host must inject `webSearch` into shared state.',
      };
    }

    const focus = ((args.focus as string | undefined) || '').trim();

    const batches = await Promise.all(
      AI_PLAYERS.map(async (p) => {
        const query = focus ? `${p.query} ${focus}` : p.query;
        const results = await webSearch(query, 2, 'pw').catch(() => []);
        return results
          .filter((r) => r.snippet)
          .slice(0, 2)
          .map((r) => ({
            player: p.label,
            title: r.title.slice(0, 140),
            source: r.url,
            statement: r.snippet.slice(0, 240),
          }));
      }),
    );
    const statements = batches.flat();

    if (statements.length === 0) {
      return {
        success: true,
        output:
          'No fresh statements surfaced this scan (search came back thin). Say so honestly and fall back to your own read of the space, or try a narrower focus.',
      };
    }

    return {
      success: true,
      output: JSON.stringify({
        focus: focus || 'broad',
        window: 'past week',
        statements,
        note:
          'Real snippets + source links from the past week. These are RAW material. Keep ONLY the statements that genuinely touch our lane (open vs closed, access, privacy, local-first, pricing) AND that we can answer with a true, grounded counterpoint. Cite the source when you respond. Drop the rest — responding to everything is noise; the selection is the skill.',
      }),
    };
  }
}
