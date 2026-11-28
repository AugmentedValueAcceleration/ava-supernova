import type { HealthPlanRecord } from '../health/types.js';
import type { GymSession } from '../health/session-types.js';
import type { LearningStore } from '../tools/learning.js';

/** The four areas of a person Ava keeps in view (his call, 27 Nov 2026). */
export const PROFILE_SECTIONS = ['learning', 'training', 'eating', 'projects'] as const;
export type ProfileSection = typeof PROFILE_SECTIONS[number];

/** 'everywhere' (the default) or only inside the section's own room. */
export type ProfileVisibility = Record<ProfileSection, 'everywhere' | 'room'>;

/** A project and what was last done in it, from memory's episodes. */
export interface ProjectWork {
  name: string;
  /** YYYY-MM-DD of the last day anything was recorded for it. */
  date: string;
  /** That day's lines for the project, as memory recorded them. */
  lines: string[];
}

/** What the profile files hold, as read from disk. */
export interface ProfileFiles {
  general: any;  // eslint-disable-line @typescript-eslint/no-explicit-any
  health: any;   // eslint-disable-line @typescript-eslint/no-explicit-any
  plans: HealthPlanRecord[];
  sessions: GymSession[];
  learning: { store: LearningStore | null; selfSkills: string[] };
  visibility: ProfileVisibility;
}

/** Everything the index and the lookup are built from. */
export interface ProfileSources extends ProfileFiles {
  projects: ProjectWork[];
}
