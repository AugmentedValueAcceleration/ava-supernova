/**
 * Dataset capture consumer.
 *
 * Subscribes to every event on the `avaEvents` bus, applies the opt-in
 * config gates, redacts payloads, and appends the event as a JSONL line
 * to `<datasetsDir>/<dataset-name>/YYYY-MM-DD.jsonl`.
 *
 * Safety properties:
 *   - Pure-functional from the agent's POV. We only read events the
 *     emitter handed us (already structuredClone'd), never the live
 *     conversation. The multi-writer corruption that disabled the
 *     previous implementation is impossible here by construction.
 *   - Per-file mutex serialises concurrent appends. Two agent
 *     instances writing to the same daily file cannot interleave
 *     half-lines.
 *   - All errors are swallowed and logged — dataset capture failing
 *     never takes down chat.
 */

import { join } from 'node:path';
import { mkdir, appendFile } from 'node:fs/promises';
import { AVA_HOME } from '../core/constants.js';
import { logger } from '../core/logger.js';
import { avaEvents } from './emitter.js';
import { eventToDataset } from './routing.js';
import { loadDatasetConfig, configPathFor } from './config.js';
import { redactValue } from './redactor.js';
import type { AvaEvent } from './events.js';

// ─── Per-file mutex ─────────────────────────────────────────────────────────

const fileLocks = new Map<string, Promise<unknown>>();

/**
 * Serialise async work against a single path. Each call queues behind
 * the previous one for the same path. Different paths run in parallel.
 */
async function withFileLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
  const prev = fileLocks.get(path) ?? Promise.resolve();
  const next = prev.then(fn, fn); // run fn whether prev resolved or rejected
  fileLocks.set(path, next.catch(() => undefined));
  return next;
}

/**
 * Wait for every pending file write to finish. Test-only — production
 * code never needs to block on capture.
 */
export async function drainPendingWrites(): Promise<void> {
  // Snapshot the current chain heads, then await them. New writes that
  // arrive after this snapshot are deliberately not awaited — caller
  // controls ordering.
  const chains = Array.from(fileLocks.values());
  await Promise.allSettled(chains);
}

// ─── Path helpers ───────────────────────────────────────────────────────────

function dailyFilePath(datasetsDir: string, datasetName: string, isoTimestamp: string): string {
  const date = isoTimestamp.slice(0, 10); // YYYY-MM-DD
  return join(datasetsDir, datasetName, `${date}.jsonl`);
}

// ─── Install ────────────────────────────────────────────────────────────────

export interface ConsumerOptions {
  /** Override for tests. Defaults to ~/.ava/datasets */
  datasetsDir?: string;
}

let installedUnsubscribe: (() => void) | null = null;

/**
 * Subscribe the dataset consumer to the event bus. Idempotent — calling
 * it twice is a no-op. Returns an unsubscribe function for tests.
 */
export function installDatasetConsumer(opts: ConsumerOptions = {}): () => void {
  if (installedUnsubscribe) return installedUnsubscribe;

  const datasetsDir = opts.datasetsDir ?? join(AVA_HOME, 'datasets');
  const configPath = configPathFor(datasetsDir);

  const off = avaEvents.onAll(async (event) => {
    await handleEvent(event, datasetsDir, configPath);
  });

  installedUnsubscribe = () => {
    off();
    installedUnsubscribe = null;
  };

  logger.debug('[dataset] consumer installed');
  return installedUnsubscribe;
}

// ─── Per-event handler ──────────────────────────────────────────────────────

async function handleEvent(
  event: AvaEvent,
  datasetsDir: string,
  configPath: string,
): Promise<void> {
  try {
    const config = await loadDatasetConfig(configPath);
    if (!config.enabled) return;
    if (!config.capture_modes.includes(event.mode)) return;

    const dataset = eventToDataset(event.event_type);
    if (!config.capture_datasets.includes(dataset)) return;

    const safe = redactValue(event, config.redact_patterns);
    const filePath = dailyFilePath(datasetsDir, dataset, event.timestamp);

    await withFileLock(filePath, async () => {
      await mkdir(join(datasetsDir, dataset), { recursive: true });
      await appendFile(filePath, JSON.stringify(safe) + '\n', 'utf-8');
    });
  } catch (err) {
    logger.debug(
      `[dataset] write failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
