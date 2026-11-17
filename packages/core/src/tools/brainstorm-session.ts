import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { BrainstormStore, addChange, normaliseKind, setExperience, setPlan, tickSteps } from '../brainstorm/brainstorm-store.js';
import type { BrainstormChange, BrainstormIdeaStatus, BrainstormSession } from '../brainstorm/types.js';
import { BRAINSTORM_KINDS } from '../brainstorm/types.js';
import { kitForProject, proposeBrandKit, readBrandKit, updateBrandKit } from '../brand/brand-kits.js';

/**
 * Brainstorms, as a tool (plan Decisions/plans/2026-11-17-brainstorm.md).
 *
 * Brainstorm mode is for someone who is not ready to commit yet. If nothing is
 * written down until they commit, the brainstorms most worth keeping are the
 * ones lost — explore five ideas over an evening, pick none, close the app, and
 * Thursday starts from nothing. So it's saved as it happens, locally.
 *
 * A brainstorm holds: what KIND of fragment it was (project, feature,
 * experience, direction, not sure), the ideas — including the ones turned down
 * and why — a living plan (steps that get ticked, and what changed while
 * building), the experience their users should have, and the project it's
 * assigned to (a link; the file stays in ~/.ava/brainstorm).
 *
 * NOT memory. Memory holds durable facts about the PERSON. This holds the
 * thinking. The experience goes on to a brand kit — only with his yes.
 */
export class BrainstormSessionTool implements Tool {
  readonly name = 'brainstorm_session';
  readonly description =
    'Keep and recall brainstorms — the ideas (including parked and rejected ones, and why), a living plan, the experience ' +
    'their users should have, and the project it is assigned to. Stored locally in ~/.ava/brainstorm, never in a project.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  // experience_to_kit changes a brand kit: that one always asks (ToolRegistry.needsConfirmation).
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'brainstorm_session',
    description:
      'Brainstorms, kept locally. recall — list them (call early; "you were circling this three weeks ago" is the most useful thing '
      + 'you can say to someone stuck). read — one in full. save — create or update one: its kind, headline, ideas, notes, plan '
      + '(summary + steps, small first then ambitious), ticks, changes, experience. assign — link it to a project folder (it stays '
      + 'here; Ava sees it while working in that project); project_path "" unassigns. experience_to_kit — save its experience to a '
      + 'brand kit (he always sees a card): the project\'s linked kit, a kit by id, or a new PROPOSED kit he agrees in Brand Kits, in the Creative Studio.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['recall', 'read', 'save', 'assign', 'attach', 'experience_to_kit'], description: 'What to do' },
        session_id: { type: 'string', description: 'The brainstorm. Omit on save to start a new one.' },
        kind: {
          type: 'string',
          enum: BRAINSTORM_KINDS,
          description: 'save: what kind of fragment it is — project (something new), feature (an addition to an existing project), '
            + 'experience (what their users should feel), direction (where an existing project goes next), unsure (working it out).',
        },
        headline: { type: 'string', description: 'save: what it is about, in their own words.' },
        ideas: {
          type: 'array',
          description: 'save: the ideas so far. Include rejected and parked ones WITH a reason — an idea turned down and not recorded gets proposed again next time.',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Short name' },
              summary: { type: 'string', description: 'A sentence or two — enough to recognise it months later' },
              status: { type: 'string', enum: ['candidate', 'chosen', 'parked', 'rejected'] },
              reason: { type: 'string', description: 'Why parked or rejected, in their words where possible' },
            },
            required: ['title', 'summary', 'status'],
          },
        },
        notes: { type: 'array', items: { type: 'string' }, description: 'save: threads worth keeping that are not ideas — constraints, tangents, context.' },
        plan: {
          type: 'object',
          description: 'save: the plan for the chosen idea. Steps replace the list (ticks are kept for steps with the same text).',
          properties: {
            summary: { type: 'string', description: 'What it is, in a sentence or two.' },
            steps: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  text: { type: 'string' },
                  tier: { type: 'string', enum: ['small', 'ambitious'], description: 'small — the finishable first version; ambitious — after it.' },
                  done: { type: 'boolean' },
                },
                required: ['text'],
              },
            },
          },
        },
        tick: { type: 'array', items: { type: 'string' }, description: 'save: steps done (by id or text).' },
        untick: { type: 'array', items: { type: 'string' }, description: 'save: steps no longer done.' },
        changes: {
          type: 'array',
          description: 'save: what happened to the plan — changed (and WHY), a new idea the work turned up, or a note.',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['changed', 'new-idea', 'note'] },
              text: { type: 'string' },
            },
            required: ['type', 'text'],
          },
        },
        experience: {
          type: 'object',
          description: 'save: what their users should feel. Fields given replace those fields.',
          properties: {
            words: { type: 'array', items: { type: 'string' }, description: 'The words for it: calm, in control…' },
            not_words: { type: 'array', items: { type: 'string' }, description: 'What it must never be: guilty, rushed…' },
            principles: {
              type: 'array',
              description: '3–5 principles, each with what it means in practice.',
              items: {
                type: 'object',
                properties: { title: { type: 'string' }, do: { type: 'string' }, dont: { type: 'string' } },
                required: ['title', 'do', 'dont'],
              },
            },
          },
        },
        project_path: { type: 'string', description: 'assign: the project folder\'s absolute path; "" to unassign.' },
        kit_id: { type: 'string', description: 'experience_to_kit: a particular kit. Omit to use the project\'s linked kit, or propose a new one.' },
        kit_name: { type: 'string', description: 'experience_to_kit: the name for a new proposed kit.' },
      },
      required: ['action'],
    },
  };

  constructor(private readonly store: BrainstormStore = new BrainstormStore()) {}

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = this.store;
    const action = String(args.action ?? '');
    const projectRoot = context.cwd;
    const id = args.session_id ? String(args.session_id) : '';

    try {
      switch (action) {
        case 'recall': {
          const all = await store.list(projectRoot);
          if (all.length === 0) return { success: true, output: 'No previous brainstorms. This is a first conversation.' };
          const lines = all.slice(0, 15).map((s) => {
            const bits = [
              s.updatedAt.slice(0, 10), s.kind, s.headline,
              `${s.ideaCount} ideas${s.openCount ? `, ${s.openCount} still open` : ''}`,
              s.stepsTotal ? `plan ${s.stepsDone}/${s.stepsTotal} done` : '',
              s.hasExperience ? 'has an experience' : '',
              s.projectPath ? `assigned to ${s.projectPath}` : 'not assigned',
            ].filter(Boolean);
            return `- [${s.id}] ${bits.join(' · ')}`;
          });
          return { success: true, output: `${all.length} brainstorm(s):\n${lines.join('\n')}\n\nRead one with action="read" before assuming what it covered.` };
        }

        case 'read': {
          if (!id) return { success: false, output: 'session_id is required to read a brainstorm.' };
          const s = await store.get(id);
          return s ? { success: true, output: JSON.stringify(s, null, 2) } : { success: false, output: `No brainstorm ${id}.` };
        }

        case 'save': {
          let s: BrainstormSession | null = id ? await store.get(id) : null;
          if (id && !s) return { success: false, output: `No brainstorm ${id}. Omit session_id to start a new one.` };
          if (!s) s = store.create(normaliseKind(args.kind ?? 'unsure'), String(args.headline ?? 'Untitled brainstorm'));
          else {
            if (args.kind) s.kind = normaliseKind(args.kind);
            if (args.headline) s.headline = String(args.headline);
          }
          mergeIdeas(store, s, args.ideas);
          if (Array.isArray(args.notes)) {
            for (const n of args.notes as unknown[]) {
              const note = String(n).trim();
              if (note && !s.notes.includes(note)) s.notes.push(note);
            }
          }
          if (args.plan && typeof args.plan === 'object') setPlan(s, args.plan as Parameters<typeof setPlan>[1]);
          const ticked = Array.isArray(args.tick) ? tickSteps(s, args.tick.map(String), true) : 0;
          if (Array.isArray(args.untick)) tickSteps(s, args.untick.map(String), false);
          for (const c of (Array.isArray(args.changes) ? args.changes : []) as Array<Record<string, unknown>>) {
            const type = (['changed', 'new-idea', 'note'] as const).find((t) => t === c?.type) ?? 'note';
            // Work in a project writes through its own tool (Phase 4), marked 'work'.
            addChange(s, { type, text: String(c?.text ?? ''), from: 'brainstorm' } as Omit<BrainstormChange, 'at'>);
          }
          if (args.experience && typeof args.experience === 'object') {
            const e = args.experience as Record<string, unknown>;
            setExperience(s, {
              words: e.words as string[] | undefined,
              notWords: (e.not_words ?? e.notWords) as string[] | undefined,
              principles: e.principles as Array<{ title: string; do: string; dont: string }> | undefined,
            });
          }
          await store.save(s);
          const steps = s.plan?.steps ?? [];
          return {
            success: true,
            output: `Saved brainstorm ${s.id} (${s.kind}: ${s.ideas.length} ideas${steps.length ? `, plan ${steps.filter((x) => x.done).length}/${steps.length} done` : ''}${ticked ? `, ${ticked} ticked` : ''}${s.experience ? ', experience kept' : ''}). Kept locally — not in any project.`,
          };
        }

        case 'assign':
        case 'attach': {
          if (!id) return { success: false, output: 'assign needs session_id.' };
          const path = String(args.project_path ?? '').trim();
          const s = await store.assign(id, path || null);
          if (!s) return { success: false, output: `No brainstorm ${id}.` };
          return {
            success: true,
            output: path
              ? `Brainstorm ${id} is assigned to ${path}. It stays in Brainstorm; whenever work happens in that project, Ava sees it and keeps its plan up to date.`
              : `Brainstorm ${id} is no longer assigned to a project.`,
          };
        }

        case 'experience_to_kit': {
          if (!id) return { success: false, output: 'experience_to_kit needs session_id.' };
          const s = await store.get(id);
          if (!s) return { success: false, output: `No brainstorm ${id}.` };
          const e = s.experience;
          if (!e || (!e.words.length && !e.principles.length)) return { success: false, output: 'This brainstorm has no experience yet: pin it down first (save with experience).' };
          const experience = { words: e.words, notWords: e.notWords, principles: e.principles };
          const reasoning = `From the brainstorm "${s.headline}": what the people using it should feel.`;
          let kitId = args.kit_id ? String(args.kit_id) : '';
          if (!kitId && s.projectPath) {
            const found = await kitForProject(s.projectPath);
            if (found.status === 'linked') kitId = found.kit.id;
          }
          let saved: { id: string; name: string; proposed: boolean };
          if (kitId) {
            const kit = await readBrandKit(kitId);
            if (!kit) return { success: false, output: `There is no kit ${kitId}.` };
            if (kit.status === 'proposed') {
              const r = await proposeBrandKit(kitId, { experience }, kit.reasoning ?? reasoning, kit.proposedFor ?? s.projectPath);
              if ('refused' in r) return { success: false, output: r.refused };
              saved = { id: r.id, name: r.name, proposed: true };
            } else {
              const r = await updateBrandKit(kitId, { experience });
              if (!r) return { success: false, output: `There is no kit ${kitId}.` };
              saved = { id: r.id, name: r.name, proposed: false };
            }
          } else {
            const name = String(args.kit_name ?? '').trim() || s.headline;
            const r = await proposeBrandKit(undefined, { name, experience }, reasoning, s.projectPath ?? null);
            if ('refused' in r) return { success: false, output: r.refused };
            saved = { id: r.id, name: r.name, proposed: true };
          }
          s.experience = { ...e, kitId: saved.id };
          await store.save(s);
          return {
            success: true,
            output: saved.proposed
              ? `The experience is in the proposed kit "${saved.name}" [${saved.id}]. It is not in use until he agrees the kit in Brand Kits, in the Creative Studio — tell him that's where to look.`
              : `The experience is saved in the brand kit "${saved.name}" [${saved.id}]; every mode working with that kit now designs and writes for it.`,
          };
        }

        default:
          return { success: false, output: `Unknown action "${action}".` };
      }
    } catch (err) {
      return { success: false, output: `Brainstorm store failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}

function mergeIdeas(store: BrainstormStore, s: BrainstormSession, incoming: unknown): void {
  for (const raw of (Array.isArray(incoming) ? incoming : []) as Array<Record<string, unknown>>) {
    if (!raw?.title) continue;
    const title = String(raw.title);
    const existing = s.ideas.find((i) => i.title === title);
    const status = (['candidate', 'chosen', 'parked', 'rejected'] as const).find((x) => x === raw.status) as BrainstormIdeaStatus | undefined;
    if (existing) {
      existing.summary = String(raw.summary ?? existing.summary);
      existing.status = status ?? existing.status;
      if (raw.reason) existing.reason = String(raw.reason);
      existing.updatedAt = new Date().toISOString();
    } else {
      store.addIdea(s, { title, summary: String(raw.summary ?? ''), status: status ?? 'candidate', ...(raw.reason ? { reason: String(raw.reason) } : {}) });
    }
  }
}
