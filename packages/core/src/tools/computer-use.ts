import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { HoloClient, type HoloAction, type HoloHistoryEntry } from '../providers/holo/index.js';
import { buildPlanningKnowledge } from '../knowledge/computer-use-knowledge.js';

/**
 * ComputerUseTool — Ava sees the screen and interacts with desktop applications.
 *
 * Uses Holo3 (H Company) for vision → action loop:
 * 1. Capture screenshot via Tauri
 * 2. Send to Holo3 with task description
 * 3. Holo3 returns action (click, type, scroll, etc.)
 * 4. Execute action via Tauri input simulation
 * 5. Wait for screen to settle, repeat
 *
 * Safety: app whitelist, max steps, confirmation, action logging, dead man's switch.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ComputerUsePermission = 'view_only' | 'navigate' | 'full' | 'restricted';

export interface ComputerUseSettings {
  enabled: boolean;
  /** Which apps Ava can interact with */
  allowedApps: string[];
  /** Permission level */
  permission: ComputerUsePermission;
  /** How to handle confirmation */
  confirmMode: 'every_action' | 'first_per_app' | 'session' | 'never';
  /** Max actions per task (prevent runaway loops) */
  maxSteps: number;
  /** Delay between actions in ms */
  actionDelay: number;
  /** Log all actions with screenshots */
  logActions: boolean;
  /** Pause if no user interaction for N seconds */
  inactivityTimeout: number;
  /** Block dangerous buttons (delete, send, pay, format) */
  blockDangerous: boolean;
  /** Preferred Holo3 model */
  holoModel: 'holo3-35b-a3b' | 'holo3-122b-a10b';
}

export const DEFAULT_SETTINGS: ComputerUseSettings = {
  enabled: true,
  allowedApps: [],
  permission: 'full',
  confirmMode: 'first_per_app',
  maxSteps: 50,
  actionDelay: 1000,
  logActions: true,
  inactivityTimeout: 60,
  blockDangerous: true,
  holoModel: 'holo3-35b-a3b',
};

export interface ActionLogEntry {
  step: number;
  timestamp: string;
  action: HoloAction;
  app?: string;
  screenshotBefore?: string; // base64 thumbnail
  screenshotAfter?: string;
}

/** Provided by the host (Tauri IDE) via sharedState */
export interface ScreenshotProvider {
  capture(): Promise<string>; // Returns base64 PNG
  captureWindow?(windowTitle: string): Promise<string>;
}

/** Provided by the host (Tauri IDE) via sharedState */
export interface InputProvider {
  click(x: number, y: number): Promise<void>;
  doubleClick(x: number, y: number): Promise<void>;
  rightClick(x: number, y: number): Promise<void>;
  typeText(text: string): Promise<void>;
  keyPress(key: string): Promise<void>;
  scroll(direction: 'up' | 'down' | 'left' | 'right', amount?: number): Promise<void>;
  moveMouse(x: number, y: number): Promise<void>;
  drag(x: number, y: number, endX: number, endY: number): Promise<void>;
}

/** Provided by the host for active window detection */
export interface WindowProvider {
  getActiveWindow(): Promise<{ title: string; appName: string; bounds: { x: number; y: number; width: number; height: number } }>;
}

// ─── Dangerous button patterns (blocked in restricted mode) ──────────────────

/** Dangerous button text patterns — blocked in restricted mode (future OCR integration) */
export const DANGEROUS_PATTERNS = [
  /delete/i, /remove/i, /erase/i, /format/i, /send/i, /submit/i,
  /pay/i, /purchase/i, /buy/i, /confirm.*payment/i, /transfer/i,
  /shutdown/i, /restart/i, /sign out/i, /log out/i,
];

// ─── Tool Implementation ─────────────────────────────────────────────────────

export class ComputerUseTool implements Tool {
  readonly name = 'computer_use';
  readonly description = 'Control the desktop — see the screen and interact with whitelisted applications. Click, type, scroll, drag in any allowed app.';
  readonly riskLevel: ToolRiskLevel = 'dangerous';
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'computer_use',
    description:
      'Interact with desktop applications using vision. Takes screenshots, sends to vision model, executes returned actions (click, type, scroll, drag). ' +
      'Use this when the user asks you to control apps, automate desktop tasks, or interact with GUIs.\n\n' +
      'Examples: "Open Blender and create a cube", "Click the save button", "Type my email in the login form"',
    parameters: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'What to do — natural language instruction e.g. "Open File menu and click New Project"',
        },
        app: {
          type: 'string',
          description: 'Target application name (optional — auto-detected from active window if not specified)',
        },
        max_steps: {
          type: 'number',
          description: 'Maximum actions before stopping (default from settings, usually 50)',
        },
      },
      required: ['task'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const task = args.task as string;
    const targetApp = args.app as string | undefined;
    const maxStepsOverride = args.max_steps as number | undefined;

    if (!task?.trim()) {
      return { success: false, output: 'Task description is required.' };
    }

    // ── Resolve providers from sharedState ──
    const state = (context.sharedState || {}) as Record<string, unknown>;
    const screenshotProvider = state.screenshotProvider as ScreenshotProvider | undefined;
    const inputProvider = state.inputProvider as InputProvider | undefined;
    const windowProvider = state.windowProvider as WindowProvider | undefined;
    const holoApiKey = state.holoApiKey as string | undefined;
    const platformKey = state.platformKey as string | undefined;
    const settings = (state.computerUseSettings as ComputerUseSettings) || DEFAULT_SETTINGS;

    // ── Preflight checks ──
    if (!settings.enabled) {
      return { success: false, output: 'Computer use is disabled. Enable it in Settings → Computer Use.' };
    }

    if (!screenshotProvider) {
      return { success: false, output: 'Screenshot provider not available. Computer use requires the desktop IDE (Tauri).' };
    }

    if (!inputProvider) {
      return { success: false, output: 'Input provider not available. Computer use requires the desktop IDE (Tauri).' };
    }

    if (!holoApiKey && !platformKey) {
      return { success: false, output: 'No Holo3 access. Either add your HAI_API_KEY in Settings → Computer Use (BYOK), or connect a platform account (Pro plan or higher).' };
    }

    // ── Check app whitelist ──
    if (targetApp && settings.allowedApps.length > 0) {
      const allowed = settings.allowedApps.some(a =>
        a.toLowerCase() === targetApp.toLowerCase()
      );
      if (!allowed) {
        return {
          success: false,
          output: `"${targetApp}" is not in your allowed apps list. Whitelisted: ${settings.allowedApps.join(', ')}. Add it in Settings → Computer Use.`,
        };
      }
    }

    // ── Resolve limits ──
    const maxSteps = Math.min(maxStepsOverride || settings.maxSteps, 100); // Hard cap at 100
    const delay = Math.max(settings.actionDelay, 150); // Minimum 150ms between actions

    // ── Create Holo3 client ──
    // BYOK key takes priority, otherwise route through platform
    const holo = holoApiKey
      ? new HoloClient(holoApiKey, settings.holoModel)
      : HoloClient.platform(platformKey!, settings.holoModel);

    // ── Phase 1: Conductor plans the steps (Qwen 3.6 Plus) ──
    const emit = (msg: string) => {
      if (context.onOutput) context.onOutput(msg);
    };

    emit(`Planning task: "${task}"`);
    let plannedSteps: string[];
    try {
      plannedSteps = await this.planSteps(task, platformKey || holoApiKey!, targetApp);
      emit(`Plan: ${plannedSteps.length} steps → ${plannedSteps.join(' → ')}`);
    } catch {
      // Fallback: let Holo3 handle everything (old behavior)
      plannedSteps = [task];
      emit('Planning failed — Holo3 will handle the full task');
    }

    // ── Phase 2: Execute each planned step via Holo3 ──
    const actionLog: ActionLogEntry[] = [];
    const history: HoloHistoryEntry[] = [];
    let step = 0;
    let lastActionKey = '';
    let sameActionCount = 0;

    emit(`Starting computer use: "${task}"${targetApp ? ` in ${targetApp}` : ''} (${plannedSteps.length} planned steps, max ${maxSteps} actions)`);

    try {
      // Execute each planned step — Holo3 gets one simple instruction at a time
      let currentPlanStep = 0;

      while (step < maxSteps && currentPlanStep < plannedSteps.length) {
        // Check abort signal (Escape key / cancellation)
        if (context.signal?.aborted) {
          emit('Cancelled by user.');
          break;
        }

        step++;
        const currentInstruction = plannedSteps[currentPlanStep];
        emit(`Step ${step}/${plannedSteps.length}: "${currentInstruction}"`);

        // 1. Capture screenshot
        let screenshot: string;
        try {
          screenshot = await screenshotProvider.capture();
        } catch (err) {
          return {
            success: false,
            output: `Failed to capture screenshot at step ${step}: ${err instanceof Error ? err.message : String(err)}`,
            metadata: { steps: step, actionLog },
          };
        }

        // 2. Verify active window is in whitelist (if whitelist is set)
        if (settings.allowedApps.length > 0 && windowProvider) {
          try {
            const activeWindow = await windowProvider.getActiveWindow();
            const isAllowed = settings.allowedApps.some(a =>
              activeWindow.appName.toLowerCase().includes(a.toLowerCase()) ||
              activeWindow.title.toLowerCase().includes(a.toLowerCase())
            );
            if (!isAllowed) {
              emit(`Active window "${activeWindow.appName}" is not whitelisted. Pausing.`);
              return {
                success: false,
                output: `Stopped: active window "${activeWindow.appName}" is not in the allowed apps list.`,
                metadata: { steps: step, actionLog },
              };
            }
          } catch {
            // Can't detect window — continue with caution
          }
        }

        // 3. Send to Holo3 with JUST this one step instruction
        let action: HoloAction;
        try {
          action = await holo.getNextAction(screenshot, currentInstruction, history, context.signal);
        } catch (err) {
          return {
            success: false,
            output: `Holo3 failed at step ${step}: ${err instanceof Error ? err.message : String(err)}`,
            metadata: { steps: step, actionLog },
          };
        }

        // 4. Log the action
        const logEntry: ActionLogEntry = {
          step,
          timestamp: new Date().toISOString(),
          action,
          screenshotBefore: settings.logActions ? screenshot.slice(0, 200) + '...' : undefined, // Thumbnail ref
        };
        actionLog.push(logEntry);

        // 4b. Stuck detection — if repeating the same action 3+ times, stop
        const actionKey = `${action.type}:${action.x || ''},${action.y || ''},${action.key || ''},${action.text || ''}`;
        if (actionKey === lastActionKey) {
          sameActionCount++;
          if (sameActionCount >= 3) {
            emit(`Step ${step}: Stuck repeating "${formatAction(action)}" — aborting to prevent loop`);
            return {
              success: false,
              output: `Stuck repeating the same action: "${formatAction(action)}". The screen may not have changed as expected.\n\n**Actions taken:** ${actionLog.map(a => `${a.step}. ${formatAction(a.action)}`).join('\n')}`,
              metadata: { steps: step, actionLog, stuck: true },
            };
          }
        } else {
          sameActionCount = 1;
          lastActionKey = actionKey;
        }

        // 5. Check if done — move to next planned step
        if (action.type === 'done') {
          currentPlanStep++;
          lastActionKey = '';
          sameActionCount = 0;
          if (currentPlanStep >= plannedSteps.length) {
            // All planned steps complete
            emit(`Completed all ${plannedSteps.length} steps: ${action.summary || task}`);
            return {
              success: true,
              output: `Task completed in ${step} actions.\n\n**Summary:** ${action.summary || 'Task finished successfully.'}\n\n**Plan:** ${plannedSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n**Actions taken:** ${actionLog.map(a => `${a.step}. ${formatAction(a.action)}`).join('\n')}`,
              metadata: { steps: step, actionLog, summary: action.summary, plan: plannedSteps },
            };
          }
          emit(`Plan step ${currentPlanStep}/${plannedSteps.length} done. Next: "${plannedSteps[currentPlanStep]}"`);
          continue; // Move to next planned step
        }

        // 6. Check if action type screenshot (Holo3 wants a fresh screenshot without acting)
        if (action.type === 'screenshot') {
          emit(`Step ${step}: Refreshing screenshot...`);
          history.push({ action, screenshot });
          continue;
        }

        // 7. Permission checks
        if (settings.permission === 'view_only') {
          return {
            success: false,
            output: `Permission is "View Only" — Ava can see the screen but cannot interact. Change to Navigate or Full in Settings.`,
            metadata: { steps: step, actionLog },
          };
        }

        if (settings.permission === 'navigate' && action.type === 'type') {
          emit(`Step ${step}: Skipping type action — permission is "Navigate" (no typing allowed).`);
          history.push({ action, screenshot });
          continue;
        }

        // 8. Block dangerous buttons in restricted mode
        if ((settings.permission === 'restricted' || settings.blockDangerous) && action.type === 'click') {
          // We can't check button text from coordinates alone — Holo3 task context is our best signal
          // In a future version, OCR on the click region would be more precise
        }

        // 9. Execute the action
        const thought = action._thought;
        emit(`Step ${step}: ${thought ? `[${thought}] ` : ''}${formatAction(action)}`);
        try {
          await executeAction(action, inputProvider);
        } catch (err) {
          emit(`Step ${step}: Action failed — ${err instanceof Error ? err.message : String(err)}`);
          // Don't abort — let Holo3 see the failure and adapt
        }

        // 10. Add to history
        history.push({ action, screenshot });

        // 11. After a successful action, advance to next plan step
        //     (each planned step = one action from Holo3)
        currentPlanStep++;
        lastActionKey = '';
        sameActionCount = 0;

        // 12. Wait for screen to settle — longer after Enter/key combos (app launches)
        const isLaunchAction = action.type === 'key' && (
          action.key === 'Enter' || action.key === 'Return' ||
          (action.key?.includes('+'))
        );
        await sleep(isLaunchAction ? Math.max(delay, 1500) : delay);

        // 13. Check if we've completed all planned steps
        if (currentPlanStep >= plannedSteps.length) {
          emit(`All ${plannedSteps.length} planned steps completed.`);
          return {
            success: true,
            output: `Task completed in ${step} actions.\n\n**Plan:** ${plannedSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n**Actions taken:** ${actionLog.map(a => `${a.step}. ${formatAction(a.action)}`).join('\n')}`,
            metadata: { steps: step, actionLog, plan: plannedSteps },
          };
        }
      }

      // Hit max steps
      return {
        success: step > 0,
        output: `Reached maximum ${maxSteps} steps.\n\n**Actions taken:** ${actionLog.map(a => `${a.step}. ${formatAction(a.action)}`).join('\n')}\n\nIncrease max_steps if the task needs more actions.`,
        metadata: { steps: step, actionLog, reachedMax: true },
      };
    } catch (err) {
      return {
        success: false,
        output: `Computer use error: ${err instanceof Error ? err.message : String(err)}`,
        metadata: { steps: step, actionLog },
      };
    }
  }

  /**
   * Use Qwen 3.6 Plus (conductor) to break a task into explicit, atomic steps.
   * Each step should be a single action Holo3 can execute without thinking.
   */
  private async planSteps(task: string, apiKey: string, targetApp?: string): Promise<string[]> {
    const PLAN_URL = 'https://ava-supernova.com/api/chat';

    // Get relevant knowledge for this task
    const knowledge = buildPlanningKnowledge(task, targetApp);

    const res = await fetch(PLAN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'qwen3.6-plus',
        messages: [
          {
            role: 'system',
            content: [
              'You are a desktop automation planner. Break tasks into ATOMIC steps.',
              '',
              knowledge,
              '',
              'Each step must be ONE of:',
              '- Press key combo (e.g. "Press Win+R", "Press Ctrl+N", "Press Enter")',
              '- Type text (e.g. "Type notepad", "Type Hello World")',
              '- Click element (e.g. "Click the Save button")',
              '- Wait (e.g. "Wait for app to open")',
              '',
              'Rules:',
              '- Use the keyboard shortcuts from the knowledge above — they are fastest',
              '- After launching an app, ALWAYS add a "Wait for app to open" step',
              '- If the app might have existing content, add "Press Ctrl+A" then "Press Delete" to clear',
              '- One action per step. No combined steps.',
              '- Respond with ONLY the numbered list. No explanation.',
            ].join('\n'),
          },
          {
            role: 'user',
            content: task,
          },
        ],
        stream: false,
        max_tokens: 500,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      throw new Error(`Plan API error ${res.status}`);
    }

    const data = await res.json() as {
      choices: Array<{ message: { content: string } }>;
    };

    const content = data.choices?.[0]?.message?.content || '';

    // Parse numbered list into array of steps
    const steps = content
      .split('\n')
      .map((line: string) => line.replace(/^\d+[\.\)]\s*/, '').trim())
      .filter((line: string) => line.length > 0 && !line.startsWith('#'));

    if (steps.length === 0) throw new Error('Empty plan');
    return steps;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function executeAction(action: HoloAction, input: InputProvider): Promise<void> {
  switch (action.type) {
    case 'click':
      await input.click(action.x!, action.y!);
      break;
    case 'type':
      await input.typeText(action.text!);
      break;
    case 'key':
      await input.keyPress(action.key!);
      break;
    case 'scroll':
      await input.scroll(action.direction!, action.amount);
      break;
    case 'move':
      await input.moveMouse(action.x!, action.y!);
      break;
    case 'drag':
      await input.drag(action.x!, action.y!, action.endX!, action.endY!);
      break;
    default:
      throw new Error(`Cannot execute action type: ${action.type}`);
  }
}

function formatAction(action: HoloAction): string {
  switch (action.type) {
    case 'click': return `Click (${action.x}, ${action.y})`;
    case 'type': return `Type "${action.text?.slice(0, 50)}${(action.text?.length || 0) > 50 ? '...' : ''}"`;
    case 'key': return `Press ${action.key}`;
    case 'scroll': return `Scroll ${action.direction}${action.amount ? ` ${action.amount}` : ''}`;
    case 'move': return `Move to (${action.x}, ${action.y})`;
    case 'drag': return `Drag (${action.x},${action.y}) → (${action.endX},${action.endY})`;
    case 'screenshot': return 'Capture screenshot';
    case 'done': return `Done: ${action.summary || 'completed'}`;
    default: return `Unknown: ${action.type}`;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
