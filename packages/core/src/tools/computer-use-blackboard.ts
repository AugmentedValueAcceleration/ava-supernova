/**
 * Task Blackboard — Shared state for computer use sessions.
 *
 * Tracks everything the agent has done, what's on screen, and what's next.
 * Feeds into Qwen (replanning), Holo3 (vision context), and direct execution.
 * Implements the shared blackboard pattern from UFO2 research.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type StepStatus = 'pending' | 'executing' | 'done' | 'failed' | 'skipped';
export type AgentState = 'planning' | 'executing' | 'validating' | 'replanning' | 'finished' | 'failed';

export interface StepRecord {
  instruction: string;
  status: StepStatus;
  action?: string;      // What action was taken (e.g. "Press Win+R", "Click (450, 320)")
  result?: string;      // What happened (e.g. "Run dialog opened", "Notepad launched")
  error?: string;       // Error if failed
  timestamp?: number;
  durationMs?: number;
  method?: 'direct' | 'uia' | 'holo3'; // How it was executed
}

export interface WindowInfo {
  name: string;
  app: string;
}

export interface ScreenState {
  activeWindow: WindowInfo | null;
  previousWindow: WindowInfo | null;
  /** Classified screen state */
  classification: string;
  /** UI elements visible (from UIA) */
  visibleElements: string[];
  /** Whether the active app has existing content */
  hasExistingContent: boolean;
  /** Where the cursor/focus is */
  focusLocation: string;
}

export interface TaskBlackboard {
  // ── Task ──
  task: string;
  targetApp?: string;
  agentState: AgentState;

  // ── Plan ──
  originalPlan: string[];
  currentPlan: string[];
  currentStepIndex: number;

  // ── Step History ──
  steps: StepRecord[];

  // ── Screen State ──
  screen: ScreenState;

  // ── Error Tracking ──
  consecutiveFailures: number;
  totalFailures: number;
  maxConsecutiveFailures: number;
  replanCount: number;
  maxReplans: number;

  // ── Timing ──
  startTime: number;
  lastStepTime: number;
  totalActions: number;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createBlackboard(task: string, plan: string[], targetApp?: string): TaskBlackboard {
  return {
    task,
    targetApp,
    agentState: 'executing',
    originalPlan: [...plan],
    currentPlan: [...plan],
    currentStepIndex: 0,
    steps: plan.map(instruction => ({
      instruction,
      status: 'pending' as StepStatus,
    })),
    screen: {
      activeWindow: null,
      previousWindow: null,
      classification: 'unknown',
      visibleElements: [],
      hasExistingContent: false,
      focusLocation: 'unknown',
    },
    consecutiveFailures: 0,
    totalFailures: 0,
    maxConsecutiveFailures: 3,
    maxReplans: 2,
    replanCount: 0,
    startTime: Date.now(),
    lastStepTime: Date.now(),
    totalActions: 0,
  };
}

// ─── State Updates ────────────────────────────────────────────────────────────

/** Mark the current step as executing */
export function beginStep(bb: TaskBlackboard): StepRecord | null {
  if (bb.currentStepIndex >= bb.steps.length) return null;
  const step = bb.steps[bb.currentStepIndex];
  step.status = 'executing';
  step.timestamp = Date.now();
  bb.lastStepTime = Date.now();
  bb.agentState = 'executing';
  return step;
}

/** Mark the current step as done and advance */
export function completeStep(bb: TaskBlackboard, action: string, result: string, method: 'direct' | 'uia' | 'holo3'): void {
  const step = bb.steps[bb.currentStepIndex];
  step.status = 'done';
  step.action = action;
  step.result = result;
  step.method = method;
  step.durationMs = Date.now() - (step.timestamp || Date.now());
  bb.currentStepIndex++;
  bb.consecutiveFailures = 0;
  bb.totalActions++;
  bb.lastStepTime = Date.now();

  if (bb.currentStepIndex >= bb.steps.length) {
    bb.agentState = 'finished';
  }
}

/** Mark the current step as failed */
export function failStep(bb: TaskBlackboard, error: string): void {
  const step = bb.steps[bb.currentStepIndex];
  step.status = 'failed';
  step.error = error;
  step.durationMs = Date.now() - (step.timestamp || Date.now());
  bb.consecutiveFailures++;
  bb.totalFailures++;
  bb.totalActions++;
  bb.lastStepTime = Date.now();

  if (bb.consecutiveFailures >= bb.maxConsecutiveFailures) {
    bb.agentState = 'failed';
  }
}

/** Skip the current step */
export function skipStep(bb: TaskBlackboard, reason: string): void {
  const step = bb.steps[bb.currentStepIndex];
  step.status = 'skipped';
  step.result = reason;
  bb.currentStepIndex++;
  bb.lastStepTime = Date.now();

  if (bb.currentStepIndex >= bb.steps.length) {
    bb.agentState = 'finished';
  }
}

/** Update screen state from UIA and window info */
export function updateScreenState(
  bb: TaskBlackboard,
  activeWindow?: WindowInfo | null,
  visibleElements?: string[],
): void {
  if (activeWindow) {
    if (bb.screen.activeWindow?.name !== activeWindow.name) {
      bb.screen.previousWindow = bb.screen.activeWindow;
    }
    bb.screen.activeWindow = activeWindow;
  }
  if (visibleElements) {
    bb.screen.visibleElements = visibleElements;
  }

  // Classify screen state based on active window
  const name = bb.screen.activeWindow?.name?.toLowerCase() || '';
  const app = bb.screen.activeWindow?.app?.toLowerCase() || '';

  if (name.includes('run') || name.includes('open')) {
    bb.screen.classification = 'run_dialog';
  } else if (app.includes('notepad')) {
    bb.screen.classification = name.includes('untitled') ? 'notepad_empty' : 'notepad_with_content';
    bb.screen.hasExistingContent = !name.includes('untitled');
    bb.screen.focusLocation = 'text_area';
  } else if (app.includes('explorer')) {
    bb.screen.classification = 'file_explorer';
  } else if (app.includes('chrome') || app.includes('edge') || app.includes('firefox')) {
    bb.screen.classification = 'browser';
  } else if (app.includes('code') || app.includes('vscode')) {
    bb.screen.classification = 'vscode';
  } else if (app.includes('blender')) {
    bb.screen.classification = 'blender';
  } else if (name.includes('start') || name.includes('search')) {
    bb.screen.classification = 'start_menu';
  } else {
    bb.screen.classification = 'desktop';
  }
}

/** Apply a new plan (after replanning) */
export function replan(bb: TaskBlackboard, newSteps: string[]): void {
  // Keep completed steps, replace remaining with new plan
  const completed = bb.steps.filter(s => s.status === 'done' || s.status === 'skipped');
  bb.currentPlan = newSteps;
  bb.steps = [
    ...completed,
    ...newSteps.map(instruction => ({
      instruction,
      status: 'pending' as StepStatus,
    })),
  ];
  bb.currentStepIndex = completed.length;
  bb.consecutiveFailures = 0;
  bb.replanCount++;
  bb.agentState = 'executing';
}

// ─── Serialisation ────────────────────────────────────────────────────────────

/** Compact summary for Holo3 context (keep it short — Holo3 is a small model) */
export function toHoloContext(bb: TaskBlackboard): string {
  const completed = bb.steps
    .filter(s => s.status === 'done')
    .map(s => `✓ ${s.instruction}`)
    .join('\n');

  const current = bb.currentStepIndex < bb.steps.length
    ? `→ ${bb.steps[bb.currentStepIndex].instruction}`
    : '→ All steps done';

  const screen = bb.screen.activeWindow
    ? `Active: "${bb.screen.activeWindow.name}" (${bb.screen.classification})`
    : 'Active: Desktop';

  return [
    `Task: ${bb.task}`,
    completed,
    current,
    screen,
    bb.screen.hasExistingContent ? 'WARNING: App has existing content' : '',
  ].filter(Boolean).join('\n');
}

/** Detailed summary for Qwen replanning */
export function toPlannerContext(bb: TaskBlackboard): string {
  const stepLog = bb.steps.map((s, i) => {
    const status = s.status === 'done' ? '✓' : s.status === 'failed' ? '✗' : s.status === 'skipped' ? '⊘' : '○';
    const detail = s.error ? ` (ERROR: ${s.error})` : s.result ? ` → ${s.result}` : '';
    return `${status} ${i + 1}. ${s.instruction}${detail}`;
  }).join('\n');

  return [
    `Task: ${bb.task}`,
    `State: ${bb.agentState}`,
    `Screen: ${bb.screen.classification} — Active: "${bb.screen.activeWindow?.name || 'unknown'}"`,
    `Elements: ${bb.screen.visibleElements.slice(0, 10).join(', ') || 'none detected'}`,
    `Content: ${bb.screen.hasExistingContent ? 'YES — needs clearing' : 'empty'}`,
    '',
    'Steps:',
    stepLog,
    '',
    `Failures: ${bb.totalFailures} total, ${bb.consecutiveFailures} consecutive`,
    `Elapsed: ${((Date.now() - bb.startTime) / 1000).toFixed(1)}s`,
  ].join('\n');
}

/** Summary for the final result */
export function toResultSummary(bb: TaskBlackboard): string {
  const completed = bb.steps.filter(s => s.status === 'done').length;
  const failed = bb.steps.filter(s => s.status === 'failed').length;
  const total = bb.steps.length;
  const elapsed = ((Date.now() - bb.startTime) / 1000).toFixed(1);

  const methods = bb.steps
    .filter(s => s.method)
    .reduce((acc, s) => {
      acc[s.method!] = (acc[s.method!] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  const methodStr = Object.entries(methods)
    .map(([m, c]) => `${m}: ${c}`)
    .join(', ');

  return [
    `**Result:** ${bb.agentState === 'finished' ? 'Success' : 'Failed'}`,
    `**Steps:** ${completed}/${total} completed${failed > 0 ? `, ${failed} failed` : ''}`,
    `**Time:** ${elapsed}s`,
    `**Methods:** ${methodStr || 'none'}`,
    bb.replanCount > 0 ? `**Replans:** ${bb.replanCount}` : '',
    '',
    '**Plan:**',
    ...bb.steps.map((s, i) => {
      const icon = s.status === 'done' ? '✓' : s.status === 'failed' ? '✗' : s.status === 'skipped' ? '⊘' : '○';
      return `${icon} ${i + 1}. ${s.instruction}${s.method ? ` [${s.method}]` : ''}`;
    }),
  ].filter(Boolean).join('\n');
}
