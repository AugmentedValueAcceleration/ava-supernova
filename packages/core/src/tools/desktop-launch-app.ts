import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { AppLauncherProvider } from './desktop-providers.js';
import { gateDesktopAction, tickBudget, blockedResult } from './desktop-safety-gate.js';

export class DesktopLaunchAppTool implements Tool {
  readonly name = 'desktop_launch_app';
  readonly description = 'Open a named application or executable (Notepad, Chrome, a path). Narrow replacement for bash in desktop mode — no shell, no pipes, no env injection.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;
  readonly usesDynamicConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'desktop_launch_app',
    description:
      'Launch a named executable (e.g. "notepad", "calc", "chrome") or full path (e.g. "C:\\\\Program Files\\\\App\\\\app.exe"). ' +
      'Use this to open an app before interacting with it via desktop_list_elements / desktop_click_by_name / desktop_type. ' +
      'Shell interpreters, scripting hosts, registry editors and admin tools are refused by the host — you cannot launch bash, powershell, cmd, reg, taskkill, wmic, etc.',
    parameters: {
      type: 'object',
      properties: {
        app: {
          type: 'string',
          description: 'Executable name (found via PATH) or full path to an .exe. Examples: "notepad", "chrome", "C:\\\\Windows\\\\System32\\\\notepad.exe".',
        },
      },
      required: ['app'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const app = (args.app as string)?.trim();
    if (!app) {
      return { success: false, output: 'app is required.' };
    }

    const state = (context.sharedState || {}) as Record<string, unknown>;
    const launcher = state.appLauncherProvider as AppLauncherProvider | undefined;
    if (!launcher) {
      return {
        success: false,
        output: 'App launcher is not available in this host. desktop_launch_app requires the Ava IDE (Tauri).',
      };
    }

    // Safety gate classifies the target — launching "regedit" or anything
    // matching a privileged-context pattern escalates to `privileged` and
    // is refused unless the session has explicitly opted in.
    const gate = await gateDesktopAction(
      { kind: 'navigate', targetName: app, appName: app },
      this.name, args, context,
    );
    if (!gate.allowed) return blockedResult(gate);

    try {
      const result = await launcher.launch(app);
      tickBudget(context, 500);
      return {
        success: true,
        output: `Launched ${result.launched}${result.pid ? ` (pid ${result.pid})` : ''}.`,
        metadata: { launched: result.launched, pid: result.pid, classification: gate.classification },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: `launch failed: ${msg}` };
    }
  }
}
