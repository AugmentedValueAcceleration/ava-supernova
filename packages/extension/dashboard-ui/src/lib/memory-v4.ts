// The extension's plumbing for the shared Memory page (MemoryV4Page): each
// request goes to the host as one `memory_v4` message and resolves when its
// `memory_v4_result` comes back. The host runs core's memoryPage().

import { post } from '../vscode';

let next = 0;
const waiting = new Map<string, (result: unknown) => void>();
let listening = false;

function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener('message', (e: MessageEvent) => {
    const m = e.data as { type?: string; requestId?: string; result?: unknown } | undefined;
    if (m?.type !== 'memory_v4_result' || !m.requestId) return;
    const resolve = waiting.get(m.requestId);
    if (!resolve) return;
    waiting.delete(m.requestId);
    resolve(m.result);
  });
}

export function memoryRequest(op: string, args: Record<string, unknown> = {}): Promise<unknown> {
  listen();
  const requestId = `mem-${Date.now()}-${next++}`;
  return new Promise((resolve, reject) => {
    waiting.set(requestId, resolve);
    // A host that never answers must not leave the page spinning forever.
    setTimeout(() => {
      if (waiting.delete(requestId)) reject(new Error('Memory did not answer.'));
    }, 20_000);
    post({ type: 'memory_v4', requestId, op, args } as never);
  });
}
