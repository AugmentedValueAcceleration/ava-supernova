// Public surface for the learning subsystem's pure/data modules (safe to import
// from any surface that takes @ava/core — no node-side tool deps). The learning
// *tools* live in ../tools/learning.ts; this barrel exposes the derivation layer
// + the shared data types the Progression profile is built from.
export * from './progression.js';
export * from './progression-markdown.js';
export * from './learner-context.js';
export type { LearningStore, Curriculum, Module, Lesson, Milestone } from '../tools/learning.js';
