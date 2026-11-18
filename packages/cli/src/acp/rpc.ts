/**
 * JSON-RPC 2.0, one message per line — how Unreal's Assistant panel (and any
 * ACP client) talks to Ava (plan 2026-11-18-unreal, Phase 2).
 *
 * Written by hand, no package: the protocol is small, Phase 0's probe spoke
 * it to his editor this way, and the official SDK changed its shape at 2.0.
 *
 * Requests are handled side by side, never in a queue: a prompt runs for
 * minutes while the panel sends cancel, and while Ava waits on the answer to
 * her own permission request.
 */

import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';

type Params = Record<string, unknown>;
type Handler = (params: Params) => unknown | Promise<unknown>;
type Id = string | number;

/** An error the other side should see, with a JSON-RPC code. */
export class RpcError extends Error {
  constructor(readonly code: number, message: string) {
    super(message);
  }
}

export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;
export const INTERNAL_ERROR = -32603;

export class JsonRpc {
  private nextId = 1;
  private readonly pending = new Map<Id, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private readonly requestHandlers = new Map<string, Handler>();
  private readonly notificationHandlers = new Map<string, Handler>();

  constructor(
    private readonly input: Readable,
    private readonly output: Writable,
    private readonly log: (line: string) => void = () => {},
  ) {}

  onRequest(method: string, handler: Handler): void {
    this.requestHandlers.set(method, handler);
  }

  onNotification(method: string, handler: Handler): void {
    this.notificationHandlers.set(method, handler);
  }

  /** Read until the other side closes the pipe. */
  start(): Promise<void> {
    return new Promise((resolve) => {
      const lines = createInterface({ input: this.input });
      lines.on('line', (line) => { if (line.trim()) this.receive(line); });
      lines.on('close', () => {
        for (const p of this.pending.values()) p.reject(new Error('The panel closed.'));
        this.pending.clear();
        resolve();
      });
    });
  }

  notify(method: string, params: Params): void {
    this.send({ jsonrpc: '2.0', method, params });
  }

  request<T = unknown>(method: string, params: Params): Promise<T> {
    const id = `ava-${this.nextId++}`;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.send({ jsonrpc: '2.0', id, method, params });
    });
  }

  private send(message: Record<string, unknown>): void {
    this.output.write(`${JSON.stringify(message)}\n`);
  }

  private receive(line: string): void {
    let m: { id?: Id; method?: string; params?: Params; result?: unknown; error?: { code: number; message: string } };
    try {
      m = JSON.parse(line);
    } catch {
      this.log(`Not JSON, ignored: ${line.slice(0, 200)}`);
      return;
    }
    // An answer to one of ours.
    if (m.method === undefined && m.id !== undefined) {
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      if (m.error) p.reject(new RpcError(m.error.code, m.error.message));
      else p.resolve(m.result);
      return;
    }
    if (!m.method) return;
    const params = (m.params ?? {}) as Params;
    if (m.id === undefined) {
      const h = this.notificationHandlers.get(m.method);
      if (h) Promise.resolve().then(() => h(params)).catch((e) => this.log(`${m.method} failed: ${e instanceof Error ? e.message : e}`));
      return;
    }
    const id = m.id;
    const h = this.requestHandlers.get(m.method);
    if (!h) {
      this.send({ jsonrpc: '2.0', id, error: { code: METHOD_NOT_FOUND, message: `Ava doesn't handle ${m.method}.` } });
      return;
    }
    Promise.resolve()
      .then(() => h(params))
      .then(
        (result) => this.send({ jsonrpc: '2.0', id, result: result ?? {} }),
        (e: unknown) => {
          const code = e instanceof RpcError ? e.code : INTERNAL_ERROR;
          const message = e instanceof Error ? e.message : String(e);
          this.log(`${m.method} failed: ${message}`);
          this.send({ jsonrpc: '2.0', id, error: { code, message } });
        },
      );
  }
}
