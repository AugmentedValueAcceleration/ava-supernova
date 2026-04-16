import { useState, useMemo } from 'react';
import { t, useLocale } from '../i18n';
import { post } from '../App';
import { Select } from '../components/Select';
import type { LibraryPath, LibraryPathDetail } from '../types/messages';

const levelColors: Record<string, string> = {
  beginner: 'color: #34d399; background: rgba(52,211,153,0.1)',
  intermediate: 'color: #60a5fa; background: rgba(96,165,250,0.1)',
  advanced: 'color: #fbbf24; background: rgba(251,191,36,0.1)',
  mixed: 'color: #a78bfa; background: rgba(167,139,250,0.1)',
};

const sourceColors: Record<string, string> = {
  curated: 'color: #a855f7; background: rgba(168,85,247,0.1)',
  community: 'color: #60a5fa; background: rgba(96,165,250,0.1)',
};

const typeIcons: Record<string, string> = {
  concept: '\uD83D\uDCD6', exercise: '\uD83D\uDCBB', project: '\uD83D\uDEE0', quiz: '\u2753', recap: '\uD83D\uDD04', challenge: '\uD83C\uDFC6',
};

type SortOption = 'popular' | 'newest' | 'rating';

interface Props {
  paths: LibraryPath[];
  detail: LibraryPathDetail | null;
  onNavigate: (page: string) => void;
}

export function LearningLibrary({ paths, detail, onNavigate }: Props) {
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
    return (
      <div style={{ padding: 20 }}>
        <button
          onClick={() => setSelectedId(null)}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, marginBottom: 16, padding: 0 }}
        >
          {t('dash.learning_library.back')}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ cssText: sourceColors[selected.source] || '', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>
            {selected.source === 'curated' ? t('dash.learning_library.curated') : t('dash.learning_library.community')}
          </span>
          <span style={{ cssText: levelColors[selected.level] || '', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>
            {selected.level}
          </span>
          {selected.subject && (
            <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 500, color: 'var(--text-secondary)', background: 'var(--bg-input)', border: '1px solid var(--border-card)' }}>
              {selected.subject}
            </span>
          )}
          {selected.estimated_hours && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{selected.estimated_hours}h estimated</span>
          )}
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: '8px 0 4px' }}>{selected.title}</h2>
        {selected.author_name && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>by {selected.author_name}</p>
        )}
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 16 }}>{selected.description}</p>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 20, fontSize: 12, color: 'var(--text-muted)' }}>
          <span>{selected.fork_count} learner{selected.fork_count !== 1 ? 's' : ''}</span>
          {selected.average_rating && <span>{selected.average_rating}/5 rating</span>}
          {selected.content?.modules && <span>{selected.content.modules.length} modules</span>}
          {selected.content?.modules && (
            <span>{selected.content.modules.reduce((sum, m) => sum + (m.lessons?.length || 0), 0)} lessons</span>
          )}
        </div>

        {/* Learning objectives */}
        {selected.learning_objectives?.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>{t('dash.learning_library.what_you_learn')}</h3>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              {selected.learning_objectives.map((obj, i) => <li key={i}>{obj}</li>)}
            </ul>
          </div>
        )}

        {/* Module outline */}
        {selected.content?.modules && (
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Curriculum</h3>
            {selected.content.modules.map((mod, mi) => (
              <div key={mi} style={{ marginBottom: 12, padding: 12, borderRadius: 8, border: '1px solid var(--border-card)', background: 'var(--bg-card)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 4 }}>
                  Module {mi + 1}: {mod.title}
                </div>
                {mod.description && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{mod.description}</div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {(mod.lessons || []).map((lesson, li) => (
                    <div key={li} style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{typeIcons[lesson.type] || '\u25CB'}</span>
                      <span>{lesson.title}</span>
                      {lesson.difficulty && (
                        <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 'auto' }}>{lesson.difficulty}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button
            onClick={() => handleFork(selected.id)}
            disabled={forking}
            style={{
              padding: '10px 24px', borderRadius: 8, border: 'none', cursor: forking ? 'wait' : 'pointer',
              background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: '#fff', fontSize: 14, fontWeight: 500,
            }}
          >
            {forking ? t('dash.learning_library.starting') : t('dash.learning_library.start_learning')}
          </button>
          {/* Star rating */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 8 }}>
            {[1, 2, 3, 4, 5].map(star => (
              <button
                key={star}
                onClick={() => handleRate(selected.id, star)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: 2,
                  color: (selected.average_rating || 0) >= star ? '#fbbf24' : 'var(--text-muted)',
                }}
                title={`Rate ${star}/5`}
              >
                {'\u2605'}
              </button>
            ))}
          </div>
        </div>

        {selected.prerequisites && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            <strong>Prerequisites:</strong> {selected.prerequisites}
          </p>
        )}
      </div>
    );
  }

  // ── List View ──────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>Learning Library</h1>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {filtered.map(path => (
            <button
              key={path.id}
              onClick={() => handleSelect(path.id)}
              style={{
                textAlign: 'left', padding: 16, borderRadius: 12, cursor: 'pointer',
                border: '1px solid var(--border-card)', background: 'var(--bg-card)',
                transition: 'all 0.2s', display: 'flex', flexDirection: 'column',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.4)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-card)'; e.currentTarget.style.transform = 'none'; }}
            >
              {/* Source + level badges */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <span style={{
                  padding: '2px 8px', borderRadius: 999, fontSize: 9, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px',
                  background: path.source === 'curated' ? 'rgba(168,85,247,0.15)' : 'rgba(59,130,246,0.15)',
                  color: path.source === 'curated' ? '#A855F7' : '#60A5FA',
                }}>
                  {path.source === 'curated' ? t('dash.learning_library.curated') : 'Community'}
                </span>
                <span style={{
                  padding: '2px 8px', borderRadius: 999, fontSize: 9, fontWeight: 600, textTransform: 'uppercase' as const,
                  background: path.level === 'beginner' ? 'rgba(52,211,153,0.15)' : path.level === 'intermediate' ? 'rgba(251,191,36,0.15)' : 'rgba(239,68,68,0.15)',
                  color: path.level === 'beginner' ? '#34D399' : path.level === 'intermediate' ? '#FBBF24' : '#F87171',
                }}>
                  {path.level}
                </span>
              </div>

              {/* Title */}
              <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 8, lineHeight: 1.3 }}>
                {path.title}
              </div>

              {/* Description */}
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 12, flex: 1 }}>
                {path.description?.slice(0, 100)}{(path.description?.length || 0) > 100 ? '...' : ''}
              </div>

              {/* Subject + tags */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                {path.subject && (
                  <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 9, fontWeight: 500, color: 'var(--text-secondary)', background: 'var(--bg-input)' }}>
                    {path.subject}
                  </span>
                )}
                {path.tags.slice(0, 2).map(tag => (
                  <span key={tag} style={{ padding: '2px 8px', borderRadius: 999, fontSize: 9, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.04)' }}>
                    {tag}
                  </span>
                ))}
              </div>

              {/* Footer stats */}
              <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)', borderTop: '1px solid var(--border-card)', paddingTop: 10, marginTop: 'auto' }}>
                {path.estimated_hours && <span>{path.estimated_hours}h</span>}
                <span>{path.fork_count} learner{path.fork_count !== 1 ? 's' : ''}</span>
                {path.average_rating && <span>{'\u2605'} {path.average_rating}/5</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
