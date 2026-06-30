// Pure converter: a public Learning-Library path → a local Curriculum.
//
// Forking a curated/community course used to require a signed-in Ava account
// (the server fork bumps learner counts). But the course CONTENT is public, so
// there is no reason a BYOK / not-signed-in user can't start one. This builds
// the curriculum locally from the public path detail; the host writes it to
// ~/.ava/learning.json so it shows up in My Courses like any other course.
// Local-first; the server fork (analytics) becomes a best-effort extra.
//
// Pure + cross-env (extension host = node, IDE renderer = browser): uses only
// globalThis.crypto + Date, no node built-ins.

import type { Curriculum, Module, Lesson } from '../tools/learning.js';

/** Minimal shape of a public library path detail (matches the /learning/library/:id payload). */
export interface LibraryPathInput {
  title: string;
  description: string | null;
  subject: string;
  level: string;
  tags?: string[];
  goal: string | null;
  prerequisites?: string | null;
  estimated_hours: number | null;
  learning_objectives?: string[];
  target_audience?: string | null;
  content?: {
    modules: Array<{
      title: string;
      description?: string;
      lessons: Array<{ title: string; type?: string; difficulty?: string; content?: string }>;
    }>;
  };
}

function uid(): string {
  const g = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (g?.randomUUID) return g.randomUUID();
  return `lp-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

const LESSON_TYPES = new Set<Lesson['type']>(['concept', 'exercise', 'project', 'quiz', 'recap', 'challenge']);
function coerceType(t?: string): Lesson['type'] {
  return t && (LESSON_TYPES as Set<string>).has(t) ? (t as Lesson['type']) : 'concept';
}
const DIFFS = new Set<Lesson['difficulty']>(['easy', 'medium', 'hard']);
function coerceDiff(d?: string): Lesson['difficulty'] {
  return d && (DIFFS as Set<string>).has(d) ? (d as Lesson['difficulty']) : 'medium';
}

/**
 * Build a local Curriculum from a public library path. The first module is
 * `available`, the rest `locked` — progression unlocks them as lessons complete
 * (same shape the core learning tools and the dashboard player expect).
 */
export function libraryPathToCurriculum(path: LibraryPathInput, nowIso?: string): Curriculum {
  const now = nowIso ?? new Date().toISOString();

  const modules: Module[] = (path.content?.modules ?? []).map((m, mi) => ({
    id: uid(),
    title: m.title,
    description: m.description ?? null,
    status: mi === 0 ? 'available' : 'locked',
    progress_percent: 0,
    estimated_minutes: null,
    learning_objectives: [],
    lessons: (m.lessons ?? []).map((l) => ({
      id: uid(),
      title: l.title,
      content: l.content ?? null,
      type: coerceType(l.type),
      status: 'not_started',
      difficulty: coerceDiff(l.difficulty),
      estimated_minutes: null,
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
  }));

  return {
    id: uid(),
    title: path.title,
    description: path.description,
    subject: path.subject,
    level: path.level,
    goal: path.goal,
    estimated_hours: path.estimated_hours,
    status: 'active',
    progress_percent: 0,
    modules,
    tags: path.tags ?? [],
    created_at: now,
    updated_at: now,
    completed_at: null,
    adaptive_level: null,
    milestones: [
      { title: 'Quarter way!', at_percent: 25, reached: false, reached_at: null },
      { title: 'Halfway!', at_percent: 50, reached: false, reached_at: null },
      { title: 'Almost there!', at_percent: 75, reached: false, reached_at: null },
      { title: 'Complete!', at_percent: 100, reached: false, reached_at: null },
    ],
    curriculum_learning_objectives: path.learning_objectives ?? [],
    curriculum_prerequisites: path.prerequisites ?? '',
    target_audience: path.target_audience ?? '',
  };
}
