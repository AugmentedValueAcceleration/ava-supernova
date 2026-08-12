// ─── day_plan_read / day_plan_write / day_plan_item_status ──────────────────
//
// Ava's side of the day plan. The operator sees it in a sidebar all day; these
// let her see the same thing, add to it when they agree something, and tick off
// what she can actually verify.
//
// The read tool is the important one, and it exists because of a mistake made
// twice. In the health room she could create plans but never SEE one, so she
// archived a plan somebody was four days into and reported that nothing had
// been displaced — confidently, because no tool had told her otherwise. A list
// she cannot read is a list she will eventually contradict.
//
// What she must never do is tick something she did not witness. A scheduled
// post publishes itself and the system records that; a post the operator put
// out by hand is theirs to confirm. Claiming either on her own behalf turns the
// plan from a record into an opinion, and the whole point of writing the day
// down is that it stays a record.

import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { DayPlanStore, NewDayPlanItem } from '../social/day-plan.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function store(context: ToolExecutionContext): DayPlanStore | null {
  return (context.sharedState?.dayPlanStore as DayPlanStore | undefined) ?? null;
}

/** One line per item, grouped so a story reads as one thing. */
function describe(items: Awaited<ReturnType<DayPlanStore['list']>>): string {
  if (!items.length) return 'Nothing planned.';

  const groups = new Map<string, typeof items>();
  for (const it of items) {
    const key = it.group_id || `solo:${it.id}`;
    const list = groups.get(key);
    if (list) list.push(it);
    else groups.set(key, [it]);
  }

  const lines: string[] = [];
  for (const rows of groups.values()) {
    const head = rows[0];
    const when = head.plan_time ? head.plan_time.slice(0, 5) : 'anytime';
    const outputs = rows
      .map(r => {
        const where = r.platform || (r.kind === 'work' ? 'to do' : 'post');
        // Say HOW it is known, every time. "done" alone invites her to treat a
        // box someone ticked and a post that actually published as the same
        // fact, which is exactly the confusion this column exists to prevent.
        const state = r.status === 'done'
          ? `done${r.done_by ? ` (${r.done_by})` : ''}`
          : r.status;
        return `${where}: ${state}`;
      })
      .join(', ');
    lines.push(`- ${when} — ${head.title} [${outputs}]${head.notes ? ` — ${head.notes}` : ''}`);
    if (rows[0].id) lines.push(`  ids: ${rows.map(r => r.id).join(' ')}`);
  }
  return lines.join('\n');
}

export class DayPlanReadTool implements Tool {
  readonly name = 'day_plan_read';
  readonly description =
    'Read the plan for a day — what was agreed, what has gone out, what has not. Call this before planning a day (items may already be there, carried from yesterday) and any time you need to know where the day stands.';

  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'day_plan_read',
    description:
      'The day\'s plan: each story, its time, and the state of every platform under it. Call it BEFORE planning a day — work carried from yesterday is already sitting there, and planning over the top of it produces duplicates.',
    parameters: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'YYYY-MM-DD, the operator\'s LOCAL day. Omit for today. Call get_datetime rather than assuming what today is.',
        },
      },
      required: [],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const s = store(context);
    if (!s) return { success: false, output: 'The day plan is not available in this context.' };

    const date = typeof args.date === 'string' && ISO_DATE.test(args.date) ? args.date : null;
    if (args.date && !date) {
      return { success: false, output: `Invalid date "${String(args.date)}" — must be YYYY-MM-DD. Call get_datetime and use the local day.` };
    }

    try {
      const items = await s.list(date ?? '');
      return {
        success: true,
        output: describe(items),
        metadata: { count: items.length, date: date ?? 'today' },
      };
    } catch (err) {
      return { success: false, output: `Could not read the plan: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}

export class DayPlanWriteTool implements Tool {
  readonly name = 'day_plan_write';
  readonly description =
    'Write agreed items into a day\'s plan. Use it when the operator has DECIDED something goes out — not to record a suggestion. A story going to several platforms is several items sharing one group_id.';

  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'day_plan_write',
    description:
      'Add items to a day\'s plan. Only what the operator has actually agreed — this is the record of decisions, and filling it with things they have not chosen makes it useless to both of you. A story going to several platforms is one item PER PLATFORM sharing a group_id, because each output is separately done or not.',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD local day. Omit for today.' },
        items: {
          type: 'array',
          description: 'The agreed items.',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'The story or the task, in their words where possible.' },
              time: { type: 'string', description: 'HH:MM local. Omit for anytime. Never invent a time they did not agree; ask or leave it out.' },
              kind: { type: 'string', enum: ['post', 'work'], description: 'post = something that goes out; work = everything else the day contains (record the video, cut the thumbnail, reply to comments).' },
              platform: { type: 'string', description: 'For a post: tweet, bluesky, linkedin, facebook, instagram, youtube. Omit for work.' },
              group_id: { type: 'string', description: 'Same value across every platform of ONE story, so they read as one thing. Any stable string; reuse it across that story\'s items in this call.' },
              notes: { type: 'string', description: 'Optional one line — why it lands, or what it needs.' },
            },
            required: ['title'],
          },
        },
      },
      required: ['items'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const s = store(context);
    if (!s) return { success: false, output: 'The day plan is not available in this context.' };

    const date = typeof args.date === 'string' && ISO_DATE.test(args.date) ? args.date : '';
    const raw = Array.isArray(args.items) ? (args.items as unknown[]) : [];

    const items: NewDayPlanItem[] = raw
      .map((r) => {
        const o = (r && typeof r === 'object') ? r as Record<string, unknown> : {};
        const time = typeof o.time === 'string' && /^\d{2}:\d{2}$/.test(o.time) ? `${o.time}:00` : null;
        return {
          title: String(o.title || '').trim(),
          plan_time: time,
          kind: o.kind === 'work' ? 'work' as const : 'post' as const,
          platform: typeof o.platform === 'string' ? o.platform.trim() : null,
          notes: typeof o.notes === 'string' ? o.notes.trim() : null,
          group_id: typeof o.group_id === 'string' ? o.group_id.trim() : null,
        };
      })
      .filter(i => i.title);

    if (!items.length) return { success: false, output: 'No items with a title — nothing written.' };

    try {
      const n = await s.add(date, items);
      return {
        success: true,
        output: `${n} item${n === 1 ? '' : 's'} written to the plan. They are on the operator's screen now.`,
        metadata: { written: n },
      };
    } catch (err) {
      return { success: false, output: `Could not write the plan: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}

export class DayPlanItemStatusTool implements Tool {
  readonly name = 'day_plan_item_status';
  readonly description =
    'Change one plan item: done, dropped, or carried. Only mark done what you can actually verify — a post you watched publish. Anything the operator did by hand is theirs to tick.';

  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'day_plan_item_status',
    description:
      'Set one item to done, dropped, carried, or back to planned. Get ids from day_plan_read. NEVER mark something done that you did not witness — if the operator says they posted it, that is them telling you, and it is still their tick to make, not evidence you hold.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The item id, from day_plan_read.' },
        status: { type: 'string', enum: ['planned', 'done', 'dropped', 'carried'], description: 'The new state.' },
      },
      required: ['id', 'status'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const s = store(context);
    if (!s) return { success: false, output: 'The day plan is not available in this context.' };

    const id = typeof args.id === 'string' ? args.id.trim() : '';
    const status = args.status as 'planned' | 'done' | 'dropped' | 'carried';
    if (!id) return { success: false, output: 'Missing `id` — read the plan first to get it.' };
    if (!['planned', 'done', 'dropped', 'carried'].includes(status)) {
      return { success: false, output: `Invalid status "${String(args.status)}".` };
    }

    try {
      // 'ava' as done_by, never 'system' or 'operator': whoever reads this row
      // later should be able to tell that SHE marked it, and weigh it
      // accordingly. Laundering her own tick as the system's would be the
      // quietest possible lie.
      const ok = await s.setStatus(id, status, status === 'done' ? 'ava' : null);
      if (!ok) return { success: false, output: `No plan item with id ${id}.` };
      return { success: true, output: `Item ${id} is now ${status}.`, metadata: { id, status } };
    } catch (err) {
      return { success: false, output: `Could not update the item: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}
