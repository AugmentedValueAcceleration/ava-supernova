// Public surface for the learning subsystem's pure/data modules (safe to import
// from any surface that takes @ava/core — no node-side tool deps). The learning
// *tools* live in ../tools/learning.ts; this barrel exposes the derivation layer
// + the shared data types the Progression profile is built from.
export * from './progression.js';
export * from './progression-markdown.js';
export * from './learner-context.js';
export { libraryPathToCurriculum, type LibraryPathInput, type LibraryLessonInput } from './library-fork.js';
export * from './course-store.js';
export { checkCourse, COURSE_REFUSAL_KINDS, SAFETY_LINE_CATEGORIES, ASK_AVA_EXEMPT_CATEGORIES, type CourseCheckInput, type CourseCheckResult, type CourseCheckFinding, type CourseFindingKind, type CheckLessonInput, type CheckModuleInput, type CheckStepInput } from './course-check.js';
export type { LearningStore, Curriculum, Module, Lesson, Milestone } from '../tools/learning.js';
