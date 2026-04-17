import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { UIAProvider } from './desktop-providers.js';

export class DesktopClickByNameTool implements Tool {
  readonly name = 'desktop_click_by_name';
  readonly description = 'Click a native UI element by its Windows UI Automation accessible name (stable — not a pixel coordinate).';
  readonly riskLevel: ToolRiskLevel = 'dangerous';
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'desktop_click_by_name',
    description:
      'Click a UI element in the foreground desktop window by its accessible name (from desktop_list_elements). ' +
      'Names are matched loosely (case-insensitive, partial). If multiple match, the first one wins. ' +
      'Prefer this over any coordinate-based clicking — names survive window resizes, DPI changes, and theme changes.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The accessible name of the element to click (e.g. "Save", "File", "Submit").',
        },
      },
      required: ['name'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const name = (args.name as string)?.trim();
    if (!name) {
      return { success: false, output: 'name is required.' };
    }

    const state = (context.sharedState || {}) as Record<string, unknown>;
    const uia = state.uiaProvider as UIAProvider | undefined;

    if (!uia) {
      return {
        success: false,
        output: 'UI Automation is not available in this host. desktop_click_by_name requires the Ava IDE (Tauri).',
      };
    }

    try {
      const element = await uia.clickElement(name);
      if (!element) {
        return {
          success: false,
          output: `No element matching "${name}" found in the foreground window. Run desktop_list_elements to see available targets.`,
        };
      }
      return {
        success: true,
        output: `Clicked "${element.name}" at (${element.cx}, ${element.cy}).`,
        metadata: { name: element.name, cx: element.cx, cy: element.cy },
      };
    } catch (err) {
      return { success: false, output: `click_by_name failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}
