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
  /** ISO country code when the subject IS its jurisdiction — law, tax,
   *  benefits, anything where the country is the content rather than the
   *  setting. Null for every other course. */
  region?: string | null;
  /** True when the course must NOT be translated: it is tied to a place, not
   *  a language. "Everyday law in Germany" in Polish would read as though it
   *  applied in Poland. */
  locale_bound?: boolean;
  seed_id?: string | null;
  /**
   * The full course this is the FIRST INSTALMENT of.
   *
   * Given, the gate lets the course land short — one module is enough — so
   * that a course can be BORN small and grown. Without it, write_course holds
   * the full standard, because a course with no plan is claiming to be done.
   */
  plan?: CoursePlanLesson[];
}

/** Rewrite one part of an existing course. Indices are 0-based here; the
 *  tool takes them 1-based, the way the check reports them. Whatever is given
 *  replaces that part whole. */
/**
 * One entry in a course's build plan: a lesson that is meant to exist.
 *
 * The plan is authoring scaffolding, not course content. It is what lets a
 * long course be written a piece at a time without losing the thread — and
 * what lets the tools say "6 of 14 written, next is module 3 lesson 2"
 * instead of leaving it to be remembered across a run.
 */
export interface CoursePlanLesson {
  module: string;
  lesson: string;
}

export interface CourseBuildPlan {
  lessons: CoursePlanLesson[];
  /** When the plan was set, so a stale one is visible as stale. */
  set_at: string;
}

/** A finding's life after it is reported. A skip is a DECISION, kept visible. */
export type ReviewFindingState = 'proposed' | 'applied' | 'skipped';

export interface StoredReviewFinding {
  id: string;
  kind: string;
  location: { module_index?: number; lesson_index?: number; step_index?: number; field: string };
  message: string;
  fix?: { from: string; to: string };
  state: ReviewFindingState;
  /** When it stopped being `proposed`, and what the change did. */
  decided_at?: string | null;
  note?: string | null;
}

export interface CourseReview {
  course_id: string;
  reviewed_at: string;
  /** The model that read it. Kept because a change of model changes the reading. */
  model: string | null;
  findings: StoredReviewFinding[];
  /** The reviewer's own sentence about the course as a whole. */
  summary: string | null;
  /** The course's `updated_at` when it was read. Kept for the record only. */
  course_updated_at: string | null;
  /**
   * A hash of the course's CONTENT when it was read — and the actual test for
   * whether this review still describes it.
   *
   * `updated_at` was the test first, and it moves for writes that do not touch
   * a word of the course: storing a gate verdict, stamping last_reviewed_at.
   * So a check run after a review invalidated the review, and every Apply
   * button went dead on work that was perfectly current (25 Sep 2026).
   */
  content_hash?: string | null;
}

export interface CourseRevision {
  meta?: Partial<Pick<CourseInput, 'title' | 'description' | 'category' | 'subject' | 'level' | 'audience_type' | 'goal' | 'prerequisites' | 'target_audience' | 'estimated_hours' | 'learning_objectives' | 'tags' | 'cover_image_prompt' | 'region' | 'locale_bound'>>;
  /** Replace every module. */
  modules?: CourseModuleInput[];
  /** Replace one module. */
  module?: { index: number } & Partial<CourseModuleInput>;
  /** Replace one lesson. */
  lesson?: { module_index: number; index: number } & Partial<CourseLessonInput>;
  /** Replace one step. */
  step?: { module_index: number; lesson_index: number; index: number; step: CourseStepInput };

  /*
   * ── Appending ─────────────────────────────────────────────────────────
   *
   * Every operation above REPLACES something at a known index, which means
   * growing a course meant resending the whole of whatever was being grown:
   * a fourth module required all four, a seventh lesson required that
   * module's every lesson and every step inside them.
   *
   * On 25 Sep 2026 that made a real course unwritable. Ava tried nineteen
   * times to land a Git course, each attempt the entire syllabus in one
   * call, each one cut off in transit — because the tools gave her no way to
   * add a piece to something that already existed. She said so herself,
   * correctly, and kept trying the only move she had.
   *
   * These three add ONE thing to the end. The largest call needed to build
   * any course, of any size, is now a single lesson.
   */

  /** Append a module. With `at_index`, insert before that module instead. */
  add_module?: { at_index?: number } & CourseModuleInput;
  /** Append a lesson to a module. With `at_index`, insert before that lesson. */
  add_lesson?: { module_index: number; at_index?: number } & CourseLessonInput;
  /** Append a step to a lesson. With `at_index`, insert before that step. */
  add_step?: { module_index: number; lesson_index: number; at_index?: number; step: CourseStepInput };

  /** Set or replace the build plan. Never touches the course itself. */
  plan?: CoursePlanLesson[];

  /**
   * Review findings this change answers, marked resolved once it lands.
   *
   * For the conversational path — a `raise` talked through and then fixed.
   * The operator's Apply button does NOT come through here: it computes the
   * revision from the finding with `reviewFindingToRevision` and applies it
   * directly, so approving a repair costs nothing and does exactly what the
   * card said.
   */
  resolves?: string[];
}

export interface CourseSnapshot {
  /** The build plan, when one was set. Authoring scaffolding — never shown to a learner. */
  build_plan?: CourseBuildPlan | null;
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
  region: string | null;
  locale_bound: boolean;
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
  /** Set only when the subject IS its jurisdiction. */
  region?: string | null;
  locale_bound?: boolean;
}

export interface CategoryProposal {
  name: string;
  reason: string;
}

export type IdentifiedId =
  /** A seed in the backlog — and the course written from it, if there is one. */
  | { kind: 'seed'; title: string; courseId: string | null }
  /** Well-formed, but nothing in the library has it. */
  | { kind: 'unknown' }
  /** Not a uuid at all. */
  | { kind: 'malformed' }
  /** The lookup itself failed — NOT the same as "not found", and saying so
   *  stops a database problem being read as a missing course. */
  | { kind: 'lookup_failed'; error: string };

export interface CourseStore {
  /** Land a course as a DRAFT. The tool has already run the gate. */
  /**
   * `seed` says what became of the seed_id: whether a seed was actually
   * taken off the backlog, or the id matched nothing. A silent no-op here
   * let a report announce a seed cleared that had never existed.
   */
  save(course: CourseInput): Promise<{ id: string | null; error?: string; seed?: { consumed: boolean; note?: string } }>;
  readCourse(courseId: string): Promise<CourseSnapshot | null>;
  findCourse(query: string): Promise<CourseMatch[]>;
  /** Count plus a sample — the count is what stops an empty search reading as
   *  an empty library. */
  browseCourses(limit: number, category?: string): Promise<{ total: number; sample: CourseMatch[] }>;

  /** Record a reading of the course. Replaces any previous review of it. */
  saveReview(review: Omit<CourseReview, 'reviewed_at'>): Promise<{ ok: boolean; error?: string }>;
  /** The last review, or null if it has never been read. */
  readReview(courseId: string): Promise<CourseReview | null>;
  /**
   * Apply one approved finding. Deterministic and model-free: the revision is
   * computed from the finding, so what lands is what the card showed — and it
   * refuses if the course has moved since the review.
   */
  applyReviewFinding(courseId: string, findingId: string): Promise<{ ok: boolean; error?: string; applied?: string }>;
  /** Turn one down. It stays visible as a decision, so a re-review does not raise it again. */
  skipReviewFinding(courseId: string, findingId: string, note?: string): Promise<{ ok: boolean; error?: string }>;
  /**
   * Throw the review away entirely, so the course reads as never reviewed.
   *
   * A review that cannot be cleared is a review that accumulates: every
   * finding decided long ago stays on the card, and the rail can never return
   * to a clean state. Discarding is not the same as skipping everything —
   * skipping records a decision, this says the reading itself is no longer
   * the one to work from.
   */
  discardReview(courseId: string): Promise<{ ok: boolean; error?: string }>;
  /** Re-run the gate on a stored course and write the verdict on the row. */
  recheck(courseId: string): Promise<CourseCheckResult | null>;
  /** Rewrite one part in place. Refused only for findings it would ADD —
   *  compared against the course's existing findings, never a clean slate. */
  /**
   * `added` names where an add_* landed — "lesson 3 \"Branches\" in module 2"
   * — because the next call addresses it by index, and guessing the index is
   * how a growing course gets written over instead of extended.
   */
  reviseCourse(courseId: string, revision: CourseRevision): Promise<{ ok: boolean; error?: string; findings?: CourseCheckFinding[]; added?: string }>;
  regenerateCover(courseId: string, prompt: string): Promise<{ ok: boolean; url?: string; error?: string }>;
  /** Fill every locale. Reports what is still missing rather than claiming done. */
  translate(courseId: string): Promise<{ ok: boolean; locales: number; missing: string[]; error?: string }>;
  /** Propose seeds for the backlog — grounded in the library's actual
   *  coverage — and write them to it, so the hub's Seeds rail shows them. */
  proposeSeeds(brief: { category?: string; level?: string; audience?: string; count?: number }): Promise<CourseSeedSuggestion[]>;
  proposeCategory(proposal: CategoryProposal): Promise<{ ok: boolean; error?: string; existing?: string }>;
  listCategories(): Promise<Array<{ slug: string; name: string }>>;
  /** What IS this id? Asked only when a course lookup came back empty, so
   *  "no course with that id" can say something useful instead of ending the
   *  trail. A seed id is the common confusion — it is the id printed in the
   *  brief, right next to the one the tool wants. */
  identify(id: string): Promise<IdentifiedId>;
}
