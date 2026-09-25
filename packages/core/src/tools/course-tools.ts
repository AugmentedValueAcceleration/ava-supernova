// The Classroom's tools — Ava as tutor and course author, at the desk where
// the pre-made courses are written. The same shape as the Gym's kit: search
// before writing, read before repairing, a gate on every write, repair in
// place, and a proposal path for anything that is the operator's to decide.
//
// The person these courses are written for is the one Ava then teaches in
// the IDE or the extension. That is why the gate is strict about steps: a
// lesson that is a page and a quiz is not an hour of teaching, it is a page.

import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { checkCourse, COURSE_REFUSAL_KINDS, COURSE_INCOMPLETE_KINDS } from '../learning/course-check.js';
import {
  COURSE_LEVELS, COURSE_AUDIENCES, LESSON_TYPES, LESSON_DIFFICULTIES,
  type CourseStore, type CourseInput, type CourseRevision, type CourseStepInput, type CourseLessonInput, type CourseModuleInput,
  type CourseLevel, type CourseAudience, type CourseBuildPlan,
} from '../learning/course-store.js';

const NOT_HERE = 'The course library is not available in this context.';

function storeOf(context: ToolExecutionContext): CourseStore | undefined {
  return context.sharedState?.courseStore as CourseStore | undefined;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * A name, with HTML entities turned back into the characters they stand for.
 *
 * "HTML & CSS: Your First Web Page" was written to the library as
 * "HTML &amp; CSS: Your First Web Page" on 25 Sep 2026. The seed and the
 * brief both said `&`; the escaping happened on the way into the tool call,
 * and it then showed in every heading and every list.
 *
 * Deliberately applied to NAMES ONLY — title, subject, category. An entity
 * inside a lesson is often correct: a web course teaching `&amp;` has to be
 * able to say `&amp;`, and decoding it there would quietly break the very
 * courses most likely to contain it.
 */
const name = (v: unknown): string => str(v)
  .replace(/&(amp|lt|gt|quot|apos|nbsp|#0?39);/gi, (_m, e: string) => ({
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '39': "'", '039': "'",
  }[e.toLowerCase().replace('#', '')] ?? _m))
  .trim();
/**
 * An array, or the JSON text of one.
 *
 * Models hand back `modules: "[{...}]"` often enough that treating it as "not
 * an array" is a silent data loss: the course arrives with every field but
 * its content, the gate refuses it as thin, and the refusal blames the
 * writing rather than the one pair of quotes that caused it.
 */
const list = (v: unknown): unknown[] => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(v) as unknown;
      if (Array.isArray(parsed)) return parsed;
    } catch { /* see listFault — the caller has to be TOLD, not handed [] */ }
  }
  return [];
};

/**
 * Why a list came back empty, in words that point at the real cause.
 *
 * On 25 Sep 2026 a whole run died against "write_course arrived with no
 * modules". The modules HAD been sent — as JSON text that was cut off
 * mid-flight, so the parse threw and the value fell through to empty. Ava
 * spent nineteen attempts theorising about size, then formatting, then stray
 * braces, because the message never once said "this was truncated". She was
 * debugging a fiction.
 */
const listFault = (v: unknown, field: string): string | null => {
  if (Array.isArray(v) || v === undefined || v === null) return null;
  if (typeof v !== 'string') return `\`${field}\` arrived as ${typeof v}, which cannot be a list of items.`;
  const t = v.trim();
  if (!t.startsWith('[')) return `\`${field}\` arrived as text that is not a list — it starts with ${JSON.stringify(t.slice(0, 40))}.`;
  try {
    JSON.parse(t);
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const at = Number(/position (\d+)/.exec(msg)?.[1] ?? NaN);
    const len = t.length;

    // TWO different faults were wearing one message, and telling them apart
    // is the whole diagnosis. A string that ARRIVES COMPLETE and breaks in
    // the middle was not cut off — 34,437 characters all present, broken at
    // 5,565 (26 Sep 2026) — and telling its author "your punctuation is fine"
    // sent them to shrink a payload that was never too big. A string that
    // stops at its own end is the one that was truncated.
    const brokeAtTheEnd = !Number.isNaN(at) && at >= len - 32;

    if (Number.isNaN(at) || brokeAtTheEnd) {
      return `\`${field}\` arrived as JSON TEXT, ${len.toLocaleString()} characters long, and it stops part-way through — the call was CUT OFF in transit. `
        + 'Nothing was wrong with your punctuation and re-checking it will not help. '
        + 'Send less in one call: land a small course with a `plan`, then grow it with revise_course add_module / add_lesson / add_step, one piece per call.';
    }

    // Broken in the middle, with everything after it still present. Show the
    // actual characters, because that is the only thing that identifies it.
    const from = Math.max(0, at - 60);
    const around = t.slice(from, at + 60).replace(/\n/g, '\\n');
    // Logged too, so the fault can be diagnosed from the server rather than
    // reconstructed from a report.
    try {
      console.error(`[classroom] ${field} malformed at ${at}/${len}: ${JSON.stringify(around)}`);
    } catch { /* no console in some hosts */ }
    return `\`${field}\` arrived COMPLETE — all ${len.toLocaleString()} characters — but the JSON is malformed at character ${at}, and the rest of it after that point is still there. `
      + `So this was NOT cut off, and sending less will not fix it. Around the break: …${around}… `
      + 'Something is wrong with the text itself at that point — most often a quote or a backslash inside a `teach` or `prompt` string that was not escaped. '
      + 'Better still: send `modules` as a real ARRAY rather than as a string containing JSON. The escaping is what breaks; structure does not need escaping.';
  }
};
const strList = (v: unknown): string[] => list(v).map(String).map((s) => s.trim()).filter(Boolean);
/** Was a list GIVEN at all — as against parsing to nothing. Revisions turn on it: an empty list means "remove these", absent means "leave them alone". */
const gaveList = (v: unknown): boolean => Array.isArray(v) || (typeof v === 'string' && v.trim().startsWith('['));
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined => {
  if (typeof v !== 'string') return undefined;
  const want = v.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  // Case and spacing are not the point. "Professional Development",
  // "professional development" and "Professional_development" all mean the
  // one value in the list, and refusing them taught nothing.
  return (allowed as readonly string[]).find((a) => a.toLowerCase().replace(/[\s_-]+/g, ' ') === want) as T | undefined;
};

/** What arrived, quoted, for an error that has to be actionable. */
const got = (v: unknown): string =>
  v === undefined ? 'nothing'
    : typeof v === 'string' ? `"${v}"`
      : JSON.stringify(v).slice(0, 80);

/** JSON schema for one authored step, shared by write and revise. */
const STEP_SCHEMA = {
  type: 'object',
  description: 'One teach → do → check step.',
  properties: {
    teach: { type: 'string', description: 'The bite Ava presents before the learner acts. Short, concrete, markdown.' },
    interaction: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['choice', 'free_text', 'code', 'predict'] },
        prompt: { type: 'string', description: 'What the learner DOES — in the tool, on paper, in the editor. Never "ask an AI to".' },
        options: { type: 'array', items: { type: 'string' }, description: 'For choice: the options shown.' },
        answer: { type: 'string', description: 'For choice / predict: the correct answer. REQUIRED for those kinds.' },
        evaluation: { type: 'string', description: 'For free_text / code: the rubric Ava grades a NOVEL answer against. REQUIRED for those kinds.' },
        starter: { type: 'string', description: 'For code: starter code.' },
      },
      required: ['kind', 'prompt'],
    },
    feedback: {
      type: 'object',
      properties: { correct: { type: 'string' }, incorrect: { type: 'string' } },
      description: 'For choice / predict: what to say either way.',
    },
  },
  required: ['teach', 'interaction'],
} as const;

const LESSON_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    type: { type: 'string', enum: LESSON_TYPES },
    difficulty: { type: 'string', enum: LESSON_DIFFICULTIES },
    estimated_minutes: { type: 'integer' },
    learning_objectives: { type: 'array', items: { type: 'string' } },
    steps: { type: 'array', items: STEP_SCHEMA, description: 'Three or more — a FLOOR, not a target. As many as the lesson needs.' },
  },
  required: ['title', 'steps'],
} as const;

const MODULE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    lessons: { type: 'array', items: LESSON_SCHEMA, description: 'Two or more — a floor. A big module has more.' },
  },
  required: ['title', 'lessons'],
} as const;

function parseStep(v: unknown): CourseStepInput | null {
  const o = (v ?? {}) as Record<string, unknown>;
  const it = (o.interaction ?? {}) as Record<string, unknown>;
  const kind = oneOf(it.kind, ['choice', 'free_text', 'code', 'predict'] as const);
  const teach = str(o.teach);
  if (!kind || !teach) return null;
  const fb = o.feedback as Record<string, unknown> | undefined;
  return {
    teach,
    interaction: {
      kind,
      prompt: str(it.prompt),
      ...(gaveList(it.options) ? { options: strList(it.options) } : {}),
      ...(str(it.answer) ? { answer: str(it.answer) } : {}),
      ...(str(it.evaluation) ? { evaluation: str(it.evaluation) } : {}),
      ...(str(it.starter) ? { starter: String(it.starter) } : {}),
    },
    ...(fb && (str(fb.correct) || str(fb.incorrect)) ? { feedback: { correct: str(fb.correct), incorrect: str(fb.incorrect) } } : {}),
  };
}

function parseLesson(v: unknown): CourseLessonInput | null {
  const o = (v ?? {}) as Record<string, unknown>;
  const title = name(o.title);
  if (!title) return null;
  return {
    title,
    ...(oneOf(o.type, LESSON_TYPES) ? { type: oneOf(o.type, LESSON_TYPES) } : {}),
    ...(oneOf(o.difficulty, LESSON_DIFFICULTIES) ? { difficulty: oneOf(o.difficulty, LESSON_DIFFICULTIES) } : {}),
    estimated_minutes: num(o.estimated_minutes),
    learning_objectives: strList(o.learning_objectives),
    steps: list(o.steps).map(parseStep).filter((s): s is CourseStepInput => !!s),
  };
}

function parseModule(v: unknown): CourseModuleInput | null {
  const o = (v ?? {}) as Record<string, unknown>;
  const title = name(o.title);
  if (!title) return null;
  return {
    title,
    description: str(o.description) || null,
    lessons: list(o.lessons).map(parseLesson).filter((l): l is CourseLessonInput => !!l),
  };
}

const findingsOut = (findings: Array<{ kind: string; where: string; message: string }>) =>
  findings.map((f) => `${f.kind} — ${f.where}: ${f.message}`);

/**
 * How far through the build plan the course is, and what to write next.
 *
 * Without this, a course written a piece at a time has to be held in memory
 * across a long run — which is exactly what fails. The tool that changed the
 * course is the one that knows what is left, so it says so on the way out.
 */
/** Read a course for a REPORT, where failing to read it must change nothing. */
async function safeRead(store: CourseStore, id: string) {
  try {
    return await store.readCourse(id);
  } catch {
    return null;
  }
}

function planProgress(
  plan: CourseBuildPlan | null | undefined,
  modules: CourseModuleInput[],
): { written: number; total: number; next: string | null; remaining: string[] } | null {
  if (!plan?.lessons?.length) return null;
  const have = new Set<string>();
  for (const m of modules) for (const l of m.lessons ?? []) have.add(`${m.title}\u0000${l.title}`.toLowerCase());
  const outstanding = plan.lessons.filter((e) => !have.has(`${e.module}\u0000${e.lesson}`.toLowerCase()));
  return {
    written: plan.lessons.length - outstanding.length,
    total: plan.lessons.length,
    next: outstanding.length ? `${outstanding[0].module} › ${outstanding[0].lesson}` : null,
    // Capped: the point is to name the next few, not to re-print the plan.
    remaining: outstanding.slice(0, 8).map((e) => `${e.module} › ${e.lesson}`),
  };
}

/**
 * A repair turned into a list that is worked one entry at a time.
 *
 * A course with thirty findings used to arrive as thirty findings, and the
 * honest response to that looked like "rewrite it" — which is the one move
 * that loses work and cannot fit in a call. Ordered by where it is, with the
 * exact call that fixes it, a repair becomes thirty small calls instead.
 */
function repairWorklist(findings: Array<{ kind: string; where: string; message: string }>): string[] {
  const CALL: Record<string, string> = {
    no_steps: 'revise_course lesson (with module_index + lesson_index) giving its steps',
    step_unchecked: 'revise_course step (with module_index + lesson_index + step_index) adding answer or evaluation',
    step_no_prompt: 'revise_course step, giving the interaction a prompt',
    ask_ai_method: 'revise_course step, replacing "ask an AI" with the learner doing it themselves',
    thin_outline: 'revise_course add_lesson (with module_index) — append, do not resend the module',
    no_objectives: 'revise_course learning_objectives',
    no_prereqs: 'revise_course prerequisites',
    no_audience: 'revise_course target_audience',
    no_description: 'revise_course description',
    vulgar_title: 'revise_course title',
    no_safety_line: 'revise_course description, carrying the safety line',
    no_cover: 'regenerate_cover with a scene for this course',
    untranslated: 'translate_course, once the text is final',
  };
  return findings.map((f, i) =>
    `${i + 1}. [${f.kind}] ${f.where} — ${f.message} → ${CALL[f.kind] ?? 'revise_course, the smallest part that covers it'}`);
}

/**
 * "No course with that id" is where a turn used to stop dead. Say what the id
 * actually IS instead: a seed (the id printed in the brief, one line from the
 * one the tool wants), something deleted, or a lookup that failed — which is
 * not the same as a course that is missing, and must never read like one.
 */
async function explainMissingId(store: CourseStore, id: string, tool: string): Promise<string> {
  if (!id) return `${tool} requires a course_id.`;
  let what;
  try {
    what = await store.identify(id);
  } catch {
    return `No course with id ${id}, and the check for what that id is did not answer either.`;
  }
  switch (what.kind) {
    case 'seed':
      return what.courseId
        ? `That is the SEED id for "${what.title}", not the course id. The course written from it is ${what.courseId} — use that.`
        : `That is the SEED id for "${what.title}". No course has been written from it yet, so there is nothing to read: write it first with write_course, passing this id as seed_id.`;
    case 'malformed':
      return `"${id}" is not a course id. Course ids are uuids — find_course returns them.`;
    case 'lookup_failed':
      return `The library could not be reached to look up ${id} (${what.error}). This is NOT a missing course — do not conclude the course is gone, and do not rewrite it. Try again.`;
    default:
      return `No course with id ${id}. It may have been deleted since you last saw it — find_course to get the current id rather than working from one you remember. `
        + 'A course that is gone is a fact to REPORT, not a loss to make good: do not rebuild it from memory and do not let it change the job you were asked to do.';
  }
}

/** Find the honest gaps and seed the backlog with them. */
export class ProposeCoursesTool implements Tool {
  readonly name = 'propose_courses';
  readonly description =
    'Find the honest gaps in the course library — by category, level or audience — grounded in what is actually there, and add them to the seed backlog with why each belongs.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'propose_courses',
    description:
      'Propose courses worth ADDING, grounded in the library\'s actual coverage per category and level, and write them to the seed backlog so the operator can pick from them. Favour what is genuinely missing over what is popular; a tool course names the tool.',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Category slug to fill, e.g. "digital_craft". Omit for the library as a whole.' },
        level: { type: 'string', enum: COURSE_LEVELS },
        audience: { type: 'string', enum: COURSE_AUDIENCES },
        count: { type: 'integer', minimum: 1, maximum: 12 },
      },
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = storeOf(context);
    if (!store) return { success: false, output: NOT_HERE };
    const seeds = await store.proposeSeeds({
      category: str(args.category) || undefined,
      level: str(args.level) || undefined,
      audience: str(args.audience) || undefined,
      count: num(args.count) ?? undefined,
    });
    return { success: true, output: JSON.stringify({ seeds, count: seeds.length, note: 'Written to the seed backlog. Pick one and write it; the operator can skip any.' }) };
  }
}

export class FindCourseTool implements Tool {
  readonly name = 'find_course';
  readonly description = 'Search the library by title or subject BEFORE writing anything, so the same course is not written twice under two titles.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'find_course',
    description: 'Search the course library by title or subject. Word-wise, best match first. Call it before write_course, always.',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = storeOf(context);
    if (!store) return { success: false, output: NOT_HERE };
    const query = str(args.query);
    if (!query) return { success: false, output: 'find_course requires a query.' };
    const matches = await store.findCourse(query);
    if (matches.length === 0) {
      // The count, so an empty result is never read as an empty library.
      const { total } = await store.browseCourses(0);
      // And — because this went wrong on 26 Sep 2026 — what a small or empty
      // library MEANS. Reading zero courses, the run concluded the store had
      // been wiped, abandoned the course it had been asked for, and spent
      // itself trying to restore from memory a course that had never existed.
      // The library had simply been cleared on purpose, an hour earlier.
      return {
        success: true,
        output: JSON.stringify({
          matches: [],
          total,
          note: `No course matches "${query}". The library holds ${total} course${total === 1 ? '' : 's'} in total; try a different word before deciding it is missing.`,
          ...(total <= 2 ? {
            read_this: 'A small or EMPTY library is a normal state — courses are deleted and rebuilt deliberately, and a fresh library is the usual start of a rebuild. It is NOT evidence that anything was lost. Do not conclude a wipe. Do not try to restore anything from memory. Do not switch to a different course. You were asked for one course: write that one. If the library\'s state still looks wrong to you, say so in your report and carry on with the job you were given.',
          } : {}),
        }),
      };
    }
    return { success: true, output: JSON.stringify({ matches }) };
  }
}

export class ReadCourseTool implements Tool {
  readonly name = 'read_course';
  readonly description = 'Read a course in full — outline, every lesson\'s steps, cover and translation state, the last check — before touching it.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'read_course',
    description: 'Read one course as it stands: fields, modules, every lesson with its steps (or its legacy content), cover, translations, and the last check. Call it before any repair, so you change what is actually there.',
    parameters: { type: 'object', properties: { course_id: { type: 'string' } }, required: ['course_id'] },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = storeOf(context);
    if (!store) return { success: false, output: NOT_HERE };
    const id = str(args.course_id ?? args.id);
    const snapshot = await store.readCourse(id);
    if (!snapshot) return { success: false, output: await explainMissingId(store, id, 'read_course') };
    const progress = planProgress(snapshot.build_plan, snapshot.modules);
    return {
      success: true,
      output: JSON.stringify({
        ...snapshot,
        ...(progress ? {
          build_plan: progress,
          how: progress.next
            ? `Written ${progress.written} of ${progress.total} planned lessons. Next: ${progress.next} — add it with revise_course add_lesson (module_index), one lesson per call.`
            : `All ${progress.total} planned lessons are written. check_course, then translate_course when the text is final.`,
        } : {}),
      }),
    };
  }
}

/** Emit a finished course, through the gate. */
export class WriteCourseTool implements Tool {
  readonly name = 'write_course';
  readonly description =
    'Emit a finished course as a draft: outline, modules, lessons as steps, objectives, prerequisites, cover prompt — CHECKED before it lands. A failure comes back with exactly what is thin.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'write_course',
    description:
      'Emit the finished course. Call ONCE per course, after find_course. Every lesson is steps (teach → do → check); every step is checkable (answer for choice/predict, evaluation rubric for free_text/code); the learner\'s hands are on the tool. The gate refuses anything thin and says what.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string', description: 'What it teaches and who it is for. 20 words or more.' },
        category: { type: 'string', description: 'Category slug — one that exists. read the list from a refusal if unsure.' },
        subject: { type: 'string', description: 'The subject in one or two words, e.g. "GIMP", "Bookkeeping".' },
        level: { type: 'string', enum: COURSE_LEVELS },
        audience_type: { type: 'string', enum: COURSE_AUDIENCES },
        goal: { type: 'string', description: 'What the learner can do at the end, in one sentence.' },
        prerequisites: { type: 'string', description: '"None" is a real answer and must be said.' },
        target_audience: { type: 'string', description: 'Beginner to WHAT. One or two sentences.' },
        estimated_hours: { type: 'number' },
        learning_objectives: { type: 'array', items: { type: 'string' } },
        tags: { type: 'array', items: { type: 'string' } },
        modules: { type: 'array', items: MODULE_SCHEMA, description: 'Three or more — a FLOOR. The subject decides the number: a whole syllabus gets ten if it needs ten. Send it as a real ARRAY, never as a string containing JSON: a stringified one has to escape every quote and backslash in every teach and prompt, and that escaping is what breaks.' },
        cover_image_prompt: { type: 'string', description: 'A scene for THIS course — a person doing the thing, the tool visible, no text. Not a room, not a "cover".' },
        region: { type: 'string', description: 'ISO country code (GB, DE, IE…) ONLY when the subject IS its jurisdiction — law, tax, benefits, anything where the country is the content. Leave it out for maths, biology, a language, a tool.' },
        locale_bound: { type: 'boolean', description: 'True with a region: this course must never be translated into other languages, because it describes one country\'s rules. Sets it apart from a course that merely happens to be written in English.' },
        seed_id: { type: 'string', description: 'If written from a seed, its id, so the seed leaves the backlog.' },
        plan: {
          type: 'array',
          description: 'The FULL course this is the first instalment of — every lesson it will have, in order, as {module, lesson}. Give this whenever the subject is bigger than one call can carry: the course then lands even with a single module, and you grow it with add_module / add_lesson / add_step. Without it, the course must arrive complete.',
          items: { type: 'object', properties: { module: { type: 'string' }, lesson: { type: 'string' } }, required: ['module', 'lesson'] },
        },
      },
      required: ['title', 'description', 'category', 'subject', 'level', 'audience_type', 'prerequisites', 'target_audience', 'learning_objectives', 'modules'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = storeOf(context);
    if (!store) return { success: false, output: NOT_HERE };

    const level = oneOf(args.level, COURSE_LEVELS);
    const audience = oneOf(args.audience_type, COURSE_AUDIENCES);
    const category = name(args.category);
    // One message per field that is actually wrong, with what arrived. The
    // old one listed all four whatever the fault was, so a single mistyped
    // value read as "you sent none of this" — and the fix was invisible.
    const missing: string[] = [];
    if (!name(args.title)) missing.push(`title — got ${got(args.title)}`);
    if (!category) missing.push(`category — got ${got(args.category)}; it is a slug like "software_development"`);
    if (!level) missing.push(`level — got ${got(args.level)}; one of ${COURSE_LEVELS.join(' | ')}`);
    if (!audience) missing.push(`audience_type — got ${got(args.audience_type)}; one of ${COURSE_AUDIENCES.join(' | ')}`);
    if (missing.length) {
      const bare = Object.keys(args).length === 0;
      return {
        success: false,
        output: bare
          ? 'write_course arrived with no arguments at all — nothing was saved. Send the course again; if it keeps arriving empty it is too large for one call, so send fewer modules and grow it with revise_course.'
          : `write_course could not use ${missing.length === 1 ? 'one field' : `${missing.length} fields`}:\n- ${missing.join('\n- ')}\nEverything else you sent was fine — fix ${missing.length === 1 ? 'that field' : 'those fields'} and call again.`,
      };
    }
    // Count what arrived against what survived parsing. A module without a
    // title is dropped silently, and a course that loses every module that
    // way reads to the gate as a course that was never written — so say it
    // here, where the cause is still visible.
    // The plan is read before the gate runs, because it changes what the gate
    // is allowed to refuse.
    const planned = gaveList(args.plan)
      ? list(args.plan)
        .map((e) => { const o = (e ?? {}) as Record<string, unknown>; return { module: name(o.module), lesson: name(o.lesson) }; })
        .filter((e) => e.module && e.lesson)
      : [];

    const rawModules = list(args.modules);
    const parsedModules = rawModules.map(parseModule).filter((m): m is CourseModuleInput => !!m);
    if (!parsedModules.length) {
      const fault = listFault(args.modules, 'modules');
      return {
        success: false,
        output: fault
          ? `${fault} Nothing was saved.`
          : rawModules.length
            ? `None of the ${rawModules.length} modules could be read — every one needs a "title" string, and lessons need one too. Nothing was saved.`
            : `write_course arrived with no modules — got ${got(args.modules)}. A course is its modules; nothing was saved. Land a smaller course now and grow it with revise_course add_module.`,
      };
    }

    const categories = await store.listCategories();
    if (!categories.some((c) => c.slug === category)) {
      return { success: false, output: `No category "${category}". The library has: ${categories.map((c) => `${c.slug} (${c.name})`).join(', ')}. If none is right, propose_category.` };
    }

    const course: CourseInput = {
      title: name(args.title),
      description: str(args.description),
      category,
      subject: name(args.subject),
      level: level as CourseLevel,
      audience_type: audience as CourseAudience,
      goal: str(args.goal) || null,
      prerequisites: str(args.prerequisites),
      target_audience: str(args.target_audience),
      estimated_hours: num(args.estimated_hours),
      learning_objectives: strList(args.learning_objectives),
      tags: strList(args.tags),
      modules: parsedModules,
      cover_image_prompt: str(args.cover_image_prompt) || null,
      // A region without the lock, or a lock without a region, is always a
      // mistake: one gets translated when it must not be, the other is
      // untranslatable for no stated reason.
      region: str(args.region).toUpperCase() || null,
      locale_bound: args.locale_bound === true || !!str(args.region),
      seed_id: str(args.seed_id) || null,
      ...(planned.length ? { plan: planned } : {}),
    };

    const verdict = checkCourse(course, new Date().toISOString());
    // A course being BORN as the first instalment of a declared plan is
    // allowed to be short — that is what a first instalment is. Without this,
    // the gate's three-modules-by-two-lessons minimum has to fit in one call,
    // and when the output budget falls below it the course cannot be created
    // at all: the growth calls have nothing to grow. That is exactly how a
    // JavaScript course failed sixteen times on 26 Sep 2026 while the tools
    // meant to make it possible sat unused.
    //
    // Nothing is hidden: the findings still come back, the plan says what is
    // owed, and the course is a draft the operator publishes.
    const refusals = verdict.findings.filter((f) =>
      COURSE_REFUSAL_KINDS.has(f.kind) && !(planned.length && COURSE_INCOMPLETE_KINDS.has(f.kind)));
    if (refusals.length) {
      return {
        success: false,
        output: JSON.stringify({ ok: false, error: 'Refused by the gate. Fix these and call again — nothing was written.', findings: findingsOut(refusals) }),
      };
    }

    const saved = await store.save(course);
    if (!saved.id) return { success: false, output: `Could not save the course: ${saved.error ?? 'unknown error'}` };
    const recheck = await store.recheck(saved.id);
    return {
      success: true,
      output: JSON.stringify({
        ok: true, id: saved.id, title: course.title, status: 'draft',
        modules: course.modules.length, lessons: course.modules.reduce((n, m) => n + m.lessons.length, 0),
        recheck: recheck?.status ?? 'not re-checked',
        remaining: findingsOut(recheck?.findings ?? []),
        ...(saved.seed ? { seed: saved.seed } : {}),
        ...(planned.length ? { build_plan: planProgress({ lessons: planned, set_at: new Date().toISOString() }, course.modules) } : {}),
        next: planned.length
          ? `Landed as the first instalment. Now add the rest ONE call at a time — add_lesson (module_index) for a lesson in a module that exists, add_module for a new one. Never resend this course. Its id is ${saved.id}.`
          : 'It is a draft. The operator publishes. If there is no cover yet, regenerate_cover with the scene; translate_course when the text is final.',
      }),
    };
  }
}

/** Rewrite one part of an existing course, in place. */
export class ReviseCourseTool implements Tool {
  readonly name = 'revise_course';
  readonly description =
    'Rewrite ONE part of an existing course in place — its fields, all modules, one module, one lesson, or one step. The id stays. Refused only for findings it would add.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'revise_course',
    description:
      'Change ONE thing about an existing course. To GROW it: add_module, or add_lesson with module_index, or add_step with module_index + lesson_index — each one call, each one piece, never resend what is already there. To REPAIR it: give the fields to change, OR `module` with module_index, OR `lesson` with module_index + lesson_index, OR `step` with module_index + lesson_index + step_index (`modules` replaces ALL and is a last resort). Indices are 1-based, as the check reports them. Never write the course again to fix or extend it.',
    parameters: {
      type: 'object',
      properties: {
        course_id: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        category: { type: 'string' },
        subject: { type: 'string' },
        level: { type: 'string', enum: COURSE_LEVELS },
        audience_type: { type: 'string', enum: COURSE_AUDIENCES },
        goal: { type: 'string' },
        prerequisites: { type: 'string' },
        target_audience: { type: 'string' },
        estimated_hours: { type: 'number' },
        learning_objectives: { type: 'array', items: { type: 'string' } },
        tags: { type: 'array', items: { type: 'string' } },
        cover_image_prompt: { type: 'string', description: 'Saved on the course; does not re-shoot (regenerate_cover does).' },
        region: { type: 'string', description: 'ISO country code, or empty to unlock a course that is not actually jurisdiction-bound.' },
        locale_bound: { type: 'boolean' },
        modules: { type: 'array', items: MODULE_SCHEMA, description: 'Replaces EVERY module.' },
        module_index: { type: 'integer', minimum: 1 },
        module: { ...MODULE_SCHEMA, required: [] as string[], description: 'Replaces the module at module_index. Lessons given replace all of its lessons.' },
        lesson_index: { type: 'integer', minimum: 1 },
        lesson: { ...LESSON_SCHEMA, required: [] as string[], description: 'Replaces the lesson at module_index / lesson_index. Steps given replace all of its steps.' },
        step_index: { type: 'integer', minimum: 1 },
        step: { ...STEP_SCHEMA, description: 'Replaces the step at module_index / lesson_index / step_index.' },

        add_module: { ...MODULE_SCHEMA, description: 'APPEND a new module to the end. Use this to GROW a course — never resend the whole course to add to it. With at_index, inserts before that module instead.' },
        add_lesson: { ...LESSON_SCHEMA, description: 'APPEND a new lesson to the module at module_index. With at_index, inserts before that lesson.' },
        add_step: { ...STEP_SCHEMA, description: 'APPEND a new step to the lesson at module_index / lesson_index. With at_index, inserts before that step.' },
        at_index: { type: 'integer', minimum: 1, description: 'Optional, with any add_*: insert BEFORE this position instead of appending at the end. 1-based.' },

        plan: {
          type: 'array',
          description: 'Set the build plan: every lesson this course is MEANT to have, in order, as {module, lesson}. Does not change the course. read_course and check_course then report what is written against it and name the next piece.',
          items: {
            type: 'object',
            properties: { module: { type: 'string' }, lesson: { type: 'string' } },
            required: ['module', 'lesson'],
          },
        },
      },
      required: ['course_id'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = storeOf(context);
    if (!store) return { success: false, output: NOT_HERE };
    const id = str(args.course_id ?? args.id);
    if (!id) return { success: false, output: 'revise_course requires course_id.' };

    const revision: CourseRevision = {};
    const meta: NonNullable<CourseRevision['meta']> = {};
    for (const k of ['title', 'description', 'subject', 'goal', 'prerequisites', 'target_audience', 'cover_image_prompt'] as const) {
      const clean = k === 'title' || k === 'subject' ? name(args[k]) : str(args[k]);
      if (clean) meta[k] = clean;
    }
    if (name(args.category)) {
      const categories = await store.listCategories();
      if (!categories.some((c) => c.slug === name(args.category))) {
        return { success: false, output: `No category "${name(args.category)}". The library has: ${categories.map((c) => c.slug).join(', ')}.` };
      }
      meta.category = name(args.category);
    }
    if (typeof args.region === 'string') {
      meta.region = str(args.region).toUpperCase() || null;
      meta.locale_bound = !!meta.region;
    }
    if (typeof args.locale_bound === 'boolean') meta.locale_bound = args.locale_bound;
    if (oneOf(args.level, COURSE_LEVELS)) meta.level = oneOf(args.level, COURSE_LEVELS);
    if (oneOf(args.audience_type, COURSE_AUDIENCES)) meta.audience_type = oneOf(args.audience_type, COURSE_AUDIENCES);
    if (num(args.estimated_hours) !== null) meta.estimated_hours = num(args.estimated_hours);
    if (gaveList(args.learning_objectives)) meta.learning_objectives = strList(args.learning_objectives);
    if (gaveList(args.tags)) meta.tags = strList(args.tags);
    if (Object.keys(meta).length) revision.meta = meta;

    const mi = num(args.module_index), li = num(args.lesson_index), si = num(args.step_index);
    const atIndex = num(args.at_index);

    // Growing comes first, because growing is what a course needs most and
    // what there was previously no way to do: every other branch REPLACES at
    // an index, so adding anything meant resending the whole of whatever it
    // was being added to.
    if (args.add_step !== undefined) {
      if (mi === null || li === null) return { success: false, output: 'add_step needs module_index and lesson_index (1-based) saying which lesson to add the step to.' };
      const step = parseStep(args.add_step);
      if (!step) return { success: false, output: 'The step needs `teach` and an `interaction` with a `kind` (choice | free_text | code | predict) and a `prompt`.' };
      revision.add_step = { module_index: mi - 1, lesson_index: li - 1, step, ...(atIndex !== null ? { at_index: atIndex - 1 } : {}) };
    } else if (args.add_lesson !== undefined) {
      if (mi === null) return { success: false, output: 'add_lesson needs module_index (1-based) saying which module to add the lesson to.' };
      const lesson = parseLesson(args.add_lesson);
      if (!lesson) return { success: false, output: 'The lesson needs a `title`. Give its steps too, or add them afterwards with add_step.' };
      revision.add_lesson = { module_index: mi - 1, ...lesson, ...(atIndex !== null ? { at_index: atIndex - 1 } : {}) };
    } else if (args.add_module !== undefined) {
      const mod = parseModule(args.add_module);
      if (!mod) return { success: false, output: 'The module needs a `title`. Give its lessons too, or add them afterwards with add_lesson.' };
      revision.add_module = { ...mod, ...(atIndex !== null ? { at_index: atIndex - 1 } : {}) };
    } else if (gaveList(args.plan)) {
      const planned = list(args.plan)
        .map((e) => { const o = (e ?? {}) as Record<string, unknown>; return { module: name(o.module), lesson: name(o.lesson) }; })
        .filter((e) => e.module && e.lesson);
      if (!planned.length) {
        const fault = listFault(args.plan, 'plan');
        return { success: false, output: fault ?? 'Every plan entry needs a `module` and a `lesson`. Nothing was changed.' };
      }
      revision.plan = planned;
    } else if (gaveList(args.modules)) {
      const raw = list(args.modules);
      revision.modules = raw.map(parseModule).filter((m): m is CourseModuleInput => !!m);
      if (!revision.modules.length) {
        // Truncation first: "empty modules list" is a very different fault
        // from "the call did not arrive", and confusing them is what cost a
        // whole run on 25 Sep 2026.
        const fault = listFault(args.modules, 'modules');
        return {
          success: false,
          output: fault
            ? `${fault} Nothing was changed.`
            : raw.length
              ? `None of the ${raw.length} modules could be read — every one needs a "title" string. Nothing was changed.`
              : 'revise_course was given an empty modules list, which would delete every module. Nothing was changed. To replace one module use `module` with module_index; to ADD one use add_module.',
        };
      }
    } else if (args.step !== undefined) {
      if (mi === null || li === null || si === null) return { success: false, output: 'A step revision needs module_index, lesson_index and step_index (1-based).' };
      const step = parseStep(args.step);
      if (!step) return { success: false, output: 'The step needs teach and an interaction with a kind.' };
      revision.step = { module_index: mi - 1, lesson_index: li - 1, index: si - 1, step };
    } else if (args.lesson !== undefined) {
      if (mi === null || li === null) return { success: false, output: 'A lesson revision needs module_index and lesson_index (1-based).' };
      const o = (args.lesson ?? {}) as Record<string, unknown>;
      revision.lesson = {
        module_index: mi - 1, index: li - 1,
        ...(str(o.title) ? { title: str(o.title) } : {}),
        ...(oneOf(o.type, LESSON_TYPES) ? { type: oneOf(o.type, LESSON_TYPES) } : {}),
        ...(oneOf(o.difficulty, LESSON_DIFFICULTIES) ? { difficulty: oneOf(o.difficulty, LESSON_DIFFICULTIES) } : {}),
        ...(num(o.estimated_minutes) !== null ? { estimated_minutes: num(o.estimated_minutes) } : {}),
        ...(gaveList(o.learning_objectives) ? { learning_objectives: strList(o.learning_objectives) } : {}),
        ...(gaveList(o.steps) ? { steps: list(o.steps).map(parseStep).filter((s): s is CourseStepInput => !!s) } : {}),
      };
    } else if (args.module !== undefined) {
      if (mi === null) return { success: false, output: 'A module revision needs module_index (1-based).' };
      const o = (args.module ?? {}) as Record<string, unknown>;
      revision.module = {
        index: mi - 1,
        ...(str(o.title) ? { title: str(o.title) } : {}),
        ...(str(o.description) ? { description: str(o.description) } : {}),
        ...(gaveList(o.lessons) ? { lessons: list(o.lessons).map(parseLesson).filter((l): l is CourseLessonInput => !!l) } : {}),
      };
    }

    if (!revision.meta && !revision.modules && !revision.module && !revision.lesson && !revision.step
      && !revision.add_module && !revision.add_lesson && !revision.add_step && !revision.plan) {
      return {
        success: false,
        output: 'revise_course: nothing to change. To grow the course: add_module, or add_lesson with module_index, or add_step with module_index + lesson_index. '
          + 'To repair it: a field, or `module` / `lesson` / `step` with its index. To record what is still to be written: `plan`.',
      };
    }

    const result = await store.reviseCourse(id, revision);
    if (!result.ok) {
      return { success: false, output: JSON.stringify({ ok: false, error: result.error ?? 'refused', would_add: findingsOut(result.findings ?? []) }) };
    }
    const recheck = await store.recheck(id);
    // The call that just changed the course is the one that knows what is
    // still outstanding, so it hands back the next piece rather than leaving
    // it to be remembered across a long run.
    // Never let the progress REPORT break a revision that already landed.
    // `.catch()` only covers a rejected promise, not a store that cannot be
    // asked at all — and the change is saved by this point either way.
    const after = await safeRead(store, id);
    const progress = planProgress(after?.build_plan, after?.modules ?? []);
    const worklist = repairWorklist(recheck?.findings ?? []);
    return {
      success: true,
      output: JSON.stringify({
        ok: true,
        changed: Object.keys(revision),
        ...(result.added ? { added: result.added } : {}),
        recheck: recheck?.status ?? 'not re-checked',
        remaining: findingsOut(recheck?.findings ?? []),
        ...(worklist.length ? { worklist } : {}),
        ...(progress ? { build_plan: progress } : {}),
        next: progress?.next
          ? `Next planned lesson: ${progress.next}. Add it with revise_course add_lesson — one lesson per call.`
          : worklist.length
            ? 'Take the next worklist entry, on its own, in its own call.'
            : 'Nothing outstanding. check_course to confirm, then translate_course when the text is final.',
      }),
    };
  }
}

export class CheckCourseTool implements Tool {
  readonly name = 'check_course';
  readonly description = 'Run the gate on a stored course and get back exactly what is wrong.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'check_course',
    description: 'Check an existing course against the standard: steps on every lesson, every step checkable, no "ask an AI" method, an outline that is a course, the fields a learner filters on, the safety line for trades and health, cover and translations.',
    parameters: { type: 'object', properties: { course_id: { type: 'string' } }, required: ['course_id'] },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = storeOf(context);
    if (!store) return { success: false, output: NOT_HERE };
    const checkId = str(args.course_id ?? args.id);
    const verdict = await store.recheck(checkId);
    if (!verdict) return { success: false, output: await explainMissingId(store, checkId, 'check_course') };
    // The findings as a numbered list of small jobs, each naming the call that
    // does it. A long list used to read as "this course needs rewriting",
    // which is the one move that loses work and will not fit in a call.
    const worklist = repairWorklist(verdict.findings);
    const snapshot = await safeRead(store, checkId);
    const progress = planProgress(snapshot?.build_plan, snapshot?.modules ?? []);
    return {
      success: true,
      output: JSON.stringify({
        status: verdict.status,
        checked_at: verdict.checked_at,
        findings: findingsOut(verdict.findings),
        ...(worklist.length ? {
          worklist,
          how: 'Work this list ONE entry at a time: make the call named, then check_course again. Do not rewrite the course, and do not batch several fixes into one call — that is what gets cut off.',
        } : {}),
        ...(progress ? { build_plan: progress } : {}),
      }),
    };
  }
}

export class RegenerateCoverTool implements Tool {
  readonly name = 'regenerate_cover';
  readonly description = 'Re-shoot a course\'s cover from a scene you author for THIS course.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'regenerate_cover',
    description: 'Generate the cover image from a prompt: a person doing the thing the course teaches, the tool or material visible, natural light, no text anywhere. Saves the prompt on the course.',
    parameters: {
      type: 'object',
      properties: { course_id: { type: 'string' }, prompt: { type: 'string' } },
      required: ['course_id', 'prompt'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = storeOf(context);
    if (!store) return { success: false, output: NOT_HERE };
    const id = str(args.course_id ?? args.id), prompt = str(args.prompt);
    if (!id || !prompt) return { success: false, output: 'regenerate_cover requires course_id and prompt.' };
    const r = await store.regenerateCover(id, prompt);
    if (!r.ok) return { success: false, output: `Cover failed: ${r.error ?? 'unknown error'}` };
    return { success: true, output: JSON.stringify({ ok: true, url: r.url ?? null }) };
  }
}

export class TranslateCourseTool implements Tool {
  readonly name = 'translate_course';
  readonly description = 'Fill every locale for a course. Reports what is still missing rather than claiming done.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'translate_course',
    description: 'Translate a course into all supported locales. Do it when the text is final — a translation of a draft is work thrown away. Comes back with the locale count and any that are missing.',
    parameters: { type: 'object', properties: { course_id: { type: 'string' } }, required: ['course_id'] },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = storeOf(context);
    if (!store) return { success: false, output: NOT_HERE };
    const id = str(args.course_id ?? args.id);
    if (!id) return { success: false, output: 'translate_course requires course_id.' };
    const r = await store.translate(id);
    if (!r.ok) return { success: false, output: `Translation failed: ${r.error ?? 'unknown error'}${r.missing.length ? ` (missing: ${r.missing.join(', ')})` : ''}` };
    return { success: true, output: JSON.stringify({ ok: true, locales: r.locales, missing: r.missing }) };
  }
}

/** A category the taxonomy lacks — proposed, never invented. */
export class ProposeCategoryTool implements Tool {
  readonly name = 'propose_category';
  readonly description = 'Propose a NEW course category for the operator to approve — when no existing category honestly holds the course.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'propose_category',
    description: 'Queue a category for the operator. Categories are what a learner filters on, so they are decided, not improvised. Check the existing list first — the nearest one is usually right. Say the reason in terms of the courses it would hold.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'As a learner would read it, e.g. "Making & Electronics".' },
        reason: { type: 'string', description: 'The courses it would hold and why none of the existing categories is honest for them.' },
      },
      required: ['name', 'reason'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = storeOf(context);
    if (!store) return { success: false, output: NOT_HERE };
    const name = str(args.name), reason = str(args.reason);
    if (!name || !reason) return { success: false, output: 'propose_category requires name and reason.' };
    const r = await store.proposeCategory({ name, reason });
    if (!r.ok) return { success: false, output: r.existing ? `Not proposed: ${r.error} (${r.existing})` : `Could not propose: ${r.error ?? 'unknown error'}` };
    return { success: true, output: JSON.stringify({ ok: true, proposed: name, next: 'Queued for the operator in the hub. Use the nearest existing category meanwhile.' }) };
  }
}
