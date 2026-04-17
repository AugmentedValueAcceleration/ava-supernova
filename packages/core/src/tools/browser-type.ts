import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { BrowserProvider } from './desktop-providers.js';
import { gateDesktopAction, tickBudget, blockedResult } from './desktop-safety-gate.js';

const MAX_CHARS = 10_000;

export class BrowserTypeTool implements Tool {
  readonly name = 'browser_type';
  readonly description = 'Type text into the currently focused browser input (focus it with browser_click first).';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;
  readonly usesDynamicConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'browser_type',
    description:
      'Type text into the focused element on the current browser page. Focus the target field first via browser_click on its selector. ' +
      'For secrets (passwords, API keys, 2FA codes), use secret_request for a capability handle instead of passing raw values.',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to type. For named keys or combos, use a separate flow — this tool sends literal characters.',
        },
        field_hint: {
          type: 'string',
          description: 'Optional: name/label/placeholder of the focused field (from browser_snapshot), used for safety classification — e.g. "Password", "Email". Pass it so Ava can detect sensitive fields and route secrets through the capability handle flow.',
        },
        field_is_password: {
          type: 'boolean',
          description: 'Set to true when the focused field is a password / masked input. Forces the safety gate to require the secret handle flow.',
        },
      },
      required: ['text'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const text = args.text as string;
    if (typeof text !== 'string') {
      return { success: false, output: 'text is required.' };
    }
    if (text.length > MAX_CHARS) {
      return { success: false, output: `text is too long (${text.length} chars, max ${MAX_CHARS}).` };
    }

    const state = (context.sharedState || {}) as Record<string, unknown>;
    const browser = state.browserProvider as BrowserProvider | undefined;

    if (!browser) {
      return {
        success: false,
        output: 'Browser provider is not available in this host. browser_type requires the Ava IDE (Tauri) with the browser worker running.',
      };
    }

    const fieldHint = (args.field_hint as string | undefined)?.trim();
    const isMaskedField = args.field_is_password === true;
    const gate = await gateDesktopAction(
      { kind: 'type', fieldName: fieldHint, targetName: fieldHint, isMaskedField },
      this.name, args, context,
    );
    if (!gate.allowed) return blockedResult(gate);

    try {
      await browser.type(text);
      tickBudget(context);
      const preview = text.length > 60 ? `${text.slice(0, 60)}…` : text;
      return {
        success: true,
        output: `Typed ${text.length} character${text.length === 1 ? '' : 's'}: "${preview}"`,
        metadata: { length: text.length, classification: gate.classification },
      };
    } catch (err) {
      return { success: false, output: `type failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}
