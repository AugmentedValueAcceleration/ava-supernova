import { useState, useMemo } from 'react';
import { post } from '../App';
import type { MemoryEntry } from '../types/messages';

interface MemoryProps {
  memories: MemoryEntry[];
}

export function Memory({ memories }: MemoryProps) {
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return q ? memories.filter(m => m.content.toLowerCase().includes(q)) : memories;
  }, [memories, search]);

  function startEdit(m: MemoryEntry) {
    setEditingId(m.id);
    setEditText(m.content);
  }

  function saveEdit(m: MemoryEntry) {
    if (editText.trim() && editText !== m.content) {
      post({ type: 'upsert_memory', id: m.id, content: editText.trim() });
    }
    setEditingId(null);
  }

  function confirmDelete(id: string) {
    post({ type: 'delete_memory', id });
    setConfirmDeleteId(null);
  }

  return (
    <div style={{ maxWidth: '700px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1
          style={{
            fontSize: '18px',
            fontWeight: 700,
            marginBottom: '4px',
            background: 'linear-gradient(135deg, #a78bfa, #c084fc)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Memory
        </h1>
        <p style={{ opacity: 0.55, fontSize: '13px' }}>
          Things Ava remembers about you and your projects.
        </p>
      </div>

      {/* Search */}
      <div style={{ marginBottom: '16px' }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search memories..."
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid var(--vscode-panel-border, #333)',
            background: 'var(--vscode-input-background)',
            color: 'var(--vscode-foreground)',
            fontSize: '13px',
            fontFamily: 'var(--vscode-font-family)',
            boxSizing: 'border-box',
            outline: 'none',
          }}
        />
      </div>

      {/* Memory count */}
      <p style={{ fontSize: '12px', opacity: 0.45, marginBottom: '12px' }}>
        {filtered.length} {filtered.length === 1 ? 'memory' : 'memories'}
        {search && ` matching "${search}"`}
      </p>

      {/* Memory list */}
      {filtered.length === 0 ? (
        <div
          style={{
            padding: '32px',
            textAlign: 'center',
            opacity: 0.45,
            fontSize: '13px',
            border: '1px dashed var(--vscode-panel-border, #444)',
            borderRadius: '8px',
          }}
        >
          {search ? 'No memories match your search.' : 'No memories yet. Ava will remember things as you work together.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.map(m => (
            <div
              key={m.id}
              style={{
                background: 'var(--vscode-editorWidget-background)',
                border: '1px solid var(--vscode-panel-border, #333)',
                borderRadius: '6px',
                padding: '12px 14px',
              }}
            >
              {editingId === m.id ? (
                <div>
                  <textarea
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #7c3aed',
                      background: 'var(--vscode-input-background)',
                      color: 'var(--vscode-foreground)',
                      fontSize: '13px',
                      fontFamily: 'var(--vscode-font-family)',
                      resize: 'vertical',
                      boxSizing: 'border-box',
                      outline: 'none',
                      marginBottom: '8px',
                    }}
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Escape') setEditingId(null);
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveEdit(m);
                    }}
                  />
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <SmallButton onClick={() => saveEdit(m)}>Save</SmallButton>
                    <SmallButton variant="ghost" onClick={() => setEditingId(null)}>Cancel</SmallButton>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <p style={{ fontSize: '13px', flex: 1, lineHeight: 1.5, margin: 0 }}>
                    {m.content}
                  </p>
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    <SmallButton variant="ghost" onClick={() => startEdit(m)}>Edit</SmallButton>
                    {confirmDeleteId === m.id ? (
                      <>
                        <SmallButton variant="danger" onClick={() => confirmDelete(m.id)}>Confirm</SmallButton>
                        <SmallButton variant="ghost" onClick={() => setConfirmDeleteId(null)}>Cancel</SmallButton>
                      </>
                    ) : (
                      <SmallButton variant="ghost" onClick={() => setConfirmDeleteId(m.id)}>
                        Delete
                      </SmallButton>
                    )}
                  </div>
                </div>
              )}
              {m.created_at && !editingId && (
                <p style={{ fontSize: '11px', opacity: 0.35, marginTop: '6px', margin: '6px 0 0 0' }}>
                  {new Date(m.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SmallButton({
  children,
  onClick,
  variant = 'default',
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'ghost' | 'danger';
}) {
  const styles: React.CSSProperties = {
    padding: '4px 10px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'var(--vscode-font-family)',
    border: 'none',
    ...(variant === 'default' && { background: '#7c3aed', color: '#fff' }),
    ...(variant === 'ghost' && {
      background: 'transparent',
      color: 'var(--vscode-foreground)',
      border: '1px solid var(--vscode-panel-border, #555)',
    }),
    ...(variant === 'danger' && { background: '#dc2626', color: '#fff' }),
  };
  return <button onClick={onClick} style={styles}>{children}</button>;
}
