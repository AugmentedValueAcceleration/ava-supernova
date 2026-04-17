import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { BrowserProvider } from './desktop-providers.js';
import { gateDesktopAction, tickBudget, blockedResult } from './desktop-safety-gate.js';

export class BrowserClickTool implements Tool {
  readonly name = 'browser_click';
  readonly description = 'Click an element on the current browser page by CSS selector (from browser_snapshot).';
  readonly riskLevel: ToolRiskLevel = 'dangerous';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'browser_click',
    description:
      'Click an element in the Ava browser using a CSS selector. Always use selectors returned by browser_snapshot — do not invent your own. ' +
      'Irreversible actions (submit, pay, send, delete) require fresh approval every time.',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector from browser_snapshot (e.g. "button#login", \"a[href=\\\"/compose\\\"]\").',
        },
        target_text: {
          type: 'string',
          description: 'Optional: the visible text of the element (from the snapshot), used for safety classification. Pass it so Ava can detect irreversible verbs like Send, Submit, Delete, Pay and prompt accordingly.',
        },
      },
      required: ['selector'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const selector = (args.selector as string)?.trim();
    if (!selector) {
      return { success: false, output: 'selector is required.' };
    }

    const state = (context.sharedState || {}) as Record<string, unknown>;
    const browser = state.browserProvider as BrowserProvider | undefined;

    if (!browser) {
      return {
        success: false,
        output: 'Browser provider is not available in this host. browser_click requires the Ava IDE (Tauri) with the browser worker running.',
      };
    }

    const targetText = (args.target_text as string | undefined)?.trim();
    const gate = await gateDesktopAction(
      { kind: 'click', targetName: targetText || selector, targetType: 'button' },
      this.name, args, context,
    );
    if (!gate.allowed) return blockedResult(gate);

    try {
      await browser.click(selector);
      tickBudget(context);
      return {
        success: true,
        output: `Clicked ${selector}${targetText ? ` ("${targetText}")` : ''}.`,
        metadata: { selector, targetText, classification: gate.classification },
      };
    } catch (err) {
      return { success: false, output: `click failed: ${err instanceof Error ? err.message : String(err)}. Re-run browser_snapshot — the selector may be stale.` };
    }
  }
}
