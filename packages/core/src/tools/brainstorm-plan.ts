import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { addChange, setPlan, tickSteps } from '../brainstorm/brainstorm-store.js';
import type { BrainstormSession } from '../brainstorm/types.js';
import { workPlansStore } from '../brainstorm/work-plans.js';

/**
 * A brainstormed plan, from the work (plan 2026-11-17-brainstorm, Phase 4).
 *
 * Code and Plan mode's side of a living plan. The plan was made in the
 * Brainstorm room and assigned to this project; it stays there. While building,
 * Ava reads it, ticks what has been built AND checked, and keeps it honest:
 * a step the work showed was missing gets added, one it made pointless gets
 * dropped — never silently, always with why, which lands in the plan's "how it
 * has grown" marked "while building". New ideas the work turns up are noted
 * there too, not acted on.
 *
 * Brainstorming itself (ideas, kinds, experience, kits) stays in
 * brainstorm_session, in Brainstorm mode.
 */
export class BrainstormPlanTool implements Tool {
  readonly name = 'brainstorm_plan';
  readonly description =
    'The plans brainstormed for this project (made in the Brainstorm room, assigned here): read one, tick steps as they are built '
    + 'and checked, add or drop steps with why, note what changed while building.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'brainstorm_plan',
    description:
      'Brainstormed plans for the project you are working in. list — the plans assigned to this project. read — one in full '
      + '(steps with ids, what it should feel like, how it has grown, ideas turned down and why). tick / untick — steps built '
      + 'and checked (by id or text). add_steps / drop_steps — when the work shows the plan was wrong; why is required and '
      + 'recorded. note — what changed while building (changed), an idea the work turned up (new-idea), or anything else (note).',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'read', 'tick', 'untick', 'add_steps', 'drop_steps', 'note'], description: 'What to do' },
        id: { type: 'string', description: 'The brainstorm (its id, shown in brackets). Every action but list.' },
        steps: {
          type: 'array',
          items: { type: 'string' },
          description: 'tick / untick / drop_steps: step ids or their text. add_steps: the new steps\' text.',
        },
        tier: { type: 'string', enum: ['small', 'ambitious'], description: 'add_steps: small — part of the finishable first version; ambitious — after it. Default small.' },
        why: { type: 'string', description: 'add_steps / drop_steps: why the plan changed, in a sentence. Required.' },
        type: { type: 'string', enum: ['changed', 'new-idea', 'note'], description: 'note: what kind of note.' },
        text: { type: 'string', description: 'note: the note, in a sentence or two.' },
      },
      required: ['action'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = workPlansStore();
    const action = String(args.action ?? '');
    const id = typeof args.id === 'string' ? args.id.trim().replace(/^\[|\]$/g, '') : '';
    const steps = Array.isArray(args.steps) ? args.steps.map(String).map((x) => x.trim()).filter(Boolean) : [];
    const why = typeof args.why === 'string' ? args.why.trim() : '';

    try {
      if (action === 'list') {
        const mine = context.cwd ? await store.forProject(context.cwd) : [];
        if (!mine.length) return { success: true, output: 'No brainstormed plans are assigned to this project. He assigns one from the Brainstorm room.' };
        return {
          success: true,
          output: mine.map((s) => `[${s.id}] "${s.headline || 'untitled'}" (${s.kind}) — ${s.stepsTotal ? `${s.stepsDone} of ${s.stepsTotal} steps done` : 'no plan yet'}${s.hasExperience ? '; has an experience' : ''}`).join('\n'),
        };
      }

      if (!id) return { success: false, output: 'id is required — the brainstorm\'s id, shown in brackets.' };
      const s = await store.get(id);
      if (!s) return { success: false, output: `No brainstorm ${id}. brainstorm_plan list shows the ones assigned to this project.` };

      switch (action) {
        case 'read':
          return { success: true, output: describe(s) };

        case 'tick':
        case 'untick': {
          if (!s.plan?.steps.length) return { success: false, output: 'This brainstorm has no plan steps yet.' };
          if (!steps.length) return { success: false, output: 'steps is required: the step ids or their text.' };
          const unknown = steps.filter((r) => !findStep(s, r));
          const n = tickSteps(s, steps, action === 'tick');
          await store.save(s);
          return {
            success: unknown.length === 0,
            output: `${action === 'tick' ? 'Ticked' : 'Unticked'} ${n} step${n === 1 ? '' : 's'}. ${progress(s)}`
              + (unknown.length ? `\nNot in the plan: ${unknown.map((u) => `"${u}"`).join(', ')}. Read it for the step ids.` : ''),
          };
        }

        case 'add_steps': {
          if (!steps.length) return { success: false, output: 'steps is required: the new steps\' text.' };
          if (!why) return { success: false, output: 'why is required — the plan only changes with a reason he can read later.' };
          const tier: 'small' | 'ambitious' = args.tier === 'ambitious' ? 'ambitious' : 'small';
          const before = s.plan?.steps ?? [];
          const fresh = steps.filter((t) => !before.some((x) => x.text.toLowerCase() === t.toLowerCase()));
          if (!fresh.length) return { success: false, output: 'Those steps are already in the plan.' };
          setPlan(s, { steps: [...before.map((x) => ({ text: x.text, tier: x.tier, done: x.done })), ...fresh.map((text) => ({ text, tier }))] });
          addChange(s, { type: 'changed', text: `Added ${fresh.map((t) => `"${t}"`).join(', ')}: ${why}`, from: 'work' });
          await store.save(s);
          return { success: true, output: `Added ${fresh.length} step${fresh.length === 1 ? '' : 's'} (${tier}), with why. ${progress(s)}` };
        }

        case 'drop_steps': {
          if (!steps.length) return { success: false, output: 'steps is required: the step ids or their text.' };
          if (!why) return { success: false, output: 'why is required — the plan only changes with a reason he can read later.' };
          const going = steps.map((r) => findStep(s, r)).filter((x): x is NonNullable<typeof x> => !!x);
          if (!going.length) return { success: false, output: 'None of those steps are in the plan. Read it for the step ids.' };
          const ids = new Set(going.map((x) => x.id));
          setPlan(s, { steps: s.plan!.steps.filter((x) => !ids.has(x.id)).map((x) => ({ text: x.text, tier: x.tier, done: x.done })) });
          addChange(s, { type: 'changed', text: `Dropped ${going.map((x) => `"${x.text}"`).join(', ')}: ${why}`, from: 'work' });
          await store.save(s);
          return { success: true, output: `Dropped ${going.length} step${going.length === 1 ? '' : 's'}, with why. ${progress(s)}` };
        }

        case 'note': {
          const text = typeof args.text === 'string' ? args.text.trim() : '';
          if (!text) return { success: false, output: 'text is required.' };
          const type = (['changed', 'new-idea', 'note'] as const).find((t) => t === args.type) ?? 'note';
          addChange(s, { type, text, from: 'work' });
          await store.save(s);
          return { success: true, output: `Noted in "${s.headline || s.id}" — he sees it in the Brainstorm room, under how it has grown.` };
        }

        default:
          return { success: false, output: `Unknown action "${action}". Use list, read, tick, untick, add_steps, drop_steps or note.` };
      }
    } catch (err) {
      return { success: false, output: `The plan couldn't be changed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}

const norm = (t: string) => t.trim().toLowerCase();
function findStep(s: BrainstormSession, ref: string) {
  return s.plan?.steps.find((x) => x.id === ref || norm(x.text) === norm(ref));
}

function progress(s: BrainstormSession): string {
  const all = s.plan?.steps ?? [];
  const done = all.filter((x) => x.done).length;
  return all.length ? `Now ${done} of ${all.length} done.` : 'The plan has no steps now.';
}

/** One brainstorm, for building from: the plan first, then what it should feel like, then its history. */
function describe(s: BrainstormSession): string {
  const out: string[] = [`[${s.id}] "${s.headline || 'untitled'}" (${s.kind})${s.projectPath ? ` — assigned to ${s.projectPath}` : ' — not assigned to a project'}`];
  if (s.plan) {
    if (s.plan.summary) out.push(`What it is: ${s.plan.summary}`);
    for (const tier of ['small', 'ambitious'] as const) {
      const steps = s.plan.steps.filter((x) => x.tier === tier);
      if (!steps.length) continue;
      out.push(tier === 'small' ? 'The small version first:' : 'The ambitious version:');
      for (const x of steps) out.push(`  [${x.done ? 'x' : ' '}] ${x.text}  (id ${x.id})`);
    }
    if (s.plan.changes.length) {
      out.push('How it has grown (latest last):');
      for (const c of s.plan.changes.slice(-8)) out.push(`  - ${c.type}${c.from === 'work' ? ', while building' : ''} (${c.at.slice(0, 10)}): ${c.text}`);
    }
  } else {
    out.push('No plan yet.');
  }
  const e = s.experience;
  if (e && (e.words.length || e.principles.length)) {
    out.push(`What the people using it should feel: ${e.words.join(', ') || '—'}${e.notWords.length ? `; never ${e.notWords.join(', ')}` : ''}.`);
    for (const p of e.principles) out.push(`  - ${p.title}: do ${p.do || '—'}; don't ${p.dont || '—'}.`);
  }
  const chosen = s.ideas.filter((i) => i.status === 'chosen');
  const turnedDown = s.ideas.filter((i) => i.status === 'rejected' || i.status === 'parked');
  if (chosen.length) out.push(`Chosen: ${chosen.map((i) => `${i.title} — ${i.summary}`).join(' | ')}`);
  if (turnedDown.length) out.push(`Turned down or parked (don't re-propose without saying what changed): ${turnedDown.map((i) => `${i.title} (${i.status}${i.reason ? `: ${i.reason}` : ''})`).join(' | ')}`);
  return out.join('\n');
}
