/**
 * Brainstorm sessions — the thinking, kept locally.
 *
 * Two rules shape everything here, both settled with the operator on
 * 2026-08-20.
 *
 * **Always local.** Never in the repo — not even gitignored inside it.
 * `Decisions/drafts/` was considered and rejected: gitignored is usually safe,
 * not always, because the folder still sits in the project tree where a
 * `git add -f`, a zip, or a copied directory takes it along. These files live
 * under `~/.ava` where nothing can commit them, on any machine, ever.
 *
 * **Saved as you go, attached later.** Brainstorm mode exists for someone who
 * is not ready to commit yet — that IS the state — so nothing here waits for a
 * project to exist. Sessions persist unattached; creating a project moves the
 * session that produced it under that project. Requiring commitment before
 * anything is kept would lose exactly the sessions worth keeping.
 */

/** Where an idea got to. The ones that died are as useful as the ones that lived. */
export type BrainstormIdeaStatus = 'candidate' | 'chosen' | 'parked' | 'rejected';

export interface BrainstormIdea {
  id: string;
  title: string;
  /** A sentence or two — enough to recognise it months later. */
  summary: string;
  status: BrainstormIdeaStatus;
  /**
   * Why it was parked or rejected. The most valuable field in the file:
   * without it a returning session re-proposes what was already turned down,
   * and "you looked at this and dropped it" carries no information.
   */
  reason?: string;
  createdAt: string;
  updatedAt: string;
}

/** Which of the two conversations this was. */
export type BrainstormKind = 'blank' | 'evolve';

export interface BrainstormSession {
  version: 1;
  id: string;
  kind: BrainstormKind;
  /** What the session was about, in the user's terms. */
  headline: string;
  ideas: BrainstormIdea[];
  /** Threads worth keeping that are not ideas — constraints, tangents, context. */
  notes: string[];
  /** Absolute project path once attached. Undefined while unattached. */
  projectPath?: string;
  startedAt: string;
  updatedAt: string;
}

/** A session plus where it lives, for listing without loading everything. */
export interface BrainstormSessionSummary {
  id: string;
  kind: BrainstormKind;
  headline: string;
  ideaCount: number;
  /** Ideas still open — candidates and parked, not chosen or rejected. */
  openCount: number;
  attached: boolean;
  startedAt: string;
  updatedAt: string;
}
