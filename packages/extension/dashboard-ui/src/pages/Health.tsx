import { useState, useEffect } from 'react';
import { post } from '../App';
import { HealthSubmissionModal } from './HealthSubmissionModal';
import { HealthMySubmissions } from './HealthMySubmissions';
import type {
  HealthExerciseSummary, HealthExerciseDetail,
  HealthRecipeSummary, HealthRecipeDetail,
  HealthWorkoutType,
  HealthTaxonomies, HealthMySubmissions as HealthMySubmissionsData,
  HealthExerciseSubmissionPayload, HealthRecipeSubmissionPayload,
  HealthSubmissionStatus,
  HealthExerciseDraft, HealthRecipeDraft,
  HealthGenerateExerciseIntake, HealthGenerateRecipeIntake,
} from '../types/messages';

/**
 * Health page — public exercise + recipe library browse on the
 * extension surface. Two top tabs (Exercises / Recipes), grid card
 * layout with discipline / course filter chips, click-to-open overlay
 * modal for the full detail rather than inline expansion (cleaner
 * navigation, doesn't reflow the grid as the user reads).
 *
 * Plans (personalised programming, day-of recommendations, logging)
 * are intentionally absent from this pass — the operator has a
 * separate design for that surface.
 */

const WORKOUT_TYPE_LABEL: Record<HealthWorkoutType, string> = {
  strength: 'Strength',
  hypertrophy: 'Hypertrophy',
  conditioning: 'Conditioning',
  mobility: 'Mobility',
  hybrid: 'Hybrid',
  yoga: 'Yoga',
  pilates: 'Pilates',
  running: 'Running',
  cycling: 'Cycling',
  recovery: 'Recovery',
  hiit: 'HIIT',
};

const WORKOUT_TYPE_ORDER: HealthWorkoutType[] = [
  'strength', 'hypertrophy', 'conditioning', 'hiit',
  'mobility', 'yoga', 'pilates', 'recovery',
  'running', 'cycling', 'hybrid',
];

/**
 * Accent colour per discipline — drives the top stripe + chip on the
 * exercise card so each discipline reads at a glance without a thumbnail.
 * Mirrors the per-discipline palette on the platform's /health pages,
 * but reduced to single accent values for the dense card surface.
 */
const WORKOUT_TYPE_ACCENT: Record<HealthWorkoutType, string> = {
  strength: '#a8a8b3',
  hypertrophy: '#c084fc',
  conditioning: '#34d399',
  hiit: '#fb923c',
  mobility: '#60a5fa',
  yoga: '#fbbf24',
  pilates: '#f472b6',
  recovery: '#94a3b8',
  running: '#22d3ee',
  cycling: '#a78bfa',
  hybrid: '#f87171',
};

const COURSE_ORDER = ['breakfast', 'main', 'starter', 'side', 'snack', 'dessert'] as const;
const COURSE_LABEL: Record<string, string> = {
  breakfast: 'Breakfast',
  main: 'Mains',
  starter: 'Starters',
  side: 'Sides',
  snack: 'Snacks',
  dessert: 'Desserts',
};

type Tab = 'exercises' | 'recipes' | 'mine';

const PAGE_SIZE = 24;

interface Props {
  exercises: HealthExerciseSummary[];
  recipes: HealthRecipeSummary[];
  exercisesTotal: number;
  recipesTotal: number;
  exercisesOffset: number;
  recipesOffset: number;
  exercisesLoading: boolean;
  recipesLoading: boolean;
  exerciseDetail: HealthExerciseDetail | null;
  recipeDetail: HealthRecipeDetail | null;
  detailLoading: boolean;
  onLoadExercises: (limit?: number, offset?: number, workoutType?: string, q?: string) => void;
  onLoadRecipes: (limit?: number, offset?: number, course?: string, q?: string) => void;
  onLoadExerciseDetail: (slug: string) => void;
  onLoadRecipeDetail: (slug: string) => void;
  // Submission flow
  taxonomies: HealthTaxonomies | null;
  mySubmissions: HealthMySubmissionsData;
  submissionResult: { kind: 'exercise' | 'recipe'; ok: boolean; error?: string; status?: HealthSubmissionStatus; submissionName?: string } | null;
  submissionInflight: boolean;
  onLoadTaxonomies: () => void;
  onLoadMySubmissions: () => void;
  onClearMyRejectedSubmissions: () => void;
  clearingMySubmissions: boolean;
  onSubmitExercise: (p: HealthExerciseSubmissionPayload) => void;
  onSubmitRecipe: (p: HealthRecipeSubmissionPayload) => void;
  onClearSubmissionResult: () => void;
  // Ava-assisted draft generation
  exerciseDraft: HealthExerciseDraft | null;
  recipeDraft: HealthRecipeDraft | null;
  draftInflight: boolean;
  draftError: string | null;
  onGenerateExerciseDraft: (intake: HealthGenerateExerciseIntake) => void;
  onGenerateRecipeDraft: (intake: HealthGenerateRecipeIntake) => void;
  onClearDraft: () => void;
}

export function Health({
  exercises,
  recipes,
  exercisesTotal,
  recipesTotal,
  exercisesOffset,
  recipesOffset,
  exercisesLoading,
  recipesLoading,
  exerciseDetail,
  recipeDetail,
  detailLoading,
  onLoadExercises,
  onLoadRecipes,
  onLoadExerciseDetail,
  onLoadRecipeDetail,
  taxonomies,
  mySubmissions,
  submissionResult,
  submissionInflight,
  onLoadTaxonomies,
  onLoadMySubmissions,
  onClearMyRejectedSubmissions,
  clearingMySubmissions,
  onSubmitExercise,
  onSubmitRecipe,
  onClearSubmissionResult,
  exerciseDraft,
  recipeDraft,
  draftInflight,
  draftError,
  onGenerateExerciseDraft,
  onGenerateRecipeDraft,
  onClearDraft,
}: Props) {
  const [tab, setTab] = useState<Tab>('exercises');
  const [exerciseFilter, setExerciseFilter] = useState<'all' | HealthWorkoutType>('all');
  const [recipeFilter, setRecipeFilter] = useState<'all' | string>('all');
  // Search state — local to the page; resets on close/reopen. Debounced
  // to 300ms via the effects below so we don't fire a request per keystroke.
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [recipeSearch, setRecipeSearch] = useState('');
  /** Which exercise/recipe is open in the modal. null = closed. The
   *  detail itself comes through prop `exerciseDetail` / `recipeDetail`
   *  once the host responds to the load-detail message. */
  const [modalExerciseSlug, setModalExerciseSlug] = useState<string | null>(null);
  const [modalRecipeSlug, setModalRecipeSlug] = useState<string | null>(null);
  const [submissionModalOpen, setSubmissionModalOpen] = useState(false);

  // Open the submission modal — preloads taxonomies on first open so the
  // kind picker is immediately functional, and clears any prior result.
  const openSubmissionModal = () => {
    if (!taxonomies) onLoadTaxonomies();
    onClearSubmissionResult();
    setSubmissionModalOpen(true);
  };

  // Load My Submissions on first mount + when the result of a fresh
  // submission lands (the host triggers a reload on success).
  useEffect(() => { onLoadMySubmissions(); }, [onLoadMySubmissions]);

  // Initial load — only fires once per tab per session because App.tsx
  // caches the slice. Subsequent page/filter changes go through the
  // dedicated handlers below.
  useEffect(() => {
    if (tab === 'exercises' && exercises.length === 0 && exercisesTotal === 0 && !exercisesLoading) {
      onLoadExercises(PAGE_SIZE, 0, exerciseFilter === 'all' ? undefined : exerciseFilter);
    }
    if (tab === 'recipes' && recipes.length === 0 && recipesTotal === 0 && !recipesLoading) {
      onLoadRecipes(PAGE_SIZE, 0, recipeFilter === 'all' ? undefined : recipeFilter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Filter change resets to page 0 + refetches with the new filter +
  // current search query.
  const handleExerciseFilterChange = (next: 'all' | HealthWorkoutType) => {
    setExerciseFilter(next);
    onLoadExercises(PAGE_SIZE, 0, next === 'all' ? undefined : next, exerciseSearch.trim() || undefined);
  };
  const handleRecipeFilterChange = (next: 'all' | string) => {
    setRecipeFilter(next);
    onLoadRecipes(PAGE_SIZE, 0, next === 'all' ? undefined : next, recipeSearch.trim() || undefined);
  };

  // Page navigation — current offset comes from App.tsx so we always
  // request relative to the server's last-reported slice.
  const goExercisesPage = (newOffset: number) => {
    onLoadExercises(PAGE_SIZE, newOffset, exerciseFilter === 'all' ? undefined : exerciseFilter, exerciseSearch.trim() || undefined);
  };
  const goRecipesPage = (newOffset: number) => {
    onLoadRecipes(PAGE_SIZE, newOffset, recipeFilter === 'all' ? undefined : recipeFilter, recipeSearch.trim() || undefined);
  };

  // Search — debounced 300ms. Fires on every value change including the
  // empty-string initial mount; the duplicate empty-q load is harmless
  // because the seq logic in App.tsx drops stale responses.
  useEffect(() => {
    const t = window.setTimeout(() => {
      console.log('[health] search exercises q=', JSON.stringify(exerciseSearch));
      onLoadExercises(
        PAGE_SIZE, 0,
        exerciseFilter === 'all' ? undefined : exerciseFilter,
        exerciseSearch.trim() || undefined,
      );
    }, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseSearch]);
  useEffect(() => {
    const t = window.setTimeout(() => {
      console.log('[health] search recipes q=', JSON.stringify(recipeSearch));
      onLoadRecipes(
        PAGE_SIZE, 0,
        recipeFilter === 'all' ? undefined : recipeFilter,
        recipeSearch.trim() || undefined,
      );
    }, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeSearch]);

  // ESC closes whichever modal is open.
  useEffect(() => {
    if (!modalExerciseSlug && !modalRecipeSlug) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setModalExerciseSlug(null);
        setModalRecipeSlug(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalExerciseSlug, modalRecipeSlug]);

  // Filtering + counts moved server-side. The exercises/recipes arrays
  // are already the filtered, paginated slice. exercisesTotal/recipesTotal
  // is the full count for the active filter (drives pagination math).

  const openExercise = (slug: string) => {
    setModalExerciseSlug(slug);
    onLoadExerciseDetail(slug);
  };
  const openRecipe = (slug: string) => {
    setModalRecipeSlug(slug);
    onLoadRecipeDetail(slug);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <div className="border-b border-vscode-panelBorder px-6 py-5">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-light text-vscode-foreground">Health &amp; Nutrition</h1>
            <p className="mt-1 text-[12px] text-vscode-descriptionForeground">
              {exercisesTotal} exercises · {recipesTotal} recipes · free, open library ·{' '}
              <button
                type="button"
                onClick={() => post({ type: 'open_url', url: 'https://ava-supernova.com/health/safety' })}
                className="cursor-pointer border-none bg-transparent p-0 text-vscode-descriptionForeground underline decoration-dotted underline-offset-2 transition hover:text-vscode-foreground"
              >
                informational only — read safety policy
              </button>
            </p>
          </div>
          <button
            type="button"
            onClick={openSubmissionModal}
            className="shrink-0 rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 transition cursor-pointer"
          >
            + Contribute
          </button>
        </div>

        {/* Top tabs — canonical dashboard style (border-b-2 + --accent var,
            matches Settings/Planner/History/Overview). */}
        <div className="mt-5 flex items-end gap-0.5 border-b border-[var(--border)]">
          {(['exercises', 'recipes', 'mine'] as Tab[]).map((t) => {
            const isActive = tab === t;
            const count =
              t === 'exercises' ? exercisesTotal :
              t === 'recipes' ? recipesTotal :
              mySubmissions.exercises.length + mySubmissions.recipes.length;
            const label =
              t === 'exercises' ? 'Exercises' :
              t === 'recipes' ? 'Recipes' :
              'My submissions';
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`-mb-px border-b-2 border-x-0 border-t-0 bg-transparent px-4 py-2 text-xs transition cursor-pointer ${
                  isActive
                    ? 'border-[var(--accent)] text-[var(--accent)] font-semibold'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {label}
                {count > 0 && <span className="ml-1.5 opacity-60">{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {tab === 'exercises' && (
          <ExercisesGrid
            items={exercises}
            total={exercisesTotal}
            offset={exercisesOffset}
            filter={exerciseFilter}
            onFilter={handleExerciseFilterChange}
            onPage={goExercisesPage}
            loading={exercisesLoading}
            onOpen={openExercise}
            search={exerciseSearch}
            onSearch={setExerciseSearch}
          />
        )}
        {tab === 'recipes' && (
          <RecipesGrid
            items={recipes}
            total={recipesTotal}
            offset={recipesOffset}
            filter={recipeFilter}
            onFilter={handleRecipeFilterChange}
            onPage={goRecipesPage}
            loading={recipesLoading}
            onOpen={openRecipe}
            search={recipeSearch}
            onSearch={setRecipeSearch}
          />
        )}
        {tab === 'mine' && (
          <HealthMySubmissions
            data={mySubmissions}
            onRefresh={onLoadMySubmissions}
            onContribute={openSubmissionModal}
            onClearRejected={onClearMyRejectedSubmissions}
            clearing={clearingMySubmissions}
          />
        )}
      </div>

      {/* Submission modal — covers everything; opens from the Contribute button. */}
      <HealthSubmissionModal
        open={submissionModalOpen}
        onClose={() => { setSubmissionModalOpen(false); onClearDraft(); }}
        taxonomies={taxonomies}
        inflight={submissionInflight}
        result={submissionResult ? { kind: submissionResult.kind, ok: submissionResult.ok, error: submissionResult.error, submissionName: submissionResult.submissionName } : null}
        onSubmitExercise={onSubmitExercise}
        onSubmitRecipe={onSubmitRecipe}
        onClearResult={onClearSubmissionResult}
        onRetryTaxonomies={onLoadTaxonomies}
        exerciseDraft={exerciseDraft}
        recipeDraft={recipeDraft}
        draftInflight={draftInflight}
        draftError={draftError}
        onGenerateExerciseDraft={onGenerateExerciseDraft}
        onGenerateRecipeDraft={onGenerateRecipeDraft}
        onClearDraft={onClearDraft}
      />

      {/* Overlay modals — one mounts at a time, whichever was clicked. */}
      {modalExerciseSlug && (
        <ExerciseDetailModal
          slug={modalExerciseSlug}
          detail={exerciseDetail}
          loading={detailLoading}
          onClose={() => setModalExerciseSlug(null)}
        />
      )}
      {modalRecipeSlug && (
        <RecipeDetailModal
          slug={modalRecipeSlug}
          detail={recipeDetail}
          loading={detailLoading}
          onClose={() => setModalRecipeSlug(null)}
        />
      )}
    </div>
  );
}

// ── Exercises grid ─────────────────────────────────────────────────────

interface ExercisesGridProps {
  items: HealthExerciseSummary[];
  total: number;
  offset: number;
  filter: 'all' | HealthWorkoutType;
  onFilter: (f: 'all' | HealthWorkoutType) => void;
  onPage: (newOffset: number) => void;
  loading: boolean;
  onOpen: (slug: string) => void;
  search: string;
  onSearch: (next: string) => void;
}

function ExercisesGrid({ items, total, offset, filter, onFilter, onPage, loading, onOpen, search, onSearch }: ExercisesGridProps) {
  if (loading && items.length === 0 && !search) {
    return <LoadingCard label="Loading exercises…" />;
  }
  return (
    <div>
      <SearchInput
        value={search}
        onChange={onSearch}
        placeholder="Search exercises — name, e.g. 'squat'"
        loading={loading && search.length > 0}
      />
      <FilterRow>
        <FilterChip active={filter === 'all'} onClick={() => onFilter('all')}>All</FilterChip>
        {WORKOUT_TYPE_ORDER.map((t) => (
          <FilterChip key={t} active={filter === t} onClick={() => onFilter(t)}>
            {WORKOUT_TYPE_LABEL[t]}
          </FilterChip>
        ))}
      </FilterRow>

      {items.length === 0 ? (
        <div className="py-8 text-center text-[12px] text-vscode-descriptionForeground">
          {search ? `No exercises match "${search}".` : 'No exercises match.'}
        </div>
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((ex) => {
              const accent = WORKOUT_TYPE_ACCENT[ex.workout_type];
              const isMineAndPending = ex.status && ex.status !== 'published';
              return (
                <li key={ex.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(ex.slug)}
                    className="group block w-full overflow-hidden rounded-lg border border-vscode-panelBorder bg-vscode-editor-background text-left transition hover:border-vscode-focusBorder"
                  >
                    {/* Thumbnail or fallback band — same shape recipe cards use
                        so exercises read as part of the same visual system.
                        Falls back to a coloured panel keyed to the workout_type
                        accent when no thumbnail is set. */}
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-vscode-editor-inactiveSelectionBackground">
                      {ex.thumbnail_url ? (
                        <img
                          src={ex.thumbnail_url}
                          alt=""
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div
                          className="flex h-full w-full items-center justify-center text-3xl opacity-25"
                          style={{ background: `linear-gradient(135deg, ${accent}33 0%, ${accent}11 100%)` }}
                          aria-hidden
                        >
                          🏋
                        </div>
                      )}
                      <span
                        aria-hidden
                        className="absolute inset-x-0 top-0 h-[3px]"
                        style={{ background: accent }}
                      />
                      {isMineAndPending && <SubmissionStatusBadge status={ex.status!} />}
                      <div aria-hidden className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                      <div className="absolute inset-x-0 bottom-0 p-3">
                        <div
                          className="mb-1 text-[9px] font-medium uppercase tracking-[0.2em]"
                          style={{ color: accent }}
                        >
                          {WORKOUT_TYPE_LABEL[ex.workout_type]}
                        </div>
                        <h3 className="text-[13px] font-light leading-tight text-white">{ex.name}</h3>
                      </div>
                    </div>
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <Dots value={ex.difficulty} accent={accent} />
                      <span className="text-[10px] capitalize text-vscode-descriptionForeground">{ex.exercise_type}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          <Pagination total={total} offset={offset} onPage={onPage} loading={loading} />
        </>
      )}
    </div>
  );
}

// ── Recipes grid ───────────────────────────────────────────────────────

interface RecipesGridProps {
  items: HealthRecipeSummary[];
  total: number;
  offset: number;
  filter: 'all' | string;
  onFilter: (f: 'all' | string) => void;
  onPage: (newOffset: number) => void;
  loading: boolean;
  onOpen: (slug: string) => void;
  search: string;
  onSearch: (next: string) => void;
}

function RecipesGrid({ items, total, offset, filter, onFilter, onPage, loading, onOpen, search, onSearch }: RecipesGridProps) {
  if (loading && items.length === 0 && !search) {
    return <LoadingCard label="Loading recipes…" />;
  }
  return (
    <div>
      <SearchInput
        value={search}
        onChange={onSearch}
        placeholder="Search recipes — name, e.g. 'chicken'"
        loading={loading && search.length > 0}
      />
      <FilterRow>
        <FilterChip active={filter === 'all'} onClick={() => onFilter('all')}>All</FilterChip>
        {COURSE_ORDER.map((c) => (
          <FilterChip key={c} active={filter === c} onClick={() => onFilter(c)}>
            {COURSE_LABEL[c]}
          </FilterChip>
        ))}
      </FilterRow>

      {items.length === 0 ? (
        <div className="py-8 text-center text-[12px] text-vscode-descriptionForeground">
          {search ? `No recipes match "${search}".` : 'No recipes match.'}
        </div>
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((r) => {
              const isMineAndPending = r.status && r.status !== 'published';
              return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onOpen(r.slug)}
                  className="group block w-full overflow-hidden rounded-lg border border-vscode-panelBorder bg-vscode-editor-background text-left transition hover:border-vscode-focusBorder"
                >
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-vscode-editor-inactiveSelectionBackground">
                    {r.hero_image_url ? (
                      <img
                        src={r.hero_image_url}
                        alt=""
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-3xl opacity-30">🍽</div>
                    )}
                    {isMineAndPending && <SubmissionStatusBadge status={r.status!} />}
                    <div aria-hidden className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-3">
                      {r.cuisine_name && (
                        <div className="mb-1 text-[9px] font-medium uppercase tracking-[0.2em] text-amber-300">
                          {r.cuisine_name}
                        </div>
                      )}
                      <h3 className="text-[13px] font-light leading-tight text-white">{r.name}</h3>
                    </div>
                  </div>
                </button>
              </li>
              );
            })}
          </ul>
          <Pagination total={total} offset={offset} onPage={onPage} loading={loading} />
        </>
      )}
    </div>
  );
}

// ── Pagination ─────────────────────────────────────────────────────────

function Pagination({
  total, offset, onPage, loading,
}: { total: number; offset: number; onPage: (next: number) => void; loading: boolean }) {
  if (total <= PAGE_SIZE) return null;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const prev = Math.max(0, offset - PAGE_SIZE);
  const next = Math.min((totalPages - 1) * PAGE_SIZE, offset + PAGE_SIZE);
  const atStart = offset === 0;
  const atEnd = currentPage >= totalPages;
  return (
    <div className="mt-8 flex items-center justify-center gap-3 border-t border-vscode-panelBorder pt-5 text-[11px] text-vscode-descriptionForeground">
      <button
        type="button"
        onClick={() => !atStart && !loading && onPage(prev)}
        disabled={atStart || loading}
        className="rounded border border-vscode-panelBorder px-3 py-1.5 transition hover:border-vscode-focusBorder hover:text-vscode-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-vscode-panelBorder disabled:hover:text-vscode-descriptionForeground"
      >
        ← Prev
      </button>
      <span className="uppercase tracking-wider">
        Page {currentPage} of {totalPages}
        {loading && <span className="ml-2 opacity-60">· loading…</span>}
      </span>
      <button
        type="button"
        onClick={() => !atEnd && !loading && onPage(next)}
        disabled={atEnd || loading}
        className="rounded border border-vscode-panelBorder px-3 py-1.5 transition hover:border-vscode-focusBorder hover:text-vscode-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-vscode-panelBorder disabled:hover:text-vscode-descriptionForeground"
      >
        Next →
      </button>
    </div>
  );
}

// ── Modals ─────────────────────────────────────────────────────────────

function ModalShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm p-3 sm:p-6"
      style={{ animation: 'avaDetailModalIn 120ms ease-out' }}
      onClick={onClose}
    >
      <style>{`
        @keyframes avaDetailModalIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes avaDetailCardIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[rgba(168,85,247,0.20)] bg-gradient-to-br from-[#0f0f17] to-[#1a1625] shadow-[0_0_60px_rgba(168,85,247,0.12)]"
        style={{ animation: 'avaDetailCardIn 160ms ease-out' }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-none bg-black/40 text-lg text-white transition hover:bg-black/60"
        >
          ×
        </button>
        {children}
      </div>
    </div>
  );
}

function ExerciseDetailModal({
  slug, detail, loading, onClose,
}: { slug: string; detail: HealthExerciseDetail | null; loading: boolean; onClose: () => void }) {
  const ready = detail && detail.slug === slug;
  return (
    <ModalShell onClose={onClose}>
      <div className="p-6 sm:p-8">
        {!ready && (
          loading
            ? <LoadingCard label="Loading exercise…" />
            : <div className="py-16 text-center text-[12px] text-vscode-descriptionForeground">Failed to load.</div>
        )}
        {ready && <ExerciseDetailBody ex={detail!} />}
      </div>
    </ModalShell>
  );
}

function ExerciseDetailBody({ ex }: { ex: HealthExerciseDetail }) {
  const accent = WORKOUT_TYPE_ACCENT[ex.workout_type];
  const primaries = ex.muscles.filter((m) => m.role === 'primary');
  const secondaries = ex.muscles.filter((m) => m.role === 'secondary');
  const routineEntries: Array<[string, string]> = [];
  if (ex.routine.sets != null) routineEntries.push(['Sets', String(ex.routine.sets)]);
  if (ex.routine.reps_target) routineEntries.push(['Reps', ex.routine.reps_target]);
  if (ex.routine.rest_seconds != null) routineEntries.push(['Rest', `${ex.routine.rest_seconds}s`]);
  if (ex.routine.tempo) routineEntries.push(['Tempo', ex.routine.tempo]);
  if (ex.routine.frequency_per_week) routineEntries.push(['Freq.', ex.routine.frequency_per_week]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <header>
        <div
          className="mb-2 text-[10px] font-medium uppercase tracking-[0.3em]"
          style={{ color: accent }}
        >
          {WORKOUT_TYPE_LABEL[ex.workout_type]}
        </div>
        <h2 className="text-[22px] font-light leading-tight text-vscode-foreground">{ex.name}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-vscode-descriptionForeground">
          <span className="rounded-md bg-vscode-editor-inactiveSelectionBackground px-2 py-0.5 capitalize">
            {ex.exercise_type}
          </span>
          <Dots value={ex.difficulty} accent={accent} />
          <span>Difficulty {ex.difficulty}/5</span>
        </div>
      </header>

      {ex.description && (
        <p className="text-[14px] leading-relaxed text-vscode-foreground/90">{ex.description}</p>
      )}

      {ex.steps.length > 0 && (
        <section>
          <h3 className="mb-3 text-[10px] font-medium uppercase tracking-[0.3em] text-vscode-descriptionForeground">How to do it</h3>
          <ol className="space-y-2">
            {ex.steps.map((step, i) => (
              <li key={i} className="flex gap-3 rounded-md border border-vscode-panelBorder/60 px-3 py-2.5">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium"
                  style={{ borderColor: accent, color: accent }}
                >
                  {i + 1}
                </span>
                <span className="text-[13px] leading-relaxed text-vscode-foreground/95">{step}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {routineEntries.length > 0 && (
        <section>
          <h3 className="mb-3 text-[10px] font-medium uppercase tracking-[0.3em] text-vscode-descriptionForeground">How to use it</h3>
          <div className="rounded-lg border border-vscode-panelBorder/60 p-4">
            <dl className="grid grid-cols-3 gap-x-5 gap-y-3 sm:grid-cols-5">
              {routineEntries.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[9px] font-medium uppercase tracking-wider text-vscode-descriptionForeground">{label}</dt>
                  <dd className="mt-1 text-[14px] text-vscode-foreground">{value}</dd>
                </div>
              ))}
            </dl>
            {ex.routine.progression && (
              <p className="mt-4 border-t border-vscode-panelBorder/60 pt-3 text-[12px] italic text-vscode-descriptionForeground">
                {ex.routine.progression}
              </p>
            )}
          </div>
        </section>
      )}

      {ex.beginner_detail && (
        <section>
          <h3 className="mb-2 text-[10px] font-medium uppercase tracking-[0.3em] text-vscode-descriptionForeground">If you&apos;re new to this</h3>
          <div className="rounded-lg border border-vscode-panelBorder/60 px-4 py-3">
            <p className="text-[13px] leading-relaxed text-vscode-foreground/85">{ex.beginner_detail}</p>
          </div>
        </section>
      )}

      {ex.common_mistakes && (
        <section>
          <h3 className="mb-2 text-[10px] font-medium uppercase tracking-[0.3em] text-vscode-descriptionForeground">Common mistakes</h3>
          <div className="rounded-lg border border-vscode-panelBorder/60 px-4 py-3">
            <p className="text-[13px] leading-relaxed text-vscode-foreground/85">{ex.common_mistakes}</p>
          </div>
        </section>
      )}

      {(primaries.length > 0 || secondaries.length > 0 || ex.equipment.length > 0) && (
        <section className="grid gap-4 sm:grid-cols-2">
          {(primaries.length > 0 || secondaries.length > 0) && (
            <div>
              <h3 className="mb-2 text-[10px] font-medium uppercase tracking-[0.3em] text-vscode-descriptionForeground">Muscles</h3>
              <div className="flex flex-wrap gap-1">
                {primaries.map((m) => (
                  <span
                    key={m.slug}
                    className="rounded px-2 py-0.5 text-[10px]"
                    style={{ background: `${accent}26`, color: accent }}
                  >
                    {m.name}
                  </span>
                ))}
                {secondaries.map((m) => (
                  <span key={m.slug} className="rounded bg-vscode-editor-inactiveSelectionBackground px-2 py-0.5 text-[10px] text-vscode-descriptionForeground">
                    {m.name}
                  </span>
                ))}
              </div>
            </div>
          )}
          {ex.equipment.length > 0 && (
            <div>
              <h3 className="mb-2 text-[10px] font-medium uppercase tracking-[0.3em] text-vscode-descriptionForeground">Equipment</h3>
              <div className="flex flex-wrap gap-1">
                {ex.equipment.map((e) => (
                  <span key={e.slug} className="rounded bg-vscode-editor-inactiveSelectionBackground px-2 py-0.5 text-[10px] capitalize text-vscode-descriptionForeground">
                    {e.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function RecipeDetailModal({
  slug, detail, loading, onClose,
}: { slug: string; detail: HealthRecipeDetail | null; loading: boolean; onClose: () => void }) {
  const ready = detail && detail.slug === slug;
  return (
    <ModalShell onClose={onClose}>
      {!ready && (
        <div className="p-6 sm:p-8">
          {loading
            ? <LoadingCard label="Loading recipe…" />
            : <div className="py-12 text-center text-[12px] text-vscode-descriptionForeground">Failed to load.</div>}
        </div>
      )}
      {ready && <RecipeDetailBody r={detail!} />}
    </ModalShell>
  );
}

function RecipeDetailBody({ r }: { r: HealthRecipeDetail }) {
  const [level, setLevel] = useState<'beginner' | 'intermediate' | 'expert'>('beginner');
  const v = r.versions.find((vv) => vv.level === level) || r.versions[0];

  return (
    <div>
      {/* Hero image bleeds to the edge of the modal — magazine cover feel */}
      {r.hero_image_url && (
        <div className="aspect-[2/1] w-full overflow-hidden bg-vscode-editor-inactiveSelectionBackground">
          <img src={r.hero_image_url} alt="" className="h-full w-full object-cover" />
        </div>
      )}

      <div className="space-y-6 p-6 sm:p-8">
        <header>
          {r.cuisine_name && (
            <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.3em] text-amber-300">
              {r.cuisine_name}
            </div>
          )}
          <h2 className="text-[22px] font-light leading-tight text-vscode-foreground">{r.name}</h2>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            {r.origin_country && (
              <span className="rounded-md bg-vscode-editor-inactiveSelectionBackground px-2 py-0.5 text-vscode-descriptionForeground">{r.origin_country}</span>
            )}
            {r.course && (
              <span className="rounded-md bg-vscode-editor-inactiveSelectionBackground px-2 py-0.5 capitalize text-vscode-descriptionForeground">{r.course}</span>
            )}
          </div>
        </header>

        {r.overview && (
          <p className="text-[14px] leading-relaxed text-vscode-foreground/90">{r.overview}</p>
        )}

        {r.ingredients.length > 0 && (
          <section>
            <h3 className="mb-2 text-[10px] font-medium uppercase tracking-[0.3em] text-vscode-descriptionForeground">Ingredients</h3>
            <ul className="grid gap-1.5 rounded-lg border border-vscode-panelBorder/60 p-4 sm:grid-cols-2">
              {r.ingredients.map((ing, i) => (
                <li key={i} className="flex gap-2 text-[13px]">
                  <span className="min-w-[80px] font-mono text-[11px] text-vscode-descriptionForeground">
                    {ing.quantity != null ? `${ing.quantity}${ing.unit ? ' ' + ing.unit : ''}` : ing.unit ?? '—'}
                  </span>
                  <span className="text-vscode-foreground/95">
                    {ing.name}
                    {ing.optional && <span className="ml-1 text-vscode-descriptionForeground">(opt.)</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {r.versions.length > 0 && (
          <section>
            <div className="mb-3 flex items-center gap-3">
              <h3 className="text-[10px] font-medium uppercase tracking-[0.3em] text-vscode-descriptionForeground">Method</h3>
              <div className="flex gap-1">
                {(['beginner', 'intermediate', 'expert'] as const).map((l) => {
                  const has = r.versions.some((vv) => vv.level === l);
                  if (!has) return null;
                  const isActive = l === level;
                  return (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setLevel(l)}
                      className={`rounded px-2.5 py-1 text-[10px] uppercase tracking-wider transition ${
                        isActive
                          ? 'bg-amber-400/20 text-amber-300'
                          : 'text-vscode-descriptionForeground hover:text-vscode-foreground'
                      }`}
                    >
                      {l}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Per-version metadata strip — timing + servings */}
            {v && (
              <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[11px] text-vscode-descriptionForeground">
                {v.prep_time_minutes != null && (
                  <span><span className="opacity-60">Prep</span> {v.prep_time_minutes}m</span>
                )}
                {v.cook_time_minutes != null && (
                  <span><span className="opacity-60">Cook</span> {v.cook_time_minutes}m</span>
                )}
                {v.total_time_minutes != null && (
                  <span><span className="opacity-60">Total</span> {v.total_time_minutes}m</span>
                )}
                {v.default_servings != null && (
                  <span><span className="opacity-60">Serves</span> {v.default_servings}</span>
                )}
              </div>
            )}

            {v?.description && (
              <p className="mb-3 text-[13px] leading-relaxed text-vscode-foreground/90">{v.description}</p>
            )}

            {/* Equipment — per skill level. Was the missing piece — every
                curated recipe row has equipment but the read path didn't
                fetch it and the display didn't render it. */}
            {v && v.equipment && v.equipment.length > 0 && (
              <div className="mb-4">
                <h4 className="mb-2 text-[10px] font-medium uppercase tracking-[0.3em] text-vscode-descriptionForeground">Equipment</h4>
                <ul className="grid gap-1.5 rounded-lg border border-vscode-panelBorder/60 p-4 sm:grid-cols-2">
                  {v.equipment.map((e, i) => (
                    <li key={i} className="flex items-baseline gap-2 text-[13px]">
                      <span className="text-vscode-foreground/95">{e.name}</span>
                      {e.optional && <span className="text-[10px] text-vscode-descriptionForeground">optional</span>}
                      {e.notes && <span className="text-[11px] italic text-vscode-descriptionForeground">— {e.notes}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Diets + dietary flags as quiet chip rows so allergen-aware
                users can scan the recipe at a glance. */}
            {v && ((v.diets && v.diets.length > 0) || (v.dietary_flags && v.dietary_flags.length > 0)) && (
              <div className="mb-4 flex flex-wrap gap-1.5">
                {v.diets?.map((d) => (
                  <span key={`d-${d}`} className="rounded-full border border-[rgba(168,85,247,0.30)] bg-[rgba(168,85,247,0.08)] px-2.5 py-0.5 text-[10px] uppercase tracking-wider text-[#c084fc]">
                    {d}
                  </span>
                ))}
                {v.dietary_flags?.map((f) => (
                  <span key={`f-${f}`} className="rounded-full border border-amber-400/30 bg-amber-400/5 px-2.5 py-0.5 text-[10px] uppercase tracking-wider text-amber-300">
                    {f}
                  </span>
                ))}
              </div>
            )}

            {v && (
              <ol className="space-y-2">
                {v.steps.map((s, i) => (
                  <li key={i} className="flex gap-3 rounded-md border border-vscode-panelBorder/60 px-3 py-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-amber-400 text-[11px] font-medium text-amber-300">
                      {i + 1}
                    </span>
                    <div className="flex-1 text-[13px] leading-relaxed">
                      <p className="text-vscode-foreground/95">
                        {s.action}
                        {s.tricky_flag && (
                          <span className="ml-2 align-middle rounded-sm bg-amber-400/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-amber-300">tricky</span>
                        )}
                      </p>
                      {s.technique_term && (
                        <p className="mt-1 text-[11px] uppercase tracking-wider text-amber-300/80">{s.technique_term}</p>
                      )}
                      {s.notes && (
                        <p className="mt-1 text-[12px] italic text-vscode-descriptionForeground">{s.notes}</p>
                      )}
                      {s.time_estimate_seconds != null && s.time_estimate_seconds > 0 && (
                        <p className="mt-1 text-[10px] text-vscode-descriptionForeground/80">
                          ~{Math.round(s.time_estimate_seconds / 60)}m
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

// ── Shared bits ────────────────────────────────────────────────────────

function LoadingCard({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-10 text-center">
      <div className="inline-flex items-center gap-2 text-[var(--text-muted)] text-sm">
        <span className="ava-health-spinner" aria-hidden />
        {label}
      </div>
      <style>{`
        .ava-health-spinner {
          width: 12px; height: 12px; border-radius: 50%;
          border: 1.5px solid rgba(168, 85, 247, 0.25);
          border-top-color: #a855f7;
          animation: avaHealthSpin 0.85s linear infinite;
          display: inline-block;
        }
        @keyframes avaHealthSpin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function FilterRow({ children }: { children: React.ReactNode }) {
  return <div className="mb-5 flex flex-wrap gap-0.5 border-b border-[var(--border)]">{children}</div>;
}

function SubmissionStatusBadge({ status }: { status: HealthSubmissionStatus }) {
  // Surfaces on cards in the main grid when the row is the caller's own
  // pending / rejected submission. Operator-curated rows + other people's
  // submissions never carry status from the auth-aware list endpoint, so
  // this never renders for them.
  const label = status === 'pending' ? 'Pending review' : status === 'rejected' ? 'Rejected' : status;
  const colour = status === 'rejected'
    ? { bg: 'rgba(243,139,168,0.20)', border: 'rgba(243,139,168,0.45)', fg: '#f38ba8' }
    : { bg: 'rgba(249,226,175,0.20)', border: 'rgba(249,226,175,0.45)', fg: '#f9e2af' };
  return (
    <span
      className="absolute top-2 right-2 z-10 rounded-full border px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider"
      style={{ background: colour.bg, borderColor: colour.border, color: colour.fg }}
    >
      {label}
    </span>
  );
}

function SearchInput({
  value, onChange, placeholder, loading,
}: { value: string; onChange: (next: string) => void; placeholder: string; loading: boolean }) {
  return (
    <div className="relative mb-3">
      <input
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] py-2 pl-9 pr-9 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]/50 transition"
      />
      {/* Magnifier */}
      <svg
        aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      {value && !loading && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
        >
          ×
        </button>
      )}
      {loading && (
        <span
          aria-hidden
          className="absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-[1.5px] border-[rgba(168,85,247,0.25)] border-t-[var(--accent)]"
          style={{ animation: 'avaHealthSearchSpin 0.85s linear infinite' }}
        />
      )}
      <style>{`@keyframes avaHealthSearchSpin { to { transform: translateY(-50%) rotate(360deg); } }`}</style>
    </div>
  );
}

function FilterChip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px cursor-pointer border-b-2 border-x-0 border-t-0 bg-transparent px-2.5 py-2 text-[11px] font-medium transition ${
        active
          ? 'border-[var(--accent)] text-[var(--accent)]'
          : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
      }`}
    >
      {children}
    </button>
  );
}

function Dots({ value, accent }: { value: number; accent?: string }) {
  const on = accent || 'var(--vscode-textLink-foreground)';
  return (
    <span className="inline-flex shrink-0 gap-[3px]" aria-label={`Difficulty ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className="h-[5px] w-[5px] rounded-full"
          style={{ background: n <= value ? on : 'var(--vscode-panelBorder)' }}
        />
      ))}
    </span>
  );
}
