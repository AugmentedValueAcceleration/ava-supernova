/**
 * Brainstorms — the thinking, kept locally (plan Decisions/plans/2026-11-17-brainstorm.md).
 *
 * Rules settled with the operator:
 *
 * **Always local, never in a project** (2026-08-20, kept 2026-11-17). Not even
 * gitignored inside the repo: a `git add -f`, a zip or a copied folder takes it
 * along. Every brainstorm lives in ~/.ava/brainstorm, on any machine, ever.
 *
 * **Plans live outside projects; assigning is a link** (2026-11-17: "create
 * plans outside of a project but not part of a project"). A brainstorm can be
 * assigned to the project it's for, so Ava sees it while working there, but the
 * file never moves. (Until 17 Nov "attach" MOVED it into the project's notes;
 * those come back on first read.)
 *
 * **Plans are living** ("open to be evolved and furthered"): steps get ticked,
 * and what changed while building — and why — is written down beside them.
 *
 * **Any fragment of an idea.** Ava reads what KIND it is rather than making
 * anyone pick: a project, a feature, an experience (what their users should
 * feel — his word, chosen over "feeling" and "vibe"), a direction for an
 * existing project, or not sure yet.
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

/** What kind of fragment this was. */
export type BrainstormKind = 'project' | 'feature' | 'experience' | 'direction' | 'unsure';
export const BRAINSTORM_KINDS: BrainstormKind[] = ['project', 'feature', 'experience', 'direction', 'unsure'];
/** The two kinds there used to be, read as their new names. */
export type LegacyBrainstormKind = 'blank' | 'evolve';

/** One step of a plan: the small version first, the ambitious one after. */
export interface BrainstormStep {
  id: string;
  text: string;
  tier: 'small' | 'ambitious';
  done: boolean;
  doneAt?: string;
}

/** Something that happened to the plan after it was made. */
export interface BrainstormChange {
  at: string;
  /** changed — the plan changed while building (and why); new-idea — the work turned one up; note — anything else. */
  type: 'changed' | 'new-idea' | 'note';
  text: string;
  /** Where it came from: the brainstorm itself, or work in the assigned project. */
  from: 'brainstorm' | 'work';
}

export interface BrainstormPlan {
  /** What it is, in a sentence or two. */
  summary?: string;
  steps: BrainstormStep[];
  changes: BrainstormChange[];
}

/** A principle with what it means in practice. */
export interface ExperiencePrinciple {
  title: string;
  do: string;
  dont: string;
}

/** What their users should feel — saved to a brand kit when agreed. */
export interface BrainstormExperience {
  /** The words for it: calm, in control, gently encouraged. */
  words: string[];
  /** What it must NOT be: guilty, rushed, judged. */
  notWords: string[];
  principles: ExperiencePrinciple[];
  /** The brand kit it was saved to (proposed or agreed). */
  kitId?: string;
}

export interface BrainstormSession {
  version: 2;
  id: string;
  kind: BrainstormKind;
  /** What it's about, in the person's own terms. */
  headline: string;
  ideas: BrainstormIdea[];
  /** Threads worth keeping that are not ideas — constraints, tangents, context. */
  notes: string[];
  plan?: BrainstormPlan;
  experience?: BrainstormExperience;
  /** The project it's assigned to (absolute path). A link: the file stays in ~/.ava/brainstorm. */
  projectPath?: string;
  startedAt: string;
  updatedAt: string;
}

/** A brainstorm plus where it is, for listing without loading everything. */
export interface BrainstormSessionSummary {
  id: string;
  kind: BrainstormKind;
  headline: string;
  ideaCount: number;
  /** Ideas still open — candidates and parked, not chosen or rejected. */
  openCount: number;
  /** Plan steps done / all. */
  stepsDone: number;
  stepsTotal: number;
  hasExperience: boolean;
  /** Assigned project, if any. */
  projectPath?: string;
  /** @deprecated use projectPath. */
  attached: boolean;
  startedAt: string;
  updatedAt: string;
}
