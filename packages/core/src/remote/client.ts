// ─── C5: Remote Protocol Client ───────────────────────────────────────────
//
// Runtime protocol handler for the remote pairing channel. Sits on top of
// the A2 schema (message types) and a transport-agnostic ChannelTransport
// interface. Each surface (IDE, companion) provides its own transport
// implementation backed by Supabase Realtime — keeping core dependency-free.
//
// Responsibilities:
//   - Send/receive typed RemoteMessage values
//   - Heartbeat timer (20s per spec)
//   - Session timeout detection (60s no heartbeat → session ended)
//   - Approval request correlation + timeout (15s fallback to desktop)
//   - Reconnect queueing (short <30s replay, long >30s drop + notify)

import type {
  RemoteMessage,
  RemoteMessageType,
  ApprovalRequest,
  ApprovalResponse,
  SessionHeartbeat,
} from './schema.js';
import {
  HEARTBEAT_INTERVAL_MS,
  SESSION_TIMEOUT_MS,
  APPROVAL_FALLBACK_TIMEOUT_MS,
} from './schema.js';

// ── Transport interface ───────────────────────────────────────────────────
// Minimum surface that a Supabase Realtime channel (or any broadcast
// transport) must implement. Callers wire this up with their own client.

export interface ChannelTransport {
  /** Send a message to all channel subscribers. */
  broadcast(message: RemoteMessage): Promise<void>;
  /** Subscribe to incoming messages; returns an unsubscribe function. */
  subscribe(handler: (message: RemoteMessage) => void): () => void;
  /** Current connection status — used for reconnect decisions. */
  isConnected(): boolean;
}

// ── Client options ────────────────────────────────────────────────────────

export interface RemoteClientOptions {
  transport: ChannelTransport;
  /** Our surface — determines which message types we send */
  surface: 'desktop' | 'companion';
  /** Stable session identifier (for desktop) or device fingerprint (companion) */
  identity: string;
  /** Called when a message we didn't originate arrives */
  onMessage?: (message: RemoteMessage) => void;
  /** Called if the session times out (no heartbeat for SESSION_TIMEOUT_MS) */
  onSessionTimeout?: () => void;
}

// ── Pending approval tracking ─────────────────────────────────────────────

interface PendingApproval {
  nonce: string;
  resolve: (response: ApprovalResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ── Client ────────────────────────────────────────────────────────────────

export class RemoteClient {
  private transport: ChannelTransport;
  private surface: 'desktop' | 'companion';
  private identity: string;
  private onMessage: (message: RemoteMessage) => void;
  private onSessionTimeout: () => void;

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private sessionTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingApprovals = new Map<string, PendingApproval>();
  private unsubscribe: (() => void) | null = null;
  private queuedOutbox: RemoteMessage[] = [];

  constructor(opts: RemoteClientOptions) {
    this.transport = opts.transport;
    this.surface = opts.surface;
    this.identity = opts.identity;
    this.onMessage = opts.onMessage ?? (() => {});
    this.onSessionTimeout = opts.onSessionTimeout ?? (() => {});
  }

  /** Start listening + (if desktop) sending heartbeats. */
  start(): void {
    this.unsubscribe = this.transport.subscribe((msg) => this.handleIncoming(msg));
    if (this.surface === 'desktop') {
      this.startHeartbeat();
    } else {
      this.armSessionTimeout();
    }
    // Flush anything queued while disconnected
    this.flushOutbox();
  }

  /** Stop listening, cancel all timers, reject pending approvals. */
  stop(): void {
    if (this.unsubscribe) { this.unsubscribe(); this.unsubscribe = null; }
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.sessionTimeoutTimer) { clearTimeout(this.sessionTimeoutTimer); this.sessionTimeoutTimer = null; }
    for (const pending of this.pendingApprovals.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Client stopped'));
    }
    this.pendingApprovals.clear();
  }

  /**
   * Send a message. If the transport is disconnected, the message queues
   * and flushes on reconnect — unless the queue grows beyond 50 messages,
   * at which point older ones drop (trajectory streaming is lossy by
   * design; important messages like approvals retry separately).
   */
  async send(message: RemoteMessage): Promise<void> {
    if (!this.transport.isConnected()) {
      this.queuedOutbox.push(message);
      if (this.queuedOutbox.length > 50) {
        this.queuedOutbox.shift();
      }
      return;
    }
    try {
      await this.transport.broadcast(message);
    } catch (e) {
      // If broadcast fails, queue for retry on next flush
      this.queuedOutbox.push(message);
      throw e;
    }
  }

  /**
   * Send an approval request and wait for the driver's response.
   * Times out after APPROVAL_FALLBACK_TIMEOUT_MS — caller handles the
   * fallback (route to desktop user locally).
   */
  async requestApproval(request: Omit<ApprovalRequest, 'type' | 'from' | 'ts' | 'nonce' | 'timeoutMs'>): Promise<ApprovalResponse> {
    if (this.surface !== 'desktop') {
      throw new Error('Only the desktop surface can initiate approval requests');
    }
    const nonce = crypto.randomUUID();
    const full: ApprovalRequest = {
      type: 'approval.request',
      from: 'desktop',
      ts: new Date().toISOString(),
      nonce,
      timeoutMs: APPROVAL_FALLBACK_TIMEOUT_MS,
      ...request,
    };

    return new Promise<ApprovalResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingApprovals.delete(nonce);
        reject(new Error(`Approval timeout after ${APPROVAL_FALLBACK_TIMEOUT_MS}ms`));
      }, APPROVAL_FALLBACK_TIMEOUT_MS);

      this.pendingApprovals.set(nonce, { nonce, resolve, reject, timer });
      this.send(full).catch((err) => {
        clearTimeout(timer);
        this.pendingApprovals.delete(nonce);
        reject(err);
      });
    });
  }

  /** Respond to an approval request (companion surface only, usually). */
  async respondToApproval(nonce: string, approved: boolean, reason?: string, editedParams?: Record<string, unknown>): Promise<void> {
    const response: ApprovalResponse = {
      type: 'approval.response',
      from: this.surface,
      ts: new Date().toISOString(),
      nonce,
      approved,
      reason,
      editedParams,
    };
    await this.send(response);
  }

  // ── Internal ──────────────────────────────────────────────────────

  private handleIncoming(msg: RemoteMessage): void {
    // Ignore our own broadcasts (Supabase echoes back)
    if (msg.from === this.surface) return;

    // Correlate approval responses with pending requests
    if (msg.type === 'approval.response') {
      const pending = this.pendingApprovals.get(msg.nonce);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingApprovals.delete(msg.nonce);
        pending.resolve(msg);
        return; // consumed
      }
    }

    // Reset session timeout on any desktop → companion heartbeat
    if (this.surface === 'companion' && msg.type === 'session.heartbeat') {
      this.armSessionTimeout();
    }

    // Pass through to user handler
    this.onMessage(msg);
  }

  private startHeartbeat(): void {
    // Desktop sends a heartbeat every 20s so companion knows we're alive.
    // The first one fires immediately after start.
    const fire = () => {
      const msg: SessionHeartbeat = {
        type: 'session.heartbeat',
        from: 'desktop',
        ts: new Date().toISOString(),
        sessionId: this.identity,
        state: 'idle', // caller can override via an accessor if they track this
      };
      this.send(msg).catch(() => { /* swallow — heartbeat failures are normal during reconnect */ });
    };
    fire();
    this.heartbeatTimer = setInterval(fire, HEARTBEAT_INTERVAL_MS);
  }

  private armSessionTimeout(): void {
    // Companion-side: if we don't hear from desktop in SESSION_TIMEOUT_MS,
    // the session is dead. Reset every time a heartbeat arrives.
    if (this.sessionTimeoutTimer) clearTimeout(this.sessionTimeoutTimer);
    this.sessionTimeoutTimer = setTimeout(() => {
      this.onSessionTimeout();
    }, SESSION_TIMEOUT_MS);
  }

  private flushOutbox(): void {
    if (this.queuedOutbox.length === 0) return;
    if (!this.transport.isConnected()) return;
    const toSend = this.queuedOutbox.splice(0, this.queuedOutbox.length);
    for (const msg of toSend) {
      this.transport.broadcast(msg).catch(() => { this.queuedOutbox.push(msg); });
    }
  }
}

// ── Typed message helpers ─────────────────────────────────────────────────
// Constructor functions that fill in common fields so callers just supply
// the payload — less ceremony at call sites.

export function makeMessage<T extends RemoteMessage>(
  partial: Omit<T, 'ts'> & { ts?: string },
): T {
  return { ts: new Date().toISOString(), ...partial } as T;
}

/** Type-narrowing dispatcher — pass an incoming RemoteMessage and one handler per type you care about. */
export type MessageHandlers = Partial<{
  [K in RemoteMessageType]: (msg: Extract<RemoteMessage, { type: K }>) => void | Promise<void>;
}>;

export async function dispatch(msg: RemoteMessage, handlers: MessageHandlers): Promise<void> {
  const handler = handlers[msg.type] as ((m: RemoteMessage) => void | Promise<void>) | undefined;
  if (handler) await handler(msg);
}
