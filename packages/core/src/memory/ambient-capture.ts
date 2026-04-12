/**
 * Ambient Capture — always-on memory candidate scoring.
 *
 * Replaces the regex-pattern-only extraction system with a model that
 * evaluates EVERY turn as a potential memory. A lightweight scoring
 * model (Qwen Flash) rates each turn on novelty, relevance, and
 * confidence. Candidates above threshold are promoted to real nodes.
 *
 * Fallback: when no LLM is available (BYOK without a cheap model),
 * falls back to heuristic scoring. Zero-cost, lower recall, but never breaks.
 */

import { logger } from '../core/logger.js';
import type { MemoryGraph } from './graph-engine.js';
import type {
  CaptureCandidate,
  CandidateScore,
  MemoryCategory,
  ConfidenceSource,
} from './types.js';
import { AMBIENT_PROMOTE_THRESHOLD, AMBIENT_HOLD_THRESHOLD } from './types.js';
import { tokenize, buildTermVector, cosineSimilarity } from './tfidf.js';

// ── Heuristic Scorer (zero-cost fallback) ───────────────────────────────────

export function heuristicScore(
  candidate: CaptureCandidate,
  graph: MemoryGraph,
): CandidateScore {
  const text = `${candidate.userMessage} ${candidate.assistantMessage}`;
  const lower = text.toLowerCase();

  // Novelty
  const similar = graph.findSimilar(text, { minSimilarity: 0.5 });
  const maxSimilarity = similar.length > 0 ? similar[0].similarity : 0;
  const novelty = 1 - maxSimilarity;

  // Relevance
  let relevance = 0.3;
  const relevanceKeywords = [
    'decided', 'decision', 'chose', 'use', 'architecture', 'convention',
    'pattern', 'always', 'never', 'remember', 'important', 'prefer',
    'go for it', 'sounds good', 'agreed', 'approved', 'perfect',
    'the fix', 'the solution', 'the issue', 'we use', 'we chose', 'our stack',
  ];
  const matchCount = relevanceKeywords.filter(kw => lower.includes(kw)).length;
  relevance = Math.min(1.0, relevance + matchCount * 0.08);

  const importantTools = ['file_write', 'file_edit', 'git_commit', 'present_plan'];
  const toolRelevance = candidate.toolsUsed.filter(t => importantTools.includes(t)).length;
  relevance = Math.min(1.0, relevance + toolRelevance * 0.1);

  // Confidence
  let confidence = 0.4;
  const explicitMarkers = [
    'remember', 'keep in mind', 'note that', 'important:',
    'don\'t forget', 'make sure', 'always', 'never',
    'i decided', 'we decided', 'let\'s go with', 'approved',
  ];
  const explicitCount = explicitMarkers.filter(m => lower.includes(m)).length;
  confidence = Math.min(1.0, confidence + explicitCount * 0.15);

  const composite = (novelty * 0.35) + (relevance * 0.40) + (confidence * 0.25);
  return { novelty, relevance, confidence, composite };
}

// ── LLM Scorer ──────────────────────────────────────────────────────────────

export function buildScoringPrompt(candidate: CaptureCandidate): string {
  return `Rate this conversation turn for memory extraction.

USER: ${candidate.userMessage.slice(0, 300)}
ASSISTANT: ${candidate.assistantMessage.slice(0, 300)}
TOOLS: ${candidate.toolsUsed.join(', ') || 'none'}

Rate on three dimensions (0.0-1.0):
- novelty: How different from typical coding conversation? (0=routine, 1=unique)
- relevance: How likely useful in future sessions? (0=throwaway, 1=persistent)
- confidence: How clearly stated/decided? (0=vague, 1=explicit)

Return JSON only: {"novelty": 0.0, "relevance": 0.0, "confidence": 0.0}`;
}

export function parseScoringResponse(response: string): CandidateScore | null {
  try {
    const jsonMatch = response.match(/\{[^}]+\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    const novelty = Math.max(0, Math.min(1, Number(parsed.novelty) || 0));
    const relevance = Math.max(0, Math.min(1, Number(parsed.relevance) || 0));
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
    const composite = (novelty * 0.35) + (relevance * 0.40) + (confidence * 0.25);
    return { novelty, relevance, confidence, composite };
  } catch {
    return null;
  }
}

// ── Ambient Capture Manager ─────────────────────────────────────────────────

interface HeldCandidate {
  candidate: CaptureCandidate;
  score: CandidateScore;
  heldAt: string;
}

export class AmbientCaptureManager {
  private heldCandidates: HeldCandidate[] = [];
  private readonly MAX_HELD = 20;

  constructor(private readonly graph: MemoryGraph) {}

  async evaluate(
    candidate: CaptureCandidate,
    llmScore?: CandidateScore | null,
    scope: 'global' | 'project' = 'project',
  ): Promise<string | null> {
    const score = llmScore ?? heuristicScore(candidate, this.graph);

    logger.debug(`[ambient] Scored: n=${score.novelty.toFixed(2)} r=${score.relevance.toFixed(2)} c=${score.confidence.toFixed(2)} composite=${score.composite.toFixed(2)}`);

    if (score.composite >= AMBIENT_PROMOTE_THRESHOLD) {
      return this.promote(candidate, score, scope);
    }

    if (score.composite >= AMBIENT_HOLD_THRESHOLD) {
      const similarHeld = this.heldCandidates.find(h => {
        const combinedText = `${h.candidate.userMessage} ${h.candidate.assistantMessage}`;
        const currentText = `${candidate.userMessage} ${candidate.assistantMessage}`;
        return this.quickSimilarity(combinedText, currentText) > 0.5;
      });

      if (similarHeld) {
        this.heldCandidates = this.heldCandidates.filter(h => h !== similarHeld);
        return this.promote(candidate, score, scope);
      }

      this.heldCandidates.push({ candidate, score, heldAt: new Date().toISOString() });
      if (this.heldCandidates.length > this.MAX_HELD) this.heldCandidates.shift();
      return null;
    }

    return null;
  }

  private promote(
    candidate: CaptureCandidate,
    score: CandidateScore,
    scope: 'global' | 'project',
  ): string {
    const category = inferCategory(candidate);
    const confidenceSource: ConfidenceSource = score.confidence >= 0.8 ? 'stated' : 'ambient';
    const content = distilCandidate(candidate);

    const node = this.graph.addNode({
      content,
      category,
      scope,
      confidence: score.confidence,
      confidenceSource,
      source: 'ambient',
      tags: ['ambient-captured'],
      sourceSessionId: candidate.sessionId ?? null,
    });

    const contradiction = this.graph.detectContradiction(content, category);
    if (contradiction) {
      this.graph.addEdge({
        fromNodeId: node.id,
        toNodeId: contradiction.id,
        type: 'contradicts',
        weight: 0.8,
        metadata: { source: 'ambient-contradiction-detection' },
      });
    }

    return node.id;
  }

  private quickSimilarity(a: string, b: string): number {
    return cosineSimilarity(buildTermVector(tokenize(a)), buildTermVector(tokenize(b)));
  }
}

function inferCategory(candidate: CaptureCandidate): MemoryCategory {
  const text = `${candidate.userMessage} ${candidate.assistantMessage}`.toLowerCase();
  if (/\b(?:bug|fix|error|issue|crash|broken)\b/.test(text)) return 'bug-fix';
  if (/\b(?:architecture|stack|framework|deploy|infrastructure)\b/.test(text)) return 'architecture';
  if (/\b(?:decided|decision|chose|approved|go for it|sounds good)\b/.test(text)) return 'decision';
  if (/\b(?:prefer|always|never|don't like|i want)\b/.test(text)) return 'preference';
  if (/\b(?:convention|naming|style|format|indent)\b/.test(text)) return 'convention';
  if (/\b(?:pattern|approach|technique|method)\b/.test(text)) return 'pattern';
  if (/\b(?:config|env|setup|install|version)\b/.test(text)) return 'tool-config';
  return 'general';
}

function distilCandidate(candidate: CaptureCandidate): string {
  const userText = candidate.userMessage.trim();
  const assistantText = candidate.assistantMessage.trim();
  if (userText.length < 50 && assistantText.length > 0) {
    return `User: "${userText.slice(0, 100)}" → ${assistantText.slice(0, 200)}`;
  }
  if (assistantText.length > userText.length) return assistantText.slice(0, 300);
  return userText.slice(0, 300);
}
