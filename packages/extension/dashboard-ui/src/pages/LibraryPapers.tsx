import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { post } from '../App';
import type {
  LibraryPaper,
  PapersTab,
  PaperDiscipline,
} from '../types/messages';

/**
 * Library → Papers tab. Three sub-tabs over a single curated + live
 * search surface:
 *
 *   - Featured  → curated picks from the library_papers table, ordered
 *                 by featured_at desc, optionally filtered by discipline.
 *   - Trending  → joined with paper_signals.computed_score; same data
 *                 source as Featured but ranked by trending signal
 *                 (citation velocity + HN / Reddit mentions).
 *   - Latest    → recency-ordered, fresh additions to the library.
 *
 * On top of the three tabs sits a discipline pivot row (All / AI & CS /
 * Biology / Medicine / etc.) and a search bar. Search is live —
 * 300ms debounce against /api/papers/search via OpenAlex; results
 * displace the tab content while a query is active.
 *
 * Each paper card has a "Read with Ava" CTA. That handoff posts a
 * `read_paper_with_ava` message to the host, which switches the
 * chat panel into Teach mode and primes the conversation with a
 * four-layer-pass prompt for the selected paper.
 */

const DISCIPLINES: { id: 'all' | PaperDiscipline; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'ai_cs', label: 'AI & CS' },
  { id: 'biology', label: 'Biology' },
  { id: 'medicine', label: 'Medicine' },
  { id: 'physics', label: 'Physics' },
  { id: 'chemistry', label: 'Chemistry' },
  { id: 'earth_sciences', label: 'Earth Sciences' },
  { id: 'social_sciences', label: 'Social Sciences' },
  { id: 'economics', label: 'Economics' },
  { id: 'engineering', label: 'Engineering' },
  { id: 'math', label: 'Math' },
  { id: 'other', label: 'Other' },
];

const TABS: { id: PapersTab; label: string; hint: string }[] = [
  { id: 'featured', label: 'Featured', hint: "Ava's editorial picks" },
  { id: 'trending', label: 'Trending', hint: "What's getting attention" },
  { id: 'latest', label: 'Latest', hint: 'Newest additions' },
];

/** Disciplines where the four-layer caveats need a strong "not advice"
 *  line in the surface UI. Tutor handles its own caveats per-discipline
 *  internally; this is just the visible-to-user safety reminder. */
const MEDICAL_DISCIPLINES = new Set<PaperDiscipline>(['medicine']);

interface Props {
  /** Tab content keyed by tab — the host fetches and pushes via
   *  `papers_loaded`. */
  papersByTab: Record<PapersTab, LibraryPaper[]>;
  /** Per-tab loading state. True from the moment the user triggers a
   *  fetch (tab change or discipline change) until `papers_loaded`
   *  arrives — drives the inline spinner so the tab area never reads
   *  as "empty" when it's actually still loading. */
  papersTabLoading: Record<PapersTab, boolean>;
  /** Live OpenAlex search results — pushed via `papers_search_results`. */
  searchResults: LibraryPaper[];
  searchLoading: boolean;
  /** Current search query — empty string = no active search, show tab content. */
  searchQuery: string;
  /** Handlers wired in App.tsx. */
  onLoadTab: (tab: PapersTab, discipline?: PaperDiscipline) => void;
  onSearch: (query: string, discipline?: PaperDiscipline) => void;
  onClearSearch: () => void;
  onReadWithAva: (paper: LibraryPaper) => void;
  /** Enriched record fetched via /api/papers/{id} — full abstract,
   *  oa_pdf_url, primary_url. Modal merges this over the slim list-row
   *  data so the user sees a populated card instead of a near-empty one. */
  paperDetail: LibraryPaper | null;
  paperDetailLoading: boolean;
  onLoadPaperDetail: (id: string) => void;
  onClearPaperDetail: () => void;
}

export function LibraryPapers({
  papersByTab,
  papersTabLoading,
  searchResults,
  searchLoading,
  searchQuery,
  onLoadTab,
  onSearch,
  onClearSearch,
  onReadWithAva,
  paperDetail,
  paperDetailLoading,
  onLoadPaperDetail,
  onClearPaperDetail,
}: Props) {
  const [tab, setTab] = useState<PapersTab>('featured');
  const [discipline, setDiscipline] = useState<'all' | PaperDiscipline>('all');
  const [searchInput, setSearchInput] = useState('');
  const [selected, setSelected] = useState<LibraryPaper | null>(null);

  // When the user picks a paper that has a curated DB row (id present),
  // ask the host for the full record. The slim list-row often lacks the
  // long abstract / oa_pdf_url / primary_url, which is what made the
  // modal feel empty. Live OpenAlex search results have no id and skip
  // this round-trip — we render whatever metadata the search returned.
  const handleSelect = useCallback((paper: LibraryPaper) => {
    setSelected(paper);
    if (paper.id) onLoadPaperDetail(paper.id);
  }, [onLoadPaperDetail]);

  const handleCloseModal = useCallback(() => {
    setSelected(null);
    onClearPaperDetail();
  }, [onClearPaperDetail]);

  // Merge enriched detail over the click-time row when ids match. If
  // the host returns null (curated row deleted) or detail hasn't landed
  // yet, fall back to the row data so the modal is never blank.
  const displayPaper = useMemo<LibraryPaper | null>(() => {
    if (!selected) return null;
    if (paperDetail && paperDetail.id && paperDetail.id === selected.id) {
      return { ...selected, ...paperDetail };
    }
    return selected;
  }, [selected, paperDetail]);

  const debounceRef = useRef<number | null>(null);

  // Initial + tab/discipline-change loads. Stays driven by the parent so
  // multiple components don't double-fetch the same surface.
  useEffect(() => {
    onLoadTab(tab, discipline === 'all' ? undefined : discipline);
  }, [tab, discipline, onLoadTab]);

  // Debounced live search. 300ms after the last keystroke we fire the
  // query; clearing the input clears search and falls back to tab content.
  // searchQuery is intentionally NOT in the deps — it's set by
  // onSearch's response handler, so including it would re-fire the
  // effect on every successful search and create a tight loop.
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!searchInput.trim()) {
      onClearSearch();
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      onSearch(searchInput.trim(), discipline === 'all' ? undefined : discipline);
    }, 300);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, discipline, onSearch, onClearSearch]);

  const activeList = searchQuery ? searchResults : papersByTab[tab];
  const isSearching = !!searchQuery;
  const hasMedicalInList = useMemo(
    () => activeList.some(p => p.discipline && MEDICAL_DISCIPLINES.has(p.discipline)),
    [activeList],
  );

  return (
    <div>
      {/* Search + discipline pivots */}
      <div className="mb-5 space-y-3">
        <div className="relative">
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search across all sciences — title, author, topic..."
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]/50 transition"
          />
          {searchInput && (
            <button
              onClick={() => { setSearchInput(''); onClearSearch(); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DISCIPLINES.map(d => (
            <button
              key={d.id}
              onClick={() => setDiscipline(d.id)}
              className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                discipline === d.id
                  ? 'bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/40'
                  : 'border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sub-tabs (hidden when search is active — search displaces tabs) */}
      {!isSearching && (
        <div className="mb-4 flex items-end gap-0.5 border-b border-[rgba(168,85,247,0.12)]">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-3 py-2 text-[11px] transition"
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontWeight: tab === t.id ? 600 : 500,
                color: tab === t.id ? '#c084fc' : '#6c7086',
                borderBottom: `2px solid ${tab === t.id ? '#a855f7' : 'transparent'}`,
                marginBottom: -1,
              }}
              title={t.hint}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Medical-paper "not advice" banner — surfaces only when a medical
          paper appears in the current list. The Tutor's four-layer pass
          handles this internally too; this banner is just the explicit
          surface reminder for the user before they click. */}
      {hasMedicalInList && (
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200/90">
          Some papers in this list are clinical or medical. Ava will summarise — that is not medical advice. Check with a healthcare professional before acting on anything you read here.
        </div>
      )}

      {/* List */}
      {/* Loading state — shown for both search and tab fetches. The
          loaded list takes over the moment data arrives. */}
      {((isSearching && searchLoading) || (!isSearching && papersTabLoading[tab])) && activeList.length === 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-10 text-center">
          <div className="inline-flex items-center gap-2 text-[var(--text-muted)] text-sm">
            <span className="ava-papers-spinner" aria-hidden />
            {isSearching ? 'Searching OpenAlex…' : 'Loading papers…'}
          </div>
          <style>{`
            .ava-papers-spinner {
              width: 12px; height: 12px; border-radius: 50%;
              border: 1.5px solid rgba(168, 85, 247, 0.25);
              border-top-color: #a855f7;
              animation: avaPapersSpin 0.85s linear infinite;
              display: inline-block;
            }
            @keyframes avaPapersSpin { to { transform: rotate(360deg); } }
          `}</style>
        </div>
      )}
      {!searchLoading && !papersTabLoading[tab] && activeList.length === 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-10 text-center">
          <div className="text-3xl mb-2 opacity-60">{isSearching ? '\u{1F50D}' : '\u{1F4DA}'}</div>
          <p className="text-sm font-medium text-[var(--text-primary)]">
            {isSearching ? `No papers found for "${searchQuery}"` : 'No papers in this tab yet'}
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {isSearching ? 'Try different keywords or remove the discipline filter.' : 'New picks land regularly. Try the search bar to find something specific.'}
          </p>
        </div>
      )}
      {activeList.length > 0 && (
        <div className="space-y-2">
          {activeList.map((paper, i) => (
            <PaperCard
              key={paper.id ?? paper.arxiv_id ?? paper.doi ?? paper.openalex_id ?? `${i}-${paper.title}`}
              paper={paper}
              onSelect={() => handleSelect(paper)}
              onReadWithAva={() => onReadWithAva(paper)}
            />
          ))}
        </div>
      )}

      {displayPaper && (
        <PaperDetailModal
          paper={displayPaper}
          loading={paperDetailLoading}
          onClose={handleCloseModal}
          onReadWithAva={() => { onReadWithAva(displayPaper); handleCloseModal(); }}
        />
      )}
    </div>
  );
}

function authorLine(authors: LibraryPaper['authors']): string {
  if (!authors || authors.length === 0) return '';
  if (authors.length <= 3) return authors.map(a => a.name).join(', ');
  return `${authors.slice(0, 3).map(a => a.name).join(', ')}, et al.`;
}

function disciplineBadge(d?: PaperDiscipline): { label: string; color: string } | null {
  if (!d) return null;
  const labels: Record<PaperDiscipline, string> = {
    ai_cs: 'AI/CS', biology: 'Biology', medicine: 'Medicine',
    physics: 'Physics', chemistry: 'Chemistry', earth_sciences: 'Earth Sci',
    social_sciences: 'Social Sci', economics: 'Economics',
    engineering: 'Engineering', math: 'Math', other: 'Other',
  };
  return { label: labels[d], color: 'text-[var(--accent)]' };
}

function PaperCard({
  paper,
  onSelect,
  onReadWithAva,
}: {
  paper: LibraryPaper;
  onSelect: () => void;
  onReadWithAva: () => void;
}) {
  const badge = disciplineBadge(paper.discipline);
  const abstractPreview = paper.abstract
    ? paper.abstract.length > 240 ? paper.abstract.slice(0, 240).trim() + '…' : paper.abstract
    : null;

  return (
    <div className="group rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 transition hover:border-[var(--accent)]/40">
      <div className="flex items-start justify-between gap-3">
        <button
          onClick={onSelect}
          className="flex-1 text-left bg-transparent border-none cursor-pointer p-0"
        >
          <h3 className="text-[13px] font-semibold text-[var(--text-primary)] leading-snug">
            {paper.title}
            {paper.retracted && (
              <span className="ml-2 inline-block rounded px-1.5 py-0.5 text-[9px] font-bold bg-red-500/15 text-red-400 border border-red-500/30">
                RETRACTED
              </span>
            )}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--text-muted)]">
            {paper.authors.length > 0 && <span>{authorLine(paper.authors)}</span>}
            {paper.year && <span>· {paper.year}</span>}
            {badge && <span className={`· ${badge.color} font-medium`}>· {badge.label}</span>}
            {paper.citation_count != null && paper.citation_count > 0 && (
              <span>· {paper.citation_count.toLocaleString()} citations</span>
            )}
          </div>
          {paper.featured_note && (
            <p className="mt-2 text-[11px] italic text-[var(--accent)]/80 leading-relaxed">
              {paper.featured_note}
            </p>
          )}
          {abstractPreview && !paper.featured_note && (
            <p className="mt-2 text-[11px] text-[var(--text-secondary)] leading-relaxed">
              {abstractPreview}
            </p>
          )}
        </button>
        <button
          onClick={onReadWithAva}
          className="shrink-0 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 transition whitespace-nowrap"
        >
          Read with Ava
        </button>
      </div>
    </div>
  );
}

function PaperDetailModal({
  paper,
  loading,
  onClose,
  onReadWithAva,
}: {
  paper: LibraryPaper;
  loading: boolean;
  onClose: () => void;
  onReadWithAva: () => void;
}) {
  const badge = disciplineBadge(paper.discipline);
  const isMedical = paper.discipline && MEDICAL_DISCIPLINES.has(paper.discipline);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card)] shadow-2xl"
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 text-white flex items-center justify-center text-lg border-none cursor-pointer transition"
          aria-label="Close"
        >
          ×
        </button>

        <div className="p-6">
          <h2 className="text-[16px] font-semibold text-[var(--text-primary)] leading-snug pr-8">
            {paper.title}
            {paper.retracted && (
              <span className="ml-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/30 align-middle">
                RETRACTED
              </span>
            )}
          </h2>

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--text-muted)]">
            {paper.authors.length > 0 && (
              <span>{paper.authors.map(a => a.name).join(', ')}</span>
            )}
            {paper.year && <span>· {paper.year}</span>}
            {badge && <span className={`· ${badge.color} font-medium`}>· {badge.label}</span>}
            {paper.citation_count != null && paper.citation_count > 0 && (
              <span>· {paper.citation_count.toLocaleString()} citations</span>
            )}
          </div>

          {paper.featured_note && (
            <p className="mt-4 rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/5 px-3 py-2 text-[12px] italic text-[var(--accent)] leading-relaxed">
              {paper.featured_note}
            </p>
          )}

          {paper.abstract ? (
            <div className="mt-4">
              <h3 className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium mb-1.5">Abstract</h3>
              <p className="text-[12.5px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                {paper.abstract}
              </p>
            </div>
          ) : loading ? (
            <div className="mt-4 flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
              <span className="ava-papers-spinner" aria-hidden />
              Loading paper details…
            </div>
          ) : null}

          {isMedical && (
            <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200/90 leading-relaxed">
              <strong>Not medical advice.</strong> Ava's explanation is summarisation, not clinical guidance. Talk to a healthcare professional before acting on anything from this paper.
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              onClick={onReadWithAva}
              className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 transition"
            >
              Read with Ava
            </button>
            {paper.primary_url && (
              <button
                onClick={() => post({ type: 'open_url', url: paper.primary_url! })}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition"
              >
                Original (publisher)
              </button>
            )}
            {paper.oa_pdf_url && paper.oa_pdf_url !== paper.primary_url && (
              <button
                onClick={() => post({ type: 'open_url', url: paper.oa_pdf_url! })}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition"
              >
                Open-access PDF
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
