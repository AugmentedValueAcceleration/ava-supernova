import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Memory {
  id: string;
  category: string;
  content: string;
  recall_count: number;
  created_at: string;
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  global: { bg: 'rgba(168, 85, 247, 0.12)', text: '#a855f7' },
  project: { bg: 'rgba(59, 130, 246, 0.12)', text: '#60a5fa' },
  personal: { bg: 'rgba(34, 197, 94, 0.12)', text: '#4ade80' },
  preference: { bg: 'rgba(245, 158, 11, 0.12)', text: '#fbbf24' },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function UserMemory() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchMemories = async () => {
    setLoading(true);
    try {
      let query = supabase.from('memories').select('*').order('created_at', { ascending: false });
      if (categoryFilter !== 'all') query = query.eq('category', categoryFilter);
      const { data } = await query.limit(500);
      setMemories(data || []);
    } catch {
      // silent
    }
    setLoading(false);
  };

  useEffect(() => { fetchMemories(); }, [categoryFilter]);

  async function deleteMemory(id: string) {
    try {
      await supabase.from('memories').delete().eq('id', id);
      setMemories(prev => prev.filter(m => m.id !== id));
      setDeleteConfirm(null);
    } catch {
      // silent
    }
  }

  const filtered = search
    ? memories.filter(m =>
        m.content?.toLowerCase().includes(search.toLowerCase()) ||
        m.category?.toLowerCase().includes(search.toLowerCase())
      )
    : memories;

  const categories = [...new Set(memories.map(m => m.category))].sort();
  const stats = {
    total: memories.length,
    global: memories.filter(m => m.category === 'global').length,
    project: memories.filter(m => m.category === 'project').length,
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', background: '#1a1a35', border: '1px solid #1f1f3a',
    borderRadius: 10, color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ padding: '32px 40px', overflowY: 'auto', height: '100%', background: '#0a0a1a' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: 0 }}>My Memory</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4, marginBottom: 24 }}>
        Ava's stored memories about you and your projects.
      </p>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total Memories', value: stats.total, color: '#fff' },
          { label: 'Global', value: stats.global, color: '#a855f7' },
          { label: 'Project', value: stats.project, color: '#60a5fa' },
        ].map(s => (
          <div key={s.label} style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 14, padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: '#6b7280' }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color, marginTop: 4 }}>{loading ? '...' : s.value}</div>
          </div>
        ))}
      </div>

      {/* Search + Filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <input
          style={{ ...inputStyle, flex: 1 }}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search memories..."
        />
        <select
          style={{ ...inputStyle, width: 'auto', minWidth: 140 }}
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
        >
          <option value="all">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </select>
      </div>

      {/* Loading */}
      {loading && <div style={{ textAlign: 'center', color: '#6b7280', padding: 60 }}>Loading memories...</div>}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 80, color: '#6b7280' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#129504;</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#9ca3af', marginBottom: 8 }}>No memories stored</div>
          <div style={{ fontSize: 14 }}>Ava will remember things as you interact with her.</div>
        </div>
      )}

      {/* Memory List */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(memory => {
            const cc = CATEGORY_COLORS[memory.category] || { bg: 'rgba(107, 114, 128, 0.12)', text: '#9ca3af' };

            return (
              <div key={memory.id} style={{
                background: '#111127', border: '1px solid #1f1f3a', borderRadius: 14, padding: '16px 20px',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{
                        background: cc.bg, color: cc.text, fontSize: 10, fontWeight: 700,
                        padding: '3px 10px', borderRadius: 10, textTransform: 'capitalize' as const,
                      }}>
                        {memory.category}
                      </span>
                      <span style={{ fontSize: 11, color: '#6b7280' }}>{formatDate(memory.created_at)}</span>
                      <span style={{ fontSize: 10, color: '#4b5563' }}>
                        Recalled {memory.recall_count} time{memory.recall_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: '#e5e7eb', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {memory.content}
                    </div>
                  </div>

                  <div style={{ flexShrink: 0 }}>
                    {deleteConfirm === memory.id ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          onClick={() => deleteMemory(memory.id)}
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
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(memory.id)}
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
            );
          })}
        </div>
      )}
    </div>
  );
}
