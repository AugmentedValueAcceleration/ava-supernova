import { useMemo, useState } from 'react';
import type { HealthDailyPlan, HealthProfile } from '../types/messages';

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
}

export function HealthDashboard({ profile, plan, onSavePlan, onGenerateMorningBrief, briefGenerating, briefError }: Props) {
  const today = todayIso();
  const greeting = useMemo(() => greetingFor(new Date()), []);
  const profileEmpty = useMemo(() => isProfileEmpty(profile), [profile]);

  // onSavePlan reserved for the quick-log + plan-edit wiring in
  // follow-up commits — the prop API is locked from the start.
  void onSavePlan;

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
          <ProfileEmptyState />
        </div>
      )}

      {/* ── Overview — the synthesis ──────────────────────────────── */}
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
          </Section>

          <Section title="Where you are">
            <StatusRow plan={plan} />
          </Section>

          <Section title="Quick log">
            <QuickLogRow plan={plan} />
          </Section>

          <WhyDrawer reasoning={plan?.brief_reasoning ?? null} />
        </div>
      )}

      {/* ── Plans — the content: today's meals + training ─────────── */}
      {innerTab === 'plans' && (
        <div className="space-y-8">
          <PlansView plan={plan} />
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

function ProfileEmptyState() {
  return (
    <div className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-4 py-3 text-[12px] text-[var(--text-secondary)] leading-relaxed">
      Set up your <strong>Profile</strong> on the Health & Nutrition page first — Ava reads it to draft your daily plan and brief. Body stats, goals, constraints, and your schedule.
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
 * Plans tab — today's content, split into meals and training.
 * Each is a strip of rich cards rather than a plain timeline.
 * Empty states are deliberate "rest" treatments, not blanks.
 *
 * Plan generation isn't built yet, so the live data path is here
 * but the empty states carry the surface for now. When plans land,
 * the meal cards will pull recipe hero images + macros and the
 * training cards will pull the equipment-still-life imagery.
 */
function PlansView({ plan }: { plan: HealthDailyPlan | null }) {
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

function StatusRow({ plan }: { plan: HealthDailyPlan | null }) {
  // Placeholder for the readiness / nutrition / load triplet. Real
  // calculation lands in the status-row todo; rendering empty
  // figures now so the layout is visible.
  const water_ml = plan?.log?.water_ml ?? 0;
  const meals = plan?.log?.meals?.length ?? 0;
  return (
    <div className="grid grid-cols-3 gap-3">
      <StatusTile label="Readiness" value="—" hint="Sleep + recovery vs your baseline" />
      <StatusTile label="Nutrition" value={meals > 0 ? `${meals} meals` : '—'} hint={`${water_ml} ml water today`} />
      <StatusTile label="Training load" value="—" hint="This week's volume vs trend" />
    </div>
  );
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

function QuickLogRow({ plan }: { plan: HealthDailyPlan | null }) {
  // Placeholder — visible affordances now, wired in the quick-log
  // commit. Each button is one-tap with no modal.
  void plan;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <LogButton label="+ Meal" disabled />
      <LogButton label="+ Water" disabled />
      <LogButton label="+ Sleep" disabled />
      <LogButton label="+ Mood" disabled />
    </div>
  );
}

function LogButton({ label, disabled }: { label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-[12px] text-[var(--text-secondary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)] disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {label}
    </button>
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
