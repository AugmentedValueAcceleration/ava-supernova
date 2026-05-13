import { useEffect, useMemo, useState } from 'react';
import { Select } from '../components/Select';
import type {
  HealthTaxonomies, HealthExerciseSubmissionPayload, HealthRecipeSubmissionPayload,
  HealthExerciseType, HealthWorkoutType,
  HealthExerciseDraft, HealthRecipeDraft,
  HealthGenerateExerciseIntake, HealthGenerateRecipeIntake,
  HealthRecipeVersionPayload,
} from '../types/messages';

/**
 * Submission wizard for community contributions to the Health library.
 *
 * Two paths off the kind picker:
 *   - Manual:   Kind → Method → Form → Submitted
 *   - Ava-draft: Kind → Method → Intake → Generating → Form (pre-filled) → Submitted
 *
 * Manual stays untouched; Ava-draft asks 3–5 clarifying questions,
 * posts to /api/health/generate/{exercise,recipe} (2 credits), drops
 * the structured draft straight into the form for review + edit.
 * Submission to /api/health/submissions/{kind} is the same as manual.
 *
 * Canonical extension overlay style — purple-glow gradient card, fade-in
 * animation, Ava CSS vars throughout (no vscode-* theme classes).
 *
 * Safety stance: allergens (recipes) and contraindications (exercises)
 * are mandatory-to-think-about. Ava-generated drafts pre-tick what she
 * detected; the submitter reviews and adds anything missed before
 * submitting. The operator locks the final list in the hub.
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
type Method = 'manual' | 'ava';
type Step = 'kind' | 'method' | 'intake' | 'generating' | 'form' | 'submitted';

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
  // Ava-draft props
  exerciseDraft: HealthExerciseDraft | null;
  recipeDraft: HealthRecipeDraft | null;
  draftInflight: boolean;
  draftError: string | null;
  onGenerateExerciseDraft: (intake: HealthGenerateExerciseIntake) => void;
  onGenerateRecipeDraft: (intake: HealthGenerateRecipeIntake) => void;
  onClearDraft: () => void;
}

export function HealthSubmissionModal({
  open, onClose, taxonomies, inflight, result,
  onSubmitExercise, onSubmitRecipe, onClearResult, onRetryTaxonomies,
  exerciseDraft, recipeDraft, draftInflight, draftError,
  onGenerateExerciseDraft, onGenerateRecipeDraft, onClearDraft,
}: Props) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [method, setMethod] = useState<Method | null>(null);

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
      setMethod(null);
      setTaxLoadStartedAt(null);
      setTaxFailedTick(0);
      onClearDraft();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ESC closes (when not in flight)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !inflight && !draftInflight) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, inflight, draftInflight, onClose]);

  // Auto-advance from generating step when a draft arrives
  useEffect(() => {
    if (!open) return;
    if (kind === 'exercise' && exerciseDraft) {/* form will render */}
    if (kind === 'recipe' && recipeDraft) {/* form will render */}
  }, [open, kind, exerciseDraft, recipeDraft]);

  if (!open) return null;

  // Derive current wizard step
  const draftReady =
    (kind === 'exercise' && exerciseDraft) ||
    (kind === 'recipe' && recipeDraft);
  const step: Step =
    result ? 'submitted' :
    kind === null ? 'kind' :
    method === null ? 'method' :
    method === 'ava' && !draftReady && draftInflight ? 'generating' :
    method === 'ava' && !draftReady ? 'intake' :
    'form';

  return (
    <div
      role="dialog" aria-modal="true"
      onClick={() => { if (!inflight && !draftInflight) onClose(); }}
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
          onClick={onClose} disabled={inflight || draftInflight}
          aria-label="Close"
          className="absolute top-3.5 right-3.5 z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-none bg-[rgba(0,0,0,0.4)] text-[var(--text-muted)] hover:bg-[rgba(0,0,0,0.6)] hover:text-[var(--text-primary)] transition disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ×
        </button>

        {/* Step indicator — adapts shape to method */}
        <StepIndicator step={step} method={method} />

        <div className="px-6 pb-6 pt-2 sm:px-8 sm:pb-8">
          {step === 'submitted' && result && (
            <ResultScreen
              result={result}
              onContinue={() => { onClearResult(); onClearDraft(); setKind(null); setMethod(null); }}
              onClose={onClose}
            />
          )}

          {step === 'kind' && (
            <KindPicker onPick={setKind} />
          )}

          {step === 'method' && kind && (
            <MethodPicker kind={kind} onPick={setMethod} onBack={() => setKind(null)} />
          )}

          {step === 'intake' && kind === 'exercise' && (
            <ExerciseIntake
              error={draftError}
              onBack={() => setMethod(null)}
              onGenerate={onGenerateExerciseDraft}
            />
          )}
          {step === 'intake' && kind === 'recipe' && (
            <RecipeIntake
              error={draftError}
              onBack={() => setMethod(null)}
              onGenerate={onGenerateRecipeDraft}
            />
          )}

          {step === 'generating' && (
            <GeneratingScreen kind={kind!} />
          )}

          {step === 'form' && taxonomies && !taxonomiesFailed && kind === 'exercise' && (
            <ExerciseForm
              taxonomies={taxonomies}
              inflight={inflight}
              initial={exerciseDraft}
              fromAva={method === 'ava' && !!exerciseDraft}
              onBack={() => method === 'ava' ? (onClearDraft(), setMethod(null)) : setKind(null)}
              onSubmit={onSubmitExercise}
            />
          )}
          {step === 'form' && taxonomies && !taxonomiesFailed && kind === 'recipe' && (
            <RecipeForm
              taxonomies={taxonomies}
              inflight={inflight}
              initial={recipeDraft}
              fromAva={method === 'ava' && !!recipeDraft}
              onBack={() => method === 'ava' ? (onClearDraft(), setMethod(null)) : setKind(null)}
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

function StepIndicator({ step, method }: { step: Step; method: Method | null }) {
  // Manual path: Type → Method → Details → Submitted (4)
  // Ava path:    Type → Method → Intake → Generating → Details → Submitted (6)
  const steps: { id: Step; label: string }[] =
    method === 'ava'
      ? [
          { id: 'kind', label: 'Type' },
          { id: 'method', label: 'Method' },
          { id: 'intake', label: 'Intake' },
          { id: 'generating', label: 'Drafting' },
          { id: 'form', label: 'Review' },
          { id: 'submitted', label: 'Submitted' },
        ]
      : [
          { id: 'kind', label: 'Type' },
          { id: 'method', label: 'Method' },
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
      <SpinnerStyles />
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

function SpinnerStyles() {
  return (
    <style>{`
      .ava-health-spin {
        width: 12px; height: 12px; border-radius: 50%;
        border: 1.5px solid rgba(168, 85, 247, 0.25);
        border-top-color: #a855f7;
        animation: avaHealthSpinKeys 0.85s linear infinite;
        display: inline-block;
      }
      .ava-health-spin-lg {
        width: 36px; height: 36px; border-radius: 50%;
        border: 2.5px solid rgba(168, 85, 247, 0.20);
        border-top-color: #a855f7;
        animation: avaHealthSpinKeys 1.1s linear infinite;
        display: inline-block;
      }
      @keyframes avaHealthSpinKeys { to { transform: rotate(360deg); } }
    `}</style>
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

// ── Step 2: method picker ─────────────────────────────────────────────

function MethodPicker({ kind, onPick, onBack }: { kind: Kind; onPick: (m: Method) => void; onBack: () => void }) {
  const subject = kind === 'exercise' ? 'exercise' : 'recipe';
  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <button onClick={onBack}
          className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition cursor-pointer bg-transparent border-none p-0">
          ← Back
        </button>
        <h2 className="text-[18px] font-light text-[var(--text-primary)]">How do you want to draft this {subject}?</h2>
        <span className="w-12" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
        <button
          onClick={() => onPick('manual')}
          className="group rounded-xl border border-[rgba(168,85,247,0.18)] bg-[rgba(168,85,247,0.04)] p-5 text-left transition cursor-pointer hover:border-[rgba(168,85,247,0.45)] hover:bg-[rgba(168,85,247,0.08)]"
        >
          <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--accent)] mb-2">Fill manually</div>
          <div className="text-[15px] font-light text-[var(--text-primary)] mb-1">You write it</div>
          <div className="text-[11px] text-[var(--text-muted)] leading-relaxed">
            Type the details yourself. Free. Best when you know exactly what you want to share.
          </div>
        </button>
        <button
          onClick={() => onPick('ava')}
          className="group rounded-xl border border-[rgba(168,85,247,0.18)] bg-[rgba(168,85,247,0.04)] p-5 text-left transition cursor-pointer hover:border-[rgba(168,85,247,0.45)] hover:bg-[rgba(168,85,247,0.08)]"
        >
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--accent)]">Ask Ava to draft</div>
            <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">2 credits</span>
          </div>
          <div className="text-[15px] font-light text-[var(--text-primary)] mb-1">Ava drafts, you review</div>
          <div className="text-[11px] text-[var(--text-muted)] leading-relaxed">
            Answer 3 short questions. Ava drafts the {subject}. You review, edit, submit.
          </div>
        </button>
      </div>
      <p className="text-[10px] text-[var(--text-muted)] mt-3 leading-relaxed">
        Either path lands the submission in the same review queue. Ava's draft is a starting point —
        the operator still locks the safety taxonomy before approval.
      </p>
    </div>
  );
}

// ── Step 3a: exercise intake ──────────────────────────────────────────

function ExerciseIntake({
  error, onBack, onGenerate,
}: { error: string | null; onBack: () => void; onGenerate: (i: HealthGenerateExerciseIntake) => void }) {
  const [prompt, setPrompt] = useState('');
  const [goal, setGoal] = useState('');
  const [equipment, setEquipment] = useState('');
  const [level, setLevel] = useState('');

  const valid = prompt.trim().length >= 5;

  const submit = () => {
    if (!valid) return;
    onGenerate({
      prompt: prompt.trim(),
      goal: goal.trim() || undefined,
      equipment: equipment.trim() || undefined,
      level: level.trim() || undefined,
    });
  };

  return (
    <div>
      <FormHeader title="Tell Ava about the exercise" onBack={onBack} />

      <Section title="What is it?">
        <Field label="Describe the movement (required)">
          <textarea
            value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={1200}
            rows={3} className={inputCls}
            placeholder="e.g. A goblet squat variation where the bottom position is held for 3 seconds before standing — for hypertrophy."
          />
        </Field>
      </Section>

      <Section title="Optional hints">
        <Field label="Primary goal">
          <Select value={goal} onChange={setGoal} options={[
            { value: '', label: '—' },
            { value: 'strength', label: 'Strength' },
            { value: 'hypertrophy', label: 'Hypertrophy' },
            { value: 'conditioning', label: 'Conditioning' },
            { value: 'mobility', label: 'Mobility' },
            { value: 'general', label: 'General fitness' },
          ]} />
        </Field>
        <Field label="Equipment available">
          <input
            type="text" value={equipment} onChange={e => setEquipment(e.target.value)} maxLength={200}
            placeholder="e.g. dumbbells + bench, bodyweight only, full gym"
            className={inputCls}
          />
        </Field>
        <Field label="Submitter level">
          <Select value={level} onChange={setLevel} options={[
            { value: '', label: '—' },
            { value: 'beginner', label: 'Beginner' },
            { value: 'intermediate', label: 'Intermediate' },
            { value: 'advanced', label: 'Advanced' },
          ]} />
        </Field>
      </Section>

      {error && <InlineError message={error} />}

      <div className="flex items-center justify-between pt-4 border-t border-[rgba(168,85,247,0.10)] mt-2 gap-3">
        <button
          onClick={() => onGenerate({ prompt: '', surprise: true })}
          className={btnGhostCls}
          title="Skip the form — Ava picks a fresh exercise the catalog doesn't already have"
        >
          ✨ Surprise me
        </button>
        <button onClick={submit} disabled={!valid} className={btnPrimaryCls}>
          Draft with Ava · 2 credits →
        </button>
      </div>
    </div>
  );
}

// ── Step 3b: recipe intake ────────────────────────────────────────────

function RecipeIntake({
  error, onBack, onGenerate,
}: { error: string | null; onBack: () => void; onGenerate: (i: HealthGenerateRecipeIntake) => void }) {
  const [prompt, setPrompt] = useState('');
  const [cuisineHint, setCuisineHint] = useState('');
  const [courseHint, setCourseHint] = useState('');
  const [dietary, setDietary] = useState('');

  const valid = prompt.trim().length >= 5;

  const submit = () => {
    if (!valid) return;
    onGenerate({
      prompt: prompt.trim(),
      cuisine_hint: cuisineHint.trim() || undefined,
      course_hint: courseHint.trim() || undefined,
      dietary: dietary.trim() || undefined,
    });
  };

  return (
    <div>
      <FormHeader title="Tell Ava about the dish" onBack={onBack} />

      <Section title="What's the recipe?">
        <Field label="Describe the dish (required)">
          <textarea
            value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={1200}
            rows={3} className={inputCls}
            placeholder="e.g. A simple Mediterranean roast chicken with lemon and herbs — 4 servings, dinner main."
          />
        </Field>
      </Section>

      <Section title="Optional hints">
        <Field label="Cuisine direction">
          <input
            type="text" value={cuisineHint} onChange={e => setCuisineHint(e.target.value)} maxLength={60}
            placeholder="e.g. Italian, Japanese, Mediterranean"
            className={inputCls}
          />
        </Field>
        <Field label="Course">
          <Select value={courseHint} onChange={setCourseHint} options={[
            { value: '', label: '—' },
            ...COURSES.map(c => ({ value: c, label: c[0].toUpperCase() + c.slice(1) })),
          ]} />
        </Field>
        <Field label="Dietary notes">
          <input
            type="text" value={dietary} onChange={e => setDietary(e.target.value)} maxLength={100}
            placeholder="e.g. vegan, gluten-free, low-FODMAP"
            className={inputCls}
          />
        </Field>
      </Section>
      <p className="text-[10px] text-[var(--text-muted)] -mt-3 mb-4 leading-relaxed">
        Ava drafts all three skill levels — beginner, intermediate, and expert — automatically.
      </p>

      {error && <InlineError message={error} />}

      <div className="flex items-center justify-between pt-4 border-t border-[rgba(168,85,247,0.10)] mt-2 gap-3">
        <button
          onClick={() => onGenerate({ prompt: '', surprise: true })}
          className={btnGhostCls}
          title="Skip the form — Ava picks a fresh recipe the catalog doesn't already have"
        >
          ✨ Surprise me
        </button>
        <button onClick={submit} disabled={!valid} className={btnPrimaryCls}>
          Draft with Ava · 2 credits →
        </button>
      </div>
    </div>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <div className="my-4 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-[12px] text-red-300/90 leading-relaxed">
      {message}
    </div>
  );
}

// ── Step 4: generating spinner ────────────────────────────────────────

function GeneratingScreen({ kind }: { kind: Kind }) {
  return (
    <div className="py-14 text-center">
      <span className="ava-health-spin-lg mb-5 inline-block" aria-hidden />
      <h2 className="text-[18px] font-light text-[var(--text-primary)] mb-2 mt-4">Ava is drafting your {kind}…</h2>
      <p className="text-[12px] text-[var(--text-muted)] max-w-md mx-auto leading-relaxed">
        Pulling from her training, biasing toward conservative {kind === 'recipe' ? 'allergen' : 'contraindication'} flags.
        Usually 20–40 seconds.
      </p>
      <SpinnerStyles />
    </div>
  );
}

// ── Step 5a: exercise form ────────────────────────────────────────────

function ExerciseForm({
  taxonomies, inflight, initial, fromAva, onBack, onSubmit,
}: {
  taxonomies: HealthTaxonomies;
  inflight: boolean;
  initial: HealthExerciseDraft | null;
  fromAva: boolean;
  onBack: () => void;
  onSubmit: (p: HealthExerciseSubmissionPayload) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [exerciseType, setExerciseType] = useState<HealthExerciseType>(initial?.exercise_type ?? 'compound');
  const [workoutType, setWorkoutType] = useState<HealthWorkoutType>(initial?.workout_type ?? 'strength');
  const [difficulty, setDifficulty] = useState(initial?.difficulty ?? 3);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [beginnerDetail, setBeginnerDetail] = useState(initial?.beginner_detail ?? '');
  const [commonMistakes, setCommonMistakes] = useState(initial?.common_mistakes ?? '');
  const [steps, setSteps] = useState<string[]>(initial?.steps && initial.steps.length > 0 ? initial.steps : ['']);
  const [contraindicationSlugs, setContraindicationSlugs] = useState<Set<string>>(
    new Set(initial?.contraindication_slugs ?? []),
  );

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
      <FormHeader title={fromAva ? 'Review Ava’s draft' : 'New exercise'} onBack={onBack} />

      {fromAva && (
        <div className="mb-5 rounded-md border border-[rgba(168,85,247,0.25)] bg-[rgba(168,85,247,0.07)] px-3 py-2 text-[11px] text-[var(--text-secondary)] leading-relaxed">
          Ava drafted this from your description. Review and edit before submitting — she flagged contraindications generously, you may want to add or remove some.
        </div>
      )}

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

// ── Step 5b: recipe form ──────────────────────────────────────────────

function RecipeForm({
  taxonomies, inflight, initial, fromAva, onBack, onSubmit,
}: {
  taxonomies: HealthTaxonomies;
  inflight: boolean;
  initial: HealthRecipeDraft | null;
  fromAva: boolean;
  onBack: () => void;
  onSubmit: (p: HealthRecipeSubmissionPayload) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [cuisineSlug, setCuisineSlug] = useState<string>(initial?.cuisine_slug ?? '');
  const [course, setCourse] = useState<string>(initial?.course ?? '');
  const [originCountry, setOriginCountry] = useState(initial?.origin_country ?? '');
  const [overview, setOverview] = useState(initial?.overview ?? '');
  const [ingredients, setIngredients] = useState<Array<{ name: string; quantity: string; unit: string; optional: boolean; notes: string }>>(
    initial?.ingredients && initial.ingredients.length > 0
      ? initial.ingredients.map(i => ({
          name: i.name,
          quantity: i.quantity == null ? '' : String(i.quantity),
          unit: i.unit ?? '',
          optional: i.optional,
          notes: i.notes ?? '',
        }))
      : [{ name: '', quantity: '', unit: '', optional: false, notes: '' }],
  );
  const [allergenSlugs, setAllergenSlugs] = useState<Set<string>>(new Set(initial?.allergen_slugs ?? []));

  const trimmedIngredients = ingredients
    .map(i => ({ ...i, name: i.name.trim() }))
    .filter(i => i.name.length > 0);
  const isValid = name.trim().length >= 3 && trimmedIngredients.length >= 1;

  // Ava-drafted versions pass straight through to the submission. We
  // surface them read-only in the form (full editor would be huge);
  // the operator can fine-tune in the hub after approval. Manual mode
  // submits with versions=[] and the operator can compose versions
  // post-approval the same way they do for any pre-versions submission.
  const draftVersions = initial?.versions ?? [];

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
      versions: draftVersions,
    });
  };

  const toggleAllergen = (slug: string) => {
    const next = new Set(allergenSlugs);
    if (next.has(slug)) next.delete(slug); else next.add(slug);
    setAllergenSlugs(next);
  };

  return (
    <div>
      <FormHeader title={fromAva ? 'Review Ava’s draft' : 'New recipe'} onBack={onBack} />

      {fromAva && (
        <div className="mb-5 rounded-md border border-[rgba(168,85,247,0.25)] bg-[rgba(168,85,247,0.07)] px-3 py-2 text-[11px] text-[var(--text-secondary)] leading-relaxed">
          Ava drafted this from your description. Review and edit before submitting — she flagged allergens generously, including hidden ones. Double-check the ingredient list.
        </div>
      )}

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

      {draftVersions.length > 0 && (
        <Section title={`Skill versions · ${draftVersions.length}`}>
          <p className="text-[11px] text-[var(--text-muted)] mb-3 leading-relaxed">
            Ava produced one method per skill level — beginner, intermediate, and expert.
            Submitted as-is; the operator can fine-tune timings, steps, or equipment after approval.
          </p>
          <div className="space-y-3">
            {draftVersions.map(v => <DraftVersionPreview key={v.level} version={v} />)}
          </div>
        </Section>
      )}

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

function DraftVersionPreview({ version }: { version: HealthRecipeVersionPayload }) {
  const levelColour =
    version.level === 'beginner' ? '#a6e3a1'
    : version.level === 'intermediate' ? '#f9e2af'
    : '#fab387';
  const timeLine = [
    version.prep_time_minutes != null ? `Prep ${version.prep_time_minutes}m` : null,
    version.cook_time_minutes != null ? `Cook ${version.cook_time_minutes}m` : null,
    version.total_time_minutes != null ? `Total ${version.total_time_minutes}m` : null,
    version.default_servings != null ? `Serves ${version.default_servings}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="rounded-lg border border-[rgba(168,85,247,0.18)] bg-[rgba(168,85,247,0.04)] p-3">
      <div className="flex items-baseline gap-2 mb-1.5">
        <span
          className="px-2 py-0.5 rounded-full text-[9px] uppercase tracking-[0.15em]"
          style={{ background: 'rgba(168,85,247,0.15)', color: levelColour }}
        >
          {version.level}
        </span>
        {timeLine && (
          <span className="text-[10px] text-[var(--text-muted)]">{timeLine}</span>
        )}
      </div>
      {version.description && (
        <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed mb-2">{version.description}</p>
      )}
      {(version.diet_slugs.length > 0 || version.dietary_flag_slugs.length > 0) && (
        <div className="flex flex-wrap gap-1 mb-2">
          {version.diet_slugs.map(d => (
            <span key={`d-${d}`} className="px-1.5 py-0.5 rounded-full text-[9px] uppercase tracking-wider"
              style={{ background: 'rgba(168,85,247,0.12)', color: '#c084fc' }}>{d}</span>
          ))}
          {version.dietary_flag_slugs.map(f => (
            <span key={`f-${f}`} className="px-1.5 py-0.5 rounded-full text-[9px] uppercase tracking-wider"
              style={{ background: 'rgba(249,226,175,0.10)', color: '#f9e2af' }}>{f}</span>
          ))}
        </div>
      )}
      {version.equipment.length > 0 && (
        <div className="mb-2">
          <div className="text-[9px] uppercase tracking-[0.15em] text-[var(--text-muted)] mb-1">Equipment</div>
          <ul className="m-0 pl-0 list-none flex flex-wrap gap-x-3 gap-y-0.5">
            {version.equipment.map((e, i) => (
              <li key={i} className="text-[11px] text-[var(--text-primary)]">
                {e.name}
                {e.optional && <span className="text-[var(--text-muted)] ml-1">(opt.)</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {version.steps.length > 0 && (
        <div>
          <div className="text-[9px] uppercase tracking-[0.15em] text-[var(--text-muted)] mb-1">Method · {version.steps.length} steps</div>
          <ol className="m-0 pl-4">
            {version.steps.map((s, i) => (
              <li key={i} className="text-[11px] text-[var(--text-primary)] mb-1 leading-relaxed">
                {s.action}
                {s.tricky_flag && (
                  <span className="ml-1.5 px-1 py-0.5 rounded text-[8px] uppercase tracking-wider"
                    style={{ background: 'rgba(249,226,175,0.10)', color: '#f9e2af' }}>tricky</span>
                )}
                {s.technique_term && (
                  <span className="ml-1.5 text-[9px] uppercase tracking-wider text-[var(--accent)]">
                    {s.technique_term}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
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
