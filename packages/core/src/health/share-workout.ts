// A training session sent to the phone (Health Part 5b, mockup approved
// 14 Nov 2026: "take it to the gym"). Same idea as the shopping list
// (share-list.ts): the session travels INSIDE the link, after the `#`, which
// browsers never send to a server. avasupernova.com/workout draws it, keeps it
// on the phone and works with no signal. Nothing is stored by us.
//
// The website's WorkoutApp carries a copy of the decoder; the format is
// versioned ("1.") and pinned by the round-trip test. Change one, change both.

export const WORKOUT_URL = 'https://avasupernova.com/workout';

export interface SharedWorkoutExercise {
  /** Name, in the sender's language. */
  n: string;
  /** Library slug, for "How to do it". Empty for a custom exercise. */
  s: string;
  /** Sets planned (at least 1). */
  sets: number;
  /** Target reps: "10", "8-12", "30s", "AMRAP". */
  reps: string;
  /** Load guidance: "16 kg", "bodyweight", "RPE 7". */
  w: string;
  /** Rest between sets, seconds (0 = none given). */
  rest: number;
  /** A note to show with it — e.g. "take care with your left knee: …". */
  note: string;
}

export interface SharedWorkout {
  v: 1;
  /** "Lower body", or the plan day's title. */
  title: string;
  /** The day it is for (ISO date). */
  date: string;
  /** Plan id and day, so results can find their way back to the plan (Part 6). */
  plan: string;
  day: number;
  exercises: SharedWorkoutExercise[];
}

/* Compact wire form: arrays, not objects — every byte is QR modules.
   [1, title, date, plan, day, [[n, s, sets, reps, w, rest, note], ...]] */
type WireEx = [string, string, number, string, string, number, string];
type Wire = [1, string, string, string, number, WireEx[]];

const toWire = (w: SharedWorkout): Wire => [1, w.title, w.date, w.plan, w.day,
  w.exercises.map((e) => [e.n, e.s, e.sets, e.reps, e.w, e.rest, e.note] as WireEx)];
const fromWire = (w: Wire): SharedWorkout => ({
  v: 1, title: String(w[1] ?? ''), date: String(w[2] ?? ''), plan: String(w[3] ?? ''), day: Number(w[4]) || 0,
  exercises: (w[5] ?? []).map(([n, s, sets, reps, wt, rest, note]) => ({
    n: String(n ?? ''), s: String(s ?? ''), sets: Math.max(1, Math.min(20, Number(sets) || 1)),
    reps: String(reps ?? ''), w: String(wt ?? ''), rest: Math.max(0, Math.min(900, Number(rest) || 0)), note: String(note ?? ''),
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

/** The part after `#`: "1." + deflated, base64url JSON. */
export async function encodeSharedWorkout(w: SharedWorkout): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(toWire(w)));
  return '1.' + b64url(await pipe(json, new CompressionStream('deflate-raw')));
}

export async function decodeSharedWorkout(hash: string): Promise<SharedWorkout | null> {
  try {
    const h = hash.replace(/^#/, '');
    if (!h.startsWith('1.')) return null;
    const json = await pipe(unb64url(h.slice(2)), new DecompressionStream('deflate-raw'));
    const w = JSON.parse(new TextDecoder().decode(json)) as Wire;
    return Array.isArray(w) && w[0] === 1 ? fromWire(w) : null;
  } catch {
    return null;
  }
}

export async function sharedWorkoutUrl(w: SharedWorkout): Promise<string> {
  return `${WORKOUT_URL}#${await encodeSharedWorkout(w)}`;
}

/** A plan day's training as a phone session. Rest falls back to 60 s; the
 *  exercise's own note (a caution from the safety check) travels with it. */
export function workoutFromDay(opts: {
  planId: string;
  day: { day_index: number; title: string | null; training: Array<{ name: string; ref?: { slug: string } | null; sets: number | null; reps: string | null; weight: string | null; rest_seconds: number | null; notes: string | null }> };
  date: string;
  fallbackTitle: string;
}): SharedWorkout {
  return {
    v: 1,
    title: opts.day.title || opts.fallbackTitle,
    date: opts.date,
    plan: opts.planId,
    day: opts.day.day_index,
    exercises: opts.day.training.map((e) => ({
      n: e.name, s: e.ref?.slug ?? '', sets: e.sets && e.sets > 0 ? e.sets : 3, reps: e.reps ?? '',
      w: e.weight ?? '', rest: e.rest_seconds ?? 60, note: e.notes ?? '',
    })),
  };
}
