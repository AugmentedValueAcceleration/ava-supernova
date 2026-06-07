// The task-first front door — what you want to do, in plain human words. The
// docs landing groups pages by these outcomes; the section taxonomy becomes the
// "go deeper" reference layer beneath them. Copy here is deliberately
// zero-jargon: it's the first thing a non-technical newcomer reads.

import type { TaskId } from '../types.js';

export interface TaskGroup {
  id: TaskId;
  /** Outcome-led title, second person, no product vocabulary. */
  title: string;
  /** One plain sentence on what you get. */
  blurb: string;
  /** Lightweight glyph hint; each surface maps it to its own icon set. */
  icon: string;
  /** Display order on the front door. */
  order: number;
}

export const TASKS: TaskGroup[] = [
  {
    id: 'build',
    title: 'Build something',
    blurb: 'Turn an idea into a working app, website, or feature — Ava plans it, writes it, and checks it.',
    icon: 'hammer',
    order: 10,
  },
  {
    id: 'write',
    title: 'Write a document',
    blurb: 'Get a real report, proposal, or letter written and exported as Word or PDF — no formatting fuss.',
    icon: 'pencil',
    order: 20,
  },
  {
    id: 'learn',
    title: 'Learn something new',
    blurb: 'Ask Ava to teach you anything and she builds a course and walks you through it, step by step.',
    icon: 'graduation',
    order: 30,
  },
  {
    id: 'create',
    title: 'Make images, music & video',
    blurb: 'Generate artwork, soundtracks, voiceovers, and clips — and drop them straight into your work.',
    icon: 'palette',
    order: 40,
  },
  {
    id: 'health',
    title: 'Look after your health',
    blurb: 'Build workout and meal plans from a real library, and track how you’re going.',
    icon: 'heart',
    order: 50,
  },
  {
    id: 'make-it-yours',
    title: 'Make Ava yours & private',
    blurb: 'Give Ava a personality, choose your models, and keep everything on your own machine.',
    icon: 'sliders',
    order: 60,
  },
  {
    id: 'troubleshoot',
    title: 'When something goes wrong',
    blurb: 'Fixes for the common snags — sign-in, models, credits, and getting unstuck.',
    icon: 'lifebuoy',
    order: 70,
  },
];

const BY_ID: Record<TaskId, TaskGroup> = Object.fromEntries(
  TASKS.map(t => [t.id, t]),
) as Record<TaskId, TaskGroup>;

/** Tasks in display order. */
export function getTasks(): TaskGroup[] {
  return [...TASKS].sort((a, b) => a.order - b.order);
}

export function getTask(id: TaskId): TaskGroup | undefined {
  return BY_ID[id];
}
