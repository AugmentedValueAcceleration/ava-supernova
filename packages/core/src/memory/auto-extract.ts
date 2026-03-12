/**
 * Auto Memory Extraction
 *
 * Runs after each agent turn to extract memorable information from the
 * conversation. This supplements (not replaces) the model's own memory_save
 * calls — open-source models often don't follow "save proactively" instructions
 * reliably, so we ensure important info gets captured automatically.
 *
 * Extraction is lightweight and rule-based — no extra LLM calls needed.
 */

import type { Message } from '../core/types.js';
import type { MemoryManager } from './memory-manager.js';
import type { MemoryCategory } from './types.js';
import { logger } from '../core/logger.js';

interface ExtractedMemory {
  content: string;
  category: MemoryCategory;
  scope: 'global' | 'project';
  tags?: string[];
}

/** Patterns that indicate user preferences / corrections */
const PREFERENCE_PATTERNS = [
  /\bi (?:always |usually |prefer |like to |want to |need to )\b/i,
  /\bdon'?t (?:use|want|like|ever|do)\b/i,
  /\bplease (?:always|never|don'?t)\b/i,
  /\bmy (?:preferred|favorite|default|go-to)\b/i,
  /\bwe (?:always|never|usually|prefer)\b/i,
];

/** Patterns that indicate corrections / feedback */
const CORRECTION_PATTERNS = [
  /\bno[,.]? (?:not that|instead|actually|that'?s wrong)\b/i,
  /\bthat'?s not (?:right|correct|what i)\b/i,
  /\bstop (?:doing|using|adding)\b/i,
  /\binstead (?:of|use|do|try)\b/i,
  /\bdon'?t (?:do that|change|modify|touch|remove)\b/i,
];

/** Patterns that indicate decisions */
const DECISION_PATTERNS = [
  /\blet'?s (?:go with|use|stick with|keep)\b/i,
  /\bwe(?:'re| are) going (?:to|with)\b/i,
  /\bi'?ve decided\b/i,
  /\bthe plan is\b/i,
  /\bwe'?ll use\b/i,
];

/** Patterns that indicate tech stack / architecture info */
const ARCHITECTURE_PATTERNS = [
  /\bwe use (?:react|vue|angular|next|svelte|express|django|flask|spring)\b/i,
  /\bour (?:stack|architecture|infra|database|backend|frontend) (?:is|uses)\b/i,
  /\bdeployed (?:on|to|with|via)\b/i,
  /\bwe (?:host|deploy|run) (?:on|with|in)\b/i,
];

/** Patterns that indicate personal info worth remembering */
const PERSONAL_PATTERNS = [
  /\bmy (?:name|role|title|job|team) is\b/i,
  /\bi(?:'m| am) (?:a |an |the )?\w+(?:\s\w+)? (?:at|for|on|in)\b/i,
  /\bi work (?:on|at|for|with|in)\b/i,
  /\bmy email is\b/i,
];

/**
 * Extract memorable information from recent messages.
 * Only looks at the last user message (the freshest input).
 */
export function extractMemories(messages: Message[]): ExtractedMemory[] {
  const results: ExtractedMemory[] = [];

  // Only analyze the last few user messages
  const recentUserMsgs = messages
    .filter((m) => m.role === 'user' && typeof m.content === 'string')
    .slice(-3);

  for (const msg of recentUserMsgs) {
    const text = msg.content as string;

    // Skip very short messages (commands, yes/no, etc.)
    if (text.length < 20) continue;

    // Skip if it looks like a tool result or code block
    if (text.startsWith('{') || text.startsWith('```')) continue;

    // Check each pattern category
    for (const pattern of PREFERENCE_PATTERNS) {
      if (pattern.test(text)) {
        results.push({
          content: text.slice(0, 500),
          category: 'preference',
          scope: 'global',
          tags: ['auto-extracted'],
        });
        break; // One match per category per message
      }
    }

    for (const pattern of CORRECTION_PATTERNS) {
      if (pattern.test(text)) {
        results.push({
          content: text.slice(0, 500),
          category: 'convention',
          scope: 'project',
          tags: ['auto-extracted', 'correction'],
        });
        break;
      }
    }

    for (const pattern of DECISION_PATTERNS) {
      if (pattern.test(text)) {
        results.push({
          content: text.slice(0, 500),
          category: 'decision',
          scope: 'project',
          tags: ['auto-extracted'],
        });
        break;
      }
    }

    for (const pattern of ARCHITECTURE_PATTERNS) {
      if (pattern.test(text)) {
        results.push({
          content: text.slice(0, 500),
          category: 'architecture',
          scope: 'project',
          tags: ['auto-extracted'],
        });
        break;
      }
    }

    for (const pattern of PERSONAL_PATTERNS) {
      if (pattern.test(text)) {
        results.push({
          content: text.slice(0, 500),
          category: 'person',
          scope: 'global',
          tags: ['auto-extracted'],
        });
        break;
      }
    }
  }

  return results;
}

/**
 * Run auto-extraction on the conversation and save any new memories.
 * Designed to be called fire-and-forget after each agent turn.
 * Deduplication is handled by the memory manager's TF-IDF similarity check.
 */
export async function autoExtractAndSave(
  messages: Message[],
  memoryManager: MemoryManager,
  conversationId?: string,
): Promise<number> {
  try {
    const extracted = extractMemories(messages);
    if (extracted.length === 0) return 0;

    let saved = 0;
    for (const mem of extracted) {
      try {
        await memoryManager.saveEntry({
          scope: mem.scope,
          content: mem.content,
          category: mem.category,
          tags: mem.tags,
          branch: null,
          sourceConversationId: conversationId,
        });
        saved++;
        logger.debug(`[auto-memory] Saved ${mem.category} memory (${mem.scope}): ${mem.content.slice(0, 60)}...`);
      } catch {
        // Dedup rejection or write error — non-fatal
      }
    }

    if (saved > 0) {
      logger.info(`[auto-memory] Auto-extracted ${saved} ${saved === 1 ? 'memory' : 'memories'} from conversation`);
    }
    return saved;
  } catch {
    // Never crash the agent over auto-memory
    return 0;
  }
}
