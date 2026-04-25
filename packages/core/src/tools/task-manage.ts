import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { TaskManager, TaskCreateOptions } from '../tasks/task-manager.js';
import type { TaskEntry } from '../tasks/types.js';

export class TaskManageTool implements Tool {
  readonly name = 'task_manage';
  readonly description = 'Manage the user\'s personal task list — list, create, complete, update, delete tasks';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

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
          enum: ['coding', 'personal', 'admin', 'meeting', 'custom'],
          description: 'Category (default: coding)',
        },
        due_date: {
          type: 'string',
          description: 'Due date in YYYY-MM-DD format (optional)',
        },
        recurrence: {
          type: 'string',
          enum: ['none', 'daily', 'weekly'],
          description: 'Recurrence pattern (default: none)',
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

    const opts: TaskCreateOptions = {
      title,
      description: args.description as string | undefined,
      priority: (args.priority as TaskCreateOptions['priority']) ?? 'medium',
      category: (args.category as TaskCreateOptions['category']) ?? 'coding',
      dueDate: (args.due_date as string | undefined) ?? new Date().toISOString().slice(0, 10),
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
    if (args.recurrence !== undefined) updates.recurrence = args.recurrence;

    if (Object.keys(updates).length === 0) {
      return { success: false, output: 'No fields to update. Provide title, description, priority, category, due_date, or recurrence.' };
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
