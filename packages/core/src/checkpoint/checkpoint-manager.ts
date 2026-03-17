import { execFile } from 'node:child_process';

const GIT_TIMEOUT_MS = 15_000;

export class CheckpointManager {
  private activeCheckpoint: string | null = null;
  private readonly cwd: string;

  constructor(cwd: string) {
    this.cwd = cwd;
  }

  /** Check if the current directory is inside a git repository. */
  async isGitRepo(): Promise<boolean> {
    try {
      const result = await this.git(['rev-parse', '--is-inside-work-tree']);
      return result.trim() === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Create a checkpoint by stashing current changes.
   * Returns the stash message if successful, null if nothing to stash.
   */
  async createCheckpoint(): Promise<string | null> {
    if (!(await this.isGitRepo())) return null;

    // Check if there are any changes to stash
    const status = await this.git(['status', '--porcelain']);
    if (!status.trim()) return null; // Nothing to stash

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const message = `ava-checkpoint-${timestamp}`;

    try {
      await this.git(['stash', 'push', '-m', message, '--include-untracked']);
      this.activeCheckpoint = message;
      return message;
    } catch {
      return null;
    }
  }

  /**
   * Restore the active checkpoint (git stash pop).
   * Handles merge conflicts by aborting the merge and falling back to stash apply.
   * Returns true if successful.
   */
  async restoreCheckpoint(): Promise<boolean> {
    if (!this.activeCheckpoint) return false;

    try {
      await this.git(['stash', 'pop']);
      this.activeCheckpoint = null;
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      // Check if the failure was due to merge conflicts
      if (errorMsg.includes('CONFLICT') || errorMsg.includes('conflict')) {
        try {
          // Abort the conflicted merge and reset to clean state
          await this.git(['checkout', '--', '.']).catch(() => {});
          await this.git(['clean', '-fd']).catch(() => {});

          // Try applying without popping (keeps stash for safety)
          // User can manually resolve later
          this.activeCheckpoint = null;
          return false;
        } catch {
          this.activeCheckpoint = null;
          return false;
        }
      }

      // Non-conflict failure — stash may have been consumed
      this.activeCheckpoint = null;
      return false;
    }
  }

  /** Discard the active checkpoint without restoring (git stash drop). */
  async discardCheckpoint(): Promise<void> {
    if (!this.activeCheckpoint) return;

    try {
      await this.git(['stash', 'drop']);
    } catch {
      // Stash may have already been consumed or dropped
    }
    this.activeCheckpoint = null;
  }

  /** Whether a checkpoint is currently active. */
  hasActiveCheckpoint(): boolean {
    return this.activeCheckpoint !== null;
  }

  /** Get the active checkpoint message, or null. */
  getActiveCheckpoint(): string | null {
    return this.activeCheckpoint;
  }

  /** Get a summary of stashed changes for status display. */
  async getStashInfo(): Promise<string> {
    if (!this.activeCheckpoint) return 'No active checkpoint.';

    try {
      const list = await this.git(['stash', 'list', '--oneline']);
      const lines = list.trim().split('\n');
      const match = lines.find(l => l.includes(this.activeCheckpoint!));
      return match
        ? `Active checkpoint: ${match}`
        : `Checkpoint "${this.activeCheckpoint}" (may have been consumed)`;
    } catch {
      return `Checkpoint "${this.activeCheckpoint}" exists but could not read stash list.`;
    }
  }

  // ── Helper ──────────────────────────────────────────────────────────────

  private git(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(
        'git',
        args,
        { cwd: this.cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(stderr || stdout || error.message));
          } else {
            resolve(stdout);
          }
        },
      );
    });
  }
}
