import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import PageHeader from '../components/PageHeader';
import { theme, pageStyle, inputStyle as themeInputStyle, cardStyle, primaryBtnStyle, ghostBtnStyle, labelStyle, emptyStateStyle } from '../lib/theme';

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  full_key?: string;
  created_at: string;
  last_used_at: string | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function maskKey(prefix: string): string {
  return prefix + '...' + '*'.repeat(20);
}

function generateKey(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let key = 'ava_';
  for (let i = 0; i < 32; i++) key += chars[bytes[i] % chars.length];
  return key;
}

export default function UserKeys() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [revealedId, setRevealedId] = useState<string | null>(null);

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('user_api_keys')
        .select('*')
        .order('created_at', { ascending: false });
      setKeys(data || []);
    } catch {
      // silent
    }
    setLoading(false);
  };

  useEffect(() => { fetchKeys(); }, []);

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const fullKey = generateKey();
      const prefix = fullKey.slice(0, 8);
      const { data } = await supabase
        .from('user_api_keys')
        .insert({
          name: newKeyName.trim(),
          key_prefix: prefix,
          key_hash: fullKey,
        })
        .select()
        .single();

      if (data) {
        setCreatedKey(fullKey);
        setNewKeyName('');
        await fetchKeys();
      }
    } finally {
      setCreating(false);
    }
  }

  async function renameKey(id: string) {
    if (!editName.trim()) return;
    try {
      await supabase.from('user_api_keys').update({ name: editName.trim() }).eq('id', id);
      setEditingId(null);
      await fetchKeys();
    } catch {
      // silent
    }
  }

  async function deleteKey(id: string) {
    try {
      await supabase.from('user_api_keys').delete().eq('id', id);
      setDeleteConfirm(null);
      await fetchKeys();
    } catch {
      // silent
    }
  }

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const actionBtnStyle = (color: string): React.CSSProperties => ({
    background: 'none', border: `1px solid ${theme.border}`, borderRadius: 6,
    padding: '4px 10px', fontSize: 10, color, cursor: 'pointer',
  });

  return (
    <div style={pageStyle}>
      <PageHeader title="API Keys" subtitle={`${keys.length} key${keys.length !== 1 ? 's' : ''} created.`} onRefresh={fetchKeys}>
        <button
          onClick={() => { setShowCreate(true); setCreatedKey(null); }}
          style={primaryBtnStyle}
        >
          + Create Key
        </button>
      </PageHeader>

      {/* Created Key Banner */}
      {createdKey && (
        <div style={{
          background: theme.greenBg, border: `1px solid ${theme.green}40`,
          borderRadius: theme.radiusLg, padding: 20, marginBottom: 24,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: theme.green, marginBottom: 8 }}>
            Key created successfully. Copy it now — it will not be shown again.
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code style={{
              flex: 1, background: theme.surfaceBg, padding: '10px 14px', borderRadius: 8,
              fontSize: 12, color: theme.text, fontFamily: 'monospace', overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {createdKey}
            </code>
            <button
              onClick={() => copyToClipboard(createdKey, 'new')}
              style={{
                ...ghostBtnStyle, padding: '10px 16px', fontSize: 11,
                color: copiedId === 'new' ? theme.green : theme.textSecondary,
                flexShrink: 0,
              }}
            >
              {copiedId === 'new' ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {/* Create Form */}
      {showCreate && !createdKey && (
        <div style={{ ...cardStyle, marginBottom: 24 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: theme.text, margin: '0 0 16px 0' }}>New API Key</h2>
          <form onSubmit={createKey}>
            <div style={labelStyle}>Key Name</div>
            <input
              value={newKeyName}
              onChange={e => setNewKeyName(e.target.value)}
              placeholder="e.g. Development, Production, Testing"
              style={{ ...themeInputStyle, marginBottom: 16 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={creating || !newKeyName.trim()} style={{
                ...primaryBtnStyle,
                cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.5 : 1,
              }}>
                {creating ? 'Creating...' : 'Create'}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} style={ghostBtnStyle}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Loading */}
      {loading && <div style={{ textAlign: 'center', color: theme.textMuted, padding: 60 }}>Loading keys...</div>}

      {/* Keys List */}
      {!loading && keys.length === 0 && (
        <div style={emptyStateStyle}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#128273;</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: theme.textSecondary, marginBottom: 8 }}>No API keys</div>
          <div style={{ fontSize: 14, color: theme.textMuted }}>Create a key to authenticate with the Ava API.</div>
        </div>
      )}

      {!loading && keys.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {keys.map(key => (
            <div key={key.id} style={{ ...cardStyle, padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingId === key.id ? (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') renameKey(key.id); if (e.key === 'Escape') setEditingId(null); }}
                        style={{ ...themeInputStyle, width: 200 }}
                        autoFocus
                      />
                      <button onClick={() => renameKey(key.id)} style={actionBtnStyle(theme.green)}>Save</button>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: theme.text, marginBottom: 4 }}>{key.name}</div>
                      <code style={{ fontSize: 11, color: theme.textMuted, fontFamily: 'monospace' }}>
                        {revealedId === key.id ? key.key_hash : maskKey(key.key_prefix)}
                      </code>
                    </div>
                  )}
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 100 }}>
                  <div style={{ fontSize: 11, color: theme.textMuted }}>Created {formatDate(key.created_at)}</div>
                  <div style={{ fontSize: 10, color: theme.textMuted, marginTop: 2 }}>
                    {key.last_used_at ? `Last used ${formatDateTime(key.last_used_at)}` : 'Never used'}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button onClick={() => copyToClipboard(key.key_prefix + '...', key.id)} style={actionBtnStyle(copiedId === key.id ? theme.green : theme.textMuted)}>
                    {copiedId === key.id ? 'Copied' : 'Copy'}
                  </button>
                  <button onClick={() => setRevealedId(revealedId === key.id ? null : key.id)} style={actionBtnStyle(theme.textSecondary)}>
                    {revealedId === key.id ? 'Hide' : 'Reveal'}
                  </button>
                  <button onClick={() => { setEditingId(key.id); setEditName(key.name); }} style={actionBtnStyle(theme.blue)}>
                    Rename
                  </button>
                  {deleteConfirm === key.id ? (
                    <>
                      <button onClick={() => deleteKey(key.id)} style={{ ...actionBtnStyle(theme.red), background: theme.redBg, borderColor: theme.red }}>
                        Confirm
                      </button>
                      <button onClick={() => setDeleteConfirm(null)} style={actionBtnStyle(theme.textSecondary)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setDeleteConfirm(key.id)} style={actionBtnStyle(theme.red)}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
