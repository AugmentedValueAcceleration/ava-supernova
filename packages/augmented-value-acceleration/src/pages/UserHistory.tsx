import { useEffect, useState, Fragment } from 'react';
import { supabase } from '../lib/supabase';

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

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', background: '#1a1a35', border: '1px solid #1f1f3a',
    borderRadius: 10, color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ padding: '32px 40px', overflowY: 'auto', height: '100%', background: '#0a0a1a' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: 0 }}>Chat History</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4, marginBottom: 24 }}>
        {conversations.length} conversation{conversations.length !== 1 ? 's' : ''} saved.
      </p>

      {/* Search */}
      <div style={{ marginBottom: 24 }}>
        <input
          style={inputStyle}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search conversations by title or model..."
        />
      </div>

      {/* Loading */}
      {loading && <div style={{ textAlign: 'center', color: '#6b7280', padding: 60 }}>Loading conversations...</div>}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 80, color: '#6b7280' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#128172;</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#9ca3af', marginBottom: 8 }}>No conversations yet</div>
          <div style={{ fontSize: 14 }}>Chat history will appear here as you use Ava.</div>
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
                    background: '#111127', border: '1px solid #1f1f3a',
                    borderRadius: isExpanded ? '14px 14px 0 0' : 14,
                    padding: '14px 20px', cursor: 'pointer',
                  }}
                  onMouseOver={e => (e.currentTarget.style.borderColor = '#2f2f4a')}
                  onMouseOut={e => (e.currentTarget.style.borderColor = '#1f1f3a')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {conv.title || 'Untitled conversation'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                        <span style={{ fontSize: 11, color: '#6b7280' }}>{formatDate(conv.created_at)}</span>
                        {conv.model && (
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 8,
                            background: 'rgba(168, 85, 247, 0.12)', color: '#a855f7',
                          }}>
                            {conv.model}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#a855f7' }}>{conv.message_count}</div>
                      <div style={{ fontSize: 10, color: '#6b7280' }}>messages</div>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{
                    background: '#0d0d22', border: '1px solid #1f1f3a', borderTop: 'none',
                    borderRadius: '0 0 14px 14px', padding: '16px 20px',
                  }}>
                    {/* Messages */}
                    {loadingMessages === conv.id ? (
                      <div style={{ textAlign: 'center', color: '#6b7280', padding: 20, fontSize: 12 }}>Loading messages...</div>
                    ) : conv.messages && conv.messages.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto', marginBottom: 12 }}>
                        {conv.messages.map((msg, i) => (
                          <div key={i} style={{
                            padding: '10px 14px', borderRadius: 10,
                            background: msg.role === 'user' ? '#1a1a35' : '#111127',
                            border: '1px solid #1f1f3a',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <span style={{
                                fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const,
                                color: msg.role === 'user' ? '#60a5fa' : '#a855f7',
                              }}>
                                {msg.role}
                              </span>
                              <span style={{ fontSize: 10, color: '#4b5563' }}>{formatDateTime(msg.created_at)}</span>
                            </div>
                            <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                              {msg.content.length > 500 ? msg.content.slice(0, 500) + '...' : msg.content}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', color: '#6b7280', padding: 20, fontSize: 12 }}>No messages found.</div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      {deleteConfirm === conv.id ? (
                        <>
                          <span style={{ fontSize: 12, color: '#f87171', alignSelf: 'center' }}>Delete this conversation?</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                            style={{
                              background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #f87171', borderRadius: 6,
                              padding: '6px 12px', fontSize: 11, color: '#f87171', cursor: 'pointer',
                            }}
                          >
                            Confirm Delete
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirm(null); }}
                            style={{
                              background: 'none', border: '1px solid #1f1f3a', borderRadius: 6,
                              padding: '6px 12px', fontSize: 11, color: '#9ca3af', cursor: 'pointer',
                            }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirm(conv.id); }}
                          style={{
                            background: 'none', border: '1px solid #1f1f3a', borderRadius: 6,
                            padding: '6px 12px', fontSize: 11, color: '#f87171', cursor: 'pointer',
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
