import { useState, useMemo } from 'react';
import { t, useLocale } from '../i18n';
import { post } from '../App';
import { Select } from '../components/Select';
import type { LibraryPath, LibraryPathDetail, Page } from '../types/messages';

type ColorPair = { color: string; background: string };

const levelColors: Record<string, ColorPair> = {
  beginner:     { color: '#34d399', background: 'rgba(52,211,153,0.1)' },
  intermediate: { color: '#60a5fa', background: 'rgba(96,165,250,0.1)' },
  advanced:     { color: '#fbbf24', background: 'rgba(251,191,36,0.1)' },
  mixed:        { color: '#a78bfa', background: 'rgba(167,139,250,0.1)' },
};

const sourceColors: Record<string, ColorPair> = {
  curated:   { color: '#a855f7', background: 'rgba(168,85,247,0.1)' },
  community: { color: '#60a5fa', background: 'rgba(96,165,250,0.1)' },
};

const typeIcons: Record<string, string> = {
  concept: '\uD83D\uDCD6', exercise: '\uD83D\uDCBB', project: '\uD83D\uDEE0', quiz: '\u2753', recap: '\uD83D\uDD04', challenge: '\uD83C\uDFC6',
};

// A small, friendly visual identity per course \u2014 a soft gradient + icon derived
// from the subject, so each tile feels distinct and inviting at a glance.
type Identity = { from: string; to: string; tint: string; icon: string };

const subjectIdentities: { match: string[]; identity: Identity }[] = [
  { match: ['prompt', 'ai', 'llm', 'agent', 'machine'], identity: { from: '#a855f7', to: '#7c3aed', tint: 'rgba(168,85,247,0.12)', icon: '\u2728' } },
  { match: ['web', 'frontend', 'react', 'css', 'html', 'ui', 'design'], identity: { from: '#38bdf8', to: '#2563eb', tint: 'rgba(56,189,248,0.12)', icon: '\uD83C\uDFA8' } },
  { match: ['python', 'data', 'analysis', 'science', 'ml'], identity: { from: '#34d399', to: '#0ea5e9', tint: 'rgba(52,211,153,0.12)', icon: '\uD83D\uDCCA' } },
  { match: ['security', 'crypto', 'network', 'cyber'], identity: { from: '#f87171', to: '#b91c1c', tint: 'rgba(248,113,113,0.12)', icon: '\uD83D\uDD12' } },
  { match: ['backend', 'server', 'api', 'database', 'sql', 'devops', 'cloud'], identity: { from: '#fbbf24', to: '#d97706', tint: 'rgba(251,191,36,0.12)', icon: '\u2699\uFE0F' } },
  { match: ['game', 'graphics', '3d', 'shader'], identity: { from: '#f472b6', to: '#db2777', tint: 'rgba(244,114,182,0.12)', icon: '\uD83C\uDFAE' } },
  { match: ['math', 'algorithm', 'logic'], identity: { from: '#818cf8', to: '#4f46e5', tint: 'rgba(129,140,248,0.12)', icon: '\uD83E\uDDEE' } },
];

const defaultIdentity: Identity = { from: 'var(--gradient-start)', to: 'var(--gradient-end)', tint: 'rgba(168,85,247,0.10)', icon: '\uD83D\uDCDA' };

function identityFor(subject?: string, title?: string): Identity {
  const hay = `${subject || ''} ${title || ''}`.toLowerCase();
  for (const { match, identity } of subjectIdentities) {
    if (match.some(m => hay.includes(m))) return identity;
  }
  return defaultIdentity;
}

type SortOption = 'popular' | 'newest' | 'rating';

interface Props {
  paths: LibraryPath[];
  detail: LibraryPathDetail | null;
  onNavigate: (page: Page) => void;
}

export function LearningLibrary({ paths, detail }: Props) {
  useLocale();
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [sort, setSort] = useState<SortOption>('popular');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [forking, setForking] = useState(false);

  // Derive unique subjects from paths
  const subjects = useMemo(() => {
    const set = new Set(paths.map(p => p.subject));
    return ['all', ...Array.from(set).sort()];
  }, [paths]);

  // Filter and sort
  const filtered = useMemo(() => {
    let result = paths;
    if (subjectFilter !== 'all') result = result.filter(p => p.subject === subjectFilter);
    if (levelFilter !== 'all') result = result.filter(p => p.level === levelFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.subject.toLowerCase().includes(q) ||
        p.tags.some(tag => tag.toLowerCase().includes(q))
      );
    }
    // Sort
    switch (sort) {
      case 'newest': return [...result].sort((a, b) => (b.published_at || '').localeCompare(a.published_at || ''));
      case 'rating': return [...result].sort((a, b) => (b.average_rating || 0) - (a.average_rating || 0));
      default: return [...result].sort((a, b) => b.fork_count - a.fork_count);
    }
  }, [paths, subjectFilter, levelFilter, search, sort]);

  const selected = detail && detail.id === selectedId ? detail : null;

  function handleSelect(id: string) {
    setSelectedId(id);
    post({ type: 'load_library_path_detail', id });
  }

  function handleFork(id: string) {
    setForking(true);
    post({ type: 'fork_library_path', id });
    setTimeout(() => setForking(false), 3000);
  }

  function handleRate(id: string, rating: number) {
    post({ type: 'rate_library_path', id, rating });
  }

  // ── Detail View ────────────────────────────────────────────────────────
  if (selected) {
    const id = identityFor(selected.subject, selected.title);
    const moduleCount = selected.content?.modules?.length || 0;
    const lessonCount = selected.content?.modules?.reduce((sum, m) => sum + (m.lessons?.length || 0), 0) || 0;
    return (
      <div style={{ padding: 20, maxWidth: 860, margin: '0 auto' }}>
        <button
          onClick={() => setSelectedId(null)}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, marginBottom: 16, padding: 0 }}
        >
          {'← '}{t('dash.learning_library.back')}
        </button>

        {/* Hero */}
        <div
          style={{
            position: 'relative', overflow: 'hidden', borderRadius: 16,
            border: '1px solid var(--border-card)',
            background: `linear-gradient(135deg, ${id.tint}, transparent 60%), var(--bg-card)`,
            padding: 24, marginBottom: 20,
          }}
        >
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div
              style={{
                flexShrink: 0, width: 56, height: 56, borderRadius: 14, display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 28,
                background: `linear-gradient(135deg, ${id.from}, ${id.to})`,
                boxShadow: `0 6px 20px -6px ${id.from}`,
              }}
            >
              {id.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{ ...(sourceColors[selected.source] || {}), padding: '3px 9px', borderRadius: 999, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {selected.source === 'curated' ? t('dash.learning_library.curated') : t('dash.learning_library.community')}
                </span>
                <span style={{ ...(levelColors[selected.level] || {}), padding: '3px 9px', borderRadius: 999, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {selected.level}
                </span>
                {selected.subject && (
                  <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 10, fontWeight: 500, color: 'var(--text-secondary)', background: 'var(--bg-input)', border: '1px solid var(--border-card)' }}>
                    {selected.subject}
                  </span>
                )}
              </div>
              <h2 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 4px', lineHeight: 1.2 }}>{selected.title}</h2>
              {selected.author_name && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 10px' }}>by {selected.author_name}</p>
              )}
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0 }}>{selected.description}</p>
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: 'flex', gap: 20, marginTop: 18, flexWrap: 'wrap' }}>
            {selected.estimated_hours ? <Stat icon={'⏱'} label={`${selected.estimated_hours}h`} sub="estimated" /> : null}
            <Stat icon={'👥'} label={String(selected.fork_count)} sub={`learner${selected.fork_count !== 1 ? 's' : ''}`} />
            {selected.average_rating ? <Stat icon={'⭐'} label={`${selected.average_rating}/5`} sub="rating" /> : null}
            {moduleCount > 0 ? <Stat icon={'📦'} label={String(moduleCount)} sub={`module${moduleCount !== 1 ? 's' : ''}`} /> : null}
            {lessonCount > 0 ? <Stat icon={'📝'} label={String(lessonCount)} sub={`lesson${lessonCount !== 1 ? 's' : ''}`} /> : null}
          </div>
        </div>

        {/* Learning objectives */}
        {selected.learning_objectives?.length > 0 && (
          <div style={{ marginBottom: 22, borderRadius: 14, border: '1px solid var(--border-card)', background: 'var(--bg-card)', padding: 18 }}>
            <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 12px' }}>{t('dash.learning_library.what_you_learn')}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '8px 18px' }}>
              {selected.learning_objectives.map((obj, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  <span style={{ color: id.from, fontWeight: 700, flexShrink: 0 }}>{'✓'}</span>
                  <span>{obj}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Curriculum — a visual learning path */}
        {selected.content?.modules && (
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 16px' }}>Your learning path</h3>
            <div style={{ position: 'relative' }}>
              {/* The vertical journey spine */}
              <div style={{ position: 'absolute', left: 17, top: 8, bottom: 8, width: 2, background: 'linear-gradient(to bottom, var(--gradient-start), var(--gradient-end))', opacity: 0.4 }} />
              {selected.content.modules.map((mod, mi) => (
                <div key={mi} style={{ position: 'relative', paddingLeft: 48, marginBottom: mi === selected.content!.modules.length - 1 ? 0 : 18 }}>
                  {/* Module node */}
                  <div
                    style={{
                      position: 'absolute', left: 0, top: 0, width: 36, height: 36, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700,
                      color: '#fff', background: `linear-gradient(135deg, ${id.from}, ${id.to})`,
                      boxShadow: `0 0 0 4px var(--bg-card)`,
                    }}
                  >
                    {mi + 1}
                  </div>
                  <div style={{ borderRadius: 14, border: '1px solid var(--border-card)', background: 'var(--bg-card)', padding: 16 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: mod.description ? 2 : 8 }}>
                      {mod.title}
                    </div>
                    {mod.description && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>{mod.description}</div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {(mod.lessons || []).map((lesson, li) => (
                        <div
                          key={li}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5,
                            color: 'var(--text-secondary)', padding: '7px 10px', borderRadius: 8,
                            background: 'var(--bg-input)',
                          }}
                        >
                          <span style={{ fontSize: 15, lineHeight: 1 }}>{typeIcons[lesson.type] || '\u25CB'}</span>
                          <span style={{ flex: 1 }}>{lesson.title}</span>
                          {lesson.difficulty && (
                            <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{lesson.difficulty}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Start-learning CTA card */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
            borderRadius: 14, border: '1px solid var(--border-card)',
            background: `linear-gradient(135deg, ${id.tint}, transparent), var(--bg-card)`,
            padding: 18, marginBottom: 12,
          }}
        >
          <button
            onClick={() => handleFork(selected.id)}
            disabled={forking}
            style={{
              padding: '11px 26px', borderRadius: 10, border: 'none', cursor: forking ? 'wait' : 'pointer',
              background: `linear-gradient(135deg, ${id.from}, ${id.to})`, color: '#fff', fontSize: 14, fontWeight: 600,
            }}
          >
            {forking ? t('dash.learning_library.starting') : t('dash.learning_library.start_learning')}
          </button>
          {/* Star rating */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Rate this course</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  onClick={() => handleRate(selected.id, star)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: 1, lineHeight: 1,
                    color: (selected.average_rating || 0) >= star ? '#fbbf24' : 'var(--text-muted)',
                  }}
                  title={`Rate ${star}/5`}
                >
                  {'\u2605'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {selected.prerequisites && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--text-secondary)' }}>Prerequisites:</strong> {selected.prerequisites}
          </p>
        )}
      </div>
    );
  }

  // ── List View ──────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: '#cdd6f4' }}>Learning Library</h1>
        <button
          onClick={() => { post({ type: 'load_library_paths' }); }}
          style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border-card)', background: 'transparent', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}
          title="Refresh library"
        >
          Refresh
        </button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
        {t('dash.learning_library.subtitle')}
      </p>

      {/* Search */}
      <input
        type="text"
        placeholder={t('dash.learning_library.search') || 'Search learning paths...'}
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-card)',
          background: 'var(--bg-input)', color: '#fff', fontSize: 13, marginBottom: 12, outline: 'none',
        }}
      />

      {/* Filters row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {/* Subject filter tabs */}
        {subjects.map(sub => (
          <button
            key={sub}
            onClick={() => setSubjectFilter(sub)}
            style={{
              padding: '4px 12px', borderRadius: 12, border: '1px solid var(--border-card)', cursor: 'pointer',
              background: subjectFilter === sub ? 'var(--accent)' : 'transparent',
              color: subjectFilter === sub ? '#fff' : 'var(--text-secondary)',
              fontSize: 11, fontWeight: 500,
            }}
          >
            {sub === 'all' ? 'All' : sub}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {/* Level filter */}
        <div style={{ width: 140 }}>
          <Select
            value={levelFilter}
            onChange={setLevelFilter}
            options={[
              { value: 'all', label: 'All levels' },
              { value: 'beginner', label: 'Beginner' },
              { value: 'intermediate', label: 'Intermediate' },
              { value: 'advanced', label: 'Advanced' },
              { value: 'mixed', label: 'Mixed' },
            ]}
          />
        </div>

        {/* Sort */}
        <div style={{ width: 140 }}>
          <Select
            value={sort}
            onChange={v => setSort(v as SortOption)}
            options={[
              { value: 'popular', label: 'Most Popular' },
              { value: 'newest', label: 'Newest' },
              { value: 'rating', label: 'Highest Rated' },
            ]}
          />
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>{'\uD83D\uDCDA'}</div>
          <p style={{ fontSize: 13 }}>No paths found matching your filters.</p>
          <p style={{ fontSize: 11, marginTop: 4 }}>Try a different search or ask Ava to create a custom learning path.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {filtered.map(path => {
            const id = identityFor(path.subject, path.title);
            return (
            <button
              key={path.id}
              onClick={() => handleSelect(path.id)}
              style={{
                textAlign: 'left', padding: 0, borderRadius: 16, cursor: 'pointer', overflow: 'hidden',
                border: '1px solid var(--border-card)', background: 'var(--bg-card)',
                transition: 'transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease',
                display: 'flex', flexDirection: 'column',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = id.from;
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.boxShadow = `0 12px 28px -14px ${id.from}`;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--border-card)';
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              {/* Identity band */}
              <div
                style={{
                  height: 78, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0 16px', position: 'relative',
                  background: `linear-gradient(135deg, ${id.from}, ${id.to})`,
                }}
              >
                <div
                  style={{
                    width: 42, height: 42, borderRadius: 12, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 22, background: 'rgba(0,0,0,0.18)',
                  }}
                >
                  {id.icon}
                </div>
                <span style={{
                  padding: '3px 9px', borderRadius: 999, fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.5px',
                  background: 'rgba(0,0,0,0.22)', color: '#fff',
                }}>
                  {path.source === 'curated' ? t('dash.learning_library.curated') : 'Community'}
                </span>
              </div>

              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', flex: 1 }}>
                {/* Level + subject pills */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                  <span style={{
                    padding: '2px 8px', borderRadius: 999, fontSize: 9, fontWeight: 600, textTransform: 'uppercase' as const,
                    background: path.level === 'beginner' ? 'rgba(52,211,153,0.15)' : path.level === 'intermediate' ? 'rgba(251,191,36,0.15)' : 'rgba(239,68,68,0.15)',
                    color: path.level === 'beginner' ? '#34D399' : path.level === 'intermediate' ? '#FBBF24' : '#F87171',
                  }}>
                    {path.level}
                  </span>
                  {path.subject && (
                    <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 9, fontWeight: 500, color: 'var(--text-secondary)', background: 'var(--bg-input)' }}>
                      {path.subject}
                    </span>
                  )}
                </div>

                {/* Title */}
                <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 8, lineHeight: 1.3 }}>
                  {path.title}
                </div>

                {/* Description */}
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 12, flex: 1 }}>
                  {path.description?.slice(0, 100)}{(path.description?.length || 0) > 100 ? '...' : ''}
                </div>

                {/* Footer stats */}
                <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-muted)', borderTop: '1px solid var(--border-card)', paddingTop: 10, marginTop: 'auto' }}>
                  {path.estimated_hours && <span>{'\u23f1 '}{path.estimated_hours}h</span>}
                  <span>{'\ud83d\udc65 '}{path.fork_count}</span>
                  {path.average_rating && <span style={{ color: '#fbbf24' }}>{'\u2605 '}{path.average_rating}</span>}
                </div>
              </div>
            </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// A small stat block for the course-detail hero — icon, bold value, quiet label.
function Stat({ icon, label, sub }: { icon: string; label: string; sub: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 16, lineHeight: 1 }}>{icon}</span>
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{label}</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{sub}</span>
      </div>
    </div>
  );
}
