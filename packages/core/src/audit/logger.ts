// AuditLogger — append-only persistent audit log at ~/.ava/audit-log.jsonl.
// Both extension AvaViewProvider + IDE sidecar import this, so the same
// log is reachable from either surface (sign-in agnostic — works even
// for BYOK no-account users since storage is local-only).
//
// Append + read are sync because audit operations are infrequent (one
// per tool call, ~10s of writes/min at peak) and the user's home dir is
// fast. No async wrapping needed; predictable behaviour matters more
// than throughput here.

import { existsSync, mkdirSync, appendFileSync, readFileSync, statSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { AuditEntry, AuditFilter } from './types.js';

const AVA_DIR = join(homedir(), '.ava');
const LOG_PATH = join(AVA_DIR, 'audit-log.jsonl');
const ARCHIVE_PATH_PREFIX = join(AVA_DIR, 'audit-log.archive-');

/** Roll the log over when it crosses this size so a long-running install
 *  doesn't end up with one giant file that takes seconds to read. The
 *  archive lands at audit-log.archive-<unix-ts>.jsonl and is preserved
 *  forever — the user can search across rotations via readEntries which
 *  reads both the live file + every archive in date order. */
const MAX_LIVE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

function ensureDir(): void {
  try { mkdirSync(AVA_DIR, { recursive: true }); } catch { /* exists */ }
}

/** Append one entry to the live log. Cheap — a single fs.appendFileSync.
 *  Rotates the live file out to an archive when it crosses the size cap,
 *  so subsequent appends start fresh. Returns silently on any I/O error
 *  rather than throwing — audit logging should never break a tool call. */
export function appendEntry(entry: AuditEntry): void {
  try {
    ensureDir();
    rotateIfNeeded();
    appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n', 'utf-8');
  } catch {
    // Audit failures must not surface as errors to the agent loop.
  }
}

function rotateIfNeeded(): void {
  try {
    const s = statSync(LOG_PATH);
    if (s.size < MAX_LIVE_SIZE_BYTES) return;
    renameSync(LOG_PATH, `${ARCHIVE_PATH_PREFIX}${Date.now()}.jsonl`);
  } catch {
    // ENOENT is the common case (log doesn't exist yet) — nothing to rotate.
  }
}

/** Read entries from the live log + every archive. Returns newest first.
 *  Filter is applied in memory after parsing — fine for the v1 sizes
 *  we expect (a power user might accumulate ~50K entries over a year,
 *  each entry ~500 bytes, so the corpus parses in under a second). */
export function readEntries(filter: AuditFilter = {}): AuditEntry[] {
  ensureDir();
  const sources: string[] = [];
  // Archives oldest-first so when we sort newest-first at the end, the
  // newest entries (always in the live file) come out on top.
  try {
    const { readdirSync } = require('node:fs') as typeof import('node:fs');
    const archives = readdirSync(AVA_DIR)
      .filter(f => f.startsWith('audit-log.archive-') && f.endsWith('.jsonl'))
      .sort();
    for (const a of archives) sources.push(join(AVA_DIR, a));
  } catch { /* no archives */ }
  if (existsSync(LOG_PATH)) sources.push(LOG_PATH);

  const all: AuditEntry[] = [];
  for (const path of sources) {
    try {
      const raw = readFileSync(path, 'utf-8');
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        try { all.push(JSON.parse(line) as AuditEntry); } catch { /* skip malformed */ }
      }
    } catch { /* skip unreadable */ }
  }

  const filtered = all.filter(e => matchesFilter(e, filter));
  filtered.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return filter.limit && filter.limit > 0 ? filtered.slice(0, filter.limit) : filtered;
}

function matchesFilter(e: AuditEntry, f: AuditFilter): boolean {
  if (f.since && e.timestamp < f.since) return false;
  if (f.until && e.timestamp > f.until) return false;
  if (f.category && e.category !== f.category) return false;
  if (f.riskLevel && e.riskLevel !== f.riskLevel) return false;
  if (f.status && e.status !== f.status) return false;
  if (f.toolName && !e.toolName.toLowerCase().includes(f.toolName.toLowerCase())) return false;
  return true;
}

// summarise + AuditSummary moved to the pure ./summary.js (so export.ts stays
// webview-safe). Re-exported here for existing importers.
export { summarise } from './summary.js';
export type { AuditSummary } from './summary.js';

/** Path of the live log — exposed so the export-to-zip tool can copy it
 *  directly without round-tripping through readEntries. */
export const AUDIT_LOG_PATH = LOG_PATH;
export const AUDIT_DIR = AVA_DIR;
