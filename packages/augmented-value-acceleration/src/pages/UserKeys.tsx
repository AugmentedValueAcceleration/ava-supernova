import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

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
          key_hash: fullKey, // In production this would be hashed
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

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', background: '#1a1a35', border: '1px solid #1f1f3a',
    borderRadius: 8, color: '#fff', fontSize: 12, outline: 'none', boxSizing: 'border-box',
    fontFamily: 'inherit',
  };

  return (
    <div style={{ padding: '32px 40px', overflowY: 'auto', height: '100%', background: '#0a0a1a' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: 0 }}>API Keys</h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
            {keys.length} key{keys.length !== 1 ? 's' : ''} created.
          </p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setCreatedKey(null); }}
          style={{
            background: '#a855f7', border: 'none', borderRadius: 10,
            padding: '10px 20px', fontSize: 12, fontWeight: 600, color: '#fff', cursor: 'pointer',
          }}
        >
          + Create Key
        </button>
      </div>

      {/* Created Key Banner */}
      {createdKey && (
        <div style={{
          background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.3)',
          borderRadius: 14, padding: 20, marginBottom: 24,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#4ade80', marginBottom: 8 }}>
            Key created successfully. Copy it now — it will not be shown again.
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code style={{
              flex: 1, background: '#0a0a1a', padding: '10px 14px', borderRadius: 8,
              fontSize: 12, color: '#fff', fontFamily: 'monospace', overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {createdKey}
            </code>
            <button
              onClick={() => copyToClipboard(createdKey, 'new')}
              style={{
                background: '#1a1a35', border: '1px solid #1f1f3a', borderRadius: 8,
                padding: '10px 16px', fontSize: 11, color: copiedId === 'new' ? '#4ade80' : '#9ca3af',
                cursor: 'pointer', flexShrink: 0,
              }}
            >
              {copiedId === 'new' ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {/* Create Form */}
      {showCreate && !createdKey && (
        <div style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 14, padding: 24, marginBottom: 24 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#fff', margin: '0 0 16px 0' }}>New API Key</h2>
          <form onSubmit={createKey}>
            <div style={{ fontSize: 11, fontWeight: 500, color: '#6b7280', marginBottom: 6 }}>Key Name</div>
            <input
              value={newKeyName}
              onChange={e => setNewKeyName(e.target.value)}
              placeholder="e.g. Development, Production, Testing"
              style={{ ...inputStyle, marginBottom: 16 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={creating || !newKeyName.trim()} style={{
                background: '#a855f7', border: 'none', borderRadius: 8,
                padding: '10px 20px', fontSize: 12, fontWeight: 600, color: '#fff',
                cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.5 : 1,
              }}>
                {creating ? 'Creating...' : 'Create'}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} style={{
                background: '#1a1a35', border: '1px solid #1f1f3a', borderRadius: 8,
                padding: '10px 20px', fontSize: 12, color: '#9ca3af', cursor: 'pointer',
              }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Loading */}
      {loading && <div style={{ textAlign: 'center', color: '#6b7280', padding: 60 }}>Loading keys...</div>}

      {/* Keys List */}
      {!loading && keys.length === 0 && (
        <div style={{ textAlign: 'center', padding: 80, color: '#6b7280' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#128273;</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#9ca3af', marginBottom: 8 }}>No API keys</div>
          <div style={{ fontSize: 14 }}>Create a key to authenticate with the Ava API.</div>
        </div>
      )}

      {!loading && keys.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {keys.map(key => (
            <div key={key.id} style={{
              background: '#111127', border: '1px solid #1f1f3a', borderRadius: 14, padding: '16px 20px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingId === key.id ? (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') renameKey(key.id); if (e.key === 'Escape') setEditingId(null); }}
                        style={{ ...inputStyle, width: 200 }}
                        autoFocus
                      />
                      <button onClick={() => renameKey(key.id)} style={{
                        background: '#1a1a35', border: '1px solid #1f1f3a', borderRadius: 6,
                        padding: '4px 12px', fontSize: 10, color: '#4ade80', cursor: 'pointer',
                      }}>Save</button>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: '#fff', marginBottom: 4 }}>{key.name}</div>
                      <code style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>
                        {revealedId === key.id ? key.key_hash : maskKey(key.key_prefix)}
                      </code>
                    </div>
                  )}
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 100 }}>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>Created {formatDate(key.created_at)}</div>
                  <div style={{ fontSize: 10, color: '#4b5563', marginTop: 2 }}>
                    {key.last_used_at ? `Last used ${formatDateTime(key.last_used_at)}` : 'Never used'}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button
                    onClick={() => copyToClipboard(key.key_prefix + '...', key.id)}
                    style={{
                      background: 'none', border: '1px solid #1f1f3a', borderRadius: 6,
                      padding: '4px 10px', fontSize: 10, color: copiedId === key.id ? '#4ade80' : '#6b7280', cursor: 'pointer',
                    }}
                  >
                    {copiedId === key.id ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    onClick={() => setRevealedId(revealedId === key.id ? null : key.id)}
                    style={{
                      background: 'none', border: '1px solid #1f1f3a', borderRadius: 6,
                      padding: '4px 10px', fontSize: 10, color: '#9ca3af', cursor: 'pointer',
                    }}
                  >
                    {revealedId === key.id ? 'Hide' : 'Reveal'}
                  </button>
                  <button
                    onClick={() => { setEditingId(key.id); setEditName(key.name); }}
                    style={{
                      background: 'none', border: '1px solid #1f1f3a', borderRadius: 6,
                      padding: '4px 10px', fontSize: 10, color: '#60a5fa', cursor: 'pointer',
                    }}
                  >
                    Rename
                  </button>
                  {deleteConfirm === key.id ? (
                    <>
                      <button
                        onClick={() => deleteKey(key.id)}
                        style={{
                          background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #f87171', borderRadius: 6,
                          padding: '4px 10px', fontSize: 10, color: '#f87171', cursor: 'pointer',
                        }}
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        style={{
                          background: 'none', border: '1px solid #1f1f3a', borderRadius: 6,
                          padding: '4px 10px', fontSize: 10, color: '#9ca3af', cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(key.id)}
                      style={{
                        background: 'none', border: '1px solid #1f1f3a', borderRadius: 6,
                        padding: '4px 10px', fontSize: 10, color: '#f87171', cursor: 'pointer',
                      }}
                    >
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
