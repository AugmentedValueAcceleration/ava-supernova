import { useState, useEffect, useRef, type ReactNode, type ComponentProps } from 'react';
import { t, tt, useLocale } from '../i18n';
import { post } from '../App';
import { Chat } from './Chat';
import type { ExtToDashboardMessage } from '../types/messages';
import { Skeleton } from '../components/Skeleton';
import { Icon } from '../components/Icon';
import { HealthPlans } from './HealthPlans';
import { HealthProfilePage } from './HealthProfilePage';
import type {
  HealthExerciseSummary, HealthExerciseDetail,
  HealthRecipeSummary, HealthRecipeDetail,
  HealthWorkoutType,
  HealthTaxonomies, HealthSubmissionStatus,
  HealthProfile, HealthPlanType,
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

// Discipline / course labels are resolved through t() at render (module
// consts evaluate once at import, so a t() call here would freeze to
// English; the helpers below read the live locale instead). The slugs
// themselves are catalogue taxonomy and stay as data.
const workoutTypeLabel = (type: HealthWorkoutType): string => t(`health.browse.workout.${type}`);
const exerciseTypeLabel = (type: string): string => t(`health.submit.ex_type.${type}`);

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
const courseLabel = (course: string): string => t(`health.browse.course.${course}`);

/**
 * PLANS AND PROFILE MOVED HERE, 28 Jul.
 *
 * They lived under Account → Profile, alongside billing and submissions. So
 * somebody opened the section named after the thing they wanted to do and
 * found a catalogue, while the plan they were following and the profile every
 * plan is built from were filed in their account settings.
 *
 * That is almost certainly why profiles sit empty — and an empty profile is
 * upstream of everything: no training days, no cooking time, no household, so
 * generation plans against nulls however good the room is.
 *
 * Order is do → browse → configure: the plan you are following first, the
 * library you build from next, the profile behind it, and Ava last because she
 * is reached from everywhere.
 */
type Tab = 'plans' | 'exercises' | 'recipes' | 'profile' | 'ava';
/** Card layout for the browse grids. Persisted + shared across both tabs. */
type View = 'grid' | 'list';
const VIEW_KEY = 'ava-health-view';

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
  // Set when the host's platform fetch failed — grid shows a retry state.
  exercisesError: boolean;
  recipesError: boolean;
  exerciseDetail: HealthExerciseDetail | null;
  recipeDetail: HealthRecipeDetail | null;
  detailLoading: boolean;
  onLoadExercises: (limit?: number, offset?: number, workoutType?: string, q?: string) => void;
  onLoadRecipes: (limit?: number, offset?: number, course?: string, q?: string, collection?: string, extra?: { collections?: string[]; diets?: string[]; flags?: string[]; cuisines?: string[]; maxTime?: number; sort?: 'name' }) => void;
  onLoadExerciseDetail: (slug: string) => void;
  onLoadRecipeDetail: (slug: string) => void;
  // Recipe/exercise taxonomies — used by the browse filters.
  taxonomies: HealthTaxonomies | null;
  onLoadTaxonomies: () => void;
  /** Still needed for what genuinely IS account-shaped: the general profile
   *  (reused beyond health) and submissions (a contribution concern). */
  onNavigateToProfile: (subTab: 'general' | 'submissions') => void;

  // ── Plans and profile, now rendered here rather than under Account ──────
  /** The whole HealthPlans prop bundle, passed through untouched. */
  healthPlans: Omit<ComponentProps<typeof HealthPlans>, 'onAskAva' | 'healthProfile' | 'curated' | 'dayAssist' | 'trainingLog'>;
  /** Hands the chosen plan type to Ava in the room — the conversational door.
   *  Deliberately NOT a one-shot form: she can ask what she is missing
   *  (health_profile_ask), which a form cannot. */
  onAskAvaPlan: (type: HealthPlanType) => void;
  healthProfile: HealthProfile | null;
  onSaveHealthProfile: (next: HealthProfile) => void;
  /** The starter shelf, passed straight through to the plans surface. */
  curated: NonNullable<ComponentProps<typeof HealthPlans>['curated']>;
  /** Ask-Ava-about-this-day, likewise. */
  dayAssist: NonNullable<ComponentProps<typeof HealthPlans>['dayAssist']>;
  /** The training log — what actually happened. */
  trainingLog: NonNullable<ComponentProps<typeof HealthPlans>['trainingLog']>;
  /** Registers the Ava-tab chat's dispatch with App so host events tagged
   *  lane:'health' route to this focused room (not the main chat). */
  onRegisterHealthChatDispatch: (fn: (msg: ExtToDashboardMessage) => void) => void;
  /** Operator's first name + avatar — passed through to the room's chat. */
  userName?: string | null;
  userAvatarUrl?: string | null;
  // Deep-link — when another surface navigates here wanting a specific
  // tab (e.g. the Health Dashboard's "Set your goals" pointer). Consumed
  // once on mount so a later plain visit lands on the default tab.
  initialTab: Tab | null;
  onConsumeInitialTab: () => void;
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
  exercisesError,
  recipesError,
  exerciseDetail,
  recipeDetail,
  detailLoading,
  onLoadExercises,
  onLoadRecipes,
  onLoadExerciseDetail,
  onLoadRecipeDetail,
  taxonomies,
  onLoadTaxonomies,
  onNavigateToProfile,
  healthPlans, onAskAvaPlan,
  healthProfile, onSaveHealthProfile, curated, dayAssist, trainingLog,
  onRegisterHealthChatDispatch,
  userName,
  userAvatarUrl,
  initialTab,
  onConsumeInitialTab,
}: Props) {
  useLocale();
  // Lands on Plans, not the catalogue: the section is named after the thing
  // you are trying to do, and your plan is that thing. Browsing is how you
  // build one, not the destination.
  const [tab, setTab] = useState<Tab>(() => initialTab ?? 'plans');
  // Grid/list view — shared across both browse tabs, persisted across sessions.
  const [view, setView] = useState<View>(() => {
    try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'; } catch { return 'grid'; }
  });
  const changeView = (next: View) => {
    setView(next);
    try { localStorage.setItem(VIEW_KEY, next); } catch { /* localStorage unavailable */ }
  };
  const [exerciseFilter, setExerciseFilter] = useState<'all' | HealthWorkoutType>('all');
  const [recipeFilter, setRecipeFilter] = useState<'all' | string>('all');
  // Structured recipe filters. Collections + course are the always-on Tier-1
  // chips; diets / dietary-flags (free-from) / cuisines / max-time / sort live
  // in the Tier-2 "Filters" panel. Slugs OR within an axis, AND across axes —
  // the backend resolves + intersects them. (Replaces the single From Scratch
  // toggle, which was just the `unprocessed` collection.)
  const [recipeCollections, setRecipeCollections] = useState<Set<string>>(new Set());
  const [recipeDiets, setRecipeDiets] = useState<Set<string>>(new Set());
  const [recipeFlags, setRecipeFlags] = useState<Set<string>>(new Set());
  const [recipeCuisines, setRecipeCuisines] = useState<Set<string>>(new Set());
  const [recipeMaxTime, setRecipeMaxTime] = useState<number | null>(null);
  const [recipeSort, setRecipeSort] = useState<'curated' | 'name'>('curated');
  // The structured-filter payload for onLoadRecipes' `extra` arg.
  const recipeExtra = () => ({
    collections: recipeCollections.size ? [...recipeCollections] : undefined,
    diets: recipeDiets.size ? [...recipeDiets] : undefined,
    flags: recipeFlags.size ? [...recipeFlags] : undefined,
    cuisines: recipeCuisines.size ? [...recipeCuisines] : undefined,
    maxTime: recipeMaxTime ?? undefined,
    sort: recipeSort === 'curated' ? undefined : recipeSort,
  });
  // Search state — local to the page; resets on close/reopen. Debounced
  // to 300ms via the effects below so we don't fire a request per keystroke.
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [recipeSearch, setRecipeSearch] = useState('');
  /** Which exercise/recipe is open in the modal. null = closed. The
   *  detail itself comes through prop `exerciseDetail` / `recipeDetail`
   *  once the host responds to the load-detail message. */
  const [modalExerciseSlug, setModalExerciseSlug] = useState<string | null>(null);
  const [modalRecipeSlug, setModalRecipeSlug] = useState<string | null>(null);

  // Honour a deep-link tab request, then clear it so the next plain
  // visit to this page lands on the default Exercises tab.
  useEffect(() => {
    if (initialTab) {
      setTab(initialTab);
      onConsumeInitialTab();
    }
  }, [initialTab, onConsumeInitialTab]);

  // Initial load — only fires once per tab per session because App.tsx
  // caches the slice. Subsequent page/filter changes go through the
  // dedicated handlers below.
  useEffect(() => {
    if (tab === 'exercises' && exercises.length === 0 && exercisesTotal === 0 && !exercisesLoading) {
      onLoadExercises(PAGE_SIZE, 0, exerciseFilter === 'all' ? undefined : exerciseFilter);
    }
    if (tab === 'recipes' && recipes.length === 0 && recipesTotal === 0 && !recipesLoading) {
      onLoadRecipes(PAGE_SIZE, 0, recipeFilter === 'all' ? undefined : recipeFilter, undefined, undefined, recipeExtra());
    }
    // Filter chips need the taxonomies (collections / diets / flags / cuisines).
    if ((tab === 'recipes' || tab === 'profile') && !taxonomies) onLoadTaxonomies();
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
    onLoadRecipes(PAGE_SIZE, 0, next === 'all' ? undefined : next, recipeSearch.trim() || undefined, undefined, recipeExtra());
  };
  // Toggle a slug in a structured multi-select axis (immutable Set + reload).
  const toggleRecipeAxis = (set: Set<string>, setSet: (s: Set<string>) => void) => (slug: string) => {
    const next = new Set(set);
    if (next.has(slug)) next.delete(slug); else next.add(slug);
    setSet(next);
  };

  // Page navigation — current offset comes from App.tsx so we always
  // request relative to the server's last-reported slice.
  const goExercisesPage = (newOffset: number) => {
    onLoadExercises(PAGE_SIZE, newOffset, exerciseFilter === 'all' ? undefined : exerciseFilter, exerciseSearch.trim() || undefined);
  };
  const goRecipesPage = (newOffset: number) => {
    onLoadRecipes(PAGE_SIZE, newOffset, recipeFilter === 'all' ? undefined : recipeFilter, recipeSearch.trim() || undefined, undefined, recipeExtra());
  };

  // Search — debounced 300ms. Fires on every value change including the
  // empty-string initial mount; the duplicate empty-q load is harmless
  // because the seq logic in App.tsx drops stale responses.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      console.log('[health] search exercises q=', JSON.stringify(exerciseSearch));
      onLoadExercises(
        PAGE_SIZE, 0,
        exerciseFilter === 'all' ? undefined : exerciseFilter,
        exerciseSearch.trim() || undefined,
      );
    }, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseSearch]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      console.log('[health] search recipes q=', JSON.stringify(recipeSearch));
      onLoadRecipes(
        PAGE_SIZE, 0,
        recipeFilter === 'all' ? undefined : recipeFilter,
        recipeSearch.trim() || undefined,
        undefined,
        recipeExtra(),
      );
    }, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeSearch]);

  // Structured filters changed (collections / diets / flags / cuisines / time /
  // sort) — reload page 0 with the current course + search. Course changes go
  // through handleRecipeFilterChange; search through its own debounce above.
  useEffect(() => {
    onLoadRecipes(
      PAGE_SIZE, 0,
      recipeFilter === 'all' ? undefined : recipeFilter,
      recipeSearch.trim() || undefined,
      undefined,
      recipeExtra(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeCollections, recipeDiets, recipeFlags, recipeCuisines, recipeMaxTime, recipeSort]);

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
            <h1 className="text-[22px] font-light text-vscode-foreground">{t('health.browse.title')}</h1>
            <p className="mt-1 text-[12px] text-vscode-descriptionForeground">
              {t('health.browse.summary', { exercises: exercisesError ? '—' : exercisesTotal, recipes: recipesError ? '—' : recipesTotal })}
            </p>
          </div>
          {/* The "Your plans →" and "Edit your profile →" escape hatches into
              Account are gone: both are tabs on this page now. */}
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigateToProfile('submissions')}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--accent)]/40 transition cursor-pointer"
            >
              {t('health.browse.tab.mine')}
            </button>
          </div>
        </div>

        {/* Top tabs — canonical dashboard style (border-b-2 + --accent var,
            matches Settings/Planner/History/Overview). */}
        <div className="mt-5 flex items-end gap-0.5 border-b border-[var(--border)]">
          {(['plans', 'exercises', 'recipes', 'profile', 'ava'] as Tab[]).map((tabKey) => {
            const isActive = tab === tabKey;
            const count =
              tabKey === 'exercises' ? exercisesTotal :
              tabKey === 'recipes' ? recipesTotal :
              0; // ava tab has no count
            const label =
              tabKey === 'plans' ? t('health.browse.tab.plans') :
              tabKey === 'exercises' ? t('health.browse.tab.exercises') :
              tabKey === 'recipes' ? t('health.browse.tab.recipes') :
              tabKey === 'profile' ? t('health.browse.tab.profile') :
              t('health.browse.tab.ava');
            return (
              <button
                key={tabKey}
                onClick={() => { setTab(tabKey); setModalExerciseSlug(null); setModalRecipeSlug(null); }}
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

      {/* Content area. The Ava room AND an open detail page need a full-bleed,
          non-scrolling region (they own their own scroll); the catalogue grids
          keep the padded, scrolling layout. */}
      <div className={`flex-1 min-h-0 ${(tab === 'ava' || (tab === 'exercises' && modalExerciseSlug) || (tab === 'recipes' && modalRecipeSlug)) ? 'overflow-hidden' : 'overflow-y-auto px-6 py-5'}`}>
        {/* Ava Health & Fitness room — ALWAYS mounted (hidden off-tab) so its
            conversation survives switching between the other Health tabs. Its
            own lane: sends tag surface:'health', host events tagged lane:'health'
            route here, never the main chat. */}
        <div className={`h-full flex-col ${tab === 'ava' ? 'flex' : 'hidden'}`}>
          <div className="shrink-0 border-b border-[var(--border)] bg-[var(--accent)]/5 px-4 py-2 text-[11px] leading-snug text-[var(--text-muted)]">
            {t('health.room.disclaimer')}{' '}
            <button
              type="button"
              onClick={() => post({ type: 'open_url', url: 'https://avasupernova.com/health/safety' })}
              className="cursor-pointer border-none bg-transparent p-0 text-vscode-descriptionForeground underline decoration-dotted underline-offset-2 transition hover:text-vscode-foreground"
            >
              {t('health.browse.safety_link')}
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <Chat
              lane="health"
              onRegisterDispatch={onRegisterHealthChatDispatch}
              isActive={tab === 'ava'}
              userName={userName}
              userAvatarUrl={userAvatarUrl}
            />
          </div>
        </div>
        {tab === 'plans' && (
          // Household for the shopping list, cooking budget for the prep plan.
          // Plans carry profile_snapshot: null on this surface, so the live
          // profile is the only source there is.
          <HealthPlans {...healthPlans} onAskAva={onAskAvaPlan} healthProfile={healthProfile} curated={curated} dayAssist={dayAssist} trainingLog={trainingLog} />
        )}
        {tab === 'profile' && (
          <HealthProfilePage
            profile={healthProfile}
            taxonomies={taxonomies}
            onSave={onSaveHealthProfile}
            onLoadTaxonomies={onLoadTaxonomies}
          />
        )}
        {tab === 'exercises' && (
          modalExerciseSlug ? (
            <DetailPageView onBack={() => setModalExerciseSlug(null)} backLabel={t('health.browse.tab.exercises')}>
              {exerciseDetail && exerciseDetail.slug === modalExerciseSlug
                ? <ExerciseDetailBody ex={exerciseDetail} />
                : <div className="flex h-full items-center justify-center p-8">{detailLoading ? <LoadingCard label={t('health.browse.loading_exercise')} /> : <div className="text-center text-[12px] text-vscode-descriptionForeground">{t('health.browse.failed_to_load')}</div>}</div>}
            </DetailPageView>
          ) : (
            <ExercisesGrid
              items={exercises}
              total={exercisesTotal}
              offset={exercisesOffset}
              filter={exerciseFilter}
              onFilter={handleExerciseFilterChange}
              onPage={goExercisesPage}
              loading={exercisesLoading}
              error={exercisesError}
              onOpen={openExercise}
              search={exerciseSearch}
              onSearch={setExerciseSearch}
              onRefresh={() => goExercisesPage(0)}
              view={view}
              onView={changeView}
            />
          )
        )}
        {tab === 'recipes' && (
          modalRecipeSlug ? (
            <DetailPageView onBack={() => setModalRecipeSlug(null)} backLabel={t('health.browse.tab.recipes')}>
              {recipeDetail && recipeDetail.slug === modalRecipeSlug
                ? <RecipeDetailBody r={recipeDetail} />
                : <div className="flex h-full items-center justify-center p-8">{detailLoading ? <LoadingCard label={t('health.browse.loading_recipe')} /> : <div className="text-center text-[12px] text-vscode-descriptionForeground">{t('health.browse.failed_to_load')}</div>}</div>}
            </DetailPageView>
          ) : (
          <RecipesGrid
            items={recipes}
            total={recipesTotal}
            offset={recipesOffset}
            filter={recipeFilter}
            onFilter={handleRecipeFilterChange}
            taxonomies={taxonomies}
            collections={recipeCollections}
            diets={recipeDiets}
            flags={recipeFlags}
            cuisines={recipeCuisines}
            maxTime={recipeMaxTime}
            sort={recipeSort}
            onToggleCollection={toggleRecipeAxis(recipeCollections, setRecipeCollections)}
            onToggleDiet={toggleRecipeAxis(recipeDiets, setRecipeDiets)}
            onToggleFlag={toggleRecipeAxis(recipeFlags, setRecipeFlags)}
            onToggleCuisine={toggleRecipeAxis(recipeCuisines, setRecipeCuisines)}
            onMaxTime={setRecipeMaxTime}
            onSort={setRecipeSort}
            onClearFilters={() => { setRecipeCollections(new Set()); setRecipeDiets(new Set()); setRecipeFlags(new Set()); setRecipeCuisines(new Set()); setRecipeMaxTime(null); setRecipeSort('curated'); }}
            onPage={goRecipesPage}
            loading={recipesLoading}
            error={recipesError}
            onOpen={openRecipe}
            search={recipeSearch}
            onSearch={setRecipeSearch}
            onRefresh={() => goRecipesPage(0)}
            view={view}
            onView={changeView}
          />
          )
        )}
      </div>
      {/* Recipe / exercise detail now render inline as a full page within the
          tab content (see the blocks above), not as an overlay modal. */}
    </div>
  );
}

// ── Load-failure state ─────────────────────────────────────────────────
// Shown when the host's platform fetch failed — distinct from a genuinely
// empty result. Tells the user it's a network hiccup (not lost data) and
// offers an explicit retry.

function HealthLoadError({ noun, onRetry }: { noun: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <div className="text-[13px] text-vscode-foreground">{t('health.browse.load_error', { noun })}</div>
      <div className="max-w-[280px] text-[11px] leading-relaxed text-vscode-descriptionForeground">
        {t('health.browse.load_error_hint')}
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="mt-1 cursor-pointer rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-[11px] font-medium text-[var(--accent)] transition hover:bg-[var(--accent)]/20"
      >
        {t('health.browse.retry')}
      </button>
    </div>
  );
}

// ── Browse view helpers (shared by both grids) ─────────────────────────

/** The <ul> layout class for the chosen view. Grid is the compact-hero
 *  card grid (denser on wide screens); list is dense horizontal rows. */
function browseLayoutClass(view: View): string {
  return view === 'list'
    ? 'grid gap-2 grid-cols-1 2xl:grid-cols-2'
    : 'grid gap-2.5 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6';
}

function GridIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <rect x="1" y="1" width="6" height="6" rx="1.2" /><rect x="9" y="1" width="6" height="6" rx="1.2" />
      <rect x="1" y="9" width="6" height="6" rx="1.2" /><rect x="9" y="9" width="6" height="6" rx="1.2" />
    </svg>
  );
}
function ListIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <rect x="1" y="2.5" width="14" height="2.4" rx="1.2" /><rect x="1" y="6.8" width="14" height="2.4" rx="1.2" /><rect x="1" y="11.1" width="14" height="2.4" rx="1.2" />
    </svg>
  );
}

/** Grid/list toggle for the browse toolbar. */
function ViewToggle({ view, onView }: { view: View; onView: (v: View) => void }) {
  const cls = (active: boolean) =>
    `flex h-7 w-7 items-center justify-center rounded border transition ${
      active
        ? 'border-vscode-focusBorder text-vscode-foreground bg-vscode-list-activeSelectionBackground'
        : 'border-vscode-panelBorder text-vscode-descriptionForeground hover:text-vscode-foreground hover:border-vscode-focusBorder'
    }`;
  return (
    <div className="flex items-center gap-1" role="group" aria-label={tt('health.browse.view_label', 'View')}>
      <button type="button" onClick={() => onView('grid')} aria-pressed={view === 'grid'} title={tt('health.browse.view_grid', 'Grid view')} className={cls(view === 'grid')}>
        <GridIcon />
      </button>
      <button type="button" onClick={() => onView('list')} aria-pressed={view === 'list'} title={tt('health.browse.view_list', 'List view')} className={cls(view === 'list')}>
        <ListIcon />
      </button>
    </div>
  );
}

// ── Exercise card (grid + list variants) ───────────────────────────────

function ExerciseCard({ ex, view, onOpen }: { ex: HealthExerciseSummary; view: View; onOpen: (slug: string) => void }) {
  const accent = WORKOUT_TYPE_ACCENT[ex.workout_type];
  const pending = ex.status && ex.status !== 'published';
  const thumb = ex.thumbnail_url
    ? <img src={ex.thumbnail_url} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
    : <div className="flex h-full w-full items-center justify-center opacity-25" style={{ background: `linear-gradient(135deg, ${accent}33 0%, ${accent}11 100%)` }} aria-hidden><Icon.fitness size={28} /></div>;

  if (view === 'list') {
    return (
      <li>
        <button type="button" onClick={() => onOpen(ex.slug)} className="group flex w-full items-center gap-3 overflow-hidden rounded-md border border-vscode-panelBorder bg-vscode-editor-background p-2 text-left transition hover:border-vscode-focusBorder">
          <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded">
            {thumb}
            <span aria-hidden className="absolute inset-x-0 top-0 h-[2px]" style={{ background: accent }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[9px] font-medium uppercase tracking-[0.18em]" style={{ color: accent }}>{workoutTypeLabel(ex.workout_type)}</div>
            <h3 className="truncate text-[13px] font-light leading-tight">{ex.name}</h3>
            <div className="mt-1 flex items-center gap-2"><Dots value={ex.difficulty} accent={accent} /><span className="text-[10px] capitalize text-vscode-descriptionForeground">{exerciseTypeLabel(ex.exercise_type)}</span></div>
          </div>
          {pending && <SubmissionStatusBadge status={ex.status!} />}
        </button>
      </li>
    );
  }
  return (
    <li>
      <button type="button" onClick={() => onOpen(ex.slug)} className="group block w-full overflow-hidden rounded-md border border-vscode-panelBorder bg-vscode-editor-background text-left transition hover:border-vscode-focusBorder">
        <div className="relative aspect-[3/2] w-full overflow-hidden bg-vscode-editor-inactiveSelectionBackground">
          {thumb}
          <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: accent }} />
          {pending && <SubmissionStatusBadge status={ex.status!} />}
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-2">
            <div className="mb-0.5 text-[9px] font-medium uppercase tracking-[0.2em]" style={{ color: accent }}>{workoutTypeLabel(ex.workout_type)}</div>
            <h3 className="text-[13px] font-light leading-tight text-white">{ex.name}</h3>
          </div>
        </div>
        <div className="flex items-center justify-between px-2.5 py-2">
          <Dots value={ex.difficulty} accent={accent} />
          <span className="text-[10px] capitalize text-vscode-descriptionForeground">{exerciseTypeLabel(ex.exercise_type)}</span>
        </div>
      </button>
    </li>
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
  error: boolean;
  onOpen: (slug: string) => void;
  search: string;
  onSearch: (next: string) => void;
  onRefresh: () => void;
  view: View;
  onView: (v: View) => void;
}

function ExercisesGrid({ items, total, offset, filter, onFilter, onPage, loading, error, onOpen, search, onSearch, onRefresh, view, onView }: ExercisesGridProps) {
  if (loading && items.length === 0 && !search) {
    return (
      <ul className={browseLayoutClass(view)}>
        {Array.from({ length: view === 'list' ? 6 : 10 }).map((_, i) => (
          <li key={i}><Skeleton height={view === 'list' ? 72 : 150} radius={6} /></li>
        ))}
      </ul>
    );
  }
  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1">
          <SearchInput
            value={search}
            onChange={onSearch}
            placeholder={t('health.browse.search_exercises_placeholder')}
            loading={loading && search.length > 0}
          />
        </div>
        <ViewToggle view={view} onView={onView} />
        <RefreshButton onClick={onRefresh} loading={loading && search.length === 0} />
      </div>
      <FilterRow>
        <FilterChip active={filter === 'all'} onClick={() => onFilter('all')}>{t('health.browse.filter.all')}</FilterChip>
        {WORKOUT_TYPE_ORDER.map((wt) => (
          <FilterChip key={wt} active={filter === wt} onClick={() => onFilter(wt)}>
            {workoutTypeLabel(wt)}
          </FilterChip>
        ))}
      </FilterRow>

      {items.length === 0 ? (
        error ? (
          <HealthLoadError noun={t('health.browse.noun.exercises')} onRetry={onRefresh} />
        ) : (
          <div className="py-8 text-center text-[12px] text-vscode-descriptionForeground">
            {search ? t('health.browse.no_exercises_match_q', { q: search }) : t('health.browse.no_exercises_match')}
          </div>
        )
      ) : (
        <>
          <ul className={browseLayoutClass(view)}>
            {items.map((ex) => (
              <ExerciseCard key={ex.id} ex={ex} view={view} onOpen={onOpen} />
            ))}
          </ul>
          <Pagination total={total} offset={offset} onPage={onPage} loading={loading} />
        </>
      )}
    </div>
  );
}

// ── Recipe card (grid + list variants) ─────────────────────────────────

/** "From Scratch" badge — marks a recipe in the curated `unprocessed`
 *  collection. `floating` is the absolute-positioned variant for the grid
 *  card's photo; the inline variant sits in the list row meta. */
function FromScratchBadge({ floating }: { floating?: boolean }) {
  const label = tt('health.browse.from_scratch', 'From Scratch');
  if (floating) {
    return (
      <div className="absolute left-1.5 top-1.5 z-[1] inline-flex items-center gap-1 rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-white shadow-sm">
        <span aria-hidden>✦</span>{label}
      </div>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--accent)]/15 px-1.5 py-0.5 text-[9px] font-medium text-[var(--accent)]">
      <span aria-hidden>✦</span>{label}
    </span>
  );
}

function RecipeCard({ r, view, onOpen }: { r: HealthRecipeSummary; view: View; onOpen: (slug: string) => void }) {
  const pending = r.status && r.status !== 'published';
  // Footer shows what isn't already on the image (cuisine sits on the photo).
  const footer = r.course || r.origin_country || r.cuisine_name || '';
  const thumb = r.hero_image_url
    ? <img src={r.hero_image_url} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
    : <div className="flex h-full w-full items-center justify-center opacity-30" aria-hidden><Icon.meal size={28} /></div>;

  if (view === 'list') {
    return (
      <li>
        <button type="button" onClick={() => onOpen(r.slug)} className="group flex w-full items-center gap-3 overflow-hidden rounded-md border border-vscode-panelBorder bg-vscode-editor-background p-2 text-left transition hover:border-vscode-focusBorder">
          <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded">{thumb}</div>
          <div className="min-w-0 flex-1">
            {r.cuisine_name && <div className="text-[9px] font-medium uppercase tracking-[0.18em] text-amber-300">{r.cuisine_name}</div>}
            <h3 className="truncate text-[13px] font-light leading-tight">{r.name}</h3>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              {r.course && <span className="text-[10px] capitalize text-vscode-descriptionForeground">{r.course}</span>}
              {r.from_scratch && <FromScratchBadge />}
            </div>
          </div>
          {pending && <SubmissionStatusBadge status={r.status!} />}
        </button>
      </li>
    );
  }
  return (
    <li>
      <button type="button" onClick={() => onOpen(r.slug)} className="group block w-full overflow-hidden rounded-md border border-vscode-panelBorder bg-vscode-editor-background text-left transition hover:border-vscode-focusBorder">
        <div className="relative aspect-[3/2] w-full overflow-hidden bg-vscode-editor-inactiveSelectionBackground">
          {thumb}
          {r.from_scratch && <FromScratchBadge floating />}
          {pending && <SubmissionStatusBadge status={r.status!} />}
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-2">
            {r.cuisine_name && <div className="mb-0.5 text-[9px] font-medium uppercase tracking-[0.2em] text-amber-300">{r.cuisine_name}</div>}
            <h3 className="text-[13px] font-light leading-tight text-white">{r.name}</h3>
          </div>
        </div>
        <div className="flex items-center px-2.5 py-2">
          <span className="truncate text-[10px] capitalize text-vscode-descriptionForeground">{footer}</span>
        </div>
      </button>
    </li>
  );
}

// ── Recipes grid ───────────────────────────────────────────────────────

interface RecipesGridProps {
  items: HealthRecipeSummary[];
  total: number;
  offset: number;
  filter: 'all' | string;
  onFilter: (f: 'all' | string) => void;
  taxonomies: HealthTaxonomies | null;
  collections: Set<string>;
  diets: Set<string>;
  flags: Set<string>;
  cuisines: Set<string>;
  maxTime: number | null;
  sort: 'curated' | 'name';
  onToggleCollection: (slug: string) => void;
  onToggleDiet: (slug: string) => void;
  onToggleFlag: (slug: string) => void;
  onToggleCuisine: (slug: string) => void;
  onMaxTime: (n: number | null) => void;
  onSort: (s: 'curated' | 'name') => void;
  onClearFilters: () => void;
  onPage: (newOffset: number) => void;
  loading: boolean;
  error: boolean;
  onOpen: (slug: string) => void;
  search: string;
  onSearch: (next: string) => void;
  onRefresh: () => void;
  view: View;
  onView: (v: View) => void;
}

function RecipesGrid({ items, total, offset, filter, onFilter, taxonomies, collections, diets, flags, cuisines, maxTime, sort, onToggleCollection, onToggleDiet, onToggleFlag, onToggleCuisine, onMaxTime, onSort, onClearFilters, onPage, loading, error, onOpen, search, onSearch, onRefresh, view, onView }: RecipesGridProps) {
  const tier2Count = collections.size + diets.size + flags.size + cuisines.size + (maxTime != null ? 1 : 0) + (sort !== 'curated' ? 1 : 0);

  if (loading && items.length === 0 && !search) {
    return (
      <ul className={browseLayoutClass(view)}>
        {Array.from({ length: view === 'list' ? 6 : 10 }).map((_, i) => (
          <li key={i}><Skeleton height={view === 'list' ? 72 : 150} radius={6} /></li>
        ))}
      </ul>
    );
  }
  const TIME_PRESETS = [15, 30, 45, 60];
  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1">
          <SearchInput
            value={search}
            onChange={onSearch}
            placeholder={t('health.browse.search_recipes_placeholder')}
            loading={loading && search.length > 0}
          />
        </div>
        <ViewToggle view={view} onView={onView} />
        <RefreshButton onClick={onRefresh} loading={loading && search.length === 0} />
      </div>

      {/* Course — the meal-type tabs (single-select), kept inline. */}
      <FilterRow>
        <FilterChip active={filter === 'all'} onClick={() => onFilter('all')}>{t('health.browse.filter.all')}</FilterChip>
        {COURSE_ORDER.map((c) => (
          <FilterChip key={c} active={filter === c} onClick={() => onFilter(c)}>{courseLabel(c)}</FilterChip>
        ))}
      </FilterRow>

      {/* Filter categories — one compact multi-select dropdown each, inline.
          Keeps every axis visible without a wall of 80+ chips, and there's no
          hidden overlay. Collections + diet + dietary-flags + cuisine are
          multi-select; time + sort show their current value. */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(taxonomies?.collections?.length ?? 0) > 0 && (
          <FilterDropdown label={tt('health.browse.group.collections', 'Collections')} options={taxonomies!.collections} selected={collections} onToggle={onToggleCollection} />
        )}
        {(taxonomies?.diets?.length ?? 0) > 0 && (
          <FilterDropdown label={tt('health.browse.group.diet', 'Diet')} options={taxonomies!.diets} selected={diets} onToggle={onToggleDiet} />
        )}
        {(taxonomies?.dietary_flags?.length ?? 0) > 0 && (
          <FilterDropdown label={tt('health.browse.group.dietary', 'Dietary needs')} options={taxonomies!.dietary_flags} selected={flags} onToggle={onToggleFlag} />
        )}
        {(taxonomies?.cuisines?.length ?? 0) > 0 && (
          <FilterDropdown label={tt('health.browse.group.cuisine', 'Cuisine')} options={taxonomies!.cuisines} selected={cuisines} onToggle={onToggleCuisine} />
        )}
        <FilterDropdown
          label={tt('health.browse.group.time', 'Time')}
          options={TIME_PRESETS.map((m) => ({ slug: String(m), name: `≤ ${m} min` }))}
          selected={new Set(maxTime != null ? [String(maxTime)] : [])}
          onToggle={(s) => onMaxTime(maxTime === Number(s) ? null : Number(s))}
          valueLabel={maxTime != null ? `≤ ${maxTime} min` : undefined}
        />
        <FilterDropdown
          label={tt('health.browse.group.sort', 'Sort')}
          options={[{ slug: 'curated', name: tt('health.browse.sort.curated', 'Curated') }, { slug: 'name', name: tt('health.browse.sort.name', 'A–Z') }]}
          selected={new Set([sort])}
          onToggle={(s) => onSort(s as 'curated' | 'name')}
          valueLabel={sort === 'name' ? tt('health.browse.sort.name', 'A–Z') : tt('health.browse.sort.curated', 'Curated')}
        />
        {tier2Count > 0 && (
          <button onClick={onClearFilters} className="ml-1 cursor-pointer border-none bg-transparent text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
            {tt('health.browse.clear_all', 'Clear filters')}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        error ? (
          <HealthLoadError noun={t('health.browse.noun.recipes')} onRetry={onRefresh} />
        ) : (
          <div className="py-8 text-center text-[12px] text-vscode-descriptionForeground">
            {search ? t('health.browse.no_recipes_match_q', { q: search }) : t('health.browse.no_recipes_match')}
          </div>
        )
      ) : (
        <>
          <ul className={browseLayoutClass(view)}>
            {items.map((r) => (
              <RecipeCard key={r.id} r={r} view={view} onOpen={onOpen} />
            ))}
          </ul>
          <Pagination total={total} offset={offset} onPage={onPage} loading={loading} />
        </>
      )}
    </div>
  );
}

/** One filter axis as a compact multi-select dropdown. The trigger shows the
 *  axis name + a selected count (or a single value via `valueLabel`); the
 *  popover is an opaque checklist — opaque on purpose, because the page's
 *  --bg-card token is translucent and would show through. Closes on outside
 *  click or Escape. */
function FilterDropdown({ label, options, selected, onToggle, valueLabel }: {
  label: string;
  options: { slug: string; name: string }[];
  selected: Set<string>;
  onToggle: (slug: string) => void;
  valueLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const count = selected.size;
  const active = valueLabel ? true : count > 0;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition ${
          active && (valueLabel ? valueLabel !== tt('health.browse.sort.curated', 'Curated') : true)
            ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]'
            : 'border-[var(--border)] bg-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
        }`}
      >
        {valueLabel ? `${label}: ${valueLabel}` : `${label}${count > 0 ? ` · ${count}` : ''}`}
        <span aria-hidden className="text-[8px] opacity-70">&#9662;</span>
      </button>
      {open && (
        <div className="absolute left-0 z-50 mt-1.5 max-h-72 w-60 overflow-y-auto rounded-xl border border-[var(--border)] bg-[#1a1028] p-1.5 shadow-2xl">
          {options.map((o) => {
            const on = selected.has(o.slug);
            return (
              <button
                key={o.slug}
                type="button"
                onClick={() => onToggle(o.slug)}
                className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-none bg-transparent px-2.5 py-1.5 text-left text-[12px] transition ${
                  on ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-input)]'
                }`}
              >
                <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border text-[8px] ${on ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--border)]'}`}>{on ? '✓' : ''}</span>
                {o.name}
              </button>
            );
          })}
        </div>
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
        ← {t('health.browse.prev')}
      </button>
      <span className="uppercase tracking-wider">
        {t('health.browse.page_of', { current: currentPage, total: totalPages })}
        {loading && <span className="ml-2 opacity-60">· {t('health.browse.loading')}</span>}
      </span>
      <button
        type="button"
        onClick={() => !atEnd && !loading && onPage(next)}
        disabled={atEnd || loading}
        className="rounded border border-vscode-panelBorder px-3 py-1.5 transition hover:border-vscode-focusBorder hover:text-vscode-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-vscode-panelBorder disabled:hover:text-vscode-descriptionForeground"
      >
        {t('health.browse.next')} →
      </button>
    </div>
  );
}

// ── Modals ─────────────────────────────────────────────────────────────

/** Full-page detail view inside the Health tab — a back bar over the detail
 *  body, which owns its own scroll. Replaces the old modal overlay for a
 *  page-style UX (navigate in, "← Back"). */
function DetailPageView({ onBack, backLabel, children }: { onBack: () => void; backLabel: string; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-none border-b border-[var(--border)] px-6 py-2.5">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border)] bg-transparent px-2.5 py-1 text-[11px] font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]"
        >
          ← {backLabel}
        </button>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

export function ExerciseDetailBody({ ex }: { ex: HealthExerciseDetail }) {
  // Single-scroll, matching the hub's redesigned exercise view. Contraindications
  // sit ABOVE the method — the safety floor is read before anyone starts. No
  // operator diagnostics (no gate verdict, no draft badge).
  const accent = WORKOUT_TYPE_ACCENT[ex.workout_type];
  const primaries = ex.muscles.filter((m) => m.role === 'primary');
  const secondaries = ex.muscles.filter((m) => m.role === 'secondary');

  const routine: Array<[string, string]> = [];
  if (ex.routine.sets != null) routine.push([t('health.browse.routine.sets'), String(ex.routine.sets)]);
  if (ex.routine.reps_target) routine.push([t('health.browse.routine.reps'), ex.routine.reps_target]);
  if (ex.routine.rest_seconds != null) routine.push([t('health.browse.routine.rest'), ex.routine.rest_seconds + 's']);
  if (ex.routine.tempo) routine.push([t('health.browse.routine.tempo'), ex.routine.tempo]);
  if (ex.routine.rpe != null) routine.push(['RPE', String(ex.routine.rpe)]);
  else if (ex.routine.percent_1rm) routine.push(['%1RM', ex.routine.percent_1rm]);
  if (ex.routine.seconds_per_set != null) routine.push([t('health.browse.per_set'), '~' + ex.routine.seconds_per_set + 's']);
  if (ex.routine.frequency_per_week) routine.push([t('health.browse.routine.freq'), ex.routine.frequency_per_week]);

  const cardio: Array<[string, string]> = [];
  const c = ex.cardio;
  if (c) {
    if (c.style) cardio.push([t('health.browse.cardio.style'), c.style]);
    if (c.duration_minutes != null) cardio.push([t('health.browse.cardio.duration'), c.duration_minutes + ' min']);
    if (c.heart_rate_zone) cardio.push([t('health.browse.cardio.zone'), c.heart_rate_zone]);
    if (c.work_seconds != null) cardio.push([t('health.browse.cardio.work'), c.work_seconds + 's']);
    if (c.rest_seconds != null) cardio.push([t('health.browse.cardio.rest'), c.rest_seconds + 's']);
    if (c.rounds != null) cardio.push([t('health.browse.cardio.rounds'), String(c.rounds)]);
  }
  const alternatives = [
    ...(ex.regression ? [{ ...ex.regression, kind: t('health.browse.easier') }] : []),
    ...(ex.progression ? [{ ...ex.progression, kind: t('health.browse.harder') }] : []),
    ...((ex.substitutions ?? []).map((s) => ({ ...s, kind: t('health.browse.instead') }))),
  ];
  const SEV: Record<string, string> = { avoid: '#f87171', modify: '#fbbf24', caution: '#fbbf24' };

  return (
    <div className="flex h-full flex-col">
      {ex.thumbnail_url && (
        <div className="aspect-[2/1] max-h-[200px] w-full flex-none overflow-hidden bg-vscode-editor-inactiveSelectionBackground">
          <img src={ex.thumbnail_url} alt="" className="h-full w-full object-cover" />
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col">
        <DetailScroll>
          <div className="space-y-5 px-6 pb-8 pt-6 sm:px-8">
            <header>
              <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.3em]" style={{ color: accent }}>{workoutTypeLabel(ex.workout_type)}</div>
              <h2 className="text-[22px] font-light leading-tight text-vscode-foreground">{ex.name}</h2>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-vscode-descriptionForeground">
                <span className="rounded-md bg-vscode-editor-inactiveSelectionBackground px-2 py-0.5 capitalize">{exerciseTypeLabel(ex.exercise_type)}</span>
                <Dots value={ex.difficulty} accent={accent} />
                <span>{t('health.browse.difficulty_n', { n: ex.difficulty })}</span>
                {ex.movement_pattern && <span className="capitalize opacity-70">{ex.movement_pattern.replace(/_/g, ' ')}</span>}
                {ex.session_role && <span className="capitalize opacity-70">{ex.session_role}</span>}
                {ex.laterality && <span className="capitalize opacity-70">{ex.laterality}</span>}
              </div>
            </header>

            {(ex.contraindications?.length ?? 0) > 0 && (
              <section className="rounded-lg border px-4 py-3" style={{ borderColor: 'rgba(248,113,113,0.35)', background: 'rgba(248,113,113,0.06)' }}>
                <h3 className="mb-2 text-[10px] font-medium uppercase tracking-[0.3em]" style={{ color: '#f87171' }}>{t('health.browse.take_care')}</h3>
                <ul className="space-y-1.5">
                  {ex.contraindications!.map((cc) => (
                    <li key={cc.slug} className="text-[12px] leading-relaxed text-vscode-foreground/85">
                      <span className="font-semibold uppercase" style={{ color: SEV[cc.severity] ?? '#fbbf24' }}>{cc.severity}</span>
                      {' · '}{cc.name}{cc.note ? ' — ' + cc.note : ''}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {ex.description && <p className="text-[14px] leading-relaxed text-vscode-foreground/90">{ex.description}</p>}

            {(primaries.length > 0 || secondaries.length > 0 || ex.equipment.length > 0) && (
              <section className="grid gap-4 sm:grid-cols-2">
                {(primaries.length > 0 || secondaries.length > 0) && (
                  <div>
                    <h3 className="mb-2 text-[10px] font-medium uppercase tracking-[0.3em] text-vscode-descriptionForeground">{t('health.browse.muscles')}</h3>
                    <div className="flex flex-wrap gap-1">
                      {primaries.map((m) => <span key={m.slug} className="rounded px-2 py-0.5 text-[10px]" style={{ background: accent + '26', color: accent }}>{m.name}</span>)}
                      {secondaries.map((m) => <span key={m.slug} className="rounded bg-vscode-editor-inactiveSelectionBackground px-2 py-0.5 text-[10px] text-vscode-descriptionForeground">{m.name}</span>)}
                    </div>
                  </div>
                )}
                {ex.equipment.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-[10px] font-medium uppercase tracking-[0.3em] text-vscode-descriptionForeground">{t('health.browse.equipment')}</h3>
                    <div className="flex flex-wrap gap-1">
                      {ex.equipment.map((e) => <span key={e.slug} className="rounded bg-vscode-editor-inactiveSelectionBackground px-2 py-0.5 text-[10px] capitalize text-vscode-descriptionForeground">{e.name}</span>)}
                    </div>
                  </div>
                )}
              </section>
            )}

            {ex.steps.length > 0 && (
              <section>
                <h3 className="mb-2 text-[10px] font-medium uppercase tracking-[0.3em] text-vscode-descriptionForeground">{t('health.browse.howto')}</h3>
                <ol className="space-y-2">
                  {ex.steps.map((s, i) => (
                    <li key={i} className="flex gap-3 text-[13px] leading-relaxed">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium" style={{ borderColor: accent, color: accent }}>{i + 1}</span>
                      <span className="flex-1 text-vscode-foreground/95">{s}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {(ex.coaching_cues?.length ?? 0) > 0 && (
              <section>
                <h3 className="mb-2 text-[10px] font-medium uppercase tracking-[0.3em] text-vscode-descriptionForeground">{t('health.browse.cues')}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {ex.coaching_cues!.map((cue, i) => <span key={i} className="rounded bg-vscode-editor-inactiveSelectionBackground px-2 py-0.5 text-[11px] text-vscode-foreground/85">{cue}</span>)}
                </div>
              </section>
            )}

            {(routine.length > 0 || ex.routine.progression) && (
              <section>
                <h3 className="mb-2 text-[10px] font-medium uppercase tracking-[0.3em] text-vscode-descriptionForeground">{t('health.browse.routine')}</h3>
                <div className="rounded-lg border border-vscode-panelBorder/60 p-4">
                  <dl className="grid grid-cols-3 gap-x-5 gap-y-3 sm:grid-cols-5">
                    {routine.map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-[9px] font-medium uppercase tracking-wider text-vscode-descriptionForeground">{label}</dt>
                        <dd className="mt-1 text-[14px] text-vscode-foreground">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  {ex.routine.progression && <p className="mt-4 border-t border-vscode-panelBorder/60 pt-3 text-[12px] italic text-vscode-descriptionForeground">{ex.routine.progression}</p>}
                </div>
              </section>
            )}

            {cardio.length > 0 && (
              <section>
                <h3 className="mb-2 text-[10px] font-medium uppercase tracking-[0.3em] text-vscode-descriptionForeground">{t('health.browse.cardio')}</h3>
                <div className="rounded-lg border border-vscode-panelBorder/60 p-4">
                  <dl className="grid grid-cols-3 gap-x-5 gap-y-3 sm:grid-cols-5">
                    {cardio.map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-[9px] font-medium uppercase tracking-wider text-vscode-descriptionForeground">{label}</dt>
                        <dd className="mt-1 text-[14px] text-vscode-foreground">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </section>
            )}

            {alternatives.length > 0 && (
              <section>
                <h3 className="mb-2 text-[10px] font-medium uppercase tracking-[0.3em] text-vscode-descriptionForeground">{t('health.browse.easier_harder_instead')}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {alternatives.map((a) => (
                    <span key={a.slug} className="rounded border border-vscode-panelBorder/60 px-2 py-0.5 text-[11px] text-vscode-descriptionForeground">
                      <span className="uppercase tracking-wider opacity-60">{a.kind}</span> {a.name}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {ex.beginner_detail && (
              <section>
                <h3 className="mb-2 text-[10px] font-medium uppercase tracking-[0.3em] text-vscode-descriptionForeground">{t('health.browse.if_youre_new')}</h3>
                <p className="text-[13px] leading-relaxed text-vscode-foreground/85">{ex.beginner_detail}</p>
              </section>
            )}
            {ex.common_mistakes && (
              <section>
                <h3 className="mb-2 text-[10px] font-medium uppercase tracking-[0.3em] text-vscode-descriptionForeground">{t('health.browse.common_mistakes')}</h3>
                <p className="text-[13px] leading-relaxed text-vscode-foreground/85">{ex.common_mistakes}</p>
              </section>
            )}
          </div>
        </DetailScroll>
      </div>
    </div>
  );
}

/** Underline tab bar for the detail overlays — separates sections that used
 *  to stack in one long scroll. */

/** Scroll area that flexes to fill the fixed-height detail modal, so the
 *  overlay keeps one size across tabs without a hardcoded content height. */
function DetailScroll({ children }: { children: ReactNode }) {
  return <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 sm:px-8 sm:pb-8">{children}</div>;
}

type ExtNutKey = 'calories' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fibre_g' | 'sugar_g' | 'sodium_mg' | 'saturated_fat_g';
const EXT_NUTRITION: Array<[ExtNutKey, string]> = [
  ['calories', 'Calories (kcal)'], ['protein_g', 'Protein (g)'], ['carbs_g', 'Carbs (g)'], ['fat_g', 'Fat (g)'],
  ['fibre_g', 'Fibre (g)'], ['sugar_g', 'Sugar (g)'], ['sodium_mg', 'Sodium (mg)'], ['saturated_fat_g', 'Saturated fat (g)'],
];

/** Per-serving nutrition as a table — one row per skill level, so the macro
 *  differences across beginner / intermediate / expert read at a glance.
 *  Columns with no data on any level are dropped. */

export function RecipeDetailBody({ r }: { r: HealthRecipeDetail }) {
  // Single-scroll, matching the hub's redesigned recipe view: identity,
  // overview, skill-level tabs that drive everything below, times, the shopping
  // list split into shared plus "just for this level", the method, then
  // nutrition. No operator diagnostics — a user does not need a gate verdict.
  const [level, setLevel] = useState<'beginner' | 'intermediate' | 'expert'>('beginner');
  const v = r.versions.find((vv) => vv.level === level) || r.versions[0];
  const st = r.storage;
  const nut = v?.nutrition ?? null;
  const cuisineLine = (r.cuisines && r.cuisines.length ? r.cuisines.join(' · ') : r.cuisine_name) || '';

  const shared = r.ingredients.filter((ing) => !ing.level);
  const own = r.ingredients.filter((ing) => ing.level && ing.level === level);
  const qty = (ing: HealthRecipeDetail['ingredients'][number]) =>
    ing.quantity != null ? String(ing.quantity) + (ing.unit ? ' ' + ing.unit : '') : (ing.unit ?? '');

  const levels = (['beginner', 'intermediate', 'expert'] as const).filter((l) => r.versions.some((vv) => vv.level === l));

  return (
    <div className="flex h-full flex-col">
      {r.hero_image_url && (
        <div className="aspect-[2/1] max-h-[200px] w-full flex-none overflow-hidden bg-vscode-editor-inactiveSelectionBackground">
          <img src={r.hero_image_url} alt="" className="h-full w-full object-cover" />
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        <DetailScroll>
          <div className="space-y-6 px-6 pb-8 pt-6 sm:px-8">
            <header>
              {cuisineLine && (
                <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.3em] text-amber-300">{cuisineLine}</div>
              )}
              <h2 className="text-[22px] font-light leading-tight text-vscode-foreground">{r.name}</h2>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                {r.course && <span className="rounded-md bg-vscode-editor-inactiveSelectionBackground px-2 py-0.5 capitalize text-vscode-descriptionForeground">{courseLabel(r.course)}</span>}
                {r.origin_country && <span className="rounded-md bg-vscode-editor-inactiveSelectionBackground px-2 py-0.5 text-vscode-descriptionForeground">{r.origin_country}</span>}
              </div>
            </header>

            {r.overview && <p className="text-[14px] leading-relaxed text-vscode-foreground/90">{r.overview}</p>}

            {levels.length > 1 && (
              <div className="flex gap-1 border-b border-vscode-panelBorder/60">
                {levels.map((l) => (
                  <button key={l} type="button" onClick={() => setLevel(l)}
                    className={l === level
                      ? 'px-3 py-2 text-[12px] border-b-2 border-amber-400 text-amber-300'
                      : 'px-3 py-2 text-[12px] text-vscode-descriptionForeground hover:text-vscode-foreground'}>
                    {t('health.browse.level.' + l)}
                  </button>
                ))}
              </div>
            )}

            {v && (
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-vscode-descriptionForeground">
                {v.prep_time_minutes != null && <span>{t('health.browse.prep')} <strong className="text-vscode-foreground">{v.prep_time_minutes}m</strong></span>}
                {v.cook_time_minutes != null && <span>{t('health.browse.cook')} <strong className="text-vscode-foreground">{v.cook_time_minutes}m</strong></span>}
                {v.total_time_minutes != null && <span>{t('health.browse.total')} <strong className="text-vscode-foreground">{v.total_time_minutes}m</strong></span>}
                {v.default_servings != null && <span>{t('health.browse.serves')} <strong className="text-vscode-foreground">{v.default_servings}</strong></span>}
                {st?.keeps_fridge_days != null && <span>{t('health.storage.fridge')} <strong className="text-vscode-foreground">{st.keeps_fridge_days}d</strong></span>}
                {st?.keeps_freezer_months != null && <span>{t('health.storage.freezer')} <strong className="text-vscode-foreground">{st.keeps_freezer_months}mo</strong></span>}
              </div>
            )}

            {v?.description && <p className="text-[12px] italic leading-relaxed text-vscode-descriptionForeground">{v.description}</p>}

            {r.ingredients.length > 0 && (
              <section>
                <h3 className="mb-2 text-[10px] font-medium uppercase tracking-[0.3em] text-vscode-descriptionForeground">{t('health.browse.ingredients')}</h3>
                <div className="text-[13px] leading-8 text-vscode-foreground/90">
                  {shared.map((ing, idx) => (
                    <div key={'s' + idx}>{qty(ing) && <span className="text-vscode-descriptionForeground">{qty(ing)} </span>}{ing.name}{ing.optional && <span className="text-vscode-descriptionForeground"> {t('health.browse.opt')}</span>}</div>
                  ))}
                  {own.length > 0 && (
                    <>
                      <div className="mb-0.5 mt-2.5 text-[10px] uppercase tracking-wider text-vscode-descriptionForeground">{t('health.browse.just_for_level')} {t('health.browse.level.' + level)}</div>
                      {own.map((ing, idx) => (
                        <div key={'o' + idx}>{qty(ing) && <span className="text-vscode-descriptionForeground">{qty(ing)} </span>}{ing.name}{ing.optional && <span className="text-vscode-descriptionForeground"> {t('health.browse.opt')}</span>}</div>
                      ))}
                    </>
                  )}
                </div>
              </section>
            )}

            {v?.equipment && v.equipment.length > 0 && (
              <section>
                <h3 className="mb-2 text-[10px] font-medium uppercase tracking-[0.3em] text-vscode-descriptionForeground">{t('health.browse.equipment')}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {v.equipment.map((e, i) => (
                    <span key={i} className="rounded bg-vscode-editor-inactiveSelectionBackground px-2 py-0.5 text-[11px] text-vscode-descriptionForeground">{e.name}{e.optional ? ' ' + t('health.browse.optional') : ''}</span>
                  ))}
                </div>
              </section>
            )}

            {((v?.diets && v.diets.length > 0) || (v?.dietary_flags && v.dietary_flags.length > 0)) && (
              <div className="flex flex-wrap gap-1.5">
                {v?.diets?.map((d) => <span key={'d' + d} className="rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/8 px-2.5 py-0.5 text-[10px] uppercase tracking-wider text-[#c084fc]">{d}</span>)}
                {v?.dietary_flags?.map((f) => <span key={'f' + f} className="rounded-full border border-amber-400/30 bg-amber-400/5 px-2.5 py-0.5 text-[10px] uppercase tracking-wider text-amber-300">{f}</span>)}
              </div>
            )}

            {v && v.steps.length > 0 && (
              <section>
                <h3 className="mb-2 text-[10px] font-medium uppercase tracking-[0.3em] text-vscode-descriptionForeground">{t('health.browse.method')}</h3>
                <ol className="space-y-2">
                  {v.steps.map((s, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-amber-400 text-[11px] font-medium text-amber-300">{i + 1}</span>
                      <div className="flex-1 text-[13px] leading-relaxed">
                        <p className="text-vscode-foreground/95">
                          {s.action}
                          {s.tricky_flag && <span className="ml-2 align-middle rounded-sm bg-amber-400/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-amber-300">{t('health.browse.tricky')}</span>}
                        </p>
                        {s.technique_term && <p className="mt-1 text-[11px] uppercase tracking-wider text-amber-300/80">{s.technique_term}</p>}
                        {s.notes && <p className="mt-1 text-[12px] italic text-vscode-descriptionForeground">{s.notes}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {nut && EXT_NUTRITION.some(([k]) => typeof nut[k] === 'number') && (
              <section>
                <h3 className="mb-2 text-[10px] font-medium uppercase tracking-[0.3em] text-vscode-descriptionForeground">
                  {t('health.browse.nutrition')} <span className="normal-case tracking-normal text-vscode-descriptionForeground/70">· {t('health.browse.per_serving_est')}</span>
                </h3>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-vscode-descriptionForeground">
                  {EXT_NUTRITION.map(([k, label]) => typeof nut[k] === 'number' && (
                    <span key={k}>{label} <strong className="text-vscode-foreground">{nut[k]}</strong></span>
                  ))}
                </div>
              </section>
            )}

            {st?.from_frozen_notes && (
              <section>
                <h3 className="mb-2 text-[10px] font-medium uppercase tracking-[0.3em] text-vscode-descriptionForeground">{t('health.storage.cooking_frozen')}</h3>
                <p className="text-[13px] leading-relaxed text-vscode-foreground/85">{st.from_frozen_notes}</p>
              </section>
            )}
          </div>
        </DetailScroll>
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
          border: 1.5px solid color-mix(in srgb, var(--accent) 25%, transparent);
          border-top-color: var(--accent);
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
  const label = status === 'pending' ? t('health.browse.status.pending') : status === 'rejected' ? t('health.browse.status.rejected') : status;
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

function RefreshButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      aria-label={t('health.browse.refresh')}
      title={t('health.browse.refresh')}
      className="shrink-0 mb-3 inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--accent)]/50 transition cursor-pointer disabled:opacity-50 disabled:cursor-wait"
    >
      <svg
        aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
      >
        <path d="M21 12a9 9 0 1 1-3-6.7" />
        <path d="M21 3v6h-6" />
      </svg>
      {loading ? t('health.browse.refreshing') : t('health.browse.refresh')}
    </button>
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
          aria-label={t('health.browse.clear_search')}
          onClick={() => onChange('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
        >
          ×
        </button>
      )}
      {loading && (
        <span
          aria-hidden
          className="absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-[1.5px] border-[var(--accent)]/25 border-t-[var(--accent)]"
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
    <span className="inline-flex shrink-0 gap-[3px]" aria-label={t('health.browse.difficulty_of_5', { n: value })}>
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
