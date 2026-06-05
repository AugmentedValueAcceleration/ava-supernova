/**
 * Memory Agent — Intelligent context curation for Ava.
 *
 * Runs on a cheap, fast model (Qwen Flash) and sits between Ava
 * and the raw memory store. Instead of dumping raw memories into
 * Ava's context, the Memory Agent curates a brief — a concise
 * summary of what's relevant plus a list of topics Ava can request
 * deeper recall on.
 *
 * This makes context window size almost irrelevant. Ava's working
 * context is always lean: system prompt + brief + recent exchanges.
 *
 * Flow:
 *   Pre-turn:  generateBrief()  → inject brief into Ava's context
 *   Mid-turn:  deepRecall()     → Ava requests more detail on a topic
 *   Post-turn: extractAndSave() → save important facts from the exchange
 */

import type { Message } from '../core/types.js';
import { getTextContent } from '../core/types.js';
import type { Provider } from '../providers/types.js';
import type { ModelDefinition } from '../core/types.js';
import type { MemoryManager } from './memory-manager.js';
import type { MemoryCategory, MemoryLayer } from './types.js';
import { inferLayer } from './types.js';
import { autoExtractAndSave, reflectAndSave } from './auto-extract.js';
import { logger } from '../core/logger.js';

/**
 * Transcript budget for the end-of-session reflection. Much larger than the
 * per-turn default (4000) so a full session is distilled rather than just its
 * tail — Qwen Flash's context easily absorbs it, and it runs once per session.
 */
const SESSION_REFLECT_MAX_TRANSCRIPT = 40000;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MemoryBrief {
  /** Concise summary of what's relevant (~200 tokens) */
  summary: string;
  /** Topics Ava can request deeper recall on */
  availableTopics: Array<{
    topic: string;
    entryCount: number;
    description: string;
  }>;
  /** How many memory entries were considered */
  consideredEntryCount: number;
}

export interface MemoryAgentOptions {
  memoryManager: MemoryManager;
  provider: Provider;
  model: ModelDefinition;
  /** Max tokens for the brief output. Default: 300 */
  maxBriefTokens?: number;
}

// ─── Prompts ────────────────────────────────────────────────────────────────

const BRIEF_PROMPT = `You are a memory curator for an AI assistant called Ava. Your job is to read raw memory entries and the user's current message, then write a concise brief that tells Ava what she needs to know.

Memories are organized into three layers:
- PERSON: who the user is (always relevant — name, role, values, personal context)
- WORKFLOW: how the user works (always relevant — tools, style, preferences)
- PROJECT: this specific codebase (relevant when discussing this project)

Prioritize Person and Workflow memories — they apply everywhere. Include Project memories when they match the user's message.

Rules:
- Write 2-4 sentences summarising what's relevant to the user's message
- Focus on facts, decisions, preferences, and context that help Ava respond well
- After the summary, list available memory topics as a JSON array
- Each topic: { "topic": "short label", "count": number, "desc": "one line" }
- Only list topics that have 1+ relevant entries
- If nothing is relevant, write "No relevant memories." and an empty topics array
- If any memories mention learned patterns or preferences (e.g., "prefers camelCase", "always tests before committing"), highlight these — they help Ava match the user's style
- Include relevance scores when available — prioritise high-match memories over weak ones
- Be concise. This goes into Ava's working context — every token counts.

Respond in this exact format:
BRIEF: <your 2-4 sentence summary>
TOPICS: <JSON array of topics>`;

const DEEP_RECALL_PROMPT = `You are a memory curator. The AI assistant Ava needs detailed information about a specific topic. Read the raw memory entries below and synthesise a clear, detailed answer.

Rules:
- Include all relevant facts, decisions, and context
- Quote specific details (names, dates, file paths, commands)
- If entries conflict, note both and which is newer
- Be thorough but concise — this is injected mid-conversation`;

const EXTRACT_PROMPT = `You are a memory extractor. Read the conversation exchange below and extract important facts worth remembering for future conversations.

Extract as a JSON array. Each entry:
{ "content": "concise fact (1-2 sentences)", "category": "preference|convention|architecture|bug-fix|decision|person|general", "scope": "global|project", "layer": "person|workflow|project" }

Layer rules:
- "person": Facts about WHO the user is (name, role, expertise, values, personal context, relationships)
- "workflow": HOW the user works (preferred tools, coding style, feedback preferences, work patterns). Use when a preference applies across all projects.
- "project": Facts about THIS specific codebase (architecture, conventions, decisions, bugs, what's been tried)

Context clues:
- "I always use pnpm" → workflow (cross-project preference)
- "We use pnpm workspaces here" → project (this codebase's setup)
- "My name is..." → person
- "I prefer TypeScript" → workflow
- "The API uses REST not GraphQL" → project
- "My daughter's name is Sophie" → person (family, remember for future reference)
- "I live in Birmingham" → person (location)
- "I deal with memory loss" → person (health context, shapes how Ava should communicate)
- "I love hiking on weekends" → person (interests, useful for Chat mode rapport)
- "My birthday is in April" → person (personal milestone)

Rules:
- Only extract non-obvious, useful information
- Skip ephemeral details (debugging steps, temporary state)
- NEVER extract the user's emotional state, frustration, tone, or feedback about Ava's behaviour. Emotions are transient and storing them as memory poisons future interactions.
- Maximum 5 entries per extraction
- If nothing worth saving, return []`;

// ─── Memory Agent ───────────────────────────────────────────────────────────

export class MemoryAgent {
  private memoryManager: MemoryManager;
  private provider: Provider;
  private model: ModelDefinition;
  private maxBriefTokens: number;

  constructor(opts: MemoryAgentOptions) {
    this.memoryManager = opts.memoryManager;
    this.provider = opts.provider;
    this.model = opts.model;
    this.maxBriefTokens = opts.maxBriefTokens ?? 300;
  }

  /**
   * End-of-session reflection — the safe place for conversation→memory
   * distillation.
   *
   * Pass the FULL conversation (the persisted transcript keeps everything the
   * live working context may have compressed away). One cheap Flash call
   * distills durable user/project facts via REFLECTION_PROMPT; dedup is the
   * memory manager's job. Because this runs only at the session boundary —
   * never on the hot path — it cannot create the conversation→memory feedback
   * loop that per-turn derivation did (there is no "same session" left to
   * re-inject into). Fire-and-forget; never throws.
   */
  async reflectOnSession(messages: Message[], conversationId?: string): Promise<number> {
    try {
      const saved = await reflectAndSave(
        messages,
        this.memoryManager,
        this.provider,
        this.model,
        conversationId,
        SESSION_REFLECT_MAX_TRANSCRIPT,
      );
      if (saved > 0) logger.info(`[memory] End-of-session reflection saved ${saved} ${saved === 1 ? 'memory' : 'memories'}`);
      return saved;
    } catch (err) {
      logger.debug(`[memory] End-of-session reflection failed: ${err instanceof Error ? err.message : String(err)}`);
      return 0;
    }
  }

  /**
   * Pre-turn: Generate a memory brief for Ava's context.
   *
   * 1. TF-IDF recall against the user's message
   * 2. Pass raw results + user message to the memory model
   * 3. Return a concise brief + list of available topics
   *
   * 3-second timeout — falls back to formatted TF-IDF results if slow.
   */
  async generateBrief(userMessage: string, conversationContext?: string): Promise<MemoryBrief> {
    const emptyBrief: MemoryBrief = { summary: '', availableTopics: [], consideredEntryCount: 0 };

    try {
      // ── v3 Project Brain (preferred over raw recall) ───────────────────
      // If a project brain exists, use it as the primary context injection.
      // It's pre-computed, ~200 tokens, always relevant, and doesn't depend
      // on keyword matching against the user's first message. This is the
      // "warm start guaranteed" upgrade from v3.
      //
      // Falls back to the v2.1 project-knowledge recall if no brain exists
      // (e.g., fresh project with zero graph nodes yet).
      let projectPrefix = '';
      try {
        const brain = this.memoryManager.getProjectBrain?.();
        if (brain?.brief) {
          projectPrefix = `[Project Brain]\n${brain.brief}\n\n`;
        } else {
          // Fallback: v2.1 project-only recall for projects without a brain yet
          const projectResults = await this.memoryManager.recall({
            query: userMessage,
            limit: 5,
            scope: 'project',
          });
          if (projectResults && projectResults.length > 0) {
            const projectLines = projectResults.map((r) => {
              const entry = r.entry || r;
              const content = entry.content || (r as any).content || '';
              const category = entry.category || 'general';
              return `- (${category}) ${content.slice(0, 200)}`;
            });
            projectPrefix = `[Project Context]\n${projectLines.join('\n')}\n\n`;
          }
        }
      } catch {
        // Non-critical — proceed without project prefix
      }

      // Recall raw candidates (both scopes)
      const results = await this.memoryManager.recall({
        query: userMessage,
        limit: 15,
        scope: 'all',
      });

      if (!results || results.length === 0) {
        // Even if general recall is empty, surface the project prefix
        if (projectPrefix) return { summary: projectPrefix.trim(), availableTopics: [], consideredEntryCount: 0 };
        return emptyBrief;
      }

      // Format raw memories with relevance scores so the brief generator
      // knows which memories are strong matches vs. marginal
      const rawMemories = results.map((r, i) => {
        const entry = r.entry || r;
        const content = entry.content || (r as any).content || '';
        const category = entry.category || (r as any).category || 'general';
        const scope = r.scope || 'global';
        const relevance = typeof (r as any).relevance === 'number'
          ? Math.round((r as any).relevance * 100)
          : null;
        const recency = entry.updatedAt
          ? `${Math.round((Date.now() - new Date(entry.updatedAt).getTime()) / 86400000)}d ago`
          : '';
        const meta = [relevance ? `${relevance}% match` : '', recency].filter(Boolean).join(', ');
        return `[${i + 1}] (${scope}/${category}${meta ? ' | ' + meta : ''}) ${content.slice(0, 300)}`;
      }).join('\n');

      // Try LLM curation with timeout
      try {
        const brief = await this.callWithTimeout(
          this.curateBrief(userMessage, rawMemories, conversationContext),
          3000,
        );
        // Prepend project context to the LLM brief
        const fullSummary = projectPrefix ? projectPrefix + brief.summary : brief.summary;
        return { ...brief, summary: fullSummary, consideredEntryCount: results.length };
      } catch {
        // Timeout or model failure — fall back to top 3 TF-IDF results
        logger.debug('[memory-agent] Brief generation timed out, using TF-IDF fallback');
        const fallback = this.tfidfFallbackBrief(results);
        if (projectPrefix) fallback.summary = projectPrefix + fallback.summary;
        return fallback;
      }
    } catch {
      return emptyBrief;
    }
  }

  /**
   * Deep recall: Ava requests more detail on a specific topic.
   * Called when Ava uses the memory_recall tool.
   */
  async deepRecall(topic: string, query: string): Promise<string> {
    try {
      const results = await this.memoryManager.recall({
        query: query || topic,
        limit: 10,
        scope: 'all',
      });

      if (!results || results.length === 0) return `No memories found about "${topic}".`;

      const rawMemories = results.map((r, i) => {
        const entry = r.entry || r;
        const content = entry.content || (r as any).content || '';
        const category = entry.category || (r as any).category || 'general';
        return `[${i + 1}] (${category}) ${content}`;
      }).join('\n');

      // Try LLM synthesis with timeout
      try {
        return await this.callWithTimeout(
          this.synthesiseRecall(topic, rawMemories),
          5000,
        );
      } catch {
        // Timeout — return raw entries formatted
        return `**Memories about "${topic}":**\n\n${rawMemories}`;
      }
    } catch {
      return `Failed to recall memories about "${topic}".`;
    }
  }

  /**
   * Post-turn: Extract important facts from the latest exchange.
   *
   * Runs Layer 1 (regex, zero cost) always.
   * Then runs a single LLM extraction call (replaces the separate
   * reflectAndSave, trackAndLearn, and analyseAndSave calls).
   * Falls back to Layer 1 only if the LLM call fails.
   */
  async extractAndSave(messages: Message[], conversationId?: string): Promise<number> {
    let saved = 0;

    // Layer 1: Regex extraction (always runs, zero cost)
    try {
      saved += await autoExtractAndSave(messages, this.memoryManager, conversationId);
    } catch { /* non-fatal */ }

    // Layer 2: LLM extraction (single call replaces 3 separate layers)
    try {
      const lastMessages = messages.slice(-6);
      const transcript = lastMessages
        .map(m => {
          const text = getTextContent(m.content);
          return `[${m.role}] ${text.slice(0, 500)}`;
        })
        .join('\n');

      if (transcript.length < 50) return saved;

      const extracted = await this.callWithTimeout(
        this.llmExtract(transcript),
        5000,
      );

      for (const mem of extracted) {
        try {
          await this.memoryManager.saveEntry({
            scope: mem.scope as 'global' | 'project',
            content: mem.content,
            category: mem.category as MemoryCategory,
            layer: mem.layer as MemoryLayer,
            tags: ['memory-agent', 'auto-extracted'],
            branch: null,
            sourceConversationId: conversationId,
          });
          saved++;
        } catch (err) {
          logger.debug(`[memory-agent] Dedup/write rejection for L2 memory: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      if (saved > 0) {
        logger.info(`[memory-agent] Extracted and saved ${saved} memories`);
      }
    } catch (err) {
      // LLM extraction failed — Layer 1 results are still saved
      logger.warn(`[memory-agent] LLM extraction failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // ── v3 Ambient capture — evaluate this turn as a memory candidate ──
    // Runs AFTER regex + LLM extraction so it benefits from dedup (ambient
    // won't promote something that regex already captured). Uses heuristic
    // scoring by default; LLM scoring is optional (provider-dependent).
    try {
      const ambientCapture = this.memoryManager.getAmbientCapture?.('project');
      if (ambientCapture && messages.length >= 2) {
        const lastUser = [...messages].reverse().find(m => m.role === 'user');
        const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
        if (lastUser && lastAssistant) {
          const candidate = {
            userMessage: getTextContent(lastUser.content),
            assistantMessage: getTextContent(lastAssistant.content),
            toolsUsed: (lastAssistant as any).tool_calls
              ? (lastAssistant as any).tool_calls.map((tc: any) => tc.function?.name).filter(Boolean)
              : [],
            turnIndex: messages.filter(m => m.role === 'user').length,
            sessionId: conversationId,
          };
          const promoted = await ambientCapture.evaluate(candidate);
          if (promoted) {
            saved++;
            logger.debug(`[memory-agent] Ambient capture promoted a node: ${promoted}`);
          }
        }
      }
    } catch (err) {
      // Ambient capture is non-critical — never blocks the response
      logger.debug(`[memory-agent] Ambient capture failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    return saved;
  }

  // ─── Private: LLM Calls ─────────────────────────────────────────────────

  private async curateBrief(
    userMessage: string,
    rawMemories: string,
    conversationContext?: string,
  ): Promise<Omit<MemoryBrief, 'consideredEntryCount'>> {
    const contextLine = conversationContext
      ? `\n\nRecent conversation context:\n${conversationContext.slice(0, 500)}`
      : '';

    const messages = [
      { role: 'system' as const, content: BRIEF_PROMPT },
      {
        role: 'user' as const,
        content: `User's current message:\n${userMessage.slice(0, 500)}${contextLine}\n\nRaw memory entries:\n${rawMemories}`,
      },
    ];

    const response = await this.provider.createCompletion({
      model: this.model.id,
      messages,
      temperature: 0.1,
      max_tokens: this.maxBriefTokens,
      stream: false,
    });

    const text = this.extractText(response);
    return this.parseBriefResponse(text);
  }

  private async synthesiseRecall(topic: string, rawMemories: string): Promise<string> {
    const messages = [
      { role: 'system' as const, content: DEEP_RECALL_PROMPT },
      {
        role: 'user' as const,
        content: `Topic: ${topic}\n\nRaw memory entries:\n${rawMemories}`,
      },
    ];

    const response = await this.provider.createCompletion({
      model: this.model.id,
      messages,
      temperature: 0.1,
      max_tokens: 500,
      stream: false,
    });

    return this.extractText(response) || rawMemories;
  }

  private async llmExtract(
    transcript: string,
  ): Promise<Array<{ content: string; category: string; scope: string; layer: string }>> {
    const messages = [
      { role: 'system' as const, content: EXTRACT_PROMPT },
      { role: 'user' as const, content: transcript },
    ];

    const response = await this.provider.createCompletion({
      model: this.model.id,
      messages,
      temperature: 0.1,
      max_tokens: 400,
      stream: false,
    });

    const text = this.extractText(response) || '[]';

    // Parse JSON array from response (may be wrapped in markdown code block)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    try {
      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        content?: string;
        category?: string;
        scope?: string;
        layer?: string;
      }>;

      return parsed
        .filter(e => e.content && e.content.length >= 10 && e.category && e.scope)
        .slice(0, 5)
        .map(e => ({
          content: e.content!,
          category: e.category!,
          scope: e.scope!,
          layer: e.layer && ['person', 'workflow', 'project'].includes(e.layer)
            ? e.layer
            : inferLayer(e.category as MemoryCategory, e.scope as 'global' | 'project'),
        }));
    } catch {
      return [];
    }
  }

  // ─── Private: Helpers ───────────────────────────────────────────────────

  private parseBriefResponse(text: string): Omit<MemoryBrief, 'consideredEntryCount'> {
    const briefMatch = text.match(/BRIEF:\s*([\s\S]*?)(?:TOPICS:|$)/i);
    const topicsMatch = text.match(/TOPICS:\s*(\[[\s\S]*\])/i);

    const summary = briefMatch?.[1]?.trim() || text.trim();

    let availableTopics: MemoryBrief['availableTopics'] = [];
    if (topicsMatch) {
      try {
        const parsed = JSON.parse(topicsMatch[1]) as Array<{
          topic?: string;
          count?: number;
          desc?: string;
        }>;
        availableTopics = parsed
          .filter(t => t.topic)
          .map(t => ({
            topic: t.topic!,
            entryCount: t.count || 1,
            description: t.desc || '',
          }));
      } catch { /* malformed JSON — skip topics */ }
    }

    return { summary, availableTopics };
  }

  private tfidfFallbackBrief(
    results: Array<{ entry?: any; content?: string; scope?: string; category?: string }>,
  ): MemoryBrief {
    const top3 = results.slice(0, 3);
    const summary = top3
      .map(r => {
        const content = r.entry?.content || r.content || '';
        return content.slice(0, 150);
      })
      .join(' | ');

    // Group by category for topics
    const categoryMap = new Map<string, number>();
    for (const r of results) {
      const cat = r.entry?.category || r.category || 'general';
      categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
    }

    const availableTopics = Array.from(categoryMap.entries()).map(([topic, count]) => ({
      topic,
      entryCount: count,
      description: `${count} ${topic} memories available`,
    }));

    return { summary, availableTopics, consideredEntryCount: results.length };
  }

  /** Extract text content from a CompletionResponse (handles multiple shapes) */
  private extractText(response: unknown): string {
    const r = response as Record<string, unknown>;
    // Standard OpenAI format: { choices: [{ message: { content: "..." } }] }
    if (r.choices && Array.isArray(r.choices) && r.choices.length > 0) {
      const choice = r.choices[0] as Record<string, unknown>;
      const msg = choice.message as Record<string, unknown> | undefined;
      if (msg?.content && typeof msg.content === 'string') return msg.content;
    }
    // Direct content field (some providers)
    if (typeof r.content === 'string') return r.content;
    return '';
  }

  private callWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Memory agent timeout')), ms);
      promise
        .then(result => { clearTimeout(timer); resolve(result); })
        .catch(err => { clearTimeout(timer); reject(err); });
    });
  }
}
