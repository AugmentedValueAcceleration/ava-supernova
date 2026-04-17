// ─── C2: Executor Layer ───────────────────────────────────────────────────
//
// Takes a ProposedAction that has passed the approval gate and dispatches
// it to the correct backend (Playwright for browser actions, UIA/enigo for
// native actions). Returns an ExecutionResult.
//
// The executor is deliberately dumb — it doesn't classify, approve, or
// verify. It translates the ProposedAction into a backend call and reports
// what happened. Actor persona wraps this; Verifier checks after.

import type { ProposedAction, ExecutionResult, ActionKind } from './types.js';

// ── Backend interface ─────────────────────────────────────────────────────

export interface ExecutorBackend {
  name: string;
  click(target: string): Promise<void>;
  doubleClick(target: string): Promise<void>;
  rightClick(target: string): Promise<void>;
  type(target: string, text: string): Promise<void>;
  keyPress(key: string): Promise<void>;
  scroll(direction: string, amount: number): Promise<void>;
  navigate(url: string): Promise<void>;
}

// ── Executor ──────────────────────────────────────────────────────────────

export class ExecutorLayer {
  private browserBackend: ExecutorBackend | null = null;
  private nativeBackend: ExecutorBackend | null = null;

  registerBrowser(backend: ExecutorBackend): void {
    this.browserBackend = backend;
  }

  registerNative(backend: ExecutorBackend): void {
    this.nativeBackend = backend;
  }

  async execute(action: ProposedAction, isBrowserContext: boolean): Promise<ExecutionResult> {
    const startMs = Date.now();
    const elapsed = () => Date.now() - startMs;

    // Non-physical actions handled inline
    if (action.kind === 'wait') {
      const ms = Math.min(Number(action.params?.ms ?? 1000), 5000);
      await new Promise(r => setTimeout(r, ms));
      return { ok: true, latencyMs: elapsed() };
    }

    if (action.kind === 'observe_more' || action.kind === 'stuck' || action.kind === 'done') {
      return { ok: true, latencyMs: elapsed() };
    }

    const backend = isBrowserContext ? this.browserBackend : this.nativeBackend;
    if (!backend) {
      return {
        ok: false,
        error: `No ${isBrowserContext ? 'browser' : 'native'} executor backend registered`,
        latencyMs: elapsed(),
      };
    }

    try {
      await this.dispatch(backend, action);
      return { ok: true, latencyMs: elapsed() };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        latencyMs: elapsed(),
      };
    }
  }

  private async dispatch(backend: ExecutorBackend, action: ProposedAction): Promise<void> {
    const target = action.target ?? '';
    const params = action.params ?? {};

    switch (action.kind as ActionKind) {
      case 'click':
        return backend.click(target);
      case 'double_click':
        return backend.doubleClick(target);
      case 'right_click':
        return backend.rightClick(target);
      case 'type':
        return backend.type(target, String(params.text ?? ''));
      case 'key':
        return backend.keyPress(String(params.key ?? ''));
      case 'scroll':
        return backend.scroll(String(params.direction ?? 'down'), Number(params.amount ?? 3));
      case 'navigate':
        return backend.navigate(String(params.url ?? ''));
      default:
        throw new Error(`Executor: unsupported action kind '${action.kind}'`);
    }
  }
}
