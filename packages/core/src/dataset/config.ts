/**
 * Dataset capture configuration.
 *
 * Lives at `<datasets-dir>/config.json`. Every knob is granular and
 * defaults OFF — there is no way to accidentally opt someone in.
 *
 * Schema:
 *   enabled              — master switch. If false, nothing is captured.
 *   capture_modes        — which modes emit to datasets. Empty = none.
 *   capture_datasets     — which of the 10 datasets get written. Empty = none.
 *   redact_patterns      — extra regex strings applied at the write boundary
 *                          on top of the built-in redactor defaults.
 *   min_trajectory_length — skip trajectories with fewer than N events.
 *                          Keeps noise (single-turn "hi" exchanges) out
 *                          of the training data.
 */

import { join, dirname } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { AvaMode } from './events.js';
import type { DatasetName } from './routing.js';

export interface DatasetConfig {
  enabled: boolean;
  capture_modes: AvaMode[];
  capture_datasets: DatasetName[];
  redact_patterns: string[];
  min_trajectory_length: number;
}

export const DEFAULT_CONFIG: DatasetConfig = {
  enabled: false,
  capture_modes: [],
  capture_datasets: [],
  redact_patterns: [],
  min_trajectory_length: 1,
};

// ─── Cache ──────────────────────────────────────────────────────────────────

interface Cache {
  path: string;
  config: DatasetConfig;
  readAt: number;
}

const CACHE_TTL_MS = 30_000;
let cache: Cache | null = null;

/** For tests and settings-UI writes. */
export function invalidateConfigCache(): void {
  cache = null;
}

// ─── Load / save ────────────────────────────────────────────────────────────

export async function loadDatasetConfig(configPath: string): Promise<DatasetConfig> {
  const now = Date.now();
  if (cache && cache.path === configPath && now - cache.readAt < CACHE_TTL_MS) {
    return cache.config;
  }

  try {
    const raw = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<DatasetConfig>;
    const config: DatasetConfig = { ...DEFAULT_CONFIG, ...parsed };
    cache = { path: configPath, config, readAt: now };
    return config;
  } catch {
    // Missing or corrupt file — default to all-off.
    cache = { path: configPath, config: DEFAULT_CONFIG, readAt: now };
    return DEFAULT_CONFIG;
  }
}

export async function saveDatasetConfig(configPath: string, config: DatasetConfig): Promise<void> {
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  cache = { path: configPath, config, readAt: Date.now() };
}

/** Convenience helper: standard path under a datasets directory. */
export function configPathFor(datasetsDir: string): string {
  return join(datasetsDir, 'config.json');
}
