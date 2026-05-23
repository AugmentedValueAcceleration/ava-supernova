import { useEffect, useMemo, useState } from 'react';
import { t, useLocale } from '../i18n';
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

// Labels resolved through t() at render (module consts evaluate once at
// import, so a t() call here would freeze to English).
const EXERCISE_TYPES: { slug: HealthExerciseType; labelKey: string }[] = [
  { slug: 'compound', labelKey: 'health.submit.ex_type.compound' },
  { slug: 'isolation', labelKey: 'health.submit.ex_type.isolation' },
  { slug: 'bodyweight', labelKey: 'health.submit.ex_type.bodyweight' },
  { slug: 'plyometric', labelKey: 'health.submit.ex_type.plyometric' },
  { slug: 'mobility', labelKey: 'health.submit.ex_type.mobility' },
  { slug: 'cardio', labelKey: 'health.submit.ex_type.cardio' },
  { slug: 'isometric', labelKey: 'health.submit.ex_type.isometric' },
  { slug: 'stretching', labelKey: 'health.submit.ex_type.stretching' },
  { slug: 'breathing', labelKey: 'health.submit.ex_type.breathing' },
];

const WORKOUT_TYPES: { slug: HealthWorkoutType; labelKey: string }[] = [
  { slug: 'strength', labelKey: 'health.submit.wk_type.strength' },
  { slug: 'hypertrophy', labelKey: 'health.submit.wk_type.hypertrophy' },
  { slug: 'conditioning', labelKey: 'health.submit.wk_type.conditioning' },
  { slug: 'hiit', labelKey: 'health.submit.wk_type.hiit' },
  { slug: 'mobility', labelKey: 'health.submit.wk_type.mobility' },
  { slug: 'yoga', labelKey: 'health.submit.wk_type.yoga' },
  { slug: 'pilates', labelKey: 'health.submit.wk_type.pilates' },
  { slug: 'recovery', labelKey: 'health.submit.wk_type.recovery' },
  { slug: 'running', labelKey: 'health.submit.wk_type.running' },
  { slug: 'cycling', labelKey: 'health.submit.wk_type.cycling' },
  { slug: 'hybrid', labelKey: 'health.submit.wk_type.hybrid' },
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
  useLocale();
  const [kind, setKind] = useState<Kind | null>(null);
  const [method, setMethod] = useState<Method | null>(null);

  // Taxonomy load tracking — see retry UX below
  const [taxLoadStartedAt, setTaxLoadStartedAt] = useState<number | null>(null);
  const [taxFailedTick, setTaxFailedTick] = useState(0);
  useEffect(() => {
    if (!open || kind === null || taxonomies) return;
    setTaxLoadStartedAt(Date.now());
    const timer = window.setTimeout(() => setTaxFailedTick(tick => tick + 1), 12000);
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
          aria-label={t('health.submit.close')}
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
  useLocale();
  // Manual path: Type → Method → Details → Submitted (4)
  // Ava path:    Type → Method → Intake → Generating → Details → Submitted (6)
  const steps: { id: Step; label: string }[] =
    method === 'ava'
      ? [
          { id: 'kind', label: t('health.submit.step.type') },
          { id: 'method', label: t('health.submit.step.method') },
          { id: 'intake', label: t('health.submit.step.intake') },
          { id: 'generating', label: t('health.submit.step.drafting') },
          { id: 'form', label: t('health.submit.step.review') },
          { id: 'submitted', label: t('health.submit.step.submitted') },
        ]
      : [
          { id: 'kind', label: t('health.submit.step.type') },
          { id: 'method', label: t('health.submit.step.method') },
          { id: 'form', label: t('health.submit.step.details') },
          { id: 'submitted', label: t('health.submit.step.submitted') },
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
  useLocale();
  return (
    <div className="py-12 text-center">
      <div className="inline-flex items-center gap-2 text-[var(--text-muted)] text-[12px]">
        <span className="ava-health-spin" aria-hidden />
        {t('health.submit.loading_taxonomy')}
      </div>
      <SpinnerStyles />
    </div>
  );
}

function TaxonomiesFailed({ onRetry, onBack }: { onRetry: () => void; onBack: () => void }) {
  useLocale();
  return (
    <div className="py-12 text-center">
      <div className="text-3xl mb-3 text-amber-400">⚠</div>
      <h2 className="text-[16px] font-light text-[var(--text-primary)] mb-2">{t('health.submit.tax_failed_title')}</h2>
      <p className="text-[12px] text-[var(--text-muted)] mb-6 max-w-md mx-auto leading-relaxed">
        {t('health.submit.tax_failed_body')}
      </p>
      <div className="flex gap-2 justify-center">
        <button onClick={onBack} className={btnGhostCls}>{t('health.submit.back')}</button>
        <button onClick={onRetry} className={btnPrimaryCls}>{t('health.submit.retry')}</button>
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
  useLocale();
  if (result.ok) {
    return (
      <div className="text-center py-10">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(166,227,161,0.10)] border border-[rgba(166,227,161,0.30)]">
          <span className="text-green-300 text-xl">✓</span>
        </div>
        <h2 className="text-[18px] font-light text-[var(--text-primary)] mb-2">{t('health.submit.success_title')}</h2>
        <p className="text-[13px] text-[var(--text-muted)] mb-6 max-w-md mx-auto leading-relaxed">
          {result.submissionName && <strong className="text-[var(--text-primary)]">{result.submissionName}</strong>}
          {result.submissionName && ` ${t('health.submit.success_is')} `}
          {t('health.submit.success_body_a')} <em>{t('health.submit.my_submissions')}</em>{' '}
          {t('health.submit.success_body_b')}
        </p>
        <div className="flex gap-2 justify-center">
          <button onClick={onContinue} className={btnGhostCls}>{t('health.submit.submit_another')}</button>
          <button onClick={onClose} className={btnPrimaryCls}>{t('health.submit.done')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center py-10">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(243,139,168,0.10)] border border-[rgba(243,139,168,0.30)]">
        <span className="text-red-300 text-xl">!</span>
      </div>
      <h2 className="text-[18px] font-light text-[var(--text-primary)] mb-2">{t('health.submit.fail_title')}</h2>
      <p className="text-[13px] text-red-300/90 mb-6 max-w-md mx-auto leading-relaxed font-mono">
        {result.error ?? t('health.submit.unknown_error')}
      </p>
      <button onClick={onContinue} className={btnGhostCls}>{t('health.submit.try_again')}</button>
    </div>
  );
}

// ── Step 1: kind picker ───────────────────────────────────────────────

function KindPicker({ onPick }: { onPick: (k: Kind) => void }) {
  useLocale();
  return (
    <div>
      <h2 className="text-[20px] font-light text-[var(--text-primary)] mb-2">{t('health.submit.contribute_title')}</h2>
      <p className="text-[12px] text-[var(--text-muted)] mb-6 leading-relaxed max-w-lg">
        {t('health.submit.contribute_blurb')}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <KindCard label={t('health.submit.kind.exercise')} detail={t('health.submit.kind.exercise_detail')} onClick={() => onPick('exercise')} />
        <KindCard label={t('health.submit.kind.recipe')}   detail={t('health.submit.kind.recipe_detail')} onClick={() => onPick('recipe')} />
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
  useLocale();
  const subject = kind === 'exercise' ? t('health.submit.subject.exercise') : t('health.submit.subject.recipe');
  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <button onClick={onBack}
          className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition cursor-pointer bg-transparent border-none p-0">
          {t('health.submit.back_arrow')}
        </button>
        <h2 className="text-[18px] font-light text-[var(--text-primary)]">{t('health.submit.method_title', { subject })}</h2>
        <span className="w-12" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
        <button
          onClick={() => onPick('manual')}
          className="group rounded-xl border border-[rgba(168,85,247,0.18)] bg-[rgba(168,85,247,0.04)] p-5 text-left transition cursor-pointer hover:border-[rgba(168,85,247,0.45)] hover:bg-[rgba(168,85,247,0.08)]"
        >
          <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--accent)] mb-2">{t('health.submit.method_manual_kicker')}</div>
          <div className="text-[15px] font-light text-[var(--text-primary)] mb-1">{t('health.submit.method_manual_title')}</div>
          <div className="text-[11px] text-[var(--text-muted)] leading-relaxed">
            {t('health.submit.method_manual_body')}
          </div>
        </button>
        <button
          onClick={() => onPick('ava')}
          className="group rounded-xl border border-[rgba(168,85,247,0.18)] bg-[rgba(168,85,247,0.04)] p-5 text-left transition cursor-pointer hover:border-[rgba(168,85,247,0.45)] hover:bg-[rgba(168,85,247,0.08)]"
        >
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--accent)]">{t('health.submit.method_ava_kicker')}</div>
            <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">{t('health.submit.credits_2')}</span>
          </div>
          <div className="text-[15px] font-light text-[var(--text-primary)] mb-1">{t('health.submit.method_ava_title')}</div>
          <div className="text-[11px] text-[var(--text-muted)] leading-relaxed">
            {t('health.submit.method_ava_body', { subject })}
          </div>
        </button>
      </div>
      <p className="text-[10px] text-[var(--text-muted)] mt-3 leading-relaxed">
        {t('health.submit.method_footnote')}
      </p>
    </div>
  );
}

// ── Step 3a: exercise intake ──────────────────────────────────────────

function ExerciseIntake({
  error, onBack, onGenerate,
}: { error: string | null; onBack: () => void; onGenerate: (i: HealthGenerateExerciseIntake) => void }) {
  useLocale();
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
      <FormHeader title={t('health.submit.ex_intake_title')} onBack={onBack} />

      <Section title={t('health.submit.ex_intake_what')}>
        <Field label={t('health.submit.ex_intake_describe_label')}>
          <textarea
            value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={1200}
            rows={3} className={inputCls}
            placeholder={t('health.submit.ex_intake_describe_ph')}
          />
        </Field>
      </Section>

      <Section title={t('health.submit.optional_hints')}>
        <Field label={t('health.submit.ex_goal_label')}>
          <Select value={goal} onChange={setGoal} options={[
            { value: '', label: '—' },
            { value: 'strength', label: t('health.submit.goal.strength') },
            { value: 'hypertrophy', label: t('health.submit.goal.hypertrophy') },
            { value: 'conditioning', label: t('health.submit.goal.conditioning') },
            { value: 'mobility', label: t('health.submit.goal.mobility') },
            { value: 'general', label: t('health.submit.goal.general') },
          ]} />
        </Field>
        <Field label={t('health.submit.ex_equipment_label')}>
          <input
            type="text" value={equipment} onChange={e => setEquipment(e.target.value)} maxLength={200}
            placeholder={t('health.submit.ex_equipment_ph')}
            className={inputCls}
          />
        </Field>
        <Field label={t('health.submit.ex_level_label')}>
          <Select value={level} onChange={setLevel} options={[
            { value: '', label: '—' },
            { value: 'beginner', label: t('health.submit.level.beginner') },
            { value: 'intermediate', label: t('health.submit.level.intermediate') },
            { value: 'advanced', label: t('health.submit.level.advanced') },
          ]} />
        </Field>
      </Section>

      {error && <InlineError message={error} />}

      <div className="flex items-center justify-between pt-4 border-t border-[rgba(168,85,247,0.10)] mt-2 gap-3">
        <button
          onClick={() => onGenerate({ prompt: '', surprise: true })}
          className={btnGhostCls}
          title={t('health.submit.ex_surprise_title')}
        >
          {t('health.submit.surprise_me')}
        </button>
        <button onClick={submit} disabled={!valid} className={btnPrimaryCls}>
          {t('health.submit.draft_with_ava')}
        </button>
      </div>
    </div>
  );
}

// ── Step 3b: recipe intake ────────────────────────────────────────────

function RecipeIntake({
  error, onBack, onGenerate,
}: { error: string | null; onBack: () => void; onGenerate: (i: HealthGenerateRecipeIntake) => void }) {
  useLocale();
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
      <FormHeader title={t('health.submit.rc_intake_title')} onBack={onBack} />

      <Section title={t('health.submit.rc_intake_what')}>
        <Field label={t('health.submit.rc_intake_describe_label')}>
          <textarea
            value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={1200}
            rows={3} className={inputCls}
            placeholder={t('health.submit.rc_intake_describe_ph')}
          />
        </Field>
      </Section>

      <Section title={t('health.submit.optional_hints')}>
        <Field label={t('health.submit.rc_cuisine_label')}>
          <input
            type="text" value={cuisineHint} onChange={e => setCuisineHint(e.target.value)} maxLength={60}
            placeholder={t('health.submit.rc_cuisine_ph')}
            className={inputCls}
          />
        </Field>
        <Field label={t('health.submit.rc_course_label')}>
          <Select value={courseHint} onChange={setCourseHint} options={[
            { value: '', label: '—' },
            ...COURSES.map(c => ({ value: c, label: c[0].toUpperCase() + c.slice(1) })),
          ]} />
        </Field>
        <Field label={t('health.submit.rc_dietary_label')}>
          <input
            type="text" value={dietary} onChange={e => setDietary(e.target.value)} maxLength={100}
            placeholder={t('health.submit.rc_dietary_ph')}
            className={inputCls}
          />
        </Field>
      </Section>
      <p className="text-[10px] text-[var(--text-muted)] -mt-3 mb-4 leading-relaxed">
        {t('health.submit.rc_three_levels_note')}
      </p>

      {error && <InlineError message={error} />}

      <div className="flex items-center justify-between pt-4 border-t border-[rgba(168,85,247,0.10)] mt-2 gap-3">
        <button
          onClick={() => onGenerate({ prompt: '', surprise: true })}
          className={btnGhostCls}
          title={t('health.submit.rc_surprise_title')}
        >
          {t('health.submit.surprise_me')}
        </button>
        <button onClick={submit} disabled={!valid} className={btnPrimaryCls}>
          {t('health.submit.draft_with_ava')}
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
  useLocale();
  const subject = kind === 'exercise' ? t('health.submit.subject.exercise') : t('health.submit.subject.recipe');
  const flag = kind === 'recipe' ? t('health.submit.flag.allergen') : t('health.submit.flag.contraindication');
  return (
    <div className="py-14 text-center">
      <span className="ava-health-spin-lg mb-5 inline-block" aria-hidden />
      <h2 className="text-[18px] font-light text-[var(--text-primary)] mb-2 mt-4">{t('health.submit.generating_title', { subject })}</h2>
      <p className="text-[12px] text-[var(--text-muted)] max-w-md mx-auto leading-relaxed">
        {t('health.submit.generating_body', { flag })}
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
  useLocale();
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
      <FormHeader title={fromAva ? t('health.submit.ex_review_title') : t('health.submit.ex_new_title')} onBack={onBack} />

      {fromAva && (
        <div className="mb-5 rounded-md border border-[rgba(168,85,247,0.25)] bg-[rgba(168,85,247,0.07)] px-3 py-2 text-[11px] text-[var(--text-secondary)] leading-relaxed">
          {t('health.submit.ex_from_ava_note')}
        </div>
      )}

      <Section title={t('health.submit.identity')}>
        <Field label={t('health.submit.name')}>
          <input type="text" value={name} onChange={e => setName(e.target.value)} maxLength={100}
            placeholder={t('health.submit.ex_name_ph')} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('health.submit.exercise_type')}>
            <Select value={exerciseType} onChange={v => setExerciseType(v as HealthExerciseType)}
              options={EXERCISE_TYPES.map(et => ({ value: et.slug, label: t(et.labelKey) }))} />
          </Field>
          <Field label={t('health.submit.workout_type')}>
            <Select value={workoutType} onChange={v => setWorkoutType(v as HealthWorkoutType)}
              options={WORKOUT_TYPES.map(wt => ({ value: wt.slug, label: t(wt.labelKey) }))} />
          </Field>
        </div>
        <Field label={t('health.submit.difficulty')}>
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

      <Section title={t('health.submit.description')}>
        <Field label={t('health.submit.overview_optional')}>
          <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={1200}
            rows={3} className={inputCls} placeholder={t('health.submit.ex_overview_ph')} />
        </Field>
        <Field label={t('health.submit.ex_beginner_label')}>
          <textarea value={beginnerDetail} onChange={e => setBeginnerDetail(e.target.value)} maxLength={800}
            rows={2} className={inputCls} placeholder={t('health.submit.ex_beginner_ph')} />
        </Field>
        <Field label={t('health.submit.ex_mistakes_label')}>
          <textarea value={commonMistakes} onChange={e => setCommonMistakes(e.target.value)} maxLength={800}
            rows={2} className={inputCls} placeholder={t('health.submit.ex_mistakes_ph')} />
        </Field>
      </Section>

      <Section title={t('health.submit.steps_required')}>
        <p className="text-[11px] text-[var(--text-muted)] mb-3">
          {t('health.submit.steps_hint')}
        </p>
        {steps.map((step, i) => (
          <div key={i} className="flex gap-2 mb-2 items-start">
            <span className="mt-2 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[rgba(168,85,247,0.40)] text-[11px] text-[var(--accent)]">{i + 1}</span>
            <input type="text" value={step} maxLength={400}
              onChange={e => { const next = [...steps]; next[i] = e.target.value; setSteps(next); }}
              placeholder={t('health.submit.step_action_ph')} className={`${inputCls} flex-1`} />
            {steps.length > 1 && (
              <button type="button" onClick={() => setSteps(steps.filter((_, idx) => idx !== i))}
                className="mt-1 h-7 w-7 rounded text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer border-none bg-transparent"
                aria-label={t('health.submit.remove_step')}>×</button>
            )}
          </div>
        ))}
        {steps.length < 20 && (
          <button type="button" onClick={() => setSteps([...steps, ''])}
            className="mt-1 text-[11px] text-[var(--accent)] hover:underline cursor-pointer bg-transparent border-none p-0">
            {t('health.submit.add_step')}
          </button>
        )}
      </Section>

      <Section title={t('health.submit.safety_contra_title')}>
        <p className="text-[11px] text-[var(--text-muted)] mb-3 leading-relaxed">
          {t('health.submit.safety_contra_blurb')}
        </p>
        <div className="space-y-3">
          {Object.entries(groupedContras).map(([cat, items]) => (
            <div key={cat}>
              <div className="text-[9px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1.5">{cat}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                {items.map(c => (
                  <CheckRow key={c.slug} checked={contraindicationSlugs.has(c.slug)} onToggle={() => toggleContra(c.slug)} label={c.name}
                    badge={c.severity_hint === 'hard_block' ? t('health.submit.badge.hard_block') : undefined} badgeColor="red" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <FormFooter disabled={!isValid || inflight} loading={inflight} primaryLabel={t('health.submit.submit_for_review')} onSubmit={submit} />
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
  useLocale();
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
      <FormHeader title={fromAva ? t('health.submit.rc_review_title') : t('health.submit.rc_new_title')} onBack={onBack} />

      {fromAva && (
        <div className="mb-5 rounded-md border border-[rgba(168,85,247,0.25)] bg-[rgba(168,85,247,0.07)] px-3 py-2 text-[11px] text-[var(--text-secondary)] leading-relaxed">
          {t('health.submit.rc_from_ava_note')}
        </div>
      )}

      <Section title={t('health.submit.identity')}>
        <Field label={t('health.submit.name')}>
          <input type="text" value={name} onChange={e => setName(e.target.value)} maxLength={120}
            placeholder={t('health.submit.rc_name_ph')} className={inputCls} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label={t('health.submit.rc_cuisine_optional')}>
            <Select value={cuisineSlug} onChange={setCuisineSlug}
              options={[{ value: '', label: '—' }, ...taxonomies.cuisines.map(c => ({ value: c.slug, label: c.name }))]} />
          </Field>
          <Field label={t('health.submit.rc_course_optional')}>
            <Select value={course} onChange={setCourse}
              options={[{ value: '', label: '—' }, ...COURSES.map(c => ({ value: c, label: c[0].toUpperCase() + c.slice(1) }))]} />
          </Field>
          <Field label={t('health.submit.rc_origin_optional')}>
            <input type="text" value={originCountry} onChange={e => setOriginCountry(e.target.value)} maxLength={80}
              placeholder={t('health.submit.rc_origin_ph')} className={inputCls} />
          </Field>
        </div>
      </Section>

      <Section title={t('health.submit.overview_optional')}>
        <textarea value={overview} onChange={e => setOverview(e.target.value)} maxLength={2000}
          rows={3} className={inputCls} placeholder={t('health.submit.rc_overview_ph')} />
      </Section>

      {draftVersions.length > 0 && (
        <Section title={t('health.submit.skill_versions', { n: draftVersions.length })}>
          <p className="text-[11px] text-[var(--text-muted)] mb-3 leading-relaxed">
            {t('health.submit.skill_versions_blurb')}
          </p>
          <div className="space-y-3">
            {draftVersions.map(v => <DraftVersionPreview key={v.level} version={v} />)}
          </div>
        </Section>
      )}

      <Section title={t('health.submit.ingredients_required')}>
        {ingredients.map((ing, i) => (
          <div key={i} className="grid grid-cols-[60px_60px_1fr_24px_28px] gap-2 mb-2 items-start">
            <input type="number" step="any" value={ing.quantity}
              onChange={e => { const next = [...ingredients]; next[i] = { ...next[i], quantity: e.target.value }; setIngredients(next); }}
              placeholder={t('health.submit.qty')} className={`${inputCls} text-center`} />
            <input type="text" value={ing.unit} maxLength={24}
              onChange={e => { const next = [...ingredients]; next[i] = { ...next[i], unit: e.target.value }; setIngredients(next); }}
              placeholder={t('health.submit.unit')} className={`${inputCls} text-center`} />
            <input type="text" value={ing.name} maxLength={120}
              onChange={e => { const next = [...ingredients]; next[i] = { ...next[i], name: e.target.value }; setIngredients(next); }}
              placeholder={t('health.submit.name')} className={inputCls} />
            <label className="flex items-center justify-center pt-2" title={t('health.submit.optional_ingredient')}>
              <input type="checkbox" checked={ing.optional}
                onChange={e => { const next = [...ingredients]; next[i] = { ...next[i], optional: e.target.checked }; setIngredients(next); }}
                className="accent-[var(--accent)]" />
            </label>
            {ingredients.length > 1 ? (
              <button type="button" onClick={() => setIngredients(ingredients.filter((_, idx) => idx !== i))}
                className="mt-1 h-7 w-7 rounded text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer border-none bg-transparent"
                aria-label={t('health.submit.remove')}>×</button>
            ) : <span />}
          </div>
        ))}
        <div className="text-[10px] text-[var(--text-muted)] mb-2">{t('health.submit.tick_optional')}</div>
        {ingredients.length < 80 && (
          <button type="button" onClick={() => setIngredients([...ingredients, { name: '', quantity: '', unit: '', optional: false, notes: '' }])}
            className="text-[11px] text-[var(--accent)] hover:underline cursor-pointer bg-transparent border-none p-0">
            {t('health.submit.add_ingredient')}
          </button>
        )}
      </Section>

      <Section title={t('health.submit.safety_allergen_title')}>
        <p className="text-[11px] text-[var(--text-muted)] mb-3 leading-relaxed">
          {t('health.submit.safety_allergen_blurb')}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
          {taxonomies.allergens.map(a => (
            <CheckRow key={a.slug} checked={allergenSlugs.has(a.slug)} onToggle={() => toggleAllergen(a.slug)} label={a.name}
              badge={a.severity_hint === 'major' ? t('health.submit.badge.major') : undefined} badgeColor="red" />
          ))}
        </div>
      </Section>

      <FormFooter disabled={!isValid || inflight} loading={inflight} primaryLabel={t('health.submit.submit_for_review')} onSubmit={submit} />
    </div>
  );
}

// ── Shared form bits ──────────────────────────────────────────────────

const inputCls = 'w-full rounded-md border border-[rgba(168,85,247,0.18)] bg-[rgba(168,85,247,0.05)] px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] transition';

const btnPrimaryCls = 'rounded-md border border-[var(--accent)]/50 bg-[var(--accent)]/15 px-4 py-2 text-[12px] text-[var(--accent)] hover:bg-[var(--accent)]/25 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';

const btnGhostCls = 'rounded-md border border-[rgba(168,85,247,0.18)] bg-transparent px-4 py-2 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[rgba(168,85,247,0.35)] transition cursor-pointer';

function FormHeader({ title, onBack }: { title: string; onBack: () => void }) {
  useLocale();
  return (
    <div className="flex items-center justify-between mb-5">
      <button onClick={onBack}
        className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition cursor-pointer bg-transparent border-none p-0">
        {t('health.submit.back_arrow')}
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
  useLocale();
  const levelColour =
    version.level === 'beginner' ? '#a6e3a1'
    : version.level === 'intermediate' ? '#f9e2af'
    : '#fab387';
  const timeLine = [
    version.prep_time_minutes != null ? t('health.submit.prep_m', { n: version.prep_time_minutes }) : null,
    version.cook_time_minutes != null ? t('health.submit.cook_m', { n: version.cook_time_minutes }) : null,
    version.total_time_minutes != null ? t('health.submit.total_m', { n: version.total_time_minutes }) : null,
    version.default_servings != null ? t('health.submit.serves_n', { n: version.default_servings }) : null,
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
          <div className="text-[9px] uppercase tracking-[0.15em] text-[var(--text-muted)] mb-1">{t('health.submit.equipment')}</div>
          <ul className="m-0 pl-0 list-none flex flex-wrap gap-x-3 gap-y-0.5">
            {version.equipment.map((e, i) => (
              <li key={i} className="text-[11px] text-[var(--text-primary)]">
                {e.name}
                {e.optional && <span className="text-[var(--text-muted)] ml-1">{t('health.submit.opt')}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {version.steps.length > 0 && (
        <div>
          <div className="text-[9px] uppercase tracking-[0.15em] text-[var(--text-muted)] mb-1">{t('health.submit.method_n_steps', { n: version.steps.length })}</div>
          <ol className="m-0 pl-4">
            {version.steps.map((s, i) => (
              <li key={i} className="text-[11px] text-[var(--text-primary)] mb-1 leading-relaxed">
                {s.action}
                {s.tricky_flag && (
                  <span className="ml-1.5 px-1 py-0.5 rounded text-[8px] uppercase tracking-wider"
                    style={{ background: 'rgba(249,226,175,0.10)', color: '#f9e2af' }}>{t('health.submit.tricky')}</span>
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
  useLocale();
  return (
    <div className="flex justify-end pt-4 border-t border-[rgba(168,85,247,0.10)] mt-2">
      <button type="button" onClick={onSubmit} disabled={disabled} className={btnPrimaryCls}>
        {loading ? t('health.submit.submitting') : primaryLabel}
      </button>
    </div>
  );
}
