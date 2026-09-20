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
import { checkCourse, COURSE_REFUSAL_KINDS } from '../learning/course-check.js';
import {
  COURSE_LEVELS, COURSE_AUDIENCES, LESSON_TYPES, LESSON_DIFFICULTIES,
  type CourseStore, type CourseInput, type CourseRevision, type CourseStepInput, type CourseLessonInput, type CourseModuleInput,
  type CourseLevel, type CourseAudience,
} from '../learning/course-store.js';

const NOT_HERE = 'The course library is not available in this context.';

function storeOf(context: ToolExecutionContext): CourseStore | undefined {
  return context.sharedState?.courseStore as CourseStore | undefined;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean) : []);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;

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
    steps: { type: 'array', items: STEP_SCHEMA, description: 'Three or more. Every lesson is steps.' },
  },
  required: ['title', 'steps'],
} as const;

const MODULE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    lessons: { type: 'array', items: LESSON_SCHEMA, description: 'Two or more.' },
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
      ...(Array.isArray(it.options) ? { options: strList(it.options) } : {}),
      ...(str(it.answer) ? { answer: str(it.answer) } : {}),
      ...(str(it.evaluation) ? { evaluation: str(it.evaluation) } : {}),
      ...(str(it.starter) ? { starter: String(it.starter) } : {}),
    },
    ...(fb && (str(fb.correct) || str(fb.incorrect)) ? { feedback: { correct: str(fb.correct), incorrect: str(fb.incorrect) } } : {}),
  };
}

function parseLesson(v: unknown): CourseLessonInput | null {
  const o = (v ?? {}) as Record<string, unknown>;
  const title = str(o.title);
  if (!title) return null;
  return {
    title,
    ...(oneOf(o.type, LESSON_TYPES) ? { type: oneOf(o.type, LESSON_TYPES) } : {}),
    ...(oneOf(o.difficulty, LESSON_DIFFICULTIES) ? { difficulty: oneOf(o.difficulty, LESSON_DIFFICULTIES) } : {}),
    estimated_minutes: num(o.estimated_minutes),
    learning_objectives: strList(o.learning_objectives),
    steps: (Array.isArray(o.steps) ? o.steps : []).map(parseStep).filter((s): s is CourseStepInput => !!s),
  };
}

function parseModule(v: unknown): CourseModuleInput | null {
  const o = (v ?? {}) as Record<string, unknown>;
  const title = str(o.title);
  if (!title) return null;
  return {
    title,
    description: str(o.description) || null,
    lessons: (Array.isArray(o.lessons) ? o.lessons : []).map(parseLesson).filter((l): l is CourseLessonInput => !!l),
  };
}

const findingsOut = (findings: Array<{ kind: string; where: string; message: string }>) =>
  findings.map((f) => `${f.kind} — ${f.where}: ${f.message}`);

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
      return { success: true, output: JSON.stringify({ matches: [], note: `No course matches "${query}". The library holds ${total}; try a different word before deciding it is missing.` }) };
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
    const snapshot = await store.readCourse(str(args.course_id ?? args.id));
    if (!snapshot) return { success: false, output: 'No course with that id.' };
    return { success: true, output: JSON.stringify(snapshot) };
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
        modules: { type: 'array', items: MODULE_SCHEMA, description: 'Three or more.' },
        cover_image_prompt: { type: 'string', description: 'A scene for THIS course — a person doing the thing, the tool visible, no text. Not a room, not a "cover".' },
        seed_id: { type: 'string', description: 'If written from a seed, its id, so the seed leaves the backlog.' },
      },
      required: ['title', 'description', 'category', 'subject', 'level', 'audience_type', 'prerequisites', 'target_audience', 'learning_objectives', 'modules'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = storeOf(context);
    if (!store) return { success: false, output: NOT_HERE };

    const level = oneOf(args.level, COURSE_LEVELS);
    const audience = oneOf(args.audience_type, COURSE_AUDIENCES);
    const category = str(args.category);
    if (!str(args.title) || !level || !audience || !category) {
      return { success: false, output: `write_course requires title, category, level (${COURSE_LEVELS.join(' | ')}) and audience_type (${COURSE_AUDIENCES.join(' | ')}).` };
    }
    const categories = await store.listCategories();
    if (!categories.some((c) => c.slug === category)) {
      return { success: false, output: `No category "${category}". The library has: ${categories.map((c) => `${c.slug} (${c.name})`).join(', ')}. If none is right, propose_category.` };
    }

    const course: CourseInput = {
      title: str(args.title),
      description: str(args.description),
      category,
      subject: str(args.subject),
      level: level as CourseLevel,
      audience_type: audience as CourseAudience,
      goal: str(args.goal) || null,
      prerequisites: str(args.prerequisites),
      target_audience: str(args.target_audience),
      estimated_hours: num(args.estimated_hours),
      learning_objectives: strList(args.learning_objectives),
      tags: strList(args.tags),
      modules: (Array.isArray(args.modules) ? args.modules : []).map(parseModule).filter((m): m is CourseModuleInput => !!m),
      cover_image_prompt: str(args.cover_image_prompt) || null,
      seed_id: str(args.seed_id) || null,
    };

    const verdict = checkCourse(course, new Date().toISOString());
    const refusals = verdict.findings.filter((f) => COURSE_REFUSAL_KINDS.has(f.kind));
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
        next: 'It is a draft. The operator publishes. If there is no cover yet, regenerate_cover with the scene; translate_course when the text is final.',
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
      'Repair an existing course where it is: give the fields to change, OR `modules` (replaces all), OR `module` with module_index, OR `lesson` with module_index + lesson_index, OR `step` with module_index + lesson_index + step_index. Indices are 1-based, as the check reports them. What you give replaces that part whole; everything else is untouched. Never write the course again to fix it.',
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
        modules: { type: 'array', items: MODULE_SCHEMA, description: 'Replaces EVERY module.' },
        module_index: { type: 'integer', minimum: 1 },
        module: { ...MODULE_SCHEMA, required: [] as string[], description: 'Replaces the module at module_index. Lessons given replace all of its lessons.' },
        lesson_index: { type: 'integer', minimum: 1 },
        lesson: { ...LESSON_SCHEMA, required: [] as string[], description: 'Replaces the lesson at module_index / lesson_index. Steps given replace all of its steps.' },
        step_index: { type: 'integer', minimum: 1 },
        step: { ...STEP_SCHEMA, description: 'Replaces the step at module_index / lesson_index / step_index.' },
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
      if (str(args[k])) meta[k] = str(args[k]);
    }
    if (str(args.category)) {
      const categories = await store.listCategories();
      if (!categories.some((c) => c.slug === str(args.category))) {
        return { success: false, output: `No category "${str(args.category)}". The library has: ${categories.map((c) => c.slug).join(', ')}.` };
      }
      meta.category = str(args.category);
    }
    if (oneOf(args.level, COURSE_LEVELS)) meta.level = oneOf(args.level, COURSE_LEVELS);
    if (oneOf(args.audience_type, COURSE_AUDIENCES)) meta.audience_type = oneOf(args.audience_type, COURSE_AUDIENCES);
    if (num(args.estimated_hours) !== null) meta.estimated_hours = num(args.estimated_hours);
    if (Array.isArray(args.learning_objectives)) meta.learning_objectives = strList(args.learning_objectives);
    if (Array.isArray(args.tags)) meta.tags = strList(args.tags);
    if (Object.keys(meta).length) revision.meta = meta;

    const mi = num(args.module_index), li = num(args.lesson_index), si = num(args.step_index);
    if (Array.isArray(args.modules)) {
      revision.modules = args.modules.map(parseModule).filter((m): m is CourseModuleInput => !!m);
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
        ...(Array.isArray(o.learning_objectives) ? { learning_objectives: strList(o.learning_objectives) } : {}),
        ...(Array.isArray(o.steps) ? { steps: o.steps.map(parseStep).filter((s): s is CourseStepInput => !!s) } : {}),
      };
    } else if (args.module !== undefined) {
      if (mi === null) return { success: false, output: 'A module revision needs module_index (1-based).' };
      const o = (args.module ?? {}) as Record<string, unknown>;
      revision.module = {
        index: mi - 1,
        ...(str(o.title) ? { title: str(o.title) } : {}),
        ...(str(o.description) ? { description: str(o.description) } : {}),
        ...(Array.isArray(o.lessons) ? { lessons: o.lessons.map(parseLesson).filter((l): l is CourseLessonInput => !!l) } : {}),
      };
    }

    if (!revision.meta && !revision.modules && !revision.module && !revision.lesson && !revision.step) {
      return { success: false, output: 'revise_course: nothing to change — give a field, or modules, or a module / lesson / step with its index.' };
    }

    const result = await store.reviseCourse(id, revision);
    if (!result.ok) {
      return { success: false, output: JSON.stringify({ ok: false, error: result.error ?? 'refused', would_add: findingsOut(result.findings ?? []) }) };
    }
    const recheck = await store.recheck(id);
    return {
      success: true,
      output: JSON.stringify({
        ok: true,
        changed: Object.keys(revision),
        recheck: recheck?.status ?? 'not re-checked',
        remaining: findingsOut(recheck?.findings ?? []),
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
    const verdict = await store.recheck(str(args.course_id ?? args.id));
    if (!verdict) return { success: false, output: 'No course with that id.' };
    return { success: true, output: JSON.stringify({ status: verdict.status, checked_at: verdict.checked_at, findings: findingsOut(verdict.findings) }) };
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
