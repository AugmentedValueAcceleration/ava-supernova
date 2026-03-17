/**
 * Cross-Memory Insights — Layer 4 of the memory system.
 *
 * Analyses patterns across multiple memories to surface themes,
 * consolidate related entries, and generate summaries.
 *
 * Runs periodically (not every turn) — e.g. at session end or
 * when memory count exceeds a threshold.
 */

import type { MemoryManager } from './memory-manager.js';
import type { MemoryCategory } from './types.js';
import type { Provider } from '../providers/types.js';
import type { Message, ModelDefinition } from '../core/types.js';
import { logger } from '../core/logger.js';

/** An insight discovered across memories. */
export interface MemoryInsight {
  /** What the insight is about. */
  title: string;
  /** Detailed description. */
  summary: string;
  /** Related memory IDs. */
  relatedMemoryIds: string[];
  /** Category of the insight. */
  category: MemoryCategory;
  /** How confident we are in this insight (0-1). */
  confidence: number;
}

const INSIGHT_PROMPT = `You are a memory analysis assistant. You have access to a set of memories stored by an AI coding assistant about its user and their projects.

Analyze these memories and identify:

1. **Themes** — What topics keep coming up? What is the user focused on?
2. **Contradictions** — Are any memories outdated or contradicting each other?
3. **Consolidation opportunities** — Can multiple memories be merged into a cleaner summary?
4. **Emerging patterns** — What working style, preferences, or decisions are becoming clear?

Respond with a JSON array of insight objects:
{
  "title": "Short title for this insight",
  "summary": "2-3 sentence description of what you noticed",
  "relatedMemoryIds": ["id1", "id2"],
  "category": "pattern|preference|decision|architecture|general",
  "confidence": 0.8
}

Rules:
- Maximum 5 insights
- Only surface genuinely useful observations
- Include memory IDs so the system knows which entries are related
- If nothing interesting stands out, return an empty array: []

Respond with ONLY the JSON array.`;

/**
 * Analyse all active memories and generate cross-cutting insights.
 *
 * Should be called sparingly — e.g. at session end, or when
 * memory count exceeds a threshold (20+).
 */
export async function generateInsights(
  memoryManager: MemoryManager,
  provider: Provider,
  model: ModelDefinition,
): Promise<MemoryInsight[]> {
  try {
    const globalStore = await memoryManager.loadGlobalStore();
    const projectStore = await memoryManager.loadProjectStore();

    const allEntries = [
      ...globalStore.entries,
      ...(projectStore?.entries ?? []),
    ].filter(e => !e.archived);

    // Only run if we have enough memories to find patterns
    if (allEntries.length < 8) return [];

    // Format memories for the LLM (cap at 30 most recent)
    const sorted = allEntries
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 30);

    const memoryText = sorted
      .map(e => `[ID: ${e.id}] [${e.category}] ${e.content.slice(0, 200)}`)
      .join('\n');

    const response = await provider.createCompletion({
      model: model.id,
      messages: [
        { role: 'system', content: INSIGHT_PROMPT } as Message,
        { role: 'user', content: memoryText } as Message,
      ],
      temperature: 0.2,
      max_tokens: 1000,
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) return [];

    // Parse JSON
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(jsonStr) as MemoryInsight[];
    if (!Array.isArray(parsed)) return [];

    // Validate
    const validCategories: MemoryCategory[] = [
      'pattern', 'preference', 'decision', 'architecture', 'general',
      'convention', 'bug-fix', 'tool-config', 'person',
    ];

    return parsed
      .filter(i =>
        typeof i.title === 'string' &&
        typeof i.summary === 'string' &&
        Array.isArray(i.relatedMemoryIds) &&
        validCategories.includes(i.category) &&
        typeof i.confidence === 'number'
      )
      .slice(0, 5);
  } catch (err) {
    logger.debug(`[insights] Cross-memory analysis failed: ${err}`);
    return [];
  }
}

/**
 * Run insights and auto-save the most confident ones as meta-memories.
 * These help Ava build a higher-level understanding over time.
 */
export async function analyseAndSave(
  memoryManager: MemoryManager,
  provider: Provider,
  model: ModelDefinition,
): Promise<number> {
  try {
    const insights = await generateInsights(memoryManager, provider, model);
    if (insights.length === 0) return 0;

    let saved = 0;
    for (const insight of insights) {
      if (insight.confidence >= 0.7) {
        try {
          await memoryManager.saveEntry({
            scope: 'global',
            content: `[Insight] ${insight.title}: ${insight.summary}`,
            category: insight.category,
            tags: ['auto-insight', 'cross-memory'],
          });
          saved++;
          logger.debug(`[insights] Saved insight: ${insight.title}`);
        } catch {
          // Dedup or write error
        }
      }
    }

    if (saved > 0) {
      logger.info(`[insights] Generated and saved ${saved} cross-memory ${saved === 1 ? 'insight' : 'insights'}`);
    }
    return saved;
  } catch {
    return 0;
  }
}
