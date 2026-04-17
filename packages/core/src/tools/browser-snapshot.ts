import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { BrowserProvider, BrowserSnapshotElement } from './desktop-providers.js';

const MAX_ELEMENTS_IN_OUTPUT = 80;

export class BrowserSnapshotTool implements Tool {
  readonly name = 'browser_snapshot';
  readonly description = 'Return the structured list of links, buttons, inputs, and other interactable elements on the current browser page with CSS selectors.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'browser_snapshot',
    description:
      'Get the DOM-derived list of interactable elements on the current Ava browser page. ' +
      'Each element comes with a stable CSS selector you pass back to browser_click or browser_type. ' +
      'This is the preferred way to \"see\" a web page in Desktop Automation mode — do NOT request a screenshot.',
    parameters: {
      type: 'object',
      properties: {
        filter_tag: {
          type: 'string',
          description: 'Optional: only return elements of a specific tag (link, button, input, textarea, select).',
        },
      },
      required: [],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const filterTag = (args.filter_tag as string | undefined)?.toLowerCase();

    const state = (context.sharedState || {}) as Record<string, unknown>;
    const browser = state.browserProvider as BrowserProvider | undefined;

    if (!browser) {
      return {
        success: false,
        output: 'Browser provider is not available in this host. browser_snapshot requires the Ava IDE (Tauri) with the browser worker running.',
      };
    }

    try {
      const snap = await browser.snapshot();
      const filtered: BrowserSnapshotElement[] = filterTag
        ? snap.elements.filter(e => e.tag?.toLowerCase() === filterTag)
        : snap.elements;

      const capped = filtered.slice(0, MAX_ELEMENTS_IN_OUTPUT);
      const lines = capped.map(e => {
        const label = e.text || e.placeholder || e.value || e.href || '';
        const preview = label.length > 60 ? `${label.slice(0, 60)}…` : label;
        return `- [${e.tag}] "${preview}" → ${e.selector}`;
      });

      const header = `Page: ${snap.title} (${snap.url})\n${filtered.length} element${filtered.length === 1 ? '' : 's'} (showing ${capped.length})`;
      return {
        success: true,
        output: `${header}\n${lines.join('\n')}`,
        metadata: { url: snap.url, title: snap.title, count: filtered.length, shown: capped.length, elements: capped },
      };
    } catch (err) {
      return { success: false, output: `snapshot failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}
