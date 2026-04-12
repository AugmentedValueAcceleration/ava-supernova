/**
 * Per-project configuration persisted at `<projectRoot>/.ava/project-config.json`.
 *
 * Small, typed JSON file that stores per-project state Ava needs across
 * sessions — Decisions folder opt-in status, first-run flags, and whatever
 * else grows here. Committed to git alongside the project, so answers given
 * on one machine apply on every machine.
 */

import { existsSync } from 'node:fs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';

export type DecisionsOptInStatus = 'opted-in' | 'opted-out' | 'not-asked';

export interface ProjectConfig {
  /** Per-project Decisions folder opt-in state. See project.ts docs. */
  decisionsOptIn?: DecisionsOptInStatus;
}

const DEFAULT_CONFIG: ProjectConfig = {
  decisionsOptIn: 'not-asked',
};

export function getProjectConfigPath(projectRoot: string): string {
  return join(projectRoot, '.ava', 'project-config.json');
}

export async function loadProjectConfig(projectRoot: string): Promise<ProjectConfig> {
  const path = getProjectConfigPath(projectRoot);
  if (!existsSync(path)) return { ...DEFAULT_CONFIG };
  try {
    const raw = await readFile(path, 'utf-8');
    const parsed = JSON.parse(raw) as ProjectConfig;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveProjectConfig(
  projectRoot: string,
  patch: Partial<ProjectConfig>,
): Promise<void> {
  const path = getProjectConfigPath(projectRoot);
  await mkdir(dirname(path), { recursive: true });

  const existing = await loadProjectConfig(projectRoot);
  const next: ProjectConfig = { ...existing, ...patch };
  await writeFile(path, JSON.stringify(next, null, 2) + '\n', 'utf-8');
}
