// What was done at the gym, back from the phone into the training log
// (Health Part 6, mockup approved 14 Nov 2026). The reverse of
// share-workout.ts, and private the same way: the results travel INSIDE the
// link, after the `#`. The phone sends it to the person themselves (WhatsApp,
// email); avasupernova.com/log on their computer hands it to the extension
// (vscode://…) or the IDE, or they copy it into the app. Nothing passes
// through our server.
//
// Ava already reads the training log in the Health room
// (summariseTrainingLog), so a session saved from here is what she sees when
// they next ask her to repeat or build a plan.
//
// The website's WorkoutApp carries a copy of the encoder; the format is
// versioned ("1.") and pinned by the round-trip test. Change one, change both.

import { newGymItemId, type GymSession } from './session-types.js';

export const RESULTS_URL = 'https://avasupernova.com/log';

export interface ResultsExercise {
  /** Name and library slug, as sent to the phone. */
  n: string;
  s: string;
  /** What was planned: sets, reps ("10", "8-12", "30s"), load guidance. */
  ts: number;
  tr: string;
  tw: string;
  /** What was done: one [reps, weight] per completed set, as typed on the phone. */
  done: Array<[string, string]>;
}

export interface SharedResults {
  v: 1;
  title: string;
  date: string;
  plan: string;
  day: number;
  /** Minutes from first set to Finish, when known. */
  mins: number;
  exercises: ResultsExercise[];
}

type WireEx = [string, string, number, string, string, Array<[string, string]>];
type Wire = [1, string, string, string, number, number, WireEx[]];

const toWire = (r: SharedResults): Wire => [1, r.title, r.date, r.plan, r.day, r.mins,
  r.exercises.map((e) => [e.n, e.s, e.ts, e.tr, e.tw, e.done] as WireEx)];
const fromWire = (w: Wire): SharedResults => ({
  v: 1, title: String(w[1] ?? ''), date: String(w[2] ?? ''), plan: String(w[3] ?? ''), day: Number(w[4]) || 0, mins: Number(w[5]) || 0,
  exercises: (w[6] ?? []).map(([n, s, ts, tr, tw, done]) => ({
    n: String(n ?? ''), s: String(s ?? ''), ts: Math.max(0, Number(ts) || 0), tr: String(tr ?? ''), tw: String(tw ?? ''),
    done: (Array.isArray(done) ? done : []).slice(0, 30).map((d) => [String(d?.[0] ?? ''), String(d?.[1] ?? '')] as [string, string]),
  })),
});

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes.slice().buffer as ArrayBuffer]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function encodeResults(r: SharedResults): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(toWire(r)));
  return '1.' + b64url(await pipe(json, new CompressionStream('deflate-raw')));
}

/** Accepts the bare payload, "#payload", or a whole link that carries it after a `#`. */
export async function decodeResults(input: string): Promise<SharedResults | null> {
  try {
    const raw = input.trim();
    const h = raw.includes('#') ? raw.slice(raw.indexOf('#') + 1) : raw;
    if (!h.startsWith('1.')) return null;
    const json = await pipe(unb64url(h.slice(2)), new DecompressionStream('deflate-raw'));
    const w = JSON.parse(new TextDecoder().decode(json)) as Wire;
    return Array.isArray(w) && w[0] === 1 ? fromWire(w) : null;
  } catch {
    return null;
  }
}

export async function resultsUrl(r: SharedResults): Promise<string> {
  return `${RESULTS_URL}#${await encodeResults(r)}`;
}

const firstNumber = (s: string): number | null => { const m = s.match(/\d+(\.\d+)?/); return m ? Number(m[0]) : null; };
/** "16 kg" → 16; "35 lb" → 15.9; "bodyweight" → null. The log keeps kilograms. */
export function kgFrom(text: string): number | null {
  const n = firstNumber(text);
  if (n == null) return null;
  return /\b(lb|lbs|pound)/i.test(text) ? Math.round(n * 0.453592 * 10) / 10 : n;
}

export type ResultVerdict = 'on_plan' | 'above' | 'short' | 'not_done';

/** One exercise, planned against done — facts for the screen, never a score. */
export function compareExercise(e: ResultsExercise): { verdict: ResultVerdict; setsShort: number } {
  if (!e.done.length) return { verdict: 'not_done', setsShort: e.ts };
  const short = Math.max(0, e.ts - e.done.length);
  if (short > 0) return { verdict: 'short', setsShort: short };
  const target = firstNumber(e.tr);
  const above = target != null && /^\s*\d+\s*$/.test(e.tr) && e.done.some(([reps]) => (firstNumber(reps) ?? 0) > target);
  return { verdict: above ? 'above' : 'on_plan', setsShort: 0 };
}

/**
 * The results as a training-log session, tied back to the plan day it came
 * from. Reps and weight are parsed where they are numbers ("12", "16 kg");
 * anything else ("30s", "bodyweight") stays in the set's note so nothing the
 * person typed is lost. An exercise with no sets ticked is left UNRECORDED,
 * never "skipped": skipped is a fact someone states, and an unticked row may
 * simply be a set nobody tapped. Ava's rules depend on that difference.
 */
export function sessionFromResults(r: SharedResults, nowIso = new Date().toISOString()): GymSession {
  return {
    schema_version: 1,
    id: newGymItemId('ses'),
    date: r.date,
    source: r.plan ? 'plan' : 'freestyle',
    plan_id: r.plan || null,
    day_index: r.plan ? r.day : null,
    status: 'completed',
    title: r.title || null,
    exercises: r.exercises.map((e) => ({
      id: newGymItemId('ex'),
      ref: e.s ? { kind: 'exercise' as const, slug: e.s } : null,
      name: e.n,
      target_sets: e.ts || null,
      target_reps: e.tr || null,
      target_weight: e.tw || null,
      target_rest_seconds: null,
      tempo: null,
      notes: null,
      state: null,
      sets: e.done.map(([reps, weight]) => {
        const r2 = /^\s*\d+\s*$/.test(reps) ? Number(reps) : null;
        const kg = kgFrom(weight);
        const note = [r2 == null && reps ? reps : '', kg == null && weight ? weight : ''].filter(Boolean).join(' · ');
        return { id: newGymItemId('set'), weight: kg, reps: r2, rpe: null, notes: note || null, completed_at: nowIso };
      }),
    })),
    notes: r.mins ? `From the phone · ${r.mins} min` : 'From the phone',
    started_at: null,
    completed_at: nowIso,
    updated_at: nowIso,
  };
}
