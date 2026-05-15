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
  const hasPlan = (plan?.items?.length ?? 0) > 0;

  // Suppress unused-state warning until the why-drawer + quick-log
  // wiring lands in the follow-up commits — the handlers are defined
  // here so the prop API is locked from the start.
  void onSavePlan;
  void hasPlan;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 space-y-8">
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

      {/* If the profile is empty there's nothing for Ava to read,
          so the dashboard prompts setup instead of guessing. */}
      {profileEmpty && (
        <ProfileEmptyState />
      )}

      {/* Section 1 — morning brief */}
      <Section title="Today's brief">
        <BriefBlock
          plan={plan}
          profileEmpty={profileEmpty}
          generating={briefGenerating}
          error={briefError}
          onGenerate={() => onGenerateMorningBrief(today)}
        />
      </Section>

      {/* Section 2 — timeline */}
      <Section title="Today">
        <TimelineBlock plan={plan} />
      </Section>

      {/* Section 3 — status glance */}
      <Section title="Where you are">
        <StatusRow plan={plan} />
      </Section>

      {/* Section 4 — quick log */}
      <Section title="Quick log">
        <QuickLogRow plan={plan} />
      </Section>

      {/* Section 5 — why drawer (collapsible) */}
      <WhyDrawer reasoning={plan?.brief_reasoning ?? null} />

      <footer className="pt-4 text-[10px] text-[var(--text-muted)]">
        Local-first — your health data stays on this machine unless you switch on sync in the Sync tab. {today}
      </footer>
    </div>
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

function TimelineBlock({ plan }: { plan: HealthDailyPlan | null }) {
  const items = plan?.items ?? [];
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-transparent px-4 py-5 text-[12px] text-[var(--text-muted)] italic leading-relaxed">
        No plan for today yet. When the planner ships, this is where mobility, meals, training, and wind-down sit in time order.
      </div>
    );
  }
  return (
    <ol className="space-y-2">
      {items.map(item => (
        <li
          key={item.id}
          className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 transition ${
            item.status === 'done'
              ? 'border-[var(--border)] bg-[var(--accent)]/5'
              : item.status === 'skipped'
                ? 'border-[var(--border)] bg-transparent opacity-60'
                : 'border-[var(--border)] bg-transparent hover:border-[var(--accent)]/40'
          }`}
        >
          <span className="mt-0.5 shrink-0 font-mono text-[11px] text-[var(--text-muted)] w-12">{item.time}</span>
          <KindBadge kind={item.kind} />
          <div className="flex-1 min-w-0">
            <div className={`text-[12px] ${item.status === 'done' ? 'line-through text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>
              {item.title}
            </div>
            {item.detail && (
              <div className="mt-0.5 text-[10px] text-[var(--text-muted)] leading-relaxed">{item.detail}</div>
            )}
          </div>
          {item.duration_minutes != null && (
            <span className="shrink-0 text-[10px] text-[var(--text-muted)]">{item.duration_minutes}m</span>
          )}
        </li>
      ))}
    </ol>
  );
}

function KindBadge({ kind }: { kind: HealthDailyPlan['items'][number]['kind'] }) {
  const styles: Record<typeof kind, { label: string; cls: string }> = {
    mobility: { label: 'Mobility',  cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' },
    meal:     { label: 'Meal',      cls: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
    workout:  { label: 'Train',     cls: 'bg-[var(--accent)]/15 text-[var(--accent)] border-[var(--accent)]/30' },
    rest:     { label: 'Rest',      cls: 'bg-slate-500/10 text-slate-300 border-slate-500/30' },
    sleep:    { label: 'Sleep',     cls: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30' },
    note:     { label: 'Note',      cls: 'bg-[var(--border)]/40 text-[var(--text-muted)] border-[var(--border)]' },
  };
  const s = styles[kind];
  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-wider ${s.cls}`}>
      {s.label}
    </span>
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
