/**
 * The profile index and the lookup's detail (plan: Decisions/plans/2026-11-27-profile-index.md).
 *
 * His idea, 27 Nov 2026: "think of the human brain … we only call on certain
 * things that are relevant to what we are doing". So Ava keeps a SHORT index
 * of the person in view everywhere, about one line per area, and pulls the
 * detail with profile_lookup only when the conversation makes it relevant.
 *
 * Built from the rooms' own data each time, never remembered, so it cannot
 * miss anything or go stale, and it costs no model call. Pure: no node
 * built-ins (sources.ts reads the files).
 */

import { formatLearnerContext } from '../learning/learner-context.js';
import { deriveProgression } from '../learning/progression.js';
import { summariseTrainingLog } from '../health/session-summary.js';
import { planDayDate } from '../health/for-you.js';
import type { HealthPlanDay, HealthPlanRecord } from '../health/types.js';
import { healthPlansSummary, healthProfileLines } from './health-text.js';
import { PROFILE_SECTIONS, type ProfileSection, type ProfileSources } from './types.js';

/** A hard ceiling per index line, so one long course title can't swell the prompt. */
const LINE_MAX = 220;
const clip = (s: string) => (s.length > LINE_MAX ? `${s.slice(0, LINE_MAX - 1)}…` : s);
const pretty = (s: unknown) => String(s ?? '').replace(/_/g, ' ').trim();

/** "today", "yesterday", "3 days ago", or the date. */
export function relativeDay(date: string, today: string): string {
  const d = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) / 86_400_000);
  if (Number.isNaN(d)) return date;
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d > 1 && d < 14) return `${d} days ago`;
  return date;
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Each running plan's day for a date, if it has one. */
function planDaysOn(plans: HealthPlanRecord[], date: string): Array<{ plan: HealthPlanRecord; day: HealthPlanDay }> {
  const out: Array<{ plan: HealthPlanRecord; day: HealthPlanDay }> = [];
  for (const plan of plans) {
    if (!plan.start_date || plan.status === 'archived' || !Array.isArray(plan.days)) continue;
    const day = plan.days.find((d) => planDayDate(plan.start_date!, d.day_index) === date);
    if (day) out.push({ plan, day });
  }
  return out;
}

const sessionOn = (plans: HealthPlanRecord[], date: string) => planDaysOn(plans, date).find((x) => x.day.training?.length);
const mealsOn = (plans: HealthPlanRecord[], date: string) => planDaysOn(plans, date).find((x) => x.day.meals?.length);

// ── The index ────────────────────────────────────────────────────────────────

function learningLine(s: ProfileSources): string | null {
  const store = s.learning.store;
  if (!store?.curriculums?.length) return null;
  const active = store.curriculums.find((c) => c.status === 'active');
  const done = store.curriculums.filter((c) => c.status === 'completed').length;
  const bits: string[] = [];
  if (active) {
    const mod = active.modules?.find((m) => m.status === 'in_progress' || m.status === 'available');
    bits.push(`${active.title}${mod ? `, on "${mod.title}"` : ''} (${Math.round(active.progress_percent ?? 0)}% done)`);
  }
  if (done) bits.push(`${done} course${done === 1 ? '' : 's'} finished`);
  const { skills } = deriveProgression(store);
  // Earned skills only (graded lessons), with their level: "strongest" would
  // overclaim for someone one course in.
  const top = skills.filter((k) => k.level === 'mastered' || k.level === 'proficient').slice(0, 2).map((k) => `${k.name} (${k.level})`);
  if (top.length) bits.push(`skills: ${top.join(', ')}`);
  return bits.length ? `Studying: ${bits.join('; ')}` : null;
}

function trainingLine(s: ProfileSources, today: string): string | null {
  const p = s.health;
  const bits: string[] = [];
  if (p?.goals?.primary) bits.push(pretty(p.goals.primary));
  const tr = p?.training;
  if (tr?.days_per_week) bits.push(`${tr.days_per_week} days a week${tr.training_days?.length ? ` (${tr.training_days.join(', ')})` : ''}`);
  const now = sessionOn(s.plans, today);
  const next = sessionOn(s.plans, addDays(today, 1));
  if (now) bits.push(`today: ${now.day.title || 'training'}`);
  if (next) bits.push(`tomorrow: ${next.day.title || 'training'}`);
  if (p?.constraints?.injuries?.length) bits.push('injury notes on file');
  const last = s.sessions[0];
  if (last?.date) bits.push(`last logged session ${relativeDay(String(last.date).slice(0, 10), today)}`);
  return bits.length ? `Training: ${bits.join('; ')}` : null;
}

function eatingLine(s: ProfileSources, today: string): string | null {
  const p = s.health;
  const bits: string[] = [];
  if (p?.constraints?.dietary?.length) bits.push(p.constraints.dietary.map(pretty).join(', '));
  if (p?.constraints?.allergens?.length) bits.push('allergies on file');
  const meals = mealsOn(s.plans, today);
  if (meals) {
    bits.push(`plan "${meals.plan.title}" running`);
    const dinner = meals.day.meals.find((m) => m.slot === 'dinner');
    if (dinner) bits.push(`tonight: ${dinner.name}`);
  } else {
    const mealPlan = s.plans.find((x) => (x.type === 'meal' || x.type === 'combined') && x.status === 'active');
    if (mealPlan) bits.push(`plan "${mealPlan.title}"`);
  }
  if (p?.food?.dislikes?.length) bits.push('dislikes on file');
  return bits.length ? `Eating: ${bits.join('; ')}` : null;
}

function projectsLine(s: ProfileSources, today: string): string | null {
  if (!s.projects.length) return null;
  return `Building: ${s.projects.slice(0, 4).map((p) => `${p.name} (${relativeDay(p.date, today)})`).join(', ')}`;
}

/**
 * The index: one line per area that has anything, and only for areas the
 * person lets Ava see everywhere. Undefined when there is nothing to say.
 */
export function buildProfileIndex(s: ProfileSources, today: string): string | undefined {
  const lines = profileIndexLines(s, today);
  const shown = PROFILE_SECTIONS.filter((sec) => lines[sec] && s.visibility[sec] !== 'room').map((sec) => lines[sec]!);
  return shown.length ? shown.join('\n') : undefined;
}

/** Each area's index line (null when nothing is recorded), whatever its visibility. */
export function profileIndexLines(s: ProfileSources, today: string): Record<ProfileSection, string | null> {
  const c = (l: string | null) => (l ? clip(l) : null);
  return {
    learning: c(learningLine(s)),
    training: c(trainingLine(s, today)),
    eating: c(eatingLine(s, today)),
    projects: c(projectsLine(s, today)),
  };
}

/** One area as the Profile page shows it: the line in her index, and what a lookup returns. */
export interface ProfileOverviewSection {
  section: ProfileSection;
  /** The index line, or null when nothing is recorded. */
  line: string | null;
  /** What profile_lookup returns for it, as if the section were visible. */
  detail: string;
  visibility: 'everywhere' | 'room';
}

/**
 * The Profile page's read-out: exactly what Ava sees, so nothing she knows is
 * hidden from the person. The detail ignores the switch on purpose, so the
 * page can show what turning a section back on would share.
 */
export function profileOverview(s: ProfileSources, today: string): ProfileOverviewSection[] {
  const lines = profileIndexLines(s, today);
  const open: ProfileSources = { ...s, visibility: { learning: 'everywhere', training: 'everywhere', eating: 'everywhere', projects: 'everywhere' } };
  return PROFILE_SECTIONS.map((section) => ({
    section,
    line: lines[section],
    detail: profileSectionText(section, open, today),
    visibility: s.visibility[section],
  }));
}

/**
 * The index as it sits in the system prompt, with how to use it. `lookup`
 * false is for a surface that has no profile_lookup yet (the hub, until its
 * round trip is built): the index is then all there is, used as background.
 */
export function profileIndexBlock(index: string, opts: { lookup?: boolean } = {}): string {
  if (opts.lookup === false) {
    return `<profile-index>\n${index}\n</profile-index>\n` +
      'That is a short index of their life. It is background, not a topic. Use it when the conversation touches ' +
      'one of these areas (food or cooking, training, energy or rest, what they are learning, a project they name). ' +
      'Otherwise leave it alone: do not bring it up in a task that has nothing to do with it.';
  }
  // Spelled out per area, 28 Nov: smaller models (Mistral Small 4, Qwen3 Coder
  // Flash, Nemotron Lightning) read the general wording as optional, then asked
  // the person for what the lookup holds or answered from the headline alone.
  return `<profile-index>\n${index}\n</profile-index>\n` +
    'Those are headlines only; the detail is in profile_lookup. Call it BEFORE you answer when the message is about:\n' +
    '- eating: food, meals, cooking, snacks, groceries, a shopping list\n' +
    '- training: workouts, exercise, being tired or low on energy, soreness, pain or an injury\n' +
    '- learning: their course, a lesson, what to study next\n' +
    '- projects: a project they name, or what they were working on\n' +
    'Look before you ask them anything it could answer, and answer from what it returns. ' +
    'For anything else, do not call it and do not mention the index.';
}

// ── The detail, for profile_lookup ──────────────────────────────────────────

function exerciseText(x: HealthPlanDay['training'][number]): string {
  const dose = [x.sets != null && x.reps ? `${x.sets}×${x.reps}` : x.reps || (x.sets != null ? `${x.sets} sets` : null), x.weight].filter(Boolean).join(' at ');
  return `${x.name}${dose ? `: ${dose}` : ''}${x.notes ? ` (${x.notes})` : ''}`;
}

function mealText(m: HealthPlanDay['meals'][number]): string {
  const facts = [m.calories != null ? `${m.calories} kcal` : null, m.protein_g != null ? `${m.protein_g} g protein` : null, m.cook_time_minutes != null ? `${m.cook_time_minutes} min` : null].filter(Boolean);
  const logged = m.logged ? `; logged: ${m.logged.state}${m.logged.note ? `, ${m.logged.note}` : ''}` : '';
  return `${m.slot}: ${m.name}${facts.length ? ` (${facts.join(', ')})` : ''}${logged}`;
}

function trainingDetail(s: ProfileSources, today: string): string {
  const parts: string[] = [];
  const lines = healthProfileLines(s.health, s.general).filter((l) => l.tag !== 'eating').map((l) => l.text);
  if (lines.length) parts.push(`Profile:\n${lines.join('\n')}`);
  for (const [label, date] of [['Today', today], ['Tomorrow', addDays(today, 1)]] as const) {
    const x = sessionOn(s.plans, date);
    if (x) parts.push(`${label} (${date}), from "${x.plan.title}": ${x.day.title || 'training'}\n${x.day.training.map((e) => `- ${exerciseText(e)}`).join('\n')}${x.day.notes ? `\nNotes: ${x.day.notes}` : ''}`);
  }
  const plans = healthPlansSummary(s.plans.filter((p) => p.type !== 'meal'));
  if (plans) parts.push(`Plans:\n${plans}`);
  const log = summariseTrainingLog(s.sessions, today);
  if (log) parts.push(`What they actually did (training log):\n${log}`);
  return parts.length ? parts.join('\n\n') : 'Nothing about training is recorded yet.';
}

function eatingDetail(s: ProfileSources, today: string): string {
  const parts: string[] = [];
  const lines = healthProfileLines(s.health, s.general).filter((l) => l.tag === 'eating' || l.tag === 'goal').map((l) => l.text);
  if (lines.length) parts.push(`Profile:\n${lines.join('\n')}`);
  for (const [label, date] of [['Today', today], ['Tomorrow', addDays(today, 1)]] as const) {
    const x = mealsOn(s.plans, date);
    if (x) parts.push(`${label} (${date}), from "${x.plan.title}":\n${x.day.meals.map((m) => `- ${mealText(m)}`).join('\n')}`);
  }
  const plans = healthPlansSummary(s.plans.filter((p) => p.type !== 'fitness'));
  if (plans) parts.push(`Plans:\n${plans}`);
  return parts.length ? parts.join('\n\n') : 'Nothing about eating is recorded yet.';
}

function projectsDetail(s: ProfileSources, today: string): string {
  if (!s.projects.length) return 'No project work is recorded in memory yet.';
  return s.projects.map((p) => `${p.name}, last worked on ${relativeDay(p.date, today)} (${p.date}):\n${p.lines.slice(0, 6).map((l) => `- ${l.replace(/^[-*]\s*/, '')}`).join('\n') || '- (nothing noted)'}`).join('\n\n');
}

/** The full picture for one section, as profile_lookup returns it. */
export function profileSectionText(section: ProfileSection, s: ProfileSources, today: string): string {
  if (!PROFILE_SECTIONS.includes(section)) return `Unknown section "${section}". Use one of: ${PROFILE_SECTIONS.join(', ')}.`;
  if (s.visibility[section] === 'room') {
    return `They keep their ${section} to its own room, so it is not shown here. If it matters, suggest they open that room.`;
  }
  switch (section) {
    case 'learning': return formatLearnerContext(s.learning.store ?? { curriculums: [], streaks: { current: 0, longest: 0, lastActiveDate: null } }, s.learning.selfSkills) ?? 'No courses or skills are recorded yet.';
    case 'training': return trainingDetail(s, today);
    case 'eating': return eatingDetail(s, today);
    case 'projects': return projectsDetail(s, today);
  }
}
