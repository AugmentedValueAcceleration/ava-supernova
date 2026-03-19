/**
 * Pattern Detection — Layer 3 of the memory system.
 *
 * Tracks what the user accepts, rejects, or edits after Ava generates output.
 * Detects repeated corrections and auto-saves them as high-confidence preferences.
 *
 * This is the "Smarter Memory" pillar — Ava learns your patterns, not just your words.
 */

import { readFile, writeFile, rename, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Message } from '../core/types.js';
import { getTextContent } from '../core/types.js';
import type { MemoryManager } from './memory-manager.js';
import type { MemoryCategory } from './types.js';
import { logger } from '../core/logger.js';

/** A detected interaction pattern. */
export interface DetectedPattern {
  type: 'correction' | 'style-preference' | 'naming-convention' | 'workflow' | 'rejection';
  signal: string;
  context: string;
  confidence: number; // 0-1
}

/** Accumulated pattern counts for preference learning. */
interface PatternAccumulator {
  pattern: string;
  category: MemoryCategory;
  count: number;
  lastSeen: string;
  examples: string[];
}

/** Persistent pattern tracking state. */
export interface PatternState {
  version: 1;
  accumulators: PatternAccumulator[];
  lastProcessed: string;
}

/** Maximum age (in days) before a stale accumulator entry is pruned. */
const ACCUMULATOR_STALE_DAYS = 30;

/** Number of occurrences needed to promote a medium-confidence pattern to memory. */
const PROMOTION_THRESHOLD = 2;

/**
 * Manages the pattern accumulator — persists medium-confidence patterns to disk
 * and promotes them to memory when seen enough times across sessions.
 *
 * This enables cross-session pattern detection: a signal seen in session 1
 * can be matched against a similar signal in session 3, and if they overlap
 * enough, the pattern is promoted to a real memory.
 */
export class PatternAccumulatorManager {
  private state: PatternState;
  private readonly filePath: string;

  constructor(avaHome: string) {
    this.filePath = join(avaHome, 'pattern-accumulator.json');
    this.state = this.load();
  }

  /** Load state from disk, returning a default if not found. */
  private load(): PatternState {
    try {
      // Synchronous-style: we read on construction. For async contexts,
      // callers should use loadAsync() instead.
      // We'll store a cached version and load async in accumulate().
      return {
        version: 1,
        accumulators: [],
        lastProcessed: new Date().toISOString(),
      };
    } catch {
      return {
        version: 1,
        accumulators: [],
        lastProcessed: new Date().toISOString(),
      };
    }
  }

  /** Load state from disk asynchronously. */
  async loadAsync(): Promise<void> {
    try {
      const data = await readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(data) as PatternState;
      if (parsed.version === 1 && Array.isArray(parsed.accumulators)) {
        this.state = parsed;
      }
    } catch {
      // File doesn't exist or is corrupt — use default state
    }
  }

  /** Save state to disk using atomic write. */
  private async save(): Promise<void> {
    try {
      const dir = join(this.filePath, '..');
      await mkdir(dir, { recursive: true });

      const content = JSON.stringify(this.state, null, 2);
      const tmpPath = this.filePath + '.tmp';
      await writeFile(tmpPath, content, 'utf-8');
      try {
        await rename(tmpPath, this.filePath);
      } catch {
        await unlink(tmpPath).catch(() => {});
      }
    } catch (err) {
      logger.debug(`[patterns] Failed to save accumulator: ${err}`);
    }
  }

  /**
   * Normalize a signal string into a stable key for matching across sessions.
   * Lowercase, trimmed, first 100 chars.
   */
  private normalizeKey(signal: string): string {
    return signal
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100);
  }

  /**
   * Check if two normalized signals are similar enough to be the same pattern.
   * Uses word overlap: if >60% of words in either signal appear in the other, they match.
   */
  private isSimilar(a: string, b: string): boolean {
    const wordsA = new Set(a.split(' ').filter(w => w.length > 1));
    const wordsB = new Set(b.split(' ').filter(w => w.length > 1));

    if (wordsA.size === 0 || wordsB.size === 0) return false;

    let overlapCount = 0;
    for (const word of wordsA) {
      if (wordsB.has(word)) overlapCount++;
    }

    const overlapRatioA = overlapCount / wordsA.size;
    const overlapRatioB = overlapCount / wordsB.size;

    // Match if >60% overlap in either direction
    return overlapRatioA > 0.6 || overlapRatioB > 0.6;
  }

  /**
   * Record a medium-confidence pattern. If seen 2+ times (possibly across sessions),
   * promote to a real memory and remove from the accumulator.
   *
   * Returns true if the pattern was promoted to memory.
   */
  async accumulate(
    pattern: DetectedPattern,
    memoryManager: MemoryManager,
    conversationId?: string,
  ): Promise<boolean> {
    await this.loadAsync();

    const normalizedSignal = this.normalizeKey(pattern.signal);

    // Find an existing accumulator entry that matches this signal
    let existing = this.state.accumulators.find(
      acc => acc.category === this.patternTypeToCategory(pattern.type) &&
             this.isSimilar(this.normalizeKey(acc.pattern), normalizedSignal)
    );

    if (existing) {
      existing.count++;
      existing.lastSeen = new Date().toISOString();
      if (existing.examples.length < 5) {
        existing.examples.push(pattern.signal.slice(0, 200));
      }
    } else {
      existing = {
        pattern: pattern.signal.slice(0, 300),
        category: this.patternTypeToCategory(pattern.type),
        count: 1,
        lastSeen: new Date().toISOString(),
        examples: [pattern.signal.slice(0, 200)],
      };
      this.state.accumulators.push(existing);
    }

    // Check if we should promote
    if (existing.count >= PROMOTION_THRESHOLD) {
      try {
        await memoryManager.saveEntry({
          scope: existing.category === 'preference' ? 'global' : 'project',
          content: `[Cross-session pattern — ${existing.category}] ${existing.pattern}`,
          category: existing.category,
          tags: ['auto-learned', 'pattern-detection', 'cross-session'],
          sourceConversationId: conversationId,
        });

        // Remove from accumulator after promotion
        const idx = this.state.accumulators.indexOf(existing);
        if (idx >= 0) this.state.accumulators.splice(idx, 1);

        logger.info(`[patterns] Promoted cross-session pattern to memory: ${existing.pattern.slice(0, 60)}...`);

        this.state.lastProcessed = new Date().toISOString();
        await this.save();
        return true;
      } catch {
        // Dedup rejection or write error — keep accumulating
      }
    }

    this.state.lastProcessed = new Date().toISOString();
    await this.save();
    return false;
  }

  /** Map pattern detection type to memory category. */
  private patternTypeToCategory(type: DetectedPattern['type']): MemoryCategory {
    switch (type) {
      case 'correction': return 'convention';
      case 'naming-convention': return 'convention';
      case 'style-preference': return 'preference';
      case 'workflow': return 'preference';
      case 'rejection': return 'general';
      default: return 'general';
    }
  }

  /** Clean up old accumulators that haven't been seen in 30+ days. */
  prune(): void {
    const now = Date.now();
    this.state.accumulators = this.state.accumulators.filter(acc => {
      const daysSince = (now - new Date(acc.lastSeen).getTime()) / (1000 * 60 * 60 * 24);
      return daysSince <= ACCUMULATOR_STALE_DAYS;
    });
  }

  /** Get current accumulator state (for debugging/inspection). */
  getState(): PatternState {
    return this.state;
  }
}

// ── Detection Patterns ──────────────────────────────────────────────────────

/** User immediately re-edits what Ava just wrote */
const UNDO_EDIT_SIGNALS = [
  /\bactually,? (?:change|make|use|do)\b/i,
  /\bno,? (?:change|make|use|do|rename|move)\b/i,
  /\bcan you (?:change|rename|switch|replace|undo|revert)\b/i,
  /\brevert (?:that|this|it)\b/i,
  /\bundo (?:that|this|it)\b/i,
];

/** User corrects naming/style choices */
const NAMING_STYLE_SIGNALS = [
  /\b(?:rename|call) (?:it|that|this) (?:to |)["'`]?(\w+)/i,
  /\buse (?:camelCase|snake_case|PascalCase|kebab-case)\b/i,
  /\b(?:we|i) (?:name|call) (?:them|those|it|things) \b/i,
  /\bshould be (?:called|named) \b/i,
];

/** User expresses format/structure preferences */
const FORMAT_SIGNALS = [
  /\b(?:use|prefer|want) (?:single|double) quotes\b/i,
  /\b(?:use|prefer|want) (?:tabs|spaces|2|4) (?:spaces?|tabs?|indent)/i,
  /\b(?:semicolons?|no semicolons?)\b/i,
  /\bprefer (?:const|let|var)\b/i,
  /\b(?:arrow|regular) functions?\b/i,
  /\bprefer (?:async\/await|promises|callbacks)\b/i,
  /\b(?:use|prefer|want) (?:type|interface)\b/i,
];

/** User rejects Ava's approach entirely */
const REJECTION_SIGNALS = [
  /\bthat'?s not what i (?:meant|asked|wanted)\b/i,
  /\bno,? (?:that|this) is wrong\b/i,
  /\bstart over\b/i,
  /\bscrap (?:that|this|it)\b/i,
  /\bforget (?:that|this) approach\b/i,
  /\blet'?s (?:try|do) (?:it |this )?(?:differently|another way)\b/i,
];

/** User specifies workflow preferences */
const WORKFLOW_SIGNALS = [
  /\balways (?:run|do|check|add|include|write)\b/i,
  /\bnever (?:run|do|skip|omit|remove)\b/i,
  /\bbefore (?:committing|pushing|deploying|merging)\b/i,
  /\bafter (?:each|every) (?:change|edit|commit)\b/i,
  /\btest (?:first|before|after)\b/i,
];

/**
 * Detect interaction patterns from a conversation.
 * Looks at user messages that follow assistant messages for correction signals.
 */
export function detectPatterns(messages: Message[]): DetectedPattern[] {
  const results: DetectedPattern[] = [];

  // Only look at recent exchanges (last 10 messages)
  const recent = messages.slice(-10);

  for (let i = 1; i < recent.length; i++) {
    const msg = recent[i];
    if (msg.role !== 'user') continue;

    const text = getTextContent(msg.content);
    if (text.length < 10) continue;

    // Check if previous message was from assistant (correction context)
    const prev = recent[i - 1];
    const prevText = prev ? getTextContent(prev.content).slice(0, 200) : '';
    const isAfterAssistant = prev?.role === 'assistant';

    // Undo/edit corrections (high confidence when right after assistant)
    for (const pattern of UNDO_EDIT_SIGNALS) {
      if (pattern.test(text)) {
        results.push({
          type: 'correction',
          signal: text.slice(0, 300),
          context: isAfterAssistant ? prevText : '',
          confidence: isAfterAssistant ? 0.8 : 0.5,
        });
        break;
      }
    }

    // Naming/style corrections
    for (const pattern of NAMING_STYLE_SIGNALS) {
      if (pattern.test(text)) {
        results.push({
          type: 'naming-convention',
          signal: text.slice(0, 300),
          context: prevText,
          confidence: 0.7,
        });
        break;
      }
    }

    // Format preferences
    for (const pattern of FORMAT_SIGNALS) {
      if (pattern.test(text)) {
        results.push({
          type: 'style-preference',
          signal: text.slice(0, 300),
          context: '',
          confidence: 0.8,
        });
        break;
      }
    }

    // Full rejections
    for (const pattern of REJECTION_SIGNALS) {
      if (pattern.test(text)) {
        results.push({
          type: 'rejection',
          signal: text.slice(0, 300),
          context: isAfterAssistant ? prevText : '',
          confidence: 0.9,
        });
        break;
      }
    }

    // Workflow preferences
    for (const pattern of WORKFLOW_SIGNALS) {
      if (pattern.test(text)) {
        results.push({
          type: 'workflow',
          signal: text.slice(0, 300),
          context: '',
          confidence: 0.7,
        });
        break;
      }
    }
  }

  return results;
}

/**
 * Track detected patterns and auto-save when confidence threshold is met.
 *
 * High-confidence patterns (>= 0.8) save immediately.
 * Medium-confidence patterns (0.5-0.8) are accumulated across sessions
 * and promoted to memory after 2+ occurrences.
 *
 * @param accumulator — optional PatternAccumulatorManager for cross-session learning.
 *   If not provided, medium-confidence patterns are logged but not persisted.
 */
export async function trackAndLearn(
  messages: Message[],
  memoryManager: MemoryManager,
  conversationId?: string,
  accumulator?: PatternAccumulatorManager,
): Promise<number> {
  try {
    const patterns = detectPatterns(messages);
    if (patterns.length === 0) return 0;

    let saved = 0;

    for (const pattern of patterns) {
      // High-confidence patterns save immediately
      if (pattern.confidence >= 0.8) {
        const category: MemoryCategory = pattern.type === 'correction' ? 'convention'
          : pattern.type === 'naming-convention' ? 'convention'
          : pattern.type === 'style-preference' ? 'preference'
          : pattern.type === 'workflow' ? 'preference'
          : 'general';

        try {
          await memoryManager.saveEntry({
            scope: category === 'preference' ? 'global' : 'project',
            content: `[Learned pattern — ${pattern.type}] ${pattern.signal}`,
            category,
            tags: ['auto-learned', 'pattern-detection', pattern.type],
            sourceConversationId: conversationId,
          });
          saved++;
          logger.debug(`[patterns] Saved ${pattern.type} pattern: ${pattern.signal.slice(0, 60)}...`);
        } catch {
          // Dedup or write error — fine
        }
      }

      // Medium-confidence patterns accumulate across sessions
      if (pattern.confidence >= 0.5 && pattern.confidence < 0.8) {
        if (accumulator) {
          try {
            const promoted = await accumulator.accumulate(pattern, memoryManager, conversationId);
            if (promoted) saved++;
          } catch {
            logger.debug(`[patterns] Accumulator failed for ${pattern.type}: ${pattern.signal.slice(0, 60)}...`);
          }
        } else {
          logger.debug(`[patterns] Detected ${pattern.type} (confidence: ${pattern.confidence}): ${pattern.signal.slice(0, 60)}...`);
        }
      }
    }

    if (saved > 0) {
      logger.info(`[patterns] Layer 3: learned ${saved} ${saved === 1 ? 'pattern' : 'patterns'}`);
    }
    return saved;
  } catch {
    return 0;
  }
}
