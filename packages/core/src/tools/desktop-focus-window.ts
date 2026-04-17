import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { UIAProvider } from './desktop-providers.js';

export class DesktopFocusWindowTool implements Tool {
  readonly name = 'desktop_focus_window';
  readonly description = 'Bring a window to the foreground by its title (partial, case-insensitive match).';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'desktop_focus_window',
    description:
      'Raise a window to the foreground so subsequent desktop_type / desktop_key_press calls land in the right place. ' +
      'Matches against the window title or app name (partial, case-insensitive). Use this after launching an app with bash (e.g. notepad.exe), before typing into it.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Window title or app name to focus (e.g. "Notepad", "Chrome", "Untitled - Notepad").',
        },
      },
      required: ['title'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const title = (args.title as string)?.trim();
    if (!title) {
      return { success: false, output: 'title is required.' };
    }

    const state = (context.sharedState || {}) as Record<string, unknown>;
    const uia = state.uiaProvider as UIAProvider | undefined;

    if (!uia) {
      return {
        success: false,
        output: 'UI Automation is not available in this host. desktop_focus_window requires the Ava IDE (Tauri).',
      };
    }

    try {
      const focused = await uia.focusWindow(title);
      if (!focused) {
        return {
          success: false,
          output: `No window matching "${title}" found. The app may not be running — launch it via bash first (e.g. "notepad.exe").`,
        };
      }
      return {
        success: true,
        output: `Focused window: "${focused}".`,
        metadata: { focused },
      };
    } catch (err) {
      return { success: false, output: `focus_window failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}
