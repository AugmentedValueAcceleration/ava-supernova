import { useState, useMemo } from 'react';
import { t, tt, useLocale } from '../i18n';
import { post } from '../App';
import { Select } from '../components/Select';
import { Icon } from '../components/Icon';
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

// Lesson-type glyphs, drawn from our own icon set. These used to be emoji
// (\uD83D\uDCD6 \uD83D\uDCBB \uD83D\uDEE0 \u2753 \uD83D\uDD04 \uD83C\uDFC6) \u2014 they render differently on every platform, sit at a
// different weight to every other glyph in the app, and can't take the
// surrounding text colour.
const TYPE_ICON = {
  concept: Icon.book,
  exercise: Icon.code,
  project: Icon.project,
  quiz: Icon.quiz,
  recap: Icon.review,
  challenge: Icon.achievement,
} as const;

function LessonTypeIcon({ type }: { type: string }) {
  const Glyph = TYPE_ICON[type as keyof typeof TYPE_ICON] ?? Icon.note;
  return <Glyph size={15} />;
}

// A small, friendly visual identity per course \u2014 a soft gradient + icon derived
// from the subject, so each tile feels distinct and inviting at a glance.
//
// `icon` is a component from our own set, not an emoji. These were \u2728\uD83C\uDFA8\uD83D\uDCCA\uD83D\uDD12\u2699\uFE0F\uD83C\uDFAE\uD83E\uDDEE\uD83D\uDCDA,
// which render at a different weight on every platform, can't inherit a colour,
// and read as clip-art next to the rest of the app's line icons.
type Identity = { from: string; to: string; tint: string; icon: (p: { size?: number }) => React.ReactElement };

const subjectIdentities: { match: string[]; identity: Identity }[] = [
  { match: ['prompt', 'ai', 'llm', 'agent', 'machine'], identity: { from: '#a855f7', to: '#7c3aed', tint: 'rgba(168,85,247,0.12)', icon: Icon.sparkle } },
  { match: ['web', 'frontend', 'react', 'css', 'html', 'ui', 'design'], identity: { from: '#38bdf8', to: '#2563eb', tint: 'rgba(56,189,248,0.12)', icon: Icon.palette } },
  { match: ['python', 'data', 'analysis', 'science', 'ml'], identity: { from: '#34d399', to: '#0ea5e9', tint: 'rgba(52,211,153,0.12)', icon: Icon.database } },
  { match: ['security', 'crypto', 'network', 'cyber'], identity: { from: '#f87171', to: '#b91c1c', tint: 'rgba(248,113,113,0.12)', icon: Icon.shield } },
  { match: ['backend', 'server', 'api', 'database', 'sql', 'devops', 'cloud'], identity: { from: '#fbbf24', to: '#d97706', tint: 'rgba(251,191,36,0.12)', icon: Icon.gear } },
  { match: ['game', 'graphics', '3d', 'shader'], identity: { from: '#f472b6', to: '#db2777', tint: 'rgba(244,114,182,0.12)', icon: Icon.puzzle } },
  { match: ['math', 'algorithm', 'logic'], identity: { from: '#818cf8', to: '#4f46e5', tint: 'rgba(129,140,248,0.12)', icon: Icon.brain } },
];

const shelfIdentities: Record<string, Identity> = {
  'Using Ava':          { from: '#a855f7', to: '#7c3aed', tint: 'rgba(168,85,247,0.12)', icon: Icon.sparkle },
  'Science & Maths':    { from: '#818cf8', to: '#4f46e5', tint: 'rgba(129,140,248,0.12)', icon: Icon.flask },
  'Technology':         { from: '#38bdf8', to: '#2563eb', tint: 'rgba(56,189,248,0.12)', icon: Icon.monitor },
  'Business & Finance': { from: '#34d399', to: '#059669', tint: 'rgba(52,211,153,0.12)', icon: Icon.card },
  'Health & Care':      { from: '#f87171', to: '#dc2626', tint: 'rgba(248,113,113,0.12)', icon: Icon.fitness },
  'Trades':             { from: '#fbbf24', to: '#d97706', tint: 'rgba(251,191,36,0.12)', icon: Icon.hammer },
  'Creative':           { from: '#f472b6', to: '#db2777', tint: 'rgba(244,114,182,0.12)', icon: Icon.palette },
  'Languages':          { from: '#2dd4bf', to: '#0d9488', tint: 'rgba(45,212,191,0.12)', icon: Icon.globe },
  'Humanities':         { from: '#c084fc', to: '#9333ea', tint: 'rgba(192,132,252,0.12)', icon: Icon.books },
};

const defaultIdentity: Identity = { from: 'var(--gradient-start)', to: 'var(--gradient-end)', tint: 'rgba(168,85,247,0.10)', icon: Icon.books };

function identityFor(subject?: string, title?: string, industry?: string | null): Identity {
  if (industry && shelfIdentities[industry]) return shelfIdentities[industry];
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
  /** What the server said about each rating — the user's own score, and any
   *  error. Without this the widget can only show the crowd average, which is
   *  why rating a course used to change nothing on screen. */
  courseRatings: Record<string, {
    yourRating: number; averageRating: number | null; ratingCount: number; error?: string;
  }>;
  /** Fetch in flight. Distinguishes "still loading" from "nothing matches" —
   *  they looked identical, so a slow load read as an empty library. */
  loading?: boolean;
}

export function LearningLibrary({ paths, detail, courseRatings, loading }: Props) {
  useLocale();
  const [search, setSearch] = useState('');
  const [shelfFilter, setShelfFilter] = useState('all');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [audienceFilter, setAudienceFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [sort, setSort] = useState<SortOption>('popular');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [forking, setForking] = useState(false);

  // Shelves, in the taxonomy's own order rather than alphabetically: Using Ava
  // first because those courses turn an install into someone who can use the
  // product, then the rest roughly by how many people a shelf serves.
  const SHELF_ORDER = [
    'Using Ava', 'Science & Maths', 'Technology', 'Business & Finance',
    'Health & Care', 'Trades', 'Creative', 'Languages', 'Humanities',
  ];
  const shelves = useMemo(() => {
    const present = new Set(paths.map(p => p.industry).filter(Boolean) as string[]);
    const known = SHELF_ORDER.filter(s => present.has(s));
    // Anything filed under a shelf this build has not heard of still needs a
    // way in — a course you cannot reach is the same as a course that is not
    // there.
    const extra = Array.from(present).filter(s => !SHELF_ORDER.includes(s)).sort();
    return ['all', ...known, ...extra];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths]);

  // Subjects WITHIN the chosen shelf. The whole point of two levels is that
  // you never see thirty unrelated subjects at once, so this stays empty until
  // a shelf is picked.
  const subjects = useMemo(() => {
    if (shelfFilter === 'all') return [];
    const set = new Set(paths.filter(p => p.industry === shelfFilter).map(p => p.subject));
    return set.size > 1 ? ['all', ...Array.from(set).sort()] : [];
  }, [paths, shelfFilter]);

  const audiences = useMemo(() => {
    const set = new Set(paths.map(p => p.audience_type).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [paths]);

  // Filter and sort
  const filtered = useMemo(() => {
    let result = paths;
    if (shelfFilter !== 'all') result = result.filter(p => p.industry === shelfFilter);
    if (subjectFilter !== 'all') result = result.filter(p => p.subject === subjectFilter);
    if (audienceFilter !== 'all') result = result.filter(p => p.audience_type === audienceFilter);
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
  }, [paths, shelfFilter, subjectFilter, audienceFilter, levelFilter, search, sort]);

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

  // A low score without a reason is a mood; with one it is a bug report. The
  // prompt only appears at 3 or below — asking someone who gave 5 stars what
  // went wrong is how you teach people to stop rating things.
  const [reasonFor, setReasonFor] = useState<string | null>(null);

  function handleRate(id: string, rating: number) {
    post({ type: 'rate_library_path', id, rating });
    setReasonFor(rating <= 3 ? id : null);
  }

  function sendReason(id: string, rating: number, reason: string) {
    post({ type: 'rate_library_path', id, rating, reason });
    setReasonFor(null);
  }

  // ── Detail View ────────────────────────────────────────────────────────
  if (selected) {
    const id = identityFor(selected.subject, selected.title, selected.industry);
    const moduleCount = selected.content?.modules?.length || 0;
    const lessonCount = selected.content?.modules?.reduce((sum, m) => sum + (m.lessons?.length || 0), 0) || 0;
    // Full width — the course detail was pinned to 860px and centred, which
    // left most of the panel empty on any real editor width.
    return (
      <div style={{ padding: 20 }}>
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
                alignItems: 'center', justifyContent: 'center',
                background: `linear-gradient(135deg, ${id.from}, ${id.to})`,
                boxShadow: `0 6px 20px -6px ${id.from}`,
                color: '#fff',
              }}
            >
              <id.icon size={26} />
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
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 10px' }}>{t('learning_library.by_author', { author: selected.author_name })}</p>
              )}
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0 }}>{selected.description}</p>
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: 'flex', gap: 20, marginTop: 18, flexWrap: 'wrap' }}>
            {selected.estimated_hours ? <Stat icon={<Icon.clock size={15} />} label={`${selected.estimated_hours}h`} sub={t('learning_library.stat_estimated')} /> : null}
            <Stat icon={<Icon.users size={15} />} label={String(selected.fork_count)} sub={t('dash.learning_library.learners')} />
            {selected.average_rating ? <Stat icon={<Icon.star size={15} />} label={`${selected.average_rating}/5`} sub={t('learning_library.stat_rating')} /> : null}
            {moduleCount > 0 ? <Stat icon={<Icon.package size={15} />} label={String(moduleCount)} sub={`module${moduleCount !== 1 ? 's' : ''}`} /> : null}
            {lessonCount > 0 ? <Stat icon={<Icon.note size={15} />} label={String(lessonCount)} sub={`lesson${lessonCount !== 1 ? 's' : ''}`} /> : null}
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
            <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 16px' }}>{t('learning_library.your_path')}</h3>
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
                          <span style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)', flexShrink: 0 }}>
                            <LessonTypeIcon type={lesson.type} />
                          </span>
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
            borderRadius: 14, border: '1px solid color-mix(in srgb, var(--accent) 22%, transparent)',
            background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 8%, transparent), transparent), var(--bg-card)',
            padding: 18, marginBottom: 12,
          }}
        >
          {/* House button style — the chat header's "New Chat" pill: translucent
              accent fill, accent border + text, subtle hover. Was a solid-accent
              button with white text, which matched nothing else. */}
          <button
            onClick={() => handleFork(selected.id)}
            disabled={forking}
            onMouseEnter={(e) => { if (!forking) e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 20%, transparent)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 10%, transparent)'; }}
            style={{
              padding: '11px 26px', borderRadius: 8, cursor: forking ? 'wait' : 'pointer',
              border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
              background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
              color: 'var(--accent)', fontSize: 14, fontWeight: 600,
              opacity: forking ? 0.7 : 1, transition: 'background 0.15s, opacity 0.15s',
            }}
          >
            {forking ? t('dash.learning_library.starting') : t('dash.learning_library.start_learning')}
          </button>
          {/* Star rating. Shows YOUR score once given — the average is a
              number beside it, never the fill. Filling the stars from the
              crowd average meant clicking changed nothing and you could not
              tell whether it had saved. */}
          {(() => {
            const verdict = courseRatings[selected.id];
            const mine = verdict?.yourRating ?? null;
            const avg = verdict?.averageRating ?? selected.average_rating ?? null;
            const count = verdict?.ratingCount ?? 0;
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
                  {mine ? t('learning_library.your_rating') || 'Your rating' : t('learning_library.rate_course')}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      onClick={() => handleRate(selected.id, star)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: 1, lineHeight: 1,
                        color: (mine ?? 0) >= star ? '#fbbf24' : 'var(--text-muted)',
                      }}
                      title={t('learning_library.rate_star', { star })}
                    >
                      {'\u2605'}
                    </button>
                  ))}
                  {avg != null && (
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>
                      {avg}/5{count ? ` (${count})` : ''}
                    </span>
                  )}
                </div>

                {/* It failed. Say so — the whole reason this was invisible is
                    that the old path swallowed every error. */}
                {verdict?.error && (
                  <span style={{ fontSize: 10, color: '#f87171', maxWidth: 220, textAlign: 'right' }}>
                    {verdict.error}
                  </span>
                )}

                {/* What was wrong? Codes, not a text box — most people will
                    pick one and almost nobody types. */}
                {reasonFor === selected.id && !verdict?.error && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end', maxWidth: 260, marginTop: 2 }}>
                    {[
                      ['unclear', t('learning_library.reason_unclear') || 'Unclear'],
                      ['too-fast', t('learning_library.reason_too_fast') || 'Too fast'],
                      ['too-easy', t('learning_library.reason_too_easy') || 'Too easy'],
                      ['wrong', t('learning_library.reason_wrong') || 'Something wrong'],
                      ['translation', t('learning_library.reason_translation') || 'Bad translation'],
                    ].map(([code, label]) => (
                      <button
                        key={code}
                        onClick={() => sendReason(selected.id, mine ?? 3, code)}
                        style={{
                          padding: '2px 8px', borderRadius: 10, fontSize: 10, cursor: 'pointer',
                          border: '1px solid var(--border-card)', background: 'transparent', color: 'var(--text-secondary)',
                        }}
                      >{label}</button>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {selected.prerequisites && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--text-secondary)' }}>{t('dash.learning_library.prerequisites')}:</strong> {selected.prerequisites}
          </p>
        )}
      </div>
    );
  }

  // ── List View ──────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: '#cdd6f4' }}>{t('dash.learning_library.title')}</h1>
        <button
          onClick={() => { post({ type: 'load_library_paths' }); }}
          style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border-card)', background: 'transparent', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}
          title={t('learning_library.refresh_title')}
        >
          {t('health.browse.refresh')}
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

      {/* Shelves. Choosing one resets the subject beneath it — a subject from
          the shelf you just left would filter everything down to nothing. */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        {shelves.map(shelf => {
          const active = shelfFilter === shelf;
          const ident = shelf === 'all' ? null : shelfIdentities[shelf];
          return (
            <button
              key={shelf}
              onClick={() => { setShelfFilter(shelf); setSubjectFilter('all'); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', borderRadius: 12, cursor: 'pointer', fontSize: 11, fontWeight: 500,
                border: `1px solid ${active && ident ? ident.from : 'var(--border-card)'}`,
                background: active ? (ident ? ident.tint : 'var(--accent)') : 'transparent',
                color: active ? (ident ? ident.from : '#fff') : 'var(--text-secondary)',
              }}
            >
              {ident && <ident.icon size={13} />}
              {shelf === 'all' ? t('dash.library.all') : shelf}
            </button>
          );
        })}
      </div>

      {/* Subjects within the chosen shelf. Absent until a shelf is chosen, and
          absent when a shelf holds only one subject — a lone chip that filters
          nothing is decoration. */}
      {subjects.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', paddingLeft: 2 }}>
          {subjects.map(sub => (
            <button
              key={sub}
              onClick={() => setSubjectFilter(sub)}
              style={{
                padding: '3px 10px', borderRadius: 10, cursor: 'pointer', fontSize: 10.5,
                border: '1px solid transparent',
                background: subjectFilter === sub ? 'var(--bg-input)' : 'transparent',
                color: subjectFilter === sub ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: subjectFilter === sub ? 600 : 400,
              }}
            >
              {sub === 'all' ? t('dash.library.all') : sub}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {/* Who it's for. Deliberately separate from level: an exam-prep course
            and a career-changer's course can both be "intermediate" and want
            completely different things from the reader. */}
        {audiences.length > 0 && (
          <div style={{ width: 170 }}>
            <Select
              value={audienceFilter}
              onChange={setAudienceFilter}
              options={[
                { value: 'all', label: tt('dash.learning_library.all_audiences', 'Anyone') },
                ...audiences.map(a => ({ value: a, label: a })),
              ]}
            />
          </div>
        )}

        {/* Level filter */}
        <div style={{ width: 140 }}>
          <Select
            value={levelFilter}
            onChange={setLevelFilter}
            options={[
              { value: 'all', label: t('dash.learning_library.all_levels') },
              { value: 'beginner', label: t('dash.learning_library.beginner') },
              { value: 'intermediate', label: t('dash.learning_library.intermediate') },
              { value: 'advanced', label: t('dash.learning_library.advanced') },
              { value: 'mixed', label: t('dash.learning_library.mixed') },
            ]}
          />
        </div>

        {/* Sort */}
        <div style={{ width: 140 }}>
          <Select
            value={sort}
            onChange={v => setSort(v as SortOption)}
            options={[
              { value: 'popular', label: t('dash.learning_library.most_popular') },
              { value: 'newest', label: t('dash.learning_library.newest') },
              { value: 'rating', label: t('dash.learning_library.highest_rated') },
            ]}
          />
        </div>
      </div>

      {/* Results */}
      {loading && paths.length === 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {/* Skeletons, not a spinner: the layout does not jump when the real
              cards arrive, and it shows roughly how many to expect. Before
              this, a slow fetch rendered "no courses match your filters",
              which reads as an empty library rather than a loading one. */}
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              style={{
                height: 168,
                borderRadius: 10,
                border: '1px solid var(--border-card)',
                background: 'linear-gradient(90deg, var(--bg-input) 25%, rgba(255,255,255,0.05) 50%, var(--bg-input) 75%)',
                backgroundSize: '200% 100%',
                animation: 'ava-shimmer 1.4s ease-in-out infinite',
              }}
            />
          ))}
          <style>{'@keyframes ava-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}'}</style>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>{'\uD83D\uDCDA'}</div>
          <p style={{ fontSize: 13 }}>{t('learning_library.no_paths_filters')}</p>
          <p style={{ fontSize: 11, marginTop: 4 }}>{t('learning_library.no_paths_hint')}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {filtered.map(path => {
            const id = identityFor(path.subject, path.title, path.industry);
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
              {/* Identity band — cover image when present, else gradient + icon */}
              <div
                style={{
                  height: 96, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                  padding: '12px 14px', position: 'relative',
                  background: path.cover_image_url
                    ? `linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.45)), center/cover no-repeat url(${path.cover_image_url})`
                    : `linear-gradient(135deg, ${id.from}, ${id.to})`,
                }}
              >
                {!path.cover_image_url && (
                  <div
                    style={{
                      width: 42, height: 42, borderRadius: 12, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', background: 'rgba(0,0,0,0.18)', color: '#fff',
                    }}
                  >
                    <id.icon size={20} />
                  </div>
                )}
                <span style={{
                  marginLeft: 'auto',
                  padding: '3px 9px', borderRadius: 999, fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.5px',
                  background: 'rgba(0,0,0,0.32)', color: '#fff',
                }}>
                  {path.source === 'curated' ? t('dash.learning_library.curated') : t('dash.learning_library.community')}
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
function Stat({ icon, label, sub }: { icon: React.ReactNode; label: string; sub: string }) {
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
