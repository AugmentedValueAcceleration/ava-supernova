import { describe, it, expect } from 'vitest';
import {
  profileIsSet, daySeed, shuffleForDay, planDayDate, recipeWhy, exerciseWhy, todayInPlans, applyForYouAction, buildForYou,
} from '../src/health/for-you.js';
import type { HealthPlanRecord } from '../src/health/types.js';

const plan = (over: Partial<HealthPlanRecord> = {}): HealthPlanRecord => ({
  id: 'p1', type: 'combined', title: 'Week one', status: 'active', duration_days: 7, start_date: '2026-11-13',
  days: [
    { day_index: 1, kind: 'rest', title: null, training: [], meals: [], notes: null },
    {
      day_index: 2, kind: 'training', title: 'Lower body', notes: null,
      training: [{ id: 'e1', ref: { kind: 'exercise', slug: 'goblet-squat' }, name: 'Goblet Squat', sets: 3, reps: '10', weight: null, rest_seconds: 60, tempo: null, notes: null }],
      meals: [{ id: 'm1', slot: 'dinner', ref: { kind: 'recipe', slug: 'chicken-paprikash' }, name: 'Chicken Paprikash', servings: 1, calories: null, protein_g: 42, carbs_g: null, fat_g: null, cook_time_minutes: 40, notes: null }],
    },
  ],
  ...over,
});

describe('small helpers', () => {
  it('profileIsSet: anything they told Ava counts; an empty scaffold does not', () => {
    expect(profileIsSet(null)).toBe(false);
    expect(profileIsSet({ constraints: { allergens: [], dietary: [] }, food: { likes: [] } })).toBe(false);
    expect(profileIsSet({ food: { cuisines: ['thai'] } })).toBe(true);
    expect(profileIsSet({ goals: { primary: 'fat_loss' } })).toBe(true);
  });

  it('picks change by day and stay put within it', () => {
    expect(daySeed('2026-11-14')).toBe(daySeed('2026-11-14'));
    expect(daySeed('2026-11-14')).not.toBe(daySeed('2026-11-15'));
    const xs = Array.from({ length: 20 }, (_, i) => i);
    expect(shuffleForDay(xs, '2026-11-14')).toEqual(shuffleForDay(xs, '2026-11-14'));
    expect(shuffleForDay(xs, '2026-11-14')).not.toEqual(shuffleForDay(xs, '2026-11-15'));
    expect([...shuffleForDay(xs, '2026-11-14')].sort((a, b) => a - b)).toEqual(xs);
  });

  it('plan day 1 is the start date', () => {
    expect(planDayDate('2026-11-13', 1)).toBe('2026-11-13');
    expect(planDayDate('2026-11-30', 2)).toBe('2026-12-01');
  });

  it('recipeWhy: their diet first, then time, protein, a liked cuisine, the allergy it avoids', () => {
    expect(recipeWhy({ minutes: 50, protein: 18, diets: ['Vegetarian', 'Vegan'], cuisine: 'Lebanese' }, { constraints: { dietary: ['vegetarian'] }, food: { cuisines: ['lebanese'] } }))
      .toBe('Vegetarian · 50 min · 18 g protein');
    expect(recipeWhy({ minutes: 40, protein: 42, diets: [], cuisine: 'Hungarian' }, { constraints: { allergens: ['tree_nuts'] } }))
      .toBe('High protein · 40 min · no tree nuts');
    expect(recipeWhy({ minutes: 15, protein: 7, diets: [], cuisine: null }, null)).toBe('15 min · 7 g protein');
  });

  it('exerciseWhy: kit, then level', () => {
    expect(exerciseWhy({ equipment: [], difficulty: 1 }, null)).toBe('No kit needed · beginner friendly');
    expect(exerciseWhy({ equipment: [{ slug: 'bodyweight', name: 'Bodyweight' }], difficulty: 1 }, { constraints: { equipment_available: ['dumbbells'] } })).toBe('No kit needed · beginner friendly');
    expect(exerciseWhy({ equipment: [{ slug: 'dumbbells', name: 'Dumbbells' }], difficulty: 3 }, { constraints: { equipment_available: ['dumbbells'] }, training: { experience: 'intermediate' } }))
      .toBe('Uses kit you have · your level');
  });
});

describe('today in their plans', () => {
  it('finds today\'s session and dinner', () => {
    const t = todayInPlans([plan()], '2026-11-14');
    expect(t.session).toMatchObject({ planId: 'p1', dayIndex: 2, title: 'Lower body', count: 1, first: 'Goblet Squat' });
    expect(t.dinner?.name).toBe('Chicken Paprikash');
  });

  it('nothing when no plan day falls today, or the plan is archived', () => {
    expect(todayInPlans([plan()], '2026-12-25').session).toBeNull();
    expect(todayInPlans([plan({ status: 'archived' })], '2026-11-14').mealPlan).toBeNull();
  });

  it('a meal plan and a training plan side by side: today comes from both', () => {
    const meals = plan({ id: 'meals', days: [{ ...plan().days[1], training: [] }] , start_date: '2026-11-12' });
    const training = plan({ id: 'train', days: [{ ...plan().days[1], meals: [], title: 'Full-body circuit' }], start_date: '2026-11-13' });
    // meals' day 1 is the 12th: give it a day 3 that falls on the 14th.
    meals.days = [{ ...meals.days[0], day_index: 3 }];
    training.days = [{ ...training.days[0], day_index: 2 }];
    const t = todayInPlans([meals, training], '2026-11-14');
    expect(t.session).toMatchObject({ planId: 'train', title: 'Full-body circuit' });
    expect(t.dinner?.name).toBe('Chicken Paprikash');
    expect(t.mealPlan?.id).toBe('meals');
  });

  it('add and swap change only that day of that plan', () => {
    const p = plan();
    const added = applyForYouAction(p, { type: 'add_exercise', planId: 'p1', dayIndex: 2, slug: 'wall-sit', name: 'Wall Sit' });
    expect(added.days[1].training.map((e) => e.name)).toEqual(['Goblet Squat', 'Wall Sit']);
    expect(added.days[0]).toBe(p.days[0]);
    const lunch = applyForYouAction(p, { type: 'add_meal', planId: 'p1', dayIndex: 2, slot: 'lunch', slug: 'fattoush', name: 'Fattoush' });
    expect(lunch.days[1].meals.map((m) => `${m.slot}:${m.name}`)).toEqual(['dinner:Chicken Paprikash', 'lunch:Fattoush']);
    const swapped = applyForYouAction(p, { type: 'swap_meal', planId: 'p1', dayIndex: 2, mealId: 'm1', slug: 'goulash', name: 'Goulash' });
    expect(swapped.days[1].meals[0]).toMatchObject({ id: 'm1', slot: 'dinner', name: 'Goulash', ref: { slug: 'goulash' }, protein_g: null });
    const replaced = applyForYouAction(p, { type: 'replace_exercise', planId: 'p1', dayIndex: 2, exerciseId: 'e1', slug: 'wall-sit', name: 'Wall Sit' });
    expect(replaced.days[1].training).toHaveLength(1);
    expect(replaced.days[1].training[0]).toMatchObject({ id: 'e1', name: 'Wall Sit', ref: { slug: 'wall-sit' }, sets: 3, reps: '10', rest_seconds: 60, weight: null });
    expect(applyForYouAction(p, { type: 'swap_meal', planId: 'other', dayIndex: 2, mealId: 'm1', slug: 'x', name: 'X' })).toBe(p);
  });
});

// A fake library: a few dinners and exercises, details and safety facts.
function fakeLibrary() {
  const recipes = [
    { slug: 'pesto-pasta', name: 'Pesto Pasta', cuisine_name: 'Italian', course: 'main', hero_image_url: 'img1' },
    { slug: 'goulash', name: 'Goulash', cuisine_name: 'Hungarian', course: 'main', hero_image_url: 'img2' },
    { slug: 'mujadara', name: 'Mujadara', cuisine_name: 'Lebanese', course: 'main', hero_image_url: 'img3' },
    { slug: 'fattoush', name: 'Fattoush', cuisine_name: 'Lebanese', course: 'main', hero_image_url: 'img4' },
  ];
  const exercises = [
    { slug: 'goblet-squat', name: 'Goblet Squat', workout_type: 'strength', difficulty: 2 },
    { slug: 'wall-sit', name: 'Wall Sit', workout_type: 'strength', difficulty: 1 },
    { slug: 'barbell-squat', name: 'Barbell Squat', workout_type: 'strength', difficulty: 3 },
  ];
  const facts = {
    recipes: {
      'pesto-pasta': { slug: 'pesto-pasta', allergens: ['Tree nuts'], flags: [], diets: ['Vegetarian'] },
      goulash: { slug: 'goulash', allergens: [], flags: ['nut_free'], diets: [] },
      mujadara: { slug: 'mujadara', allergens: [], flags: ['nut_free'], diets: ['Vegetarian'] },
      fattoush: { slug: 'fattoush', allergens: [], flags: ['nut_free'], diets: ['Vegan'] },
    },
    exercises: {
      'goblet-squat': { slug: 'goblet-squat', contraindications: [], equipment: [] },
      'wall-sit': { slug: 'wall-sit', contraindications: [], equipment: [] },
      'barbell-squat': { slug: 'barbell-squat', contraindications: [], equipment: ['barbell'] },
    },
  };
  const sent: string[] = [];
  const f = (async (url: string, init?: { body?: string }) => {
    const u = new URL(url);
    sent.push(`${u.pathname}${init?.body ? ` ${init.body}` : ''}`);
    const json = (b: unknown) => ({ ok: true, status: 200, json: async () => b });
    if (u.pathname === '/api/health/safety-facts') return json(facts);
    if (u.pathname === '/api/health/recipes') return json({ recipes, total: recipes.length });
    if (u.pathname === '/api/health/exercises') return json({ exercises, total: exercises.length });
    const r = u.pathname.match(/^\/api\/health\/recipes\/(.+)$/);
    if (r) return json({ recipe: { slug: r[1], cuisine_name: null, versions: [{ level: 'beginner', total_time_minutes: 30, nutrition: { protein_g: 35 }, diets: facts.recipes[r[1] as keyof typeof facts.recipes]?.diets ?? [] }] } });
    const e = u.pathname.match(/^\/api\/health\/exercises\/(.+)$/);
    if (e) return json({ exercise: { slug: e[1], workout_type: 'strength', difficulty: 1, equipment: [] } });
    return { ok: false, status: 404, json: async () => ({}) };
  }) as unknown as typeof fetch;
  return { f, sent };
}

describe('buildForYou', () => {
  it('no profile: two dinners and an exercise, no rules involved', async () => {
    const { f, sent } = fakeLibrary();
    const r = await buildForYou({ profile: null, activePlans: [], today: '2026-11-14', fetchImpl: f });
    expect(r.state).toBe('no_profile');
    expect(r.picks.map((p) => p.kind)).toEqual(['recipe', 'recipe', 'exercise']);
    expect(sent.some((s) => s.startsWith('/api/health/safety-facts'))).toBe(false);
  });

  it('profile, no plan: nothing that breaks a rule, and the profile itself never leaves', async () => {
    const { f, sent } = fakeLibrary();
    const profile = { constraints: { allergens: ['tree_nuts'], dietary: [], injuries: [], equipment_available: ['dumbbells'] } };
    const r = await buildForYou({ profile, activePlans: [], today: '2026-11-14', fetchImpl: f });
    expect(r.state).toBe('profile');
    expect(r.picks.map((p) => p.slug)).not.toContain('pesto-pasta');
    expect(r.picks.map((p) => p.slug)).not.toContain('barbell-squat');
    expect(r.picks.find((p) => p.kind === 'recipe')?.why).toContain('no tree nuts');
    expect(sent.join('\n')).not.toContain('tree_nuts');
    expect(sent.join('\n')).not.toContain('dumbbells');
  });

  it('rules could not be checked: nothing offered as fitting', async () => {
    const { f } = fakeLibrary();
    const failing = (async (url: string, init?: unknown) => (String(url).includes('safety-facts') ? { ok: false, status: 503, json: async () => ({}) } : (f as unknown as (u: string, i?: unknown) => Promise<unknown>)(url, init))) as unknown as typeof fetch;
    const r = await buildForYou({ profile: { constraints: { allergens: ['peanuts'] } }, activePlans: [], today: '2026-11-14', fetchImpl: failing });
    expect(r.checked).toBe(false);
    expect(r.picks).toEqual([]);
  });

  it('plan running: today first, then things that go with it', async () => {
    const { f } = fakeLibrary();
    const r = await buildForYou({ profile: { constraints: { allergens: ['tree_nuts'] } }, activePlans: [plan()], today: '2026-11-14', fetchImpl: f });
    expect(r.state).toBe('running');
    expect(r.session?.first).toBe('Goblet Squat');
    expect(r.dinner?.name).toBe('Chicken Paprikash');
    const types = r.extras.map((x) => x.action.type);
    expect(types).toContain('add_exercise');
    expect(types).toContain('add_meal');
    expect(types).toContain('swap_meal');
    expect(r.extras.find((x) => x.action.type === 'add_exercise')?.slug).not.toBe('goblet-squat');
    expect(r.extras.map((x) => x.slug)).not.toContain('pesto-pasta');
    expect(r.todayItems?.training.map((e) => e.name)).toEqual(['Goblet Squat']);
    expect(r.todayItems?.meals.map((m) => `${m.slot}:${m.name}`)).toEqual(['dinner:Chicken Paprikash']);
  });

  it('lunch already planned: a snack instead, and always three suggestions', async () => {
    const { f } = fakeLibrary();
    const p = plan();
    p.days[1].meals.push({ id: 'm2', slot: 'lunch', ref: { kind: 'recipe', slug: 'fattoush' }, name: 'Fattoush', servings: 1, calories: null, protein_g: null, carbs_g: null, fat_g: null, cook_time_minutes: null, notes: null });
    const r = await buildForYou({ profile: { constraints: { allergens: ['tree_nuts'] } }, activePlans: [p], today: '2026-11-14', fetchImpl: f });
    expect(r.extras).toHaveLength(3);
    const snack = r.extras.find((x) => x.action.type === 'add_meal');
    expect(snack?.action).toMatchObject({ slot: 'snack' });
    expect(r.extras.map((x) => x.slug)).not.toContain('fattoush');
  });
});
