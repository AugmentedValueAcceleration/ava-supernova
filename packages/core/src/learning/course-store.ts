// The Classroom's store contract — what the room's tools need from the
// platform, the way ExerciseStore is what the Gym's need. Core owns the
// shape and the gate; the platform owns the rows.

import type { LessonStep } from '../tools/learning.js';
import type { CourseCheckResult, CourseCheckFinding } from './course-check.js';

export const COURSE_LEVELS = ['beginner', 'intermediate', 'advanced', 'mixed'] as const;
export type CourseLevel = (typeof COURSE_LEVELS)[number];

/** Who the course is for — the axis exam prep, school and career change live
 *  on. A category says what; this says who. */
export const COURSE_AUDIENCES = [
  'Personal interest', 'School', 'Exam prep', 'College or university', 'Career change', 'Professional development',
] as const;
export type CourseAudience = (typeof COURSE_AUDIENCES)[number];

export const LESSON_TYPES = ['concept', 'exercise', 'project', 'quiz', 'recap', 'challenge'] as const;
export const LESSON_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

/** A step as authored: the teaching half of LessonStep. Progress is the learner's. */
export type CourseStepInput = Pick<LessonStep, 'teach' | 'interaction'> & { feedback?: LessonStep['feedback'] };

export interface CourseLessonInput {
  title: string;
  type?: (typeof LESSON_TYPES)[number];
  difficulty?: (typeof LESSON_DIFFICULTIES)[number];
  estimated_minutes?: number | null;
  learning_objectives?: string[];
  steps: CourseStepInput[];
}

export interface CourseModuleInput {
  title: string;
  description?: string | null;
  lessons: CourseLessonInput[];
}

export interface CourseInput {
  title: string;
  description: string;
  /** Category slug from course_categories. */
  category: string;
  subject: string;
  level: CourseLevel;
  audience_type: CourseAudience;
  goal?: string | null;
  prerequisites: string;
  target_audience: string;
  estimated_hours?: number | null;
  learning_objectives: string[];
  tags?: string[];
  modules: CourseModuleInput[];
  /** A scene for THIS course — a person doing the thing, not a room. */
  cover_image_prompt?: string | null;
  seed_id?: string | null;
}

/** Rewrite one part of an existing course. Indices are 0-based here; the
 *  tool takes them 1-based, the way the check reports them. Whatever is given
 *  replaces that part whole. */
export interface CourseRevision {
  meta?: Partial<Pick<CourseInput, 'title' | 'description' | 'category' | 'subject' | 'level' | 'audience_type' | 'goal' | 'prerequisites' | 'target_audience' | 'estimated_hours' | 'learning_objectives' | 'tags' | 'cover_image_prompt'>>;
  /** Replace every module. */
  modules?: CourseModuleInput[];
  /** Replace one module. */
  module?: { index: number } & Partial<CourseModuleInput>;
  /** Replace one lesson. */
  lesson?: { module_index: number; index: number } & Partial<CourseLessonInput>;
  /** Replace one step. */
  step?: { module_index: number; lesson_index: number; index: number; step: CourseStepInput };
}

export interface CourseSnapshot {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  subject: string;
  level: string;
  audience_type: string | null;
  goal: string | null;
  prerequisites: string | null;
  target_audience: string | null;
  estimated_hours: number | null;
  learning_objectives: string[];
  tags: string[];
  status: string;
  modules: CourseModuleInput[];
  cover: { exists: boolean; prompt: string | null };
  translations: { locales: number; missing: string[] };
  validation?: CourseCheckResult;
}

export interface CourseMatch {
  id: string;
  title: string;
  subject: string;
  category: string | null;
  level: string;
  status: string;
}

export interface CourseSeedSuggestion {
  title: string;
  subject: string;
  category: string;
  level: CourseLevel;
  audience_type: CourseAudience;
  goal: string;
  why: string;
}

export interface CategoryProposal {
  name: string;
  reason: string;
}

export interface CourseStore {
  /** Land a course as a DRAFT. The tool has already run the gate. */
  save(course: CourseInput): Promise<{ id: string | null; error?: string }>;
  readCourse(courseId: string): Promise<CourseSnapshot | null>;
  findCourse(query: string): Promise<CourseMatch[]>;
  /** Count plus a sample — the count is what stops an empty search reading as
   *  an empty library. */
  browseCourses(limit: number, category?: string): Promise<{ total: number; sample: CourseMatch[] }>;
  /** Re-run the gate on a stored course and write the verdict on the row. */
  recheck(courseId: string): Promise<CourseCheckResult | null>;
  /** Rewrite one part in place. Refused only for findings it would ADD —
   *  compared against the course's existing findings, never a clean slate. */
  reviseCourse(courseId: string, revision: CourseRevision): Promise<{ ok: boolean; error?: string; findings?: CourseCheckFinding[] }>;
  regenerateCover(courseId: string, prompt: string): Promise<{ ok: boolean; url?: string; error?: string }>;
  /** Fill every locale. Reports what is still missing rather than claiming done. */
  translate(courseId: string): Promise<{ ok: boolean; locales: number; missing: string[]; error?: string }>;
  /** Propose seeds for the backlog — grounded in the library's actual
   *  coverage — and write them to it, so the hub's Seeds rail shows them. */
  proposeSeeds(brief: { category?: string; level?: string; audience?: string; count?: number }): Promise<CourseSeedSuggestion[]>;
  proposeCategory(proposal: CategoryProposal): Promise<{ ok: boolean; error?: string; existing?: string }>;
  listCategories(): Promise<Array<{ slug: string; name: string }>>;
}
