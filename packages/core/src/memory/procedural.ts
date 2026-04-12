/**
 * Procedural Learning — learns tool-use patterns from observation.
 *
 * Watches tool-call sequences across sessions. When the same pattern
 * appears 3+ times, it's "crystallised" into a ProceduralPattern that
 * can influence the task classifier and directness discipline.
 *
 * Example: if Ava builds React components by always doing
 * file_read → file_read → file_edit → bash (test) → git_commit,
 * and this happens 3 times in the same project, the pattern is
 * crystallised and future React component tasks get a directness
 * hint: "you typically follow this sequence for this task type."
 */

import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { logger } from '../core/logger.js';
import type { ProceduralPattern, ProceduralStore } from './types.js';
import {
  createEmptyProceduralStore,
  PROCEDURAL_MIN_OBSERVATIONS,
  PROCEDURAL_MIN_CONFIDENCE,
} from './types.js';

const PROCEDURES_FILENAME = 'procedures.json';

/** Minimum tool calls in a sequence to be worth tracking. */
const MIN_SEQUENCE_LENGTH = 3;
/** Maximum tool calls to consider (longer runs are truncated). */
const MAX_SEQUENCE_LENGTH = 20;

/**
 * ProceduralObserver — watches tool-call sequences and manages patterns.
 */
export class ProceduralObserver {
  private store: ProceduralStore;
  private dirty = false;
  private readonly storePath: string;

  constructor(readonly baseDir: string) {
    this.storePath = join(baseDir, PROCEDURES_FILENAME);
    this.store = createEmptyProceduralStore();
  }

  async load(): Promise<void> {
    if (!existsSync(this.storePath)) {
      this.store = createEmptyProceduralStore();
      return;
    }
    try {
      const raw = await readFile(this.storePath, 'utf-8');
      this.store = JSON.parse(raw) as ProceduralStore;
    } catch {
      this.store = createEmptyProceduralStore();
    }
  }

  async save(): Promise<void> {
    if (!this.dirty) return;
    try {
      this.store.lastModified = new Date().toISOString();
      await mkdir(dirname(this.storePath), { recursive: true });
      await writeFile(this.storePath, JSON.stringify(this.store, null, 2), 'utf-8');
      this.dirty = false;
    } catch (err) {
      logger.warn(`[procedural] Failed to save: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Observe a completed tool-call sequence from a session turn.
   * Called after each successful agent run (no errors).
   */
  observe(opts: {
    toolSequence: string[];
    taskType?: string;
    project?: string;
    sessionId?: string;
  }): ProceduralPattern | null {
    const { toolSequence, taskType, project } = opts;

    // Ignore short sequences
    if (toolSequence.length < MIN_SEQUENCE_LENGTH) return null;

    // Truncate long sequences
    const sequence = toolSequence.slice(0, MAX_SEQUENCE_LENGTH);

    // Generate a signature from the tool sequence
    const signature = this.computeSignature(sequence);

    // Look for existing pattern with the same signature
    const existing = this.store.patterns.find(p => {
      const existingSig = this.computeSignature(p.toolSequence);
      return existingSig === signature && p.project === (project ?? null);
    });

    if (existing) {
      // Reinforce existing pattern
      existing.observationCount++;
      existing.lastObservedAt = new Date().toISOString();
      existing.confidence = Math.min(1.0, existing.confidence + 0.15);

      // Check for crystallisation
      if (!existing.crystallised &&
          existing.observationCount >= PROCEDURAL_MIN_OBSERVATIONS &&
          existing.confidence >= PROCEDURAL_MIN_CONFIDENCE) {
        existing.crystallised = true;
        logger.info(`[procedural] Pattern crystallised: ${existing.taskType} (${existing.toolSequence.join(' → ')})`);
      }

      this.dirty = true;
      return existing;
    }

    // Create new pattern
    const pattern: ProceduralPattern = {
      id: randomUUID(),
      taskType: taskType ?? inferTaskType(sequence),
      project: project ?? null,
      toolSequence: sequence,
      argPatterns: {},
      observationCount: 1,
      confidence: 0.3,
      lastObservedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      linkedNodeIds: [],
      crystallised: false,
    };

    this.store.patterns.push(pattern);
    this.dirty = true;

    logger.debug(`[procedural] New pattern observed: ${pattern.taskType} (${sequence.join(' → ')})`);
    return pattern;
  }

  /** Get all crystallised patterns. */
  getCrystallised(): ProceduralPattern[] {
    return this.store.patterns.filter(p => p.crystallised);
  }

  /** Get patterns for a specific project. */
  getForProject(project: string): ProceduralPattern[] {
    return this.store.patterns.filter(p => p.project === project || p.project === null);
  }

  /** Get the most relevant pattern for a task type + project. */
  findBestPattern(taskType: string, project?: string): ProceduralPattern | null {
    const candidates = this.store.patterns
      .filter(p => p.crystallised && p.taskType === taskType)
      .filter(p => !project || p.project === project || p.project === null)
      .sort((a, b) => b.confidence - a.confidence);

    return candidates.length > 0 ? candidates[0] : null;
  }

  /** Get all patterns (for export / brain synthesis). */
  getAllPatterns(): ProceduralPattern[] {
    return [...this.store.patterns];
  }

  /** Compute a normalised signature from a tool sequence. */
  private computeSignature(sequence: string[]): string {
    // Normalise: collapse consecutive identical tools into one
    const collapsed: string[] = [];
    for (const tool of sequence) {
      if (collapsed.length === 0 || collapsed[collapsed.length - 1] !== tool) {
        collapsed.push(tool);
      }
    }
    return collapsed.join('|');
  }
}

/**
 * Infer a task type label from a tool-call sequence.
 * Heuristic: look at which tools dominate the sequence.
 */
function inferTaskType(sequence: string[]): string {
  const counts = new Map<string, number>();
  for (const tool of sequence) {
    counts.set(tool, (counts.get(tool) ?? 0) + 1);
  }

  const hasFileWrite = counts.has('file_write');
  const hasFileEdit = counts.has('file_edit');
  const hasBash = counts.has('bash');
  const hasTestRun = counts.has('test_run');
  const hasGitCommit = counts.has('git_commit');
  const hasWebSearch = counts.has('web_search');
  const hasGenerateImage = counts.has('generate_image');

  if (hasGenerateImage) return 'asset-generation';
  if (hasWebSearch && !hasFileEdit && !hasFileWrite) return 'research';
  if (hasTestRun) return 'test-driven';
  if (hasFileWrite && !hasFileEdit) return 'file-creation';
  if (hasFileEdit && hasBash) return 'edit-and-verify';
  if (hasFileEdit && hasGitCommit) return 'edit-and-commit';
  if (hasFileEdit) return 'editing';
  if (hasBash) return 'shell-task';

  return 'general';
}
