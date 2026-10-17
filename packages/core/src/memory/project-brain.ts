/**
 * Project Brain — pre-computed synthesis of all project knowledge.
 *
 * After each session, the project brain is regenerated from the project's
 * memory subgraph. It produces a ~200-token brief that's injected at
 * session start BEFORE any recall — guaranteeing warm starts regardless
 * of the user's first message.
 *
 * The brief includes: stack, key decisions, active work, learned
 * patterns, known issues, and confidence stats. It's cached to
 * brain.json and only regenerated when the graph has changed.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { localYmd, todayLocal } from '../core/dates.js';
import { existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { logger } from '../core/logger.js';
import type { MemoryGraph } from './graph-engine.js';
import type { ProjectBrain, MemoryNode, ProceduralPattern } from './types.js';

const BRAIN_FILENAME = 'brain.json';
const MAX_BRIEF_CHARS = 800; // ~200 tokens at 4 chars/token

/** A line of the brief, with how readily it is sacrificed when the brief
 *  will not fit. Higher `drop` goes first. Reading order is separate: it is
 *  the order these are pushed, which does not change. */
interface BriefSection {
  text: string;
  drop: number;
}

/**
 * Fit the brief to MAX_BRIEF_CHARS by dropping WHOLE sections, least
 * important first, and saying so when it happens.
 *
 * This replaced `brief.slice(0, MAX_BRIEF_CHARS)`, which cut at a byte offset
 * under a comment claiming it dropped the least critical material. Those are
 * only the same thing while the least important text happens to sit last, and
 * nothing enforced that: a long Decisions block took Patterns, Issues and the
 * stats with it and then ended mid-sentence, leaving a brief that reads as
 * complete. Add a section or reorder the array and it would have silently
 * eaten something that mattered.
 *
 * Silent truncation is the worst failure mode for memory in particular,
 * because the symptom is ABSENCE \u2014 and absence is indistinguishable from
 * never having known. You cannot notice, let alone debug, a fact that is not
 * there. So when sections go, the brief says how many, and the log says it
 * louder.
 *
 * Last resort: if even the highest-priority section alone overflows, it is cut
 * \u2014 but it is cut KNOWINGLY, with the same marker, rather than quietly.
 */
function fitBrief(parts: BriefSection[], projectRoot: string): string {
  const join = (list: BriefSection[]) => list.map(p => p.text).join('\n');

  let kept = [...parts];
  if (join(kept).length <= MAX_BRIEF_CHARS) return join(kept);

  // Drop whole sections, least important first, until it fits.
  const order = [...parts].sort((a, b) => b.drop - a.drop);
  const dropped: string[] = [];
  for (const victim of order) {
    if (kept.length <= 1) break;
    kept = kept.filter(p => p !== victim);
    dropped.push(victim.text.split(':')[0]);
    if (join(kept).length <= MAX_BRIEF_CHARS) break;
  }

  let brief = join(kept);
  let note = dropped.length > 0
    ? ` (${dropped.length} section${dropped.length === 1 ? '' : 's'} trimmed to fit: ${dropped.join(', ')})`
    : '';

  // Even one section can overflow. Cut it, but never pretend it is whole.
  if (brief.length + note.length > MAX_BRIEF_CHARS) {
    const room = Math.max(0, MAX_BRIEF_CHARS - note.length - 1);
    brief = brief.slice(0, room).trimEnd() + '\u2026';
  }

  if (dropped.length > 0) {
    logger.warn(
      `[project-brain] brief for ${projectRoot} exceeded ${MAX_BRIEF_CHARS} chars; `
      + `dropped ${dropped.length} section(s): ${dropped.join(', ')}`,
    );
  }
  return brief + note;
}

/**
 * Compute a project brain from a graph and optional procedural patterns.
 */
export function synthesiseProjectBrain(
  graph: MemoryGraph,
  projectRoot: string,
  procedures: ProceduralPattern[] = [],
): ProjectBrain {
  const nodes = graph.getActiveNodes();
  const stats = graph.getStats();
  const projectName = basename(projectRoot) || 'Unknown Project';

  // ── Group by category, take top 3 per by confidence ────────────────
  const byCategory = new Map<string, MemoryNode[]>();
  for (const node of nodes) {
    const list = byCategory.get(node.category) || [];
    list.push(node);
    byCategory.set(node.category, list);
  }

  // Sort each group by effective confidence descending
  for (const [, list] of byCategory) {
    list.sort((a, b) => graph.getEffectiveConfidence(b) - graph.getEffectiveConfidence(a));
  }

  // ── Extract stack (from architecture nodes) ─────────────────────────
  const archNodes = (byCategory.get('architecture') || []).slice(0, 5);
  const stack: string[] = [];
  for (const node of archNodes) {
    // Extract technology names heuristically (capitalised words, known patterns)
    const techs = node.content.match(/\b(?:React|Next\.?js|Vue|Svelte|Angular|Tailwind|Vite|esbuild|Tauri|Capacitor|Supabase|PostgreSQL|Redis|TypeScript|Rust|Python|Go|Node\.?js|Express|Django|Flask|pnpm|npm|yarn|Docker|Kubernetes|Vercel|AWS|GCP|Azure)\b/gi);
    if (techs) stack.push(...techs.map(t => t.trim()));
  }
  const uniqueStack = [...new Set(stack.map(s => s.toLowerCase()))].map(s => {
    // Capitalise properly
    const found = stack.find(t => t.toLowerCase() === s);
    return found || s;
  }).slice(0, 8);

  // ── Extract key decisions ───────────────────────────────────────────
  const decisionNodes = (byCategory.get('decision') || []).slice(0, 5);
  const keyDecisions = decisionNodes.map(n => truncate(n.content, 100));

  // ── Extract active work (most recent general/session nodes) ────────
  const recentNodes = nodes
    .filter(n => n.tags?.includes('session-context') || n.tags?.includes('compression'))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3);
  const activeWork = recentNodes.map(n => truncate(n.content, 100));

  // ── Extract known patterns (crystallised procedures) ────────────────
  const crystallised = procedures
    .filter(p => p.crystallised)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);
  const knownPatterns = crystallised.map(
    p => `${p.taskType}: ${p.toolSequence.join(' → ')} (observed ${p.observationCount}×)`,
  );

  // ── Extract known issues (bug-fix nodes not marked resolved) ────────
  const bugNodes = (byCategory.get('bug-fix') || [])
    .filter(n => {
      const resolvedEdges = graph.getEdgesFrom(n.id, 'resolved-by');
      return resolvedEdges.length === 0; // unresolved
    })
    .slice(0, 3);

  // ── Build the brief ─────────────────────────────────────────────────
  const parts: BriefSection[] = [];
  // drop 0: the identity line. Never sacrificed — a brief that does not say
  // which project it describes is worse than no brief.
  parts.push({ text: `[Project: ${projectName}]`, drop: 0 });

  // Each section carries a DROP RANK. Reading order below is unchanged, so a
  // brief looks exactly as it always did; the rank only decides what goes
  // first when it will not fit. Higher rank = sacrificed sooner.
  //
  // The ranks encode the original author's intent, which the old positional
  // cut only achieved by accident: "patterns and issues are least critical",
  // with the node stats below both since they are diagnostics rather than
  // knowledge. Stack and Decisions are what the project IS and why it is that
  // way, so they are last to go.
  if (uniqueStack.length > 0) {
    parts.push({ text: `Stack: ${uniqueStack.join(', ')}`, drop: 1 });
  }

  if (keyDecisions.length > 0) {
    parts.push({ text: `Decisions: ${keyDecisions.join(' | ')}`, drop: 2 });
  }

  if (activeWork.length > 0) {
    parts.push({ text: `Recent: ${activeWork.join(' | ')}`, drop: 3 });
  }

  if (knownPatterns.length > 0) {
    parts.push({ text: `Patterns: ${knownPatterns.join(' | ')}`, drop: 5 });
  }

  if (bugNodes.length > 0) {
    parts.push({ text: `Open issues: ${bugNodes.map(n => truncate(n.content, 60)).join(' | ')}`, drop: 4 });
  }

  parts.push({ text: `Nodes: ${stats.activeNodes} active, confidence avg ${stats.avgConfidence}`, drop: 6 });

  // Find last session date from most recent node.
  //
  // BOTH branches render locally. They used to agree only by both being UTC —
  // one slicing a stored ISO string, the other calling toISOString — and
  // converting a single branch would have made "last session" jump a day
  // depending on which one produced it. This is shown to the user, so local is
  // the right answer for both.
  const lastSessionDate = nodes.length > 0
    ? localYmd(new Date(nodes.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0].updatedAt))
    : todayLocal();

  const brief = fitBrief(parts, projectRoot);

  return {
    projectRoot,
    generatedAt: new Date().toISOString(),
    nodeCount: nodes.length,
    brief,
    stack: uniqueStack,
    keyDecisions,
    activeWork,
    knownPatterns,
    confidenceAvg: stats.avgConfidence,
    lastSessionDate,
    graphHash: graph.getGraphHash(),
  };
}

/**
 * Load a cached project brain from disk. Returns null if not found or stale.
 */
export async function loadProjectBrain(brainDir: string, currentGraphHash?: string): Promise<ProjectBrain | null> {
  const brainPath = join(brainDir, BRAIN_FILENAME);
  if (!existsSync(brainPath)) return null;

  try {
    const raw = await readFile(brainPath, 'utf-8');
    const brain = JSON.parse(raw) as ProjectBrain;

    // Check staleness: if the graph has changed since the brain was generated,
    // the brain is stale and should be regenerated
    if (currentGraphHash && brain.graphHash !== currentGraphHash) {
      logger.debug('[project-brain] Brain is stale — graph has changed since last generation');
      return null;
    }

    return brain;
  } catch {
    return null;
  }
}

/**
 * Save a project brain to disk.
 */
export async function saveProjectBrain(brainDir: string, brain: ProjectBrain): Promise<void> {
  const brainPath = join(brainDir, BRAIN_FILENAME);
  await mkdir(dirname(brainPath), { recursive: true });
  await writeFile(brainPath, JSON.stringify(brain, null, 2), 'utf-8');
  logger.debug(`[project-brain] Saved brain for ${brain.projectRoot} (${brain.nodeCount} nodes, ${brain.brief.length} chars)`);
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1).trimEnd() + '…';
}
