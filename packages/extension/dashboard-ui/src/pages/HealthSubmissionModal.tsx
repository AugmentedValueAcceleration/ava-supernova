import { useEffect, useMemo, useState } from 'react';
import type {
  HealthTaxonomies, HealthExerciseSubmissionPayload, HealthRecipeSubmissionPayload,
  HealthExerciseType, HealthWorkoutType,
} from '../types/messages';

/**
 * Submission wizard for community contributions to the Health library.
 *
 * Canonical extension overlay style (mirrors CreativeStudio settings
 * overlay) — purple-glow gradient card, fade-in animation, Ava CSS
 * vars throughout (no vscode-* theme classes — those don't match the
 * rest of the dashboard).
 *
 * Wizard steps: Kind → Form → Submitted. When the Ava-assisted draft
 * flow ships (next commit), it slots in as Kind → Method → Intake →
 * Generating → Form → Submitted. The step indicator at the top of
 * every step shows progress.
 *
 * Safety stance: allergens (recipes) and contraindications (exercises)
 * are mandatory-to-think-about, not mandatory-to-tick. We surface the
 * full grid so the submitter has to scan it; the operator locks the
 * final taxonomy in the hub moderation drawer before approval.
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
type Step = 'kind' | 'form' | 'submitted';

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

  // Taxonomy load tracking — see retry UX below
  const [taxLoadStartedAt, setTaxLoadStartedAt] = useState<number | null>(null);
  const [taxFailedTick, setTaxFailedTick] = useState(0);
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

  // Reset on close
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

  // Derive current wizard step for the progress indicator
  const step: Step =
    result ? 'submitted' :
    kind === null ? 'kind' :
    'form';

  return (
    <div
      role="dialog" aria-modal="true"
      onClick={() => { if (!inflight) onClose(); }}
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm p-3 sm:p-6"
      style={{ animation: 'avaSubModalIn 120ms ease-out' }}
    >
      <style>{`
        @keyframes avaSubModalIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes avaSubModalCardIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>
      <div
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl border border-[rgba(168,85,247,0.20)] bg-gradient-to-br from-[#0f0f17] to-[#1a1625] shadow-[0_0_60px_rgba(168,85,247,0.12)]"
        style={{ animation: 'avaSubModalCardIn 160ms ease-out' }}
      >
        {/* Close */}
        <button
          onClick={onClose} disabled={inflight}
          aria-label="Close"
          className="absolute top-3.5 right-3.5 z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-none bg-[rgba(0,0,0,0.4)] text-[var(--text-muted)] hover:bg-[rgba(0,0,0,0.6)] hover:text-[var(--text-primary)] transition disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ×
        </button>

        {/* Step indicator */}
        <StepIndicator step={step} />

        <div className="px-6 pb-6 pt-2 sm:px-8 sm:pb-8">
          {step === 'submitted' && result && (
            <ResultScreen
              result={result}
              onContinue={() => { onClearResult(); setKind(null); }}
              onClose={onClose}
            />
          )}

          {step === 'kind' && (
            <KindPicker onPick={setKind} />
          )}

          {step === 'form' && taxonomies && !taxonomiesFailed && kind === 'exercise' && (
            <ExerciseForm
              taxonomies={taxonomies}
              inflight={inflight}
              onBack={() => setKind(null)}
              onSubmit={onSubmitExercise}
            />
          )}
          {step === 'form' && taxonomies && !taxonomiesFailed && kind === 'recipe' && (
            <RecipeForm
              taxonomies={taxonomies}
              inflight={inflight}
              onBack={() => setKind(null)}
              onSubmit={onSubmitRecipe}
            />
          )}

          {step === 'form' && !taxonomies && !taxonomiesTimedOut && (
            <LoadingTaxonomies />
          )}

          {step === 'form' && (taxonomiesFailed || taxonomiesTimedOut) && (
            <TaxonomiesFailed
              onRetry={() => { setTaxLoadStartedAt(Date.now()); onRetryTaxonomies(); }}
              onBack={() => setKind(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step indicator ────────────────────────────────────────────────────

function StepIndicator({ step }: { step: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: 'kind', label: 'Type' },
    { id: 'form', label: 'Details' },
    { id: 'submitted', label: 'Submitted' },
  ];
  const currentIdx = steps.findIndex(s => s.id === step);
  return (
    <div className="flex items-center gap-2 px-6 pt-5 pb-4 sm:px-8">
      {steps.map((s, i) => {
        const isActive = i === currentIdx;
        const isDone = i < currentIdx;
        const color = isActive ? '#c084fc' : isDone ? '#a855f7' : '#6c7086';
        return (
          <div key={s.id} className="flex items-center flex-1 gap-2 min-w-0">
            <div
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium"
              style={{
                background: isActive ? 'rgba(168,85,247,0.20)' : isDone ? 'rgba(168,85,247,0.10)' : 'transparent',
                border: `1px solid ${isDone || isActive ? 'rgba(168,85,247,0.40)' : 'rgba(168,85,247,0.15)'}`,
                color,
              }}
            >
              {isDone ? '✓' : i + 1}
            </div>
            <span
              className="text-[10px] uppercase tracking-[0.15em] truncate"
              style={{ color }}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <div className="flex-1 h-px" style={{ background: isDone ? 'rgba(168,85,247,0.35)' : 'rgba(168,85,247,0.10)' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Generic loading + failure ─────────────────────────────────────────

function LoadingTaxonomies() {
  return (
    <div className="py-12 text-center">
      <div className="inline-flex items-center gap-2 text-[var(--text-muted)] text-[12px]">
        <span className="ava-health-spin" aria-hidden />
        Loading safety taxonomy…
      </div>
      <style>{`
        .ava-health-spin {
          width: 12px; height: 12px; border-radius: 50%;
          border: 1.5px solid rgba(168, 85, 247, 0.25);
          border-top-color: #a855f7;
          animation: avaHealthSpinKeys 0.85s linear infinite;
          display: inline-block;
        }
        @keyframes avaHealthSpinKeys { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function TaxonomiesFailed({ onRetry, onBack }: { onRetry: () => void; onBack: () => void }) {
  return (
    <div className="py-12 text-center">
      <div className="text-3xl mb-3 text-amber-400">⚠</div>
      <h2 className="text-[16px] font-light text-[var(--text-primary)] mb-2">Couldn't load the safety taxonomy</h2>
      <p className="text-[12px] text-[var(--text-muted)] mb-6 max-w-md mx-auto leading-relaxed">
        We need the allergen + contraindication lists to render the form — the form is unsafe to fill in
        without them. Check your connection or wait a moment if the platform's deploying.
      </p>
      <div className="flex gap-2 justify-center">
        <button onClick={onBack} className={btnGhostCls}>Back</button>
        <button onClick={onRetry} className={btnPrimaryCls}>Retry</button>
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
      <div className="text-center py-10">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(166,227,161,0.10)] border border-[rgba(166,227,161,0.30)]">
          <span className="text-green-300 text-xl">✓</span>
        </div>
        <h2 className="text-[18px] font-light text-[var(--text-primary)] mb-2">Submitted for review</h2>
        <p className="text-[13px] text-[var(--text-muted)] mb-6 max-w-md mx-auto leading-relaxed">
          {result.submissionName && <strong className="text-[var(--text-primary)]">{result.submissionName}</strong>}
          {result.submissionName && ' is '}
          in the moderation queue. You'll see it under <em>My submissions</em>{' '}
          while it's reviewed. Held-until-reviewed because health content can affect bodies —
          thank you for the contribution.
        </p>
        <div className="flex gap-2 justify-center">
          <button onClick={onContinue} className={btnGhostCls}>Submit another</button>
          <button onClick={onClose} className={btnPrimaryCls}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center py-10">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(243,139,168,0.10)] border border-[rgba(243,139,168,0.30)]">
        <span className="text-red-300 text-xl">!</span>
      </div>
      <h2 className="text-[18px] font-light text-[var(--text-primary)] mb-2">Submission failed</h2>
      <p className="text-[13px] text-red-300/90 mb-6 max-w-md mx-auto leading-relaxed font-mono">
        {result.error ?? 'Unknown error'}
      </p>
      <button onClick={onContinue} className={btnGhostCls}>Try again</button>
    </div>
  );
}

// ── Step 1: kind picker ───────────────────────────────────────────────

function KindPicker({ onPick }: { onPick: (k: Kind) => void }) {
  return (
    <div>
      <h2 className="text-[20px] font-light text-[var(--text-primary)] mb-2">Contribute to the library</h2>
      <p className="text-[12px] text-[var(--text-muted)] mb-6 leading-relaxed max-w-lg">
        Submissions are held for review before they go live. The operator locks the safety taxonomy
        (allergens, contraindications) on every submission before approval — flag what you know, leave
        the rest blank.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <KindCard label="Exercise" detail="Sets, reps, technique, contraindications." onClick={() => onPick('exercise')} />
        <KindCard label="Recipe"   detail="Ingredients, method, allergens." onClick={() => onPick('recipe')} />
      </div>
    </div>
  );
}

function KindCard({ label, detail, onClick }: { label: string; detail: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group rounded-xl border border-[rgba(168,85,247,0.18)] bg-[rgba(168,85,247,0.04)] p-5 text-left transition cursor-pointer hover:border-[rgba(168,85,247,0.45)] hover:bg-[rgba(168,85,247,0.08)]"
    >
      <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--accent)] mb-2">{label}</div>
      <div className="text-[12px] text-[var(--text-muted)] leading-relaxed">{detail}</div>
    </button>
  );
}

// ── Step 2a: exercise form ────────────────────────────────────────────

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

  const groupedContras = useMemo(() => {
    const g: Record<string, typeof taxonomies.contraindications> = {};
    for (const c of taxonomies.contraindications) {
      const cat = c.category ?? 'other';
      (g[cat] ??= []).push(c);
    }
    return g;
  }, [taxonomies.contraindications]);

  return (
    <div>
      <FormHeader title="New exercise" onBack={onBack} />

      <Section title="Identity">
        <Field label="Name">
          <input type="text" value={name} onChange={e => setName(e.target.value)} maxLength={100}
            placeholder="e.g. Bulgarian Split Squat" className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Exercise type">
            <Select value={exerciseType} onChange={v => setExerciseType(v as HealthExerciseType)}
              options={EXERCISE_TYPES.map(t => ({ value: t.slug, label: t.label }))} />
          </Field>
          <Field label="Workout type">
            <Select value={workoutType} onChange={v => setWorkoutType(v as HealthWorkoutType)}
              options={WORKOUT_TYPES.map(t => ({ value: t.slug, label: t.label }))} />
          </Field>
        </div>
        <Field label="Difficulty">
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} type="button" onClick={() => setDifficulty(n)}
                className="h-7 w-7 rounded-full transition cursor-pointer text-[12px]"
                style={{
                  borderStyle: 'solid', borderWidth: 1,
                  borderColor: n <= difficulty ? 'rgba(168,85,247,0.55)' : 'rgba(168,85,247,0.18)',
                  background: n <= difficulty ? 'rgba(168,85,247,0.22)' : 'transparent',
                  color: n <= difficulty ? '#c084fc' : '#6c7086',
                }}
              >{n}</button>
            ))}
          </div>
        </Field>
      </Section>

      <Section title="Description">
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
      </Section>

      <Section title="Steps (required)">
        <p className="text-[11px] text-[var(--text-muted)] mb-3">
          Numbered execution. Keep each step short — one action per line.
        </p>
        {steps.map((step, i) => (
          <div key={i} className="flex gap-2 mb-2 items-start">
            <span className="mt-2 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[rgba(168,85,247,0.40)] text-[11px] text-[var(--accent)]">{i + 1}</span>
            <input type="text" value={step} maxLength={400}
              onChange={e => { const next = [...steps]; next[i] = e.target.value; setSteps(next); }}
              placeholder="Action…" className={`${inputCls} flex-1`} />
            {steps.length > 1 && (
              <button type="button" onClick={() => setSteps(steps.filter((_, idx) => idx !== i))}
                className="mt-1 h-7 w-7 rounded text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer border-none bg-transparent"
                aria-label="Remove step">×</button>
            )}
          </div>
        ))}
        {steps.length < 20 && (
          <button type="button" onClick={() => setSteps([...steps, ''])}
            className="mt-1 text-[11px] text-[var(--accent)] hover:underline cursor-pointer bg-transparent border-none p-0">
            + Add step
          </button>
        )}
      </Section>

      <Section title="Safety · Contraindications (recommended)">
        <p className="text-[11px] text-[var(--text-muted)] mb-3 leading-relaxed">
          Flag any condition or injury where this exercise should NOT be performed. The reviewer locks
          the final list before publishing — be liberal here; missed contraindications affect every user.
        </p>
        <div className="space-y-3">
          {Object.entries(groupedContras).map(([cat, items]) => (
            <div key={cat}>
              <div className="text-[9px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1.5">{cat}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                {items.map(c => (
                  <CheckRow key={c.slug} checked={contraindicationSlugs.has(c.slug)} onToggle={() => toggleContra(c.slug)} label={c.name}
                    badge={c.severity_hint === 'hard_block' ? 'hard block' : undefined} badgeColor="red" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <FormFooter disabled={!isValid || inflight} loading={inflight} primaryLabel="Submit for review" onSubmit={submit} />
    </div>
  );
}

// ── Step 2b: recipe form ──────────────────────────────────────────────

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

      <Section title="Identity">
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
      </Section>

      <Section title="Overview (optional)">
        <textarea value={overview} onChange={e => setOverview(e.target.value)} maxLength={2000}
          rows={3} className={inputCls} placeholder="Story, technique notes, what makes this dish what it is." />
      </Section>

      <Section title="Ingredients (required)">
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
                className="accent-[var(--accent)]" />
            </label>
            {ingredients.length > 1 ? (
              <button type="button" onClick={() => setIngredients(ingredients.filter((_, idx) => idx !== i))}
                className="mt-1 h-7 w-7 rounded text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer border-none bg-transparent"
                aria-label="Remove">×</button>
            ) : <span />}
          </div>
        ))}
        <div className="text-[10px] text-[var(--text-muted)] mb-2">Tick = optional ingredient</div>
        {ingredients.length < 80 && (
          <button type="button" onClick={() => setIngredients([...ingredients, { name: '', quantity: '', unit: '', optional: false, notes: '' }])}
            className="text-[11px] text-[var(--accent)] hover:underline cursor-pointer bg-transparent border-none p-0">
            + Add ingredient
          </button>
        )}
      </Section>

      <Section title="Safety · Allergens (strongly recommended)">
        <p className="text-[11px] text-[var(--text-muted)] mb-3 leading-relaxed">
          Flag every allergen present, including hidden ones (dairy in butter, gluten in soy sauce,
          sulphites in wine vinegar). A missed allergen here lands in every Ava-generated meal plan
          that selects this recipe.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
          {taxonomies.allergens.map(a => (
            <CheckRow key={a.slug} checked={allergenSlugs.has(a.slug)} onToggle={() => toggleAllergen(a.slug)} label={a.name}
              badge={a.severity_hint === 'major' ? 'major' : undefined} badgeColor="red" />
          ))}
        </div>
      </Section>

      <FormFooter disabled={!isValid || inflight} loading={inflight} primaryLabel="Submit for review" onSubmit={submit} />
    </div>
  );
}

// ── Shared form bits ──────────────────────────────────────────────────

const inputCls = 'w-full rounded-md border border-[rgba(168,85,247,0.18)] bg-[rgba(168,85,247,0.05)] px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] transition';

const btnPrimaryCls = 'rounded-md border border-[var(--accent)]/50 bg-[var(--accent)]/15 px-4 py-2 text-[12px] text-[var(--accent)] hover:bg-[var(--accent)]/25 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';

const btnGhostCls = 'rounded-md border border-[rgba(168,85,247,0.18)] bg-transparent px-4 py-2 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[rgba(168,85,247,0.35)] transition cursor-pointer';

function FormHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center justify-between mb-5">
      <button onClick={onBack}
        className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition cursor-pointer bg-transparent border-none p-0">
        ← Back
      </button>
      <h2 className="text-[18px] font-light text-[var(--text-primary)]">{title}</h2>
      <span className="w-12" />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-2.5">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">{label}</label>
      {children}
    </div>
  );
}

function Select({
  value, onChange, options,
}: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={`${inputCls} appearance-none pr-8`}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function CheckRow({
  checked, onToggle, label, badge, badgeColor,
}: { checked: boolean; onToggle: () => void; label: string; badge?: string; badgeColor?: 'red' | 'amber' }) {
  const badgeFg = badgeColor === 'red' ? '#f38ba8' : '#fab387';
  return (
    <label className="flex items-center gap-2 text-[12px] cursor-pointer py-1 text-[var(--text-primary)]">
      <input type="checkbox" checked={checked} onChange={onToggle} className="accent-[var(--accent)]" />
      <span>{label}</span>
      {badge && (
        <span className="ml-auto text-[8px] uppercase tracking-wider" style={{ color: badgeFg }}>{badge}</span>
      )}
    </label>
  );
}

function FormFooter({
  disabled, loading, primaryLabel, onSubmit,
}: { disabled: boolean; loading: boolean; primaryLabel: string; onSubmit: () => void }) {
  return (
    <div className="flex justify-end pt-4 border-t border-[rgba(168,85,247,0.10)] mt-2">
      <button type="button" onClick={onSubmit} disabled={disabled} className={btnPrimaryCls}>
        {loading ? 'Submitting…' : primaryLabel}
      </button>
    </div>
  );
}
