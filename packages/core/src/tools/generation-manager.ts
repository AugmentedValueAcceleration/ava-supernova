/**
 * GenerationManager — tracks creative generation jobs across the session.
 *
 * Jobs persist in memory on the extension/IDE host so they survive
 * page navigation. State is written to ~/.ava/generation-jobs.json
 * so in-flight jobs can be recovered after a restart.
 *
 * The generation tools register their jobs here before starting work.
 * The extension/IDE reads active jobs to show global progress.
 */

import { join } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { AVA_HOME } from '../core/constants.js';
import { logger } from '../core/logger.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export type GenerationType = 'image' | 'video' | 'music' | 'voice' | 'background-removal';

export type GenerationStatus = 'queued' | 'generating' | 'downloading' | 'complete' | 'failed';

export interface GenerationJob {
  id: string;
  type: GenerationType;
  status: GenerationStatus;
  prompt: string;
  filename: string;
  targetPath: string;
  progress: number; // 0-100
  startedAt: string;
  completedAt?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export type GenerationEventHandler = (jobs: GenerationJob[]) => void;

// ─── Manager ────────────────────────────────────────────────────────────────

const JOBS_PATH = join(AVA_HOME, 'generation-jobs.json');

export class GenerationManager {
  private jobs = new Map<string, GenerationJob>();
  private listeners = new Set<GenerationEventHandler>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Register a new generation job. Call this before starting the API request.
   */
  create(job: Omit<GenerationJob, 'status' | 'progress' | 'startedAt'>): GenerationJob {
    const full: GenerationJob = {
      ...job,
      status: 'queued',
      progress: 0,
      startedAt: new Date().toISOString(),
    };
    this.jobs.set(job.id, full);
    this.emit();
    this.debounceSave();
    return full;
  }

  /**
   * Update a job's status and progress.
   */
  update(id: string, patch: Partial<Pick<GenerationJob, 'status' | 'progress' | 'error' | 'completedAt' | 'metadata'>>): void {
    const job = this.jobs.get(id);
    if (!job) return;
    Object.assign(job, patch);
    if (patch.status === 'complete' || patch.status === 'failed') {
      job.completedAt = job.completedAt || new Date().toISOString();
    }
    this.emit();
    this.debounceSave();
  }

  /**
   * Mark a job as complete with final metadata.
   */
  complete(id: string, metadata?: Record<string, unknown>): void {
    this.update(id, { status: 'complete', progress: 100, metadata, completedAt: new Date().toISOString() });
  }

  /**
   * Mark a job as failed.
   */
  fail(id: string, error: string): void {
    this.update(id, { status: 'failed', error });
  }

  /**
   * Get all active (non-complete, non-failed) jobs.
   */
  getActive(): GenerationJob[] {
    return Array.from(this.jobs.values()).filter(j => j.status !== 'complete' && j.status !== 'failed');
  }

  /**
   * Get all jobs (including completed).
   */
  getAll(): GenerationJob[] {
    return Array.from(this.jobs.values()).sort((a, b) =>
      new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }

  /**
   * Get a specific job by ID.
   */
  get(id: string): GenerationJob | undefined {
    return this.jobs.get(id);
  }

  /**
   * Clear completed/failed jobs older than the given age (default 1 hour).
   */
  cleanup(maxAgeMs = 3600_000): void {
    const now = Date.now();
    for (const [id, job] of this.jobs) {
      if ((job.status === 'complete' || job.status === 'failed') && job.completedAt) {
        if (now - new Date(job.completedAt).getTime() > maxAgeMs) {
          this.jobs.delete(id);
        }
      }
    }
    this.emit();
    this.debounceSave();
  }

  /**
   * Subscribe to job updates. Returns an unsubscribe function.
   */
  onUpdate(handler: GenerationEventHandler): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  /**
   * Load persisted jobs from disk (call on startup).
   */
  async load(): Promise<void> {
    try {
      const raw = await readFile(JOBS_PATH, 'utf-8');
      const saved: GenerationJob[] = JSON.parse(raw);
      for (const job of saved) {
        // Mark any previously-active jobs as failed (they didn't survive the restart)
        if (job.status === 'queued' || job.status === 'generating' || job.status === 'downloading') {
          job.status = 'failed';
          job.error = 'Interrupted — application restarted during generation.';
          job.completedAt = new Date().toISOString();
        }
        this.jobs.set(job.id, job);
      }
      logger.debug(`[generation] Loaded ${saved.length} jobs from disk`);
    } catch {
      // No saved jobs — fresh start
    }
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  private emit(): void {
    const all = this.getAll();
    for (const listener of this.listeners) {
      try { listener(all); } catch { /* non-fatal */ }
    }
  }

  private debounceSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), 1000);
  }

  private async save(): Promise<void> {
    try {
      await mkdir(AVA_HOME, { recursive: true });
      const data = JSON.stringify(this.getAll(), null, 2);
      await writeFile(JOBS_PATH, data, 'utf-8');
    } catch (err) {
      logger.debug(`[generation] Failed to save jobs: ${err}`);
    }
  }
}
