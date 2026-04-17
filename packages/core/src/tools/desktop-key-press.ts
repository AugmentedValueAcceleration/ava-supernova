import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { InputProvider } from './desktop-providers.js';
import { gateDesktopAction, tickBudget, blockedResult } from './desktop-safety-gate.js';

// Known destructive combos — mapped to the irreversible-verb text so the
// existing classifyAction blocklist picks them up. Normalised to lowercase,
// modifier order doesn't matter.
const DESTRUCTIVE_COMBO_HINTS: Record<string, string> = {
  'alt+f4': 'close window',
  'ctrl+w': 'close tab',
  'ctrl+shift+w': 'close window',
  'ctrl+q': 'quit application',
  'cmd+q': 'quit application',
  'meta+q': 'quit application',
  'ctrl+shift+delete': 'delete history',
  'shift+delete': 'delete permanently',
};

function comboHint(key: string): string | undefined {
  const normalised = key.toLowerCase().split('+').map(s => s.trim()).sort().join('+');
  for (const [combo, hint] of Object.entries(DESTRUCTIVE_COMBO_HINTS)) {
    const comboNorm = combo.toLowerCase().split('+').map(s => s.trim()).sort().join('+');
    if (normalised === comboNorm) return hint;
  }
  return undefined;
}

export class DesktopKeyPressTool implements Tool {
  readonly name = 'desktop_key_press';
  readonly description = 'Press a named key or key combination on the focused window (e.g. "Enter", "ctrl+s", "alt+f4").';
  readonly riskLevel: ToolRiskLevel = 'dangerous';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'desktop_key_press',
    description:
      'Send a key or key combination to the focused window. Use "+" to combine modifiers ("ctrl+s", "ctrl+shift+n", "alt+f4"). ' +
      'Named keys: Enter, Escape, Tab, Space, Backspace, Delete, Home, End, Up, Down, Left, Right, F1-F12. ' +
      'Prefer this over simulating mouse clicks through menus — shortcuts are faster and more reliable.',
    parameters: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'Key or combo. Examples: "Enter", "ctrl+s", "alt+tab", "ctrl+shift+n", "F5".',
        },
      },
      required: ['key'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const key = (args.key as string)?.trim();
    if (!key) {
      return { success: false, output: 'key is required.' };
    }

    const state = (context.sharedState || {}) as Record<string, unknown>;
    const input = state.inputProvider as InputProvider | undefined;

    if (!input) {
      return {
        success: false,
        output: 'Input provider is not available in this host. desktop_key_press requires the Ava IDE (Tauri).',
      };
    }

    const hint = comboHint(key);
    const gate = await gateDesktopAction(
      { kind: 'key', targetName: hint ?? key },
      this.name, args, context,
    );
    if (!gate.allowed) return blockedResult(gate);

    try {
      await input.keyPress(key);
      tickBudget(context, 200);
      return { success: true, output: `Pressed ${key}.`, metadata: { key, classification: gate.classification } };
    } catch (err) {
      return { success: false, output: `key_press failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}
