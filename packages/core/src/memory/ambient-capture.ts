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

  // Relevance — includes both technical AND personal signals so Chat
  // mode turns get scored properly alongside coding conversations
  let relevance = 0.3;
  const relevanceKeywords = [
    // Technical signals
    'decided', 'decision', 'chose', 'use', 'architecture', 'convention',
    'pattern', 'always', 'never', 'remember', 'important', 'prefer',
    'go for it', 'sounds good', 'agreed', 'approved', 'perfect',
    'the fix', 'the solution', 'the issue', 'we use', 'we chose', 'our stack',
    // Personal / Chat mode signals
    'my name', 'i live', 'i work', 'my family', 'my partner', 'my wife',
    'my husband', 'my daughter', 'my son', 'my birthday', 'i love',
    'i enjoy', 'i hate', 'i deal with', 'i struggle', 'my background',
    'i have been', 'years experience', 'my dog', 'my cat',
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

// ── The mode prefix is not what they said ───────────────────────────────────

/**
 * Every surface prepends the mode prompt to the user's message before it
 * reaches the agent — `getWorkModePrefix(text)` and its siblings. So what
 * arrives here as `userMessage` is thousands of characters of instructions
 * with the actual question at the very end.
 *
 * That broke ambient capture twice over, found 2026-09-08:
 *
 *   distilCandidate() stores `userText.slice(0, 300)` whenever the user
 *   message is the longer one — which, after a prefix, it always is. The
 *   operator's graph held 24 nodes that were all the identical opening 300
 *   characters of the Work Mode prompt.
 *
 *   heuristicScore() measures novelty with findSimilar() over that same text,
 *   so every stored copy made the NEXT work-mode turn look less novel. The
 *   more prompt it saved, the less able it became to save anything real — it
 *   disabled itself against precisely the mode where the building happens.
 *
 * Conservative on purpose. It only acts on text that opens with a `[Mode]`
 * tag, prefers an explicit request marker, falls back to the final paragraph
 * (exactly how getWorkModePrefix ends), and returns the input untouched if
 * that yields nothing. Storing a prefix is bad; losing the message is worse.
 */
/**
 * The context tags this codebase actually emits.
 *
 * Gathered from the prefix builders in system-prompt.ts and the injected
 * context blocks. Deliberately an EXACT LIST rather than a shape: the first
 * version matched any capitalised word in brackets, and a test caught it
 * pruning `[BUG] the idle animation restarts every frame` — a thing a person
 * types. `[TODO]`, `[NOTE]`, `[URGENT]` would have gone the same way. Losing
 * somebody's memory to a convention we did not anticipate is far worse than
 * keeping a prompt we did.
 *
 * `[Project: name]` carries a variable, so it is matched by its prefix.
 */
export const CONTEXT_TAGS: readonly string[] = [
  '[Work Mode]', '[Plan Mode]', '[Chat Mode]', '[Teach Mode]', '[Write Mode]',
  '[Brainstorm Mode]', '[Security Audit Mode]', '[Desktop Automation Mode]',
  '[Newsroom]', '[Social Studio]', '[Pantry]', '[Gym]', '[Health Room]',
  '[Design Studio]', '[Memory Brief]', '[Project Brain]',
];

/** True when the text OPENS with one of our own context tags. */
export function startsWithContextTag(text: string): boolean {
  const t = text.trimStart();
  return CONTEXT_TAGS.some(tag => t.startsWith(tag)) || /^\[Project: [^\]]*\]/.test(t);
}

/** Headings the prefixes use to introduce the real message. */
const REQUEST_MARKERS = [
  '\n## Their request\n',
  "\n## User's Request\n",
  '\nUser\'s request: ',
];

export function stripModePrefix(text: string): string {
  if (!startsWithContextTag(text)) return text;

  for (const marker of REQUEST_MARKERS) {
    const at = text.lastIndexOf(marker);
    if (at !== -1) {
      const tail = text.slice(at + marker.length).trim();
      if (tail) return tail;
    }
  }

  // No marker — getWorkModePrefix ends with a blank line then the message.
  const lastBreak = text.lastIndexOf('\n\n');
  if (lastBreak !== -1) {
    const tail = text.slice(lastBreak + 2).trim();
    if (tail) return tail;
  }

  return text;
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
    rawCandidate: CaptureCandidate,
    llmScore?: CandidateScore | null,
    scope: 'global' | 'project' = 'project',
  ): Promise<string | null> {
    // THE SINGLE DOOR IN, so scoring, holding and distilling all see what the
    // person actually said. Stripping inside distilCandidate alone would fix
    // the text that gets stored and leave novelty still being measured against
    // the mode prompt — which is the half that made it stop capturing at all.
    const candidate: CaptureCandidate = {
      ...rawCandidate,
      userMessage: stripModePrefix(rawCandidate.userMessage ?? ''),
    };

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
