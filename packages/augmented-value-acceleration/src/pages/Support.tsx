import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import PageHeader from '../components/PageHeader';
import { theme, pageStyle, inputStyle as baseInputStyle, primaryBtnStyle, tableHeaderStyle, tableCellStyle } from '../lib/theme';

interface SupportMessage {
  id: string;
  sender_type: 'user' | 'admin';
  sender_name: string;
  body: string;
  created_at: string;
}

interface Ticket {
  id: string;
  user_id: string | null;
  email: string;
  name: string | null;
  subject: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  source: 'tool' | 'dashboard' | 'website';
  created_at: string;
  updated_at: string;
}

type StatusFilter = 'all' | 'open' | 'in_progress' | 'resolved' | 'closed';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  open: { bg: theme.blueBg, text: theme.blue },
  in_progress: { bg: theme.yellowBg, text: theme.yellow },
  resolved: { bg: theme.greenBg, text: theme.green },
  closed: { bg: 'rgba(108, 112, 134, 0.12)', text: theme.textMuted },
};

const PRIORITY_COLORS: Record<string, string> = {
  low: theme.textMuted,
  normal: theme.textSecondary,
  high: theme.yellow,
  urgent: theme.red,
};

const SOURCE_LABELS: Record<string, string> = {
  tool: 'Ava Tool',
  dashboard: 'Dashboard',
  website: 'Website',
};

export default function Support() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('support_tickets')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (filter !== 'all') {
        query = query.eq('status', filter);
      }
      if (search) {
        query = query.or(`email.ilike.%${search}%,subject.ilike.%${search}%`);
      }

      const { data } = await query;
      setTickets(data || []);
    } catch {
      // silent
    }
    setLoading(false);
  }, [filter, search]);

  useEffect(() => {
    const debounce = setTimeout(loadTickets, search ? 300 : 0);
    return () => clearTimeout(debounce);
  }, [loadTickets, search]);

  async function loadMessages(ticketId: string) {
    try {
      const { data } = await supabase
        .from('support_messages')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });
      setMessages(data || []);
    } catch {
      setMessages([]);
    }
  }

  async function selectTicket(ticket: Ticket) {
    setSelectedTicket(ticket);
    setReplyText('');
    await loadMessages(ticket.id);
  }

  async function updateStatus(ticketId: string, status: string) {
    await supabase
      .from('support_tickets')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', ticketId);
    await loadTickets();
    if (selectedTicket?.id === ticketId) {
      setSelectedTicket(prev => prev ? { ...prev, status: status as Ticket['status'] } : null);
    }
  }

  async function sendReply() {
    if (!selectedTicket || !replyText.trim()) return;
    setSending(true);

    try {
      await supabase.from('support_messages').insert({
        ticket_id: selectedTicket.id,
        sender_type: 'admin',
        sender_name: 'Admin',
        body: replyText.trim(),
      });

      setReplyText('');
      await loadMessages(selectedTicket.id);
      if (selectedTicket.status === 'open') {
        await updateStatus(selectedTicket.id, 'in_progress');
      }
    } catch {
      // silent
    }
    setSending(false);
  }

  // Detail view
  if (selectedTicket) {
    const sc = STATUS_COLORS[selectedTicket.status] || STATUS_COLORS.open;
    return (
      <div style={pageStyle}>
        <button
          onClick={() => setSelectedTicket(null)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', color: theme.textMuted,
            fontSize: 13, cursor: 'pointer', marginBottom: 16, padding: 0,
            transition: 'color 0.2s',
          }}
          onMouseOver={e => e.currentTarget.style.color = theme.text}
          onMouseOut={e => e.currentTarget.style.color = theme.textMuted}
        >
          &#8592; Back to tickets
        </button>

        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: theme.text, margin: 0 }}>{selectedTicket.subject}</h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12 }}>
            <span style={{ background: sc.bg, color: sc.text, padding: '3px 10px', borderRadius: 9999, fontWeight: 600, textTransform: 'capitalize' }}>
              {selectedTicket.status.replace('_', ' ')}
            </span>
            <span style={{ color: PRIORITY_COLORS[selectedTicket.priority], fontWeight: 500 }}>
              {selectedTicket.priority}
            </span>
            <span style={{ color: theme.textMuted }}>from {selectedTicket.email}</span>
            {selectedTicket.name && <span style={{ color: theme.textMuted }}>({selectedTicket.name})</span>}
            <span style={{ color: theme.textMuted }}>via {SOURCE_LABELS[selectedTicket.source] || selectedTicket.source}</span>
            <span style={{ color: theme.textMuted }}>{new Date(selectedTicket.created_at).toLocaleString()}</span>
          </div>

          {/* Status actions */}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            {(['open', 'in_progress', 'resolved', 'closed'] as const).map((s) => (
              <button
                key={s}
                onClick={() => updateStatus(selectedTicket.id, s)}
                disabled={selectedTicket.status === s}
                style={{
                  padding: '8px 16px',
                  fontSize: 12,
                  fontWeight: 500,
                  borderRadius: theme.radiusSm,
                  cursor: selectedTicket.status === s ? 'default' : 'pointer',
                  background: selectedTicket.status === s ? theme.accent : 'transparent',
                  color: selectedTicket.status === s ? '#fff' : theme.textMuted,
                  border: selectedTicket.status === s ? 'none' : `1px solid ${theme.border}`,
                  transition: 'all 0.2s',
                }}
              >
                {s === 'in_progress' ? 'In Progress' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div style={{ marginBottom: 24 }}>
          {messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                background: msg.sender_type === 'admin' ? theme.accentBg : theme.cardBg,
                border: `1px solid ${msg.sender_type === 'admin' ? theme.accentBgStrong : theme.border}`,
                borderRadius: theme.radiusMd,
                padding: 16,
                marginBottom: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: theme.text }}>
                  {msg.sender_name}
                  {msg.sender_type === 'admin' && (
                    <span style={{ marginLeft: 8, background: theme.accentBgStrong, color: theme.accent, fontSize: 10, padding: '2px 6px', borderRadius: 4 }}>
                      Admin
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 11, color: theme.textMuted }}>
                  {new Date(msg.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>{msg.body}</p>
            </div>
          ))}
        </div>

        {/* Reply */}
        <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: theme.radiusMd, padding: 16 }}>
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            rows={4}
            placeholder="Write a reply..."
            style={{
              ...baseInputStyle,
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
            <p style={{ fontSize: 11, color: theme.textMuted, margin: 0 }}>Reply will be sent to {selectedTicket.email}</p>
            <button
              onClick={sendReply}
              disabled={sending || !replyText.trim()}
              style={{
                ...primaryBtnStyle,
                padding: '8px 20px',
                fontSize: 12,
                cursor: sending || !replyText.trim() ? 'not-allowed' : 'pointer',
                opacity: sending || !replyText.trim() ? 0.5 : 1,
              }}
            >
              {sending ? 'Sending...' : 'Send Reply'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Stats
  const openCount = tickets.filter(t => t.status === 'open').length;
  const inProgressCount = tickets.filter(t => t.status === 'in_progress').length;

  return (
    <div style={pageStyle}>

      <PageHeader title="Support Tickets" subtitle="Manage support requests from users. Replies are sent via email." onRefresh={loadTickets} />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginBottom: theme.sectionGap }}>
        {[
          { label: 'Total tickets', value: tickets.length, icon: '🎫', color: theme.text },
          { label: 'Open', value: openCount, icon: '📬', color: theme.blue },
          { label: 'In progress', value: inProgressCount, icon: '⏳', color: theme.yellow },
        ].map(s => (
          <div key={s.label} style={{
            background: theme.cardBg, border: `1px solid ${theme.border}`,
            borderRadius: theme.radiusLg, padding: '24px',
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: theme.radiusSm,
              background: theme.inputBg, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, marginBottom: 12,
            }}>{s.icon}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Search + filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email or subject..."
          style={{ ...baseInputStyle, width: 280 }}
        />
        <div style={{ display: 'flex', gap: 4, background: theme.inputBg, borderRadius: theme.radiusSm, padding: 4 }}>
          {(['all', 'open', 'in_progress', 'resolved', 'closed'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '8px 14px',
              fontSize: 12,
              fontWeight: filter === f ? 600 : 400,
              color: filter === f ? theme.text : theme.textMuted,
              background: filter === f ? theme.cardBg : 'transparent',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}>
              {f === 'in_progress' ? 'In Progress' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: theme.textMuted, fontSize: 14 }}>Loading tickets...</div>
      )}

      {/* Empty */}
      {!loading && tickets.length === 0 && (
        <div style={{
          background: theme.cardBg, border: `1px solid ${theme.border}`,
          borderRadius: theme.radiusLg, padding: '60px 40px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>🎫</div>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: theme.text, marginBottom: 8 }}>No tickets</h2>
          <p style={{ fontSize: 13, color: theme.textMuted, margin: 0 }}>
            {filter !== 'all' ? `No ${filter.replace('_', ' ')} tickets found.` : 'No support tickets yet.'}
          </p>
        </div>
      )}

      {/* Ticket table */}
      {!loading && tickets.length > 0 && (
        <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: theme.radiusLg, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                {['Subject', 'From', 'Status', 'Priority', 'Source', 'Date'].map(h => (
                  <th key={h} style={tableHeaderStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => {
                const sc = STATUS_COLORS[ticket.status] || STATUS_COLORS.open;
                return (
                  <tr
                    key={ticket.id}
                    onClick={() => selectTicket(ticket)}
                    style={{ borderBottom: `1px solid ${theme.border}`, cursor: 'pointer', transition: 'background 0.15s' }}
                    onMouseOver={(e) => (e.currentTarget.style.background = theme.hoverBg)}
                    onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ ...tableCellStyle, fontSize: 13, fontWeight: 500, color: theme.text }}>{ticket.subject}</td>
                    <td style={tableCellStyle}>
                      <div style={{ fontSize: 12, color: theme.textSecondary }}>{ticket.email}</div>
                      {ticket.name && <div style={{ fontSize: 11, color: theme.textMuted }}>{ticket.name}</div>}
                    </td>
                    <td style={tableCellStyle}>
                      <span style={{ background: sc.bg, color: sc.text, padding: '3px 10px', borderRadius: 9999, fontSize: 11, fontWeight: 600, textTransform: 'capitalize' }}>
                        {ticket.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td style={{ ...tableCellStyle, fontSize: 12, fontWeight: 500, color: PRIORITY_COLORS[ticket.priority], textTransform: 'capitalize' }}>
                      {ticket.priority}
                    </td>
                    <td style={{ ...tableCellStyle, fontSize: 12, color: theme.textMuted }}>
                      {SOURCE_LABELS[ticket.source] || ticket.source}
                    </td>
                    <td style={{ ...tableCellStyle, fontSize: 12, color: theme.textMuted }}>
                      {new Date(ticket.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
