/**
 * Self-Improvement Memory — Ava learns from her own experiences.
 *
 * Two pools:
 * 1. Local — personal learnings per user (~/.ava/self-improvement.json)
 * 2. Global — shared across all users (Supabase, sanitised)
 *
 * NEVER stores user code, messages, or personal data.
 */

import { existsSync, readFileSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { withLock } from '../core/file-lock.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SelfImprovement {
  id: string;
  type: 'technique' | 'tool-fix' | 'error-recovery' | 'preference' | 'pattern';
  category: string; // e.g. 'typescript', 'react', 'api', 'image-gen', 'general'
  context: string; // when this applies
  learned: string; // what was learned
  confidence: number; // 0-1
  source: 'retry-success' | 'feedback-negative' | 'feedback-positive' | 'error-recovery' | 'observation';
  confirmations: number; // how many times independently confirmed (across different sessions)
  lastConfirmedSession?: string; // session ID of last confirmation — prevents same-session double counting
  createdAt: string;
  updatedAt: string;
}

export interface SelfImprovementStore {
  version: number;
  local: SelfImprovement[];
  lastGlobalSync: string | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STORE_FILE = 'self-improvement.json';
const MAX_PROMPT_CHARS = 500;

// ─── Store I/O ───────────────────────────────────────────────────────────────

function getStorePath(avaHome: string): string {
  return join(avaHome, STORE_FILE);
}

export function loadStore(avaHome: string): SelfImprovementStore {
  const path = getStorePath(avaHome);
  if (!existsSync(path)) {
    return { version: 1, local: [], lastGlobalSync: null };
  }
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && Array.isArray(parsed.local)) {
      return parsed as SelfImprovementStore;
    }
  } catch {
    // Corrupted — start fresh
  }
  return { version: 1, local: [], lastGlobalSync: null };
}

export async function saveStore(avaHome: string, store: SelfImprovementStore): Promise<void> {
  const storePath = getStorePath(avaHome);
  const dir = dirname(storePath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await withLock(storePath, async () => {
    await writeFile(storePath, JSON.stringify(store, null, 2), 'utf-8');
  });
}

// ─── Similarity ──────────────────────────────────────────────────────────────

/** Simple text similarity using word overlap (Jaccard-like). */
function textSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  return intersection / Math.max(wordsA.size, wordsB.size);
}

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Add a learning to the local store. Deduplicates against existing entries
 * by similarity — if a similar learning exists, updates it instead.
 */
export async function addLearning(
  avaHome: string,
  learning: Omit<SelfImprovement, 'id' | 'confirmations' | 'createdAt' | 'updatedAt'>,
  sessionId?: string,
): Promise<SelfImprovement> {
  const store = loadStore(avaHome);
  const now = new Date().toISOString();

  // Check for similar existing learning (same type + category + high text similarity)
  for (const existing of store.local) {
    if (
      existing.type === learning.type &&
      existing.category === learning.category &&
      textSimilarity(existing.learned, learning.learned) > 0.6
    ) {
      // Only count as independent confirmation if from a different session
      const isNewSession = !sessionId || !existing.lastConfirmedSession || existing.lastConfirmedSession !== sessionId;
      if (isNewSession) {
        existing.confirmations += 1;
        existing.lastConfirmedSession = sessionId;
      }
      existing.confidence = Math.min(1, existing.confidence + (isNewSession ? 0.1 : 0.02));
      existing.updatedAt = now;
      // Merge context if different
      if (learning.context && !existing.context.includes(learning.context)) {
        existing.context = `${existing.context}; ${learning.context}`.slice(0, 200);
      }
      await saveStore(avaHome, store);
      return existing;
    }
  }

  // New learning
  const entry: SelfImprovement = {
    id: randomUUID(),
    ...learning,
    confirmations: 1,
    createdAt: now,
    updatedAt: now,
  };

  store.local.push(entry);

  // Cap at 200 learnings — prune lowest confidence + oldest
  if (store.local.length > 200) {
    store.local.sort((a, b) => {
      const scoreA = a.confidence * 0.6 + (a.confirmations / 10) * 0.4;
      const scoreB = b.confidence * 0.6 + (b.confirmations / 10) * 0.4;
      return scoreB - scoreA;
    });
    store.local = store.local.slice(0, 200);
  }

  saveStore(avaHome, store);
  return entry;
}

/**
 * Search for relevant learnings by category/context keywords.
 * Returns the most relevant learnings sorted by relevance score.
 */
export function getRelevantLearnings(
  avaHome: string,
  context: string,
  limit = 10,
): SelfImprovement[] {
  const store = loadStore(avaHome);
  if (store.local.length === 0) return [];

  const keywords = context.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (keywords.length === 0) {
    // No keywords — return highest confidence learnings
    return store.local
      .filter(l => l.confidence >= 0.3)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit);
  }

  // Score each learning by keyword match + confidence + confirmations
  const scored = store.local.map(learning => {
    const searchText = `${learning.category} ${learning.context} ${learning.learned} ${learning.type}`.toLowerCase();
    let keywordScore = 0;
    for (const kw of keywords) {
      if (searchText.includes(kw)) keywordScore++;
    }
    const relevance = (keywordScore / keywords.length) * 0.5 +
      learning.confidence * 0.3 +
      Math.min(learning.confirmations / 10, 1) * 0.2;
    return { learning, relevance };
  });

  return scored
    .filter(s => s.relevance > 0.1)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, limit)
    .map(s => s.learning);
}

/**
 * Build a concise prompt section with relevant learnings for injection
 * into the system prompt. Max ~500 chars.
 */
export function buildSelfImprovementPrompt(
  avaHome: string,
  currentContext?: string,
): string {
  const learnings = getRelevantLearnings(avaHome, currentContext || '', 8);
  if (learnings.length === 0) return '';

  // Filter to high-enough confidence
  const usable = learnings.filter(l => l.confidence >= 0.3 || l.confirmations >= 2);
  if (usable.length === 0) return '';

  const lines: string[] = [];
  let totalChars = 0;

  for (const l of usable) {
    const confirmed = l.confirmations > 1 ? ` (confirmed ${l.confirmations}x)` : '';
    const sourceLabel = l.source === 'retry-success' ? ' [retry fix]'
      : l.source === 'error-recovery' ? ' [error fix]'
      : l.source === 'feedback-negative' ? ' [user feedback]'
      : '';
    const line = `- ${l.learned}${confirmed}${sourceLabel}`;

    if (totalChars + line.length > MAX_PROMPT_CHARS) break;
    lines.push(line);
    totalChars += line.length;
  }

  if (lines.length === 0) return '';

  return `## What I've Learned\n${lines.join('\n')}`;
}
