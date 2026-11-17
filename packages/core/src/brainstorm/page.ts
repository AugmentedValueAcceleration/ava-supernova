/**
 * The Brainstorm room's page (plan 2026-11-17-brainstorm, Phase 3; mockup
 * Decisions/brainstorm/brainstorm-room-mockup.html, approved 17 Nov).
 *
 * One function for both apps, like the Connections page: each app's room sends
 * `brainstormPage(op, args)` to its host and shows the reply, so the extension
 * and the IDE can't drift. Everything it shows is read from ~/.ava/brainstorm
 * (and the brand kit an experience was saved to).
 *
 *   state                       every brainstorm (summaries) + the projects he can assign to
 *   read      { id }            one brainstorm in full, with its kit
 *   create    { headline? }     a new, empty brainstorm the room's chat writes into
 *   assign    { id, project }   link to a project folder ('' unassigns)
 *   tick      { id, step, done } tick a plan step by hand
 *   idea      { id, ideaId, status, reason? }  move an idea between columns
 *   delete    { id }
 */

import { BrainstormStore, summarise, tickSteps } from './brainstorm-store.js';
import type { BrainstormIdeaStatus, BrainstormSession, BrainstormSessionSummary } from './types.js';
import { knownProjects, readBrandKit } from '../brand/brand-kits.js';

export interface BrainstormPageState {
  brainstorms: BrainstormSessionSummary[];
  projects: Array<{ path: string; name: string }>;
}

export interface BrainstormPageDetail {
  brainstorm: BrainstormSession;
  /** The kit its experience went to, if any — and whether he has agreed it yet. */
  kit: { id: string; name: string; proposed: boolean } | null;
}

let storeForTests: BrainstormStore | null = null;
/** Tests: a store on a scratch folder. */
export function setBrainstormPageStore(store: BrainstormStore | null): void { storeForTests = store; }
const store = () => storeForTests ?? new BrainstormStore();

/** A brainstorm with nothing in it yet — made by the room, never written into by anyone. */
const isEmpty = (s: BrainstormSessionSummary) => s.ideaCount === 0 && s.stepsTotal === 0 && !s.hasExperience;

async function state(): Promise<BrainstormPageState> {
  const all = await store().list();
  // An empty brainstorm left behind (opened, never used) for more than a day is
  // clutter, not thinking: the room hides it. The newest one is always shown, so
  // "New brainstorm" never seems to do nothing.
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  const brainstorms = all.filter((s, i) => i === 0 || !isEmpty(s) || s.headline.trim() || new Date(s.updatedAt).getTime() > dayAgo);
  return { brainstorms, projects: await knownProjects().catch(() => []) };
}

async function detail(id: string): Promise<BrainstormPageDetail | null> {
  const s = await store().get(id);
  if (!s) return null;
  let kit: BrainstormPageDetail['kit'] = null;
  if (s.experience?.kitId) {
    const k = await readBrandKit(s.experience.kitId).catch(() => null);
    if (k) kit = { id: k.id, name: k.name, proposed: k.status === 'proposed' };
  }
  return { brainstorm: s, kit };
}

export async function brainstormPage(op: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const str = (k: string) => String(args[k] ?? '');
  const st = store();
  switch (op) {
    case 'state':
      return state();
    case 'read':
      return detail(str('id'));
    case 'create': {
      const s = st.create('unsure', str('headline').trim());
      await st.save(s);
      return { id: s.id, state: await state() };
    }
    case 'assign': {
      const project = str('project').trim();
      await st.assign(str('id'), project || null);
      return { detail: await detail(str('id')), state: await state() };
    }
    case 'tick': {
      const s = await st.get(str('id'));
      if (s && tickSteps(s, [str('step')], args.done !== false)) await st.save(s);
      return { detail: await detail(str('id')), state: await state() };
    }
    case 'idea': {
      const s = await st.get(str('id'));
      const idea = s?.ideas.find((i) => i.id === str('ideaId'));
      const status = (['candidate', 'chosen', 'parked', 'rejected'] as const).find((x) => x === args.status) as BrainstormIdeaStatus | undefined;
      if (s && idea && status) {
        idea.status = status;
        if (typeof args.reason === 'string' && args.reason.trim()) idea.reason = args.reason.trim();
        idea.updatedAt = new Date().toISOString();
        await st.save(s);
      }
      return { detail: await detail(str('id')), state: await state() };
    }
    case 'delete':
      await st.delete(str('id'));
      return state();
    default:
      throw new Error(`Unknown Brainstorm room request: ${op}`);
  }
}

/** For the room's chat: what Ava is told about the brainstorm this conversation belongs to. */
export async function brainstormRoomContext(id: string): Promise<string> {
  const s = await store().get(id).catch(() => null);
  // Still the room, even when its brainstorm can't be read (deleted, or the file
  // is damaged): say so plainly rather than fall back to a prompt for elsewhere.
  if (!s) return `This conversation is in the Brainstorm room, but its brainstorm [${id}] could not be read. Tell him in a line, and start a new one with brainstorm_session action="save" if he wants to carry on.`;
  const sum = summarise(s);
  const lines = [
    `This conversation IS brainstorm [${s.id}]${s.headline ? ` — "${s.headline}"` : ' (new, no headline yet: give it one when you first save)'}. `
      + `Save everything into it: brainstorm_session with session_id="${s.id}" — never start another one from here. `
      + 'He sees its Ideas, Plan and Experience beside this chat, updating as you save.',
    `Now: kind ${s.kind}; ${sum.ideaCount} ideas (${sum.openCount} open); plan ${sum.stepsDone}/${sum.stepsTotal} done; `
      + `${sum.hasExperience ? `experience: ${s.experience!.words.join(', ')}${s.experience!.kitId ? ' (saved to a kit)' : ''}` : 'no experience yet'}; `
      + `${s.projectPath ? `assigned to ${s.projectPath}` : 'not assigned to a project'}.`,
  ];
  return lines.join('\n');
}
