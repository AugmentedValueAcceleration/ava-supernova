import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import PageHeader from '../components/PageHeader';
import { theme } from '../lib/theme';
import {
  subscribeToTable,
  trackPresence,
  onPresenceChange,
  unsubscribeChannel,
} from '../lib/collaboration';
import type { PresenceState } from '../lib/collaboration';

/* ── Types ──────────────────────────────────────────────────────────────── */

interface Channel {
  id: string;
  name: string;
  description?: string;
  created_at: string;
}

interface Message {
  id: string;
  channel_id: string;
  sender_name: string;
  sender_avatar?: string;
  content: string;
  parent_id: string | null;
  pinned: boolean;
  created_at: string;
}

/* ── Component ──────────────────────────────────────────────────────────── */

export default function Communication() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [channelName, setChannelName] = useState('');
  const [channelDesc, setChannelDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<PresenceState[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  /* ── Fetch Channels ────────────────────────────────────────────────── */

  const fetchChannels = async () => {
    const { data: channelData } = await supabase.from('business_channels').select('*').order('name');

    if (channelData && channelData.length > 0) {
      setChannels(channelData);
      if (!activeChannel && channelData.length > 0) {
        setActiveChannel(channelData[0].id);
      }
    } else {
      // Derive channels from messages or use defaults
      const { data } = await supabase.from('business_messages')
        .select('channel_id')
        .order('created_at', { ascending: false });

      const channelIds = [...new Set((data || []).map((m: any) => m.channel_id).filter(Boolean))];
      const derived: Channel[] = channelIds.map((id: string) => ({
        id,
        name: id,
        created_at: new Date().toISOString(),
      }));

      if (derived.length === 0) {
        derived.push(
          { id: 'general', name: 'general', created_at: new Date().toISOString() },
          { id: 'projects', name: 'projects', created_at: new Date().toISOString() },
          { id: 'random', name: 'random', created_at: new Date().toISOString() },
        );
      }
      setChannels(derived);
      if (!activeChannel) {
        setActiveChannel(derived[0]?.id || 'general');
      }
    }
  };

  /* ── Fetch Messages ────────────────────────────────────────────────── */

  const fetchMessages = useCallback(async () => {
    if (!activeChannel) return;
    const { data } = await supabase.from('business_messages')
      .select('*')
      .eq('channel_id', activeChannel)
      .order('created_at', { ascending: true });
    setMessages(data || []);
    setLoading(false);
  }, [activeChannel]);

  /* ── Init ──────────────────────────────────────────────────────────── */

  useEffect(() => {
    fetchChannels();
  }, []);

  useEffect(() => {
    if (activeChannel) {
      setLoading(true);
      fetchMessages();
    }
  }, [activeChannel, fetchMessages]);

  /* ── Supabase Realtime (replaces polling) ───────────────────────────── */

  useEffect(() => {
    if (!activeChannel) return;

    const realtimeChannel = `messages-${activeChannel}`;

    // Subscribe to real-time inserts/updates/deletes on business_messages
    subscribeToTable(
      realtimeChannel,
      'business_messages',
      `channel_id=eq.${activeChannel}`,
      (payload) => {
        if (payload.eventType === 'INSERT') {
          setMessages(prev => [...prev, payload.new as Message]);
        } else if (payload.eventType === 'UPDATE') {
          setMessages(prev => prev.map(m => m.id === payload.new.id ? (payload.new as Message) : m));
        } else if (payload.eventType === 'DELETE') {
          setMessages(prev => prev.filter(m => m.id !== payload.old.id));
        }
      }
    );

    return () => {
      unsubscribeChannel(realtimeChannel);
    };
  }, [activeChannel]);

  /* ── Presence Tracking ──────────────────────────────────────────────── */

  useEffect(() => {
    const presenceChannel = 'communication-presence';

    // Track current user
    trackPresence(presenceChannel, 'admin', {
      user_name: 'Admin',
      status: 'online',
      current_page: 'communication',
    });

    // Listen for presence changes
    onPresenceChange(presenceChannel, {
      onSync: (state) => {
        const users: PresenceState[] = [];
        Object.values(state).forEach((presences: any[]) => {
          presences.forEach((p: any) => {
            users.push(p as PresenceState);
          });
        });
        setOnlineUsers(users);
      },
    });

    return () => {
      unsubscribeChannel(presenceChannel);
    };
  }, []);

  /* ── Auto scroll ───────────────────────────────────────────────────── */

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /* ── Send Message ──────────────────────────────────────────────────── */

  const handleSend = async () => {
    if (!newMessage.trim() || !activeChannel) return;
    setSaving(true);
    await supabase.from('business_messages').insert({
      channel_id: activeChannel,
      sender_name: 'Admin',
      content: newMessage.trim(),
      parent_id: replyTo || null,
      pinned: false,
    });
    setNewMessage('');
    setReplyTo(null);
    setSaving(false);
    // No manual fetch needed — Realtime will push the new message
  };

  /* ── Pin/Unpin ─────────────────────────────────────────────────────── */

  const togglePin = async (msg: Message) => {
    await supabase.from('business_messages').update({ pinned: !msg.pinned }).eq('id', msg.id);
    // Realtime will handle the update
  };

  /* ── Create Channel ────────────────────────────────────────────────── */

  const handleCreateChannel = async () => {
    if (!channelName.trim()) return;
    setSaving(true);
    const id = channelName.trim().toLowerCase().replace(/\s+/g, '-');

    await supabase.from('business_channels').insert({
      id,
      name: channelName.trim(),
      description: channelDesc.trim() || null,
    });

    setChannelName('');
    setChannelDesc('');
    setShowCreateChannel(false);
    setSaving(false);
    await fetchChannels();
    setActiveChannel(id);
  };

  /* ── Delete Message ────────────────────────────────────────────────── */

  const handleDelete = async (id: string) => {
    await supabase.from('business_messages').delete().eq('id', id);
    // Realtime will handle the removal
  };

  /* ── Derived ───────────────────────────────────────────────────────── */

  const topMessages = messages.filter(m => !m.parent_id);
  const getReplies = (parentId: string) => messages.filter(m => m.parent_id === parentId);
  const pinnedMessages = messages.filter(m => m.pinned);

  function getInitials(name: string): string {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }

  function formatTime(dateStr: string): string {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', background: theme.inputBg, border: '1px solid #1f1f3a',
    borderRadius: 10, color: theme.text, fontSize: 14, outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: theme.pageBg }}>
      <div style={{ padding: '24px 28px 0', flexShrink: 0 }}>
        <PageHeader title="Communication" subtitle="Team messaging and channels" onRefresh={fetchMessages} />
      </div>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Sidebar — Channels */}
      <div style={{
        width: 240, borderRight: '1px solid #1f1f3a', display: 'flex', flexDirection: 'column',
        background: theme.surfaceBg, flexShrink: 0,
      }}>
        <div style={{ padding: '24px 20px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: theme.text, margin: 0 }}>Channels</h2>
          <button onClick={() => setShowCreateChannel(true)} style={{
            width: 28, height: 28, borderRadius: 8, background: theme.border, border: 'none',
            color: theme.accent, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>+</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px' }}>
          {channels.map(ch => (
            <button key={ch.id} onClick={() => setActiveChannel(ch.id)} style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px',
              borderRadius: 8, border: 'none', cursor: 'pointer', marginBottom: 4,
              background: activeChannel === ch.id ? '#a855f715' : 'transparent',
              color: activeChannel === ch.id ? theme.accent : theme.textSecondary,
              fontSize: 13, fontWeight: activeChannel === ch.id ? 600 : 400, textAlign: 'left',
            }}>
              <span style={{ color: theme.textMuted }}>#</span>
              <span>{ch.name}</span>
            </button>
          ))}
        </div>

        {/* Online Users — Presence */}
        {onlineUsers.length > 0 && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid #1f1f3a' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10 }}>
              Online — {onlineUsers.length}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {onlineUsers.map((u, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ position: 'relative' }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%', background: theme.border,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, fontWeight: 700, color: theme.accent,
                    }}>{getInitials(u.user_name || 'U')}</div>
                    <div style={{
                      position: 'absolute', bottom: -1, right: -1,
                      width: 8, height: 8, borderRadius: '50%',
                      background: u.status === 'online' ? '#22c55e' : u.status === 'away' ? '#f59e0b' : '#ef4444',
                      border: '2px solid #0d0d22',
                    }} />
                  </div>
                  <span style={{ fontSize: 12, color: theme.textSecondary }}>{u.user_name || 'Unknown'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Channel Header */}
        <div style={{ padding: '16px 28px', borderBottom: '1px solid #1f1f3a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: theme.text, margin: 0 }}>
              # {channels.find(c => c.id === activeChannel)?.name || activeChannel || 'general'}
            </h2>
            <p style={{ fontSize: 12, color: theme.textMuted, margin: '2px 0 0' }}>
              {messages.length} messages{pinnedMessages.length > 0 ? ` · ${pinnedMessages.length} pinned` : ''}
              {onlineUsers.length > 0 && (
                <span style={{ marginLeft: 8 }}>
                  <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#22c55e', marginRight: 4, verticalAlign: 'middle' }} />
                  {onlineUsers.length} online
                </span>
              )}
            </p>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px',
            background: theme.cardBg, borderRadius: 8, border: '1px solid #1f1f3a',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
            <span style={{ fontSize: 11, color: theme.textMuted }}>Live</span>
          </div>
        </div>

        {/* Pinned Banner */}
        {pinnedMessages.length > 0 && (
          <div style={{ padding: '8px 28px', background: theme.inputBg, borderBottom: '1px solid #1f1f3a' }}>
            <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600, marginBottom: 4 }}>Pinned Messages</div>
            {pinnedMessages.slice(0, 3).map(pm => (
              <div key={pm.id} style={{ fontSize: 12, color: theme.textSecondary, padding: '2px 0' }}>
                <span style={{ fontWeight: 600, color: theme.text }}>{pm.sender_name}:</span> {pm.content.slice(0, 80)}{pm.content.length > 80 ? '...' : ''}
              </div>
            ))}
          </div>
        )}

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
          {loading && <div style={{ textAlign: 'center', color: theme.textMuted, padding: 60 }}>Loading messages...</div>}

          {!loading && topMessages.length === 0 && (
            <div style={{ textAlign: 'center', padding: 80, color: theme.textMuted }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16 }}>
                <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <div style={{ fontSize: 16, fontWeight: 600, color: theme.textSecondary, marginBottom: 8 }}>No messages yet</div>
              <div style={{ fontSize: 14 }}>Start the conversation!</div>
            </div>
          )}

          {topMessages.map(msg => {
            const replies = getReplies(msg.id);
            return (
              <div key={msg.id} style={{ marginBottom: 4 }}>
                {/* Main message */}
                <div style={{
                  display: 'flex', gap: 12, padding: '10px 12px', borderRadius: 8,
                  transition: 'background 0.15s',
                }}
                  onMouseOver={e => e.currentTarget.style.background = theme.cardBg}
                  onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                >
                  {/* Avatar */}
                  {msg.sender_avatar ? (
                    <img src={msg.sender_avatar} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%', background: theme.border,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 700, color: theme.accent,
                      }}>{getInitials(msg.sender_name)}</div>
                      {/* Presence dot */}
                      {onlineUsers.some(u => u.user_name === msg.sender_name) && (
                        <div style={{
                          position: 'absolute', bottom: 0, right: 0,
                          width: 10, height: 10, borderRadius: '50%',
                          background: '#22c55e', border: '2px solid #0a0a1a',
                        }} />
                      )}
                    </div>
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>{msg.sender_name}</span>
                      <span style={{ fontSize: 11, color: theme.textMuted }}>{formatTime(msg.created_at)}</span>
                      {msg.pinned && <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600 }}>Pinned</span>}
                    </div>
                    <div style={{ fontSize: 14, color: '#d1d5db', lineHeight: 1.5, wordBreak: 'break-word' }}>{msg.content}</div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <button onClick={() => setReplyTo(msg.id)} style={{
                        background: 'none', border: 'none', color: theme.textMuted, fontSize: 11, cursor: 'pointer', padding: 0,
                      }}>Reply{replies.length > 0 ? ` (${replies.length})` : ''}</button>
                      <button onClick={() => togglePin(msg)} style={{
                        background: 'none', border: 'none', color: theme.textMuted, fontSize: 11, cursor: 'pointer', padding: 0,
                      }}>{msg.pinned ? 'Unpin' : 'Pin'}</button>
                      <button onClick={() => handleDelete(msg.id)} style={{
                        background: 'none', border: 'none', color: theme.textMuted, fontSize: 11, cursor: 'pointer', padding: 0,
                      }}>Delete</button>
                    </div>
                  </div>
                </div>

                {/* Replies */}
                {replies.length > 0 && (
                  <div style={{ marginLeft: 48, borderLeft: '2px solid #1f1f3a', paddingLeft: 16 }}>
                    {replies.map(reply => (
                      <div key={reply.id} style={{
                        display: 'flex', gap: 10, padding: '6px 8px', borderRadius: 6,
                      }}
                        onMouseOver={e => e.currentTarget.style.background = theme.surfaceBg}
                        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%', background: theme.border,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 700, color: theme.accent, flexShrink: 0,
                        }}>{getInitials(reply.sender_name)}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{reply.sender_name}</span>
                            <span style={{ fontSize: 10, color: theme.textMuted }}>{formatTime(reply.created_at)}</span>
                          </div>
                          <div style={{ fontSize: 13, color: '#d1d5db', lineHeight: 1.4 }}>{reply.content}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Reply indicator */}
        {replyTo && (
          <div style={{ padding: '8px 28px', background: theme.inputBg, borderTop: '1px solid #1f1f3a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: theme.textSecondary }}>
              Replying to <span style={{ color: theme.accent, fontWeight: 600 }}>{messages.find(m => m.id === replyTo)?.sender_name || '...'}</span>
            </span>
            <button onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: 14 }}>x</button>
          </div>
        )}

        {/* Input Bar */}
        <div style={{ padding: '16px 28px', borderTop: '1px solid #1f1f3a', display: 'flex', gap: 12 }}>
          <input
            style={{ ...inputStyle, flex: 1 }}
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={`Message #${channels.find(c => c.id === activeChannel)?.name || 'general'}...`}
          />
          <button onClick={handleSend} disabled={saving || !newMessage.trim()} style={{
            padding: '10px 24px', background: theme.accent, color: theme.text, border: 'none',
            borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer',
            opacity: saving || !newMessage.trim() ? 0.5 : 1, flexShrink: 0,
          }}>{saving ? '...' : 'Send'}</button>
        </div>
      </div>

      </div>

      {/* Create Channel Modal */}
      {showCreateChannel && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setShowCreateChannel(false)}>
          <div style={{
            background: theme.cardBg, border: '1px solid #1f1f3a', borderRadius: 16,
            padding: 32, width: 400,
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: theme.text, margin: '0 0 24px' }}>Create Channel</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, color: theme.textSecondary, display: 'block', marginBottom: 6 }}>Channel Name *</label>
                <input style={inputStyle} value={channelName} onChange={e => setChannelName(e.target.value)} placeholder="design-team" />
              </div>
              <div>
                <label style={{ fontSize: 12, color: theme.textSecondary, display: 'block', marginBottom: 6 }}>Description</label>
                <input style={inputStyle} value={channelDesc} onChange={e => setChannelDesc(e.target.value)} placeholder="What's this channel for?" />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 28 }}>
              <button onClick={() => setShowCreateChannel(false)} style={{
                padding: '10px 24px', background: theme.border, color: theme.textSecondary, border: 'none',
                borderRadius: 10, fontSize: 14, cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={handleCreateChannel} disabled={saving || !channelName.trim()} style={{
                padding: '10px 24px', background: theme.accent, color: theme.text, border: 'none',
                borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                opacity: saving || !channelName.trim() ? 0.5 : 1,
              }}>{saving ? 'Creating...' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
