/**
 * Brainstormed plans, in the work (plan 2026-11-17-brainstorm, Phase 4).
 *
 * A brainstorm assigned to a project is a LINK: the plan stays in
 * ~/.ava/brainstorm and the Brainstorm room. While he works in that project,
 * Code and Plan mode are shown the plans assigned to it every turn — short:
 * what each is, how far along, what's next — and use `brainstorm_plan` to read
 * one in full, tick what's been built, and note what changed while building.
 *
 * Every turn, not once a session: the plan moves as they build (and he can
 * tick it by hand in the room), so a copy taken at the start goes stale.
 */

import { BrainstormStore } from './brainstorm-store.js';

/** How many plans the turn names; more than this and the rest are a count. */
const SHOWN = 5;

let storeForTests: BrainstormStore | null = null;
/** Tests: a store on a scratch folder. */
export function setWorkPlansStore(store: BrainstormStore | null): void { storeForTests = store; }
export const workPlansStore = () => storeForTests ?? new BrainstormStore();

/**
 * One line per brainstorm assigned to this project — only those with a plan or
 * an experience (an assigned brainstorm with nothing decided yet has nothing to
 * build from). Undefined when there are none, so the prompt says nothing.
 */
export async function assignedPlansContext(projectRoot?: string | null): Promise<string | undefined> {
  if (!projectRoot) return undefined;
  const store = workPlansStore();
  const mine = (await store.forProject(projectRoot).catch(() => []))
    .filter((s) => s.stepsTotal > 0 || s.hasExperience);
  if (!mine.length) return undefined;
  const lines: string[] = [];
  for (const sum of mine.slice(0, SHOWN)) {
    const s = await store.get(sum.id).catch(() => null);
    if (!s) continue;
    const name = `[${s.id}] "${s.headline || 'untitled'}" (${s.kind})`;
    const parts: string[] = [];
    if (s.plan?.steps.length) {
      const done = s.plan.steps.filter((x) => x.done).length;
      const next = s.plan.steps.find((x) => !x.done && x.tier === 'small') ?? s.plan.steps.find((x) => !x.done);
      parts.push(done === s.plan.steps.length
        ? `all ${done} steps done`
        : `${done} of ${s.plan.steps.length} steps done; next: "${next!.text}"`);
    }
    if (s.experience && (s.experience.words.length || s.experience.principles.length)) {
      parts.push(`experience: ${s.experience.words.join(', ') || '(principles only)'}${s.experience.notWords.length ? `, never ${s.experience.notWords.join(', ')}` : ''}`);
    }
    lines.push(`- ${name} — ${parts.join('; ')}`);
  }
  if (mine.length > SHOWN) lines.push(`- and ${mine.length - SHOWN} more (brainstorm_plan list)`);
  return lines.join('\n');
}
