/**
 * The "What Ava knows" page (memory v4, Part 5): everything the Memory page
 * in the extension and the IDE reads and does, in one place, so both apps
 * show the same thing and act the same way. Mockup approved 15 Nov.
 *
 * One entry point, memoryPage(mem, op, args), so each app carries a single
 * message type. Replies are paged (40 facts at a time) because the IDE's
 * sidecar pipe chokes on very large replies.
 */

import type { AvaMemory } from './store.js';
import type { Fact, FactKind, Thread } from './types.js';
import { FACT_KINDS, CORE_TOKEN_BUDGET } from './types.js';
import { estimateTokens } from './store.js';
import type { Episode } from './threads-episodes.js';

export interface PageFact {
  id: string;
  text: string;
  kind: FactKind;
  scope: string;
  /** Project name for project facts; null for "about you". */
  project: string | null;
  /** said | noticed (waiting) | memory (theirs, from the old memory or a confirmed inference) */
  origin: 'said' | 'noticed' | 'memory';
  quote?: string;
  from: string;
  /** Older versions, newest first. */
  history: Array<{ text: string; from: string; until?: string }>;
  /** For a noticed change: the fact it would replace. */
  wouldReplace?: string;
}

export interface PageOverview {
  facts: number;
  aboutYou: number;
  days: number;
  pending: number;
  threadsOpen: number;
  core: string;
  coreTokens: number;
  coreBudget: number;
  projects: Array<{ id: string; name: string; count: number }>;
}

export type PageOp =
  | 'overview' | 'facts' | 'threads' | 'days'
  | 'confirm' | 'reject' | 'edit' | 'forget' | 'core'
  | 'thread_add' | 'thread_done' | 'thread_reopen' | 'thread_delete';

const PAGE = 40;

async function names(mem: AvaMemory): Promise<Record<string, string>> {
  return Object.fromEntries((await mem.projects.all()).map((p) => [p.id, p.name]));
}

async function toPage(mem: AvaMemory, f: Fact, projectNames: Record<string, string>): Promise<PageFact> {
  const chain = (await mem.factHistory(f.id)).slice(1);
  let wouldReplace: string | undefined;
  if (f.state === 'pending' && f.replaces) wouldReplace = (await mem.getFact(f.replaces))?.text;
  return {
    id: f.id,
    text: f.text,
    kind: f.kind,
    scope: f.scope,
    project: f.scope === 'everywhere' ? null : (projectNames[f.scope.slice('project:'.length)] ?? 'a project'),
    origin: f.state === 'pending' ? 'noticed' : f.source === 'said' ? 'said' : 'memory',
    quote: f.quote,
    from: f.from,
    history: f.state === 'pending' ? [] : chain.map((h) => ({ text: h.text, from: h.from, until: h.until })),
    wouldReplace,
  };
}

const matches = (f: Fact, q: string) => !q || `${f.text} ${f.quote ?? ''}`.toLowerCase().includes(q);

export async function memoryPage(mem: AvaMemory, op: PageOp, args: Record<string, unknown> = {}): Promise<unknown> {
  const str = (k: string) => (typeof args[k] === 'string' ? (args[k] as string).trim() : '');

  switch (op) {
    case 'overview': {
      const facts = await mem.listFacts('fact');
      const projectNames = await names(mem);
      const counts: Record<string, number> = {};
      for (const f of facts) if (f.scope !== 'everywhere') counts[f.scope.slice(8)] = (counts[f.scope.slice(8)] ?? 0) + 1;
      const core = await mem.readCore();
      const result: PageOverview = {
        facts: facts.length,
        aboutYou: facts.filter((f) => f.scope === 'everywhere').length,
        days: (await mem.listDays()).length,
        pending: (await mem.listFacts('pending')).length,
        threadsOpen: (await mem.listThreads()).length,
        core,
        coreTokens: estimateTokens(core),
        coreBudget: CORE_TOKEN_BUDGET,
        projects: Object.entries(counts).map(([id, count]) => ({ id, name: projectNames[id] ?? id, count })).sort((a, b) => b.count - a.count),
      };
      return result;
    }

    case 'facts': {
      // view: pending | you | project (with project id); query filters; paged.
      const view = str('view') || 'you';
      const q = str('query').toLowerCase();
      const offset = Math.max(0, Number(args.offset) || 0);
      const kind = FACT_KINDS.includes(str('kind') as FactKind) ? str('kind') : '';
      let list = view === 'pending' ? await mem.listFacts('pending') : await mem.listFacts('fact');
      if (view === 'you') list = list.filter((f) => f.scope === 'everywhere');
      if (view === 'project') list = list.filter((f) => f.scope === `project:${str('project')}`);
      list = list.filter((f) => matches(f, q) && (!kind || f.kind === kind));
      // Newest first within each kind; kinds in the page's order.
      const order = (k: string) => FACT_KINDS.indexOf(k as FactKind);
      list.sort((a, b) => order(a.kind) - order(b.kind) || (b.from || '').localeCompare(a.from || ''));
      const projectNames = await names(mem);
      const items = await Promise.all(list.slice(offset, offset + PAGE).map((f) => toPage(mem, f, projectNames)));
      const byKind: Record<string, number> = {};
      for (const f of list) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
      return { items, total: list.length, byKind, offset };
    }

    case 'threads': {
      const projectNames = await names(mem);
      const all = await mem.listThreads({ includeDone: true });
      return all.map((t: Thread) => ({ ...t, projectName: t.project ? (projectNames[t.project] ?? 'a project') : null }));
    }

    case 'days': {
      const q = str('query').toLowerCase();
      const offset = Math.max(0, Number(args.offset) || 0);
      const all = [...(await mem.listDays())].reverse();
      const days: Episode[] = [];
      let skipped = 0;
      for (const d of all) {
        const ep = await mem.readDay(d);
        if (q && !ep.sections.some((s) => s.lines.join(' ').toLowerCase().includes(q))) continue;
        if (skipped++ < offset) continue;
        days.push(ep);
        if (days.length >= 15) break;
      }
      return { days, total: all.length, offset };
    }

    case 'confirm':
      return { ok: !!(await mem.confirmFact(str('id'))) };
    case 'reject':
    case 'forget':
      return { ok: await mem.deleteFact(str('id')) };
    case 'edit': {
      const text = str('text');
      if (!text) return { ok: false, error: 'A memory needs some words.' };
      return { ok: !!(await mem.editFact(str('id'), { text })) };
    }
    case 'core': {
      const res = await mem.writeCore(typeof args.text === 'string' ? args.text : '');
      return res.ok ? { ok: true, tokens: res.tokens } : { ok: false, tokens: res.tokens, error: `That is about ${res.tokens} tokens; the core page is limited to ${res.budget}.` };
    }
    case 'thread_add': {
      const text = str('text');
      if (!text) return { ok: false };
      const due = /^\d{4}-\d{2}-\d{2}$/.test(str('due')) ? str('due') : undefined;
      await mem.addThread({ text, project: str('project') || undefined, due });
      return { ok: true };
    }
    case 'thread_done':
      return { ok: await mem.closeThread(str('id')) };
    case 'thread_reopen':
      return { ok: await mem.reopenThread(str('id')) };
    case 'thread_delete':
      return { ok: await mem.deleteThread(str('id')) };
    default:
      return { ok: false, error: `Unknown memory page action: ${String(op)}` };
  }
}
