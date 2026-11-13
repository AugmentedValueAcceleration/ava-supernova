/**
 * "Ask Ava" from the new-plan wizard (11 Nov 2026).
 *
 * The wizard lives on the health page, and Ask Ava hands the chosen plan type
 * to the HEALTH ROOM — where Ava already has their profile and the catalogue.
 * Both apps used to send the main chat's palette directive here, which tells
 * her to call open_health_room: a room she was already in. So she was told
 * to do something she could not, and improvised. This is the in-room version,
 * shared by the extension host and the IDE so the two say the same words.
 */

export type WizardPlanType = 'meal' | 'fitness' | 'combined';

export function healthRoomPlanDirective(type: WizardPlanType): { label: string; directive: string } {
  const label = type === 'meal' ? 'Meal plan' : type === 'fitness' ? 'Fitness plan' : 'Combined plan';
  const needs = type === 'meal'
    ? 'allergies, diet, dislikes, cooking time and level, household'
    : type === 'fitness'
      ? 'goal, experience, which days they train, kit, injuries'
      : 'goal, experience, training days, kit, injuries, allergies, diet, dislikes, cooking time';
  return {
    label,
    directive:
      `[Plan wizard] The user chose "Ask Ava" in the new-plan wizard for a ${type} plan. ` +
      `Their intent is confirmed — do NOT ask whether they want a plan, and do NOT ask the type ` +
      `(${type} is locked in). You are already in the health room, with their profile and the catalogue.\n` +
      `1. Check their profile for what a ${type} plan needs (${needs}). Ask for anything missing with ` +
      `health_profile_ask, one at a time — never plan around a gap that matters for safety.\n` +
      `2. Then build it with them: plans are 1, 3 or 7 days; ask how long and when it starts, a title, and ` +
      `whether to start it now or keep it as a draft, then save it with health_plan_create.\n` +
      `Open with one short, warm line — no long narration.`,
  };
}
