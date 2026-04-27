import { execFile } from 'node:child_process';

const GIT_TIMEOUT_MS = 15_000;

export class CheckpointManager {
  private activeCheckpoint: string | null = null;
  // Whether one or more bash background processes were spawned during the
  // window the active checkpoint covers. Background processes can keep
  // mutating the filesystem after the agent moves on, so a `rollback
  // restore` won't fully undo their side effects (npm install, prisma
  // migrate, vite dev server). Surfacing this in status lets the user
  // decide whether to also stop the background process before restoring.
  private backgroundSpawnedDuringCheckpoint = false;
  private readonly cwd: string;

  constructor(cwd: string) {
    this.cwd = cwd;
  }

  /** Mark that a background process was spawned during the active
   *  checkpoint window. Called by bash tool when it kicks off a detached
   *  child so the rollback status warning is honest. */
  markBackgroundSpawned(): void {
    if (this.activeCheckpoint) this.backgroundSpawnedDuringCheckpoint = true;
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
      this.backgroundSpawnedDuringCheckpoint = false;
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

      // Check if the failure was due to merge conflicts. CRITICAL: do NOT
      // run `git checkout -- .` or `git clean -fd` here — both of those
      // discard any uncommitted work the user has alongside Ava's changes,
      // which would silently destroy concurrent edits during a rollback.
      // Leave the conflict in place. The stash is still on the stack
      // (`git stash list` shows it), so the user can resolve manually with
      // `git status`, `git checkout --theirs|--ours <file>`, then
      // `git stash drop` if they want to discard the original Ava changes.
      if (errorMsg.includes('CONFLICT') || errorMsg.includes('conflict')) {
        // Keep activeCheckpoint=null so we don't claim we still have a
        // restorable checkpoint; the stash remains on the git stack as a
        // safety copy the user can pop manually.
        this.activeCheckpoint = null;
        return false;
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

    const bgWarning = this.backgroundSpawnedDuringCheckpoint
      ? '\n⚠ A background process (bash background:true) was spawned during this checkpoint window. Restore reverts file state, but won\'t undo side effects from a still-running migration / install / dev-server. Stop the background process first if it touched anything you don\'t want.'
      : '';

    try {
      const list = await this.git(['stash', 'list', '--oneline']);
      const lines = list.trim().split('\n');
      const match = lines.find(l => l.includes(this.activeCheckpoint!));
      return (match
        ? `Active checkpoint: ${match}`
        : `Checkpoint "${this.activeCheckpoint}" (may have been consumed)`) + bgWarning;
    } catch {
      return `Checkpoint "${this.activeCheckpoint}" exists but could not read stash list.` + bgWarning;
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
