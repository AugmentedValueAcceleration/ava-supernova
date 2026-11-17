// The extension's plumbing for the shared Brainstorm room (BrainstormRoom):
// each request goes to the host as one `brainstorm_page` message and resolves when its
// `brainstorm_page_result` comes back. The host runs core's brainstormPage().

import { post } from '../vscode';

let next = 0;
const waiting = new Map<string, { resolve: (r: unknown) => void; reject: (e: Error) => void }>();
let listening = false;

function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener('message', (e: MessageEvent) => {
    const m = e.data as { type?: string; requestId?: string; result?: unknown } | undefined;
    if (m?.type !== 'brainstorm_page_result' || !m.requestId) return;
    const w = waiting.get(m.requestId);
    if (!w) return;
    waiting.delete(m.requestId);
    const r = m.result as { ok?: boolean; error?: string } | undefined;
    if (r && r.ok === false && typeof r.error === 'string') w.reject(new Error(r.error));
    else w.resolve(m.result);
  });
}

export function brainstormRequest(op: string, args: Record<string, unknown> = {}): Promise<unknown> {
  listen();
  const requestId = `bs-${Date.now()}-${next++}`;
  return new Promise((resolve, reject) => {
    waiting.set(requestId, { resolve, reject });
    // A host that never answers must not leave the page spinning forever.
    setTimeout(() => {
      if (waiting.delete(requestId)) reject(new Error('Your brainstorms did not answer.'));
    }, 90_000);
    post({ type: 'brainstorm_page', requestId, op, args } as never);
  });
}
