/**
 * Auto Memory Extraction — Two-Layer System
 *
 * Layer 1: Rule-based pattern matching (instant, zero cost)
 *   Runs after EVERY agent turn. Catches explicit signals like
 *   "I prefer", "remember that", corrections, decisions, etc.
 *
 * Layer 2: LLM-powered reflection (smart, one cheap API call)
 *   Runs at END of meaningful conversations (>= 4 user turns).
 *   Asks the model to reflect on what was learned and extract
 *   structured memories. Catches nuance, solutions, context.
 *
 * Together: fast pattern matching catches the obvious stuff instantly,
 * LLM reflection catches everything the regex missed.
 */

import type { Message } from '../core/types.js';
import { getTextContent } from '../core/types.js';
import type { MemoryManager } from './memory-manager.js';
import type { MemoryCategory } from './types.js';
import type { Provider } from '../providers/types.js';
import type { ModelDefinition } from '../core/types.js';
import { logger } from '../core/logger.js';

interface ExtractedMemory {
  content: string;
  category: MemoryCategory;
  scope: 'global' | 'project';
  tags?: string[];
}

/* ═══════════════════════════════════════════════════════════════════
 * LAYER 1: Rule-Based Pattern Extraction (zero cost, instant)
 * ═══════════════════════════════════════════════════════════════════ */

/** Patterns that indicate user preferences */
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

/** Patterns that indicate explicit memory requests */
const EXPLICIT_REMEMBER_PATTERNS = [
  /\bremember (?:that|this|:)\b/i,
  /\bkeep in mind\b/i,
  /\bnote (?:that|this|:)\b/i,
  /\bfor (?:future|next time|later|reference)\b/i,
  /\bimportant\s*:/i,
  /\bfyi\b/i,
  /\bdon'?t forget\b/i,
  /\bmake sure (?:to|you) (?:always|never)\b/i,
];

/** Patterns that indicate project-specific knowledge */
const PROJECT_KNOWLEDGE_PATTERNS = [
  /\bthe (?:password|key|token|secret|endpoint|url|api|port) (?:is|for)\b/i,
  /\bthe repo (?:is|lives|at)\b/i,
  /\b(?:config|env|settings?) (?:file |is |goes |in )\b/i,
  /\brun (?:it |this |the )?(?:with|using)\b/i,
  /\byou (?:need|have) to .{10,}(?:before|after|first|otherwise)\b/i,
  /\bthe (?:trick|workaround|fix|solution) is\b/i,
  /\b(?:gotcha|caveat|heads up|watch out|be careful)\b/i,
];

/** Patterns in assistant messages that indicate discoveries */
const DISCOVERY_PATTERNS = [
  /\bi (?:found|discovered|noticed|realized) that\b/i,
  /\bthe (?:issue|problem|bug|root cause) (?:was|is|turned out)\b/i,
  /\bthis (?:works|fixes|solves|resolves) (?:the|it|by)\b/i,
  /\bthe (?:solution|fix|answer) (?:is|was)\b/i,
];

interface PatternGroup {
  patterns: RegExp[];
  category: MemoryCategory;
  scope: 'global' | 'project';
  tags: string[];
}

const USER_PATTERN_GROUPS: PatternGroup[] = [
  { patterns: EXPLICIT_REMEMBER_PATTERNS, category: 'general', scope: 'project', tags: ['auto-extracted', 'explicit'] },
  { patterns: PREFERENCE_PATTERNS, category: 'preference', scope: 'global', tags: ['auto-extracted'] },
  { patterns: CORRECTION_PATTERNS, category: 'convention', scope: 'project', tags: ['auto-extracted', 'correction'] },
  { patterns: DECISION_PATTERNS, category: 'decision', scope: 'project', tags: ['auto-extracted'] },
  { patterns: ARCHITECTURE_PATTERNS, category: 'architecture', scope: 'project', tags: ['auto-extracted'] },
  { patterns: PERSONAL_PATTERNS, category: 'person', scope: 'global', tags: ['auto-extracted'] },
  { patterns: PROJECT_KNOWLEDGE_PATTERNS, category: 'general', scope: 'project', tags: ['auto-extracted', 'knowledge'] },
];

const ASSISTANT_PATTERN_GROUPS: PatternGroup[] = [
  { patterns: DISCOVERY_PATTERNS, category: 'bug-fix', scope: 'project', tags: ['auto-extracted', 'discovery'] },
];

/**
 * Layer 1: Extract memorable information from recent messages using regex patterns.
 * Scans both user AND assistant messages for signals worth remembering.
 */
export function extractMemories(messages: Message[]): ExtractedMemory[] {
  const results: ExtractedMemory[] = [];

  // Scan last 6 messages (both user and assistant)
  const recentMsgs = messages.slice(-6);

  for (const msg of recentMsgs) {
    const text = getTextContent(msg.content);

    // Skip very short messages (commands, yes/no, etc.)
    if (text.length < 20) continue;

    // Skip if it looks like a tool result or code block
    if (text.startsWith('{') || text.startsWith('```')) continue;

    // Pick pattern groups based on role
    const groups = msg.role === 'user' ? USER_PATTERN_GROUPS
                 : msg.role === 'assistant' ? ASSISTANT_PATTERN_GROUPS
                 : [];

    for (const group of groups) {
      for (const pattern of group.patterns) {
        if (pattern.test(text)) {
          results.push({
            content: text.slice(0, 500),
            category: group.category,
            scope: group.scope,
            tags: [...group.tags],
          });
          break; // One match per group per message
        }
      }
    }
  }

  return results;
}

/* ═══════════════════════════════════════════════════════════════════
 * LAYER 2: LLM-Powered Reflection (one cheap API call at session end)
 * ═══════════════════════════════════════════════════════════════════ */

const REFLECTION_PROMPT = `You are a memory extraction assistant. Analyze this conversation and extract important things to remember for future sessions. Focus on:

1. **User preferences** — how they like to work, communication style, formatting preferences
2. **Corrections** — things the user corrected or asked to change (these are critical to remember)
3. **Decisions** — technical choices, architecture decisions, workflow decisions
4. **Project knowledge** — endpoints, credentials hints (not actual secrets), deployment info, gotchas, workarounds
5. **Personal info** — name, role, team, expertise level
6. **Solutions** — bugs that were fixed and how, tricky problems and their solutions
7. **Patterns** — recurring workflows or conventions discovered during the conversation

Respond ONLY with a JSON array of memory objects. Each object must have:
- "content": A concise, standalone summary (not the raw message — distill the key insight)
- "category": One of: preference, convention, architecture, bug-fix, decision, person, tool-config, pattern, general
- "scope": "global" (applies to all projects) or "project" (specific to this project)

Rules:
- Only extract genuinely useful knowledge that would help in FUTURE conversations
- Be concise — each memory should be 1-3 sentences max
- Do NOT extract trivial things like greetings or acknowledgments
- Do NOT extract anything already obvious from the codebase itself
- If nothing worth remembering happened, return an empty array: []
- Maximum 5 memories per conversation — only the most important

Respond with ONLY the JSON array, no other text.`;

interface ReflectionMemory {
  content: string;
  category: MemoryCategory;
  scope: 'global' | 'project';
}

const VALID_CATEGORIES: MemoryCategory[] = [
  'preference', 'convention', 'architecture', 'bug-fix',
  'decision', 'person', 'tool-config', 'pattern', 'general',
];

/**
 * Layer 2: Use the LLM to reflect on the conversation and extract structured memories.
 * Only runs for meaningful conversations (>= 4 user turns).
 */
export async function reflectAndExtract(
  messages: Message[],
  provider: Provider,
  model: ModelDefinition,
): Promise<ExtractedMemory[]> {
  // Only reflect on meaningful conversations
  const userMsgCount = messages.filter((m) => m.role === 'user').length;
  if (userMsgCount < 4) return [];

  // Build a condensed transcript (skip system prompt, limit length)
  const transcript = messages
    .filter((m) => m.role !== 'system')
    .map((m) => {
      const text = getTextContent(m.content);
      // Truncate individual messages to keep the reflection prompt manageable
      const truncated = text.length > 300 ? text.slice(0, 300) + '...' : text;
      return `[${m.role}]: ${truncated}`;
    })
    .join('\n');

  // Cap total transcript size to stay well within context
  const maxTranscript = 4000;
  const trimmedTranscript = transcript.length > maxTranscript
    ? transcript.slice(-maxTranscript)
    : transcript;

  try {
    const response = await provider.createCompletion({
      model: model.id,
      messages: [
        { role: 'system', content: REFLECTION_PROMPT } as Message,
        { role: 'user', content: trimmedTranscript } as Message,
      ],
      temperature: 0.1,
      max_tokens: 800,
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) return [];

    // Parse JSON response — handle markdown code fences
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed: ReflectionMemory[] = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return [];

    // Validate and convert
    return parsed
      .filter((m) =>
        typeof m.content === 'string' &&
        m.content.length > 10 &&
        VALID_CATEGORIES.includes(m.category) &&
        (m.scope === 'global' || m.scope === 'project')
      )
      .slice(0, 5) // Hard cap
      .map((m) => ({
        content: m.content.slice(0, 500),
        category: m.category,
        scope: m.scope,
        tags: ['auto-extracted', 'reflection'],
      }));
  } catch (err) {
    logger.debug(`[auto-memory] Reflection extraction failed: ${err}`);
    return [];
  }
}

/* ═══════════════════════════════════════════════════════════════════
 * Combined: Run both layers
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * Run Layer 1 (pattern-based) extraction and save any new memories.
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
        logger.debug(`[auto-memory] L1 saved ${mem.category} memory (${mem.scope}): ${mem.content.slice(0, 60)}...`);
      } catch {
        // Dedup rejection or write error — non-fatal
      }
    }

    if (saved > 0) {
      logger.info(`[auto-memory] Layer 1: extracted ${saved} ${saved === 1 ? 'memory' : 'memories'}`);
    }
    return saved;
  } catch {
    // Never crash the agent over auto-memory
    return 0;
  }
}

/**
 * Run Layer 2 (LLM reflection) and save extracted memories.
 * Should only be called at end of conversation, not after every turn.
 */
export async function reflectAndSave(
  messages: Message[],
  memoryManager: MemoryManager,
  provider: Provider,
  model: ModelDefinition,
  conversationId?: string,
): Promise<number> {
  try {
    const extracted = await reflectAndExtract(messages, provider, model);
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
        logger.debug(`[auto-memory] L2 saved ${mem.category} memory (${mem.scope}): ${mem.content.slice(0, 60)}...`);
      } catch {
        // Dedup rejection or write error — non-fatal
      }
    }

    if (saved > 0) {
      logger.info(`[auto-memory] Layer 2: reflected and saved ${saved} ${saved === 1 ? 'memory' : 'memories'}`);
    }
    return saved;
  } catch {
    // Never crash the agent over auto-memory
    return 0;
  }
}
