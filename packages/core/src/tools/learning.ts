import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

/**
 * Learning tools — Ava creates, teaches, and tracks learning paths through conversation.
 * Data is stored locally in ~/.ava/learning.json and synced to platform when connected.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface QuizQuestion {
  question: string;
  options?: string[];
  correct_answer: string;
  user_answer?: string;
  is_correct?: boolean;
  explanation?: string;
}

/**
 * A single interactive step in a lesson — the Brilliant-style atom: teach a
 * bite, the learner does something, Ava checks it live, then advances. This is
 * the teach→do→check loop that replaces the old read-then-test model (a
 * `content` blob + `quiz_questions` at the end).
 *
 * `interaction.evaluation` is the agent-native part: for open input
 * (free_text / code) there is no single right answer, so Ava grades the
 * learner's *actual* attempt against the rubric — e.g. "did they write a prompt
 * with context + task + constraint, for a real situation of their own?". That
 * live grading of novel input is what Brilliant's fixed widgets can't do, and
 * what makes "a tutor for whatever you wish to learn" hold.
 */
export interface LessonStep {
  id: string;
  /** The bite Ava presents before the learner acts — short concept, markdown. */
  teach: string;
  interaction: {
    kind: 'choice' | 'free_text' | 'code' | 'predict';
    /** What Ava asks the learner to do. */
    prompt: string;
    /** For 'choice' — the options shown. */
    options?: string[];
    /** Canonical answer for a deterministic check (choice / predict). */
    answer?: string;
    /** Rubric/intent for Ava to grade OPEN input (free_text / code), where
     *  there is no single right answer. The agent reads the learner's real
     *  attempt against this. */
    evaluation?: string;
    /** Starter code for 'code' interactions (real sandbox execution). */
    starter?: string;
  };
  /** Deterministic feedback for choice / predict checks. */
  feedback?: { correct: string; incorrect: string };
  // ── Per-step progress ──
  status: 'not_started' | 'attempted' | 'mastered';
  attempts: number;
  /** The learner's last typed answer / code — for resume + spaced recall. */
  last_attempt: string | null;
}

export interface Lesson {
  id: string;
  title: string;
  content: string | null;
  // Brilliant-style interactive steps — the teach→do→check loop. When present
  // these supersede `content` + `quiz_questions` (the legacy read-then-test
  // shape). Optional for backward-compat: legacy lessons keep content + quiz;
  // new and re-authored lessons use steps. Delivery runs steps when set, and
  // falls back to content/quiz when not.
  steps?: LessonStep[];
  type: 'concept' | 'exercise' | 'project' | 'quiz' | 'recap' | 'challenge';
  status: 'not_started' | 'in_progress' | 'completed' | 'needs_review';
  difficulty: 'easy' | 'medium' | 'hard';
  estimated_minutes: number | null;
  learning_objectives: string[];
  prerequisites: string[];
  resources: Array<{ title: string; url?: string; type: 'doc' | 'video' | 'article' | 'tool' }>;
  quiz_questions: QuizQuestion[];
  score: number | null;
  attempts: number;
  best_score: number | null;
  ava_feedback: string | null;
  completed_at: string | null;
  last_reviewed_at: string | null;
  review_count: number;
  tags: string[];
  // v0.18 — Time tracking
  time_spent_minutes: number;
  started_at: string | null;
}

export interface Milestone {
  title: string;
  at_percent: number;
  reached: boolean;
  reached_at: string | null;
}

export interface Module {
  id: string;
  title: string;
  description: string | null;
  status: 'locked' | 'available' | 'in_progress' | 'completed';
  progress_percent: number;
  estimated_minutes: number | null;
  learning_objectives: string[];
  lessons: Lesson[];
}

export interface Curriculum {
  id: string;
  title: string;
  description: string | null;
  subject: string;
  level: string;
  goal: string | null;
  estimated_hours: number | null;
  status: 'active' | 'completed' | 'paused';
  progress_percent: number;
  modules: Module[];
  tags: string[];
  created_at: string;
  updated_at: string;
  // v0.18 — Enhanced fields
  completed_at: string | null;
  adaptive_level: 'easy' | 'medium' | 'hard' | null;
  milestones: Milestone[];
  curriculum_learning_objectives: string[];
  curriculum_prerequisites: string;
  target_audience: string;
}

export interface LearningStore {
  curriculums: Curriculum[];
  // v0.18 — Learning streaks
  streaks: {
    current: number;
    longest: number;
    lastActiveDate: string | null;
  };
}

// ── Storage helpers ──────────────────────────────────────────────────

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const LEARNING_FILENAME = 'learning.json';

const DEFAULT_MILESTONES: Milestone[] = [
  { title: 'Quarter way!', at_percent: 25, reached: false, reached_at: null },
  { title: 'Halfway!', at_percent: 50, reached: false, reached_at: null },
  { title: 'Almost there!', at_percent: 75, reached: false, reached_at: null },
  { title: 'Complete!', at_percent: 100, reached: false, reached_at: null },
];

async function loadStore(globalDir: string): Promise<LearningStore> {
  try {
    const raw = await readFile(join(globalDir, LEARNING_FILENAME), 'utf-8');
    const store = JSON.parse(raw) as LearningStore;
    // Migrate: add streaks if missing
    if (!store.streaks) store.streaks = { current: 0, longest: 0, lastActiveDate: null };
    // Migrate: add new fields to existing curriculums
    for (const c of store.curriculums) {
      if (!c.completed_at) c.completed_at = c.status === 'completed' ? c.updated_at : null;
      if (!c.adaptive_level) c.adaptive_level = null;
      if (!c.milestones) c.milestones = DEFAULT_MILESTONES.map(m => ({ ...m }));
      if (!c.curriculum_learning_objectives) c.curriculum_learning_objectives = [];
      if (!c.curriculum_prerequisites) c.curriculum_prerequisites = '';
      if (!c.target_audience) c.target_audience = '';
      for (const mod of c.modules) {
        for (const l of mod.lessons) {
          if (l.time_spent_minutes === undefined) l.time_spent_minutes = 0;
          if (l.started_at === undefined) l.started_at = null;
        }
      }
    }
    return store;
  } catch {
    return { curriculums: [], streaks: { current: 0, longest: 0, lastActiveDate: null } };
  }
}

async function saveStore(globalDir: string, store: LearningStore): Promise<void> {
  await mkdir(globalDir, { recursive: true });
  await writeFile(join(globalDir, LEARNING_FILENAME), JSON.stringify(store, null, 2), 'utf-8');
}

/**
 * Save the learning store locally, then (if Data Mode allows and the user
 * is signed in to the platform) fire an idempotent sync to the cloud so
 * the same curriculums appear on other devices and in the web dashboard.
 *
 * Local-first is sacred: the local write always happens first and its
 * errors surface. The cloud push is fire-and-forget — a failed sync
 * never rolls back the on-disk copy.
 *
 * Gated on two pieces of sharedState wired by the extension host:
 *   - platformKey        — user is signed in
 *   - learningLocalOnly  — Data Mode toggle resolved to local (or the
 *                          user turned off learning sync specifically)
 *
 * When either is missing or localOnly is truthy, we skip cloud entirely
 * — matches how Memory / Tasks / Journal behave.
 */
async function persist(
  globalDir: string,
  store: LearningStore,
  _context: ToolExecutionContext,
): Promise<void> {
  // Learning is LOCAL-ONLY by design — the user's curriculums + progress live
  // only in ~/.ava/learning.json and never leave the device. No cloud push:
  // local-first is sacred here, and cloud storage of user data is being sunset.
  // (Previously this POSTed the full store to /api/learning/sync for signed-in
  // users — removed; that contradicted "local only" and left orphaned cloud
  // copies that re-appeared after a local delete.)
  await saveStore(globalDir, store);
}

function generateId(): string {
  return crypto.randomUUID();
}

function recalculateProgress(curriculum: Curriculum): void {
  for (const mod of curriculum.modules) {
    if (mod.lessons.length === 0) continue;
    const completed = mod.lessons.filter(l => l.status === 'completed').length;
    mod.progress_percent = Math.round((completed / mod.lessons.length) * 100);
    mod.status = mod.progress_percent === 100 ? 'completed'
      : completed > 0 || mod.lessons.some(l => l.status === 'in_progress') ? 'in_progress'
      : mod.status === 'locked' ? 'locked' : 'available';

    // Recalculate module estimated time from lessons
    const lessonsWithTime = mod.lessons.filter(l => l.estimated_minutes);
    if (lessonsWithTime.length > 0) {
      mod.estimated_minutes = lessonsWithTime.reduce((sum, l) => sum + (l.estimated_minutes || 0), 0);
    }
  }

  if (curriculum.modules.length === 0) return;
  curriculum.progress_percent = Math.round(
    curriculum.modules.reduce((sum, m) => sum + m.progress_percent, 0) / curriculum.modules.length
  );
  curriculum.status = curriculum.progress_percent === 100 ? 'completed' : 'active';

  // Unlock next module when current completes — but only if the gate
  // quiz (if present) has been passed. A module whose final lesson is a
  // quiz uses that quiz as the unlock gate; a passing score (≥70) is
  // required before the next module becomes available. Modules without
  // a final quiz unlock on lesson-completion alone, as before.
  for (let i = 0; i < curriculum.modules.length - 1; i++) {
    const current = curriculum.modules[i];
    const next = curriculum.modules[i + 1];
    if (current.status !== 'completed' || next.status !== 'locked') continue;

    const lastLesson = current.lessons[current.lessons.length - 1];
    const hasGateQuiz = lastLesson && lastLesson.type === 'quiz';
    if (hasGateQuiz && (lastLesson.best_score ?? 0) < 70) {
      // Final quiz exists but hasn't been passed at threshold — keep the
      // next module locked. The learner needs to retry the quiz first.
      continue;
    }
    next.status = 'available';
  }
}

/** Check milestones and return any newly reached ones */
function checkMilestones(curriculum: Curriculum): string[] {
  const reached: string[] = [];
  for (const m of curriculum.milestones) {
    if (!m.reached && curriculum.progress_percent >= m.at_percent) {
      m.reached = true;
      m.reached_at = new Date().toISOString();
      reached.push(m.title);
    }
  }
  return reached;
}

/** Get adaptive difficulty based on recent performance */
function getAdaptiveDifficulty(curriculum: Curriculum): 'easy' | 'medium' | 'hard' {
  const scored: number[] = [];
  for (const mod of curriculum.modules) {
    for (const l of mod.lessons) {
      if (l.best_score !== null) scored.push(l.best_score);
    }
  }
  const recent = scored.slice(-3);
  if (recent.length === 0) return 'medium';
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  if (avg >= 90) return 'hard';
  if (avg >= 70) return 'medium';
  return 'easy';
}

/** Update learning streak */
function updateStreak(store: LearningStore): void {
  const today = new Date().toISOString().split('T')[0];
  if (store.streaks.lastActiveDate === today) return;

  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (store.streaks.lastActiveDate === yesterday) {
    store.streaks.current++;
  } else {
    store.streaks.current = 1;
  }
  store.streaks.longest = Math.max(store.streaks.longest, store.streaks.current);
  store.streaks.lastActiveDate = today;
}

/** Track time spent on a lesson */
function trackTime(lesson: Lesson): void {
  if (lesson.started_at) {
    const elapsed = (Date.now() - new Date(lesson.started_at).getTime()) / 60000;
    lesson.time_spent_minutes += Math.min(elapsed, 120); // Cap at 2 hours
    lesson.started_at = null;
  }
}

/** Generate recommendations based on completed curriculums */
function generateRecommendations(store: LearningStore): string[] {
  const recs: string[] = [];
  const completed = store.curriculums.filter(c => c.status === 'completed');
  const active = store.curriculums.filter(c => c.status === 'active');

  // Suggest next level for completed curriculums
  for (const c of completed) {
    if (c.level === 'beginner') recs.push(`You completed "${c.title}" (beginner). Consider an intermediate ${c.subject} curriculum.`);
    if (c.level === 'intermediate') recs.push(`You completed "${c.title}" (intermediate). Ready for advanced ${c.subject}?`);
  }

  // Find weak areas from quizzes
  for (const c of [...completed, ...active]) {
    for (const mod of c.modules) {
      for (const l of mod.lessons) {
        if (l.type === 'quiz' && l.best_score !== null && l.best_score < 70) {
          recs.push(`You scored ${l.best_score}% on "${l.title}" in ${c.title}. A focused review might help.`);
        }
      }
    }
  }

  // Suggest related topics based on tags
  const allTags = new Set(store.curriculums.flatMap(c => c.tags));
  if (allTags.has('python') && !allTags.has('data-science')) recs.push('You know Python — consider learning Data Science or Machine Learning.');
  if (allTags.has('javascript') && !allTags.has('typescript')) recs.push('You know JavaScript — TypeScript would be a natural next step.');
  if (allTags.has('react') && !allTags.has('nextjs')) recs.push('You know React — Next.js would expand your full-stack skills.');

  return recs.slice(0, 5);
}

/** Generate a completion certificate */
function generateCertificate(curriculum: Curriculum): string {
  const totalLessons = curriculum.modules.reduce((s, m) => s + m.lessons.length, 0);
  const totalQuizzes = curriculum.modules.reduce((s, m) => s + m.lessons.filter(l => l.type === 'quiz').length, 0);
  const totalTime = curriculum.modules.reduce((s, m) => s + m.lessons.reduce((ls, l) => ls + l.time_spent_minutes, 0), 0);
  const scores = curriculum.modules.flatMap(m => m.lessons.filter(l => l.best_score !== null).map(l => l.best_score!));
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const hours = Math.floor(totalTime / 60);
  const mins = Math.round(totalTime % 60);

  return `# 🎓 Certificate of Completion\n\nThis certifies that you have successfully completed:\n\n` +
    `## **${curriculum.title}**\n\n` +
    `| | |\n|---|---|\n` +
    `| **Subject** | ${curriculum.subject} |\n` +
    `| **Level** | ${curriculum.level} |\n` +
    `| **Modules** | ${curriculum.modules.length} |\n` +
    `| **Lessons** | ${totalLessons} |\n` +
    `| **Quizzes** | ${totalQuizzes} |\n` +
    `| **Average Score** | ${avgScore}% |\n` +
    `| **Time Spent** | ${hours}h ${mins}m |\n` +
    `| **Completed** | ${curriculum.completed_at || new Date().toISOString()} |\n\n` +
    `---\n\n*Awarded by **Ava Supernova** — Your AI learning companion*`;
}

// ── Quiz answer matching helpers ─────────────────────────────────────
// Exact-string matching is too brittle for open-ended answers — "node js"
// fails against "Node.js", "javascripts" fails against "JavaScript". A
// typing learner shouldn't be marked wrong for a punctuation difference
// or a one-character typo. These helpers normalize formatting and allow
// a small edit-distance for short answers, while keeping the strict
// matcher for letter-keyed multiple choice.

/**
 * Normalize an answer for comparison: lowercase, collapse whitespace,
 * strip surrounding punctuation. Preserves alphanumerics and math/code
 * tokens (+, -, =, *, /, _) that often carry meaning in technical
 * answers ("a + b", "x = y").
 */
function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s.\-_]+/g, '')
    .replace(/[^\p{L}\p{N}+=*/]/gu, '')
    .trim();
}

/** Standard iterative Levenshtein distance. O(n·m). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1).fill(0).map((_, j) => j);
  let curr = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Decide whether a user's answer matches the correct answer with a bit
 * of forgiveness for typos and formatting. Strategy:
 *  1. Exact lowercased trim match → pass.
 *  2. Normalized equality (drops punctuation, whitespace) → pass.
 *  3. For short answers (≤20 chars after normalization), allow a small
 *     edit-distance: ≤1 typo for ≤6 chars, ≤2 for ≤12 chars, ≤3 for ≤20.
 *     Rejects bigger differences so unrelated answers don't slip through.
 *
 * Multiple-choice grading still uses letter-to-option mapping in the
 * caller; this is the open-ended-text fallback.
 */
function answersMatch(userAnswer: string, correctAnswer: string): boolean {
  const u = userAnswer.trim().toLowerCase();
  const c = correctAnswer.trim().toLowerCase();
  if (u === c) return true;
  const un = normalizeAnswer(userAnswer);
  const cn = normalizeAnswer(correctAnswer);
  if (un === cn && un.length > 0) return true;
  // Edit-distance forgiveness scaled by length so short-answer typos
  // don't fail the learner but unrelated long answers don't pass.
  if (un.length === 0 || cn.length === 0) return false;
  const refLen = Math.max(un.length, cn.length);
  if (refLen > 20) return false;
  const allowed = refLen <= 6 ? 1 : refLen <= 12 ? 2 : 3;
  return levenshtein(un, cn) <= allowed;
}

// Find lessons due for spaced repetition review
function getLessonsForReview(curriculum: Curriculum): Array<{ module: Module; lesson: Lesson }> {
  const now = Date.now();
  const results: Array<{ module: Module; lesson: Lesson }> = [];

  for (const mod of curriculum.modules) {
    for (const lesson of mod.lessons) {
      // Spaced review is for MASTERED material only. `needs_review` is
      // the failed-quiz retry state — those lessons surface via
      // `next_lesson` as the next thing to do, not via the spaced-review
      // path. Mixing the two double-surfaces the same lesson and
      // confuses the Tutor about what to deliver.
      if (lesson.status !== 'completed') continue;
      if (!lesson.completed_at) continue;

      // Spaced repetition intervals: 1 day, 3 days, 7 days, 14 days, 30 days
      const intervals = [1, 3, 7, 14, 30];
      const reviewIndex = Math.min(lesson.review_count, intervals.length - 1);
      const daysSinceReview = lesson.last_reviewed_at
        ? (now - new Date(lesson.last_reviewed_at).getTime()) / (1000 * 60 * 60 * 24)
        : (now - new Date(lesson.completed_at).getTime()) / (1000 * 60 * 60 * 24);

      if (daysSinceReview >= intervals[reviewIndex]) {
        results.push({ module: mod, lesson });
      }
    }
  }

  return results;
}

// ── AVA_HOME resolution ──────────────────────────────────────────────

function getGlobalDir(context: ToolExecutionContext): string {
  const mgr = context.sharedState?.memoryManager as { globalDir?: string } | undefined;
  return mgr?.globalDir ?? join(process.env.HOME || process.env.USERPROFILE || '.', '.ava');
}

// Pre-curriculum diagnostic. Runs before any curriculum exists, so it
// intentionally takes no curriculum/lesson arguments and returns a question
// set the Tutor can ask in chat. After answers are gathered, the model
// follows up with learning_create at the appropriate level.
function runAssessment(subject: string, claimedLevel: string): ToolResult {
  const ASSESSMENT_QUESTIONS: Record<'beginner' | 'intermediate' | 'advanced', string[]> = {
    beginner: [
      'What experience do you have with this topic?',
      'Have you built anything with it before?',
      'What do you want to be able to do after learning this?',
    ],
    intermediate: [
      "Describe a project you've built with this technology.",
      'What concepts do you find most challenging?',
      'What specific area do you want to deepen?',
    ],
    advanced: [
      "What's your experience with advanced patterns in this area?",
      'Have you contributed to open source projects using this?',
      'What specific edge cases or performance issues have you encountered?',
    ],
  };
  const level = (claimedLevel as 'beginner' | 'intermediate' | 'advanced') in ASSESSMENT_QUESTIONS
    ? (claimedLevel as 'beginner' | 'intermediate' | 'advanced')
    : 'beginner';
  const questions = ASSESSMENT_QUESTIONS[level];
  return {
    success: true,
    output:
      `**Assessment: ${subject}** (claimed level: ${level})\n\n` +
      `Before creating a curriculum, I need to understand where you are. Please answer these:\n\n` +
      questions.map((q, i) => `${i + 1}. ${q}`).join('\n') +
      `\n\nBased on your answers, I'll create a curriculum that starts at the right level — ` +
      `not too easy (boring), not too hard (frustrating). If you're a complete beginner, that's perfectly fine.` +
      `\n\nAfter assessing, use learning_create to build the curriculum at the appropriate level.`,
  };
}

// ══════════════════════════════════════════════════════════════════════
// Tool 1: learning_create — Ava builds a curriculum from conversation
// ══════════════════════════════════════════════════════════════════════

export class LearningCreateTool implements Tool {
  readonly name = 'learning_create';
  readonly description = 'Create a structured learning curriculum with modules and lessons for the user';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'learning_create',
    description:
      'Create a learning curriculum skeleton. Ask the user what they want to learn, their level, and goals FIRST. ' +
      'Keep the tool call SMALL — just titles, types, and difficulty for each lesson. ' +
      'Do NOT include lesson content here — use learning_teach with action "write_content" to add content per-lesson after creation. ' +
      'This keeps the response fast and avoids timeouts.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Curriculum title (e.g., "Python Fundamentals")' },
        description: { type: 'string', description: 'Brief description' },
        subject: { type: 'string', description: 'Subject area' },
        level: { type: 'string', enum: ['beginner', 'intermediate', 'advanced', 'mixed'] },
        goal: { type: 'string', description: 'What the user wants to achieve' },
        estimated_hours: { type: 'number', description: 'Estimated total hours' },
        tags: { type: 'array', items: { type: 'string' } },
        learning_objectives: { type: 'array', items: { type: 'string' }, description: 'What the user will learn overall' },
        prerequisites: { type: 'string', description: 'What the user should already know' },
        target_audience: { type: 'string', description: 'Who this curriculum is designed for' },
        modules: {
          type: 'array',
          description: 'Ordered modules. Keep lessons lightweight — title, type, difficulty only. Content is added later via learning_teach.',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              lessons: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    type: { type: 'string', enum: ['concept', 'exercise', 'project', 'quiz', 'recap', 'challenge'] },
                    difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
                    estimated_minutes: { type: 'number' },
                  },
                  required: ['title', 'type'],
                },
              },
            },
            required: ['title', 'lessons'],
          },
        },
      },
      required: ['title', 'subject', 'level', 'modules'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const globalDir = getGlobalDir(context);
    const store = await loadStore(globalDir);

    const curriculum: Curriculum = {
      id: generateId(),
      title: args.title as string,
      description: (args.description as string) ?? null,
      subject: args.subject as string,
      level: args.level as string,
      goal: (args.goal as string) ?? null,
      estimated_hours: (args.estimated_hours as number) ?? null,
      status: 'active',
      progress_percent: 0,
      tags: (args.tags as string[]) ?? [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
      adaptive_level: null,
      milestones: DEFAULT_MILESTONES.map(m => ({ ...m })),
      curriculum_learning_objectives: (args.learning_objectives as string[]) ?? [],
      curriculum_prerequisites: (args.prerequisites as string) ?? '',
      target_audience: (args.target_audience as string) ?? '',
      modules: ((args.modules as Array<Record<string, unknown>>) || []).map((mod, mi) => ({
        id: generateId(),
        title: mod.title as string,
        description: (mod.description as string) ?? null,
        status: mi === 0 ? 'available' as const : 'locked' as const,
        progress_percent: 0,
        estimated_minutes: null,
        learning_objectives: (mod.learning_objectives as string[]) ?? [],
        lessons: ((mod.lessons as Array<Record<string, unknown>>) || []).map(lesson => ({
          id: generateId(),
          title: lesson.title as string,
          content: (lesson.content as string) ?? null,
          type: (lesson.type as Lesson['type']) || 'concept',
          status: 'not_started' as const,
          difficulty: (lesson.difficulty as Lesson['difficulty']) || 'medium',
          estimated_minutes: (lesson.estimated_minutes as number) ?? null,
          learning_objectives: [],
          prerequisites: [],
          resources: [],
          quiz_questions: [],
          score: null,
          attempts: 0,
          best_score: null,
          ava_feedback: null,
          completed_at: null,
          last_reviewed_at: null,
          review_count: 0,
          tags: [],
          time_spent_minutes: 0,
          started_at: null,
        })),
      })),
    };

    // Auto difficulty progression within modules
    for (const mod of curriculum.modules) {
      const lessonCount = mod.lessons.length;
      if (lessonCount >= 3) {
        mod.lessons.forEach((l, i) => {
          if (!l.difficulty || l.difficulty === 'medium') {
            const position = i / (lessonCount - 1);
            if (position < 0.33) l.difficulty = 'easy';
            else if (position < 0.67) l.difficulty = 'medium';
            else l.difficulty = 'hard';
          }
        });
      }
    }

    // Auto-calculate estimated_hours from lesson minutes if not provided
    if (!curriculum.estimated_hours) {
      const totalMins = curriculum.modules.reduce((s, m) =>
        s + m.lessons.reduce((ls, l) => ls + (l.estimated_minutes || 15), 0), 0);
      curriculum.estimated_hours = Math.round(totalMins / 60 * 10) / 10;
    }

    // Check prior curriculums for adaptive difficulty
    if (store.curriculums.length > 0) {
      const priorLevel = getAdaptiveDifficulty(store.curriculums[0]);
      curriculum.adaptive_level = priorLevel;
    }

    // Recalculate module estimated times
    recalculateProgress(curriculum);

    // Enforce single-active: a freshly created course becomes THE active one;
    // pause any previously-active course (its progress is kept).
    for (const c of store.curriculums) {
      if (c.status === 'active') c.status = 'paused';
    }
    store.curriculums.unshift(curriculum);
    await persist(globalDir, store, context);

    // Record what they're learning to memory so Ava knows across EVERY mode —
    // the main chat (which doesn't load the Teach learning-context) can recall
    // "they're currently learning X" and weave it into help / brainstorming.
    // Best-effort: never fail the course creation if memory is unavailable.
    try {
      const memoryManager = context.sharedState?.memoryManager as
        | { saveEntry: (o: Record<string, unknown>) => Promise<unknown> }
        | undefined;
      if (memoryManager?.saveEntry) {
        await memoryManager.saveEntry({
          scope: 'global',
          content: `Currently learning ${curriculum.subject} — taking the course "${curriculum.title}" (${curriculum.level})` +
            (curriculum.goal ? `. Goal: ${curriculum.goal}` : '') + '.',
          category: 'general',
          tags: ['learning', curriculum.subject],
          sourceConversationId: context.conversationId,
        });
      }
    } catch { /* memory is additive — course creation must still succeed */ }

    const totalLessons = curriculum.modules.reduce((sum, m) => sum + m.lessons.length, 0);
    const totalQuizzes = curriculum.modules.reduce((sum, m) => sum + m.lessons.filter(l => l.type === 'quiz').length, 0);
    const totalMinutes = curriculum.modules.reduce((sum, m) =>
      sum + m.lessons.reduce((s, l) => s + (l.estimated_minutes || 0), 0), 0);

    return {
      success: true,
      output: `Created curriculum: "${curriculum.title}"\n` +
        `Subject: ${curriculum.subject} | Level: ${curriculum.level}\n` +
        `${curriculum.modules.length} modules, ${totalLessons} lessons, ${totalQuizzes} quizzes` +
        (totalMinutes > 0 ? ` (~${Math.round(totalMinutes / 60)}h ${totalMinutes % 60}m)` : '') +
        (curriculum.goal ? `\nGoal: ${curriculum.goal}` : '') +
        `\n\nModules:\n${curriculum.modules.map((m, i) => {
          const time = m.estimated_minutes ? ` (~${m.estimated_minutes}m)` : '';
          return `  ${i + 1}. ${m.title} (${m.lessons.length} lessons${time})`;
        }).join('\n')}` +
        `\n\nThe first module is unlocked. Now use learning_teach with action "write_content" to add ` +
        `teaching content to the first lesson, then deliver it. Build content as the user progresses — ` +
        `don't try to write all lessons at once.`,
      metadata: { id: curriculum.id, modules: curriculum.modules.length, lessons: totalLessons },
    };
  }

}

// ══════════════════════════════════════════════════════════════════════
// Tool 2: learning_teach — Ava delivers a lesson or quiz
// ══════════════════════════════════════════════════════════════════════

export class LearningTeachTool implements Tool {
  readonly name = 'learning_teach';
  readonly description = 'Deliver a lesson, write teaching content, give feedback, run a quiz, or trigger a review for the user\'s active curriculum';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'learning_teach',
    description:
      'Teach the user by delivering lesson content, providing feedback, running quizzes, or triggering reviews. ' +
      'Use this after the user says they want to continue learning or asks about a specific topic. ' +
      'Actions: assess (diagnostic before creating curriculum — pass subject + assessment_level only, no curriculum_id needed), deliver (present lesson), write_content (author the lesson — pass `steps` for the interactive teach→do→check loop (preferred), following the step template returned for the lesson type), ' +
      'set_quiz (persist quiz questions on a lesson — call this when you generate quiz questions so they survive restarts), ' +
      'feedback (give feedback — pass or fail), quiz (run quiz questions and grade), review (spaced repetition review of completed lessons).',
    parameters: {
      type: 'object',
      properties: {
        curriculum_id: { type: 'string', description: 'ID of the curriculum' },
        lesson_id: { type: 'string', description: 'ID of the lesson to teach or update' },
        action: {
          type: 'string',
          enum: ['assess', 'set_active', 'deliver', 'feedback', 'write_content', 'set_quiz', 'quiz', 'review'],
          description: 'assess = diagnostic before curriculum creation (pass subject+assessment_level, no curriculum_id required), set_active = make this the ONE active course Ava is teaching (pass curriculum_id only — pauses the others, keeps their progress; use when the learner wants to switch courses), deliver = present lesson, feedback = pass/fail, write_content = author the lesson as interactive `steps` (preferred) or legacy `content`, set_quiz = persist quiz questions on a lesson, quiz = run quiz, review = spaced repetition',
        },
        subject: { type: 'string', description: 'For assess: the subject to assess knowledge in' },
        assessment_level: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'], description: 'For assess: claimed level to verify' },
        content: { type: 'string', description: 'For write_content (legacy fallback — prefer `steps`): markdown teaching content. For feedback: Ava\'s feedback text.' },
        passed: { type: 'boolean', description: 'For feedback: did the user pass? true = completed, false = needs_review (retry)' },
        score: { type: 'number', description: 'For feedback/quiz: score 0-100' },
        quiz_answers: {
          type: 'array',
          items: { type: 'string' },
          description: 'For quiz: user\'s answers in order matching quiz_questions',
        },
        questions: {
          type: 'array',
          description: 'For set_quiz: the quiz questions to persist on this lesson. Replaces any existing questions. Fails if the array is empty.',
          items: {
            type: 'object',
            properties: {
              question: { type: 'string', description: 'The question text' },
              options: { type: 'array', items: { type: 'string' }, description: 'Multiple-choice options (optional for open-ended questions)' },
              correct_answer: { type: 'string', description: 'The correct answer. For multiple-choice, either the letter (A/B/C/D) or the full option text.' },
              explanation: { type: 'string', description: 'Why this answer is correct — shown to the learner after grading. Makes the quiz itself teach.' },
            },
            required: ['question', 'correct_answer'],
          },
        },
        steps: {
          type: 'array',
          description: 'For write_content: the interactive teach→do→check steps (the Brilliant-style loop). PREFERRED over `content`. Each step teaches one small bite, then has the learner DO something you check live. Aim for 3-6 steps that build to the learner doing the whole skill on their own example. Follow the step template returned for the lesson type.',
          items: {
            type: 'object',
            properties: {
              teach: { type: 'string', description: 'The bite of concept to present before the learner acts — ONE idea, ~1-2 sentences, markdown. Not a wall of text.' },
              interaction: {
                type: 'object',
                properties: {
                  kind: { type: 'string', enum: ['choice', 'free_text', 'code', 'predict'], description: 'choice = pick an option; free_text = type an answer Ava grades; code = write + run real code; predict = guess an outcome, then see it.' },
                  prompt: { type: 'string', description: 'What you ask the learner to DO — concrete and small.' },
                  options: { type: 'array', items: { type: 'string' }, description: 'For kind=choice: the options shown.' },
                  answer: { type: 'string', description: 'For choice/predict: the canonical correct answer (deterministic check).' },
                  evaluation: { type: 'string', description: 'For free_text/code where there is no single right answer: the rubric you grade the learner\'s REAL attempt against, e.g. "has context + a task + a constraint, applied to a situation of their own". This is what lets Ava tutor open answers — always set it on free_text/code steps.' },
                  starter: { type: 'string', description: 'For kind=code: starter code placed in the sandbox.' },
                },
                required: ['kind', 'prompt'],
              },
              feedback: {
                type: 'object',
                description: 'For choice/predict deterministic checks: what to say on right vs wrong.',
                properties: {
                  correct: { type: 'string' },
                  incorrect: { type: 'string' },
                },
              },
            },
            required: ['teach', 'interaction'],
          },
        },
      },
      required: ['action'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const globalDir = getGlobalDir(context);
    const store = await loadStore(globalDir);

    const currId = args.curriculum_id as string | undefined;
    const lessonId = args.lesson_id as string | undefined;
    const action = args.action as string;
    const content = args.content as string | undefined;
    const passed = args.passed as boolean | undefined;
    const score = args.score as number | undefined;
    const quizAnswers = args.quiz_answers as string[] | undefined;
    const questions = args.questions as Array<{
      question: string;
      options?: string[];
      correct_answer: string;
      explanation?: string;
    }> | undefined;
    const steps = args.steps as Array<{
      teach: string;
      interaction: {
        kind: 'choice' | 'free_text' | 'code' | 'predict';
        prompt: string;
        options?: string[];
        answer?: string;
        evaluation?: string;
        starter?: string;
      };
      feedback?: { correct?: string; incorrect?: string };
    }> | undefined;

    // The 'assess' action runs BEFORE a curriculum exists — it generates
    // diagnostic questions for a subject the learner is about to start.
    // Skip the curriculum/lesson lookup that every other action needs.
    if (action === 'assess') {
      const subject = args.subject as string || 'general';
      const claimedLevel = args.assessment_level as string || 'beginner';
      return runAssessment(subject, claimedLevel);
    }

    // set_active makes ONE course the active one Ava teaches — pauses the rest
    // (their progress is kept). Needs only curriculum_id, so handle it before the
    // lesson lookup. Completed courses stay completed.
    if (action === 'set_active') {
      if (!currId) return { success: false, output: 'curriculum_id is required for set_active' };
      const target = store.curriculums.find(c => c.id === currId);
      if (!target) return { success: false, output: `Curriculum not found: ${currId}` };
      for (const c of store.curriculums) {
        if (c.status === 'completed') continue;
        c.status = c.id === currId ? 'active' : 'paused';
      }
      if (target.status === 'completed') target.status = 'active'; // re-activating a finished course to revisit
      await persist(globalDir, store, context);
      return { success: true, output: `Active course is now **${target.title}**. The others are paused (progress kept).` };
    }

    if (!currId || !lessonId) {
      return { success: false, output: `curriculum_id and lesson_id are required for action "${action}"` };
    }

    const curriculum = store.curriculums.find(c => c.id === currId);
    if (!curriculum) return { success: false, output: `Curriculum not found: ${currId}` };

    let lesson: Lesson | undefined;
    let parentModule: Module | undefined;
    for (const mod of curriculum.modules) {
      lesson = mod.lessons.find(l => l.id === lessonId);
      if (lesson) { parentModule = mod; break; }
    }
    if (!lesson || !parentModule) return { success: false, output: `Lesson not found: ${lessonId}` };

    switch (action) {

      case 'deliver': {
        // Check prerequisites
        if (lesson.prerequisites.length > 0) {
          const allLessons = curriculum.modules.flatMap(m => m.lessons);
          const unmet = lesson.prerequisites.filter(pre => {
            const prereq = allLessons.find(l => l.title.toLowerCase() === pre.toLowerCase());
            return !prereq || prereq.status !== 'completed';
          });
          if (unmet.length > 0) {
            return { success: false, output: `Prerequisites not met: ${unmet.join(', ')}. Complete these first.` };
          }
        }

        lesson.status = 'in_progress';
        lesson.started_at = new Date().toISOString();
        curriculum.updated_at = new Date().toISOString();
        // Refresh the adaptive signal from recent quiz performance so the
        // Tutor's delivery this turn matches where the learner actually
        // is, not where they were when the curriculum was created.
        curriculum.adaptive_level = getAdaptiveDifficulty(curriculum);
        updateStreak(store);
        recalculateProgress(curriculum);
        await persist(globalDir, store, context);

        let out = `**${lesson.title}** (${lesson.type} · ${lesson.difficulty})`;
        if (lesson.estimated_minutes) out += ` · ~${lesson.estimated_minutes} min`;
        out += '\n';

        // Adaptive pacing signal for the Tutor. The Tutor's prompt tells
        // it to "adapt pace to the learner" — this gives it concrete
        // data based on recent quiz scores rather than guessing.
        const ADAPTIVE_GUIDANCE: Record<'easy' | 'medium' | 'hard', string> = {
          easy: 'Recent quiz performance is below 70% — slow down. Add more worked examples, check understanding more often, and don\'t rush to harder lessons. Reinforce foundations before pushing forward.',
          medium: 'Recent quiz performance is solid (70-90%). Continue at standard pace.',
          hard: 'Recent quiz performance is excellent (≥90%) — push harder. Skip introductory framing, go straight to edge cases, ask deeper why-questions. The learner is ready for stretch material.',
        };
        const adaptive = curriculum.adaptive_level;
        if (adaptive && adaptive in ADAPTIVE_GUIDANCE) {
          out += `\n_Adaptive guidance: ${ADAPTIVE_GUIDANCE[adaptive]}_\n`;
        }

        if (lesson.steps && lesson.steps.length > 0) {
          // Interactive lesson — the Tutor RUNS the teach→do→check loop, one
          // step at a time, in conversation. Serve the steps + how to run them.
          out += '\n**This is an interactive lesson — run it as a loop, ONE step at a time. Do NOT dump all the steps at once.**\n';
          out += '\nFor each step: present its `teach` (a bite), then its `do` prompt, and STOP — wait for the learner\'s real answer before the next step.\n';
          out += '\nGrading:\n';
          out += '- `choice`/`predict`: check against `answer`; use the step\'s feedback if present.\n';
          out += '- `free_text`/`code`: there is no single right answer — judge the learner\'s ACTUAL attempt against `evaluation`. ';
          out += 'Be firm on the outcome but soft on the path: if they fall short, do NOT just say "wrong" — scaffold down (a smaller hint, a simpler sub-step, break it in half) and let them try again. ';
          out += 'Push harder when they\'re cruising, give more support when they struggle. Move on once they\'ve shown it once.\n';
          out += '\nWhen every step is done, call learning_teach action "feedback" with passed:true (and a score) — mastery earned because you watched them do it, not because they scrolled.\n';
          const masteredCount = lesson.steps.filter(s => s.status === 'mastered').length;
          if (masteredCount > 0) {
            out += `\n_Returning learner: ${masteredCount}/${lesson.steps.length} steps already mastered. Pick up at the first un-mastered step — acknowledge what they've done, don't re-teach it. Their last attempts are shown below so you can reference them naturally ("last time you wrote …")._\n`;
          }
          out += '\n**Steps:**';
          out += lesson.steps.map((s, i) => {
            let str = `\n\n${i + 1}. teach: ${s.teach}\n   do (${s.interaction.kind}): ${s.interaction.prompt}`;
            if (s.interaction.options?.length) str += `\n   options: ${s.interaction.options.join(' | ')}`;
            if (s.interaction.answer) str += `\n   answer: ${s.interaction.answer}`;
            if (s.interaction.evaluation) str += `\n   evaluation (grade their real answer against this): ${s.interaction.evaluation}`;
            if (s.interaction.starter) str += `\n   starter code: ${s.interaction.starter}`;
            if (s.status && s.status !== 'not_started') str += `\n   [learner progress: ${s.status}${s.last_attempt ? ` — last attempt: "${s.last_attempt}"` : ''}]`;
            return str;
          }).join('');
        } else if (lesson.content) {
          out += `\n${lesson.content}`;
        } else {
          out += `\nThis lesson has no content yet. Use action "write_content" to add teaching material.`;
        }

        if (lesson.resources.length > 0) {
          out += '\n\n**Resources:**\n';
          out += lesson.resources.map(r => `- ${r.title}${r.url ? ` — ${r.url}` : ''} [${r.type}]`).join('\n');
        }

        if (lesson.quiz_questions.length > 0 && lesson.type === 'quiz') {
          out += '\n\n**Quiz:**\n';
          out += lesson.quiz_questions.map((q, i) => {
            let qStr = `${i + 1}. ${q.question}`;
            if (q.options) qStr += '\n' + q.options.map((o, j) => `   ${String.fromCharCode(65 + j)}) ${o}`).join('\n');
            return qStr;
          }).join('\n\n');
        }

        return { success: true, output: out };
      }

      case 'write_content': {
        // Step templates — the Brilliant-style teach→do→check loop. This is the
        // guidance that makes a *generated* lesson feel crafted: small bites,
        // the learner doing the thing immediately, Ava grading their real
        // answer. Returned to the writer when the steps are thin or missing.
        const stepTemplates: Record<string, string> = {
          concept: '**Step template — Concept (teach→do→check loop)**\n' +
            'Break the idea into 3-6 small steps. Each: teach ONE bite (≤2 sentences), then have the learner USE it right away.\n' +
            '1. Open with a `predict` or `choice` that makes them FEEL the idea before you name it.\n' +
            '2. Then `free_text` steps where they apply it to THEIR OWN example — set an `evaluation` rubric so you grade their real answer (e.g. "has X, Y and Z").\n' +
            '3. End on a synthesis step: they do the whole skill unaided on something real to them — that is the mastery check.\n' +
            'They learn by doing, not reading — never more than a bite of teach before an interaction.',
          exercise: '**Step template — Exercise**\n' +
            'Walk them INTO the solution, do not hand it over. `teach` the goal + first sub-step, then a `code`/`free_text` step for it (with `answer` or an `evaluation` rubric). Build up one checked sub-step at a time; final step assembles the whole thing, graded against acceptance criteria in `evaluation`.',
          project: '**Step template — Project**\n' +
            'A sequence of build milestones, each a `code` step the learner runs. `teach` the requirement + provide `starter` code; each milestone is a `code` interaction with an `evaluation` rubric ("does it do X?"); final step: it all works together.',
          challenge: '**Step template — Challenge**\n' +
            'Less scaffolding — they apply what they learned. One `teach` setting the problem + constraints, then a `code`/`free_text` step where they solve it with a tough `evaluation` rubric (and a bonus criterion). Hints only on a wrong attempt.',
          recap: '**Step template — Recap**\n' +
            'Active recall, not a summary to read. `predict`/`choice`/`free_text` steps that make them RETRIEVE each key idea from earlier lessons (with `answer` or `evaluation`), then an open step connecting them.',
          quiz: '**Quiz lessons** use action "set_quiz" for the questions; `write_content` only sets a short intro shown above them.',
        };

        // ── Preferred path: interactive steps (teach→do→check) ──
        if (steps && steps.length > 0) {
          const w: string[] = [];
          if (steps.length < 3 && lesson.type !== 'quiz') w.push('A lesson is a loop, not a card or two — aim for 3-6 steps that build to the learner doing the whole skill.');
          if (steps.some(s => !s.teach || s.teach.trim().length < 8)) w.push('Every step should teach a bite before it asks the learner to act.');
          if (steps.some(s => !s.interaction?.kind || !s.interaction?.prompt)) w.push('Every step needs an interaction (kind + prompt) — that is the "do" in teach→do→check.');
          const openNoRubric = steps.filter(s => (s.interaction?.kind === 'free_text' || s.interaction?.kind === 'code') && !s.interaction?.evaluation?.trim());
          if (openNoRubric.length) w.push(`${openNoRubric.length} open step(s) have no \`evaluation\` rubric — without it you can't grade the learner's real answer. That is the whole point; add one to each.`);
          const detNoAnswer = steps.filter(s => (s.interaction?.kind === 'choice' || s.interaction?.kind === 'predict') && !s.interaction?.answer?.trim());
          if (detNoAnswer.length) w.push(`${detNoAnswer.length} choice/predict step(s) have no \`answer\` for the check — add it.`);
          if (!steps.some(s => s.interaction?.kind === 'free_text' || s.interaction?.kind === 'code')) w.push('No open step where the learner applies the skill to their OWN example — add at least one free_text/code step with an evaluation rubric. That is what makes it more than a clickthrough.');

          lesson.steps = steps.map(s => ({
            id: generateId(),
            teach: s.teach,
            interaction: {
              kind: s.interaction.kind,
              prompt: s.interaction.prompt,
              options: s.interaction.options,
              answer: s.interaction.answer,
              evaluation: s.interaction.evaluation,
              starter: s.interaction.starter,
            },
            feedback: s.feedback && (s.feedback.correct || s.feedback.incorrect)
              ? { correct: s.feedback.correct ?? '', incorrect: s.feedback.incorrect ?? '' }
              : undefined,
            status: 'not_started' as const,
            attempts: 0,
            last_attempt: null,
          }));
          curriculum.updated_at = new Date().toISOString();
          await persist(globalDir, store, context);

          let out = `Wrote ${steps.length} interactive step${steps.length === 1 ? '' : 's'} for "${lesson.title}".`;
          if (w.length) out += `\n\n⚠️ Make it land:\n${w.map(x => `- ${x}`).join('\n')}\n\n${stepTemplates[lesson.type] || stepTemplates.concept}`;
          return { success: true, output: out };
        }

        // ── Legacy path: markdown content blob (read-then-test) ──
        if (!content) return { success: false, output: 'Provide `steps` (preferred — the interactive teach→do→check loop) or `content` (legacy markdown).' };

        const warnings: string[] = [];
        if (content.length < 100 && lesson.type !== 'quiz') warnings.push('Content seems short. Good lessons have depth — examples, explanations, edge cases.');
        if (lesson.type === 'concept' && !content.includes('example') && !content.includes('Example') && !content.includes('```')) {
          warnings.push('Concept lessons should include examples. Add code samples or real-world analogies.');
        }
        if (lesson.type === 'exercise' && !content.includes('expected') && !content.includes('output') && !content.includes('should')) {
          warnings.push('Exercises should have clear expected outcomes. What should the result look like?');
        }
        warnings.push('Prefer `steps` — an interactive teach→do→check loop the learner works through, not a blob they read.');

        lesson.content = content;
        curriculum.updated_at = new Date().toISOString();
        await persist(globalDir, store, context);

        let out = `Updated content for "${lesson.title}" (${content.length} chars)`;
        if (warnings.length > 0) {
          out += `\n\n⚠️ Quality notes:\n${warnings.map(x => `- ${x}`).join('\n')}`;
          out += `\n\n${stepTemplates[lesson.type] || ''}`;
        }
        return { success: true, output: out };
      }

      case 'set_quiz': {
        if (!questions || questions.length === 0) {
          return { success: false, output: 'set_quiz requires at least one question. Pass `questions` as a non-empty array.' };
        }
        // Validate each question has the required fields. Fail loudly on
        // malformed input so the Quiz Master notices rather than silently
        // persisting an unusable quiz.
        for (let i = 0; i < questions.length; i++) {
          const q = questions[i];
          if (!q.question || !q.correct_answer) {
            return { success: false, output: `Question ${i + 1} is missing question or correct_answer.` };
          }
        }
        lesson.quiz_questions = questions.map(q => ({
          question: q.question,
          options: q.options,
          correct_answer: q.correct_answer,
          explanation: q.explanation,
        }));
        curriculum.updated_at = new Date().toISOString();
        await persist(globalDir, store, context);
        return {
          success: true,
          output: `Persisted ${questions.length} quiz question${questions.length === 1 ? '' : 's'} on "${lesson.title}". ` +
            `They now survive restarts and sync to the cloud when Data Mode allows.`,
        };
      }

      case 'feedback': {
        if (content) lesson.ava_feedback = content;
        if (score !== undefined) {
          lesson.score = score;
          lesson.best_score = Math.max(lesson.best_score ?? 0, score);
        }
        lesson.attempts++;
        trackTime(lesson);
        updateStreak(store);

        if (passed === false) {
          lesson.status = 'needs_review';
          curriculum.updated_at = new Date().toISOString();
          curriculum.adaptive_level = getAdaptiveDifficulty(curriculum);
          recalculateProgress(curriculum);
          await persist(globalDir, store, context);
          return {
            success: true,
            output: `"${lesson.title}" — needs more work.` +
              (score !== undefined ? ` Score: ${score}% (attempt ${lesson.attempts})` : '') +
              (lesson.time_spent_minutes > 0 ? ` Time: ${Math.round(lesson.time_spent_minutes)}m` : '') +
              `\n${content || 'Review the material and try again when ready.'}` +
              `\nThe lesson stays unlocked — tell the user they can retry anytime.` +
              (store.streaks.current > 1 ? `\n🔥 Learning streak: ${store.streaks.current} days!` : ''),
          };
        }

        // Passed
        lesson.status = 'completed';
        lesson.completed_at = new Date().toISOString();
        curriculum.updated_at = new Date().toISOString();
        curriculum.adaptive_level = getAdaptiveDifficulty(curriculum);
        recalculateProgress(curriculum);
        const newMilestones = checkMilestones(curriculum);
        if (curriculum.progress_percent === 100 && !curriculum.completed_at) {
          curriculum.completed_at = new Date().toISOString();
          curriculum.status = 'completed';
        }
        await persist(globalDir, store, context);

        let feedbackOut = `"${lesson.title}" — completed!` +
          (score !== undefined ? ` Score: ${score}%` : '') +
          (lesson.attempts > 1 ? ` (${lesson.attempts} attempts)` : '') +
          (lesson.time_spent_minutes > 0 ? ` Time: ${Math.round(lesson.time_spent_minutes)}m` : '') +
          `\nCurriculum progress: ${curriculum.progress_percent}%`;
        if (newMilestones.length > 0) feedbackOut += `\n🎯 Milestone: ${newMilestones.join(', ')}`;
        if (store.streaks.current > 1) feedbackOut += `\n🔥 Learning streak: ${store.streaks.current} days!`;
        if (content) feedbackOut += `\n\n${content}`;
        return { success: true, output: feedbackOut };
      }

      case 'quiz': {
        if (!quizAnswers || quizAnswers.length === 0) {
          // No answers yet — deliver the quiz
          if (lesson.quiz_questions.length === 0) {
            return { success: false, output: 'This lesson has no quiz questions. Add them with write_content or create a new quiz lesson.' };
          }
          lesson.status = 'in_progress';
          curriculum.updated_at = new Date().toISOString();
          await persist(globalDir, store, context);

          let out = `**Quiz: ${lesson.title}**\n\n`;
          out += lesson.quiz_questions.map((q, i) => {
            let qStr = `**${i + 1}.** ${q.question}`;
            if (q.options) qStr += '\n' + q.options.map((o, j) => `   ${String.fromCharCode(65 + j)}) ${o}`).join('\n');
            return qStr;
          }).join('\n\n');
          out += '\n\nAsk the user to answer each question. Then call this tool again with quiz_answers to grade.';
          return { success: true, output: out };
        }

        // Grade the quiz
        let correct = 0;
        const results: string[] = [];
        for (let i = 0; i < lesson.quiz_questions.length; i++) {
          const q = lesson.quiz_questions[i];
          const userAnswer = quizAnswers[i] || '';
          q.user_answer = userAnswer;

          // Multiple-choice: user can answer with the letter (A/B/C/D)
          // or the option text. Stays strict on the letter mapping.
          let isCorrect = false;
          if (q.options && /^[a-d]$/i.test(userAnswer.trim())) {
            const idx = userAnswer.trim().toUpperCase().charCodeAt(0) - 65;
            if (idx >= 0 && idx < q.options.length) {
              isCorrect = answersMatch(q.options[idx], q.correct_answer);
            }
          }
          // Open-ended (or option text typed out): forgiving match —
          // case / punctuation / whitespace insensitive plus a small
          // edit-distance budget for typos on short answers. See
          // answersMatch above for the strategy.
          if (!isCorrect) {
            isCorrect = answersMatch(userAnswer, q.correct_answer);
          }

          q.is_correct = isCorrect;
          if (isCorrect) correct++;

          results.push(
            `${i + 1}. ${isCorrect ? '✓' : '✗'} ${q.question}\n` +
            `   Your answer: ${userAnswer}\n` +
            (isCorrect ? '' : `   Correct: ${q.correct_answer}\n`) +
            (q.explanation ? `   ${q.explanation}` : '')
          );
        }

        const quizScore = Math.round((correct / lesson.quiz_questions.length) * 100);
        lesson.score = quizScore;
        lesson.best_score = Math.max(lesson.best_score ?? 0, quizScore);
        lesson.attempts++;

        const passThreshold = 70;
        if (quizScore >= passThreshold) {
          lesson.status = 'completed';
          lesson.completed_at = new Date().toISOString();
        } else {
          lesson.status = 'needs_review';
        }

        curriculum.updated_at = new Date().toISOString();
        recalculateProgress(curriculum);
        await persist(globalDir, store, context);

        return {
          success: true,
          output: `**Quiz Results: ${lesson.title}**\n` +
            `Score: ${quizScore}% (${correct}/${lesson.quiz_questions.length})` +
            (lesson.attempts > 1 ? ` · Attempt ${lesson.attempts} · Best: ${lesson.best_score}%` : '') +
            `\n${quizScore >= passThreshold ? '🎉 Passed!' : '📚 Needs review — 70% required to pass.'}\n\n` +
            results.join('\n\n') +
            `\n\nCurriculum progress: ${curriculum.progress_percent}%`,
        };
      }

      case 'review': {
        // Mark as reviewed for spaced repetition
        lesson.last_reviewed_at = new Date().toISOString();
        lesson.review_count++;
        curriculum.updated_at = new Date().toISOString();
        await persist(globalDir, store, context);

        let out = `**Review: ${lesson.title}** (review #${lesson.review_count})\n\n`;
        if (lesson.content) {
          out += lesson.content;
        }
        if (lesson.quiz_questions.length > 0) {
          out += '\n\n**Quick review questions:**\n';
          // Show a subset for review
          const reviewQs = lesson.quiz_questions.slice(0, 3);
          out += reviewQs.map((q, i) => `${i + 1}. ${q.question}`).join('\n');
        }
        out += '\n\nAsk the user if they remember the key concepts. Use feedback action to record how they did.';
        return { success: true, output: out };
      }

      default:
        return { success: false, output: `Unknown action: ${action}` };
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
// Tool 3: learning_progress — View and manage learning progress
// ══════════════════════════════════════════════════════════════════════

export class LearningProgressTool implements Tool {
  readonly name = 'learning_progress';
  readonly description = 'View learning progress, list curriculums, find next lesson, check review schedule, or search across learning content';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'learning_progress',
    description:
      'Check the user\'s learning progress. Can list all curriculums, show details of a specific one, ' +
      'find the next available lesson, check what needs review (spaced repetition), or search across ' +
      'all learning content by keyword/tag.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'detail', 'next_lesson', 'needs_review', 'search', 'stats', 'recommend', 'certificate', 'library_search', 'library_recommend'],
          description: 'list = all curriculums, detail = specific curriculum, next_lesson = next available, needs_review = spaced repetition due, search = keyword/tag search, stats = learning statistics, recommend = suggest what to learn next, certificate = completion certificate, library_search = search public Learning Library, library_recommend = get library recommendations based on your learning history',
        },
        curriculum_id: { type: 'string', description: 'For detail/next_lesson: which curriculum' },
        query: { type: 'string', description: 'For search: keyword or tag to search for' },
      },
      required: ['action'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const globalDir = getGlobalDir(context);
    const store = await loadStore(globalDir);

    const action = args.action as string;
    const currId = args.curriculum_id as string | undefined;
    const query = args.query as string | undefined;

    switch (action) {
      case 'list': {
        if (store.curriculums.length === 0) {
          return { success: true, output: 'No learning paths yet. Ask the user what they want to learn and create one with learning_create.' };
        }
        const list = store.curriculums.map(c => {
          const totalLessons = c.modules.reduce((s, m) => s + m.lessons.length, 0);
          const completedLessons = c.modules.reduce((s, m) => s + m.lessons.filter(l => l.status === 'completed').length, 0);
          return `- **${c.title}** (${c.subject}, ${c.level}) — ${completedLessons}/${totalLessons} lessons, ${Math.round(c.progress_percent)}% [${c.status}]\n  ${c.tags.length > 0 ? `Tags: ${c.tags.join(', ')} · ` : ''}ID: ${c.id}`;
        }).join('\n');
        return { success: true, output: `**Learning paths:**\n${list}` };
      }

      case 'detail': {
        if (!currId) return { success: false, output: 'curriculum_id is required for detail action' };
        const curriculum = store.curriculums.find(c => c.id === currId);
        if (!curriculum) return { success: false, output: `Curriculum not found: ${currId}` };

        let out = `# ${curriculum.title}\n`;
        out += `Subject: ${curriculum.subject} | Level: ${curriculum.level} | Progress: ${Math.round(curriculum.progress_percent)}%\n`;
        if (curriculum.goal) out += `Goal: ${curriculum.goal}\n`;
        if (curriculum.tags.length > 0) out += `Tags: ${curriculum.tags.join(', ')}\n`;
        out += '\n';

        for (const mod of curriculum.modules) {
          const icon = mod.status === 'completed' ? '✓' : mod.status === 'locked' ? '🔒' : '▶';
          const time = mod.estimated_minutes ? ` (~${mod.estimated_minutes}m)` : '';
          out += `${icon} **${mod.title}** (${Math.round(mod.progress_percent)}%${time})\n`;
          if (mod.learning_objectives.length > 0) {
            out += `  Objectives: ${mod.learning_objectives.join(', ')}\n`;
          }
          for (const lesson of mod.lessons) {
            const lIcon = lesson.status === 'completed' ? '  ✓'
              : lesson.status === 'needs_review' ? '  ⟳'
              : lesson.status === 'in_progress' ? '  ▶' : '  ○';
            const scoreStr = lesson.best_score !== null ? ` (best: ${lesson.best_score}%)` : '';
            const timeStr = lesson.estimated_minutes ? ` ~${lesson.estimated_minutes}m` : '';
            out += `${lIcon} ${lesson.title} [${lesson.type}·${lesson.difficulty}${timeStr}]${scoreStr} [id: ${lesson.id}]\n`;
          }
          out += '\n';
        }

        return { success: true, output: out, metadata: { id: curriculum.id } };
      }

      case 'next_lesson': {
        const curriculum = currId
          ? store.curriculums.find(c => c.id === currId)
          : store.curriculums.find(c => c.status === 'active');

        if (!curriculum) return { success: true, output: 'No active curriculum found.' };

        // Check for lessons needing review first
        const reviewDue = getLessonsForReview(curriculum);
        if (reviewDue.length > 0) {
          const r = reviewDue[0];
          return {
            success: true,
            output: `Before continuing, there's a lesson due for review:\n` +
              `Module: ${r.module.title}\n` +
              `Lesson: ${r.lesson.title} (${r.lesson.type}) — last reviewed ${r.lesson.last_reviewed_at || r.lesson.completed_at}\n` +
              `[curriculum_id: ${curriculum.id}, lesson_id: ${r.lesson.id}]\n\n` +
              `Use learning_teach with action "review" to review this lesson, or skip to the next new lesson.`,
            metadata: { curriculum_id: curriculum.id, lesson_id: r.lesson.id, is_review: true },
          };
        }

        // Find next incomplete lesson
        for (const mod of curriculum.modules) {
          if (mod.status === 'locked') continue;
          const next = mod.lessons.find(l => l.status !== 'completed');
          if (next) {
            return {
              success: true,
              output: `Next lesson in "${curriculum.title}":\n` +
                `Module: ${mod.title}\n` +
                `Lesson: ${next.title} (${next.type} · ${next.difficulty})` +
                (next.estimated_minutes ? ` ~${next.estimated_minutes}m` : '') +
                (next.status === 'needs_review' ? ' ⟳ RETRY' : '') +
                `\n[curriculum_id: ${curriculum.id}, lesson_id: ${next.id}]\n` +
                (next.content ? `\n\nReady to start? Use learning_teach with action "deliver".` : '\nNo content yet — use learning_teach with action "write_content" first.'),
              metadata: { curriculum_id: curriculum.id, lesson_id: next.id, type: next.type },
            };
          }
        }

        return { success: true, output: `"${curriculum.title}" is complete! 🎉 Congratulations to the user.` };
      }

      case 'needs_review': {
        const results: string[] = [];
        for (const curr of store.curriculums) {
          if (curr.status !== 'active') continue;
          const reviews = getLessonsForReview(curr);
          if (reviews.length > 0) {
            results.push(`**${curr.title}:**`);
            for (const r of reviews) {
              results.push(`  - ${r.lesson.title} (${r.module.title}) — ${r.lesson.review_count} reviews done`);
            }
          }
        }

        if (results.length === 0) {
          return { success: true, output: 'No lessons due for review. The spaced repetition schedule is on track.' };
        }

        return { success: true, output: `**Lessons due for review:**\n${results.join('\n')}` };
      }

      case 'search': {
        if (!query) return { success: false, output: 'query is required for search action' };
        const q = query.toLowerCase();
        const results: string[] = [];

        for (const curr of store.curriculums) {
          for (const mod of curr.modules) {
            for (const lesson of mod.lessons) {
              const matches =
                lesson.title.toLowerCase().includes(q) ||
                (lesson.content || '').toLowerCase().includes(q) ||
                lesson.tags.some(t => t.toLowerCase().includes(q));

              if (matches) {
                results.push(`- **${lesson.title}** [${lesson.type}] in ${curr.title} > ${mod.title} [id: ${lesson.id}]`);
              }
            }
          }
        }

        if (results.length === 0) {
          return { success: true, output: `No lessons found matching "${query}".` };
        }

        return { success: true, output: `**Search results for "${query}":**\n${results.join('\n')}` };
      }

      case 'stats': {
        let totalLessons = 0;
        let completedLessons = 0;
        let totalQuizzes = 0;
        let totalScore = 0;
        let scoredQuizzes = 0;
        let totalMinutesEstimated = 0;
        let totalReviews = 0;

        for (const curr of store.curriculums) {
          for (const mod of curr.modules) {
            for (const lesson of mod.lessons) {
              totalLessons++;
              if (lesson.status === 'completed') completedLessons++;
              if (lesson.type === 'quiz') totalQuizzes++;
              if (lesson.best_score !== null) { totalScore += lesson.best_score; scoredQuizzes++; }
              if (lesson.estimated_minutes) totalMinutesEstimated += lesson.estimated_minutes;
              totalReviews += lesson.review_count;
            }
          }
        }

        let totalTimeSpent = 0;
        for (const curr of store.curriculums) {
          for (const mod of curr.modules) {
            for (const lesson of mod.lessons) {
              totalTimeSpent += lesson.time_spent_minutes;
            }
          }
        }
        const spentH = Math.floor(totalTimeSpent / 60);
        const spentM = Math.round(totalTimeSpent % 60);

        return {
          success: true,
          output: `**Learning Statistics:**\n` +
            `Curriculums: ${store.curriculums.length} (${store.curriculums.filter(c => c.status === 'active').length} active)\n` +
            `Lessons: ${completedLessons}/${totalLessons} completed\n` +
            `Quizzes: ${totalQuizzes} (avg score: ${scoredQuizzes > 0 ? Math.round(totalScore / scoredQuizzes) : 'N/A'}%)\n` +
            `Estimated time: ~${Math.round(totalMinutesEstimated / 60)}h ${totalMinutesEstimated % 60}m\n` +
            `Actual time spent: ${spentH}h ${spentM}m\n` +
            `Reviews completed: ${totalReviews}\n` +
            `Current streak: ${store.streaks.current} days (longest: ${store.streaks.longest})`,
        };
      }

      case 'recommend': {
        const recs = generateRecommendations(store);
        if (recs.length === 0) {
          return { success: true, output: 'No recommendations yet. Complete some lessons and I\'ll suggest what to learn next.' };
        }
        return { success: true, output: `**Recommendations:**\n${recs.map((r, i) => `${i + 1}. ${r}`).join('\n')}` };
      }

      case 'certificate': {
        if (!currId) return { success: false, output: 'curriculum_id is required for certificate action' };
        const cert = store.curriculums.find(c => c.id === currId);
        if (!cert) return { success: false, output: `Curriculum not found: ${currId}` };
        if (cert.progress_percent < 100) {
          return { success: false, output: `Curriculum is ${Math.round(cert.progress_percent)}% complete. Finish all lessons to earn your certificate.` };
        }
        return { success: true, output: generateCertificate(cert) };
      }

      case 'library_search': {
        const query = args.query as string;
        if (!query) return { success: false, output: 'query is required for library_search' };

        const platformKey = (context.sharedState as Record<string, unknown>)?.platformKey as string | undefined;
        if (!platformKey) {
          return { success: true, output: 'The Learning Library is available on the Ava platform. Connect your account or browse the Library tab in your dashboard to explore curated and community learning paths.' };
        }

        try {
          const res = await fetch(`https://ava-supernova.com/api/learning/library?search=${encodeURIComponent(query)}&limit=5`, {
            headers: { 'Authorization': `Bearer ${platformKey}` },
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) return { success: false, output: 'Failed to search library' };
          const data = await res.json() as { paths: Array<{ title: string; subject: string; level: string; description: string; fork_count: number; rating_sum: number; rating_count: number; estimated_hours: number; source: string; id: string }> };
          if (!data.paths?.length) return { success: true, output: `No library paths found for "${query}". Try a different search term, or I can create a custom learning path for you.` };

          const results = data.paths.map((p, i) => {
            const rating = p.rating_count > 0 ? `${(p.rating_sum / p.rating_count).toFixed(1)}/5` : 'No ratings yet';
            const badge = p.source === 'curated' ? ' [Curated by Ava]' : '';
            return `${i + 1}. **${p.title}**${badge}\n   ${p.subject} · ${p.level} · ${p.estimated_hours || '?'}h · ${p.fork_count} learners · ${rating}\n   ${p.description?.slice(0, 120) || ''}`;
          }).join('\n\n');

          return { success: true, output: `**Learning Library — "${query}"**\n\n${results}\n\nSay "start [title]" to fork a path and begin learning, or I can create a custom one.` };
        } catch {
          return { success: false, output: 'Library search timed out. Try again or browse the Library tab in your dashboard.' };
        }
      }

      case 'library_recommend': {
        const platformKey = (context.sharedState as Record<string, unknown>)?.platformKey as string | undefined;
        const localRecs = generateRecommendations(store);
        let libraryRecs = '';

        if (platformKey) {
          try {
            const completedLevels = store.curriculums
              .filter(c => c.status === 'completed')
              .map(c => c.level);
            const nextLevel = completedLevels.includes('beginner') && !completedLevels.includes('intermediate')
              ? 'intermediate'
              : completedLevels.includes('intermediate') && !completedLevels.includes('advanced')
                ? 'advanced'
                : 'beginner';

            const res = await fetch(`https://ava-supernova.com/api/learning/library?sort=popular&level=${nextLevel}&limit=3`, {
              headers: { 'Authorization': `Bearer ${platformKey}` },
              signal: AbortSignal.timeout(5000),
            });
            if (res.ok) {
              const data = await res.json() as { paths: Array<{ title: string; subject: string; level: string; fork_count: number; source: string }> };
              if (data.paths?.length) {
                libraryRecs = '\n\n**From the Learning Library:**\n' + data.paths.map((p, i) => {
                  const badge = p.source === 'curated' ? ' [Curated]' : '';
                  return `${i + 1}. ${p.title}${badge} (${p.level}, ${p.fork_count} learners)`;
                }).join('\n');
              }
            }
          } catch { /* non-fatal */ }
        }

        const output = localRecs.length > 0
          ? localRecs.join('\n') + libraryRecs
          : libraryRecs
            ? 'Based on your learning history:' + libraryRecs
            : 'Start your first learning path! Say "teach me [topic]" or browse the Learning Library in your dashboard.';

        return { success: true, output };
      }

      default:
        return { success: false, output: `Unknown action: ${action}` };
    }
  }
}
