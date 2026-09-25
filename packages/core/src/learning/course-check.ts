// The Classroom's gate — what a pre-made course must have before Ava can land
// it, and what the queue reports about one that already exists.
//
// The mirror of checkExercise. Pure and testable: the store loads, this
// judges, the store writes the verdict on the row. It exists because the
// curated library had no content gate at all — 39 published courses, every
// lesson a blob followed by a quiz, none written to the steps standard the
// players have run since June 2026 — and because the person these courses are
// written for is the one Ava then sits with in the IDE. A thin course is not
// a thin page; it is a bad hour of teaching.

import type { LessonStep } from '../tools/learning.js';

/** The category slugs whose courses must say where competent DIY ends. */
export const SAFETY_LINE_CATEGORIES: readonly string[] = ['trades_home', 'health_care'];

/** The one category where "ask Ava" IS the lesson. */
export const ASK_AVA_EXEMPT_CATEGORIES: readonly string[] = ['using_ava'];

export type CourseFindingKind =
  // Refusals — write_course will not land a course carrying one of these.
  | 'no_steps'          // a lesson without steps, or fewer than three
  | 'step_unchecked'    // a step nothing can check: no answer, no rubric
  | 'step_no_prompt'    // a step that teaches and asks nothing
  | 'ask_ai_method'     // a step whose method is "have an AI do it"
  | 'thin_outline'      // under three modules, or a module under two lessons
  | 'no_objectives'
  | 'no_prereqs'
  | 'no_audience'
  | 'no_description'
  | 'vulgar_title'
  | 'no_safety_line'    // trades / health with no competent-stops line
  // Reports — shown in the queue, never a refusal.
  | 'no_cover'
  | 'untranslated';

export const COURSE_REFUSAL_KINDS: ReadonlySet<CourseFindingKind> = new Set<CourseFindingKind>([
  'no_steps', 'step_unchecked', 'step_no_prompt', 'ask_ai_method', 'thin_outline',
  'no_objectives', 'no_prereqs', 'no_audience', 'no_description', 'vulgar_title', 'no_safety_line',
]);

/**
 * Findings that mean "not finished yet" rather than "done wrong".
 *
 * A module with one lesson and a lesson with no steps are both real faults in
 * a course that claims to be done — and both are the NORMAL state of a course
 * being built a piece at a time. Blocking an append for them makes building
 * in pieces impossible: the first add_module is refused for the module being
 * incomplete, which is the exact thing the next call was going to fix.
 *
 * So an append is never refused for these. They still appear in the check, in
 * the worklist, and in every report — and they still refuse a write_course,
 * where the course is being presented as finished. Only growth is let past.
 */
export const COURSE_INCOMPLETE_KINDS: ReadonlySet<CourseFindingKind> = new Set<CourseFindingKind>([
  'no_steps', 'thin_outline',
]);

export interface CourseCheckFinding {
  kind: CourseFindingKind;
  /** Where: "module 2 › lesson 3 › step 1", or the field name. */
  where: string;
  message: string;
}

export interface CourseCheckResult {
  status: 'pass' | 'fail';
  checked_at: string;
  findings: CourseCheckFinding[];
}

/** The minimum a step needs to be judged — the authored half of LessonStep. */
export type CheckStepInput = Pick<LessonStep, 'teach' | 'interaction'> & Partial<Pick<LessonStep, 'id' | 'feedback'>>;

export interface CheckLessonInput {
  title: string;
  steps?: CheckStepInput[] | null;
  /** Legacy shape. Present on every course written before the room. */
  content?: string | null;
}

export interface CheckModuleInput {
  title: string;
  description?: string | null;
  lessons: CheckLessonInput[];
}

export interface CourseCheckInput {
  title: string;
  description?: string | null;
  /** Category slug (course_categories). */
  category?: string | null;
  learning_objectives?: string[] | null;
  prerequisites?: string | null;
  target_audience?: string | null;
  modules: CheckModuleInput[];
}

// Mirrors the hub's profanity.ts and the library_paths trigger (migration
// 335). Word-boundary matched so "class", "assignment" and "assert" pass.
const VULGAR = [
  'fuck', 'fucker', 'motherfucker', 'shit', 'bullshit', 'bullshite', 'bitch',
  'cunt', 'cock', 'dick', 'dickhead', 'prick', 'pussy', 'ass', 'asshole',
  'arse', 'arsehole', 'bastard', 'bollocks', 'wank', 'wanker', 'twat', 'slut',
  'whore', 'fag', 'faggot', 'nigger', 'nigga', 'retard', 'piss', 'knob',
  'shag', 'douche',
];
const VULGAR_RE = new RegExp(`\\b(${VULGAR.join('|')})\\b`, 'i');

// "Ask Ava to generate the logo", "have ChatGPT write the function", "let an
// AI do the cleanup". The learner's hands must be on the tool; a step whose
// method is delegation teaches dependence, which is the opposite of a course.
// Deliberately narrow — it must not catch "without asking an AI" or a step
// ABOUT AI in a Technology course.
const ASK_AI_RE = /\b(ask|get|have|let|tell|use)\b[^.]{0,30}\b(ava|chatgpt|copilot|an? (?:ai|llm|assistant|model|chatbot))\b[^.]{0,40}\b(?:to )?(do|write|make|generate|create|build|fix|solve|draw|design|produce|code|render)\b/i;
const NOT_DELEGATION_RE = /\b(without|instead of|rather than|don't|do not|never)\b[^.]{0,20}\b(ask|use|let)/i;

// Trades and health: the line where competent stops and certified begins.
const SAFETY_RE = /\b(qualified|certified|registered|licen[sc]ed|electrician|plumber|gas safe|part p|building regulations|structural engineer|doctor|gp\b|pharmacist|paramedic|999|emergency services|call an ambulance|professional)\b/i;

const words = (t: string | null | undefined) => (t ?? '').trim().split(/\s+/).filter(Boolean).length;

/**
 * Judge a course. `now` is passed in so the verdict is reproducible.
 * `opts.hasCover` / `opts.locales` are what the store knows and the input does
 * not; they only ever produce report-kind findings.
 */
export function checkCourse(
  course: CourseCheckInput,
  now: string,
  opts: { hasCover?: boolean | null; locales?: number | null; requiredLocales?: number } = {},
): CourseCheckResult {
  const findings: CourseCheckFinding[] = [];
  const category = (course.category ?? '').toLowerCase();

  const vulgar = VULGAR_RE.exec(course.title ?? '');
  if (vulgar) {
    findings.push({ kind: 'vulgar_title', where: 'title', message: `The title carries "${vulgar[1]}". A learning library can reach kids; the database will refuse it too.` });
  }
  if (words(course.description) < 20) {
    findings.push({ kind: 'no_description', where: 'description', message: 'No description — what the course teaches and who it is for, in a paragraph a learner reads before starting.' });
  }
  if (!(course.learning_objectives ?? []).some((o) => o && o.trim())) {
    findings.push({ kind: 'no_objectives', where: 'learning_objectives', message: 'No learning objectives. A learner filters on what they will be able to DO afterwards.' });
  }
  if (!(course.prerequisites ?? '').trim()) {
    findings.push({ kind: 'no_prereqs', where: 'prerequisites', message: 'No prerequisites. "None" is a real answer and must be said; silence reads as "we did not think".' });
  }
  if (!(course.target_audience ?? '').trim()) {
    findings.push({ kind: 'no_audience', where: 'target_audience', message: 'No target audience. Beginner to WHAT — someone who has never opened the tool, or a professional changing lanes?' });
  }

  const modules = course.modules ?? [];
  if (modules.length < 3) {
    findings.push({ kind: 'thin_outline', where: 'modules', message: `${modules.length} module${modules.length === 1 ? '' : 's'} is not a course. Three or more, each a stage the learner can feel.` });
  }

  const exemptAskAi = ASK_AVA_EXEMPT_CATEGORIES.includes(category);
  let allText = `${course.description ?? ''}\n`;

  modules.forEach((m, mi) => {
    const lessons = m.lessons ?? [];
    const modWhere = `module ${mi + 1} "${m.title}"`;
    allText += `${m.description ?? ''}\n`;
    if (lessons.length < 2) {
      findings.push({ kind: 'thin_outline', where: modWhere, message: `${lessons.length} lesson${lessons.length === 1 ? '' : 's'} in this module. Two or more, or fold it into another.` });
    }
    lessons.forEach((l, li) => {
      const lesWhere = `${modWhere} › lesson ${li + 1} "${l.title}"`;
      const steps = (l.steps ?? []).filter(Boolean);
      if (steps.length < 3) {
        findings.push({
          kind: 'no_steps', where: lesWhere,
          message: steps.length === 0
            ? 'No steps. Every lesson is teach → do → check; a page followed by a quiz is the old shape and it is not accepted.'
            : `${steps.length} step${steps.length === 1 ? '' : 's'}. Three or more — a bite, something to do, a check — or it is a paragraph.`,
        });
      }
      steps.forEach((s, si) => {
        const stepWhere = `${lesWhere} › step ${si + 1}`;
        const it = s.interaction;
        allText += `${s.teach ?? ''}\n${it?.prompt ?? ''}\n`;
        if (!it || !(it.prompt ?? '').trim()) {
          findings.push({ kind: 'step_no_prompt', where: stepWhere, message: 'The step teaches and asks nothing. What does the learner DO here?' });
          return;
        }
        const deterministic = it.kind === 'choice' || it.kind === 'predict';
        const checked = deterministic ? !!(it.answer ?? '').trim() : !!(it.evaluation ?? '').trim();
        if (!checked) {
          findings.push({
            kind: 'step_unchecked', where: stepWhere,
            message: deterministic
              ? `A ${it.kind} step with no answer — nothing can mark it.`
              : `A ${it.kind} step with no evaluation rubric. Open input is graded against intent; without the rubric "complete" means they typed something.`,
          });
        }
        if (it.kind === 'choice' && (it.options ?? []).length < 2) {
          findings.push({ kind: 'step_unchecked', where: stepWhere, message: 'A choice step with fewer than two options is not a choice.' });
        }
        // The answer has to be one of the things the learner can actually
        // click. Two of these reached a finished course and only a READING
        // found them (25 Sep 2026) — "input, which fires on every keystroke"
        // as the key, against options of click | input | submit | load. Every
        // learner gets it wrong, every time, and no structural check saw it
        // because an answer was present and the options were plural.
        //
        // Compared leniently: case and surrounding space are not the learner's
        // mistake, and marking them wrong would be a second bug on top.
        if (it.kind === 'choice' && (it.options ?? []).length >= 2 && (it.answer ?? '').trim()) {
          const same = (x: string) => x.trim().toLowerCase();
          if (!(it.options ?? []).some((o) => same(String(o)) === same(it.answer!))) {
            findings.push({
              kind: 'step_unchecked', where: stepWhere,
              message: `The answer is not one of the options, so no choice the learner can click is ever right. Answer: ${JSON.stringify(it.answer)}. Options: ${JSON.stringify(it.options)}.`,
            });
          }
        }
        if (!exemptAskAi) {
          const text = `${s.teach ?? ''} ${it.prompt}`;
          if (ASK_AI_RE.test(text) && !NOT_DELEGATION_RE.test(text)) {
            findings.push({ kind: 'ask_ai_method', where: stepWhere, message: 'The method is "have an AI do it". The learner\'s hands go on the tool; Ava can help AFTER they have done it themselves.' });
          }
        }
      });
    });
  });

  if (SAFETY_LINE_CATEGORIES.includes(category) && !SAFETY_RE.test(allText)) {
    findings.push({ kind: 'no_safety_line', where: 'course', message: 'Nothing says where competent DIY ends and certified work begins. For trades and health that line comes before the method, not after.' });
  }

  if (opts.hasCover === false) {
    findings.push({ kind: 'no_cover', where: 'cover', message: 'No cover image.' });
  }
  const required = opts.requiredLocales ?? 19;
  if (typeof opts.locales === 'number' && opts.locales < required) {
    findings.push({ kind: 'untranslated', where: 'translations', message: `${opts.locales} of ${required} locales translated.` });
  }

  const refused = findings.some((f) => COURSE_REFUSAL_KINDS.has(f.kind));
  return { status: refused ? 'fail' : 'pass', checked_at: now, findings };
}
