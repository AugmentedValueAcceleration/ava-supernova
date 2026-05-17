import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  HealthDailyLog, HealthDailyPlan, HealthProfile,
  HealthPlan, HealthPlanSummary, HealthPlanType, HealthPlanStatus,
  HealthPlanDay, HealthPlanExercise, HealthPlanMeal,
} from '../types/messages';

/**
 * Health Dashboard — the daily display surface, top-level entry in
 * the command centre. Reads from the local-first HealthProfile
 * (Profile tab) and the per-date HealthDailyPlan (this surface's
 * own state).
 *
 * Layout, top to bottom:
 *   1. Ava's morning brief (paragraph in her voice)
 *   2. Today's plan (single-column timeline)
 *   3. Status row (three numbers: readiness / nutrition / load)
 *   4. Quick log row (meal / water / sleep / mood, one-tap)
 *   5. Why drawer (collapsible reasoning, when Ava has adjusted)
 *
 * Aesthetic register: calm, generous spacing, journal not dashboard.
 * Empty states are deliberate — "no plan yet" reads as honest rest
 * day, not unfinished software.
 *
 * Generation handlers (brief, plan creation, log capture) land in
 * follow-up commits; this shell defines the slots and the data path
 * so the layout is locked before behaviour fills it in.
 */

interface Props {
  profile: HealthProfile | null;
  plan: HealthDailyPlan | null;
  onSavePlan: (plan: HealthDailyPlan) => void;
  onGenerateMorningBrief: (date: string) => void;
  briefGenerating: boolean;
  briefError: string | null;
  // Jumps to the Health & Nutrition page's Profile tab — the goals
  // pointer and empty-state both use it so the dashboard's references
  // to goals have somewhere to lead.
  onNavigateToProfile: () => void;
  // Multi-week Plans — library summaries + the one full plan open in
  // the detail view. Create / save / delete round-trip through the host.
  plans: HealthPlanSummary[];
  planOpen: HealthPlan | null;
  onOpenPlan: (id: string) => void;
  onSavePlanProgram: (plan: HealthPlan) => void;
  onDeletePlan: (id: string) => void;
  onClosePlan: () => void;
}

export function HealthDashboard({
  profile, plan, onSavePlan, onGenerateMorningBrief, briefGenerating, briefError, onNavigateToProfile,
  plans, planOpen, onOpenPlan, onSavePlanProgram, onDeletePlan, onClosePlan,
}: Props) {
  const today = todayIso();
  const greeting = useMemo(() => greetingFor(new Date()), []);
  const profileEmpty = useMemo(() => isProfileEmpty(profile), [profile]);
  // Goals unset but the profile isn't otherwise empty — the brief
  // talks about goals, so the operator needs a direct route to set
  // them. (Fully-empty profiles get the ProfileEmptyState instead.)
  const goalUnset = !profile?.goals?.primary && !profile?.goals?.weekly_focus;

  // Quick-log writes — every log action lands on today's plan. When no
  // plan exists yet (common: the operator logs water before Ava has
  // written anything) we mint a fresh empty plan for the date so the
  // first log still has somewhere to live.
  const commitLog = useCallback((mutate: (log: HealthDailyLog) => HealthDailyLog) => {
    const base = plan ?? freshDailyPlan(today);
    onSavePlan({
      ...base,
      log: mutate(base.log),
      updated_at: new Date().toISOString(),
    });
  }, [plan, today, onSavePlan]);

  const quickLog = useMemo<QuickLogApi>(() => ({
    addWater: (ml) => commitLog(l => ({ ...l, water_ml: Math.max(0, l.water_ml + ml) })),
    resetWater: () => commitLog(l => ({ ...l, water_ml: 0 })),
    setSleep: (hours) => commitLog(l => ({ ...l, sleep_hours: hours })),
    setMood: (mood) => commitLog(l => ({ ...l, mood })),
    addMeal: (meal) => commitLog(l => ({
      ...l,
      meals: [...l.meals, { id: logId(), time: nowHHMM(), ...meal }],
    })),
    removeMeal: (id) => commitLog(l => ({ ...l, meals: l.meals.filter(m => m.id !== id) })),
  }), [commitLog]);

  // Inner tab — Overview (the synthesis: brief / status / log) vs
  // Plans (the content: today's meals + training). Persisted so the
  // operator lands back where they were. Separate localStorage key
  // from the Command Centre's outer tab.
  const [innerTab, setInnerTab] = useState<HealthInnerTab>(() => {
    try {
      const stored = localStorage.getItem('ava-ext-health-tab');
      return stored === 'plans' ? 'plans' : 'overview';
    } catch { return 'overview'; }
  });
  const switchInnerTab = (next: HealthInnerTab) => {
    setInnerTab(next);
    try { localStorage.setItem('ava-ext-health-tab', next); } catch { /* quota / disabled */ }
  };

  // New-plan wizard — open state for the Plans tab. The tab renders one
  // of three things: an open plan's editor, the wizard, or the library.
  const [wizardOpen, setWizardOpen] = useState(false);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      {/* Header — calm greeting, date, registers the dashboard's
          quiet tone before anything else loads. */}
      <header>
        <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
          {formatLongDate(new Date())}
        </div>
        <h1 className="mt-1 text-[20px] font-light text-[var(--text-primary)]">
          {greeting}.
        </h1>
      </header>

      {/* Inner tab nav — Overview / Plans */}
      <div className="mt-5 mb-6 flex gap-1 border-b border-[var(--border)]">
        <InnerTabBtn label="Overview" active={innerTab === 'overview'} onClick={() => switchInnerTab('overview')} />
        <InnerTabBtn label="Plans" active={innerTab === 'plans'} onClick={() => switchInnerTab('plans')} />
      </div>

      {/* If the profile is empty there's nothing for Ava to read,
          so the dashboard prompts setup instead of guessing. Shown
          on both tabs since both depend on the profile. */}
      {profileEmpty && (
        <div className="mb-6">
          <ProfileEmptyState onNavigateToProfile={onNavigateToProfile} />
        </div>
      )}

      {/* ── Overview — the synthesis + today's content ────────────── */}
      {innerTab === 'overview' && (
        <div className="space-y-8">
          <Section title="Today's brief">
            <BriefBlock
              plan={plan}
              profileEmpty={profileEmpty}
              generating={briefGenerating}
              error={briefError}
              onGenerate={() => onGenerateMorningBrief(today)}
            />
            {!profileEmpty && goalUnset && (
              <GoalsPointer onNavigateToProfile={onNavigateToProfile} />
            )}
          </Section>

          {/* Today's meals + training — the slice of the day. Moved
              here from the Plans tab: this is "today", and the Plans
              tab is now the multi-week plan library. */}
          <TodayPlanView plan={plan} />

          <Section title="Where you are">
            <StatusRow plan={plan} profile={profile} />
          </Section>

          <Section title="Quick log">
            <QuickLogRow plan={plan} api={quickLog} />
          </Section>

          <WhyDrawer reasoning={plan?.brief_reasoning ?? null} />
        </div>
      )}

      {/* ── Plans — the multi-week plan library / detail ──────────── */}
      {innerTab === 'plans' && (
        <div className="space-y-8">
          {planOpen ? (
            <PlanEditor
              plan={planOpen}
              onClose={onClosePlan}
              onSave={onSavePlanProgram}
              onDelete={onDeletePlan}
            />
          ) : wizardOpen ? (
            <NewPlanWizard
              onCancel={() => setWizardOpen(false)}
              onCreateManual={(p) => { setWizardOpen(false); onSavePlanProgram(p); }}
            />
          ) : (
            <PlansLibrary
              plans={plans}
              onOpen={onOpenPlan}
              onNew={() => setWizardOpen(true)}
              onDelete={onDeletePlan}
            />
          )}
        </div>
      )}

      <footer className="pt-8 text-[10px] text-[var(--text-muted)]">
        Local-first — your health data stays on this machine unless you switch on sync in the Sync tab. {today}
      </footer>
    </div>
  );
}

type HealthInnerTab = 'overview' | 'plans';

function InnerTabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 border-x-0 border-t-0 bg-transparent px-4 py-2 text-xs transition cursor-pointer ${
        active
          ? 'border-[var(--accent)] text-[var(--accent)] font-semibold'
          : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
      }`}
    >
      {label}
    </button>
  );
}

// ── Sections + blocks ────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)] mb-3">{title}</h2>
      {children}
    </section>
  );
}

function ProfileEmptyState({ onNavigateToProfile }: { onNavigateToProfile: () => void }) {
  return (
    <div className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-4 py-3">
      <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
        Set up your <strong>Profile</strong> first — Ava reads it to draft your daily plan and brief. Body stats, goals, constraints, and your schedule.
      </p>
      <button
        type="button"
        onClick={onNavigateToProfile}
        className="mt-2.5 inline-flex items-center gap-1 rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 transition cursor-pointer"
      >
        Set up your profile <span aria-hidden>→</span>
      </button>
    </div>
  );
}

/**
 * Goals pointer — shows when the profile has data but no goal set.
 * The brief and plan both reference goals, so without this the
 * operator reads "Ava mentions my goals" with no visible way to set
 * them. Leads straight to the Profile tab where goals live.
 */
function GoalsPointer({ onNavigateToProfile }: { onNavigateToProfile: () => void }) {
  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-4 py-2.5">
      <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
        Ava writes your brief around your goals — but you haven&apos;t set one yet.
      </p>
      <button
        type="button"
        onClick={onNavigateToProfile}
        className="shrink-0 inline-flex items-center gap-1 rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 transition cursor-pointer"
      >
        Set your goals <span aria-hidden>→</span>
      </button>
    </div>
  );
}

function BriefBlock({
  plan, profileEmpty, generating, error, onGenerate,
}: {
  plan: HealthDailyPlan | null;
  profileEmpty: boolean;
  generating: boolean;
  error: string | null;
  onGenerate: () => void;
}) {
  const brief = plan?.morning_brief;
  return (
    <div>
      {brief ? (
        <p className="text-[15px] leading-[1.7] text-[var(--text-primary)] font-light">{brief}</p>
      ) : (
        <div className="rounded-lg border border-[var(--border)] bg-transparent px-4 py-5 text-[12px] text-[var(--text-muted)] italic leading-relaxed">
          {profileEmpty
            ? "Ava will write today's brief once your profile is set up — what your week's looked like, what to do today, what to skip."
            : "Today's brief hasn't been written yet. Click 'Write today's brief' below and Ava will draft it from your profile."}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-[12px] text-red-300/90 leading-relaxed">
          {error}
        </div>
      )}

      <div className="mt-3 flex items-center gap-3 text-[11px]">
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating || profileEmpty}
          className="rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-[var(--accent)] hover:bg-[var(--accent)]/20 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {generating
            ? 'Writing…'
            : brief
              ? 'Rewrite brief'
              : "Write today's brief"}
        </button>
        <span className="text-[10px] text-[var(--text-muted)] leading-relaxed">
          Ava reads a snapshot of your profile to write this. The profile itself stays local.
        </span>
      </div>
    </div>
  );
}

/**
 * Today's content — meals + training for the current day, split into
 * rich-card strips. Rendered on the Overview tab (this is "today");
 * the Plans tab now carries the multi-week plan library.
 *
 * Empty states are deliberate "rest" treatments, not blanks. When the
 * active plan projects into the day (Phase D) these strips fill from
 * its day slice; for now they read from the per-date HealthDailyPlan.
 */
function TodayPlanView({ plan }: { plan: HealthDailyPlan | null }) {
  const items = plan?.items ?? [];
  const meals = items.filter(i => i.kind === 'meal');
  const training = items.filter(i => i.kind === 'workout' || i.kind === 'mobility');
  const recovery = items.filter(i => i.kind === 'rest' || i.kind === 'sleep' || i.kind === 'note');

  return (
    <>
      <Section title="Today's meals">
        {meals.length === 0 ? (
          <PlansEmptyCard
            title="No meals planned yet"
            body="When meal planning ships, this is a strip of recipe cards — hero image, macros, prep time — slotted to your meal times."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {meals.map(m => <PlanItemCard key={m.id} item={m} accent="amber" />)}
          </div>
        )}
      </Section>

      <Section title="Today's training">
        {training.length === 0 ? (
          <PlansEmptyCard
            title="No training planned yet"
            body="When fitness planning ships, today's workout shows here — exercises with their imagery, sets, reps, and rest, plus total duration."
          />
        ) : (
          <div className="space-y-2">
            {training.map(t => <PlanItemCard key={t.id} item={t} accent="accent" />)}
          </div>
        )}
      </Section>

      {recovery.length > 0 && (
        <Section title="Recovery & notes">
          <div className="space-y-2">
            {recovery.map(r => <PlanItemCard key={r.id} item={r} accent="slate" />)}
          </div>
        </Section>
      )}
    </>
  );
}

function PlansEmptyCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-transparent px-4 py-6 text-center">
      <div className="text-[12px] text-[var(--text-secondary)]">{title}</div>
      <div className="mt-1.5 mx-auto max-w-sm text-[10px] text-[var(--text-muted)] italic leading-relaxed">{body}</div>
    </div>
  );
}

// ── Multi-week Plans — library + detail ──────────────────────────────
// The Plans tab. A plan is a program (fitness / meal / combined); the
// library lists them, the detail view opens one. Phase B1 ships the
// library + create + a read-only detail; the editor lands in B2.

const PLAN_TYPE_META: Record<HealthPlanType, { label: string; accent: string; tint: string; blurb: string }> = {
  fitness:  { label: 'Fitness',  accent: 'var(--accent)', tint: 'border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)]', blurb: 'Training weeks — exercises, sets, progression.' },
  meal:     { label: 'Meal',     accent: '#f59e0b',       tint: 'border-amber-400/30 bg-amber-400/10 text-amber-300',                 blurb: 'Nutrition weeks — meals, macros, shopping list.' },
  combined: { label: 'Combined', accent: '#34d399',       tint: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',           blurb: 'Training and meals woven together.' },
};

const PLAN_STATUS_META: Record<HealthPlanStatus, { label: string; cls: string }> = {
  draft:     { label: 'Draft',     cls: 'bg-[var(--border)] text-[var(--text-muted)]' },
  active:    { label: 'Active',    cls: 'bg-emerald-400/15 text-emerald-300' },
  completed: { label: 'Completed', cls: 'bg-sky-400/15 text-sky-300' },
  archived:  { label: 'Archived',  cls: 'bg-[var(--border)] text-[var(--text-muted)] opacity-70' },
};

/** Days → preset label. 1 → "1 day", 7 → "1 week", 28 → "4 weeks". */
function durationLabel(days: number): string {
  if (days <= 1) return '1 day';
  const weeks = Math.round(days / 7);
  return weeks === 1 ? '1 week' : `${weeks} weeks`;
}

function newPlanId(): string {
  return crypto?.randomUUID?.() ?? `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** A fresh, empty draft plan of the chosen type + duration — the
 *  manual door of the wizard hands this straight to the editor. */
function blankPlan(type: HealthPlanType, durationDays: number): HealthPlan {
  return {
    schema_version: 1,
    id: newPlanId(),
    type,
    title: `New ${PLAN_TYPE_META[type].label.toLowerCase()} plan`,
    goal: null,
    source: 'manual',
    status: 'draft',
    duration_days: durationDays,
    start_date: null,
    profile_snapshot: null,
    days: [],
    created_at: new Date().toISOString(),
    updated_at: null,
  };
}

function PlansLibrary({ plans, onOpen, onNew, onDelete }: {
  plans: HealthPlanSummary[];
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Your plans</h2>
        <p className="mt-1 text-[11px] text-[var(--text-muted)] leading-relaxed">
          Multi-week fitness, meal, and combined programs. Build one by hand, or ask Ava.
        </p>
      </div>

      <button
        type="button"
        onClick={onNew}
        className="w-full rounded-lg border border-dashed border-[var(--accent)]/40 bg-[var(--accent)]/5 px-4 py-3 text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/10 transition cursor-pointer"
      >
        + New plan
      </button>

      {plans.length === 0 ? (
        <PlansEmptyCard
          title="No plans yet"
          body="Start one with “+ New plan” — pick a type, choose to build it yourself or ask Ava, set the length."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {plans.map(p => (
            <PlanCard key={p.id} plan={p} onOpen={() => onOpen(p.id)} onDelete={() => onDelete(p.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function PlanCard({ plan, onOpen, onDelete }: {
  plan: HealthPlanSummary;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const m = PLAN_TYPE_META[plan.type];
  const s = PLAN_STATUS_META[plan.status];

  return (
    <div className="group relative overflow-hidden rounded-lg border border-[var(--border)] bg-transparent transition hover:border-[var(--accent)]/40">
      <div className="h-[3px]" style={{ background: m.accent }} aria-hidden />
      <button
        type="button"
        onClick={onOpen}
        className="block w-full cursor-pointer border-none bg-transparent px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${m.tint}`}>{m.label}</span>
          <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${s.cls}`}>{s.label}</span>
        </div>
        <div className="mt-2 text-[13px] leading-snug text-[var(--text-primary)]">{plan.title}</div>
        <div className="mt-1 text-[10px] text-[var(--text-muted)]">
          {durationLabel(plan.duration_days)} · {plan.source === 'ava' ? 'Ava-generated' : 'Built by you'}
        </div>
      </button>

      {confirming ? (
        <div className="absolute right-2 top-2 flex items-center gap-1.5 rounded-md border border-red-500/30 bg-[var(--bg-input)] px-2 py-1">
          <span className="text-[10px] text-[var(--text-secondary)]">Delete?</span>
          <button type="button" onClick={() => { onDelete(); setConfirming(false); }} className="border-none bg-transparent text-[10px] font-semibold text-red-300 hover:text-red-200 cursor-pointer">Yes</button>
          <button type="button" onClick={() => setConfirming(false)} className="border-none bg-transparent text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">No</button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          title="Delete plan"
          className="absolute right-2 top-2 cursor-pointer rounded border-none bg-transparent p-1 text-[var(--text-muted)] opacity-0 transition hover:text-red-300 group-hover:opacity-100"
        >
          ✕
        </button>
      )}
    </div>
  );
}

// ── New-plan wizard (B3) ─────────────────────────────────────────────
// Type → Door → Length. The manual door hands a blank plan straight to
// the editor; the Ava door's intake + generate flow lands in C2 — a
// placeholder panel marks the spot for now.

function NewPlanWizard({ onCancel, onCreateManual }: {
  onCancel: () => void;
  onCreateManual: (plan: HealthPlan) => void;
}) {
  const [step, setStep] = useState<'type' | 'door' | 'length' | 'ava'>('type');
  const [type, setType] = useState<HealthPlanType | null>(null);
  const [door, setDoor] = useState<'manual' | 'ava' | null>(null);
  const [duration, setDuration] = useState<number>(28);

  const stepLabels = ['Type', 'How', 'Length'];
  const currentIdx = step === 'type' ? 0 : step === 'door' ? 1 : 2;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-light text-[var(--text-primary)]">New plan</span>
        <button type="button" onClick={onCancel} className="border-none bg-transparent text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">Cancel</button>
      </div>

      <div className="flex items-center gap-1.5">
        {stepLabels.map((label, i) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={`text-[10px] uppercase tracking-wide ${i <= currentIdx ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>{label}</span>
            {i < stepLabels.length - 1 && <span className="text-[10px] text-[var(--text-muted)]">·</span>}
          </span>
        ))}
      </div>

      {step === 'type' && (
        <WizardStep title="What kind of plan?">
          {(['fitness', 'meal', 'combined'] as HealthPlanType[]).map(t => {
            const m = PLAN_TYPE_META[t];
            return (
              <WizardChoice key={t} title={m.label} blurb={m.blurb} accent={m.accent} onClick={() => { setType(t); setStep('door'); }} />
            );
          })}
        </WizardStep>
      )}

      {step === 'door' && (
        <WizardStep title="How do you want to build it?" onBack={() => setStep('type')}>
          <WizardChoice
            title="Build it myself"
            blurb="Start from a blank plan and shape every week and day by hand."
            onClick={() => { setDoor('manual'); setStep('length'); }}
          />
          <WizardChoice
            title="Ask Ava"
            blurb="Ava drafts the plan from your profile — you review and edit everything after."
            onClick={() => { setDoor('ava'); setStep('length'); }}
          />
        </WizardStep>
      )}

      {step === 'length' && type && (
        <WizardStep title="How long should it run?" onBack={() => setStep('door')}>
          {DURATION_PRESETS.map(p => (
            <WizardChoice
              key={p.days}
              title={p.label}
              blurb=""
              onClick={() => {
                setDuration(p.days);
                if (door === 'manual') onCreateManual(blankPlan(type, p.days));
                else setStep('ava');
              }}
            />
          ))}
        </WizardStep>
      )}

      {step === 'ava' && type && (
        <WizardStep title="Ask Ava" onBack={() => setStep('length')} plain>
          <div className="rounded-lg border border-[var(--border)] bg-transparent px-4 py-6 text-center">
            <div className="text-[12px] text-[var(--text-secondary)]">
              Ava will draft your {durationLabel(duration)} {PLAN_TYPE_META[type].label.toLowerCase()} plan here.
            </div>
            <div className="mx-auto mt-1.5 max-w-sm text-[10px] italic leading-relaxed text-[var(--text-muted)]">
              The intake-and-generate flow lands in the next update. For now, build it yourself — you can ask Ava to refine it later.
            </div>
            <button
              type="button"
              onClick={() => onCreateManual(blankPlan(type, duration))}
              className="mt-3 rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 transition cursor-pointer"
            >
              Build it myself instead
            </button>
          </div>
        </WizardStep>
      )}
    </div>
  );
}

function WizardStep({ title, onBack, plain, children }: {
  title: string;
  onBack?: () => void;
  plain?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {onBack && (
          <button type="button" onClick={onBack} className="border-none bg-transparent text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">← Back</button>
        )}
        <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">{title}</span>
      </div>
      {plain ? <div>{children}</div> : <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{children}</div>}
    </div>
  );
}

function WizardChoice({ title, blurb, accent, onClick }: {
  title: string;
  blurb: string;
  accent?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-[var(--border)] bg-transparent px-3 py-3 text-left hover:border-[var(--accent)]/40 transition cursor-pointer"
    >
      {accent && <div className="mb-2 h-[3px] w-8 rounded" style={{ background: accent }} aria-hidden />}
      <div className="text-[12px] font-medium text-[var(--text-primary)]">{title}</div>
      {blurb && <div className="mt-1 text-[10px] leading-relaxed text-[var(--text-muted)]">{blurb}</div>}
    </button>
  );
}

// ── Plan editor (B2) ─────────────────────────────────────────────────
// Opening a plan loads the full HealthPlan into a local working copy.
// Edits autosave (debounced 700ms); the host's save echo never clobbers
// the open draft — re-seed fires only when a different plan id opens.

const DURATION_PRESETS: Array<{ days: number; label: string }> = [
  { days: 1,  label: '1 day' },
  { days: 7,  label: '1 week' },
  { days: 28, label: '4 weeks' },
  { days: 56, label: '8 weeks' },
  { days: 84, label: '12 weeks' },
];

const editInput =
  'rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1 text-[12px] ' +
  'text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/50';

function newItemId(): string {
  return crypto?.randomUUID?.() ?? `i-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function emptyExercise(): HealthPlanExercise {
  return { id: newItemId(), ref: null, name: '', sets: null, reps: null, weight: null, rest_seconds: null, tempo: null, notes: null };
}
function emptyMeal(slot: HealthPlanMeal['slot']): HealthPlanMeal {
  return { id: newItemId(), slot, ref: null, name: '', calories: null, protein_g: null, carbs_g: null, fat_g: null, notes: null };
}
function defaultDay(dayIndex: number): HealthPlanDay {
  return { day_index: dayIndex, kind: 'rest', title: null, training: [], meals: [], notes: null };
}

/** True when a day carries nothing — used to keep `days[]` sparse so an
 *  untouched day isn't persisted as an explicit empty rest entry. */
function isEmptyDay(d: HealthPlanDay): boolean {
  return d.kind === 'rest' && d.training.length === 0 && d.meals.length === 0 && !d.title && !d.notes;
}

function daySummary(day: HealthPlanDay, showTraining: boolean, showMeals: boolean): string {
  const bits: string[] = [];
  if (showTraining && day.training.length > 0) bits.push(`${day.training.length} exercise${day.training.length === 1 ? '' : 's'}`);
  if (showMeals && day.meals.length > 0) bits.push(`${day.meals.length} meal${day.meals.length === 1 ? '' : 's'}`);
  if (bits.length === 0) return day.kind === 'active_recovery' ? 'Active recovery' : 'Rest';
  if (day.kind === 'active_recovery') bits.unshift('Active recovery');
  return bits.join(' · ');
}

function PlanEditor({ plan, onClose, onSave, onDelete }: {
  plan: HealthPlan;
  onClose: () => void;
  onSave: (plan: HealthPlan) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState<HealthPlan>(plan);
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const saveTimer = useRef<number | undefined>(undefined);

  // Re-seed only when a *different* plan opens — the host's save echo
  // (same id) must never clobber the draft mid-edit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setDraft(plan); }, [plan.id]);
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const commit = useCallback((next: HealthPlan) => {
    setDraft(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => onSave(next), 700);
  }, [onSave]);

  // Flush any pending debounced save before leaving — closing within
  // 700ms of an edit must not lose it.
  const closeWithFlush = () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); onSave(draft); }
    onClose();
  };

  const m = PLAN_TYPE_META[draft.type];
  const showTraining = draft.type === 'fitness' || draft.type === 'combined';
  const showMeals = draft.type === 'meal' || draft.type === 'combined';

  // days[] is sparse — absent days render as an implicit rest day.
  const dayByIndex = useMemo(() => {
    const map = new Map<number, HealthPlanDay>();
    for (const d of draft.days) map.set(d.day_index, d);
    return map;
  }, [draft.days]);

  const upsertDay = (day: HealthPlanDay) => {
    const days = draft.days.filter(d => d.day_index !== day.day_index);
    if (!isEmptyDay(day)) days.push(day);
    days.sort((a, b) => a.day_index - b.day_index);
    commit({ ...draft, days });
  };

  const setDuration = (days: number) => {
    commit({ ...draft, duration_days: days, days: draft.days.filter(d => d.day_index <= days) });
  };

  const weeks = Math.max(1, Math.ceil(draft.duration_days / 7));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={closeWithFlush}
          className="border-none bg-transparent text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
        >
          ← All plans
        </button>
        <span className="text-[10px] text-[var(--text-muted)]">Changes save automatically</span>
      </div>

      {/* Header — type, status, title, goal, duration */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${m.tint}`}>{m.label}</span>
          <select
            value={draft.status}
            onChange={(e) => commit({ ...draft, status: e.target.value as HealthPlanStatus })}
            className={editInput}
            title="Activating a plan archives any other active plan of the same type"
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <input
          value={draft.title}
          onChange={(e) => commit({ ...draft, title: e.target.value })}
          placeholder="Plan title"
          className={`${editInput} w-full text-[15px]`}
        />
        <input
          value={draft.goal ?? ''}
          onChange={(e) => commit({ ...draft, goal: e.target.value || null })}
          placeholder="Goal — e.g. lose 4 kg, first 5 k, build pressing strength"
          className={`${editInput} w-full`}
        />
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--text-muted)]">Length</span>
          <select value={draft.duration_days} onChange={(e) => setDuration(Number(e.target.value))} className={editInput}>
            {DURATION_PRESETS.map(p => <option key={p.days} value={p.days}>{p.label}</option>)}
          </select>
        </div>
      </div>

      {/* Weeks → days */}
      <div className="space-y-4">
        {Array.from({ length: weeks }, (_, w) => (
          <EditorWeek
            key={w}
            weekIndex={w}
            duration={draft.duration_days}
            dayByIndex={dayByIndex}
            expandedDay={expandedDay}
            onToggleDay={(idx) => setExpandedDay(prev => (prev === idx ? null : idx))}
            showTraining={showTraining}
            showMeals={showMeals}
            onChangeDay={upsertDay}
          />
        ))}
      </div>

      {/* Delete */}
      <div className="border-t border-[var(--border)] pt-4">
        {confirming ? (
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-[var(--text-secondary)]">Delete this plan permanently?</span>
            <button type="button" onClick={() => { onDelete(draft.id); onClose(); }} className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[11px] font-semibold text-red-300 hover:bg-red-500/20 transition cursor-pointer">Delete</button>
            <button type="button" onClick={() => setConfirming(false)} className="border-none bg-transparent text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">Cancel</button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="border-none bg-transparent text-[11px] text-[var(--text-muted)] hover:text-red-300 transition cursor-pointer">Delete plan</button>
        )}
      </div>
    </div>
  );
}

function EditorWeek({ weekIndex, duration, dayByIndex, expandedDay, onToggleDay, showTraining, showMeals, onChangeDay }: {
  weekIndex: number;
  duration: number;
  dayByIndex: Map<number, HealthPlanDay>;
  expandedDay: number | null;
  onToggleDay: (idx: number) => void;
  showTraining: boolean;
  showMeals: boolean;
  onChangeDay: (day: HealthPlanDay) => void;
}) {
  const firstDay = weekIndex * 7 + 1;
  const dayIndices: number[] = [];
  for (let i = firstDay; i < firstDay + 7 && i <= duration; i++) dayIndices.push(i);
  const multiWeek = duration > 7;
  return (
    <div>
      {multiWeek && <h3 className="mb-2 text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Week {weekIndex + 1}</h3>}
      <div className="space-y-2">
        {dayIndices.map(idx => (
          <DayBlock
            key={idx}
            day={dayByIndex.get(idx) ?? defaultDay(idx)}
            expanded={expandedDay === idx}
            onToggle={() => onToggleDay(idx)}
            showTraining={showTraining}
            showMeals={showMeals}
            onChange={onChangeDay}
          />
        ))}
      </div>
    </div>
  );
}

function DayBlock({ day, expanded, onToggle, showTraining, showMeals, onChange }: {
  day: HealthPlanDay;
  expanded: boolean;
  onToggle: () => void;
  showTraining: boolean;
  showMeals: boolean;
  onChange: (day: HealthPlanDay) => void;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-transparent">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 border-none bg-transparent px-3 py-2.5 text-left cursor-pointer"
      >
        <span className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-[var(--text-primary)]">Day {day.day_index}</span>
          {day.title && <span className="text-[11px] text-[var(--text-secondary)]">— {day.title}</span>}
        </span>
        <span className="text-[10px] text-[var(--text-muted)]">{daySummary(day, showTraining, showMeals)}</span>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-[var(--border)] px-3 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <select value={day.kind} onChange={(e) => onChange({ ...day, kind: e.target.value as HealthPlanDay['kind'] })} className={editInput}>
              <option value="training">Training</option>
              <option value="rest">Rest</option>
              <option value="active_recovery">Active recovery</option>
            </select>
            <input
              value={day.title ?? ''}
              onChange={(e) => onChange({ ...day, title: e.target.value || null })}
              placeholder="Day title — e.g. Upper body, Long run"
              className={`${editInput} min-w-[140px] flex-1`}
            />
          </div>

          {showTraining && (
            <DaySection
              title="Training"
              addLabel="+ Add exercise"
              empty={day.training.length === 0}
              onAdd={() => onChange({ ...day, training: [...day.training, emptyExercise()] })}
            >
              {day.training.map(ex => (
                <ExerciseEditor
                  key={ex.id}
                  ex={ex}
                  onChange={(next) => onChange({ ...day, training: day.training.map(e => (e.id === ex.id ? next : e)) })}
                  onRemove={() => onChange({ ...day, training: day.training.filter(e => e.id !== ex.id) })}
                />
              ))}
            </DaySection>
          )}

          {showMeals && (
            <DaySection
              title="Meals"
              addLabel="+ Add meal"
              empty={day.meals.length === 0}
              onAdd={() => onChange({ ...day, meals: [...day.meals, emptyMeal('breakfast')] })}
            >
              {day.meals.map(meal => (
                <PlanMealEditor
                  key={meal.id}
                  meal={meal}
                  onChange={(next) => onChange({ ...day, meals: day.meals.map(mm => (mm.id === meal.id ? next : mm)) })}
                  onRemove={() => onChange({ ...day, meals: day.meals.filter(mm => mm.id !== meal.id) })}
                />
              ))}
            </DaySection>
          )}

          <textarea
            value={day.notes ?? ''}
            onChange={(e) => onChange({ ...day, notes: e.target.value || null })}
            placeholder="Day notes (optional)"
            rows={2}
            className={`${editInput} w-full resize-y`}
          />
        </div>
      )}
    </div>
  );
}

function DaySection({ title, addLabel, empty, onAdd, children }: {
  title: string;
  addLabel: string;
  empty: boolean;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">{title}</span>
        <button type="button" onClick={onAdd} className="border-none bg-transparent text-[11px] text-[var(--accent)] hover:opacity-80 cursor-pointer">{addLabel}</button>
      </div>
      {empty ? <div className="text-[10px] italic text-[var(--text-muted)]">Nothing added yet.</div> : children}
    </div>
  );
}

function ExerciseEditor({ ex, onChange, onRemove }: {
  ex: HealthPlanExercise;
  onChange: (e: HealthPlanExercise) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--bg-input)]/40 p-2">
      <div className="flex items-center gap-2">
        <input value={ex.name} onChange={(e) => onChange({ ...ex, name: e.target.value })} placeholder="Exercise name" className={`${editInput} flex-1`} />
        <button type="button" onClick={onRemove} title="Remove" className="border-none bg-transparent px-1 text-[var(--text-muted)] hover:text-red-300 cursor-pointer">✕</button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <NumInput label="Sets" value={ex.sets} onChange={(v) => onChange({ ...ex, sets: v })} />
        <TextInput label="Reps" value={ex.reps} placeholder="8-12" onChange={(v) => onChange({ ...ex, reps: v })} />
        <TextInput label="Weight" value={ex.weight} placeholder="60 kg / RPE 7" onChange={(v) => onChange({ ...ex, weight: v })} />
        <NumInput label="Rest (s)" value={ex.rest_seconds} onChange={(v) => onChange({ ...ex, rest_seconds: v })} />
      </div>
      <input value={ex.notes ?? ''} onChange={(e) => onChange({ ...ex, notes: e.target.value || null })} placeholder="Notes — tempo, cues (optional)" className={`${editInput} w-full`} />
    </div>
  );
}

function PlanMealEditor({ meal, onChange, onRemove }: {
  meal: HealthPlanMeal;
  onChange: (m: HealthPlanMeal) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--bg-input)]/40 p-2">
      <div className="flex items-center gap-2">
        <select value={meal.slot} onChange={(e) => onChange({ ...meal, slot: e.target.value as HealthPlanMeal['slot'] })} className={editInput}>
          <option value="breakfast">Breakfast</option>
          <option value="lunch">Lunch</option>
          <option value="dinner">Dinner</option>
          <option value="snack">Snack</option>
        </select>
        <input value={meal.name} onChange={(e) => onChange({ ...meal, name: e.target.value })} placeholder="Meal name" className={`${editInput} flex-1`} />
        <button type="button" onClick={onRemove} title="Remove" className="border-none bg-transparent px-1 text-[var(--text-muted)] hover:text-red-300 cursor-pointer">✕</button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <NumInput label="Cal" value={meal.calories} onChange={(v) => onChange({ ...meal, calories: v })} />
        <NumInput label="Protein g" value={meal.protein_g} onChange={(v) => onChange({ ...meal, protein_g: v })} />
        <NumInput label="Carbs g" value={meal.carbs_g} onChange={(v) => onChange({ ...meal, carbs_g: v })} />
        <NumInput label="Fat g" value={meal.fat_g} onChange={(v) => onChange({ ...meal, fat_g: v })} />
      </div>
      <input value={meal.notes ?? ''} onChange={(e) => onChange({ ...meal, notes: e.target.value || null })} placeholder="Notes (optional)" className={`${editInput} w-full`} />
    </div>
  );
}

function NumInput({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className={editInput}
      />
    </label>
  );
}

function TextInput({ label, value, placeholder, onChange }: {
  label: string;
  value: string | null;
  placeholder?: string;
  onChange: (v: string | null) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
      <input value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value || null)} className={editInput} />
    </label>
  );
}

function PlanItemCard({
  item, accent,
}: {
  item: HealthDailyPlan['items'][number];
  accent: 'amber' | 'accent' | 'slate';
}) {
  const accentBar =
    accent === 'amber' ? 'bg-amber-400/70' :
    accent === 'accent' ? 'bg-[var(--accent)]' :
    'bg-slate-400/50';
  const done = item.status === 'done';
  return (
    <div
      className={`flex items-stretch gap-0 overflow-hidden rounded-lg border transition ${
        done
          ? 'border-[var(--border)] bg-[var(--accent)]/5'
          : item.status === 'skipped'
            ? 'border-[var(--border)] bg-transparent opacity-60'
            : 'border-[var(--border)] bg-transparent hover:border-[var(--accent)]/40'
      }`}
    >
      <div className={`w-1 shrink-0 ${accentBar}`} aria-hidden />
      <div className="flex-1 min-w-0 px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <div className={`text-[12px] ${done ? 'line-through text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>
            {item.title}
          </div>
          <span className="shrink-0 font-mono text-[10px] text-[var(--text-muted)]">{item.time}</span>
        </div>
        {item.detail && (
          <div className="mt-1 text-[10px] text-[var(--text-muted)] leading-relaxed">{item.detail}</div>
        )}
        {item.duration_minutes != null && (
          <div className="mt-1 text-[10px] text-[var(--text-muted)]">{item.duration_minutes} min</div>
        )}
      </div>
    </div>
  );
}

/**
 * Status row — three honest, today-scoped reads. Everything here is
 * computed from the day's own log + plan + the profile; nothing
 * reaches for a rolling baseline or week trend, because the
 * dashboard only loads one day at a time. When multi-day history
 * lands (alongside plan generation) the hints can graduate to
 * "vs your baseline" framing — until then they say what they mean.
 */
function StatusRow({ plan, profile }: { plan: HealthDailyPlan | null; profile: HealthProfile | null }) {
  const readiness = useMemo(() => computeReadiness(profile, plan), [profile, plan]);
  const nutrition = useMemo(() => computeNutrition(profile, plan), [profile, plan]);
  const training = useMemo(() => computeTrainingLoad(plan), [plan]);
  return (
    <div className="grid grid-cols-3 gap-3">
      <StatusTile label="Readiness" value={readiness.value} hint={readiness.hint} />
      <StatusTile label="Nutrition" value={nutrition.value} hint={nutrition.hint} />
      <StatusTile label="Training load" value={training.value} hint={training.hint} />
    </div>
  );
}

interface StatusFigure { value: string; hint: string }

/**
 * Readiness — how rested + how you feel today, weighted 60/40
 * towards sleep. Measured against your own sleep target (from the
 * profile schedule), not a rolling baseline we don't have. Returns
 * a calm word band rather than a bare number.
 */
function computeReadiness(profile: HealthProfile | null, plan: HealthDailyPlan | null): StatusFigure {
  const sleep = plan?.log.sleep_hours ?? null;
  const mood = plan?.log.mood ?? null;
  if (sleep == null && mood == null) {
    return { value: '—', hint: 'Log sleep and mood to see this' };
  }
  const target = targetSleepHours(profile);
  let scoreSum = 0;
  let weightSum = 0;
  if (sleep != null) { scoreSum += Math.min(sleep / target, 1) * 0.6; weightSum += 0.6; }
  if (mood != null)  { scoreSum += (mood / 5) * 0.4;                   weightSum += 0.4; }
  const pct = Math.round((scoreSum / weightSum) * 100);
  const word = pct >= 80 ? 'Strong' : pct >= 60 ? 'Good' : pct >= 40 ? 'Fair' : 'Low';
  const bits: string[] = [];
  if (sleep != null) bits.push(`${formatHours(sleep)} of ${formatHours(target)} sleep`);
  if (mood != null)  bits.push(`mood ${mood}/5`);
  return { value: word, hint: bits.join(' · ') };
}

/**
 * Nutrition — meals logged today, with protein measured against a
 * goal-derived target (≈1.6–2.0 g/kg by primary goal). Calories are
 * shown as a raw total, not vs a target: a calorie target needs an
 * activity estimate the profile doesn't carry, so we don't fake one.
 */
function computeNutrition(profile: HealthProfile | null, plan: HealthDailyPlan | null): StatusFigure {
  const meals = plan?.log.meals ?? [];
  const water = plan?.log.water_ml ?? 0;
  if (meals.length === 0 && water === 0) {
    return { value: '—', hint: 'Log meals and water to see this' };
  }
  const protein = meals.reduce((a, m) => a + (m.protein_g ?? 0), 0);
  const kcal = meals.reduce((a, m) => a + (m.calories ?? 0), 0);
  const proteinTarget = proteinTargetG(profile);
  const value = meals.length > 0 ? `${meals.length} meal${meals.length === 1 ? '' : 's'}` : '—';
  const bits: string[] = [];
  if (protein > 0) {
    bits.push(proteinTarget != null
      ? `${Math.round(protein)} / ${proteinTarget} g protein`
      : `${Math.round(protein)} g protein`);
  }
  if (kcal > 0) bits.push(`${kcal} kcal`);
  bits.push(`${water} ml water`);
  return { value, hint: bits.join(' · ') };
}

/**
 * Training load — today's planned vs completed training, drawn
 * straight from the plan's workout + mobility items. No week trend:
 * the dashboard holds one day. An empty training set reads as an
 * honest rest day, not a blank.
 */
function computeTrainingLoad(plan: HealthDailyPlan | null): StatusFigure {
  const training = (plan?.items ?? []).filter(i => i.kind === 'workout' || i.kind === 'mobility');
  if (training.length === 0) {
    return { value: 'Rest day', hint: 'No training scheduled today' };
  }
  const doneItems = training.filter(i => i.status === 'done');
  const plannedMin = training.reduce((a, i) => a + (i.duration_minutes ?? 0), 0);
  const doneMin = doneItems.reduce((a, i) => a + (i.duration_minutes ?? 0), 0);
  if (plannedMin > 0) {
    return {
      value: `${doneMin}/${plannedMin} min`,
      hint: `${doneItems.length} of ${training.length} session${training.length === 1 ? '' : 's'} done`,
    };
  }
  return {
    value: `${doneItems.length}/${training.length}`,
    hint: `Session${training.length === 1 ? '' : 's'} done today`,
  };
}

/** Target sleep duration in hours from the profile's bedtime→wake
 *  window, wrapping past midnight. Falls back to 8h when unset. */
function targetSleepHours(profile: HealthProfile | null): number {
  const bed = parseHHMM(profile?.schedule.sleep_target.bedtime ?? null);
  const wake = parseHHMM(profile?.schedule.sleep_target.wake ?? null);
  if (bed == null || wake == null) return 8;
  let mins = wake - bed;
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
}

/** Daily protein target in grams — bodyweight × a goal-driven factor.
 *  Null when weight is unset (no honest target without it). */
function proteinTargetG(profile: HealthProfile | null): number | null {
  const kg = profile?.body.weight_kg;
  if (kg == null) return null;
  const goal = profile?.goals.primary;
  const factor =
    goal === 'muscle_gain' || goal === 'athletic' ? 2.0 :
    goal === 'fat_loss' ? 1.8 :
    1.6;
  return Math.round(kg * factor);
}

/** "HH:MM" → minutes since midnight, or null if malformed. */
function parseHHMM(s: string | null): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Compact hours label — "7.5h", "8h". */
function formatHours(h: number): string {
  return `${Number(h.toFixed(1))}h`;
}

function StatusTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-transparent px-3 py-3">
      <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 text-[18px] font-light text-[var(--text-primary)]">{value}</div>
      <div className="mt-1 text-[10px] text-[var(--text-muted)] leading-relaxed">{hint}</div>
    </div>
  );
}

/**
 * Quick log — meal / water / sleep / mood capture, no modal. Each
 * tile toggles a compact inline editor below the row; the tile label
 * reflects what's already logged so the row doubles as today's
 * at-a-glance log summary. Every action writes straight through to
 * the plan via the QuickLogApi.
 */
interface QuickLogApi {
  addWater: (ml: number) => void;
  resetWater: () => void;
  setSleep: (hours: number | null) => void;
  setMood: (mood: 1 | 2 | 3 | 4 | 5 | null) => void;
  addMeal: (meal: { description: string; calories: number | null; protein_g: number | null }) => void;
  removeMeal: (id: string) => void;
}

type QuickLogKind = 'meal' | 'water' | 'sleep' | 'mood';

const MOOD_FACE: Record<number, string> = { 1: '😔', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' };
const MOOD_LABEL: Record<number, string> = { 1: 'Drained', 2: 'Low', 3: 'Okay', 4: 'Good', 5: 'Thriving' };

function QuickLogRow({ plan, api }: { plan: HealthDailyPlan | null; api: QuickLogApi }) {
  const [open, setOpen] = useState<QuickLogKind | null>(null);
  const log = plan?.log;
  const meals = log?.meals ?? [];
  const water = log?.water_ml ?? 0;
  const sleep = log?.sleep_hours ?? null;
  const mood = log?.mood ?? null;
  const toggle = (k: QuickLogKind) => setOpen(o => (o === k ? null : k));

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <LogButton label={meals.length > 0 ? `Meals · ${meals.length}` : '+ Meal'} active={open === 'meal'} onClick={() => toggle('meal')} />
        <LogButton label={water > 0 ? `Water · ${formatWater(water)}` : '+ Water'} active={open === 'water'} onClick={() => toggle('water')} />
        <LogButton label={sleep != null ? `Sleep · ${formatHours(sleep)}` : '+ Sleep'} active={open === 'sleep'} onClick={() => toggle('sleep')} />
        <LogButton label={mood != null ? `Mood ${MOOD_FACE[mood]}` : '+ Mood'} active={open === 'mood'} onClick={() => toggle('mood')} />
      </div>

      {open && (
        <div className="mt-2 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/[0.04] px-4 py-3">
          {open === 'meal'  && <MealEditor meals={meals} onAdd={api.addMeal} onRemove={api.removeMeal} />}
          {open === 'water' && <WaterEditor water={water} onAdd={api.addWater} onReset={api.resetWater} />}
          {open === 'sleep' && <SleepEditor sleep={sleep} onSet={api.setSleep} />}
          {open === 'mood'  && <MoodEditor mood={mood} onSet={api.setMood} />}
        </div>
      )}
    </div>
  );
}

function LogButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-[12px] transition cursor-pointer ${
        active
          ? 'border-[var(--accent)]/60 bg-[var(--accent)]/10 text-[var(--accent)]'
          : 'border-[var(--border)] bg-transparent text-[var(--text-secondary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)]'
      }`}
    >
      {label}
    </button>
  );
}

function EditorChip({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
    >
      {children}
    </button>
  );
}

function WaterEditor({ water, onAdd, onReset }: { water: number; onAdd: (ml: number) => void; onReset: () => void }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-[var(--text-muted)]">Water today</span>
        <span className="text-[14px] font-light text-[var(--text-primary)]">{formatWater(water)}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <EditorChip onClick={() => onAdd(250)}>+ 250 ml</EditorChip>
        <EditorChip onClick={() => onAdd(500)}>+ 500 ml</EditorChip>
        <EditorChip onClick={() => onAdd(-250)} disabled={water <= 0}>− 250 ml</EditorChip>
        <EditorChip onClick={onReset} disabled={water <= 0}>Reset</EditorChip>
      </div>
    </div>
  );
}

function SleepEditor({ sleep, onSet }: { sleep: number | null; onSet: (h: number | null) => void }) {
  const current = sleep ?? 7.5;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-[var(--text-muted)]">Last night&apos;s sleep</span>
        <span className="text-[14px] font-light text-[var(--text-primary)]">
          {sleep != null ? formatHours(sleep) : 'Not logged'}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <EditorChip onClick={() => onSet(Math.max(0, round1(current - 0.5)))}>−30 min</EditorChip>
        <span className="min-w-[3.5rem] text-center text-[13px] text-[var(--text-primary)]">{formatHours(current)}</span>
        <EditorChip onClick={() => onSet(Math.min(14, round1(current + 0.5)))}>+30 min</EditorChip>
        {sleep != null && <EditorChip onClick={() => onSet(null)}>Clear</EditorChip>}
      </div>
    </div>
  );
}

function MoodEditor({ mood, onSet }: { mood: number | null; onSet: (m: 1 | 2 | 3 | 4 | 5 | null) => void }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-[var(--text-muted)]">How you feel today</span>
        {mood != null && (
          <button
            type="button"
            onClick={() => onSet(null)}
            className="border-none bg-transparent text-[10px] text-[var(--text-muted)] hover:text-[var(--accent)] transition cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>
      <div className="mt-2 flex gap-2">
        {([1, 2, 3, 4, 5] as const).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => onSet(m)}
            aria-label={MOOD_LABEL[m]}
            title={MOOD_LABEL[m]}
            className={`flex-1 rounded-lg border py-2 text-[18px] transition cursor-pointer ${
              mood === m
                ? 'border-[var(--accent)]/60 bg-[var(--accent)]/10'
                : 'border-[var(--border)] bg-transparent hover:border-[var(--accent)]/40'
            }`}
          >
            {MOOD_FACE[m]}
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
        <span>Drained</span>
        <span>Thriving</span>
      </div>
    </div>
  );
}

function MealEditor({ meals, onAdd, onRemove }: {
  meals: HealthDailyLog['meals'];
  onAdd: (m: { description: string; calories: number | null; protein_g: number | null }) => void;
  onRemove: (id: string) => void;
}) {
  const [desc, setDesc] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const canAdd = desc.trim().length > 0;
  const numOrNull = (s: string): number | null => {
    const n = Number(s.trim());
    return s.trim() && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  };
  const submit = () => {
    if (!canAdd) return;
    onAdd({ description: desc.trim(), calories: numOrNull(kcal), protein_g: numOrNull(protein) });
    setDesc('');
    setKcal('');
    setProtein('');
  };
  const fieldCls =
    'rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-3 py-1.5 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]/50 transition';

  return (
    <div>
      {meals.length > 0 && (
        <ul className="mb-3 space-y-1">
          {meals.map(m => (
            <li key={m.id} className="flex items-baseline justify-between gap-2 text-[12px]">
              <span className="min-w-0 truncate text-[var(--text-primary)]">
                <span className="font-mono text-[10px] text-[var(--text-muted)]">{m.time}</span>{' '}
                {m.description ?? 'Meal'}
              </span>
              <span className="flex shrink-0 items-baseline gap-2">
                {(m.calories != null || m.protein_g != null) && (
                  <span className="text-[10px] text-[var(--text-muted)]">
                    {[
                      m.calories != null ? `${m.calories} kcal` : null,
                      m.protein_g != null ? `${m.protein_g} g P` : null,
                    ].filter(Boolean).join(' · ')}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(m.id)}
                  aria-label="Remove meal"
                  className="border-none bg-transparent text-[var(--text-muted)] hover:text-red-300 transition cursor-pointer"
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-2">
        <input
          value={desc}
          onChange={e => setDesc(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          placeholder="What did you eat?"
          className={`w-full ${fieldCls}`}
        />
        <div className="flex gap-2">
          <input
            value={kcal}
            onChange={e => setKcal(e.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            inputMode="numeric"
            placeholder="kcal (optional)"
            className={`min-w-0 flex-1 ${fieldCls}`}
          />
          <input
            value={protein}
            onChange={e => setProtein(e.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            inputMode="numeric"
            placeholder="protein g (optional)"
            className={`min-w-0 flex-1 ${fieldCls}`}
          />
          <button
            type="button"
            onClick={submit}
            disabled={!canAdd}
            className="shrink-0 rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-1.5 text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

function WhyDrawer({ reasoning }: { reasoning: string | null }) {
  const [open, setOpen] = useState(false);
  if (!reasoning) return null;
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)] transition flex items-center gap-1"
      >
        <span>{open ? '▾' : '▸'}</span>
        <span>Why Ava chose this</span>
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-[var(--border)] bg-transparent px-4 py-3 text-[12px] text-[var(--text-secondary)] leading-relaxed">
          {reasoning}
        </div>
      )}
    </section>
  );
}

// ── Utilities ────────────────────────────────────────────────────────

/** A blank plan for a date — minted when the operator logs something
 *  before any plan exists, so the first log still has a home. */
function freshDailyPlan(date: string): HealthDailyPlan {
  return {
    schema_version: 1,
    date,
    morning_brief: null,
    brief_reasoning: null,
    items: [],
    log: { meals: [], water_ml: 0, sleep_hours: null, mood: null },
    updated_at: null,
  };
}

/** Stable id for a logged meal — UUID where available, else a short
 *  time-seeded fallback (webview crypto is normally present, but the
 *  fallback keeps logging working if it isn't). */
function logId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* fall through to fallback */ }
  return `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Current local time as "HH:MM" — stamps the moment a meal is logged. */
function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Water volume label — litres past 1 L, millilitres below. */
function formatWater(ml: number): string {
  if (ml >= 1000) return `${Number((ml / 1000).toFixed(1))} L`;
  return `${ml} ml`;
}

/** Round to one decimal — guards float drift on the 0.5h sleep steps. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function greetingFor(date: Date): string {
  const h = date.getHours();
  if (h < 5)  return 'Late night';
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  if (h < 21) return 'Evening';
  return 'Late evening';
}

function formatLongDate(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

function isProfileEmpty(p: HealthProfile | null): boolean {
  if (!p) return true;
  // Treat as empty when none of the load-bearing fields exist yet.
  const hasBody = p.body.height_cm != null || p.body.weight_kg != null || p.body.sex !== null;
  const hasGoal = p.goals.primary !== null;
  return !(hasBody || hasGoal);
}
