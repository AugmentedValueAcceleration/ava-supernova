/**
 * Mode-Aware Recall — category weighting profiles per Ava mode.
 *
 * Each of Ava's 7 modes has a different recall profile that scales
 * category scores during graph-based recall. Work mode weights technical
 * memories heavily; Chat mode weights personal; Teach mode weights
 * learning progress; etc.
 *
 * The weights are multipliers applied to the mode component of the
 * composite recall score (15% of total). A weight of 2.0 means that
 * category is twice as important in this mode; 0.3 means it's
 * de-prioritised but not excluded.
 */

import type { MemoryCategory, AvaMode } from './types.js';

/**
 * Category weight multipliers per mode. Higher = more relevant in this mode.
 * Scale: 0.2 (almost irrelevant) to 2.0 (highly prioritised).
 */
export const MODE_CATEGORY_WEIGHTS: Record<AvaMode, Record<MemoryCategory, number>> = {
  work: {
    health: 0.2,   // coding; how somebody trains is noise here
    architecture: 1.5,
    pattern: 1.5,
    'bug-fix': 1.3,
    convention: 1.3,
    decision: 1.2,
    'tool-config': 1.2,
    preference: 0.8,
    person: 0.3,
    general: 1.0,
  },
  chat: {
    health: 1.6,   // the room most likely to be asked "how am I doing"
    person: 2.0,
    preference: 1.5,
    general: 1.2,
    decision: 0.8,
    architecture: 0.3,
    pattern: 0.3,
    'bug-fix': 0.2,
    convention: 0.3,
    'tool-config': 0.2,
  },
  write: {
    health: 0.6,   // may be writing about themselves
    preference: 1.8,   // house style, voice, tone
    general: 1.4,
    decision: 1.2,     // what we decided about this document
    person: 1.0,       // audience / author context
    convention: 0.6,
    architecture: 0.3,
    pattern: 0.3,
    'bug-fix': 0.2,
    'tool-config': 0.3,
  },
  teach: {
    health: 0.5,   // relevant only when the subject is their own body
    pattern: 1.5,
    general: 1.3,
    convention: 1.3,
    person: 1.0,
    preference: 1.0,
    architecture: 0.8,
    'bug-fix': 0.8,
    decision: 0.8,
    'tool-config': 0.5,
  },
  security: {
    health: 0.1,   // never relevant, and the most sensitive data we hold
    'bug-fix': 2.0,
    architecture: 1.5,
    convention: 1.3,
    'tool-config': 1.2,
    pattern: 1.0,
    decision: 1.0,
    general: 0.8,
    preference: 0.3,
    person: 0.2,
  },
  plan: {
    health: 1.2,   // planning a week is exactly when this matters
    decision: 2.0,
    architecture: 1.5,
    general: 1.2,
    preference: 1.0,
    pattern: 0.8,
    'bug-fix': 0.8,
    convention: 0.8,
    person: 0.5,
    'tool-config': 0.5,
  },
  brainstorm: {
    health: 0.8,   // occasionally the subject
    person: 1.5,
    preference: 1.5,
    decision: 1.3,
    general: 1.3,
    architecture: 0.8,
    pattern: 0.5,
    'bug-fix': 0.3,
    convention: 0.3,
    'tool-config': 0.3,
  },
};
