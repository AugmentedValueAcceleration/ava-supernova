// The Classroom's gate. What it refuses is the point: a course that reaches
// a learner is an hour of Ava teaching, and a thin one is a bad hour.

import { describe, it, expect } from 'vitest';
import { checkCourse, COURSE_REFUSAL_KINDS, type CourseCheckInput, type CheckLessonInput } from '../src/learning/course-check.js';

const NOW = '2026-09-20T12:00:00.000Z';

const step = (kind: 'choice' | 'free_text' | 'code' | 'predict' = 'choice', extra: Record<string, unknown> = {}) => ({
  teach: 'Layers are stacked transparencies. The top one wins where it is opaque.',
  interaction: {
    kind,
    prompt: kind === 'choice' ? 'Which layer is visible where both are opaque?' : 'Add a layer above the photo and name it "grade". Say what you did.',
    ...(kind === 'choice' || kind === 'predict' ? { options: ['Top', 'Bottom'], answer: 'Top' } : { evaluation: 'They added a layer above, named it, and it sits above the photo in the panel.' }),
    ...extra,
  },
});

const lesson = (title = 'Layers', steps: CheckLessonInput['steps'] = [step(), step('free_text'), step('predict')]): CheckLessonInput => ({ title, steps });

const good = (): CourseCheckInput => ({
  title: 'GIMP from the First Layer',
  description: 'Open GIMP for the first time and leave able to retouch a photograph, cut a subject out cleanly, and export for the web without guessing.',
  category: 'digital_craft',
  learning_objectives: ['Retouch a photo with layers and masks', 'Cut a subject out with paths', 'Export correctly for web and print'],
  prerequisites: 'None. GIMP installed.',
  target_audience: 'Someone who has never opened an image editor and wants to do it themselves.',
  modules: [
    { title: 'The workspace', lessons: [lesson('Layers'), lesson('Selections')] },
    { title: 'Retouching', lessons: [lesson('Masks'), lesson('Healing')] },
    { title: 'Getting it out', lessons: [lesson('Export'), lesson('Print')] },
  ],
});

const kinds = (c: CourseCheckInput, opts?: Parameters<typeof checkCourse>[2]) => checkCourse(c, NOW, opts).findings.map((f) => f.kind);

describe('checkCourse', () => {
  it('passes a course written to the standard', () => {
    const r = checkCourse(good(), NOW);
    expect(r.status).toBe('pass');
    expect(r.findings).toEqual([]);
    expect(r.checked_at).toBe(NOW);
  });

  it('refuses the legacy shape: a lesson with content and no steps', () => {
    const c = good();
    c.modules[0].lessons[0] = { title: 'Layers', content: 'A long page about layers…', steps: null };
    const r = checkCourse(c, NOW);
    expect(r.status).toBe('fail');
    expect(r.findings[0]).toMatchObject({ kind: 'no_steps', where: 'module 1 "The workspace" › lesson 1 "Layers"' });
  });

  it('refuses a step nothing can check, and says which kind of check is missing', () => {
    const c = good();
    c.modules[0].lessons[0].steps = [step(), step('free_text', { evaluation: '' }), step('choice', { answer: '' })];
    const r = checkCourse(c, NOW);
    expect(r.status).toBe('fail');
    const unchecked = r.findings.filter((f) => f.kind === 'step_unchecked');
    expect(unchecked).toHaveLength(2);
    expect(unchecked[0].message).toContain('rubric');
    expect(unchecked[1].message).toContain('no answer');
  });

  it('refuses a step that teaches and asks nothing', () => {
    const c = good();
    c.modules[0].lessons[0].steps = [step(), step(), step('choice', { prompt: '  ' })];
    expect(kinds(c)).toContain('step_no_prompt');
  });

  it('refuses "have an AI do it" as a method — outside Using Ava', () => {
    const c = good();
    c.modules[0].lessons[0].steps = [step(), step(), step('free_text', { prompt: 'Ask Ava to generate the cut-out for you, then paste it in.' })];
    expect(kinds(c)).toContain('ask_ai_method');

    // The same step in a Using Ava course IS the lesson.
    c.category = 'using_ava';
    expect(kinds(c)).not.toContain('ask_ai_method');
  });

  it('does not mistake "without asking an AI" or a course ABOUT AI for delegation', () => {
    const c = good();
    c.category = 'technology';
    c.modules[0].lessons[0].steps = [
      step('free_text', { prompt: 'Do the cut-out yourself, without asking an AI to do it. Describe the path you drew.' }),
      step('free_text', { prompt: 'Explain what a language model does with a prompt, in your own words.' }),
      step(),
    ];
    expect(kinds(c)).not.toContain('ask_ai_method');
  });

  it('refuses a thin outline — under three modules, or a module with one lesson', () => {
    const c = good();
    c.modules = c.modules.slice(0, 2);
    expect(kinds(c)).toContain('thin_outline');

    const d = good();
    d.modules[1].lessons = [lesson('Masks')];
    const r = checkCourse(d, NOW);
    expect(r.findings.find((f) => f.kind === 'thin_outline')?.where).toBe('module 2 "Retouching"');
  });

  it('refuses the fields a learner filters on when they are missing', () => {
    const c = good();
    c.description = 'Short.';
    c.learning_objectives = [];
    c.prerequisites = '';
    c.target_audience = null;
    const k = kinds(c);
    expect(k).toEqual(expect.arrayContaining(['no_description', 'no_objectives', 'no_prereqs', 'no_audience']));
  });

  it('refuses a vulgar title on a word boundary, and lets "class" and "assignment" through', () => {
    const c = good();
    c.title = 'Shit Photos, Fixed';
    expect(kinds(c)).toContain('vulgar_title');
    c.title = 'Class Assignments: Assert Your Analysis';
    expect(kinds(c)).not.toContain('vulgar_title');
  });

  it('requires trades and health courses to say where competent stops', () => {
    const c = good();
    c.category = 'trades_home';
    expect(kinds(c)).toContain('no_safety_line');

    c.modules[0].lessons[0].steps![0].teach = 'Before anything: notifiable work needs a registered electrician under Part P. This course stops at the consumer unit.';
    expect(kinds(c)).not.toContain('no_safety_line');
  });

  it('reports a missing cover and missing locales without failing the course', () => {
    const r = checkCourse(good(), NOW, { hasCover: false, locales: 12 });
    expect(r.status).toBe('pass');
    expect(r.findings.map((f) => f.kind)).toEqual(['no_cover', 'untranslated']);
    expect(r.findings[1].message).toBe('12 of 19 locales translated.');
    for (const f of r.findings) expect(COURSE_REFUSAL_KINDS.has(f.kind)).toBe(false);
  });
});

describe('a choice whose answer is not on the list', () => {
  // 25 Sep 2026: two of these reached a finished 25-lesson course and only a
  // READING found them — "input, which fires on every keystroke" as the key,
  // against options of click | input | submit | load. Every learner gets it
  // wrong, every time. The gate saw an answer present and options plural, and
  // passed it. That is a structural fault and belongs here, not in a review.
  const course = (answer: string, options: string[]) => ({
    title: 'Events, Briefly', description: 'A short course on DOM events for people who have written a little JavaScript already.',
    category: 'software_development', subject: 'JavaScript', level: 'beginner', audience_type: 'Career change',
    goal: 'Handle an event.', prerequisites: 'None', target_audience: 'Written a little JavaScript.',
    estimated_hours: 2, learning_objectives: ['Handle an event'], tags: [], cover_image_prompt: 'x',
    region: null, locale_bound: false,
    modules: [1, 2, 3].map((m) => ({
      title: `Module ${m}`, description: null,
      lessons: [1, 2].map((l) => ({
        title: `Lesson ${m}.${l}`, estimated_minutes: 10, learning_objectives: [],
        steps: [1, 2, 3].map(() => ({
          teach: 'Events fire when something happens on the page, and you listen for them by name.',
          interaction: { kind: 'choice' as const, prompt: 'Which event fires on every keystroke?', options, answer },
        })),
      })),
    })),
  });

  it('is refused, and the message shows both sides', () => {
    const v = checkCourse(course('input, which fires on every keystroke', ['click', 'input', 'submit', 'load']), 'now');
    const f = v.findings.find((x) => x.message.includes('not one of the options'));
    expect(f).toBeDefined();
    expect(f!.kind).toBe('step_unchecked');
    expect(f!.message).toContain('"input, which fires on every keystroke"');
    expect(f!.message).toContain('"click"');
    expect(v.status).toBe('fail');
  });

  it('an answer that IS on the list passes', () => {
    const v = checkCourse(course('input', ['click', 'input', 'submit', 'load']), 'now');
    expect(v.findings.some((x) => x.message.includes('not one of the options'))).toBe(false);
  });

  it('case and stray spacing are not the learner\'s mistake', () => {
    const v = checkCourse(course('  Input ', ['click', 'input', 'submit', 'load']), 'now');
    expect(v.findings.some((x) => x.message.includes('not one of the options'))).toBe(false);
  });
});
