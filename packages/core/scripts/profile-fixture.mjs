/**
 * A FICTIONAL person ("Sam") written to disk in Ava's real file formats: a
 * home folder (general.json, health/, learning.json) and a memory folder.
 * Used by tests/profile-index.test.ts and scripts/profile-test.mjs, so the
 * unit tests and the paid model test read exactly the same person.
 *
 * Never real data. Dates are relative to `today`, so "tomorrow is legs" stays
 * true whenever it runs.
 *
 *   await writeProfileFixture({ home, memoryRoot, today: '2026-11-27', AvaMemory })
 */

import fs from 'node:fs';
import path from 'node:path';

const write = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
};

function addDays(day, n) {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const ex = (id, name, sets, reps, weight, notes = null) => ({ id, ref: null, name, sets, reps, weight, rest_seconds: 120, tempo: null, notes });
const meal = (id, slot, name, calories, protein_g, cook_time_minutes) => ({ id, slot, ref: null, name, servings: 1, calories, protein_g, carbs_g: null, fat_g: null, cook_time_minutes, notes: null });

export async function writeProfileFixture({ home, memoryRoot, today, AvaMemory }) {
  const start = addDays(today, -6); // day 7 of the plan is today, day 8 tomorrow

  write(path.join(home, 'general.json'), {
    schema_version: 1, updated_at: null, display_name: 'Sam', sex: null, date_of_birth: '1992-03-14',
    height_cm: 178, weight_kg: 76, body_fat_pct: null, units: 'metric',
  });

  write(path.join(home, 'health', 'profile.json'), {
    schema_version: 1,
    goals: { primary: 'build_strength', weekly_focus: null },
    constraints: { allergens: [], dietary: ['vegetarian'], injuries: ['left knee niggle: no jumping, cut squat depth if it aches'], equipment_available: [], minutes_per_day_target: 60 },
    schedule: { training_window: { start: '18:00', end: '19:30' }, meal_times: { breakfast: '07:30', lunch: '12:30', dinner: '19:45' } },
    training: { experience: 'intermediate', days_per_week: 4, training_days: ['mon', 'tue', 'thu', 'sat'], baseline_lifts: [{ name: 'Back squat', weight_kg: 80, reps: 5 }] },
    kitchen: { level: 'confident', minutes_weekday: 30, minutes_weekend: 60, household_size: 1, cost_tier: 'moderate' },
    food: { likes: ['paneer', 'lentils', 'spicy food'], dislikes: ['mushrooms'], cuisines: ['indian', 'middle eastern'] },
  });

  const days = [];
  for (let i = 1; i <= 14; i++) {
    const isToday = i === 7, isTomorrow = i === 8;
    days.push({
      day_index: i,
      kind: isTomorrow ? 'training' : 'rest',
      title: isTomorrow ? 'Legs' : (isToday ? 'Rest' : null),
      training: isTomorrow ? [
        ex('e1', 'Back squat', 5, '5', '80 kg'),
        ex('e2', 'Romanian deadlift', 3, '8', '60 kg'),
        ex('e3', 'Walking lunges', 3, '12', 'bodyweight'),
      ] : [],
      meals: isToday ? [
        meal('m1', 'breakfast', 'Greek yoghurt with seeds and berries', 420, 32, 5),
        meal('m2', 'lunch', 'Lentil and halloumi salad', 610, 38, 20),
        meal('m3', 'dinner', 'Chickpea and spinach curry with paneer', 720, 42, 30),
        meal('m4', 'snack', 'Edamame', 190, 17, 5),
      ] : [],
      notes: null,
    });
  }
  write(path.join(home, 'health', 'plans', 'plan-sam.json'), {
    schema_version: 1, id: 'plan-sam', type: 'combined', title: 'Strength + high-protein veggie', goal: 'build_strength',
    status: 'active', duration_days: 14, start_date: start, source: 'ava', days, updated_at: null,
  });

  write(path.join(home, 'health', 'sessions', 'sess-1.json'), {
    schema_version: 1, id: 'sess-1', date: addDays(today, -1), source: 'plan', plan_id: 'plan-sam', day_index: 6,
    status: 'completed', title: 'Upper', notes: null, started_at: null, completed_at: null, updated_at: `${addDays(today, -1)}T19:00:00Z`,
    exercises: [{ id: 'g1', ref: null, name: 'Bench press', target_sets: 4, target_reps: '6', target_weight: '60 kg', target_rest_seconds: 120, tempo: null, notes: null, state: 'done',
      sets: [1, 2, 3, 4].map((n) => ({ id: `s${n}`, weight: 60, reps: 6, rpe: 8, notes: null, completed_at: `${addDays(today, -1)}T18:${10 + n}:00Z` })) }],
  });

  const lesson = (id, title, status) => ({ id, title, type: 'lesson', status });
  write(path.join(home, 'learning.json'), {
    curriculums: [
      { id: 'c-rust', title: 'Rust Fundamentals', subject: 'Rust', level: 'intermediate', status: 'active', progress_percent: 52, tags: [], created_at: start, updated_at: today, completed_at: null, adaptive_level: null, milestones: [],
        modules: [
          { id: 'm3', title: 'Structs & Enums', description: null, status: 'completed', progress_percent: 100, estimated_minutes: null, learning_objectives: [], lessons: [lesson('l1', 'Enums', 'completed')] },
          { id: 'm4', title: 'Ownership & Borrowing', description: null, status: 'in_progress', progress_percent: 40, estimated_minutes: null, learning_objectives: [], lessons: [lesson('l2', 'Borrowing rules', 'completed'), lesson('l3', 'Lifetimes in function signatures', 'not_started')] },
        ] },
      { id: 'c-ts', title: 'TypeScript Essentials', subject: 'TypeScript', level: 'beginner', status: 'completed', progress_percent: 100, tags: [], created_at: start, updated_at: start, completed_at: start, adaptive_level: null, milestones: [], modules: [] },
      { id: 'c-git', title: 'Git for Teams', subject: 'Git', level: 'beginner', status: 'completed', progress_percent: 100, tags: [], created_at: start, updated_at: start, completed_at: start, adaptive_level: null, milestones: [], modules: [] },
    ],
    streaks: { current: 3, longest: 9, lastActiveDate: today },
  });

  if (memoryRoot && AvaMemory) {
    const mem = new AvaMemory({ root: memoryRoot });
    await mem.writeCore('- Name: Sam. Prefers short, direct answers.\n- Works evenings, often late.');
    const tide = await mem.projectFor(path.join(home, 'code', 'tidepool'), 'Tidepool');
    const lantern = await mem.projectFor(path.join(home, 'code', 'lantern'), 'Lantern');
    await mem.addFact({ text: 'Tidepool is a Rust command-line tool that syncs notes between devices.', kind: 'project', scope: `project:${tide.id}`, source: 'said' });
    await mem.addFact({ text: 'Lantern is a personal website built with Astro.', kind: 'project', scope: `project:${lantern.id}`, source: 'said' });
    await mem.addToDay(addDays(today, -4), { project: lantern.id, name: 'Lantern' }, ['Landing page half done: hero and features sections built, pricing section still to do.']);
    await mem.addToDay(today, { project: tide.id, name: 'Tidepool' }, ['Fixing a borrow error in the sync queue.', 'Decided to clone the queue entry rather than hold a reference across await.']);
  }
}
