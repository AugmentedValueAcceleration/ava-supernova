/**
 * Promotion (memory v4, Part 6; agreed 15 Nov): a lesson that turns up in a
 * second project may be how the person always works. Ava never decides that,
 * and never asks mid-chat: she puts it in "Waiting for your yes" as a fact
 * about them ("everywhere"), saying which projects it came up in. Their yes
 * makes it follow them into every project; their no drops it.
 */

import type { AvaMemory } from './store.js';
import type { Fact } from './types.js';
import { LINKED_WEIGHT, OTHER_WEIGHT } from './store.js';

/** How closely a fact in another project must match to count as the same lesson. */
const SAME_LESSON = 0.6;
export const PROMOTION_TAG = 'promotion';

/**
 * After a project fact is saved: if another project already holds the same
 * lesson, and it isn't already known everywhere or waiting, suggest it.
 * Returns the suggestion, or null. Never throws.
 */
export async function suggestPromotion(mem: AvaMemory, fact: Fact): Promise<Fact | null> {
  try {
    if (fact.scope === 'everywhere' || fact.state !== 'fact') return null;
    const here = fact.scope.slice('project:'.length);
    const hits = await mem.search(fact.text, { project: here, reach: 'all', limit: 8 });
    // Search ranks other projects' facts down on purpose; judge "same lesson" on the score before that.
    const raw = (h: (typeof hits)[number]) => h.score / (h.from === 'other' ? OTHER_WEIGHT : h.from === 'linked' ? LINKED_WEIGHT : 1);
    const elsewhere = hits.find((h) => (h.from === 'other' || h.from === 'linked') && raw(h) >= SAME_LESSON && h.fact.id !== fact.id);
    if (!elsewhere) return null;
    // Already true everywhere?
    const everywhere = hits.find((h) => h.from === 'everywhere' && h.score >= SAME_LESSON);
    if (everywhere) return null;
    // Already suggested and waiting?
    const waiting = await mem.listFacts('pending');
    if (waiting.some((p) => p.tags?.includes(PROMOTION_TAG) && (p.tags.includes(`from:${fact.id}`) || p.tags.includes(`from:${elsewhere.fact.id}`)))) return null;
    const other = elsewhere.fact.scope.slice('project:'.length);
    const { fact: suggestion, created } = await mem.addFact({
      text: fact.text,
      kind: fact.kind === 'project' ? 'rule' : fact.kind,
      scope: 'everywhere',
      source: 'inferred',
      tags: [PROMOTION_TAG, `seen:${here}`, `seen:${other}`, `from:${fact.id}`, `from:${elsewhere.fact.id}`],
    });
    return created ? suggestion : null;
  } catch {
    return null;
  }
}
