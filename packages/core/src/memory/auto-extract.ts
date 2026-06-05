/**
 * Auto Memory Extraction — Two-Layer System
 *
 * Layer 1: Rule-based pattern matching (instant, zero cost)
 *   Runs after EVERY agent turn. Catches explicit signals like
 *   "I prefer", "remember that", corrections, decisions, etc.
 *   Distills raw messages into concise, standalone summaries.
 *
 * Layer 2: LLM-powered reflection (smart, one cheap API call)
 *   Runs at END of meaningful conversations (>= 2 user turns).
 *   Asks the model to reflect on what was learned and extract
 *   structured memories. Catches nuance, solutions, context,
 *   and emotional context for future approach adjustments.
 *
 * Together: fast pattern matching catches the obvious stuff instantly,
 * LLM reflection catches everything the regex missed.
 */

import type { Message } from '../core/types.js';
import { getTextContent } from '../core/types.js';
import type { MemoryManager } from './memory-manager.js';
import type { MemoryCategory, MemoryLayer } from './types.js';
import { inferLayer } from './types.js';
import type { Provider } from '../providers/types.js';
import type { ModelDefinition } from '../core/types.js';
import { logger } from '../core/logger.js';

interface ExtractedMemory {
  content: string;
  category: MemoryCategory;
  scope: 'global' | 'project';
  layer: MemoryLayer;
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

/**
 * Patterns that indicate corrections WITH a new preference attached.
 *
 * Bare "stop"/"don't" patterns were intentionally removed — they generated
 * noise without signal. A correction is only worth saving when the user
 * supplies a replacement ("instead of X use Y"). Without that, all you
 * capture is "the user said stop", which biases future interactions toward
 * defensiveness without teaching anything actionable.
 */
const CORRECTION_PATTERNS = [
  /\binstead (?:of|use|do|try)\b/i,
  /\b(?:use|do|try) .{1,40} instead\b/i,
];

/** Patterns that indicate decisions */
const DECISION_PATTERNS = [
  /\blet'?s (?:go with|use|stick with|keep)\b/i,
  /\bwe(?:'re| are) going (?:to|with)\b/i,
  /\bi'?ve decided\b/i,
  /\bthe plan is\b/i,
  /\bwe'?ll use\b/i,
];

/** Patterns that indicate tech stack / architecture info.
 * Framework list removed — was limited to 9 names and missed everything
 * else (Tauri, Tailwind, Vite, esbuild, Supabase, pnpm, etc.). Now
 * catches any "we use/chose/picked X" and lets Layer 2 LLM filter noise. */
const ARCHITECTURE_PATTERNS = [
  /\bwe (?:use|chose|picked|went with|switched to) \w+/i,
  /\bour (?:stack|architecture|infra|database|backend|frontend|project|app|codebase) (?:is|uses|runs)\b/i,
  /\bdeployed (?:on|to|with|via)\b/i,
  /\bwe (?:host|deploy|run|build|ship) (?:on|with|in|to|via)\b/i,
  /\bthe (?:project|app|codebase|repo) (?:is|uses|runs on|built with)\b/i,
];

/** Negation words that appear before patterns — if found, the extraction includes the negation */
const NEGATION_PATTERN = /\b(?:don'?t|doesn'?t|not|never|no longer|stopped|quit|avoid|won'?t|can'?t|shouldn'?t)\b/i;

/** Patterns that indicate personal info worth remembering.
 * Broadened for Chat mode — covers personal life, family, location,
 * interests, health, lifestyle, not just professional role. */
const PERSONAL_PATTERNS = [
  /\bmy (?:name|role|title|job|team) is\b/i,
  /\bi(?:'m| am) (?:a |an |the )?\w+(?:\s\w+)? (?:at|for|on|in)\b/i,
  /\bi work (?:on|at|for|with|in)\b/i,
  /\bmy email is\b/i,
  // Family / relationships
  /\bmy (?:wife|husband|partner|girlfriend|boyfriend|daughter|son|kid|child|children|mum|mom|dad|father|mother|brother|sister|family)\b/i,
  // Location / living
  /\bi (?:live|moved|grew up|am based|am from) (?:in|at|near)\b/i,
  // Interests / hobbies
  /\bi (?:love|enjoy|hate|collect|play|watch|follow|support)\b/i,
  // Health / conditions
  /\bi (?:deal|struggle|cope|live) with\b/i,
  /\bi(?:'ve| have) (?:been diagnosed|been dealing|got|have) \w+/i,
  // Pets
  /\bmy (?:dog|cat|pet)\b/i,
  /\bi have (?:a |two |three )?\w*(?:dog|cat|pet|bird|fish)\b/i,
  // Birthday / age
  /\bmy birthday\b/i,
  /\bi(?:'m| am) \d{2,3}\b/i,
  // Background / experience
  /\bi(?:'ve| have) (?:been|spent) \d+ years?\b/i,
  /\bmy background is\b/i,
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

/** Patterns that indicate user approval of a proposal or decision.
 * Captures the most common conversational approval signals. When matched,
 * the distilled memory includes what was approved from the preceding
 * assistant message, not just the approval phrase itself. */
const APPROVAL_PATTERNS = [
  /\bgo (?:for it|ahead|on|with)\b/i,
  /\bsounds good\b/i,
  /\b(?:yes|yeh|yeah|yep) (?:please|that|lets|do|go|perfect)\b/i,
  /\bi agree\b/i,
  /\bperfect[,.]?\s/i,
  /\bthat(?:'s| is) (?:the one|it|right|correct|spot on|exactly)\b/i,
  /\bapproved\b/i,
  /\block(?:ed)? (?:in|it)\b/i,
  /\bship it\b/i,
  /\bdo it\b/i,
  /\blets do\b/i,
];

/** Patterns that indicate project-specific knowledge */
const PROJECT_KNOWLEDGE_PATTERNS = [
  // Note: password/key/token/secret patterns removed — they risk extracting actual credentials.
  // Only match safe project knowledge hints (endpoints, ports, URLs without auth).
  /\bthe (?:endpoint|url|port) (?:is|for)\b/i,
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

/** Patterns in assistant messages that indicate design decisions.
 * When Ava makes a taste or architectural choice during work — palette,
 * font, component shape, layout pattern — that's project knowledge
 * worth saving. Previously only DISCOVERY_PATTERNS scanned assistant
 * messages, so Ava's own design decisions were silently lost. */
const DESIGN_DECISION_PATTERNS = [
  /\bi(?:'ll| will) use .{3,60} (?:for|as|because)\b/i,
  /\bchos(?:e|ing) .{3,60} (?:for|as|because|over)\b/i,
  /\bgoing with .{3,60} (?:for|because|since)\b/i,
  /\busing .{3,40} (?:for the|as the|because)\b/i,
  /\bthe (?:accent|primary|secondary|background|text) (?:colou?r|font|spacing) (?:is|will be|should be)\b/i,
  /\bset(?:ting)? .{3,30} to .{3,30} (?:for|because)\b/i,
];

interface PatternGroup {
  patterns: RegExp[];
  category: MemoryCategory;
  scope: 'global' | 'project';
  layer: MemoryLayer;
  tags: string[];
}

const USER_PATTERN_GROUPS: PatternGroup[] = [
  { patterns: EXPLICIT_REMEMBER_PATTERNS, category: 'general', scope: 'project', layer: 'project', tags: ['auto-extracted', 'explicit'] },
  { patterns: PREFERENCE_PATTERNS, category: 'preference', scope: 'global', layer: 'workflow', tags: ['auto-extracted'] },
  { patterns: CORRECTION_PATTERNS, category: 'convention', scope: 'project', layer: 'project', tags: ['auto-extracted', 'correction'] },
  { patterns: DECISION_PATTERNS, category: 'decision', scope: 'project', layer: 'project', tags: ['auto-extracted'] },
  { patterns: ARCHITECTURE_PATTERNS, category: 'architecture', scope: 'project', layer: 'project', tags: ['auto-extracted'] },
  { patterns: PERSONAL_PATTERNS, category: 'person', scope: 'global', layer: 'person', tags: ['auto-extracted'] },
  { patterns: PROJECT_KNOWLEDGE_PATTERNS, category: 'general', scope: 'project', layer: 'project', tags: ['auto-extracted', 'knowledge'] },
  { patterns: APPROVAL_PATTERNS, category: 'decision', scope: 'project', layer: 'project', tags: ['auto-extracted', 'approval'] },
];

const ASSISTANT_PATTERN_GROUPS: PatternGroup[] = [
  { patterns: DISCOVERY_PATTERNS, category: 'bug-fix', scope: 'project', layer: 'project', tags: ['auto-extracted', 'discovery'] },
  { patterns: DESIGN_DECISION_PATTERNS, category: 'decision', scope: 'project', layer: 'project', tags: ['auto-extracted', 'design-decision'] },
];

/** Category labels used as prefixes in distilled memories. */
const CATEGORY_PREFIXES: Record<string, string> = {
  preference: 'Preference',
  convention: 'Correction',
  decision: 'Decision',
  architecture: 'Stack',
  person: 'Personal',
  general: 'Note',
  'bug-fix': 'Discovery',
  approval: 'Approved',
  'design-decision': 'Design',
};

/**
 * Distill a raw message into a concise, standalone memory summary.
 *
 * Instead of saving `text.slice(0, 500)`, this extracts the key fact
 * around the matched pattern and cleans it into a useful statement.
 */
function distillMemory(text: string, matchedPattern: RegExp, group: PatternGroup): string {
  const match = matchedPattern.exec(text);
  const prefix = CATEGORY_PREFIXES[group.category] ?? 'Note';

  if (!match) {
    // Fallback: clean the first 150 chars
    return `${prefix}: ${cleanSentence(text.slice(0, 150))}`;
  }

  // Extract a window of ~100 chars around the match
  const matchStart = match.index;
  const matchEnd = matchStart + match[0].length;

  // Expand window — include more context before the match to capture negation
  const windowStart = Math.max(0, matchStart - 40);
  const windowEnd = Math.min(text.length, matchEnd + 80);

  // Check for negation in the text before the match — ensure it's included in the window
  const preContext = text.slice(Math.max(0, matchStart - 30), matchStart);
  const hasNegation = NEGATION_PATTERN.test(preContext);

  let window = text.slice(windowStart, windowEnd).trim();

  // Clean up: remove leading/trailing partial words if we sliced mid-word
  if (windowStart > 0) {
    const firstSpace = window.indexOf(' ');
    if (firstSpace > 0 && firstSpace < 15) {
      window = window.slice(firstSpace + 1);
    }
  }
  if (windowEnd < text.length) {
    const lastSpace = window.lastIndexOf(' ');
    if (lastSpace > window.length - 15 && lastSpace > 0) {
      window = window.slice(0, lastSpace);
    }
  }

  // If negation detected, use appropriate prefix
  const effectivePrefix = hasNegation && (group.category === 'architecture' || group.category === 'preference')
    ? 'Preference (avoids)' : prefix;

  return `${effectivePrefix}: ${cleanSentence(window)}`;
}

/** Clean a sentence fragment into a concise statement. */
function cleanSentence(text: string): string {
  let cleaned = text
    // Remove leading conjunctions, filler
    .replace(/^(?:well,?\s*|so,?\s*|ok(?:ay)?,?\s*|yeah?,?\s*|um+,?\s*)/i, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();

  // Remove trailing incomplete sentence fragments (no period at end)
  if (cleaned.length > 10 && !cleaned.endsWith('.') && !cleaned.endsWith('!') && !cleaned.endsWith('?')) {
    // Try to end at the last complete sentence
    const lastPeriod = cleaned.lastIndexOf('.');
    const lastBang = cleaned.lastIndexOf('!');
    const lastQ = cleaned.lastIndexOf('?');
    const lastEnd = Math.max(lastPeriod, lastBang, lastQ);
    if (lastEnd > cleaned.length * 0.4) {
      cleaned = cleaned.slice(0, lastEnd + 1);
    }
  }

  // Capitalize first letter
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return cleaned;
}

/**
 * Layer 1: Extract memorable information from recent messages using regex patterns.
 * Scans both user AND assistant messages for signals worth remembering.
 * Distills raw messages into concise, standalone summaries.
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

    // Memory-poisoning guard. First-person preference patterns ("I always",
    // "please never") are easy to plant via paste — a user who copies a
    // tutorial or README into chat shouldn't have its "I prefer X" lines
    // saved as their global preference. Apply for USER messages only:
    //   - reject anything ≥ 800 chars (paste size, not a sentence about self)
    //   - reject anything containing a code fence anywhere (not just prefix)
    //   - reject anything containing quoted text markers (>, "...") — those
    //     are signals the user is *referencing* third-party text, not stating
    //     their own preference
    if (msg.role === 'user') {
      if (text.length > 800) continue;
      if (text.includes('```')) continue;
      if (/^>\s/m.test(text)) continue;       // markdown blockquote — quoting external
      if (/(^|\n)\s*"[^"]{40,}"/m.test(text)) continue; // long inline quote
    }

    // Pick pattern groups based on role
    const groups = msg.role === 'user' ? USER_PATTERN_GROUPS
                 : msg.role === 'assistant' ? ASSISTANT_PATTERN_GROUPS
                 : [];

    for (const group of groups) {
      for (const pattern of group.patterns) {
        if (pattern.test(text)) {
          results.push({
            content: distillMemory(text, pattern, group),
            category: group.category,
            scope: group.scope,
            layer: group.layer,
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
2. **Corrections with substance** — things the user corrected with a NEW preference attached ("instead of X use Y"). Skip bare "stop"/"don't" without a replacement — those are noise, not preferences.
3. **Decisions** — technical choices, architecture decisions, workflow decisions
4. **Project knowledge** — endpoints (NOT credentials/passwords/tokens/secrets), deployment info, gotchas, workarounds
5. **Project state** — the current situation of the project: what exists, what's been built or shipped, inventory/counts, status, where things stand, what's planned next. These are durable facts even though they describe a state rather than a preference — do NOT dismiss them as "ephemeral."
6. **Personal info** — name, role, team, expertise level
7. **Solutions** — bugs that were fixed and how, tricky problems and their solutions
8. **Patterns** — recurring workflows or conventions discovered during the conversation

NEVER extract:
- The user's emotional state (frustrated, excited, stressed) — emotions are transient and biasing them into permanent memory poisons future interactions
- Apologies, acknowledgments, or back-and-forth about tone
- Anything where you'd be cataloguing how the user FELT rather than what they DECIDED

Respond ONLY with a JSON array of memory objects. Each object must have:
- "content": A concise, standalone summary (not the raw message — distill the key insight)
- "category": One of: preference, convention, architecture, bug-fix, decision, person, tool-config, pattern, general
- "scope": "global" (applies to all projects) or "project" (specific to this project)
- "layer": "person" (who the user IS), "workflow" (HOW they work), or "project" (THIS specific codebase)

Layer guidance:
- "person": name, role, experience, values, personal context, relationships
- "workflow": preferred tools, coding style, feedback preferences, work patterns — things that apply across ALL projects
- "project": architecture decisions, bug fixes, conventions specific to THIS codebase
- Context matters: "I always use pnpm" → workflow. "We use pnpm workspaces here" → project.

Rules:
- Only extract genuinely useful knowledge that would help in FUTURE conversations
- Be concise — each memory should be 1-3 sentences max
- Do NOT extract trivial things like greetings or acknowledgments
- Do NOT extract anything already obvious from the codebase itself
- If nothing worth remembering happened, return an empty array: []
- Maximum 7 memories per conversation — only the most important

Respond with ONLY the JSON array, no other text.`;

interface ReflectionMemory {
  content: string;
  category: MemoryCategory;
  scope: 'global' | 'project';
  layer?: string;
}

const VALID_CATEGORIES: MemoryCategory[] = [
  'preference', 'convention', 'architecture', 'bug-fix',
  'decision', 'person', 'tool-config', 'pattern', 'general',
];

/**
 * Layer 2: Use the LLM to reflect on the conversation and extract structured memories.
 * Only runs for meaningful conversations (>= 2 user turns).
 * Even short sessions can contain critical decisions or corrections.
 */
export async function reflectAndExtract(
  messages: Message[],
  provider: Provider,
  model: ModelDefinition,
  maxTranscript = 4000,
): Promise<ExtractedMemory[]> {
  // Only reflect on meaningful conversations (lowered from 4 — even 2-turn sessions can have critical decisions)
  const userMsgCount = messages.filter((m) => m.role === 'user').length;
  if (userMsgCount < 2) return [];

  // Build a condensed transcript (skip system prompt, limit length)
  const transcript = messages
    .filter((m) => m.role !== 'system')
    .map((m) => {
      const text = getTextContent(m.content);
      // Truncate individual messages to keep the reflection prompt manageable (500 chars for more context)
      const truncated = text.length > 500 ? text.slice(0, 500) + '...' : text;
      return `[${m.role}]: ${truncated}`;
    })
    .join('\n');

  // Cap total transcript size to stay well within context. Default 4000
  // (per-turn callers); the end-of-session pass passes a much larger cap so
  // a full session is distilled, not just its tail.
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
      max_tokens: 1200,
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
      .slice(0, 7) // Hard cap (increased from 5 for richer extraction)
      .map((m) => ({
        content: m.content.slice(0, 500),
        category: m.category,
        scope: m.scope,
        layer: (m.layer && ['person', 'workflow', 'project'].includes(m.layer)
          ? m.layer
          : inferLayer(m.category, m.scope)) as MemoryLayer,
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
          layer: mem.layer,
          tags: mem.tags,
          branch: null,
          sourceConversationId: conversationId,
        });
        saved++;
        logger.debug(`[auto-memory] L1 saved ${mem.layer}/${mem.category} memory (${mem.scope}): ${mem.content.slice(0, 60)}...`);
      } catch (err) {
        logger.debug(`[auto-memory] L1 save rejected (dedup or write error): ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (saved > 0) {
      logger.info(`[auto-memory] Layer 1: extracted ${saved} ${saved === 1 ? 'memory' : 'memories'}`);
    } else if (extracted.length > 0) {
      logger.debug(`[auto-memory] Layer 1: ${extracted.length} candidates found but all were deduped`);
    }
    return saved;
  } catch (err) {
    // Never crash the agent over auto-memory
    logger.warn(`[auto-memory] extraction crashed: ${err instanceof Error ? err.message : String(err)}`);
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
  maxTranscript = 4000,
): Promise<number> {
  try {
    const extracted = await reflectAndExtract(messages, provider, model, maxTranscript);
    if (extracted.length === 0) return 0;

    let saved = 0;
    for (const mem of extracted) {
      try {
        await memoryManager.saveEntry({
          scope: mem.scope,
          content: mem.content,
          category: mem.category,
          layer: mem.layer,
          tags: mem.tags,
          branch: null,
          sourceConversationId: conversationId,
        });
        saved++;
        logger.debug(`[auto-memory] L2 saved ${mem.layer}/${mem.category} memory (${mem.scope}): ${mem.content.slice(0, 60)}...`);
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
