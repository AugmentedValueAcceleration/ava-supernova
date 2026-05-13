import { useEffect, useState } from 'react';
import type {
  HealthTaxonomies, HealthExerciseSubmissionPayload, HealthRecipeSubmissionPayload,
  HealthExerciseType, HealthWorkoutType,
} from '../types/messages';

/**
 * Submission modal for community contributions to the Health library.
 *
 * Two paths off a kind picker — Exercise or Recipe — each unfolding
 * into a dedicated form. Forms enforce the same shape the platform
 * API will validate against (POST /api/health/submissions/[kind]).
 *
 * Safety stance: allergens (recipes) and contraindications (exercises)
 * are mandatory-to-think-about, not mandatory-to-tick. We surface the
 * full grid so the submitter has to scan it; the operator locks the
 * final taxonomy in the hub moderation drawer before approval. A
 * submission with zero safety flags is accepted but lights up amber
 * in the hub queue.
 */

const EXERCISE_TYPES: { slug: HealthExerciseType; label: string }[] = [
  { slug: 'compound', label: 'Compound' },
  { slug: 'isolation', label: 'Isolation' },
  { slug: 'bodyweight', label: 'Bodyweight' },
  { slug: 'plyometric', label: 'Plyometric' },
  { slug: 'mobility', label: 'Mobility' },
  { slug: 'cardio', label: 'Cardio' },
  { slug: 'isometric', label: 'Isometric' },
  { slug: 'stretching', label: 'Stretching' },
  { slug: 'breathing', label: 'Breathing' },
];

const WORKOUT_TYPES: { slug: HealthWorkoutType; label: string }[] = [
  { slug: 'strength', label: 'Strength' },
  { slug: 'hypertrophy', label: 'Hypertrophy' },
  { slug: 'conditioning', label: 'Conditioning' },
  { slug: 'hiit', label: 'HIIT' },
  { slug: 'mobility', label: 'Mobility' },
  { slug: 'yoga', label: 'Yoga' },
  { slug: 'pilates', label: 'Pilates' },
  { slug: 'recovery', label: 'Recovery' },
  { slug: 'running', label: 'Running' },
  { slug: 'cycling', label: 'Cycling' },
  { slug: 'hybrid', label: 'Hybrid' },
];

const COURSES = ['breakfast', 'main', 'starter', 'side', 'snack', 'dessert'];

type Kind = 'exercise' | 'recipe';

interface Props {
  open: boolean;
  onClose: () => void;
  taxonomies: HealthTaxonomies | null;
  inflight: boolean;
  result: { kind: Kind; ok: boolean; error?: string; submissionName?: string } | null;
  onSubmitExercise: (p: HealthExerciseSubmissionPayload) => void;
  onSubmitRecipe: (p: HealthRecipeSubmissionPayload) => void;
  onClearResult: () => void;
  onRetryTaxonomies: () => void;
}

export function HealthSubmissionModal({
  open, onClose, taxonomies, inflight, result,
  onSubmitExercise, onSubmitRecipe, onClearResult, onRetryTaxonomies,
}: Props) {
  const [kind, setKind] = useState<Kind | null>(null);
  // Wait up to 12s for taxonomies after the user picks a kind before
  // declaring failure. The host has an 8s fetch timeout + posts back
  // on failure now, so we should normally see a result inside a second.
  const [taxLoadStartedAt, setTaxLoadStartedAt] = useState<number | null>(null);
  const [taxFailedTick, setTaxFailedTick] = useState(0); // tick increments on retry to re-fire the timer
  useEffect(() => {
    if (!open || kind === null || taxonomies) return;
    setTaxLoadStartedAt(Date.now());
    const timer = window.setTimeout(() => setTaxFailedTick(t => t + 1), 12000);
    return () => window.clearTimeout(timer);
  }, [open, kind, taxonomies, taxFailedTick]);
  const taxonomiesFailed =
    !!taxonomies &&
    taxonomies.allergens.length === 0 &&
    taxonomies.contraindications.length === 0 &&
    taxonomies.cuisines.length === 0;
  const taxonomiesTimedOut =
    !taxonomies &&
    taxLoadStartedAt !== null &&
    taxFailedTick > 0 &&
    Date.now() - taxLoadStartedAt >= 12000;

  // Reset kind when modal closes/reopens
  useEffect(() => {
    if (!open) {
      setKind(null);
      setTaxLoadStartedAt(null);
      setTaxFailedTick(0);
    }
  }, [open]);

  // ESC closes (when not in flight)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !inflight) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, inflight, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog" aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={() => { if (!inflight) onClose(); }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-vscode-panelBorder bg-vscode-editor-background shadow-2xl"
      >
        <button
          onClick={onClose} disabled={inflight}
          aria-label="Close"
          className="absolute top-3 right-3 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-none bg-black/40 text-lg text-white transition hover:bg-black/60 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ×
        </button>

        <div className="p-6 sm:p-8">
          {/* Result screen — shown after a submission completes */}
          {result && (
            <ResultScreen result={result} onContinue={() => { onClearResult(); setKind(null); }} onClose={onClose} />
          )}

          {/* Kind picker — no submission in flight, no result to show */}
          {!result && kind === null && (
            <KindPicker onPick={setKind} />
          )}

          {/* Form */}
          {!result && kind === 'exercise' && taxonomies && !taxonomiesFailed && (
            <ExerciseForm
              taxonomies={taxonomies}
              inflight={inflight}
              onBack={() => setKind(null)}
              onSubmit={onSubmitExercise}
            />
          )}
          {!result && kind === 'recipe' && taxonomies && !taxonomiesFailed && (
            <RecipeForm
              taxonomies={taxonomies}
              inflight={inflight}
              onBack={() => setKind(null)}
              onSubmit={onSubmitRecipe}
            />
          )}
          {!result && kind !== null && !taxonomies && !taxonomiesTimedOut && (
            <div className="py-12 text-center text-[12px] text-vscode-descriptionForeground">Loading taxonomies…</div>
          )}
          {!result && kind !== null && (taxonomiesFailed || taxonomiesTimedOut) && (
            <TaxonomiesFailed
              onRetry={() => {
                setTaxLoadStartedAt(Date.now());
                onRetryTaxonomies();
              }}
              onBack={() => setKind(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Taxonomy load failure ─────────────────────────────────────────────

function TaxonomiesFailed({ onRetry, onBack }: { onRetry: () => void; onBack: () => void }) {
  return (
    <div className="py-12 text-center">
      <div className="text-3xl mb-3 text-amber-400">⚠</div>
      <h2 className="text-[16px] font-light text-vscode-foreground mb-2">Couldn't load the safety taxonomy</h2>
      <p className="text-[12px] text-vscode-descriptionForeground mb-6 max-w-md mx-auto leading-relaxed">
        We need the allergen + contraindication lists to render the form — the form is unsafe to fill in
        without them. Check your connection or wait a moment if the platform's deploying.
      </p>
      <div className="flex gap-2 justify-center">
        <button onClick={onBack}
          className="rounded-md border border-vscode-panelBorder bg-transparent px-4 py-2 text-[12px] text-vscode-descriptionForeground hover:text-vscode-foreground transition cursor-pointer">
          Back
        </button>
        <button onClick={onRetry}
          className="rounded-md border border-[var(--accent)] bg-[var(--accent)]/15 px-4 py-2 text-[12px] text-[var(--accent)] hover:bg-[var(--accent)]/25 transition cursor-pointer">
          Retry
        </button>
      </div>
    </div>
  );
}

// ── Result screen ─────────────────────────────────────────────────────

function ResultScreen({
  result, onContinue, onClose,
}: { result: { kind: Kind; ok: boolean; error?: string; submissionName?: string }; onContinue: () => void; onClose: () => void }) {
  if (result.ok) {
    return (
      <div className="text-center py-8">
        <div className="text-4xl mb-3">✓</div>
        <h2 className="text-[18px] font-light text-vscode-foreground mb-2">
          Submitted for review
        </h2>
        <p className="text-[13px] text-vscode-descriptionForeground mb-6 max-w-md mx-auto leading-relaxed">
          {result.submissionName && <strong>{result.submissionName}</strong>} is in the moderation queue. You'll see it under <em>My submissions</em>{' '}
          while it's reviewed. We're held-until-reviewed because health content can affect bodies — thank you for the contribution.
        </p>
        <div className="flex gap-2 justify-center">
          <button
            onClick={onContinue}
            className="rounded-md border border-vscode-panelBorder bg-transparent px-4 py-2 text-[12px] text-vscode-foreground hover:border-vscode-focusBorder transition cursor-pointer"
          >
            Submit another
          </button>
          <button
            onClick={onClose}
            className="rounded-md border border-[var(--accent)] bg-[var(--accent)]/15 px-4 py-2 text-[12px] text-[var(--accent)] hover:bg-[var(--accent)]/25 transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center py-8">
      <div className="text-4xl mb-3 text-red-400">!</div>
      <h2 className="text-[18px] font-light text-vscode-foreground mb-2">Submission failed</h2>
      <p className="text-[13px] text-red-300/90 mb-6 max-w-md mx-auto leading-relaxed font-mono">
        {result.error ?? 'Unknown error'}
      </p>
      <button
        onClick={onContinue}
        className="rounded-md border border-vscode-panelBorder bg-transparent px-4 py-2 text-[12px] text-vscode-foreground hover:border-vscode-focusBorder transition cursor-pointer"
      >
        Try again
      </button>
    </div>
  );
}

// ── Kind picker ───────────────────────────────────────────────────────

function KindPicker({ onPick }: { onPick: (k: Kind) => void }) {
  return (
    <div>
      <h2 className="text-[20px] font-light text-vscode-foreground mb-2">Contribute to the library</h2>
      <p className="text-[12px] text-vscode-descriptionForeground mb-6 leading-relaxed max-w-lg">
        Submissions are held for review before they go live. The operator locks the safety taxonomy
        (allergens, contraindications) on every submission before approval — flag what you know, leave
        the rest blank.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          onClick={() => onPick('exercise')}
          className="group rounded-xl border border-vscode-panelBorder bg-vscode-editor-background p-5 text-left transition hover:border-vscode-focusBorder cursor-pointer"
        >
          <div className="text-[10px] uppercase tracking-[0.2em] text-vscode-descriptionForeground mb-2">Exercise</div>
          <div className="text-[15px] font-light text-vscode-foreground mb-1">Movement / workout</div>
          <div className="text-[11px] text-vscode-descriptionForeground">
            Sets, reps, technique, contraindications.
          </div>
        </button>
        <button
          onClick={() => onPick('recipe')}
          className="group rounded-xl border border-vscode-panelBorder bg-vscode-editor-background p-5 text-left transition hover:border-vscode-focusBorder cursor-pointer"
        >
          <div className="text-[10px] uppercase tracking-[0.2em] text-vscode-descriptionForeground mb-2">Recipe</div>
          <div className="text-[15px] font-light text-vscode-foreground mb-1">Meal / dish</div>
          <div className="text-[11px] text-vscode-descriptionForeground">
            Ingredients, method, allergens.
          </div>
        </button>
      </div>
    </div>
  );
}

// ── Exercise form ─────────────────────────────────────────────────────

function ExerciseForm({
  taxonomies, inflight, onBack, onSubmit,
}: { taxonomies: HealthTaxonomies; inflight: boolean; onBack: () => void; onSubmit: (p: HealthExerciseSubmissionPayload) => void }) {
  const [name, setName] = useState('');
  const [exerciseType, setExerciseType] = useState<HealthExerciseType>('compound');
  const [workoutType, setWorkoutType] = useState<HealthWorkoutType>('strength');
  const [difficulty, setDifficulty] = useState(3);
  const [description, setDescription] = useState('');
  const [beginnerDetail, setBeginnerDetail] = useState('');
  const [commonMistakes, setCommonMistakes] = useState('');
  const [steps, setSteps] = useState<string[]>(['']);
  const [contraindicationSlugs, setContraindicationSlugs] = useState<Set<string>>(new Set());

  const trimmedSteps = steps.map(s => s.trim()).filter(Boolean);
  const isValid = name.trim().length >= 3 && trimmedSteps.length >= 1;

  const submit = () => {
    if (!isValid || inflight) return;
    onSubmit({
      name: name.trim(),
      exercise_type: exerciseType,
      workout_type: workoutType,
      difficulty,
      description: description.trim() || null,
      beginner_detail: beginnerDetail.trim() || null,
      common_mistakes: commonMistakes.trim() || null,
      steps: trimmedSteps,
      contraindication_slugs: Array.from(contraindicationSlugs),
    });
  };

  const toggleContra = (slug: string) => {
    const next = new Set(contraindicationSlugs);
    if (next.has(slug)) next.delete(slug); else next.add(slug);
    setContraindicationSlugs(next);
  };

  return (
    <div>
      <FormHeader title="New exercise" onBack={onBack} />

      <FormSection title="Identity">
        <Field label="Name">
          <input
            type="text" value={name} onChange={e => setName(e.target.value)} maxLength={100}
            placeholder="e.g. Bulgarian Split Squat"
            className={inputCls}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Exercise type">
            <Select value={exerciseType} onChange={(v) => setExerciseType(v as HealthExerciseType)} options={EXERCISE_TYPES.map(t => ({ value: t.slug, label: t.label }))} />
          </Field>
          <Field label="Workout type">
            <Select value={workoutType} onChange={(v) => setWorkoutType(v as HealthWorkoutType)} options={WORKOUT_TYPES.map(t => ({ value: t.slug, label: t.label }))} />
          </Field>
        </div>
        <Field label="Difficulty">
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} type="button" onClick={() => setDifficulty(n)}
                className="h-7 w-7 rounded-full border transition cursor-pointer"
                style={{
                  borderColor: n <= difficulty ? '#a855f7' : 'rgba(168,85,247,0.2)',
                  background: n <= difficulty ? 'rgba(168,85,247,0.25)' : 'transparent',
                  color: n <= difficulty ? '#c084fc' : '#6c7086',
                  fontSize: 12,
                }}
              >{n}</button>
            ))}
          </div>
        </Field>
      </FormSection>

      <FormSection title="Description">
        <Field label="Overview (optional)">
          <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={1200}
            rows={3} className={inputCls} placeholder="What is this movement? How should it feel done well?" />
        </Field>
        <Field label="If you're new to this (optional)">
          <textarea value={beginnerDetail} onChange={e => setBeginnerDetail(e.target.value)} maxLength={800}
            rows={2} className={inputCls} placeholder="Beginner cues, regressions, warm-up notes." />
        </Field>
        <Field label="Common mistakes (optional)">
          <textarea value={commonMistakes} onChange={e => setCommonMistakes(e.target.value)} maxLength={800}
            rows={2} className={inputCls} placeholder="What to watch out for." />
        </Field>
      </FormSection>

      <FormSection title="Steps (required)">
        <p className="text-[11px] text-vscode-descriptionForeground mb-3">
          Numbered execution. Keep each step short — one action per line.
        </p>
        {steps.map((step, i) => (
          <div key={i} className="flex gap-2 mb-2 items-start">
            <span className="mt-2 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[rgba(168,85,247,0.4)] text-[11px] text-[#c084fc]">{i + 1}</span>
            <input type="text" value={step} maxLength={400}
              onChange={e => { const next = [...steps]; next[i] = e.target.value; setSteps(next); }}
              placeholder="Action…" className={`${inputCls} flex-1`} />
            {steps.length > 1 && (
              <button type="button" onClick={() => setSteps(steps.filter((_, idx) => idx !== i))}
                className="mt-1 h-7 w-7 rounded text-vscode-descriptionForeground hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer"
                aria-label="Remove step">×</button>
            )}
          </div>
        ))}
        {steps.length < 20 && (
          <button type="button" onClick={() => setSteps([...steps, ''])}
            className="mt-1 text-[11px] text-[var(--accent)] hover:underline cursor-pointer">
            + Add step
          </button>
        )}
      </FormSection>

      <FormSection title="Safety · Contraindications (recommended)">
        <p className="text-[11px] text-vscode-descriptionForeground mb-3 leading-relaxed">
          Flag any condition or injury where this exercise should NOT be performed. The reviewer locks
          the final list before publishing — be liberal here; missed contraindications affect every user.
        </p>
        <ContraindicationGrid
          taxonomies={taxonomies}
          selected={contraindicationSlugs}
          onToggle={toggleContra}
        />
      </FormSection>

      <FormFooter
        disabled={!isValid || inflight}
        loading={inflight}
        primaryLabel="Submit for review"
        onSubmit={submit}
      />
    </div>
  );
}

function ContraindicationGrid({
  taxonomies, selected, onToggle,
}: { taxonomies: HealthTaxonomies; selected: Set<string>; onToggle: (slug: string) => void }) {
  const grouped: Record<string, typeof taxonomies.contraindications> = {};
  for (const c of taxonomies.contraindications) {
    const cat = c.category ?? 'other';
    (grouped[cat] ??= []).push(c);
  }
  return (
    <div className="space-y-3">
      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat}>
          <div className="text-[9px] uppercase tracking-[0.2em] text-vscode-descriptionForeground mb-1.5">{cat}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
            {items.map(c => (
              <label key={c.slug} className="flex items-center gap-2 text-[12px] cursor-pointer py-1 text-vscode-foreground">
                <input type="checkbox" checked={selected.has(c.slug)} onChange={() => onToggle(c.slug)}
                  className="accent-[#a855f7]" />
                <span>{c.name}</span>
                {c.severity_hint === 'hard_block' && (
                  <span className="ml-auto text-[8px] uppercase tracking-wider text-red-400">hard block</span>
                )}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Recipe form ───────────────────────────────────────────────────────

function RecipeForm({
  taxonomies, inflight, onBack, onSubmit,
}: { taxonomies: HealthTaxonomies; inflight: boolean; onBack: () => void; onSubmit: (p: HealthRecipeSubmissionPayload) => void }) {
  const [name, setName] = useState('');
  const [cuisineSlug, setCuisineSlug] = useState<string>('');
  const [course, setCourse] = useState<string>('');
  const [originCountry, setOriginCountry] = useState('');
  const [overview, setOverview] = useState('');
  const [ingredients, setIngredients] = useState<Array<{ name: string; quantity: string; unit: string; optional: boolean; notes: string }>>(
    [{ name: '', quantity: '', unit: '', optional: false, notes: '' }],
  );
  const [allergenSlugs, setAllergenSlugs] = useState<Set<string>>(new Set());

  const trimmedIngredients = ingredients
    .map(i => ({ ...i, name: i.name.trim() }))
    .filter(i => i.name.length > 0);
  const isValid = name.trim().length >= 3 && trimmedIngredients.length >= 1;

  const submit = () => {
    if (!isValid || inflight) return;
    onSubmit({
      name: name.trim(),
      cuisine_slug: cuisineSlug || null,
      course: course || null,
      origin_country: originCountry.trim() || null,
      overview: overview.trim() || null,
      ingredients: trimmedIngredients.map(i => ({
        name: i.name,
        quantity: i.quantity.trim() === '' ? null : Number(i.quantity),
        unit: i.unit.trim() || null,
        optional: i.optional,
        notes: i.notes.trim() || null,
      })),
      allergen_slugs: Array.from(allergenSlugs),
    });
  };

  const toggleAllergen = (slug: string) => {
    const next = new Set(allergenSlugs);
    if (next.has(slug)) next.delete(slug); else next.add(slug);
    setAllergenSlugs(next);
  };

  return (
    <div>
      <FormHeader title="New recipe" onBack={onBack} />

      <FormSection title="Identity">
        <Field label="Name">
          <input type="text" value={name} onChange={e => setName(e.target.value)} maxLength={120}
            placeholder="e.g. Lemon Herb Roast Chicken" className={inputCls} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Cuisine (optional)">
            <Select value={cuisineSlug} onChange={setCuisineSlug}
              options={[{ value: '', label: '—' }, ...taxonomies.cuisines.map(c => ({ value: c.slug, label: c.name }))]} />
          </Field>
          <Field label="Course (optional)">
            <Select value={course} onChange={setCourse}
              options={[{ value: '', label: '—' }, ...COURSES.map(c => ({ value: c, label: c[0].toUpperCase() + c.slice(1) }))]} />
          </Field>
          <Field label="Origin (optional)">
            <input type="text" value={originCountry} onChange={e => setOriginCountry(e.target.value)} maxLength={80}
              placeholder="e.g. Italy" className={inputCls} />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Overview (optional)">
        <textarea value={overview} onChange={e => setOverview(e.target.value)} maxLength={2000}
          rows={3} className={inputCls} placeholder="Story, technique notes, what makes this dish what it is." />
      </FormSection>

      <FormSection title="Ingredients (required)">
        {ingredients.map((ing, i) => (
          <div key={i} className="grid grid-cols-[60px_60px_1fr_24px_28px] gap-2 mb-2 items-start">
            <input type="number" step="any" value={ing.quantity}
              onChange={e => { const next = [...ingredients]; next[i] = { ...next[i], quantity: e.target.value }; setIngredients(next); }}
              placeholder="Qty" className={`${inputCls} text-center`} />
            <input type="text" value={ing.unit} maxLength={24}
              onChange={e => { const next = [...ingredients]; next[i] = { ...next[i], unit: e.target.value }; setIngredients(next); }}
              placeholder="Unit" className={`${inputCls} text-center`} />
            <input type="text" value={ing.name} maxLength={120}
              onChange={e => { const next = [...ingredients]; next[i] = { ...next[i], name: e.target.value }; setIngredients(next); }}
              placeholder="Name" className={inputCls} />
            <label className="flex items-center justify-center pt-2" title="Optional ingredient">
              <input type="checkbox" checked={ing.optional}
                onChange={e => { const next = [...ingredients]; next[i] = { ...next[i], optional: e.target.checked }; setIngredients(next); }}
                className="accent-[#a855f7]" />
            </label>
            {ingredients.length > 1 ? (
              <button type="button" onClick={() => setIngredients(ingredients.filter((_, idx) => idx !== i))}
                className="mt-1 h-7 w-7 rounded text-vscode-descriptionForeground hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer"
                aria-label="Remove">×</button>
            ) : <span />}
          </div>
        ))}
        <div className="text-[10px] text-vscode-descriptionForeground mb-2">Tick = optional ingredient</div>
        {ingredients.length < 80 && (
          <button type="button" onClick={() => setIngredients([...ingredients, { name: '', quantity: '', unit: '', optional: false, notes: '' }])}
            className="text-[11px] text-[var(--accent)] hover:underline cursor-pointer">
            + Add ingredient
          </button>
        )}
      </FormSection>

      <FormSection title="Safety · Allergens (strongly recommended)">
        <p className="text-[11px] text-vscode-descriptionForeground mb-3 leading-relaxed">
          Flag every allergen present, including hidden ones (dairy in butter, gluten in soy sauce,
          sulphites in wine vinegar). A missed allergen here lands in every Ava-generated meal plan
          that selects this recipe.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
          {taxonomies.allergens.map(a => (
            <label key={a.slug} className="flex items-center gap-2 text-[12px] cursor-pointer py-1 text-vscode-foreground">
              <input type="checkbox" checked={allergenSlugs.has(a.slug)} onChange={() => toggleAllergen(a.slug)}
                className="accent-[#a855f7]" />
              <span>{a.name}</span>
              {a.severity_hint === 'major' && (
                <span className="ml-auto text-[8px] uppercase tracking-wider text-red-400">major</span>
              )}
            </label>
          ))}
        </div>
      </FormSection>

      <FormFooter
        disabled={!isValid || inflight}
        loading={inflight}
        primaryLabel="Submit for review"
        onSubmit={submit}
      />
    </div>
  );
}

// ── Shared form bits ──────────────────────────────────────────────────

const inputCls = 'w-full rounded-md border border-vscode-panelBorder bg-vscode-input-background px-3 py-2 text-[13px] text-vscode-foreground placeholder:text-vscode-descriptionForeground outline-none focus:border-[var(--accent)] transition';

function FormHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center justify-between mb-5">
      <button onClick={onBack} className="text-[11px] text-vscode-descriptionForeground hover:text-vscode-foreground transition cursor-pointer">
        ← Back
      </button>
      <h2 className="text-[18px] font-light text-vscode-foreground">{title}</h2>
      <span className="w-12" />
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="text-[10px] uppercase tracking-[0.2em] text-vscode-descriptionForeground mb-2.5">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block text-[10px] uppercase tracking-wider text-vscode-descriptionForeground mb-1">{label}</label>
      {children}
    </div>
  );
}

function Select({
  value, onChange, options,
}: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      value={value} onChange={e => onChange(e.target.value)}
      className={`${inputCls} appearance-none pr-8`}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function FormFooter({
  disabled, loading, primaryLabel, onSubmit,
}: { disabled: boolean; loading: boolean; primaryLabel: string; onSubmit: () => void }) {
  return (
    <div className="flex justify-end pt-4 border-t border-vscode-panelBorder mt-2">
      <button
        type="button" onClick={onSubmit} disabled={disabled}
        className="rounded-md border border-[var(--accent)] bg-[var(--accent)]/15 px-4 py-2 text-[13px] text-[var(--accent)] hover:bg-[var(--accent)]/25 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? 'Submitting…' : primaryLabel}
      </button>
    </div>
  );
}
