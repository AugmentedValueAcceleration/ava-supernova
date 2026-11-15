/**
 * memory_save / memory_update / memory_delete over memory v4.
 *
 * Same names as the old tools, so prompts and mode allowlists are unchanged; a
 * surface using v4 registers these in their place (with MemoryRecallV4Tool).
 *
 * The rules they carry:
 *   - What the person SAID is saved at once, with their words.
 *   - What Ava NOTICED waits on the Memory page for their yes (decided
 *     15 Nov: never asked mid-conversation).
 *   - A change in the world replaces the fact; the old one becomes history.
 *   - Never credentials.
 */

import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { MemorySession } from '../memory-v4/reader.js';
import type { FactKind, FactScope } from '../memory-v4/types.js';
import { FACT_KINDS } from '../memory-v4/types.js';
import { containsCredentials } from './security.js';

const BLOCKED = 'Blocked: that looks like a key, token or password. Those never go in memory; keep them in the keychain or an environment variable.';

function sessionOf(context: ToolExecutionContext): MemorySession | undefined {
  return context.sharedState?.memorySession as MemorySession | undefined;
}

function scopeFor(session: MemorySession, scope: unknown): FactScope {
  return scope === 'project' && session.project ? `project:${session.project.id}` : 'everywhere';
}

export class MemorySaveV4Tool implements Tool {
  readonly name = 'memory_save';
  readonly description = 'Remember something about the person or their project for future conversations, or note something still to come back to.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'memory_save',
    description:
      'Save one durable fact to long-term memory, or an open thread to come back to. ' +
      'Save what will change future help: who they are, how they like to work, decisions and their reasons, project facts that cost time to rediscover. ' +
      'Not passing moods, not chit-chat, not what is already in the code or the Decisions folder. One fact per call, in plain words. ' +
      'If they TOLD you, use source "said" and put their exact words in quote; it is saved at once. ' +
      'If you NOTICED or inferred it, use source "noticed"; it waits on their Memory page for a yes, so do not ask them about it in the chat. ' +
      'If a fact they already have has CHANGED, use memory_update on it instead. NEVER save keys, tokens or passwords.',
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The fact (or thread) in one or two plain sentences, with its specifics.' },
        scope: { type: 'string', enum: ['everywhere', 'project'], description: '"everywhere": about them or how they work (follows them into every project). "project": true only for the open project.' },
        kind: { type: 'string', enum: [...FACT_KINDS, 'thread'], description: 'person, preference, rule (how to work with them), project, event; or thread for something still to come back to.' },
        source: { type: 'string', enum: ['said', 'noticed'], description: '"said": they told you (saved now). "noticed": you inferred it (waits for their yes).' },
        quote: { type: 'string', description: 'Their own words that STATE the fact, copied exactly (e.g. "im not a great fan of bold"). Not their request to save it ("save that please"), and not your words. Leave it out if they only asked you to remember something you said.' },
        due: { type: 'string', description: 'For a thread with a date: YYYY-MM-DD.' },
      },
      required: ['content', 'scope', 'source'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const session = sessionOf(context);
    if (!session) return { success: false, output: 'Memory is not available in this context.' };
    const content = String(args.content ?? '').trim();
    if (!content) return { success: false, output: 'Say what to remember (content).' };
    if (containsCredentials(content) || containsCredentials(String(args.quote ?? ''))) return { success: false, output: BLOCKED };
    const scope = scopeFor(session, args.scope);

    if (args.kind === 'thread') {
      const due = typeof args.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.due) ? args.due : undefined;
      const thread = await session.mem.addThread({ text: content, project: scope === 'everywhere' ? undefined : session.project?.id, due });
      return { success: true, output: `Open thread noted [${thread.id}]${due ? `, due ${due}` : ''}. It stays until it is done.` };
    }

    const kind = FACT_KINDS.includes(args.kind as FactKind) ? (args.kind as FactKind) : undefined;
    const said = args.source === 'said';
    // A request to save ("save that please") is not their words stating the fact.
    const rawQuote = typeof args.quote === 'string' ? args.quote.trim() : '';
    const quote = rawQuote && !/^(can you |could you |please )?(save|remember|note|store|log)\b|\b(save|remember) (that|this|it)\b/i.test(rawQuote) ? rawQuote : undefined;
    const { fact, created } = await session.mem.addFact({
      text: content,
      kind,
      scope,
      source: said ? 'said' : 'inferred',
      quote: said ? quote : undefined,
    });
    if (!created) return { success: true, output: `Already remembered [${fact.id}].` };
    return {
      success: true,
      output: fact.state === 'pending'
        ? `Noted for their yes on the Memory page [${fact.id}]. Do not ask them about it now.`
        : `Remembered [${fact.id}]${scope === 'everywhere' ? '' : ` for ${session.project?.name ?? 'this project'}`}.`,
    };
  }
}

export class MemoryUpdateV4Tool implements Tool {
  readonly name = 'memory_update';
  readonly description = 'Change a remembered fact when it has changed, fix its wording, or mark an open thread done.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'memory_update',
    description:
      'Update a remembered fact by its id (the [id] shown in memories and recall results). ' +
      'Use "changed" when something changed in the world (they moved, the plan changed): the old version is kept as history, marked until today. ' +
      'Use "correction" only to fix wrong wording of the same fact. Set done:true to close an open thread.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The fact or thread id.' },
        content: { type: 'string', description: 'The new fact, in plain words (not needed with done).' },
        change: { type: 'string', enum: ['changed', 'correction'], description: 'Default "changed".' },
        quote: { type: 'string', description: 'Their exact words, if they told you the change.' },
        done: { type: 'boolean', description: 'Close an open thread.' },
      },
      required: ['id'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const session = sessionOf(context);
    if (!session) return { success: false, output: 'Memory is not available in this context.' };
    const id = String(args.id ?? '').replace(/^\[|\]$/g, '').trim();
    if (!id) return { success: false, output: 'Give the id of the memory to update.' };

    if (args.done === true) {
      return (await session.mem.closeThread(id))
        ? { success: true, output: `Thread [${id}] closed.` }
        : { success: false, output: `No open thread [${id}].` };
    }
    const content = String(args.content ?? '').trim();
    if (!content) return { success: false, output: 'Give the new content (or done:true for a thread).' };
    if (containsCredentials(content)) return { success: false, output: BLOCKED };

    if (args.change === 'correction') {
      const fixed = await session.mem.editFact(id, { text: content });
      return fixed ? { success: true, output: `Corrected [${id}].` } : { success: false, output: `No memory [${id}].` };
    }
    const quote = typeof args.quote === 'string' && args.quote.trim() ? args.quote.trim() : undefined;
    const current = await session.mem.getFact(id);
    if (!current || current.state !== 'fact') return { success: false, output: `No current memory [${id}].` };
    if (!quote) {
      // Noticed, not told: the new version waits for their yes, and the old
      // one stays current until then.
      const { fact } = await session.mem.addFact({ text: content, kind: current.kind, scope: current.scope, source: 'inferred', replaces: id });
      return { success: true, output: `The change waits for their yes on the Memory page [${fact.id}]; [${id}] stays current until then. Do not ask them about it now.` };
    }
    const res = await session.mem.replaceFact(id, { text: content, source: 'said', quote });
    if (!res) return { success: false, output: `No current memory [${id}].` };
    return { success: true, output: `Updated [${res.fact.id}]; the old version is kept as history, true until today.` };
  }
}

export class MemoryDeleteV4Tool implements Tool {
  readonly name = 'memory_delete';
  readonly description = 'Delete a remembered fact or thread completely.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'memory_delete',
    description: 'Delete a memory by id when they ask you to forget it, or it was never true. It is gone completely: from memory, search and history. For something that merely changed, use memory_update instead.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The fact or thread id.' } },
      required: ['id'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const session = sessionOf(context);
    if (!session) return { success: false, output: 'Memory is not available in this context.' };
    const id = String(args.id ?? '').replace(/^\[|\]$/g, '').trim();
    if (!id) return { success: false, output: 'Give the id of the memory to delete.' };
    if (await session.mem.deleteFact(id)) return { success: true, output: `Forgotten [${id}].` };
    if (await session.mem.deleteThread(id)) return { success: true, output: `Thread [${id}] deleted.` };
    return { success: false, output: `No memory [${id}].` };
  }
}
