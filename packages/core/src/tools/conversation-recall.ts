import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { Message } from '../core/types.js';
import { getTextContent } from '../core/types.js';
import { HistoryManager } from '../history/history-manager.js';

/**
 * conversation_recall — the recoverability backstop for context compression.
 *
 * When a long session crosses the compression threshold, older turns are
 * replaced in the *working context* by a summary (for speed and cost). The
 * full transcript is never lost, though — it's the caller's canonical
 * conversation, which Agent.run receives in full at the start of every turn
 * and which HistoryManager persists verbatim to ~/.ava/history. This tool lets
 * Ava read that full transcript on demand.
 *
 * The point: an imperfect summary stops being a context-loss bug. Instead of
 * confabulating or re-asking "what did you want again?", Ava searches the real
 * record and answers from it. That's the difference between "lossy" (detail
 * left the working window) and "lost" (detail is unrecoverable).
 *
 * Source priority:
 *   1. sharedState.recallTranscript — the uncompressed turn-start transcript
 *      the agent stashes each run (freshest, in-process, no IO).
 *   2. On-disk history by conversationId — fallback for contexts without the
 *      stash (e.g. spawned sub-agents).
 */
export class ConversationRecallTool implements Tool {
  readonly name = 'conversation_recall';
  readonly description =
    'Search the earlier part of THIS conversation — including turns that were ' +
    'compressed out of your working context. Use this the moment you are unsure ' +
    'what the user said earlier, what was decided, or what a value/path/name was, ' +
    'instead of guessing or asking them to repeat. This reads the real transcript.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;
  // The conversation is the user's own record (their messages, your replies),
  // not freshly-fetched third-party content — trusted, like memory_recall.
  readonly outputTrust = 'trusted' as const;

  readonly schema: FunctionSchema = {
    name: 'conversation_recall',
    description:
      'Search this conversation\'s full transcript (including compressed-away turns) ' +
      'for what was said earlier. Returns the matching messages with who said them. ' +
      'Prefer this over asking the user to repeat themselves.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'What to look for — keywords, a topic, a file/value name, or a phrase ' +
            'the user used. Matched case-insensitively across earlier messages.',
        },
        max_results: {
          type: 'number',
          description: 'Maximum matching messages to return (default 5).',
        },
      },
      required: ['query'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const query = (args.query as string)?.trim();
    const maxResults = Math.max(1, Math.min(20, (args.max_results as number) ?? 5));

    if (!query) {
      return { success: false, output: 'A query is required — say what to look for.' };
    }

    const transcript = await this.resolveTranscript(context);
    if (!transcript || transcript.length === 0) {
      return {
        success: true,
        output:
          'No earlier conversation is available to search — this looks like the start of the session.',
      };
    }

    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.replace(/[^\w]/g, ''))
      .filter((t) => t.length > 1);

    // Score every non-system message by how many query terms it contains.
    // Position is kept so the model gets a sense of "how far back" a match is.
    const scored: Array<{ index: number; role: string; text: string; score: number }> = [];
    transcript.forEach((m, index) => {
      if (m.role === 'system') return;
      const text = getTextContent(m.content);
      if (!text) return;
      const lower = text.toLowerCase();
      // Skip our own synthetic injections (compression headers, task blocks)
      // so recall returns real conversation, not the scaffolding around it.
      if (this.isMetaInjection(lower)) return;
      let score = 0;
      for (const term of terms) {
        if (lower.includes(term)) score += 1;
      }
      // A whole-phrase hit is worth more than scattered term hits.
      if (terms.length > 1 && lower.includes(query.toLowerCase())) score += terms.length;
      if (score > 0) scored.push({ index, role: m.role, text, score });
    });

    if (scored.length === 0) {
      return {
        success: true,
        output: `Nothing in the earlier conversation matched "${query}". It may not have been discussed, or try different keywords.`,
      };
    }

    // Highest score first; on a tie, the more recent message wins.
    scored.sort((a, b) => (b.score - a.score) || (b.index - a.index));
    const top = scored.slice(0, maxResults);

    const total = transcript.length;
    const lines = top.map((hit) => {
      const who = hit.role === 'user' ? 'User' : hit.role === 'assistant' ? 'Ava' : hit.role;
      const fromEnd = total - hit.index;
      const excerpt = this.excerptAround(hit.text, terms, query);
      return `[${who}, ~${fromEnd} message(s) back]\n${excerpt}`;
    });

    return {
      success: true,
      output: `Found ${scored.length} earlier message(s) matching "${query}" (showing ${top.length}):\n\n${lines.join('\n\n---\n\n')}`,
      metadata: { matches: scored.length, returned: top.length, query },
    };
  }

  /** Stash first, disk second. Returns null when neither source has anything. */
  private async resolveTranscript(context: ToolExecutionContext): Promise<Message[] | null> {
    const stashed = context.sharedState?.recallTranscript as Message[] | undefined;
    if (Array.isArray(stashed) && stashed.length > 0) return stashed;

    const conversationId = context.conversationId;
    if (!conversationId) return null;
    try {
      // Prefer the surface's account-scoped HistoryManager (extension puts it
      // in sharedState) so we read the right transcripts; fall back to the
      // default ~/.ava/history for the CLI / anonymous local use.
      const hm = (context.sharedState?.historyManager as HistoryManager | undefined) ?? new HistoryManager();
      await hm.init();
      const record = await hm.resumeConversation(conversationId);
      return record?.messages ?? null;
    } catch {
      return null;
    }
  }

  /** True for our own compression/continuation scaffolding messages. */
  private isMetaInjection(lowerText: string): boolean {
    return (
      lowerText.startsWith('[context was compressed') ||
      lowerText.startsWith('[') && lowerText.includes('earlier messages compressed') ||
      lowerText.startsWith('[original request at session start]') ||
      lowerText.startsWith('[system notice]') ||
      lowerText.startsWith('[resume the task')
    );
  }

  /**
   * Return a readable window around the first query hit, so a long message
   * doesn't flood the result. Falls back to the head of the message when no
   * single term is found inline (e.g. only the whole-phrase scorer fired).
   */
  private excerptAround(text: string, terms: string[], query: string): string {
    const WINDOW = 320;
    if (text.length <= WINDOW) return text.trim();

    const lower = text.toLowerCase();
    let hit = lower.indexOf(query.toLowerCase());
    if (hit === -1) {
      for (const term of terms) {
        hit = lower.indexOf(term);
        if (hit !== -1) break;
      }
    }
    if (hit === -1) return text.slice(0, WINDOW).trim() + ' …';

    const start = Math.max(0, hit - WINDOW / 3);
    const end = Math.min(text.length, hit + (WINDOW * 2) / 3);
    const prefix = start > 0 ? '… ' : '';
    const suffix = end < text.length ? ' …' : '';
    return prefix + text.slice(start, end).trim() + suffix;
  }
}
