/**
 * Memory System Configuration — centralised thresholds and constants.
 *
 * All similarity thresholds, timing constants, and limits in one place.
 * Prevents the same concept from having different values in different modules.
 */

// ── Similarity Thresholds (TF-IDF cosine similarity, 0-1) ──────────────────

/** Conflict detection — update existing instead of creating duplicate (global/workflow) */
export const CONFLICT_THRESHOLD = 0.45;

/** Conflict detection for project scope — stricter to avoid over-merging */
export const CONFLICT_THRESHOLD_PROJECT = 0.6;

/** Consolidation — merge candidates during 4-phase cleanup */
export const MERGE_THRESHOLD = 0.7;

/** Recall — minimum score to include in search results */
export const RECALL_THRESHOLD = 0.25;

/** Consolidation grouping — looser than merge for initial clustering */
export const CONSOLIDATION_THRESHOLD = 0.35;

/** Self-improvement — match existing learning to update instead of duplicate */
export const SELF_IMPROVEMENT_SIMILARITY = 0.6;

// ── Timing Constants ────────────────────────────────────────────────────────

/** Days without recall before a memory is considered stale */
export const STALE_DAYS = 90;

/** Days before auto-archiving stale memories */
export const AUTO_ARCHIVE_DAYS = 180;

/** Hours between consolidation runs */
export const CONSOLIDATION_INTERVAL_HOURS = 24;

/** Minimum sessions since last consolidation */
export const CONSOLIDATION_MIN_SESSIONS = 5;

/** Recency half-life for relevance scoring (days) */
export const RECENCY_HALF_LIFE_DAYS = 30;

// ── Limits ──────────────────────────────────────────────────────────────────

/** Maximum entries per memory scope before archiving kicks in */
export const MAX_ENTRIES_PER_SCOPE = 500;

/** Maximum memory store size in bytes before pruning */
export const MAX_STORE_SIZE_BYTES = 25 * 1024;

/** Maximum self-improvement learnings stored */
export const MAX_LEARNINGS = 200;

/** Maximum memories extracted per LLM reflection */
export const MAX_REFLECTION_MEMORIES = 7;

// ── Relevance Scoring Weights ───────────────────────────────────────────────

/** TF-IDF match quality weight */
export const W_TFIDF = 0.55;

/** Recency weight (how recently updated/recalled) */
export const W_RECENCY = 0.25;

/** Frequency weight (how often recalled) */
export const W_FREQUENCY = 0.20;

// ── Pattern Detection ───────────────────────────────────────────────────────

/** Days before an unconfirmed pattern accumulation expires */
export const PATTERN_STALE_DAYS = 30;

/** Number of independent occurrences needed to promote a pattern to memory */
export const PATTERN_PROMOTION_THRESHOLD = 2;
