import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

/**
 * Learning tools — Ava creates, teaches, and tracks learning paths through conversation.
 * Data is stored locally in ~/.ava/learning.json and synced to platform when connected.
 */

// ── Types ────────────────────────────────────────────────────────────

interface QuizQuestion {
  question: string;
  options?: string[];
  correct_answer: string;
  user_answer?: string;
  is_correct?: boolean;
  explanation?: string;
}

interface Lesson {
  id: string;
  title: string;
  content: string | null;
  type: 'concept' | 'exercise' | 'project' | 'quiz' | 'recap' | 'challenge';
  status: 'not_started' | 'in_progress' | 'completed' | 'needs_review';
  difficulty: 'easy' | 'medium' | 'hard';
  estimated_minutes: number | null;
  learning_objectives: string[];
  prerequisites: string[];
  resources: Array<{ title: string; url?: string; type: 'doc' | 'video' | 'article' | 'tool' }>;
  quiz_questions: QuizQuestion[];
  score: number | null;
  attempts: number;
  best_score: number | null;
  ava_feedback: string | null;
  completed_at: string | null;
  last_reviewed_at: string | null;
  review_count: number;
  tags: string[];
}

interface Module {
  id: string;
  title: string;
  description: string | null;
  status: 'locked' | 'available' | 'in_progress' | 'completed';
  progress_percent: number;
  estimated_minutes: number | null;
  learning_objectives: string[];
  lessons: Lesson[];
}

interface Curriculum {
  id: string;
  title: string;
  description: string | null;
  subject: string;
  level: string;
  goal: string | null;
  estimated_hours: number | null;
  status: 'active' | 'completed' | 'paused';
  progress_percent: number;
  modules: Module[];
  tags: string[];
  created_at: string;
  updated_at: string;
}

interface LearningStore {
  curriculums: Curriculum[];
}

// ── Storage helpers ──────────────────────────────────────────────────

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const LEARNING_FILENAME = 'learning.json';

async function loadStore(globalDir: string): Promise<LearningStore> {
  try {
    const raw = await readFile(join(globalDir, LEARNING_FILENAME), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { curriculums: [] };
  }
}

async function saveStore(globalDir: string, store: LearningStore): Promise<void> {
  await mkdir(globalDir, { recursive: true });
  await writeFile(join(globalDir, LEARNING_FILENAME), JSON.stringify(store, null, 2), 'utf-8');
}

function generateId(): string {
  return crypto.randomUUID();
}

function recalculateProgress(curriculum: Curriculum): void {
  for (const mod of curriculum.modules) {
    if (mod.lessons.length === 0) continue;
    const completed = mod.lessons.filter(l => l.status === 'completed').length;
    mod.progress_percent = Math.round((completed / mod.lessons.length) * 100);
    mod.status = mod.progress_percent === 100 ? 'completed'
      : completed > 0 || mod.lessons.some(l => l.status === 'in_progress') ? 'in_progress'
      : mod.status === 'locked' ? 'locked' : 'available';

    // Recalculate module estimated time from lessons
    const lessonsWithTime = mod.lessons.filter(l => l.estimated_minutes);
    if (lessonsWithTime.length > 0) {
      mod.estimated_minutes = lessonsWithTime.reduce((sum, l) => sum + (l.estimated_minutes || 0), 0);
    }
  }

  if (curriculum.modules.length === 0) return;
  curriculum.progress_percent = Math.round(
    curriculum.modules.reduce((sum, m) => sum + m.progress_percent, 0) / curriculum.modules.length
  );
  curriculum.status = curriculum.progress_percent === 100 ? 'completed' : 'active';

  // Unlock next module when current completes
  for (let i = 0; i < curriculum.modules.length - 1; i++) {
    if (curriculum.modules[i].status === 'completed' && curriculum.modules[i + 1].status === 'locked') {
      curriculum.modules[i + 1].status = 'available';
    }
  }
}

// Find lessons due for spaced repetition review
function getLessonsForReview(curriculum: Curriculum): Array<{ module: Module; lesson: Lesson }> {
  const now = Date.now();
  const results: Array<{ module: Module; lesson: Lesson }> = [];

  for (const mod of curriculum.modules) {
    for (const lesson of mod.lessons) {
      if (lesson.status !== 'completed' && lesson.status !== 'needs_review') continue;
      if (!lesson.completed_at) continue;

      // Spaced repetition intervals: 1 day, 3 days, 7 days, 14 days, 30 days
      const intervals = [1, 3, 7, 14, 30];
      const reviewIndex = Math.min(lesson.review_count, intervals.length - 1);
      const daysSinceReview = lesson.last_reviewed_at
        ? (now - new Date(lesson.last_reviewed_at).getTime()) / (1000 * 60 * 60 * 24)
        : (now - new Date(lesson.completed_at).getTime()) / (1000 * 60 * 60 * 24);

      if (daysSinceReview >= intervals[reviewIndex]) {
        results.push({ module: mod, lesson });
      }
    }
  }

  return results;
}

// ── AVA_HOME resolution ──────────────────────────────────────────────

function getGlobalDir(context: ToolExecutionContext): string {
  const mgr = context.sharedState?.memoryManager as { globalDir?: string } | undefined;
  return mgr?.globalDir ?? join(process.env.HOME || process.env.USERPROFILE || '.', '.ava');
}

// ══════════════════════════════════════════════════════════════════════
// Tool 1: learning_create — Ava builds a curriculum from conversation
// ══════════════════════════════════════════════════════════════════════

export class LearningCreateTool implements Tool {
  readonly name = 'learning_create';
  readonly description = 'Create a structured learning curriculum with modules and lessons for the user';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'learning_create',
    description:
      'Create a learning curriculum skeleton. Ask the user what they want to learn, their level, and goals FIRST. ' +
      'Keep the tool call SMALL — just titles, types, and difficulty for each lesson. ' +
      'Do NOT include lesson content here — use learning_teach with action "write_content" to add content per-lesson after creation. ' +
      'This keeps the response fast and avoids timeouts.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Curriculum title (e.g., "Python Fundamentals")' },
        description: { type: 'string', description: 'Brief description' },
        subject: { type: 'string', description: 'Subject area' },
        level: { type: 'string', enum: ['beginner', 'intermediate', 'advanced', 'mixed'] },
        goal: { type: 'string', description: 'What the user wants to achieve' },
        estimated_hours: { type: 'number', description: 'Estimated total hours' },
        tags: { type: 'array', items: { type: 'string' } },
        modules: {
          type: 'array',
          description: 'Ordered modules. Keep lessons lightweight — title, type, difficulty only. Content is added later via learning_teach.',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              lessons: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    type: { type: 'string', enum: ['concept', 'exercise', 'project', 'quiz', 'recap', 'challenge'] },
                    difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
                    estimated_minutes: { type: 'number' },
                  },
                  required: ['title', 'type'],
                },
              },
            },
            required: ['title', 'lessons'],
          },
        },
      },
      required: ['title', 'subject', 'level', 'modules'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const globalDir = getGlobalDir(context);
    const store = await loadStore(globalDir);

    const curriculum: Curriculum = {
      id: generateId(),
      title: args.title as string,
      description: (args.description as string) ?? null,
      subject: args.subject as string,
      level: args.level as string,
      goal: (args.goal as string) ?? null,
      estimated_hours: (args.estimated_hours as number) ?? null,
      status: 'active',
      progress_percent: 0,
      tags: (args.tags as string[]) ?? [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      modules: ((args.modules as Array<Record<string, unknown>>) || []).map((mod, mi) => ({
        id: generateId(),
        title: mod.title as string,
        description: (mod.description as string) ?? null,
        status: mi === 0 ? 'available' as const : 'locked' as const,
        progress_percent: 0,
        estimated_minutes: null,
        learning_objectives: (mod.learning_objectives as string[]) ?? [],
        lessons: ((mod.lessons as Array<Record<string, unknown>>) || []).map(lesson => ({
          id: generateId(),
          title: lesson.title as string,
          content: (lesson.content as string) ?? null,
          type: (lesson.type as Lesson['type']) || 'concept',
          status: 'not_started' as const,
          difficulty: (lesson.difficulty as Lesson['difficulty']) || 'medium',
          estimated_minutes: (lesson.estimated_minutes as number) ?? null,
          learning_objectives: [],
          prerequisites: [],
          resources: [],
          quiz_questions: [],
          score: null,
          attempts: 0,
          best_score: null,
          ava_feedback: null,
          completed_at: null,
          last_reviewed_at: null,
          review_count: 0,
          tags: [],
        })),
      })),
    };

    // Recalculate module estimated times
    recalculateProgress(curriculum);

    store.curriculums.unshift(curriculum);
    await saveStore(globalDir, store);

    const totalLessons = curriculum.modules.reduce((sum, m) => sum + m.lessons.length, 0);
    const totalQuizzes = curriculum.modules.reduce((sum, m) => sum + m.lessons.filter(l => l.type === 'quiz').length, 0);
    const totalMinutes = curriculum.modules.reduce((sum, m) =>
      sum + m.lessons.reduce((s, l) => s + (l.estimated_minutes || 0), 0), 0);

    return {
      success: true,
      output: `Created curriculum: "${curriculum.title}"\n` +
        `Subject: ${curriculum.subject} | Level: ${curriculum.level}\n` +
        `${curriculum.modules.length} modules, ${totalLessons} lessons, ${totalQuizzes} quizzes` +
        (totalMinutes > 0 ? ` (~${Math.round(totalMinutes / 60)}h ${totalMinutes % 60}m)` : '') +
        (curriculum.goal ? `\nGoal: ${curriculum.goal}` : '') +
        `\n\nModules:\n${curriculum.modules.map((m, i) => {
          const time = m.estimated_minutes ? ` (~${m.estimated_minutes}m)` : '';
          return `  ${i + 1}. ${m.title} (${m.lessons.length} lessons${time})`;
        }).join('\n')}` +
        `\n\nThe first module is unlocked. Now use learning_teach with action "write_content" to add ` +
        `teaching content to the first lesson, then deliver it. Build content as the user progresses — ` +
        `don't try to write all lessons at once.`,
      metadata: { id: curriculum.id, modules: curriculum.modules.length, lessons: totalLessons },
    };
  }

}

// ══════════════════════════════════════════════════════════════════════
// Tool 2: learning_teach — Ava delivers a lesson or quiz
// ══════════════════════════════════════════════════════════════════════

export class LearningTeachTool implements Tool {
  readonly name = 'learning_teach';
  readonly description = 'Deliver a lesson, write teaching content, give feedback, run a quiz, or trigger a review for the user\'s active curriculum';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'learning_teach',
    description:
      'Teach the user by delivering lesson content, providing feedback, running quizzes, or triggering reviews. ' +
      'Use this after the user says they want to continue learning or asks about a specific topic. ' +
      'Actions: deliver (present lesson), write_content (update lesson content), feedback (give feedback — ' +
      'pass or fail), quiz (run quiz questions and grade), review (spaced repetition review of completed lessons).',
    parameters: {
      type: 'object',
      properties: {
        curriculum_id: { type: 'string', description: 'ID of the curriculum' },
        lesson_id: { type: 'string', description: 'ID of the lesson to teach or update' },
        action: {
          type: 'string',
          enum: ['deliver', 'feedback', 'write_content', 'quiz', 'review'],
          description: 'deliver = present the lesson, feedback = pass/fail with feedback, write_content = update content, quiz = run quiz questions, review = spaced repetition review',
        },
        content: { type: 'string', description: 'For write_content: markdown teaching content. For feedback: Ava\'s feedback text.' },
        passed: { type: 'boolean', description: 'For feedback: did the user pass? true = completed, false = needs_review (retry)' },
        score: { type: 'number', description: 'For feedback/quiz: score 0-100' },
        quiz_answers: {
          type: 'array',
          items: { type: 'string' },
          description: 'For quiz: user\'s answers in order matching quiz_questions',
        },
      },
      required: ['curriculum_id', 'lesson_id', 'action'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const globalDir = getGlobalDir(context);
    const store = await loadStore(globalDir);

    const currId = args.curriculum_id as string;
    const lessonId = args.lesson_id as string;
    const action = args.action as string;
    const content = args.content as string | undefined;
    const passed = args.passed as boolean | undefined;
    const score = args.score as number | undefined;
    const quizAnswers = args.quiz_answers as string[] | undefined;

    const curriculum = store.curriculums.find(c => c.id === currId);
    if (!curriculum) return { success: false, output: `Curriculum not found: ${currId}` };

    let lesson: Lesson | undefined;
    let parentModule: Module | undefined;
    for (const mod of curriculum.modules) {
      lesson = mod.lessons.find(l => l.id === lessonId);
      if (lesson) { parentModule = mod; break; }
    }
    if (!lesson || !parentModule) return { success: false, output: `Lesson not found: ${lessonId}` };

    switch (action) {
      case 'deliver': {
        lesson.status = 'in_progress';
        curriculum.updated_at = new Date().toISOString();
        recalculateProgress(curriculum);
        await saveStore(globalDir, store);

        let out = `**${lesson.title}** (${lesson.type} · ${lesson.difficulty})`;
        if (lesson.estimated_minutes) out += ` · ~${lesson.estimated_minutes} min`;
        out += '\n';

        if (lesson.learning_objectives.length > 0) {
          out += '\n**After this lesson, you will:**\n';
          out += lesson.learning_objectives.map(o => `- ${o}`).join('\n');
          out += '\n';
        }

        if (lesson.content) {
          out += `\n${lesson.content}`;
        } else {
          out += `\nThis lesson has no content yet. Use action "write_content" to add teaching material.`;
        }

        if (lesson.resources.length > 0) {
          out += '\n\n**Resources:**\n';
          out += lesson.resources.map(r => `- ${r.title}${r.url ? ` — ${r.url}` : ''} [${r.type}]`).join('\n');
        }

        if (lesson.quiz_questions.length > 0 && lesson.type === 'quiz') {
          out += '\n\n**Quiz:**\n';
          out += lesson.quiz_questions.map((q, i) => {
            let qStr = `${i + 1}. ${q.question}`;
            if (q.options) qStr += '\n' + q.options.map((o, j) => `   ${String.fromCharCode(65 + j)}) ${o}`).join('\n');
            return qStr;
          }).join('\n\n');
        }

        return { success: true, output: out };
      }

      case 'write_content': {
        if (!content) return { success: false, output: 'Content is required for write_content action' };
        lesson.content = content;
        curriculum.updated_at = new Date().toISOString();
        await saveStore(globalDir, store);
        return { success: true, output: `Updated content for "${lesson.title}" (${content.length} chars)` };
      }

      case 'feedback': {
        if (content) lesson.ava_feedback = content;
        if (score !== undefined) {
          lesson.score = score;
          lesson.best_score = Math.max(lesson.best_score ?? 0, score);
        }
        lesson.attempts++;

        if (passed === false) {
          // User needs to retry
          lesson.status = 'needs_review';
          curriculum.updated_at = new Date().toISOString();
          recalculateProgress(curriculum);
          await saveStore(globalDir, store);
          return {
            success: true,
            output: `"${lesson.title}" — needs more work.` +
              (score !== undefined ? ` Score: ${score}% (attempt ${lesson.attempts})` : '') +
              `\n${content || 'Review the material and try again when ready.'}` +
              `\nThe lesson stays unlocked — tell the user they can retry anytime.`,
          };
        }

        // Passed
        lesson.status = 'completed';
        lesson.completed_at = new Date().toISOString();
        curriculum.updated_at = new Date().toISOString();
        recalculateProgress(curriculum);
        await saveStore(globalDir, store);
        return {
          success: true,
          output: `"${lesson.title}" — completed!` +
            (score !== undefined ? ` Score: ${score}%` : '') +
            (lesson.attempts > 1 ? ` (${lesson.attempts} attempts)` : '') +
            `\nCurriculum progress: ${curriculum.progress_percent}%` +
            (content ? `\n\n${content}` : ''),
        };
      }

      case 'quiz': {
        if (!quizAnswers || quizAnswers.length === 0) {
          // No answers yet — deliver the quiz
          if (lesson.quiz_questions.length === 0) {
            return { success: false, output: 'This lesson has no quiz questions. Add them with write_content or create a new quiz lesson.' };
          }
          lesson.status = 'in_progress';
          curriculum.updated_at = new Date().toISOString();
          await saveStore(globalDir, store);

          let out = `**Quiz: ${lesson.title}**\n\n`;
          out += lesson.quiz_questions.map((q, i) => {
            let qStr = `**${i + 1}.** ${q.question}`;
            if (q.options) qStr += '\n' + q.options.map((o, j) => `   ${String.fromCharCode(65 + j)}) ${o}`).join('\n');
            return qStr;
          }).join('\n\n');
          out += '\n\nAsk the user to answer each question. Then call this tool again with quiz_answers to grade.';
          return { success: true, output: out };
        }

        // Grade the quiz
        let correct = 0;
        const results: string[] = [];
        for (let i = 0; i < lesson.quiz_questions.length; i++) {
          const q = lesson.quiz_questions[i];
          const userAnswer = quizAnswers[i] || '';
          q.user_answer = userAnswer;

          // Flexible matching — case insensitive, trim, letter-to-option mapping
          const normalise = (s: string) => s.trim().toLowerCase();
          let isCorrect = normalise(userAnswer) === normalise(q.correct_answer);

          // Also accept letter answers (A, B, C, D) mapped to options
          if (!isCorrect && q.options && /^[a-d]$/i.test(userAnswer.trim())) {
            const idx = userAnswer.trim().toUpperCase().charCodeAt(0) - 65;
            if (idx >= 0 && idx < q.options.length) {
              isCorrect = normalise(q.options[idx]) === normalise(q.correct_answer);
            }
          }

          q.is_correct = isCorrect;
          if (isCorrect) correct++;

          results.push(
            `${i + 1}. ${isCorrect ? '✓' : '✗'} ${q.question}\n` +
            `   Your answer: ${userAnswer}\n` +
            (isCorrect ? '' : `   Correct: ${q.correct_answer}\n`) +
            (q.explanation ? `   ${q.explanation}` : '')
          );
        }

        const quizScore = Math.round((correct / lesson.quiz_questions.length) * 100);
        lesson.score = quizScore;
        lesson.best_score = Math.max(lesson.best_score ?? 0, quizScore);
        lesson.attempts++;

        const passThreshold = 70;
        if (quizScore >= passThreshold) {
          lesson.status = 'completed';
          lesson.completed_at = new Date().toISOString();
        } else {
          lesson.status = 'needs_review';
        }

        curriculum.updated_at = new Date().toISOString();
        recalculateProgress(curriculum);
        await saveStore(globalDir, store);

        return {
          success: true,
          output: `**Quiz Results: ${lesson.title}**\n` +
            `Score: ${quizScore}% (${correct}/${lesson.quiz_questions.length})` +
            (lesson.attempts > 1 ? ` · Attempt ${lesson.attempts} · Best: ${lesson.best_score}%` : '') +
            `\n${quizScore >= passThreshold ? '🎉 Passed!' : '📚 Needs review — 70% required to pass.'}\n\n` +
            results.join('\n\n') +
            `\n\nCurriculum progress: ${curriculum.progress_percent}%`,
        };
      }

      case 'review': {
        // Mark as reviewed for spaced repetition
        lesson.last_reviewed_at = new Date().toISOString();
        lesson.review_count++;
        curriculum.updated_at = new Date().toISOString();
        await saveStore(globalDir, store);

        let out = `**Review: ${lesson.title}** (review #${lesson.review_count})\n\n`;
        if (lesson.content) {
          out += lesson.content;
        }
        if (lesson.quiz_questions.length > 0) {
          out += '\n\n**Quick review questions:**\n';
          // Show a subset for review
          const reviewQs = lesson.quiz_questions.slice(0, 3);
          out += reviewQs.map((q, i) => `${i + 1}. ${q.question}`).join('\n');
        }
        out += '\n\nAsk the user if they remember the key concepts. Use feedback action to record how they did.';
        return { success: true, output: out };
      }

      default:
        return { success: false, output: `Unknown action: ${action}` };
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
// Tool 3: learning_progress — View and manage learning progress
// ══════════════════════════════════════════════════════════════════════

export class LearningProgressTool implements Tool {
  readonly name = 'learning_progress';
  readonly description = 'View learning progress, list curriculums, find next lesson, check review schedule, or search across learning content';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'learning_progress',
    description:
      'Check the user\'s learning progress. Can list all curriculums, show details of a specific one, ' +
      'find the next available lesson, check what needs review (spaced repetition), or search across ' +
      'all learning content by keyword/tag.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'detail', 'next_lesson', 'needs_review', 'search', 'stats'],
          description: 'list = all curriculums, detail = specific curriculum, next_lesson = next available, needs_review = spaced repetition due, search = keyword/tag search, stats = learning statistics',
        },
        curriculum_id: { type: 'string', description: 'For detail/next_lesson: which curriculum' },
        query: { type: 'string', description: 'For search: keyword or tag to search for' },
      },
      required: ['action'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const globalDir = getGlobalDir(context);
    const store = await loadStore(globalDir);

    const action = args.action as string;
    const currId = args.curriculum_id as string | undefined;
    const query = args.query as string | undefined;

    switch (action) {
      case 'list': {
        if (store.curriculums.length === 0) {
          return { success: true, output: 'No learning paths yet. Ask the user what they want to learn and create one with learning_create.' };
        }
        const list = store.curriculums.map(c => {
          const totalLessons = c.modules.reduce((s, m) => s + m.lessons.length, 0);
          const completedLessons = c.modules.reduce((s, m) => s + m.lessons.filter(l => l.status === 'completed').length, 0);
          return `- **${c.title}** (${c.subject}, ${c.level}) — ${completedLessons}/${totalLessons} lessons, ${Math.round(c.progress_percent)}% [${c.status}]\n  ${c.tags.length > 0 ? `Tags: ${c.tags.join(', ')} · ` : ''}ID: ${c.id}`;
        }).join('\n');
        return { success: true, output: `**Learning paths:**\n${list}` };
      }

      case 'detail': {
        if (!currId) return { success: false, output: 'curriculum_id is required for detail action' };
        const curriculum = store.curriculums.find(c => c.id === currId);
        if (!curriculum) return { success: false, output: `Curriculum not found: ${currId}` };

        let out = `# ${curriculum.title}\n`;
        out += `Subject: ${curriculum.subject} | Level: ${curriculum.level} | Progress: ${Math.round(curriculum.progress_percent)}%\n`;
        if (curriculum.goal) out += `Goal: ${curriculum.goal}\n`;
        if (curriculum.tags.length > 0) out += `Tags: ${curriculum.tags.join(', ')}\n`;
        out += '\n';

        for (const mod of curriculum.modules) {
          const icon = mod.status === 'completed' ? '✓' : mod.status === 'locked' ? '🔒' : '▶';
          const time = mod.estimated_minutes ? ` (~${mod.estimated_minutes}m)` : '';
          out += `${icon} **${mod.title}** (${Math.round(mod.progress_percent)}%${time})\n`;
          if (mod.learning_objectives.length > 0) {
            out += `  Objectives: ${mod.learning_objectives.join(', ')}\n`;
          }
          for (const lesson of mod.lessons) {
            const lIcon = lesson.status === 'completed' ? '  ✓'
              : lesson.status === 'needs_review' ? '  ⟳'
              : lesson.status === 'in_progress' ? '  ▶' : '  ○';
            const scoreStr = lesson.best_score !== null ? ` (best: ${lesson.best_score}%)` : '';
            const timeStr = lesson.estimated_minutes ? ` ~${lesson.estimated_minutes}m` : '';
            out += `${lIcon} ${lesson.title} [${lesson.type}·${lesson.difficulty}${timeStr}]${scoreStr} [id: ${lesson.id}]\n`;
          }
          out += '\n';
        }

        return { success: true, output: out, metadata: { id: curriculum.id } };
      }

      case 'next_lesson': {
        const curriculum = currId
          ? store.curriculums.find(c => c.id === currId)
          : store.curriculums.find(c => c.status === 'active');

        if (!curriculum) return { success: true, output: 'No active curriculum found.' };

        // Check for lessons needing review first
        const reviewDue = getLessonsForReview(curriculum);
        if (reviewDue.length > 0) {
          const r = reviewDue[0];
          return {
            success: true,
            output: `Before continuing, there's a lesson due for review:\n` +
              `Module: ${r.module.title}\n` +
              `Lesson: ${r.lesson.title} (${r.lesson.type}) — last reviewed ${r.lesson.last_reviewed_at || r.lesson.completed_at}\n` +
              `[curriculum_id: ${curriculum.id}, lesson_id: ${r.lesson.id}]\n\n` +
              `Use learning_teach with action "review" to review this lesson, or skip to the next new lesson.`,
            metadata: { curriculum_id: curriculum.id, lesson_id: r.lesson.id, is_review: true },
          };
        }

        // Find next incomplete lesson
        for (const mod of curriculum.modules) {
          if (mod.status === 'locked') continue;
          const next = mod.lessons.find(l => l.status !== 'completed');
          if (next) {
            return {
              success: true,
              output: `Next lesson in "${curriculum.title}":\n` +
                `Module: ${mod.title}\n` +
                `Lesson: ${next.title} (${next.type} · ${next.difficulty})` +
                (next.estimated_minutes ? ` ~${next.estimated_minutes}m` : '') +
                (next.status === 'needs_review' ? ' ⟳ RETRY' : '') +
                `\n[curriculum_id: ${curriculum.id}, lesson_id: ${next.id}]\n` +
                (next.learning_objectives.length > 0 ? `\nYou'll learn: ${next.learning_objectives.join(', ')}` : '') +
                (next.content ? `\n\nReady to start? Use learning_teach with action "deliver".` : '\nNo content yet — use learning_teach with action "write_content" first.'),
              metadata: { curriculum_id: curriculum.id, lesson_id: next.id, type: next.type },
            };
          }
        }

        return { success: true, output: `"${curriculum.title}" is complete! 🎉 Congratulations to the user.` };
      }

      case 'needs_review': {
        const results: string[] = [];
        for (const curr of store.curriculums) {
          if (curr.status !== 'active') continue;
          const reviews = getLessonsForReview(curr);
          if (reviews.length > 0) {
            results.push(`**${curr.title}:**`);
            for (const r of reviews) {
              results.push(`  - ${r.lesson.title} (${r.module.title}) — ${r.lesson.review_count} reviews done`);
            }
          }
        }

        if (results.length === 0) {
          return { success: true, output: 'No lessons due for review. The spaced repetition schedule is on track.' };
        }

        return { success: true, output: `**Lessons due for review:**\n${results.join('\n')}` };
      }

      case 'search': {
        if (!query) return { success: false, output: 'query is required for search action' };
        const q = query.toLowerCase();
        const results: string[] = [];

        for (const curr of store.curriculums) {
          for (const mod of curr.modules) {
            for (const lesson of mod.lessons) {
              const matches =
                lesson.title.toLowerCase().includes(q) ||
                (lesson.content || '').toLowerCase().includes(q) ||
                lesson.tags.some(t => t.toLowerCase().includes(q)) ||
                lesson.learning_objectives.some(o => o.toLowerCase().includes(q));

              if (matches) {
                results.push(`- **${lesson.title}** [${lesson.type}] in ${curr.title} > ${mod.title} [id: ${lesson.id}]`);
              }
            }
          }
        }

        if (results.length === 0) {
          return { success: true, output: `No lessons found matching "${query}".` };
        }

        return { success: true, output: `**Search results for "${query}":**\n${results.join('\n')}` };
      }

      case 'stats': {
        let totalLessons = 0;
        let completedLessons = 0;
        let totalQuizzes = 0;
        let totalScore = 0;
        let scoredQuizzes = 0;
        let totalMinutesEstimated = 0;
        let totalReviews = 0;

        for (const curr of store.curriculums) {
          for (const mod of curr.modules) {
            for (const lesson of mod.lessons) {
              totalLessons++;
              if (lesson.status === 'completed') completedLessons++;
              if (lesson.type === 'quiz') totalQuizzes++;
              if (lesson.best_score !== null) { totalScore += lesson.best_score; scoredQuizzes++; }
              if (lesson.estimated_minutes) totalMinutesEstimated += lesson.estimated_minutes;
              totalReviews += lesson.review_count;
            }
          }
        }

        return {
          success: true,
          output: `**Learning Statistics:**\n` +
            `Curriculums: ${store.curriculums.length} (${store.curriculums.filter(c => c.status === 'active').length} active)\n` +
            `Lessons: ${completedLessons}/${totalLessons} completed\n` +
            `Quizzes: ${totalQuizzes} (avg score: ${scoredQuizzes > 0 ? Math.round(totalScore / scoredQuizzes) : 'N/A'}%)\n` +
            `Estimated time: ~${Math.round(totalMinutesEstimated / 60)}h ${totalMinutesEstimated % 60}m\n` +
            `Reviews completed: ${totalReviews}`,
        };
      }

      default:
        return { success: false, output: `Unknown action: ${action}` };
    }
  }
}
