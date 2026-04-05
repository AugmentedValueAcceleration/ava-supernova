/**
 * File Lock — Cross-process write locking for persistence layers.
 *
 * Uses .lock files with PID to prevent concurrent writes to the same file.
 * Lock files are automatically cleaned up on release or if the holding
 * process is no longer running (stale lock detection).
 *
 * This prevents the CLI and extension from corrupting shared files
 * (memory.json, tasks.json, journal entries, history) when writing
 * simultaneously.
 */

import { writeFile, readFile, unlink, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const LOCK_TIMEOUT_MS = 10000; // Max time to wait for a lock
const LOCK_RETRY_MS = 50;      // Time between lock attempts
const STALE_LOCK_MS = 30000;   // Lock older than this is considered stale

/**
 * Acquire an exclusive lock on a file path.
 * Returns a release function that must be called when done.
 */
export async function acquireLock(filePath: string): Promise<() => Promise<void>> {
  const lockPath = filePath + '.lock';
  const pid = process.pid;
  const startTime = Date.now();

  while (true) {
    try {
      // Try to detect stale lock first
      if (existsSync(lockPath)) {
        const isStale = await isLockStale(lockPath);
        if (isStale) {
          await unlink(lockPath).catch(() => {});
        }
      }

      // Attempt to create lock file exclusively
      // O_EXCL flag: fail if file already exists
      await writeFile(lockPath, String(pid), { flag: 'wx' });

      // Lock acquired — return release function
      return async () => {
        await unlink(lockPath).catch(() => {});
      };
    } catch (err: any) {
      // File already exists (locked by another process)
      if (err.code === 'EEXIST') {
        if (Date.now() - startTime > LOCK_TIMEOUT_MS) {
          // Timeout — check staleness one more time before force-acquiring
          const stale = await isLockStale(lockPath);
          if (stale) {
            await unlink(lockPath).catch(() => {});
          }
          // Attempt to create — if another process just claimed it, this will fail
          // and we fall through to the warning path
          try {
            await writeFile(lockPath, String(pid), { flag: 'wx' });
            return async () => {
              await unlink(lockPath).catch(() => {});
            };
          } catch {
            // Another process holds a valid lock — proceed without lock and warn
            console.warn(`[file-lock] Could not acquire lock for ${filePath} after ${LOCK_TIMEOUT_MS}ms`);
            return async () => {};
          }
        }
        // Wait and retry
        await sleep(LOCK_RETRY_MS);
        continue;
      }
      // Other error (permissions, disk) — proceed without lock
      return async () => {};
    }
  }
}

/**
 * Execute a function while holding a file lock.
 * Ensures the lock is always released, even if the function throws.
 */
export async function withLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const release = await acquireLock(filePath);
  try {
    return await fn();
  } finally {
    await release();
  }
}

/**
 * Check if a lock file is stale (older than STALE_LOCK_MS or PID not running).
 */
async function isLockStale(lockPath: string): Promise<boolean> {
  try {
    const [lockStat, lockContent] = await Promise.all([
      stat(lockPath),
      readFile(lockPath, 'utf-8'),
    ]);

    // Check age
    const age = Date.now() - lockStat.mtimeMs;
    if (age > STALE_LOCK_MS) return true;

    // Check if holding PID is still running
    const holdingPid = parseInt(lockContent.trim(), 10);
    if (!isNaN(holdingPid) && holdingPid !== process.pid) {
      try {
        process.kill(holdingPid, 0); // Signal 0 = check if process exists
        return false; // Process is alive
      } catch {
        return true; // Process is dead — stale lock
      }
    }

    return false;
  } catch {
    return true; // Can't read lock file — treat as stale
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
