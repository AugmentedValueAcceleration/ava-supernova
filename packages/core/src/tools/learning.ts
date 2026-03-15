import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

/**
 * Learning tools — Ava creates, teaches, and tracks learning paths through conversation.
 * Data is stored locally in ~/.ava/learning.json and synced to platform when connected.
 */

// ── Types ────────────────────────────────────────────────────────────

interface Lesson {
  id: string;
  title: string;
  content: string | null;
  type: 'concept' | 'exercise' | 'project' | 'quiz' | 'recap';
  status: 'not_started' | 'in_progress' | 'completed';
  score: number | null;
  ava_feedback: string | null;
}

interface Module {
  id: string;
  title: string;
  description: string | null;
  status: 'locked' | 'available' | 'in_progress' | 'completed';
  progress_percent: number;
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
      : completed > 0 ? 'in_progress'
      : mod.status === 'locked' ? 'locked' : 'available';
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
      'Create a learning curriculum after assessing the user\'s level and goals through conversation. ' +
      'You should ask the user what they want to learn, their current level, and their goals BEFORE ' +
      'calling this tool. Then build a structured curriculum with modules and lessons.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Curriculum title (e.g., "Python Fundamentals")' },
        description: { type: 'string', description: 'Brief description of what the curriculum covers' },
        subject: { type: 'string', description: 'Subject area (e.g., "Python", "Machine Learning")' },
        level: { type: 'string', enum: ['beginner', 'intermediate', 'advanced', 'mixed'], description: 'Difficulty level' },
        goal: { type: 'string', description: 'What the user wants to achieve' },
        estimated_hours: { type: 'number', description: 'Estimated total hours to complete' },
        modules: {
          type: 'array',
          description: 'Ordered list of modules, each with lessons',
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
                    type: { type: 'string', enum: ['concept', 'exercise', 'project', 'quiz', 'recap'] },
                    content: { type: 'string', description: 'Teaching content in markdown' },
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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      modules: ((args.modules as Array<Record<string, unknown>>) || []).map((mod, mi) => ({
        id: generateId(),
        title: mod.title as string,
        description: (mod.description as string) ?? null,
        status: mi === 0 ? 'available' as const : 'locked' as const,
        progress_percent: 0,
        lessons: ((mod.lessons as Array<Record<string, unknown>>) || []).map(lesson => ({
          id: generateId(),
          title: lesson.title as string,
          content: (lesson.content as string) ?? null,
          type: (lesson.type as Lesson['type']) || 'concept',
          status: 'not_started' as const,
          score: null,
          ava_feedback: null,
        })),
      })),
    };

    store.curriculums.unshift(curriculum);
    await saveStore(globalDir, store);

    const totalLessons = curriculum.modules.reduce((sum, m) => sum + m.lessons.length, 0);

    // Sync to platform if connected
    await this.syncToPlatform(context, curriculum);

    return {
      success: true,
      output: `Created curriculum: "${curriculum.title}"\n` +
        `Subject: ${curriculum.subject} | Level: ${curriculum.level}\n` +
        `${curriculum.modules.length} modules, ${totalLessons} lessons` +
        (curriculum.estimated_hours ? ` (~${curriculum.estimated_hours}h)` : '') +
        `\n\nModules:\n${curriculum.modules.map((m, i) => `  ${i + 1}. ${m.title} (${m.lessons.length} lessons)`).join('\n')}` +
        `\n\nThe first module is unlocked and ready. Tell the user they can start whenever they're ready.`,
      metadata: { id: curriculum.id, modules: curriculum.modules.length, lessons: totalLessons },
    };
  }

  private async syncToPlatform(context: ToolExecutionContext, curriculum: Curriculum): Promise<void> {
    const platformKey = context.sharedState?.platformKey as string | undefined;
    if (!platformKey) return;
    try {
      const res = await fetch('https://ava-supernova.com/api/learning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${platformKey}` },
        body: JSON.stringify({
          title: curriculum.title,
          description: curriculum.description,
          subject: curriculum.subject,
          level: curriculum.level,
          goal: curriculum.goal,
          estimated_hours: curriculum.estimated_hours,
          modules: curriculum.modules.map(m => ({
            title: m.title,
            description: m.description,
            lessons: m.lessons.map(l => ({ title: l.title, type: l.type, content: l.content })),
          })),
        }),
      });
      if (!res.ok) { /* fire and forget */ }
    } catch { /* ignore */ }
  }
}

// ══════════════════════════════════════════════════════════════════════
// Tool 2: learning_teach — Ava delivers a lesson or quiz
// ══════════════════════════════════════════════════════════════════════

export class LearningTeachTool implements Tool {
  readonly name = 'learning_teach';
  readonly description = 'Deliver a lesson, write teaching content, give feedback, or run a quiz for the user\'s active curriculum';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'learning_teach',
    description:
      'Teach the user by delivering lesson content, providing feedback, or running assessments. ' +
      'Use this after the user says they want to continue learning or asks about a specific topic ' +
      'in their curriculum. Can write/update lesson content and provide feedback.',
    parameters: {
      type: 'object',
      properties: {
        curriculum_id: { type: 'string', description: 'ID of the curriculum' },
        lesson_id: { type: 'string', description: 'ID of the lesson to teach or update' },
        action: {
          type: 'string',
          enum: ['deliver', 'feedback', 'write_content'],
          description: 'deliver = present the lesson, feedback = give feedback on user work, write_content = update lesson content',
        },
        content: { type: 'string', description: 'For write_content: the markdown teaching content. For feedback: Ava\'s feedback text.' },
        score: { type: 'number', description: 'For feedback on quizzes: score 0-100' },
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
    const score = args.score as number | undefined;

    const curriculum = store.curriculums.find(c => c.id === currId);
    if (!curriculum) return { success: false, output: `Curriculum not found: ${currId}` };

    let lesson: Lesson | undefined;
    for (const mod of curriculum.modules) {
      lesson = mod.lessons.find(l => l.id === lessonId);
      if (lesson) break;
    }
    if (!lesson) return { success: false, output: `Lesson not found: ${lessonId}` };

    switch (action) {
      case 'deliver':
        lesson.status = 'in_progress';
        curriculum.updated_at = new Date().toISOString();
        recalculateProgress(curriculum);
        await saveStore(globalDir, store);
        return {
          success: true,
          output: lesson.content
            ? `Lesson: ${lesson.title}\nType: ${lesson.type}\n\n${lesson.content}`
            : `Lesson "${lesson.title}" has no content yet. Use action "write_content" to add teaching material.`,
        };

      case 'write_content':
        if (!content) return { success: false, output: 'Content is required for write_content action' };
        lesson.content = content;
        curriculum.updated_at = new Date().toISOString();
        await saveStore(globalDir, store);
        return { success: true, output: `Updated content for "${lesson.title}" (${content.length} chars)` };

      case 'feedback':
        if (content) lesson.ava_feedback = content;
        if (score !== undefined) lesson.score = score;
        lesson.status = 'completed';
        curriculum.updated_at = new Date().toISOString();
        recalculateProgress(curriculum);
        await saveStore(globalDir, store);
        return {
          success: true,
          output: `Feedback recorded for "${lesson.title}"` +
            (score !== undefined ? ` — Score: ${score}%` : '') +
            `\nCurriculum progress: ${curriculum.progress_percent}%`,
        };

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
  readonly description = 'View learning progress, list curriculums, or get the next lesson to study';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'learning_progress',
    description:
      'Check the user\'s learning progress. Can list all curriculums, show details of a specific one, ' +
      'or find the next available lesson. Use this when the user asks about their learning, ' +
      'wants to continue studying, or you need to know where they left off.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'detail', 'next_lesson'],
          description: 'list = show all curriculums, detail = show specific curriculum, next_lesson = find next available lesson',
        },
        curriculum_id: { type: 'string', description: 'For detail/next_lesson: which curriculum' },
      },
      required: ['action'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const globalDir = getGlobalDir(context);
    const store = await loadStore(globalDir);

    const action = args.action as string;
    const currId = args.curriculum_id as string | undefined;

    switch (action) {
      case 'list': {
        if (store.curriculums.length === 0) {
          return { success: true, output: 'No learning paths yet. Ask the user what they want to learn and create one with learning_create.' };
        }
        const list = store.curriculums.map(c =>
          `- ${c.title} (${c.subject}, ${c.level}) — ${Math.round(c.progress_percent)}% complete [${c.status}] [id: ${c.id}]`
        ).join('\n');
        return { success: true, output: `Learning paths:\n${list}` };
      }

      case 'detail': {
        if (!currId) return { success: false, output: 'curriculum_id is required for detail action' };
        const curriculum = store.curriculums.find(c => c.id === currId);
        if (!curriculum) return { success: false, output: `Curriculum not found: ${currId}` };

        let out = `# ${curriculum.title}\n`;
        out += `Subject: ${curriculum.subject} | Level: ${curriculum.level} | Progress: ${Math.round(curriculum.progress_percent)}%\n`;
        if (curriculum.goal) out += `Goal: ${curriculum.goal}\n`;
        out += '\n';

        for (const mod of curriculum.modules) {
          const icon = mod.status === 'completed' ? '✓' : mod.status === 'locked' ? '🔒' : '▶';
          out += `${icon} Module: ${mod.title} (${Math.round(mod.progress_percent)}%)\n`;
          for (const lesson of mod.lessons) {
            const lIcon = lesson.status === 'completed' ? '  ✓' : lesson.status === 'in_progress' ? '  ▶' : '  ○';
            out += `${lIcon} ${lesson.title} [${lesson.type}] [id: ${lesson.id}]\n`;
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

        for (const mod of curriculum.modules) {
          if (mod.status === 'locked') continue;
          const next = mod.lessons.find(l => l.status !== 'completed');
          if (next) {
            return {
              success: true,
              output: `Next lesson in "${curriculum.title}":\n` +
                `Module: ${mod.title}\n` +
                `Lesson: ${next.title} (${next.type})\n` +
                `[curriculum_id: ${curriculum.id}, lesson_id: ${next.id}]\n\n` +
                (next.content ? `Content preview: ${next.content.slice(0, 200)}...` : 'No content yet — use learning_teach to deliver this lesson.'),
              metadata: { curriculum_id: curriculum.id, lesson_id: next.id, type: next.type },
            };
          }
        }

        return { success: true, output: `"${curriculum.title}" is complete! Congratulations to the user.` };
      }

      default:
        return { success: false, output: `Unknown action: ${action}` };
    }
  }
}
