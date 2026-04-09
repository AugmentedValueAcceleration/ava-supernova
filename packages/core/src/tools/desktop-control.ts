/**
 * Desktop Control Tool — Agent S3 powered desktop automation.
 *
 * Delegates to Agent S3 via the sidecar's Python subprocess bridge.
 * Ava describes the task in natural language, Agent S3 sees the screen
 * and executes actions. Safety controls are enforced at the sidecar layer.
 *
 * This tool replaces the old computer_use tool (Holo3-based).
 */

import type { Tool, ToolRiskLevel, ToolResult, ToolContext } from './types.js';

export class DesktopControlTool implements Tool {
  readonly name = 'desktop_control';
  readonly description = 'Control the desktop — see the screen and interact with applications autonomously. Ava describes a task in natural language and Agent S3 executes it by seeing the screen and clicking, typing, scrolling. Use for: opening apps, filling forms, navigating UIs, exporting files, any task that requires interacting with a graphical application. Requires Agent S3 to be installed (Settings → Desktop Automation).';
  readonly riskLevel: ToolRiskLevel = 'dangerous';

  readonly schema = {
    name: 'desktop_control',
    description:
      'Perform a desktop automation task. Describe what you want to do in natural language — ' +
      'Agent S3 will see the screen, understand the UI, and execute the necessary clicks, typing, ' +
      'and navigation to complete the task. Examples: "Open Notepad and type Hello World", ' +
      '"In Chrome, navigate to github.com and click the New Repository button", ' +
      '"Export the current Figma design as a PNG". ' +
      'The user controls which apps are allowed and what actions require confirmation.',
    parameters: {
      type: 'object' as const,
      properties: {
        task: {
          type: 'string',
          description: 'Natural language description of the desktop task to perform. Be specific — include app names, button labels, text to type, and expected outcomes.',
        },
        app: {
          type: 'string',
          description: 'Optional: the target application name (e.g., "Notepad", "Chrome", "Blender"). Helps with whitelisting and focus.',
        },
        context: {
          type: 'string',
          description: 'Optional: additional context about the current state or what has already been done.',
        },
      },
      required: ['task'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const task = String(args.task || '');
    const app = args.app ? String(args.app) : undefined;
    const extraContext = args.context ? String(args.context) : undefined;

    if (!task.trim()) {
      return { output: 'Error: No task specified. Describe what you want to do on the desktop.' };
    }

    // Build context string
    let contextStr = '';
    if (app) contextStr += `Target app: ${app}. `;
    if (extraContext) contextStr += extraContext;

    // The actual execution is handled by the sidecar's desktop_task command.
    // This tool just formats the request — the sidecar spawns Agent S3,
    // runs the two-phase predict→execute loop, and enforces safety controls.
    //
    // The tool communicates with the sidecar via the shared state's
    // desktopTaskHandler function, which is injected by the sidecar at init.

    const handler = (context as any).sharedState?.desktopTaskHandler;
    if (!handler) {
      return {
        output: 'Desktop automation is not available. Agent S3 may not be installed. Go to Settings → Desktop Automation to set it up.',
      };
    }

    try {
      const result = await handler(task, contextStr);
      return { output: result.summary || 'Desktop task completed.' };
    } catch (err: any) {
      return { output: `Desktop task failed: ${err.message}` };
    }
  }
}
