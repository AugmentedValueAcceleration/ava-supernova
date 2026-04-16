// ─── Remote Pairing Protocol Schema ────────────────────────────────────────
//
// Message types for Supabase Realtime broadcast between the IDE (desktop)
// and the companion app (mobile). Every message over the wire is one of
// the discriminated union members below.
//
// Channel: `ava:remote:{user_id}` — RLS enforces JWT subject matches user_id.
// Transport: JSON over Supabase Realtime broadcast. Latency ~100-200ms.
//
// Both surfaces import from this file — it's the single source of truth.
// If you add a message type here, both surfaces need a handler or they'll
// silently drop it (which is fine during rollout, but log it).

import type { ProposedAction } from '../desktop/types.js';

// ── Common fields ─────────────────────────────────────────────────────────

interface BaseMessage {
  /** ISO timestamp when the message was created */
  ts: string;
  /** Sender surface */
  from: 'desktop' | 'companion';
}

// ── Session lifecycle ─────────────────────────────────────────────────────

export type DesktopCapability =
  | 'desktop_mode'
  | 'creative_studio'
  | 'memory_sync'
  | 'browser_control';

export interface SessionRegister extends BaseMessage {
  type: 'session.register';
  from: 'desktop';
  sessionId: string;
  deviceName: string;
  platform: 'windows' | 'macos' | 'linux';
  version: string;
  capabilities: DesktopCapability[];
  trayMode: boolean;
}

export interface SessionHeartbeat extends BaseMessage {
  type: 'session.heartbeat';
  from: 'desktop';
  sessionId: string;
  /** Current desktop state — lets companion show live status */
  state: 'idle' | 'trajectory_active' | 'awaiting_approval' | 'paused';
}

export interface SessionEnd extends BaseMessage {
  type: 'session.end';
  from: 'desktop';
  sessionId: string;
  reason: 'quit' | 'crash' | 'timeout';
}

// ── Pairing ───────────────────────────────────────────────────────────────

export interface PairRequest extends BaseMessage {
  type: 'pair.request';
  from: 'companion';
  /** Device fingerprint for the companion — remembered after first grant */
  deviceFingerprint: string;
  deviceName: string;
}

export interface PairGrant extends BaseMessage {
  type: 'pair.grant';
  from: 'desktop';
  sessionId: string;
  /** Session-scoped token for this pairing — expires on session end */
  pairToken: string;
}

export interface PairDeny extends BaseMessage {
  type: 'pair.deny';
  from: 'desktop';
  reason: 'user_declined' | 'session_busy' | 'unknown_device';
}

export interface PairTakeback extends BaseMessage {
  type: 'pair.takeback';
  from: 'desktop';
  sessionId: string;
}

// ── Trajectory streaming ──────────────────────────────────────────────────

export interface TrajStep extends BaseMessage {
  type: 'traj.step';
  from: 'desktop';
  sessionId: string;
  stepNumber: number;
  /** Narrator's one-line summary */
  narratorLine: string;
  /** Condensed persona outputs — full audit lives on desktop, not broadcast */
  personas: {
    scout: { confidence: string; elementCount: number };
    planner: { kind: string; target?: string; riskClass: string };
    actor: { ok: boolean; latencyMs: number };
    verifier: { status: string; detail: string };
  };
  /** Budget header — "Step 7/30 · 82K / 500K tokens · 01:14" */
  budgetHeader: string;
}

export interface TrajIntent extends BaseMessage {
  type: 'traj.intent';
  from: 'companion';
  /** The user's message / command from the companion chat box */
  text: string;
}

// ── Approval ──────────────────────────────────────────────────────────────

export interface ApprovalRequest extends BaseMessage {
  type: 'approval.request';
  from: 'desktop';
  /** Unique nonce for this approval — prevents replay */
  nonce: string;
  sessionId: string;
  stepNumber: number;
  /** The action that needs approval */
  action: ProposedAction;
  /** Human-readable summary of what will happen */
  summary: string;
  /** Whether this action is reversible */
  reversible: boolean;
  /** Timeout in ms — if no response, falls back to desktop user */
  timeoutMs: number;
}

export interface ApprovalResponse extends BaseMessage {
  type: 'approval.response';
  from: 'companion' | 'desktop';
  nonce: string;
  approved: boolean;
  /** User's reason for rejecting (optional) */
  reason?: string;
  /** Edited action params if user chose "Edit first" */
  editedParams?: Record<string, unknown>;
}

// ── Kill ──────────────────────────────────────────────────────────────────

export interface KillMessage extends BaseMessage {
  type: 'kill';
  from: 'desktop' | 'companion';
  sessionId: string;
  /** Which kill level — matches the three-layer spec */
  level: 'pause' | 'stop' | 'panic';
}

// ── Notifications ─────────────────────────────────────────────────────────

export interface NotifyMessage extends BaseMessage {
  type: 'notify';
  from: 'desktop';
  sessionId: string;
  /** Notification title */
  title: string;
  /** Notification body */
  body: string;
  /** Severity for display styling */
  severity: 'info' | 'warning' | 'critical';
  /** Pre-filled suggested intent — one-tap pair + action */
  suggestedIntent?: string;
}

// ── Discriminated union ───────────────────────────────────────────────────

export type RemoteMessage =
  | SessionRegister
  | SessionHeartbeat
  | SessionEnd
  | PairRequest
  | PairGrant
  | PairDeny
  | PairTakeback
  | TrajStep
  | TrajIntent
  | ApprovalRequest
  | ApprovalResponse
  | KillMessage
  | NotifyMessage;

/** All valid message type strings — useful for exhaustive switch checks. */
export type RemoteMessageType = RemoteMessage['type'];

// ── Channel helpers ───────────────────────────────────────────────────────

/** Build the Supabase Realtime channel name for a user. */
export function channelName(userId: string): string {
  return `ava:remote:${userId}`;
}

/** Heartbeat interval in ms (spec: 20s). */
export const HEARTBEAT_INTERVAL_MS = 20_000;

/** Session timeout if no heartbeat received (spec: 60s). */
export const SESSION_TIMEOUT_MS = 60_000;

/** Approval request timeout before fallback to desktop (spec: 15s). */
export const APPROVAL_FALLBACK_TIMEOUT_MS = 15_000;

/** Short reconnect window — messages queue and replay (spec: 30s). */
export const RECONNECT_SHORT_MS = 30_000;
