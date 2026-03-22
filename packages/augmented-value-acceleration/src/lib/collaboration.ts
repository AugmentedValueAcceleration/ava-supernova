import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface PresenceState {
  user_id: string;
  user_name: string;
  avatar_url?: string;
  status: 'online' | 'away' | 'busy';
  current_page?: string;
  last_seen: string;
}

export interface BroadcastPayload {
  type: string;
  sender_id: string;
  sender_name: string;
  data: any;
  timestamp: string;
}

/* ── Channel Management ─────────────────────────────────────────────────── */

const activeChannels: Map<string, RealtimeChannel> = new Map();

/**
 * Subscribe to a Supabase Realtime broadcast channel.
 * Returns the channel for cleanup.
 */
export function subscribeToChannel(
  channelName: string,
  onMessage: (payload: BroadcastPayload) => void
): RealtimeChannel {
  // Reuse existing channel if already subscribed
  if (activeChannels.has(channelName)) {
    return activeChannels.get(channelName)!;
  }

  const channel = supabase
    .channel(channelName)
    .on('broadcast', { event: 'message' }, ({ payload }) => {
      onMessage(payload as BroadcastPayload);
    })
    .subscribe();

  activeChannels.set(channelName, channel);
  return channel;
}

/**
 * Broadcast a message to a channel.
 */
export function broadcastToChannel(
  channelName: string,
  event: string,
  payload: Omit<BroadcastPayload, 'timestamp'>
): void {
  const channel = activeChannels.get(channelName);
  if (channel) {
    channel.send({
      type: 'broadcast',
      event,
      payload: { ...payload, timestamp: new Date().toISOString() },
    });
  }
}

/**
 * Subscribe to Supabase Realtime Postgres changes on a table.
 * Useful for real-time message inserts/updates.
 */
export function subscribeToTable(
  channelName: string,
  table: string,
  filter: string | undefined,
  onChange: (payload: any) => void
): RealtimeChannel {
  let builder = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table,
        ...(filter ? { filter } : {}),
      },
      (payload) => onChange(payload)
    );

  const channel = builder.subscribe();
  activeChannels.set(channelName, channel);
  return channel;
}

/* ── Presence ───────────────────────────────────────────────────────────── */

/**
 * Track a user's presence in a channel.
 */
export function trackPresence(
  channelName: string,
  userId: string,
  state: Omit<PresenceState, 'user_id' | 'last_seen'>
): RealtimeChannel {
  const channel = activeChannels.get(channelName) || supabase.channel(channelName);

  channel.track({
    user_id: userId,
    ...state,
    last_seen: new Date().toISOString(),
  });

  if (!activeChannels.has(channelName)) {
    channel.subscribe();
    activeChannels.set(channelName, channel);
  }

  return channel;
}

/**
 * Listen for presence changes (join, leave, sync).
 */
export function onPresenceChange(
  channelName: string,
  callbacks: {
    onJoin?: (key: string, state: PresenceState) => void;
    onLeave?: (key: string, state: PresenceState) => void;
    onSync?: (state: Record<string, PresenceState[]>) => void;
  }
): RealtimeChannel {
  const channel = activeChannels.get(channelName) || supabase.channel(channelName);

  if (callbacks.onSync) {
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      callbacks.onSync!(state as any);
    });
  }

  if (callbacks.onJoin) {
    channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
      callbacks.onJoin!(key, newPresences[0] as any);
    });
  }

  if (callbacks.onLeave) {
    channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
      callbacks.onLeave!(key, leftPresences[0] as any);
    });
  }

  if (!activeChannels.has(channelName)) {
    channel.subscribe();
    activeChannels.set(channelName, channel);
  }

  return channel;
}

/* ── Cleanup ────────────────────────────────────────────────────────────── */

/**
 * Unsubscribe from a specific channel.
 */
export function unsubscribeChannel(channelName: string): void {
  const channel = activeChannels.get(channelName);
  if (channel) {
    supabase.removeChannel(channel);
    activeChannels.delete(channelName);
  }
}

/**
 * Unsubscribe from all active channels.
 */
export function unsubscribeAll(): void {
  activeChannels.forEach((channel) => {
    supabase.removeChannel(channel);
  });
  activeChannels.clear();
}
