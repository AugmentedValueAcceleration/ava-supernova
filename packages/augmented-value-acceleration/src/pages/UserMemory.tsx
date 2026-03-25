import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import PageHeader from '../components/PageHeader';
import { theme, pageStyle, inputStyle as themeInputStyle, cardStyle, statCardStyle, chipStyle, emptyStateStyle } from '../lib/theme';

interface Memory {
  id: string;
  category: string;
  content: string;
  recall_count: number;
  created_at: string;
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  global: { bg: theme.accentBg, text: theme.accent },
  project: { bg: theme.blueBg, text: theme.blue },
  personal: { bg: theme.greenBg, text: theme.green },
  preference: { bg: theme.yellowBg, text: theme.yellow },
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

  return (
    <div style={pageStyle}>
      <PageHeader title="My Memory" subtitle="Ava's stored memories about you and your projects." onRefresh={fetchMemories} />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total Memories', value: stats.total, color: theme.text },
          { label: 'Global', value: stats.global, color: theme.accent },
          { label: 'Project', value: stats.project, color: theme.blue },
        ].map(s => (
          <div key={s.label} style={statCardStyle}>
            <div style={{ fontSize: 11, fontWeight: 500, color: theme.textMuted }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color, marginTop: 4 }}>{loading ? '...' : s.value}</div>
          </div>
        ))}
      </div>

      {/* Search + Filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <input
          style={{ ...themeInputStyle, flex: 1 }}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search memories..."
        />
        <select
          style={{ ...themeInputStyle, width: 'auto', minWidth: 140 }}
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
        >
          <option value="all">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </select>
      </div>

      {/* Loading */}
      {loading && <div style={{ textAlign: 'center', color: theme.textMuted, padding: 60 }}>Loading memories...</div>}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div style={emptyStateStyle}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#129504;</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: theme.textSecondary, marginBottom: 8 }}>No memories stored</div>
          <div style={{ fontSize: 14, color: theme.textMuted }}>Ava will remember things as you interact with her.</div>
        </div>
      )}

      {/* Memory List */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(memory => {
            const cc = CATEGORY_COLORS[memory.category] || { bg: 'rgba(107, 114, 128, 0.12)', text: theme.textSecondary };

            return (
              <div key={memory.id} style={{ ...cardStyle, padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={chipStyle(cc.bg, cc.text)}>{memory.category}</span>
                      <span style={{ fontSize: 11, color: theme.textMuted }}>{formatDate(memory.created_at)}</span>
                      <span style={{ fontSize: 10, color: theme.textMuted }}>
                        Recalled {memory.recall_count} time{memory.recall_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: theme.text, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {memory.content}
                    </div>
                  </div>

                  <div style={{ flexShrink: 0 }}>
                    {deleteConfirm === memory.id ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          onClick={() => deleteMemory(memory.id)}
                          style={{
                            background: theme.redBg, border: `1px solid ${theme.red}`, borderRadius: 6,
                            padding: '4px 10px', fontSize: 10, color: theme.red, cursor: 'pointer',
                          }}
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          style={{
                            background: 'none', border: `1px solid ${theme.border}`, borderRadius: 6,
                            padding: '4px 10px', fontSize: 10, color: theme.textSecondary, cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(memory.id)}
                        style={{
                          background: 'none', border: `1px solid ${theme.border}`, borderRadius: 6,
                          padding: '4px 10px', fontSize: 10, color: theme.red, cursor: 'pointer',
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
