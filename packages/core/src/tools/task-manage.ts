import { randomUUID } from 'node:crypto';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { TaskManager, TaskCreateOptions } from '../tasks/task-manager.js';
import type { TaskEntry, TaskReminderLead, TaskSubtask } from '../tasks/types.js';

/** Map the tool's reminder enum to minutes-before-due. */
const REMINDER_TO_MINUTES: Record<string, TaskReminderLead> = {
  at_time: 0, '10m': 10, '30m': 30, '1h': 60, '1d': 1440,
};

/** Turn a list of subtask titles into TaskSubtask rows. */
function toSubtasks(value: unknown): TaskSubtask[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const titles = value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  if (titles.length === 0) return undefined;
  return titles.map(title => ({ id: randomUUID(), title: title.trim(), done: false }));
}

export class TaskManageTool implements Tool {
  readonly name = 'task_manage';
  readonly description = 'Manage the user\'s personal task list — list, create, complete, update, delete tasks';
  // Write actions on the operator's personal task list need explicit
  // consent — Ava was creating tasks unprompted from tangential mentions
  // in conversation. Set requiresConfirmation true at the tool level;
  // list/complete prompts are mild friction, create/update/delete
  // prompts are the whole point. Operators who want to skip prompts on
  // list calls can use the per-tool always-allow permission.
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'task_manage',
    description:
      'Manage the user\'s personal task list. Use this to help users organize their work and life — ' +
      'coding tasks, meetings, personal errands, anything. This is their persistent task system, not your session progress. ' +
      'Actions: list (view tasks), create (add a task), complete (mark done), update (change details), delete (remove). ' +
      'Tasks persist across sessions and can sync to the cloud. ' +
      'Proactive use: when the user mentions an obligation, deadline, or thing-to-do in conversation, offer to capture it ' +
      '("Want me to add that as a task?") and only create on explicit yes. Don\'t silently create tasks the user didn\'t agree to.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'create', 'complete', 'update', 'delete'],
          description: 'The action to perform',
        },
        // For create
        title: {
          type: 'string',
          description: 'Task title (required for create, optional for update)',
        },
        description: {
          type: 'string',
          description: 'Task description (optional)',
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'urgent'],
          description: 'Priority level (default: medium)',
        },
        category: {
          type: 'string',
          description: 'Category — a free-form label. Common ones: personal, coding, admin, meeting, health, finance, errands, study, home — but use ANY label that fits the task (e.g. "fitness", "garden", "kids"). Pick from the content: software work → coding, paperwork/accounts → admin, calls/appointments → meeting. Most users are NOT coders; only use "coding" for actual software work. Default: personal.',
        },
        due_date: {
          type: 'string',
          description: 'Due date in YYYY-MM-DD format. Only set this when the user gives a real date or deadline — never invent one. Leave unset for tasks with no due date.',
        },
        due_time: {
          type: 'string',
          description: 'Time of day the task is due, in 24h HH:MM (e.g. "18:00"). Only when the user gives a real time ("call mum at 6"). Needs a due_date to anchor to.',
        },
        reminder: {
          type: 'string',
          enum: ['at_time', '10m', '30m', '1h', '1d'],
          description: 'Fire a reminder this far before the task is due: at_time, 10m, 30m, 1h, or 1d before. Only set when the user wants reminding. Needs a due_date.',
        },
        subtasks: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional checklist — a list of subtask titles to break the task into steps.',
        },
        recurrence: {
          type: 'string',
          enum: ['none', 'daily', 'weekdays', 'weekly', 'monthly'],
          description: 'Recurrence: none, daily, weekdays (Mon–Fri), weekly (same weekday), or monthly (same date). Default: none.',
        },
        scope: {
          type: 'string',
          enum: ['project', 'global'],
          description: 'Where to store: project (this workspace) or global (all projects). Default: project',
        },
        // For complete, update, delete
        task_id: {
          type: 'string',
          description: 'Task ID (required for complete, update, delete)',
        },
        // For list
        status_filter: {
          type: 'string',
          enum: ['all', 'active', 'done', 'today'],
          description: 'Filter tasks by status (default: active)',
        },
      },
      required: ['action'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const taskManager = context.sharedState?.taskManager as TaskManager | undefined;
    if (!taskManager) {
      return { success: false, output: 'Task manager not available.' };
    }

    const action = args.action as string;

    switch (action) {
      case 'list':
        return this.handleList(taskManager, args);
      case 'create':
        return this.handleCreate(taskManager, args);
      case 'complete':
        return this.handleComplete(taskManager, args);
      case 'update':
        return this.handleUpdate(taskManager, args);
      case 'delete':
        return this.handleDelete(taskManager, args);
      default:
        return { success: false, output: `Unknown action: ${action}` };
    }
  }

  private async handleList(tm: TaskManager, args: Record<string, unknown>): Promise<ToolResult> {
    const filter = (args.status_filter as string) || 'active';

    let tasks: TaskEntry[];
    if (filter === 'today') {
      tasks = await tm.getTodayTasks();
    } else if (filter === 'done') {
      tasks = await tm.listTasks({ status: ['done'] });
    } else if (filter === 'all') {
      tasks = await tm.listTasks({ includeArchived: true });
    } else {
      // active = todo + in-progress
      tasks = await tm.listTasks({ status: ['todo', 'in-progress'] });
    }

    if (tasks.length === 0) {
      return { success: true, output: `No ${filter} tasks found.` };
    }

    const lines = tasks.map(t => {
      const icon = t.status === 'done' ? '[x]' : t.status === 'in-progress' ? '[~]' : '[ ]';
      const parts = [`${icon} ${t.title}`];
      if (t.priority === 'urgent' || t.priority === 'high') parts.push(`(${t.priority})`);
      if (t.dueDate) parts.push(`due: ${t.dueDate}`);
      if (t.category !== 'coding') parts.push(`[${t.category}]`);
      if (t.recurrence !== 'none') parts.push(`(${t.recurrence})`);
      parts.push(`  id: ${t.id}`);
      return parts.join(' ');
    });

    return {
      success: true,
      output: `${tasks.length} ${filter} task${tasks.length === 1 ? '' : 's'}:\n${lines.join('\n')}`,
    };
  }

  private async handleCreate(tm: TaskManager, args: Record<string, unknown>): Promise<ToolResult> {
    const title = args.title as string | undefined;
    if (!title) {
      return { success: false, output: 'Missing required field: title' };
    }

    const reminder = args.reminder as string | undefined;
    const opts: TaskCreateOptions = {
      title,
      description: args.description as string | undefined,
      priority: (args.priority as TaskCreateOptions['priority']) ?? 'medium',
      // Neutral default — most users aren't coders. Ava picks the fitting
      // category from the task content (see schema); fall back to personal.
      category: (args.category as TaskCreateOptions['category']) ?? 'personal',
      // No auto due-date — a task only lands in "Today" if the user gave a
      // real deadline. Auto-stamping today polluted the Today view.
      dueDate: args.due_date as string | undefined,
      dueTime: args.due_time as string | undefined,
      reminderLead: reminder ? REMINDER_TO_MINUTES[reminder] : undefined,
      subtasks: toSubtasks(args.subtasks),
      recurrence: (args.recurrence as TaskCreateOptions['recurrence']) ?? 'none',
      scope: (args.scope as 'project' | 'global') ?? 'project',
      source: 'ava',
    };

    const entry = await tm.addTask(opts);

    const parts = [`Task created: "${entry.title}"`];
    if (entry.priority !== 'medium') parts.push(`(${entry.priority})`);
    if (entry.dueDate) parts.push(`due: ${entry.dueDate}`);
    if (entry.category !== 'coding') parts.push(`[${entry.category}]`);
    parts.push(`\nid: ${entry.id}`);

    return { success: true, output: parts.join(' ') };
  }

  private async handleComplete(tm: TaskManager, args: Record<string, unknown>): Promise<ToolResult> {
    const taskId = args.task_id as string | undefined;
    if (!taskId) {
      return { success: false, output: 'Missing required field: task_id' };
    }

    const entry = await tm.completeTask(taskId);
    if (!entry) {
      return { success: false, output: `Task not found: ${taskId}` };
    }

    return { success: true, output: `Task completed: "${entry.title}"` };
  }

  private async handleUpdate(tm: TaskManager, args: Record<string, unknown>): Promise<ToolResult> {
    const taskId = args.task_id as string | undefined;
    if (!taskId) {
      return { success: false, output: 'Missing required field: task_id' };
    }

    const updates: Record<string, unknown> = {};
    if (args.title !== undefined) updates.title = args.title;
    if (args.description !== undefined) updates.description = args.description;
    if (args.priority !== undefined) updates.priority = args.priority;
    if (args.category !== undefined) updates.category = args.category;
    if (args.due_date !== undefined) updates.dueDate = args.due_date;
    if (args.due_time !== undefined) updates.dueTime = args.due_time;
    if (args.reminder !== undefined) {
      updates.reminderLead = REMINDER_TO_MINUTES[args.reminder as string];
    }
    if (args.subtasks !== undefined) {
      const subs = toSubtasks(args.subtasks);
      if (subs) updates.subtasks = subs;
    }
    if (args.recurrence !== undefined) updates.recurrence = args.recurrence;

    if (Object.keys(updates).length === 0) {
      return { success: false, output: 'No fields to update. Provide title, description, priority, category, due_date, due_time, reminder, subtasks, or recurrence.' };
    }

    const entry = await tm.updateTask(taskId, updates);
    if (!entry) {
      return { success: false, output: `Task not found: ${taskId}` };
    }

    return { success: true, output: `Task updated: "${entry.title}"` };
  }

  private async handleDelete(tm: TaskManager, args: Record<string, unknown>): Promise<ToolResult> {
    const taskId = args.task_id as string | undefined;
    if (!taskId) {
      return { success: false, output: 'Missing required field: task_id' };
    }

    const deleted = await tm.deleteTask(taskId);
    if (!deleted) {
      return { success: false, output: `Task not found: ${taskId}` };
    }

    return { success: true, output: `Task deleted.` };
  }
}
