/**
 * Pattern Detection — Layer 3 of the memory system.
 *
 * Tracks what the user accepts, rejects, or edits after Ava generates output.
 * Detects repeated corrections and auto-saves them as high-confidence preferences.
 *
 * This is the "Smarter Memory" pillar — Ava learns your patterns, not just your words.
 */

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
 * The accumulator tracks how many times a similar pattern appears.
 * After 2+ occurrences of the same type of correction, it's saved as
 * a high-confidence preference memory.
 */
export async function trackAndLearn(
  messages: Message[],
  memoryManager: MemoryManager,
  conversationId?: string,
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

      // Medium-confidence patterns get logged for now
      // (Phase 2: accumulator-based learning with persistence)
      if (pattern.confidence >= 0.5 && pattern.confidence < 0.8) {
        logger.debug(`[patterns] Detected ${pattern.type} (confidence: ${pattern.confidence}): ${pattern.signal.slice(0, 60)}...`);
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
