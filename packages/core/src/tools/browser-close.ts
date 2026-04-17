import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { BrowserProvider } from './desktop-providers.js';

export class BrowserCloseTool implements Tool {
  readonly name = 'browser_close';
  readonly description = 'Close the Ava browser window and release the Playwright worker.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'browser_close',
    description:
      'Shut down the Ava browser window. Call this when you\'re done with the web portion of a task so the Chromium process is released. ' +
      'Safe to call even if the browser wasn\'t open.',
    parameters: { type: 'object', properties: {}, required: [] },
  };

  async execute(_args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const state = (context.sharedState || {}) as Record<string, unknown>;
    const browser = state.browserProvider as BrowserProvider | undefined;

    if (!browser) {
      return { success: true, output: 'Browser provider is not available — nothing to close.' };
    }

    try {
      await browser.close();
      return { success: true, output: 'Browser closed.' };
    } catch (err) {
      return { success: false, output: `close failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}
