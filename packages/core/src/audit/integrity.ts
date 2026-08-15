// File-integrity verification for the audit log.
//
// Every file_write / file_edit / document_author entry captures the sha256
// of the file *right after* Ava changed it (fileMutation.sha256After). This
// module compares that against the file on disk NOW, so the audit view can
// tell the user, per row:
//
//   ✅ unchanged     — the file still matches what Ava left it as
//   ⚠️ modified      — something changed it since (Ava's own later edit, the
//                      user, another tool, or an external process)
//   🗑 deleted       — the file no longer exists
//   — unverifiable   — no post-hash captured (legacy entry) or file too large
//
// No other AI coding tool proves this. It's the difference between "trust me,
// I edited it" and "here's cryptographic proof of exactly what's still mine."
//
// Runs host-side (Node): the extension host + the IDE sidecar both call
// annotateIntegrity() before sending entries to their webview.

import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import type { AuditEntry, IntegrityStatus } from './types.js';

// Files above this size are marked 'unverifiable' rather than read+hashed on
// every audit load — hashing a 100MB file to colour a badge isn't worth the
// stall. 25MB comfortably covers source files, docs, configs.
const MAX_VERIFY_BYTES = 25 * 1024 * 1024;

/** Hash the file at `path` as it exists now, or return null if it's gone /
 *  unreadable / too large. sha256 of the raw bytes matches the utf-8 digest
 *  the write tools record, since they hash exactly the content they wrote. */
function hashCurrent(path: string): string | null {
  try {
    const st = statSync(path);
    if (!st.isFile() || st.size > MAX_VERIFY_BYTES) return null;
    return createHash('sha256').update(readFileSync(path)).digest('hex');
  } catch {
    return null; // ENOENT (deleted) or permission error → treated by caller
  }
}

/** Return a NEW array with `integrity` set on every file-mutation entry that
 *  carries a post-edit hash. Dedups by path — each unique file is read and
 *  hashed at most once — so a long log touching a handful of files stays
 *  cheap. Non-mutation entries pass through untouched. */
export function annotateIntegrity(entries: AuditEntry[]): AuditEntry[] {
  const current = new Map<string, string | null>();
  const exists = new Map<string, boolean>();

  const hashOf = (path: string): string | null => {
    if (!current.has(path)) {
      const h = hashCurrent(path);
      current.set(path, h);
      // Distinguish "gone" from "unreadable/too-large": only statSync failing
      // with the file truly absent should read as deleted.
      let present;
      try { present = statSync(path).isFile(); } catch { present = false; }
      exists.set(path, present);
    }
    return current.get(path)!;
  };

  return entries.map(e => {
    const fm = e.fileMutation;
    if (!fm?.path || !fm.sha256After) return e; // nothing verifiable
    const cur = hashOf(fm.path);
    let integrity: IntegrityStatus;
    if (cur === null) {
      integrity = exists.get(fm.path) ? 'unverifiable' : 'deleted';
    } else {
      integrity = cur === fm.sha256After ? 'unchanged' : 'modified';
    }
    return { ...e, integrity };
  });
}
