/**
 * The health profile and plans, as text Ava reads. ONE copy for every host.
 *
 * These lived twice until 27 Nov 2026: in the extension (AvaViewProvider) and
 * in the IDE sidecar, and the two had drifted. The sidecar never sent training
 * (experience, days, training days, baseline lifts) or the kitchen (cooking
 * level, household, budget), so the IDE's Health room planned a week without
 * knowing how often someone can train. Now both call this, and so do the
 * profile index and profile_lookup.
 *
 * Pure: no node built-ins. Each host reads its own files and passes the parsed
 * JSON in (profile/sources.ts does it for Node hosts).
 */

import { summariseEquipment } from '../health/equipment-load.js';
import { summariseCookingTime } from '../health/profile-fields.js';
import type { HealthPlanRecord } from '../health/types.js';

// Loosely typed on purpose: these are the raw files from disk, of any age.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any;

/** Which part of a person a profile line is about. */
export type HealthLineTag = 'goal' | 'body' | 'training' | 'eating';
export interface HealthLine { tag: HealthLineTag; text: string }

const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

/**
 * Fill `food`, `constraints`, `training` and `kitchen` out to whole objects.
 * The profile-fill card writes one leaf at a time and builds the parent as
 * `{}`, so a section can be present and partial. Absent stays absent.
 */
export function normaliseHealthProfile(p: Raw): Raw {
  if (!p || typeof p !== 'object') return p;
  if (p.food) p.food = { likes: arr(p.food.likes), dislikes: arr(p.food.dislikes), cuisines: arr(p.food.cuisines) };
  if (p.constraints) {
    p.constraints = {
      ...p.constraints,
      allergens: arr(p.constraints.allergens),
      dietary: arr(p.constraints.dietary),
      injuries: arr(p.constraints.injuries),
      equipment_available: arr(p.constraints.equipment_available),
      minutes_per_day_target: p.constraints.minutes_per_day_target ?? null,
    };
  }
  if (p.training) {
    p.training = {
      experience: p.training.experience ?? null,
      days_per_week: p.training.days_per_week ?? null,
      training_days: arr(p.training.training_days),
      baseline_lifts: arr(p.training.baseline_lifts),
    };
  }
  if (p.kitchen) {
    p.kitchen = {
      level: p.kitchen.level ?? null,
      minutes_weekday: p.kitchen.minutes_weekday ?? null,
      minutes_weekend: p.kitchen.minutes_weekend ?? null,
      household_size: p.kitchen.household_size ?? null,
      cost_tier: p.kitchen.cost_tier ?? null,
    };
  }
  return p;
}

/**
 * Every line of the health profile, tagged. Body basics come from the general
 * profile (general.json), falling back to the legacy health.body.
 */
export function healthProfileLines(p: Raw, g: Raw, now: number = Date.now()): HealthLine[] {
  const lines: HealthLine[] = [];
  const add = (tag: HealthLineTag, text: string) => lines.push({ tag, text });
  const sex = g?.sex ?? p?.body?.sex;
  const dob = g?.date_of_birth ?? p?.body?.date_of_birth;
  const heightCm = g?.height_cm ?? p?.body?.height_cm;
  const weightKg = g?.weight_kg ?? p?.body?.weight_kg;
  if (p?.goals?.primary) add('goal', `Primary goal: ${String(p.goals.primary).replace(/_/g, ' ')}`);
  if (p?.goals?.weekly_focus) add('goal', `This week's focus: ${p.goals.weekly_focus}`);
  if (sex) add('body', `Sex: ${sex}`);
  if (dob) {
    const age = Math.floor((now - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000));
    if (age > 0 && age < 130) add('body', `Age: ${age}`);
  }
  if (heightCm) add('body', `Height: ${heightCm} cm`);
  if (weightKg) add('body', `Weight: ${weightKg} kg`);
  if (p?.constraints?.allergens?.length) add('eating', `Allergens: ${p.constraints.allergens.join(', ')}`);
  if (p?.constraints?.dietary?.length) add('eating', `Dietary preferences: ${p.constraints.dietary.join(', ')}`);
  if (p?.constraints?.injuries?.length) add('training', `Injuries / limitations: ${p.constraints.injuries.join(', ')}`);
  // Places, load ranges and gym days, not a flat list of slugs.
  for (const line of summariseEquipment(p?.constraints?.equipment_available, p?.constraints?.equipment_loads, p?.constraints?.gym_days)) add('training', line);
  if (p?.constraints?.minutes_per_day_target) add('training', `Time budget per day: ${p.constraints.minutes_per_day_target} minutes`);
  const tw = p?.schedule?.training_window;
  if (tw?.start && tw?.end) add('training', `Training window: ${tw.start}–${tw.end}`);
  const mt = p?.schedule?.meal_times;
  if (mt && (mt.breakfast || mt.lunch || mt.dinner)) {
    const parts = [mt.breakfast && `breakfast ${mt.breakfast}`, mt.lunch && `lunch ${mt.lunch}`, mt.dinner && `dinner ${mt.dinner}`].filter(Boolean);
    if (parts.length) add('eating', `Meal times: ${parts.join(', ')}`);
  }
  const cookLine = summariseCookingTime(p?.schedule?.cooking_time);
  if (cookLine) add('eating', cookLine);
  const tr = p?.training;
  if (tr?.experience) add('training', `Training experience: ${tr.experience}`);
  if (tr?.days_per_week) add('training', `Training days per week: ${tr.days_per_week}`);
  if (tr?.training_days?.length) add('training', `Trains on: ${tr.training_days.join(', ')}`);
  if (tr?.baseline_lifts?.length) {
    const lifts = arr(tr.baseline_lifts)
      .filter((l) => l?.name)
      .map((l) => [l.name, l.weight_kg != null ? `${l.weight_kg} kg` : null, l.reps != null ? `× ${l.reps}` : null].filter(Boolean).join(' '));
    if (lifts.length) add('training', `Baseline lifts: ${lifts.join('; ')}`);
  }
  const k = p?.kitchen;
  if (k?.level) add('eating', `Cooking level: ${k.level}`);
  if (k?.household_size) add('eating', `Cooks for: ${k.household_size} ${k.household_size === 1 ? 'person' : 'people'}`);
  if (k?.cost_tier) add('eating', `Budget: ${k.cost_tier}`);
  // minutes_weekday / _weekend are a shortcut that writes the cooking grid,
  // which cookLine already states. Not repeated.
  if (p?.food?.likes?.length) add('eating', `Food likes: ${p.food.likes.join(', ')}`);
  if (p?.food?.dislikes?.length) add('eating', `Food dislikes (keep out of plans): ${p.food.dislikes.join(', ')}`);
  if (p?.food?.cuisines?.length) add('eating', `Favourite cuisines: ${p.food.cuisines.join(', ')}`);
  return lines;
}

/** The Health room's profile summary: every line, undefined when empty. */
export function healthProfileSummary(p: Raw, g: Raw, now: number = Date.now()): string | undefined {
  const lines = healthProfileLines(p, g, now);
  return lines.length ? lines.map((l) => l.text).join('\n') : undefined;
}

/** The Health room's plan list, so Ava can edit what exists. Undefined when none. */
export function healthPlansSummary(plans: HealthPlanRecord[]): string | undefined {
  const lines: string[] = [];
  for (const p of plans) {
    if (!p || p.status === 'archived') continue;
    const days = Array.isArray(p.days) ? p.days : [];
    const dayBits = days.map((d) => {
      const bits: string[] = [`day ${d.day_index}`, d.kind || 'rest'];
      if (d.title) bits.push(d.title);
      const tc = Array.isArray(d.training) ? d.training.length : 0;
      const mc = Array.isArray(d.meals) ? d.meals.length : 0;
      if (tc) bits.push(`${tc} exercise${tc === 1 ? '' : 's'}`);
      if (mc) bits.push(`${mc} meal${mc === 1 ? '' : 's'}`);
      return bits.join(' · ');
    });
    const started = p.start_date ? `, started ${p.start_date}` : '';
    lines.push(`- "${p.title}" (${p.type}, ${p.status}${started}, ${days.length} days) — id: ${p.id}\n  ${dayBits.join('\n  ')}`);
  }
  return lines.length ? lines.join('\n') : undefined;
}
