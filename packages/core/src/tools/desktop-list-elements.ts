import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { UIAProvider, UIAElement } from './desktop-providers.js';

const MAX_ELEMENTS_IN_OUTPUT = 100;

export class DesktopListElementsTool implements Tool {
  readonly name = 'desktop_list_elements';
  readonly description = 'List interactable UI elements in the foreground desktop window via Windows UI Automation (stable names, not pixels).';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'desktop_list_elements',
    description:
      'Enumerate named, interactable UI elements from the currently focused desktop window using Windows UI Automation. ' +
      'Returns each element\'s accessible name, control type, and click centre. Use before desktop_click_by_name to see what targets are available. ' +
      'This is the preferred way to inspect a native window — do NOT ask for a screenshot in Desktop Automation mode.',
    parameters: {
      type: 'object',
      properties: {
        filter_type: {
          type: 'string',
          description: 'Optional: only return elements of a specific control type (Button, MenuItem, Edit, CheckBox, RadioButton, Hyperlink, TabItem, TreeItem, ListItem). Case-insensitive.',
        },
      },
      required: [],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const filterType = (args.filter_type as string | undefined)?.toLowerCase();
    const state = (context.sharedState || {}) as Record<string, unknown>;
    const uia = state.uiaProvider as UIAProvider | undefined;

    if (!uia) {
      return {
        success: false,
        output: 'UI Automation is not available in this host. desktop_list_elements requires the Ava IDE (Tauri).',
      };
    }

    let elements: UIAElement[];
    try {
      elements = await uia.listElements();
    } catch (err) {
      return { success: false, output: `list_elements failed: ${err instanceof Error ? err.message : String(err)}` };
    }

    if (!elements || elements.length === 0) {
      return {
        success: true,
        output: 'No interactable elements found in the foreground window. It may be a custom-rendered surface without UIA — try desktop_focus_window first, or use bash to launch the app.',
        metadata: { count: 0 },
      };
    }

    const filtered = filterType
      ? elements.filter(e => e.control_type?.toLowerCase().includes(filterType))
      : elements;

    const capped = filtered.slice(0, MAX_ELEMENTS_IN_OUTPUT);
    const lines = capped.map(e => {
      const label = e.name?.trim() || '(unnamed)';
      return `- [${e.control_type}] "${label}" @ (${e.cx}, ${e.cy})`;
    });

    const header = filterType
      ? `${filtered.length} ${filterType} elements (showing ${capped.length}):`
      : `${filtered.length} elements (showing ${capped.length}):`;

    return {
      success: true,
      output: `${header}\n${lines.join('\n')}`,
      metadata: { count: filtered.length, shown: capped.length, elements: capped },
    };
  }
}
