import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

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
  open: { bg: 'rgba(59, 130, 246, 0.15)', text: '#93c5fd' },
  in_progress: { bg: 'rgba(245, 158, 11, 0.15)', text: '#fcd34d' },
  resolved: { bg: 'rgba(34, 197, 94, 0.15)', text: '#86efac' },
  closed: { bg: '#1a1a35', text: '#6b7280' },
};

const PRIORITY_COLORS: Record<string, string> = {
  low: '#6b7280',
  normal: '#9ca3af',
  high: '#fbbf24',
  urgent: '#f87171',
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
      <div style={{ padding: '32px 40px', overflowY: 'auto', height: '100%', background: '#0a0a1a' }}>
        <button
          onClick={() => setSelectedTicket(null)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#6b7280', fontSize: 13, cursor: 'pointer', marginBottom: 16, padding: 0 }}
        >
          &#8592; Back to tickets
        </button>

        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: 0 }}>{selectedTicket.subject}</h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 12 }}>
            <span style={{ background: sc.bg, color: sc.text, padding: '3px 10px', borderRadius: 10, fontWeight: 500, textTransform: 'capitalize' }}>
              {selectedTicket.status.replace('_', ' ')}
            </span>
            <span style={{ color: PRIORITY_COLORS[selectedTicket.priority], fontWeight: 500 }}>
              {selectedTicket.priority}
            </span>
            <span style={{ color: '#6b7280' }}>from {selectedTicket.email}</span>
            {selectedTicket.name && <span style={{ color: '#6b7280' }}>({selectedTicket.name})</span>}
            <span style={{ color: '#6b7280' }}>via {SOURCE_LABELS[selectedTicket.source] || selectedTicket.source}</span>
            <span style={{ color: '#6b7280' }}>{new Date(selectedTicket.created_at).toLocaleString()}</span>
          </div>

          {/* Status actions */}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            {(['open', 'in_progress', 'resolved', 'closed'] as const).map((s) => (
              <button
                key={s}
                onClick={() => updateStatus(selectedTicket.id, s)}
                disabled={selectedTicket.status === s}
                style={{
                  padding: '6px 14px',
                  fontSize: 11,
                  fontWeight: 500,
                  borderRadius: 8,
                  cursor: selectedTicket.status === s ? 'default' : 'pointer',
                  background: selectedTicket.status === s ? '#a855f7' : 'transparent',
                  color: selectedTicket.status === s ? '#fff' : '#6b7280',
                  border: selectedTicket.status === s ? 'none' : '1px solid #1f1f3a',
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
                background: msg.sender_type === 'admin' ? 'rgba(168, 85, 247, 0.05)' : '#111127',
                border: msg.sender_type === 'admin' ? '1px solid rgba(168, 85, 247, 0.2)' : '1px solid #1f1f3a',
                borderRadius: 12,
                padding: 16,
                marginBottom: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: '#fff' }}>
                  {msg.sender_name}
                  {msg.sender_type === 'admin' && (
                    <span style={{ marginLeft: 8, background: 'rgba(168, 85, 247, 0.2)', color: '#a855f7', fontSize: 10, padding: '2px 6px', borderRadius: 4 }}>
                      Admin
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 10, color: '#6b7280' }}>
                  {new Date(msg.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>{msg.body}</p>
            </div>
          ))}
        </div>

        {/* Reply */}
        <div style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 12, padding: 16 }}>
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            rows={4}
            placeholder="Write a reply..."
            style={{
              width: '100%',
              background: '#1a1a35',
              border: '1px solid #1f1f3a',
              borderRadius: 8,
              padding: '10px 14px',
              fontSize: 13,
              color: '#fff',
              outline: 'none',
              resize: 'vertical',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
            <p style={{ fontSize: 10, color: '#6b7280', margin: 0 }}>Reply will be sent to {selectedTicket.email}</p>
            <button
              onClick={sendReply}
              disabled={sending || !replyText.trim()}
              style={{
                background: '#a855f7',
                border: 'none',
                borderRadius: 8,
                padding: '8px 20px',
                fontSize: 12,
                fontWeight: 600,
                color: '#fff',
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

  const filterTabStyle = (isActive: boolean) => ({
    padding: '7px 14px',
    fontSize: 11,
    fontWeight: isActive ? 600 : 400,
    color: isActive ? '#fff' : '#6b7280',
    background: isActive ? '#111127' : 'transparent',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer' as const,
  });

  return (
    <div style={{ padding: '32px 40px', overflowY: 'auto', height: '100%', background: '#0a0a1a' }}>

      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: 0 }}>Support Tickets</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4, marginBottom: 24 }}>
        Manage support requests from users. Replies are sent via email.
      </p>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#fff' }}>{tickets.length}</div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>Total tickets</div>
        </div>
        <div style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#93c5fd' }}>{openCount}</div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>Open</div>
        </div>
        <div style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#fcd34d' }}>{inProgressCount}</div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>In progress</div>
        </div>
      </div>

      {/* Search + filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email or subject..."
          style={{
            width: 260,
            background: '#1a1a35',
            border: '1px solid #1f1f3a',
            borderRadius: 8,
            padding: '9px 14px',
            fontSize: 13,
            color: '#fff',
            outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 2, background: '#1a1a35', borderRadius: 8, padding: 4 }}>
          {(['all', 'open', 'in_progress', 'resolved', 'closed'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} style={filterTabStyle(filter === f)}>
              {f === 'in_progress' ? 'In Progress' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#6b7280', fontSize: 14 }}>Loading tickets...</div>
      )}

      {/* Empty */}
      {!loading && tickets.length === 0 && (
        <div style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 14, padding: 40, textAlign: 'center' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 8 }}>No tickets</h2>
          <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
            {filter !== 'all' ? `No ${filter.replace('_', ' ')} tickets found.` : 'No support tickets yet.'}
          </p>
        </div>
      )}

      {/* Ticket table */}
      {!loading && tickets.length > 0 && (
        <div style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1f1f3a', background: '#111127' }}>
                {['Subject', 'From', 'Status', 'Priority', 'Source', 'Date'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: '#6b7280', fontSize: 11 }}>{h}</th>
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
                    style={{ borderBottom: '1px solid #1f1f3a', cursor: 'pointer' }}
                    onMouseOver={(e) => (e.currentTarget.style.background = '#1a1a35')}
                    onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 500, color: '#fff' }}>{ticket.subject}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>{ticket.email}</div>
                      {ticket.name && <div style={{ fontSize: 10, color: '#6b7280' }}>{ticket.name}</div>}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ background: sc.bg, color: sc.text, padding: '3px 10px', borderRadius: 10, fontSize: 10, fontWeight: 500, textTransform: 'capitalize' }}>
                        {ticket.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 12, fontWeight: 500, color: PRIORITY_COLORS[ticket.priority], textTransform: 'capitalize' }}>
                      {ticket.priority}
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 12, color: '#6b7280' }}>
                      {SOURCE_LABELS[ticket.source] || ticket.source}
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 12, color: '#6b7280' }}>
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
