import { useState, useEffect, useMemo } from 'react';
import type {
  HealthExerciseSummary, HealthExerciseDetail,
  HealthRecipeSummary, HealthRecipeDetail,
  HealthWorkoutType,
} from '../types/messages';

/**
 * Health page — public exercise + recipe library browse on the
 * extension surface. Mirrors the platform's /health surface in a
 * narrower-canvas form: two top tabs (Exercises / Recipes), in-page
 * inline detail expansion rather than sub-routes.
 *
 * Plans (personalised programming, day-of recommendations, logging)
 * are intentionally absent from this initial pass — the operator has
 * a separate design for that surface.
 *
 * Data flow: webview posts `load_health_exercises` / `load_health_recipes`
 * to the host on mount; host fetches from /api/health/* and pushes
 * back via `health_*_loaded`. Detail expansion fires
 * `load_health_*_detail` for the clicked slug; full record arrives
 * via `health_*_detail_loaded`.
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

const COURSE_ORDER = ['breakfast', 'main', 'starter', 'side', 'snack', 'dessert'] as const;
const COURSE_LABEL: Record<string, string> = {
  breakfast: 'Breakfast',
  main: 'Mains',
  starter: 'Starters',
  side: 'Sides',
  snack: 'Snacks',
  dessert: 'Desserts',
};

type Tab = 'exercises' | 'recipes';

interface Props {
  exercises: HealthExerciseSummary[];
  recipes: HealthRecipeSummary[];
  exercisesLoading: boolean;
  recipesLoading: boolean;
  exerciseDetail: HealthExerciseDetail | null;
  recipeDetail: HealthRecipeDetail | null;
  detailLoading: boolean;
  onLoadExercises: () => void;
  onLoadRecipes: () => void;
  onLoadExerciseDetail: (slug: string) => void;
  onLoadRecipeDetail: (slug: string) => void;
}

export function Health({
  exercises,
  recipes,
  exercisesLoading,
  recipesLoading,
  exerciseDetail,
  recipeDetail,
  detailLoading,
  onLoadExercises,
  onLoadRecipes,
  onLoadExerciseDetail,
  onLoadRecipeDetail,
}: Props) {
  const [tab, setTab] = useState<Tab>('exercises');
  const [exerciseFilter, setExerciseFilter] = useState<'all' | HealthWorkoutType>('all');
  const [recipeFilter, setRecipeFilter] = useState<'all' | string>('all');
  const [openExerciseSlug, setOpenExerciseSlug] = useState<string | null>(null);
  const [openRecipeSlug, setOpenRecipeSlug] = useState<string | null>(null);

  // Trigger loads on mount + when switching tabs (one-shot per session).
  useEffect(() => {
    if (tab === 'exercises' && exercises.length === 0 && !exercisesLoading) {
      onLoadExercises();
    }
    if (tab === 'recipes' && recipes.length === 0 && !recipesLoading) {
      onLoadRecipes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const exerciseTypeCounts = useMemo(() => {
    const counts = new Map<HealthWorkoutType, number>();
    for (const ex of exercises) {
      counts.set(ex.workout_type, (counts.get(ex.workout_type) ?? 0) + 1);
    }
    return counts;
  }, [exercises]);

  const recipeCourseCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of recipes) {
      const key = r.course ?? 'other';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [recipes]);

  const filteredExercises = useMemo(
    () => exerciseFilter === 'all' ? exercises : exercises.filter((e) => e.workout_type === exerciseFilter),
    [exercises, exerciseFilter],
  );
  const filteredRecipes = useMemo(
    () => recipeFilter === 'all' ? recipes : recipes.filter((r) => r.course === recipeFilter),
    [recipes, recipeFilter],
  );

  const openExercise = (slug: string) => {
    if (openExerciseSlug === slug) {
      setOpenExerciseSlug(null);
      return;
    }
    setOpenExerciseSlug(slug);
    onLoadExerciseDetail(slug);
  };

  const openRecipe = (slug: string) => {
    if (openRecipeSlug === slug) {
      setOpenRecipeSlug(null);
      return;
    }
    setOpenRecipeSlug(slug);
    onLoadRecipeDetail(slug);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <div className="border-b border-vscode-panelBorder px-6 py-5">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-light text-vscode-foreground">Health</h1>
            <p className="mt-1 text-[12px] text-vscode-descriptionForeground">
              {exercises.length} exercises · {recipes.length} recipes · free, open library
            </p>
          </div>
        </div>

        {/* Top tabs */}
        <nav aria-label="Health tabs" className="mt-5">
          <ul className="flex flex-wrap items-end">
            {(['exercises', 'recipes'] as Tab[]).map((t) => {
              const isActive = tab === t;
              const count = t === 'exercises' ? exercises.length : recipes.length;
              return (
                <li key={t} className="border-b border-vscode-panelBorder">
                  <button
                    type="button"
                    onClick={() => setTab(t)}
                    className={`relative inline-flex items-baseline gap-1.5 px-4 py-2.5 text-[12px] transition focus:outline-none ${
                      isActive ? 'text-vscode-textLink-foreground' : 'text-vscode-descriptionForeground hover:text-vscode-foreground'
                    }`}
                  >
                    <span className={`uppercase tracking-wider ${isActive ? 'font-medium' : ''}`}>
                      {t === 'exercises' ? 'Exercises' : 'Recipes'}
                    </span>
                    <span className="text-[10px] opacity-70">{count}</span>
                    {isActive && (
                      <span
                        aria-hidden
                        className="absolute inset-x-2 -bottom-px h-[2px] rounded-t bg-vscode-textLink-foreground"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      {/* Safety reminder strip */}
      <div className="border-b border-vscode-panelBorder bg-vscode-editorWarning-foreground/5 px-6 py-2 text-[11px] text-vscode-descriptionForeground">
        <span className="mr-1.5 text-amber-400">⚠</span>
        Informational only — not medical or dietary advice. Consult a professional before starting any new programme.
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {tab === 'exercises' ? (
          <ExercisesPanel
            items={filteredExercises}
            counts={exerciseTypeCounts}
            filter={exerciseFilter}
            onFilter={setExerciseFilter}
            loading={exercisesLoading}
            openSlug={openExerciseSlug}
            detail={exerciseDetail}
            detailLoading={detailLoading}
            onOpen={openExercise}
          />
        ) : (
          <RecipesPanel
            items={filteredRecipes}
            counts={recipeCourseCounts}
            filter={recipeFilter}
            onFilter={setRecipeFilter}
            loading={recipesLoading}
            openSlug={openRecipeSlug}
            detail={recipeDetail}
            detailLoading={detailLoading}
            onOpen={openRecipe}
          />
        )}
      </div>
    </div>
  );
}

// ── Exercises panel ────────────────────────────────────────────────────

interface ExercisesPanelProps {
  items: HealthExerciseSummary[];
  counts: Map<HealthWorkoutType, number>;
  filter: 'all' | HealthWorkoutType;
  onFilter: (f: 'all' | HealthWorkoutType) => void;
  loading: boolean;
  openSlug: string | null;
  detail: HealthExerciseDetail | null;
  detailLoading: boolean;
  onOpen: (slug: string) => void;
}

function ExercisesPanel({ items, counts, filter, onFilter, loading, openSlug, detail, detailLoading, onOpen }: ExercisesPanelProps) {
  if (loading && items.length === 0) {
    return <div className="py-12 text-center text-[12px] text-vscode-descriptionForeground">Loading exercises…</div>;
  }
  return (
    <div>
      {/* Discipline filter chips */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        <FilterChip active={filter === 'all'} onClick={() => onFilter('all')}>
          All <span className="opacity-60">{items.length}</span>
        </FilterChip>
        {WORKOUT_TYPE_ORDER.filter((t) => (counts.get(t) ?? 0) > 0).map((t) => (
          <FilterChip key={t} active={filter === t} onClick={() => onFilter(t)}>
            {WORKOUT_TYPE_LABEL[t]} <span className="opacity-60">{counts.get(t)}</span>
          </FilterChip>
        ))}
      </div>

      {/* List */}
      {items.length === 0 ? (
        <div className="py-8 text-center text-[12px] text-vscode-descriptionForeground">No exercises match.</div>
      ) : (
        <ul className="space-y-2">
          {items.map((ex) => {
            const isOpen = openSlug === ex.slug;
            return (
              <li key={ex.id}>
                <button
                  type="button"
                  onClick={() => onOpen(ex.slug)}
                  className="block w-full rounded-md border border-vscode-panelBorder bg-vscode-editor-background px-3 py-2.5 text-left transition hover:border-vscode-focusBorder"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] text-vscode-foreground">{ex.name}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-vscode-descriptionForeground">
                        <span className="uppercase tracking-wider">{WORKOUT_TYPE_LABEL[ex.workout_type]}</span>
                        <span>·</span>
                        <span className="capitalize">{ex.exercise_type}</span>
                      </div>
                    </div>
                    <Dots value={ex.difficulty} />
                  </div>
                </button>
                {isOpen && (
                  <div className="mt-1 rounded-md border border-vscode-focusBorder/40 bg-vscode-editor-background px-4 py-4">
                    {detailLoading && (!detail || detail.slug !== ex.slug) && (
                      <div className="text-[11px] text-vscode-descriptionForeground">Loading…</div>
                    )}
                    {detail && detail.slug === ex.slug && <ExerciseDetailView ex={detail} />}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ExerciseDetailView({ ex }: { ex: HealthExerciseDetail }) {
  const primaries = ex.muscles.filter((m) => m.role === 'primary');
  const secondaries = ex.muscles.filter((m) => m.role === 'secondary');
  const routineEntries: Array<[string, string]> = [];
  if (ex.routine.sets != null) routineEntries.push(['Sets', String(ex.routine.sets)]);
  if (ex.routine.reps_target) routineEntries.push(['Reps', ex.routine.reps_target]);
  if (ex.routine.rest_seconds != null) routineEntries.push(['Rest', `${ex.routine.rest_seconds}s`]);
  if (ex.routine.tempo) routineEntries.push(['Tempo', ex.routine.tempo]);
  if (ex.routine.frequency_per_week) routineEntries.push(['Freq.', ex.routine.frequency_per_week]);

  return (
    <div className="space-y-4 text-[12px]">
      {ex.description && (
        <p className="leading-relaxed text-vscode-foreground/85">{ex.description}</p>
      )}

      {ex.steps.length > 0 && (
        <div>
          <h4 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-vscode-descriptionForeground">How to do it</h4>
          <ol className="space-y-1.5">
            {ex.steps.map((step, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="shrink-0 text-vscode-textLink-foreground">{i + 1}.</span>
                <span className="leading-relaxed text-vscode-foreground/90">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {routineEntries.length > 0 && (
        <div>
          <h4 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-vscode-descriptionForeground">How to use it</h4>
          <dl className="grid grid-cols-3 gap-x-4 gap-y-2 rounded-sm border border-vscode-panelBorder/60 p-3 sm:grid-cols-5">
            {routineEntries.map(([label, value]) => (
              <div key={label}>
                <dt className="text-[9px] uppercase tracking-wider text-vscode-descriptionForeground">{label}</dt>
                <dd className="mt-0.5 text-[12px] text-vscode-foreground">{value}</dd>
              </div>
            ))}
          </dl>
          {ex.routine.progression && (
            <p className="mt-2 text-[11px] italic text-vscode-descriptionForeground">{ex.routine.progression}</p>
          )}
        </div>
      )}

      {ex.beginner_detail && (
        <div>
          <h4 className="mb-1 text-[10px] font-medium uppercase tracking-wider text-vscode-descriptionForeground">If you&apos;re new to this</h4>
          <p className="leading-relaxed text-vscode-foreground/85">{ex.beginner_detail}</p>
        </div>
      )}

      {ex.common_mistakes && (
        <div>
          <h4 className="mb-1 text-[10px] font-medium uppercase tracking-wider text-vscode-descriptionForeground">Common mistakes</h4>
          <p className="leading-relaxed text-vscode-foreground/85">{ex.common_mistakes}</p>
        </div>
      )}

      {(primaries.length > 0 || secondaries.length > 0 || ex.equipment.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {(primaries.length > 0 || secondaries.length > 0) && (
            <div>
              <h4 className="mb-1 text-[10px] font-medium uppercase tracking-wider text-vscode-descriptionForeground">Muscles</h4>
              <div className="flex flex-wrap gap-1">
                {primaries.map((m) => (
                  <span key={m.slug} className="rounded bg-vscode-textLink-foreground/15 px-1.5 py-0.5 text-[10px] text-vscode-textLink-foreground">{m.name}</span>
                ))}
                {secondaries.map((m) => (
                  <span key={m.slug} className="rounded bg-vscode-editor-background px-1.5 py-0.5 text-[10px] text-vscode-descriptionForeground">{m.name}</span>
                ))}
              </div>
            </div>
          )}
          {ex.equipment.length > 0 && (
            <div>
              <h4 className="mb-1 text-[10px] font-medium uppercase tracking-wider text-vscode-descriptionForeground">Equipment</h4>
              <div className="flex flex-wrap gap-1">
                {ex.equipment.map((e) => (
                  <span key={e.slug} className="rounded bg-vscode-editor-background px-1.5 py-0.5 text-[10px] capitalize text-vscode-descriptionForeground">{e.name}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Recipes panel ───────────────────────────────────────────────────────

interface RecipesPanelProps {
  items: HealthRecipeSummary[];
  counts: Map<string, number>;
  filter: 'all' | string;
  onFilter: (f: 'all' | string) => void;
  loading: boolean;
  openSlug: string | null;
  detail: HealthRecipeDetail | null;
  detailLoading: boolean;
  onOpen: (slug: string) => void;
}

function RecipesPanel({ items, counts, filter, onFilter, loading, openSlug, detail, detailLoading, onOpen }: RecipesPanelProps) {
  if (loading && items.length === 0) {
    return <div className="py-12 text-center text-[12px] text-vscode-descriptionForeground">Loading recipes…</div>;
  }
  return (
    <div>
      {/* Course filter chips */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        <FilterChip active={filter === 'all'} onClick={() => onFilter('all')}>
          All <span className="opacity-60">{items.length}</span>
        </FilterChip>
        {COURSE_ORDER.filter((c) => (counts.get(c) ?? 0) > 0).map((c) => (
          <FilterChip key={c} active={filter === c} onClick={() => onFilter(c)}>
            {COURSE_LABEL[c]} <span className="opacity-60">{counts.get(c)}</span>
          </FilterChip>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="py-8 text-center text-[12px] text-vscode-descriptionForeground">No recipes match.</div>
      ) : (
        <ul className="space-y-2">
          {items.map((r) => {
            const isOpen = openSlug === r.slug;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onOpen(r.slug)}
                  className="block w-full rounded-md border border-vscode-panelBorder bg-vscode-editor-background px-3 py-2.5 text-left transition hover:border-vscode-focusBorder"
                >
                  <div className="flex items-center gap-3">
                    {r.hero_image_url && (
                      <img
                        src={r.hero_image_url}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] text-vscode-foreground">{r.name}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-vscode-descriptionForeground">
                        {r.cuisine_name && <span>{r.cuisine_name}</span>}
                        {r.course && (
                          <>
                            <span>·</span>
                            <span className="capitalize">{r.course}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
                {isOpen && (
                  <div className="mt-1 rounded-md border border-vscode-focusBorder/40 bg-vscode-editor-background px-4 py-4">
                    {detailLoading && (!detail || detail.slug !== r.slug) && (
                      <div className="text-[11px] text-vscode-descriptionForeground">Loading…</div>
                    )}
                    {detail && detail.slug === r.slug && <RecipeDetailView r={detail} />}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function RecipeDetailView({ r }: { r: HealthRecipeDetail }) {
  const [level, setLevel] = useState<'beginner' | 'intermediate' | 'expert'>('beginner');
  const v = r.versions.find((vv) => vv.level === level) || r.versions[0];

  return (
    <div className="space-y-4 text-[12px]">
      {r.hero_image_url && (
        <img src={r.hero_image_url} alt="" className="aspect-[16/9] w-full rounded object-cover" />
      )}
      {r.overview && (
        <p className="leading-relaxed text-vscode-foreground/85">{r.overview}</p>
      )}

      {r.ingredients.length > 0 && (
        <div>
          <h4 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-vscode-descriptionForeground">Ingredients</h4>
          <ul className="space-y-1 rounded-sm border border-vscode-panelBorder/60 p-3">
            {r.ingredients.map((ing, i) => (
              <li key={i} className="flex gap-2 leading-relaxed">
                <span className="min-w-[60px] font-mono text-[10px] text-vscode-descriptionForeground">
                  {ing.quantity != null ? `${ing.quantity}${ing.unit ? ' ' + ing.unit : ''}` : ing.unit ?? '—'}
                </span>
                <span className="text-vscode-foreground/90">
                  {ing.name}
                  {ing.optional && <span className="ml-1 text-vscode-descriptionForeground">(opt.)</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.versions.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-3">
            <h4 className="text-[10px] font-medium uppercase tracking-wider text-vscode-descriptionForeground">Method</h4>
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
                    className={`rounded px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                      isActive
                        ? 'bg-vscode-textLink-foreground/20 text-vscode-textLink-foreground'
                        : 'text-vscode-descriptionForeground hover:text-vscode-foreground'
                    }`}
                  >
                    {l}
                  </button>
                );
              })}
            </div>
          </div>
          {v && (
            <ol className="space-y-2">
              {v.steps.map((s, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="shrink-0 text-vscode-textLink-foreground">{i + 1}.</span>
                  <div className="flex-1">
                    <p className="leading-relaxed text-vscode-foreground/90">{s.action}</p>
                    {s.notes && <p className="mt-1 text-[11px] italic text-vscode-descriptionForeground">{s.notes}</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

// ── Shared ─────────────────────────────────────────────────────────────

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-wider transition ${
        active
          ? 'border-vscode-textLink-foreground/50 bg-vscode-textLink-foreground/15 text-vscode-textLink-foreground'
          : 'border-vscode-panelBorder text-vscode-descriptionForeground hover:text-vscode-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function Dots({ value }: { value: number }) {
  return (
    <span className="inline-flex shrink-0 gap-[3px]" aria-label={`Difficulty ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className="h-[5px] w-[5px] rounded-full"
          style={{ background: n <= value ? 'var(--vscode-textLink-foreground)' : 'var(--vscode-panelBorder)' }}
        />
      ))}
    </span>
  );
}
