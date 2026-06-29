// Learner Progression — derives the honest, earned half of the learner profile
// from the existing LearningStore (~/.ava/learning.json). Pure + dependency-free:
// given the store, compute skills, certificates, achievements and stats. Nothing
// here is persisted as truth — it's recomputed from graded performance every load,
// which is exactly what keeps the credential honest (it can't be hand-edited).
//
// The editable half (bio, self-added skills/achievements) lives separately in
// learner.json; the host merges the two for the Progression page. Self-added
// skills carry source:'self' and "graduate" to verified when their name matches
// an earned subject here.

import type { LearningStore, Curriculum, Lesson } from '../tools/learning.js';

export type SkillLevel = 'novice' | 'familiar' | 'proficient' | 'mastered';

export interface DerivedSkill {
  /** Subject name (the skill). */
  name: string;
  level: SkillLevel;
  source: 'earned';
  /** Curriculum ids that contributed — the provenance ("what backs this"). */
  provenance: string[];
  lessonsMastered: number;
  lessonsTotal: number;
  /** Average best quiz score across graded lessons in this subject (null if none). */
  avgScore: number | null;
  /** Most recent practice (completed/reviewed/started), ISO, or null. */
  lastPracticed: string | null;
  /** True when it hasn't been practised in a while — nudge a refresh (honest about retention). */
  stale: boolean;
}

export interface DerivedCertificate {
  /** Curriculum id. */
  id: string;
  title: string;
  subject: string;
  level: string;
  completedAt: string | null;
  /** Average best score across graded lessons. */
  score: number;
  lessons: number;
  hours: number;
  /** Deterministic verify stamp — lets a local cert be checked if later shared. */
  hash: string;
}

export interface DerivedAchievement {
  id: string;
  title: string;
  detail?: string;
  source: 'earned';
  earnedAt: string | null;
  icon?: string;
}

export interface ProgressionStats {
  /** All enrolled courses (active + paused + completed) — the headline "courses" count. */
  coursesTotal: number;
  coursesCompleted: number;
  coursesActive: number;
  lessonsMastered: number;
  avgScore: number | null;
  totalHours: number;
  currentStreak: number;
  longestStreak: number;
  /** date (YYYY-MM-DD) -> activity count, for the contributions heatmap. */
  activity: Record<string, number>;
}

export interface LearnerProgression {
  skills: DerivedSkill[];
  certificates: DerivedCertificate[];
  achievements: DerivedAchievement[];
  stats: ProgressionStats;
}

/** Days without practice after which an earned skill is flagged stale. */
const STALE_DAYS = 30;

const allLessons = (c: Curriculum): Lesson[] => c.modules.flatMap((m) => m.lessons);
const isMastered = (l: Lesson): boolean => l.status === 'completed';
const dayOf = (iso: string | null | undefined): string | null => (iso ? iso.slice(0, 10) : null);

/** Most recent of completed_at / last_reviewed_at / started_at for a lesson. */
function lastTouch(l: Lesson): string | null {
  const dates = [l.completed_at, l.last_reviewed_at, l.started_at].filter(Boolean) as string[];
  if (!dates.length) return null;
  return dates.reduce((a, b) => (a > b ? a : b));
}

/** Stable, dependency-free djb2 hash → base36. A verify stamp, not a secret. */
function stampHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

/** Blend mastery ratio + avg score into an honest tier. Completion alone never
 *  reads as "mastered" if the scores are weak; strong scores nudge up a tier. */
function skillLevel(masteryRatio: number, avgScore: number | null): SkillLevel {
  let level: SkillLevel =
    masteryRatio >= 0.85 ? 'mastered'
    : masteryRatio >= 0.6 ? 'proficient'
    : masteryRatio >= 0.25 ? 'familiar'
    : 'novice';
  if (avgScore !== null) {
    if (level === 'mastered' && avgScore < 70) level = 'proficient'; // high completion, weak grades ≠ mastery
    else if (level === 'proficient' && avgScore >= 90 && masteryRatio >= 0.75) level = 'mastered';
  }
  return level;
}

function deriveSkills(curriculums: Curriculum[], now: number): DerivedSkill[] {
  // Group lessons by subject across all curriculums.
  const bySubject = new Map<string, { lessons: Lesson[]; provenance: Set<string> }>();
  for (const c of curriculums) {
    const subject = (c.subject || 'General').trim() || 'General';
    const entry = bySubject.get(subject) ?? { lessons: [], provenance: new Set<string>() };
    entry.lessons.push(...allLessons(c));
    entry.provenance.add(c.id);
    bySubject.set(subject, entry);
  }

  const skills: DerivedSkill[] = [];
  for (const [name, { lessons, provenance }] of bySubject) {
    const lessonsTotal = lessons.length;
    const lessonsMastered = lessons.filter(isMastered).length;
    if (lessonsMastered < 1 || lessonsTotal === 0) continue; // not a skill yet — just an active course
    const scores = lessons.map((l) => l.best_score).filter((s): s is number => s !== null && s !== undefined);
    const avgScore = avg(scores);
    const masteryRatio = lessonsMastered / lessonsTotal;
    const lastPracticed = lessons.map(lastTouch).filter(Boolean).sort().reverse()[0] ?? null;
    const stale = lastPracticed ? (now - new Date(lastPracticed).getTime()) / 86_400_000 > STALE_DAYS : false;
    skills.push({
      name,
      level: skillLevel(masteryRatio, avgScore),
      source: 'earned',
      provenance: [...provenance],
      lessonsMastered,
      lessonsTotal,
      avgScore,
      lastPracticed,
      stale,
    });
  }
  // Strongest first.
  const order: SkillLevel[] = ['mastered', 'proficient', 'familiar', 'novice'];
  return skills.sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level) || b.lessonsMastered - a.lessonsMastered);
}

function deriveCertificates(curriculums: Curriculum[]): DerivedCertificate[] {
  return curriculums
    .filter((c) => c.status === 'completed')
    .map((c) => {
      const lessons = allLessons(c);
      const scores = lessons.map((l) => l.best_score).filter((s): s is number => s !== null && s !== undefined);
      const score = avg(scores) ?? 0;
      const totalMinutes = lessons.reduce((s, l) => s + (l.time_spent_minutes || 0), 0);
      return {
        id: c.id,
        title: c.title,
        subject: c.subject,
        level: c.level,
        completedAt: c.completed_at,
        score,
        lessons: lessons.length,
        hours: Math.round((totalMinutes / 60) * 10) / 10,
        hash: stampHash(`${c.id}|${c.completed_at ?? ''}|${score}`),
      };
    })
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
}

function deriveAchievements(curriculums: Curriculum[], store: LearningStore, lessonsMastered: number): DerivedAchievement[] {
  const out: DerivedAchievement[] = [];
  const completed = curriculums.filter((c) => c.status === 'completed');

  // Per completed course.
  for (const c of completed) {
    out.push({ id: `course:${c.id}`, title: `Completed “${c.title}”`, detail: c.subject, source: 'earned', earnedAt: c.completed_at, icon: '🎓' });
  }
  // First-course milestone.
  if (completed.length >= 1) {
    const first = [...completed].sort((a, b) => (a.completed_at ?? '').localeCompare(b.completed_at ?? ''))[0];
    out.push({ id: 'first-course', title: 'First course completed', source: 'earned', earnedAt: first?.completed_at ?? null, icon: '🌱' });
  }
  // Lessons-mastered tiers.
  for (const tier of [100, 50, 10]) {
    if (lessonsMastered >= tier) { out.push({ id: `lessons:${tier}`, title: `${tier} lessons mastered`, source: 'earned', earnedAt: null, icon: '📚' }); break; }
  }
  // Streak badges (from the highest reached).
  for (const tier of [100, 30, 7]) {
    if (store.streaks.longest >= tier) { out.push({ id: `streak:${tier}`, title: `${tier}-day learning streak`, source: 'earned', earnedAt: null, icon: '🔥' }); break; }
  }
  return out;
}

function deriveStats(curriculums: Curriculum[], store: LearningStore): ProgressionStats {
  const lessons = curriculums.flatMap(allLessons);
  const lessonsMastered = lessons.filter(isMastered).length;
  const scores = lessons.map((l) => l.best_score).filter((s): s is number => s !== null && s !== undefined);
  const totalMinutes = lessons.reduce((s, l) => s + (l.time_spent_minutes || 0), 0);

  // Activity heatmap — count practice events per day.
  const activity: Record<string, number> = {};
  for (const l of lessons) {
    for (const d of [dayOf(l.completed_at), dayOf(l.last_reviewed_at)]) {
      if (d) activity[d] = (activity[d] ?? 0) + 1;
    }
  }

  return {
    coursesTotal: curriculums.length,
    coursesCompleted: curriculums.filter((c) => c.status === 'completed').length,
    coursesActive: curriculums.filter((c) => c.status === 'active').length,
    lessonsMastered,
    avgScore: avg(scores),
    totalHours: Math.round((totalMinutes / 60) * 10) / 10,
    currentStreak: store.streaks.current,
    longestStreak: store.streaks.longest,
    activity,
  };
}

/**
 * Derive the earned half of the learner profile from the LearningStore.
 * `nowMs` is injectable for deterministic tests (defaults to Date.now()).
 */
export function deriveProgression(store: LearningStore, nowMs?: number): LearnerProgression {
  const now = nowMs ?? Date.now();
  const curriculums = store.curriculums ?? [];
  const stats = deriveStats(curriculums, store);
  return {
    skills: deriveSkills(curriculums, now),
    certificates: deriveCertificates(curriculums),
    achievements: deriveAchievements(curriculums, store, stats.lessonsMastered),
    stats,
  };
}
