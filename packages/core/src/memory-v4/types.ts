/**
 * Memory v4 — the shapes.
 *
 * One store of plain Markdown files the person can open and read. Everything
 * here describes those files; nothing is authoritative except the files
 * themselves (search indexes are derived and rebuildable).
 *
 * Plan: Decisions/plans/2026-11-15-memory-v4.md (private).
 */

/** What a fact is about. Decides how it is used, not where it lives. */
export type FactKind = 'person' | 'preference' | 'rule' | 'project' | 'event';
export const FACT_KINDS: readonly FactKind[] = ['person', 'preference', 'rule', 'project', 'event'];

/**
 * Where a fact came from. The difference between "he told me" and "I guessed"
 * is the whole point: an inferred fact is held in pending/ until he says yes.
 */
export type FactSource = 'said' | 'file' | 'tool' | 'inferred';
export const FACT_SOURCES: readonly FactSource[] = ['said', 'file', 'tool', 'inferred'];

/** `everywhere` (about the person / how they work) or one project's id. */
export type FactScope = 'everywhere' | `project:${string}`;

/** Which folder a fact file is in. */
export type FactState = 'fact' | 'pending' | 'history';

export interface Fact {
  /** File slug, also the id. Stable for the life of the fact. */
  id: string;
  kind: FactKind;
  scope: FactScope;
  source: FactSource;
  /** The person's own words, when source is `said`. */
  quote?: string;
  /** Date the fact became true (YYYY-MM-DD). */
  from: string;
  /** Date the person confirmed it (an inferred fact counts only once set). */
  confirmed?: string;
  /** Id of the fact this one replaced. */
  replaces?: string;
  /** Set on history entries: the last day it was true, and what replaced it. */
  until?: string;
  supersededBy?: string;
  tags?: string[];
  /** The fact itself, in plain words. */
  text: string;
  state: FactState;
}

/** Input for a new fact. Everything optional except the text. */
export interface NewFact {
  text: string;
  kind?: FactKind;
  scope?: FactScope;
  source?: FactSource;
  quote?: string;
  from?: string;
  tags?: string[];
  /**
   * Set when the person has already confirmed it (e.g. approved on the
   * migration review page): an inferred fact with this is a fact, not pending.
   */
  confirmed?: string;
}

export interface Thread {
  id: string;
  text: string;
  /** Project id, or absent for things that aren't tied to one. */
  project?: string;
  added: string;
  due?: string;
  done?: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  /** Every path this project has been opened from (it can move). */
  paths: string[];
  /** Ids of projects declared connected to this one. */
  links: string[];
}

/** Core is always in front of Ava, so it has a hard limit. */
export const CORE_TOKEN_BUDGET = 1500;
