/**
 * Remote pairing protocol — Supabase Realtime message schema for
 * desktop ↔ companion communication during desktop automation mode.
 */

export {
  channelName,
  HEARTBEAT_INTERVAL_MS,
  SESSION_TIMEOUT_MS,
  APPROVAL_FALLBACK_TIMEOUT_MS,
  RECONNECT_SHORT_MS,
} from './schema.js';

export type {
  DesktopCapability,
  SessionRegister,
  SessionHeartbeat,
  SessionEnd,
  PairRequest,
  PairGrant,
  PairDeny,
  PairTakeback,
  TrajStep,
  TrajIntent,
  ApprovalRequest,
  ApprovalResponse,
  KillMessage,
  NotifyMessage,
  RemoteMessage,
  RemoteMessageType,
} from './schema.js';
