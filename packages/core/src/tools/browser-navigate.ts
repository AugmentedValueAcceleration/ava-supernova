import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { BrowserProvider } from './desktop-providers.js';

export class BrowserNavigateTool implements Tool {
  readonly name = 'browser_navigate';
  readonly description = 'Open a URL in the Ava-driven browser window (visible, persistent).';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'browser_navigate',
    description:
      'Navigate the Ava browser to a URL. The browser is visible, persistent across calls, and driven via DOM selectors (not pixel clicking). ' +
      'After navigating, call browser_snapshot to see the page\'s interactable elements.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Full URL including scheme (e.g. "https://gmail.com"). Non-http(s) URLs are rejected.',
        },
      },
      required: ['url'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const url = (args.url as string)?.trim();
    if (!url) {
      return { success: false, output: 'url is required.' };
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { success: false, output: `Invalid URL: "${url}".` };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { success: false, output: `Only http(s) URLs are allowed (got "${parsed.protocol}").` };
    }

    const state = (context.sharedState || {}) as Record<string, unknown>;
    const browser = state.browserProvider as BrowserProvider | undefined;

    if (!browser) {
      return {
        success: false,
        output: 'Browser provider is not available in this host. browser_navigate requires the Ava IDE (Tauri) with the browser worker running.',
      };
    }

    try {
      const result = await browser.navigate(url);
      return {
        success: true,
        output: `Navigated to ${result.url} — "${result.title}". Call browser_snapshot to see what\'s on the page.`,
        metadata: { url: result.url, title: result.title },
      };
    } catch (err) {
      return { success: false, output: `navigate failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}
