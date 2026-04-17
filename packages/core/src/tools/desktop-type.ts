import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { InputProvider } from './desktop-providers.js';
import { gateDesktopAction, tickBudget, blockedResult } from './desktop-safety-gate.js';

const MAX_CHARS = 10_000;

export class DesktopTypeTool implements Tool {
  readonly name = 'desktop_type';
  readonly description = 'Type text into the currently focused native UI element.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;
  readonly usesDynamicConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'desktop_type',
    description:
      'Send keystrokes to the focused element. Use desktop_focus_window first if you\'re not sure the right window is active. ' +
      'For secrets (passwords, API keys, 2FA codes), do not pass the raw value — request a capability handle via secret_request and the host will substitute it at execution time.',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to type. Special characters are typed literally; for key combos or named keys, use desktop_key_press instead.',
        },
        field_hint: {
          type: 'string',
          description: 'Optional accessible name of the focused field (from desktop_list_elements), used for safety classification — e.g. "Password", "Email". Pass it so Ava can detect sensitive fields and route secrets through the capability handle flow.',
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
      return { success: false, output: `text is too long (${text.length} chars, max ${MAX_CHARS}). Split it across multiple calls.` };
    }

    const state = (context.sharedState || {}) as Record<string, unknown>;
    const input = state.inputProvider as InputProvider | undefined;

    if (!input) {
      return {
        success: false,
        output: 'Input provider is not available in this host. desktop_type requires the Ava IDE (Tauri).',
      };
    }

    const fieldHint = (args.field_hint as string | undefined)?.trim();
    const gate = await gateDesktopAction(
      { kind: 'type', fieldName: fieldHint, targetName: fieldHint },
      this.name, args, context,
    );
    if (!gate.allowed) return blockedResult(gate);

    try {
      await input.typeText(text);
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
