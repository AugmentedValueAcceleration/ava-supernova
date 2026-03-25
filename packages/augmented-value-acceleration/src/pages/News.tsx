import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import PageHeader from '../components/PageHeader';
import { theme } from '../lib/theme';

/* ── Categories ────────────────────────────────────────────────────── */

const CATEGORIES: Record<string, { label: string; icon: string }> = {
  'ai-agents':    { label: 'AI Agents',           icon: '🤖' },
  'models':       { label: 'Models & Benchmarks',  icon: '🧠' },
  'dev-tools':    { label: 'Developer Tools',      icon: '🛠️' },
  'open-source':  { label: 'Open Source',           icon: '📦' },
  'education':    { label: 'AI Education',          icon: '🎓' },
  'productivity': { label: 'Productivity & AI',     icon: '⚡' },
  'companions':   { label: 'AI Companions',         icon: '💬' },
  'health':       { label: 'Health & Wellness',     icon: '🏥' },
  'enterprise':   { label: 'Enterprise AI',         icon: '🏢' },
  'industry':     { label: 'Industry & Policy',     icon: '📰' },
};

/* ── Priority config ──────────────────────────────────────────────── */

const PRIORITIES: Record<string, { label: string; bg: string; text: string }> = {
  breaking:  { label: 'Breaking',  bg: 'rgba(239,68,68,0.2)',   text: '#f87171' },
  high:      { label: 'High',      bg: 'rgba(249,115,22,0.2)',  text: '#fb923c' },
  normal:    { label: 'Normal',    bg: 'rgba(59,130,246,0.2)',   text: '#60a5fa' },
  evergreen: { label: 'Evergreen', bg: 'rgba(16,185,129,0.2)',  text: '#34d399' },
};

const SENTIMENT_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  positive: { label: 'Positive', bg: 'rgba(16,185,129,0.2)',  text: '#34d399' },
  negative: { label: 'Negative', bg: 'rgba(239,68,68,0.2)',   text: '#f87171' },
  neutral:  { label: 'Neutral',  bg: 'rgba(107,114,128,0.2)', text: '#9ca3af' },
  mixed:    { label: 'Mixed',    bg: 'rgba(245,158,11,0.2)',   text: '#fbbf24' },
};

/* ── Competitor quick filters ─────────────────────────────────────── */

const COMPETITOR_FILTERS = ['Cursor', 'Copilot', 'Windsurf', 'Devin', 'Bolt', 'v0'];

/* ── Platform URL for server-side APIs ────────────────────────────── */

const PLATFORM_URL = import.meta.env.VITE_PLATFORM_URL || 'https://ava-platform.vercel.app';

/* ── Types ─────────────────────────────────────────────────────────── */

interface NewsPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  published: boolean;
  category: string;
  source_url: string | null;
  source_author: string | null;
  source_publication: string | null;
  sources: { url: string; title: string; author: string | null; publication: string | null }[] | null;
  ai_generated: boolean;
  image_url: string | null;
  tags: string[];
  priority: string;
  scheduled_at: string | null;
  featured: boolean;
  series: string | null;
  view_count: number;
  reading_time: number | null;
  sentiment: string | null;
  ava_commentary: string | null;
  share_text: string | null;
  created_at: string;
  updated_at: string;
}

interface SearchResult {
  title: string;
  url: string;
  description: string;
  publication: string;
  age: string | null;
}

type Tab = 'published' | 'drafts' | 'discover';
type SortOption = 'newest' | 'oldest' | 'most-viewed' | 'priority';

/* ── Colours ───────────────────────────────────────────────────────── */

const C = {
  page:      theme.pageBg,
  card:      theme.cardBg,
  border:    theme.border,
  input:     theme.inputBg,
  purple:    theme.accent,
  purpleBg:  theme.accentBg,
  text:      theme.text,
  secondary: theme.textSecondary,
  muted:     theme.textMuted,
  green:     theme.green,
  greenBg:   theme.greenBg,
  amber:     theme.yellow,
  amberBg:   theme.yellowBg,
  red:       theme.red,
  redBg:     theme.redBg,
};

/* ── Shared styles ─────────────────────────────────────────────────── */

const s = {
  label: {
    display: 'block',
    fontSize: 10,
    fontWeight: 400,
    letterSpacing: '1.2px',
    textTransform: 'uppercase' as const,
    color: C.muted,
    marginBottom: 6,
  },
  input: {
    width: '100%',
    background: C.input,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 13,
    color: C.text,
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  select: {
    background: C.input,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 13,
    color: C.text,
    outline: 'none',
    cursor: 'pointer',
    appearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%236b7280' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    paddingRight: 32,
    boxSizing: 'border-box' as const,
  },
  card: {
    background: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: 16,
    padding: 24,
  },
  badge: (bg: string, text: string): React.CSSProperties => ({
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: 99,
    fontSize: 10,
    fontWeight: 400,
    background: bg,
    color: text,
    lineHeight: '16px',
  }),
  btn: (bg: string, color: string, border?: string): React.CSSProperties => ({
    background: bg,
    color,
    border: border ? `1px solid ${border}` : 'none',
    borderRadius: 8,
    padding: '8px 18px',
    fontSize: 12,
    fontWeight: 400,
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  }),
  btnSmall: (bg: string, color: string, border?: string): React.CSSProperties => ({
    background: bg,
    color,
    border: border ? `1px solid ${border}` : 'none',
    borderRadius: 8,
    padding: '5px 12px',
    fontSize: 10,
    fontWeight: 400,
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  }),
};

/* ── Component ─────────────────────────────────────────────────────── */

export default function News() {
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('published');

  // Filters
  const [filterCategory, setFilterCategory] = useState('');
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  // Bulk selection
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());

  // Editor
  const [editing, setEditing] = useState<NewsPost | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [form, setForm] = useState(defaultForm());
  const [saving, setSaving] = useState(false);

  // Discover state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCategory, setSearchCategory] = useState('any');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  useEffect(() => { loadPosts(); }, []);

  /* ── Data loading ── */

  async function loadPosts() {
    setLoading(true);
    const { data } = await supabase
      .from('news_posts')
      .select('*')
      .order('created_at', { ascending: false });
    setPosts(data || []);
    setLoading(false);
  }

  /* ── Default form ── */

  function defaultForm() {
    return {
      title: '',
      slug: '',
      excerpt: '',
      content: '',
      published: false,
      category: 'industry',
      image_url: '',
      source_url: '',
      source_author: '',
      source_publication: '',
      sources: [] as { url: string; title: string; author: string | null; publication: string | null }[],
      ai_generated: false,
      tags: '',
      priority: 'normal',
      scheduled_at: '',
      featured: false,
      series: '',
      sentiment: '',
      ava_commentary: '',
      share_text: '',
    };
  }

  /* ── Stats ── */

  const stats = useMemo(() => {
    const total = posts.length;
    const published = posts.filter(p => p.published).length;
    const drafts = total - published;
    const aiCurated = posts.filter(p => p.ai_generated).length;
    const featured = posts.filter(p => p.featured).length;
    return { total, published, drafts, aiCurated, featured };
  }, [posts]);

  /* ── Filtered posts based on tab ── */

  const filteredPosts = useMemo(() => {
    let result = posts.filter(p => {
      if (tab === 'published' && !p.published) return false;
      if (tab === 'drafts' && p.published) return false;
      if (filterCategory && p.category !== filterCategory) return false;
      if (searchText) {
        const q = searchText.toLowerCase();
        if (!p.title.toLowerCase().includes(q) && !(p.excerpt || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });

    const priorityOrder: Record<string, number> = { breaking: 0, high: 1, normal: 2, evergreen: 3 };
    switch (sortBy) {
      case 'oldest':
        result = [...result].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        break;
      case 'most-viewed':
        result = [...result].sort((a, b) => (b.view_count || 0) - (a.view_count || 0));
        break;
      case 'priority':
        result = [...result].sort((a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2));
        break;
      default:
        result = [...result].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
    }

    return result;
  }, [posts, tab, filterCategory, searchText, sortBy]);

  /* ── Helpers ── */

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  }

  function wordCount(text: string): number {
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  function generateSlug(title: string): string {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  /* ── CRUD ── */

  function startCreate() {
    setEditing(null);
    setForm(defaultForm());
    setShowEditor(true);
  }

  function startEdit(post: NewsPost) {
    setEditing(post);
    setForm({
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt || '',
      content: post.content,
      published: post.published,
      category: post.category || 'industry',
      image_url: post.image_url || '',
      source_url: post.source_url || '',
      source_author: post.source_author || '',
      source_publication: post.source_publication || '',
      sources: post.sources || [],
      ai_generated: post.ai_generated || false,
      tags: (post.tags || []).join(', '),
      priority: post.priority || 'normal',
      scheduled_at: post.scheduled_at ? new Date(post.scheduled_at).toISOString().slice(0, 16) : '',
      featured: post.featured || false,
      series: post.series || '',
      sentiment: post.sentiment || '',
      ava_commentary: post.ava_commentary || '',
      share_text: post.share_text || '',
    });
    setShowEditor(true);
  }

  async function handleSave() {
    setSaving(true);
    const tagsArray = form.tags.split(',').map(t => t.trim()).filter(Boolean);
    const wc = wordCount(form.content);
    const readingTime = Math.ceil(wc / 200);

    const payload = {
      title: form.title,
      slug: form.slug,
      excerpt: form.excerpt || null,
      content: form.content,
      published: form.published,
      category: form.category || 'industry',
      image_url: form.image_url || null,
      source_url: form.source_url || null,
      source_author: form.source_author || null,
      source_publication: form.source_publication || null,
      sources: form.sources.length > 0 ? form.sources : null,
      ai_generated: form.ai_generated,
      tags: tagsArray,
      priority: form.priority,
      reading_time: readingTime,
      scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
      featured: form.featured,
      series: form.series || null,
      sentiment: form.sentiment || null,
      ava_commentary: form.ava_commentary || null,
      share_text: form.share_text || null,
    };

    if (editing) {
      await supabase.from('news_posts').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('news_posts').insert(payload);
    }

    setShowEditor(false);
    setSaving(false);
    loadPosts();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this post?')) return;
    await supabase.from('news_posts').delete().eq('id', id);
    loadPosts();
  }

  async function togglePublished(post: NewsPost) {
    await supabase.from('news_posts').update({ published: !post.published }).eq('id', post.id);
    loadPosts();
  }

  /* ── Bulk actions ── */

  function toggleBulkSelect(id: string) {
    setBulkSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    if (bulkSelected.size === filteredPosts.length) {
      setBulkSelected(new Set());
    } else {
      setBulkSelected(new Set(filteredPosts.map(p => p.id)));
    }
  }

  async function bulkPublish() {
    if (!confirm(`Publish ${bulkSelected.size} selected posts?`)) return;
    for (const id of bulkSelected) {
      await supabase.from('news_posts').update({ published: true }).eq('id', id);
    }
    setBulkSelected(new Set());
    loadPosts();
  }

  async function bulkDelete() {
    if (!confirm(`Delete ${bulkSelected.size} selected posts? This cannot be undone.`)) return;
    for (const id of bulkSelected) {
      await supabase.from('news_posts').delete().eq('id', id);
    }
    setBulkSelected(new Set());
    loadPosts();
  }

  /* ── Discover flow ── */

  async function handleDiscover() {
    setSearching(true);
    setSearchResults([]);
    setDiscoverError(null);

    try {
      const res = await fetch(`${PLATFORM_URL}/api/admin/news/discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, category: searchCategory }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDiscoverError(data.error || `Search failed (${res.status})`);
      } else {
        setSearchResults(data.results || []);
      }
    } catch (err) {
      setDiscoverError(err instanceof Error ? err.message : 'Search request failed');
    } finally {
      setSearching(false);
    }
  }

  async function addToDrafts(result: SearchResult) {
    const slug = generateSlug(result.title);
    await supabase.from('news_posts').insert({
      title: result.title,
      slug,
      excerpt: result.description,
      content: '',
      published: false,
      category: 'industry',
      source_url: result.url,
      source_publication: result.publication,
      ai_generated: false,
      tags: [],
      priority: 'normal',
      featured: false,
      reading_time: 0,
    });
    loadPosts();
  }

  /* ═══════════════════════════════════════════════════════════════════
     LOADING
     ═══════════════════════════════════════════════════════════════════ */

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: C.page }}>
        <div style={{
          width: 24, height: 24, borderRadius: '50%',
          border: `2px solid ${C.border}`, borderTopColor: C.purple,
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════════
     EDITOR MODAL
     ═══════════════════════════════════════════════════════════════════ */

  function renderEditor() {
    if (!showEditor) return null;

    const canSave = form.title && form.slug && form.content;
    const currentWordCount = wordCount(form.content);
    const readingTime = Math.ceil(currentWordCount / 200);

    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}>
        <div style={{
          background: C.page,
          border: `1px solid ${C.border}`,
          borderRadius: 20,
          width: '100%',
          maxWidth: 900,
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: 32,
        }}>
          {/* Editor header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 400, color: C.text, margin: 0 }}>
                {editing ? 'Edit Post' : 'New Post'}
              </h2>
              <p style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
                {form.content ? `${currentWordCount} words · ${form.content.length.toLocaleString()} chars · ${readingTime} min read` : 'Start writing...'}
              </p>
            </div>
            <button
              onClick={() => setShowEditor(false)}
              style={{ ...s.btn('transparent', C.secondary, C.border) }}
            >
              Cancel
            </button>
          </div>

          {/* Title + Slug */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={s.label}>Title</label>
              <input
                type="text"
                value={form.title}
                onChange={e => {
                  const autoSlug = !editing;
                  setForm(f => ({
                    ...f,
                    title: e.target.value,
                    slug: autoSlug ? generateSlug(e.target.value) : f.slug,
                  }));
                }}
                style={s.input}
                placeholder="Article title"
              />
            </div>
            <div>
              <label style={s.label}>Slug</label>
              <div style={{ display: 'flex' }}>
                <span style={{
                  background: C.card,
                  border: `1px solid ${C.border}`,
                  borderRight: 'none',
                  borderRadius: '8px 0 0 8px',
                  padding: '10px 10px',
                  fontSize: 12,
                  color: C.muted,
                  display: 'flex',
                  alignItems: 'center',
                }}>/news/</span>
                <input
                  type="text"
                  value={form.slug}
                  onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                  style={{ ...s.input, borderRadius: '0 8px 8px 0' }}
                />
              </div>
            </div>
          </div>

          {/* Excerpt */}
          <div style={{ marginBottom: 16 }}>
            <label style={s.label}>Excerpt</label>
            <input
              type="text"
              value={form.excerpt}
              onChange={e => setForm(f => ({ ...f, excerpt: e.target.value }))}
              placeholder="Short summary for cards and SEO"
              style={s.input}
            />
          </div>

          {/* Category + Priority */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={s.label}>Category</label>
              <select
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                style={{ ...s.select, width: '100%' } as React.CSSProperties}
              >
                {Object.entries(CATEGORIES).map(([val, { label, icon }]) => (
                  <option key={val} value={val}>{icon} {label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={s.label}>Priority</label>
              <select
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                style={{ ...s.select, width: '100%' } as React.CSSProperties}
              >
                {Object.entries(PRIORITIES).map(([val, { label }]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Tags + Series */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={s.label}>Tags (comma-separated)</label>
              <input
                type="text"
                value={form.tags}
                onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                placeholder="e.g. cursor, vscode, agents"
                style={s.input}
              />
              {form.tags && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {form.tags.split(',').map(t => t.trim()).filter(Boolean).map((tag, i) => (
                    <span key={i} style={s.badge(C.purpleBg, C.purple)}>{tag}</span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label style={s.label}>Series</label>
              <input
                type="text"
                value={form.series}
                onChange={e => setForm(f => ({ ...f, series: e.target.value }))}
                placeholder="e.g. Weekly Roundup"
                style={s.input}
              />
            </div>
          </div>

          {/* Sentiment + Scheduled + Featured */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={s.label}>Sentiment</label>
              <select
                value={form.sentiment}
                onChange={e => setForm(f => ({ ...f, sentiment: e.target.value }))}
                style={{ ...s.select, width: '100%' } as React.CSSProperties}
              >
                <option value="">None</option>
                {Object.entries(SENTIMENT_CONFIG).map(([val, { label }]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={s.label}>Scheduled Publish</label>
              <input
                type="datetime-local"
                value={form.scheduled_at}
                onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))}
                style={s.input}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.featured}
                  onChange={e => setForm(f => ({ ...f, featured: e.target.checked }))}
                  style={{ width: 16, height: 16, accentColor: C.purple }}
                />
                <span style={{ fontSize: 13, color: C.secondary }}>Featured Article</span>
              </label>
            </div>
          </div>

          {/* Content */}
          <div style={{ marginBottom: 16 }}>
            <label style={s.label}>Content (Markdown)</label>
            <textarea
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              rows={14}
              style={{
                ...s.input,
                fontFamily: 'monospace',
                lineHeight: 1.7,
                resize: 'vertical',
              }}
            />
          </div>

          {/* Ava Commentary */}
          <div style={{ marginBottom: 16 }}>
            <label style={s.label}>Ava Commentary</label>
            <textarea
              value={form.ava_commentary}
              onChange={e => setForm(f => ({ ...f, ava_commentary: e.target.value }))}
              rows={3}
              placeholder="Ava's take on this story..."
              style={{ ...s.input, resize: 'vertical', lineHeight: 1.6 }}
            />
          </div>

          {/* Share Text */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ ...s.label, marginBottom: 0 }}>Share Text</label>
              <span style={{ fontSize: 10, color: form.share_text.length > 280 ? C.red : C.muted }}>
                {form.share_text.length}/280
              </span>
            </div>
            <input
              type="text"
              value={form.share_text}
              onChange={e => setForm(f => ({ ...f, share_text: e.target.value }))}
              placeholder="Pre-written tweet or share text"
              style={s.input}
            />
          </div>

          {/* Source Attribution */}
          <div style={{ ...s.card, marginBottom: 24, padding: 20 }}>
            <h3 style={{ ...s.label, marginBottom: 14 }}>Source Attribution</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 10, color: C.muted, display: 'block', marginBottom: 4 }}>Source URL</label>
                <input
                  type="url"
                  value={form.source_url}
                  onChange={e => setForm(f => ({ ...f, source_url: e.target.value }))}
                  style={{ ...s.input, fontSize: 12, padding: '8px 12px' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 10, color: C.muted, display: 'block', marginBottom: 4 }}>Author</label>
                <input
                  type="text"
                  value={form.source_author}
                  onChange={e => setForm(f => ({ ...f, source_author: e.target.value }))}
                  style={{ ...s.input, fontSize: 12, padding: '8px 12px' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 10, color: C.muted, display: 'block', marginBottom: 4 }}>Publication</label>
                <input
                  type="text"
                  value={form.source_publication}
                  onChange={e => setForm(f => ({ ...f, source_publication: e.target.value }))}
                  style={{ ...s.input, fontSize: 12, padding: '8px 12px' }}
                />
              </div>
            </div>

            {form.sources.length > 0 && (
              <div style={{ marginTop: 14, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
                <p style={{ fontSize: 10, fontWeight: 400, color: C.muted, marginBottom: 8 }}>
                  All Sources ({form.sources.length})
                </p>
                {form.sources.map((src, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.secondary, marginBottom: 4 }}>
                    <span style={{ color: C.muted }}>{i + 1}.</span>
                    <a href={src.url} target="_blank" rel="noopener noreferrer" style={{ color: C.purple, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {src.title}
                    </a>
                    {src.publication && <span style={{ color: C.muted, flexShrink: 0 }}>— {src.publication}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              style={{
                ...s.btn(C.purple, '#fff'),
                opacity: (!canSave || saving) ? 0.4 : 1,
                cursor: (!canSave || saving) ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Saving...' : editing ? 'Save Changes' : form.published ? 'Create & Publish' : 'Create as Draft'}
            </button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.published}
                onChange={e => setForm(f => ({ ...f, published: e.target.checked }))}
                style={{ width: 14, height: 14, accentColor: C.purple }}
              />
              <span style={{ fontSize: 12, color: C.secondary }}>Publish immediately</span>
            </label>
            {editing && (
              <button
                onClick={() => { handleDelete(editing.id); setShowEditor(false); }}
                style={s.btn('transparent', C.red, 'rgba(239,68,68,0.3)')}
              >
                Delete
              </button>
            )}
            {form.ai_generated && (
              <span style={s.badge(C.purpleBg, C.purple)}>AI-CURATED</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════════
     DISCOVER VIEW
     ═══════════════════════════════════════════════════════════════════ */

  function renderDiscover() {
    return (
      <div>
        {/* Competitor quick filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 10, fontWeight: 400, letterSpacing: '1.2px', textTransform: 'uppercase' as const, color: C.muted }}>Quick:</span>
          {COMPETITOR_FILTERS.map(name => (
            <button
              key={name}
              onClick={() => setSearchQuery(`${name} AI coding agent news`)}
              style={{
                background: 'transparent',
                border: `1px solid ${C.border}`,
                borderRadius: 99,
                padding: '5px 14px',
                fontSize: 11,
                color: C.secondary,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.purple; e.currentTarget.style.color = C.text; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.secondary; }}
            >
              {name}
            </button>
          ))}
        </div>

        {/* Search bar */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleDiscover(); }}
            placeholder="Search for AI news..."
            style={{ ...s.input, flex: 1 }}
          />
          <select
            value={searchCategory}
            onChange={e => setSearchCategory(e.target.value)}
            style={{ ...s.select, width: 180 } as React.CSSProperties}
          >
            <option value="any">Any Category</option>
            {Object.entries(CATEGORIES).map(([val, { label }]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          <button
            onClick={handleDiscover}
            disabled={searching}
            style={{
              ...s.btn(C.purple, '#fff'),
              opacity: searching ? 0.5 : 1,
              cursor: searching ? 'not-allowed' : 'pointer',
              minWidth: 100,
            }}
          >
            {searching ? 'Searching...' : 'Discover'}
          </button>
        </div>

        {/* Error */}
        {discoverError && (
          <div style={{
            background: C.redBg,
            border: `1px solid rgba(239,68,68,0.3)`,
            borderRadius: 12,
            padding: '12px 16px',
            fontSize: 12,
            color: C.red,
            marginBottom: 16,
          }}>
            {discoverError}
          </div>
        )}

        {/* Loading */}
        {searching && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0' }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              border: `2px solid ${C.border}`, borderTopColor: C.purple,
              animation: 'spin 0.8s linear infinite',
            }} />
          </div>
        )}

        {/* Results */}
        {!searching && searchResults.length > 0 && (
          <div>
            <p style={{ fontSize: 12, color: C.secondary, marginBottom: 16 }}>
              {searchResults.length} results found — add stories to your drafts
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {searchResults.map((result, i) => (
                <div
                  key={i}
                  style={{
                    ...s.card,
                    padding: 20,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 16,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 400, color: C.text, margin: 0 }}>{result.title}</h3>
                    <p style={{ fontSize: 12, color: C.secondary, marginTop: 6, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as React.CSSProperties}>
                      {result.description}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, fontSize: 10, color: C.muted }}>
                      <span>{result.publication}</span>
                      {result.age && <span>{result.age}</span>}
                      {result.url && (
                        <a
                          href={result.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: C.purple, textDecoration: 'none' }}
                        >
                          View source
                        </a>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => addToDrafts(result)}
                    style={{
                      ...s.btn('transparent', C.green, 'rgba(16,185,129,0.3)'),
                      flexShrink: 0,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Add to Drafts
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!searching && searchResults.length === 0 && !discoverError && (
          <div style={{ ...s.card, padding: '60px 24px', textAlign: 'center' as const }}>
            <p style={{ fontSize: 28, marginBottom: 12 }}>🔍</p>
            <p style={{ fontSize: 14, color: C.muted }}>
              Enter a search query and click Discover to find stories
            </p>
          </div>
        )}
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════════
     POST LIST
     ═══════════════════════════════════════════════════════════════════ */

  function renderPostList() {
    return (
      <div>
        {/* Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <input
            type="text"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="Search posts..."
            style={{ ...s.input, flex: 1 }}
          />
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            style={{ ...s.select, width: 180 } as React.CSSProperties}
          >
            <option value="">All Categories</option>
            {Object.entries(CATEGORIES).map(([val, { label, icon }]) => (
              <option key={val} value={val}>{icon} {label}</option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortOption)}
            style={{ ...s.select, width: 150 } as React.CSSProperties}
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="most-viewed">Most Viewed</option>
            <option value="priority">Priority</option>
          </select>
        </div>

        {/* Bulk actions bar */}
        {bulkSelected.size > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: C.purpleBg,
            border: `1px solid rgba(168,85,247,0.3)`,
            borderRadius: 12,
            padding: '12px 18px',
            marginBottom: 16,
          }}>
            <span style={{ fontSize: 12, fontWeight: 400, color: C.text }}>{bulkSelected.size} selected</span>
            <button onClick={bulkPublish} style={s.btnSmall('transparent', C.green, 'rgba(16,185,129,0.3)')}>
              Publish Selected
            </button>
            <button onClick={bulkDelete} style={s.btnSmall('transparent', C.red, 'rgba(239,68,68,0.3)')}>
              Delete Selected
            </button>
            <button
              onClick={() => setBulkSelected(new Set())}
              style={{ ...s.btnSmall('transparent', C.muted), marginLeft: 'auto', border: 'none' }}
            >
              Clear
            </button>
          </div>
        )}

        {/* Select all */}
        {filteredPosts.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <button
              onClick={selectAllVisible}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'transparent', border: 'none',
                fontSize: 11, color: C.muted, cursor: 'pointer',
              }}
            >
              <div style={{
                width: 16, height: 16, borderRadius: 4,
                border: `1px solid ${bulkSelected.size === filteredPosts.length && filteredPosts.length > 0 ? C.purple : C.border}`,
                background: bulkSelected.size === filteredPosts.length && filteredPosts.length > 0 ? C.purple : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}>
                {bulkSelected.size === filteredPosts.length && filteredPosts.length > 0 && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              Select All ({filteredPosts.length})
            </button>
          </div>
        )}

        {/* Post rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filteredPosts.map(post => {
            const cat = CATEGORIES[post.category];
            const pri = PRIORITIES[post.priority];
            const sent = post.sentiment ? SENTIMENT_CONFIG[post.sentiment] : null;
            const isHovered = hoveredRow === post.id;

            return (
              <div
                key={post.id}
                style={{
                  ...s.card,
                  padding: 18,
                  borderColor: isHovered ? 'rgba(168, 85, 247, 0.2)' : C.border,
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={() => setHoveredRow(post.id)}
                onMouseLeave={() => setHoveredRow(null)}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleBulkSelect(post.id)}
                    style={{
                      width: 20, height: 20, borderRadius: 4, marginTop: 2,
                      border: `1px solid ${bulkSelected.has(post.id) ? C.purple : C.border}`,
                      background: bulkSelected.has(post.id) ? C.purple : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', flexShrink: 0,
                      opacity: bulkSelected.has(post.id) || isHovered ? 1 : 0.3,
                      transition: 'all 0.15s',
                    }}
                  >
                    {bulkSelected.has(post.id) && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>

                  {/* Thumbnail */}
                  {post.image_url ? (
                    <img
                      src={post.image_url}
                      alt=""
                      style={{ width: 80, height: 56, objectFit: 'cover', borderRadius: 10, flexShrink: 0 }}
                    />
                  ) : (
                    <div style={{
                      width: 80, height: 56, borderRadius: 10, flexShrink: 0,
                      background: C.input, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 22,
                    }}>
                      {cat?.icon || '📰'}
                    </div>
                  )}

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <h3 style={{
                          fontSize: 14, fontWeight: 400, color: C.text, margin: 0,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {post.title}
                        </h3>
                        {post.excerpt && (
                          <p style={{
                            fontSize: 12, color: C.secondary, marginTop: 4,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {post.excerpt}
                          </p>
                        )}
                      </div>

                      {/* Actions — visible on hover */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
                        opacity: isHovered ? 1 : 0,
                        transition: 'opacity 0.15s',
                      }}>
                        <button
                          onClick={() => togglePublished(post)}
                          style={s.btnSmall(
                            'transparent',
                            post.published ? C.amber : C.green,
                            post.published ? 'rgba(245,158,11,0.3)' : 'rgba(16,185,129,0.3)',
                          )}
                        >
                          {post.published ? 'Unpublish' : 'Publish'}
                        </button>
                        <button
                          onClick={() => startEdit(post)}
                          style={s.btnSmall('transparent', C.secondary, C.border)}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(post.id)}
                          style={s.btnSmall('transparent', C.red, 'rgba(239,68,68,0.3)')}
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {/* Meta row */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10 }}>
                      <span style={s.badge(
                        post.published ? C.greenBg : C.input,
                        post.published ? C.green : C.muted,
                      )}>
                        {post.published ? 'Published' : 'Draft'}
                      </span>
                      {cat && (
                        <span style={s.badge(C.input, C.secondary)}>
                          {cat.icon} {cat.label}
                        </span>
                      )}
                      {pri && post.priority !== 'normal' && (
                        <span style={s.badge(pri.bg, pri.text)}>
                          {pri.label}
                        </span>
                      )}
                      {post.featured && (
                        <span style={s.badge('rgba(168,85,247,0.2)', '#c084fc')}>
                          Featured
                        </span>
                      )}
                      {sent && (
                        <span style={s.badge(sent.bg, sent.text)}>
                          {sent.label}
                        </span>
                      )}
                      {post.ai_generated && (
                        <span style={s.badge(C.purpleBg, C.purple)}>
                          AI-Curated
                        </span>
                      )}
                      {(post.tags || []).slice(0, 3).map(tag => (
                        <span key={tag} style={s.badge(C.input, C.muted)}>
                          #{tag}
                        </span>
                      ))}
                      {(post.tags || []).length > 3 && (
                        <span style={{ fontSize: 10, color: C.muted }}>+{post.tags.length - 3}</span>
                      )}
                      {post.source_publication && (
                        <span style={{ fontSize: 10, color: C.muted }}>via {post.source_publication}</span>
                      )}
                      {post.view_count > 0 && (
                        <span style={{ fontSize: 10, color: C.muted }}>{post.view_count} views</span>
                      )}
                      {post.reading_time && (
                        <span style={{ fontSize: 10, color: C.muted }}>{post.reading_time}m read</span>
                      )}
                      <span style={{ fontSize: 10, color: C.muted }}>{timeAgo(post.updated_at)}</span>
                      <span style={{ fontSize: 10, color: C.muted }}>/news/{post.slug}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredPosts.length === 0 && (
            <div style={{ ...s.card, padding: '60px 24px', textAlign: 'center' as const }}>
              <p style={{ fontSize: 14, color: C.muted }}>
                {posts.length === 0
                  ? 'No posts yet — discover stories or create a manual post'
                  : 'No posts match your filters'
                }
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════════
     MAIN RENDER
     ═══════════════════════════════════════════════════════════════════ */

  return (
    <div style={{ padding: '40px 48px', overflowY: 'auto', height: '100%', background: C.page }}>
      {/* Keyframes for spinner */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Editor modal */}
      {renderEditor()}

      {/* Header */}
      <PageHeader title="News" subtitle="Curate and publish AI news for the community" onRefresh={loadPosts}>
        <button
          onClick={startCreate}
          style={s.btn('transparent', C.secondary, C.border)}
          onMouseEnter={e => { e.currentTarget.style.background = C.input; e.currentTarget.style.color = C.text; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.secondary; }}
        >
          New Post
        </button>
      </PageHeader>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Total',      value: stats.total,     color: C.text },
          { label: 'Published',  value: stats.published, color: C.green },
          { label: 'Drafts',     value: stats.drafts,    color: C.amber },
          { label: 'AI-Curated', value: stats.aiCurated, color: C.purple },
          { label: 'Featured',   value: stats.featured,  color: '#c084fc' },
        ].map(stat => (
          <div key={stat.label} style={{ ...s.card, padding: '20px 20px' }}>
            <p style={{ fontSize: 10, fontWeight: 400, letterSpacing: '1.2px', textTransform: 'uppercase' as const, color: C.muted, margin: 0 }}>
              {stat.label}
            </p>
            <p style={{ fontSize: 28, fontWeight: 300, color: stat.color, margin: 0, marginTop: 8, lineHeight: 1 }}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 24 }}>
        {([
          { key: 'published' as Tab, label: 'Published', count: stats.published },
          { key: 'drafts' as Tab,    label: 'Drafts',    count: stats.drafts },
          { key: 'discover' as Tab,  label: 'Discover',  count: null },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setBulkSelected(new Set()); }}
            style={{
              background: tab === t.key ? C.purpleBg : 'transparent',
              border: `1px solid ${tab === t.key ? 'rgba(168,85,247,0.3)' : 'transparent'}`,
              borderRadius: 10,
              padding: '10px 20px',
              fontSize: 13,
              fontWeight: 400,
              color: tab === t.key ? C.purple : C.secondary,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.15s',
            }}
          >
            {t.label}
            {t.count !== null && (
              <span style={{
                background: tab === t.key ? 'rgba(168,85,247,0.25)' : C.input,
                color: tab === t.key ? C.purple : C.muted,
                borderRadius: 99,
                padding: '2px 8px',
                fontSize: 10,
                fontWeight: 400,
              }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'discover' ? renderDiscover() : renderPostList()}
    </div>
  );
}
