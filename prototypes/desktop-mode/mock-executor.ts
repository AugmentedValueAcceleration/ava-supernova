// Mock executor. Prints what the Actor would have done and returns a
// plausible ExecutionResult. No real clicks, no real network.

import type { ProposedAction, ExecutionResult } from './types';

export function executeAction(action: ProposedAction, step: number): ExecutionResult {
  const start = Date.now();

  // Surface the action on stderr so it doesn't interleave with the JSON trace on stdout.
  process.stderr.write(
    `  [mock-executor] step ${step}: ${action.kind}` +
      (action.target ? ` on "${action.target}"` : '') +
      (action.params ? ` params=${JSON.stringify(action.params)}` : '') +
      '\n',
  );

  // The mock always succeeds — we're not testing failure recovery here.
  // Real executor returns ok: false on element-not-found / timeout / permission-denied.
  const latencyMs = Date.now() - start;

  return {
    ok: true,
    latencyMs,
    side_effects: synthSideEffects(action),
  };
}

function synthSideEffects(action: ProposedAction): string[] {
  switch (action.kind) {
    case 'navigate':
      return [`URL changed to ${action.params?.url ?? '(unknown)'}`];
    case 'click':
      return [`Clicked element ${action.target ?? '(no target)'}`];
    case 'type':
      return [`Typed ${String(action.params?.text ?? '').length} characters`];
    case 'observe_more':
      return ['No-op — observation request'];
    case 'stuck':
      return ['Trajectory paused — stuck state'];
    case 'done':
      return ['Task complete'];
    default:
      return [];
  }
}
