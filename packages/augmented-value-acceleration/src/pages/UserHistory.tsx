import { useEffect, useState, Fragment } from 'react';
import { supabase } from '../lib/supabase';
import PageHeader from '../components/PageHeader';
import { theme, pageStyle, inputStyle as themeInputStyle, cardStyle, chipStyle, emptyStateStyle } from '../lib/theme';

interface Conversation {
  id: string;
  title: string | null;
  message_count: number;
  model: string | null;
  created_at: string;
  updated_at: string;
  messages?: Array<{ role: string; content: string; created_at: string }>;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function UserHistory() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadingMessages, setLoadingMessages] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchConversations = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('user_conversations')
        .select('id, title, message_count, model, created_at, updated_at')
        .order('updated_at', { ascending: false })
        .limit(200);
      setConversations(data || []);
    } catch {
      // silent
    }
    setLoading(false);
  };

  useEffect(() => { fetchConversations(); }, []);

  async function loadMessages(convId: string) {
    const conv = conversations.find(c => c.id === convId);
    if (conv?.messages) return;
    setLoadingMessages(convId);
    try {
      const { data } = await supabase
        .from('user_messages')
        .select('role, content, created_at')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true });
      setConversations(prev => prev.map(c =>
        c.id === convId ? { ...c, messages: data || [] } : c
      ));
    } catch {
      // silent
    }
    setLoadingMessages(null);
  }

  async function deleteConversation(convId: string) {
    try {
      await supabase.from('user_messages').delete().eq('conversation_id', convId);
      await supabase.from('user_conversations').delete().eq('id', convId);
      setConversations(prev => prev.filter(c => c.id !== convId));
      setDeleteConfirm(null);
      setExpandedId(null);
    } catch {
      // silent
    }
  }

  const filtered = search
    ? conversations.filter(c =>
        c.title?.toLowerCase().includes(search.toLowerCase()) ||
        c.model?.toLowerCase().includes(search.toLowerCase())
      )
    : conversations;

  return (
    <div style={pageStyle}>
      <PageHeader title="Chat History" subtitle={`${conversations.length} conversation${conversations.length !== 1 ? 's' : ''} saved.`} onRefresh={fetchConversations} />

      {/* Search */}
      <div style={{ marginBottom: 24 }}>
        <input
          style={themeInputStyle}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search conversations by title or model..."
        />
      </div>

      {/* Loading */}
      {loading && <div style={{ textAlign: 'center', color: theme.textMuted, padding: 60 }}>Loading conversations...</div>}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div style={emptyStateStyle}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#128172;</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: theme.textSecondary, marginBottom: 8 }}>No conversations yet</div>
          <div style={{ fontSize: 14, color: theme.textMuted }}>Chat history will appear here as you use Ava.</div>
        </div>
      )}

      {/* Conversation List */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {filtered.map(conv => {
            const isExpanded = expandedId === conv.id;

            return (
              <Fragment key={conv.id}>
                <div
                  onClick={() => { setExpandedId(isExpanded ? null : conv.id); if (!isExpanded) loadMessages(conv.id); }}
                  style={{
                    ...cardStyle,
                    borderRadius: isExpanded ? '12px 12px 0 0' : 12,
                    padding: '14px 20px', cursor: 'pointer',
                  }}
                  onMouseOver={e => (e.currentTarget.style.borderColor = theme.accentBgStrong)}
                  onMouseOut={e => (e.currentTarget.style.borderColor = theme.border)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {conv.title || 'Untitled conversation'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                        <span style={{ fontSize: 11, color: theme.textMuted }}>{formatDate(conv.created_at)}</span>
                        {conv.model && (
                          <span style={chipStyle(theme.accentBg, theme.accent)}>
                            {conv.model}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: theme.accent }}>{conv.message_count}</div>
                      <div style={{ fontSize: 10, color: theme.textMuted }}>messages</div>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{
                    background: theme.surfaceBg, border: `1px solid ${theme.border}`, borderTop: 'none',
                    borderRadius: '0 0 12px 12px', padding: '16px 20px',
                  }}>
                    {/* Messages */}
                    {loadingMessages === conv.id ? (
                      <div style={{ textAlign: 'center', color: theme.textMuted, padding: 20, fontSize: 12 }}>Loading messages...</div>
                    ) : conv.messages && conv.messages.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto', marginBottom: 12 }}>
                        {conv.messages.map((msg, i) => (
                          <div key={i} style={{
                            padding: '10px 14px', borderRadius: 10,
                            background: msg.role === 'user' ? theme.inputBg : theme.cardBg,
                            border: `1px solid ${theme.border}`,
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <span style={{
                                fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const,
                                color: msg.role === 'user' ? theme.blue : theme.accent,
                              }}>
                                {msg.role}
                              </span>
                              <span style={{ fontSize: 10, color: theme.textMuted }}>{formatDateTime(msg.created_at)}</span>
                            </div>
                            <div style={{ fontSize: 12, color: theme.textSecondary, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                              {msg.content.length > 500 ? msg.content.slice(0, 500) + '...' : msg.content}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', color: theme.textMuted, padding: 20, fontSize: 12 }}>No messages found.</div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      {deleteConfirm === conv.id ? (
                        <>
                          <span style={{ fontSize: 12, color: theme.red, alignSelf: 'center' }}>Delete this conversation?</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                            style={{
                              background: theme.redBg, border: `1px solid ${theme.red}`, borderRadius: 6,
                              padding: '6px 12px', fontSize: 11, color: theme.red, cursor: 'pointer',
                            }}
                          >
                            Confirm Delete
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirm(null); }}
                            style={{
                              background: 'none', border: `1px solid ${theme.border}`, borderRadius: 6,
                              padding: '6px 12px', fontSize: 11, color: theme.textSecondary, cursor: 'pointer',
                            }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirm(conv.id); }}
                          style={{
                            background: 'none', border: `1px solid ${theme.border}`, borderRadius: 6,
                            padding: '6px 12px', fontSize: 11, color: theme.red, cursor: 'pointer',
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
