/**
 * Safe file handling for memory v4.
 *
 * The extension, the IDE, the CLI and the hub can all be open at once, and all
 * of them write to the same folder. Two rules keep that safe:
 *
 *   1. Every write is atomic: written to a temp file beside the target, then
 *      renamed over it. A reader never sees half a file.
 *   2. Every change to the store happens under one lock (a directory, because
 *      mkdir is atomic on every platform). The lock is held for the length of
 *      one change, never across a model call.
 */

import { mkdir, rename, rm, stat, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

/** A lock older than this was left by a process that died mid-change. */
const STALE_LOCK_MS = 15_000;
const LOCK_WAIT_MS = 10_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Write a file atomically. On Windows a rename can fail for a moment while
 * another process has the target open for reading, so it is retried briefly.
 */
export async function writeAtomic(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(tmp, content, 'utf-8');
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(tmp, path);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if ((code === 'EPERM' || code === 'EBUSY' || code === 'EACCES') && attempt < 8) {
        await sleep(25 * (attempt + 1));
        continue;
      }
      await rm(tmp, { force: true });
      throw err;
    }
  }
}

/** Read a file, or null if it doesn't exist. */
export async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/** Remove a file if it exists; true if something was removed. */
export async function removeIfExists(path: string): Promise<boolean> {
  try {
    await rm(path);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
}

/**
 * Run `fn` holding the store's lock. Waits for another holder; takes over a
 * lock that has gone stale (its owner crashed). Throws if the lock can't be
 * had in LOCK_WAIT_MS, rather than writing without it.
 */
export async function withLock<T>(root: string, fn: () => Promise<T>): Promise<T> {
  const lockDir = join(root, '.lock');
  await mkdir(root, { recursive: true });
  const started = Date.now();
  for (let attempt = 0; ; attempt++) {
    try {
      await mkdir(lockDir);
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      try {
        const age = Date.now() - (await stat(lockDir)).mtimeMs;
        if (age > STALE_LOCK_MS) {
          await rm(lockDir, { recursive: true, force: true });
          continue;
        }
      } catch {
        // Released between our mkdir and stat: just try again.
        continue;
      }
      if (Date.now() - started > LOCK_WAIT_MS) {
        throw new Error('Memory is busy in another window — try again in a moment.');
      }
      await sleep(Math.min(5 + 5 * attempt, 50));
    }
  }
  try {
    return await fn();
  } finally {
    await rm(lockDir, { recursive: true, force: true });
  }
}

/** Today as YYYY-MM-DD in local time (dates in memory are the person's days). */
export function today(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
