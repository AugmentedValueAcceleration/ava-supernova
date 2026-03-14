import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

export class TodoWriteTool implements Tool {
  readonly name = 'todo_write';
  readonly description = 'Create or update a visual task list for tracking progress';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'todo_write',
    description:
      'Create or update a visual task list. Call this when starting multi-step work ' +
      'and update it as you complete steps. The user sees it as a live card with status indicators. ' +
      'Always pass the full list on each call (replaces previous state).',
    parameters: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          description: 'The complete task list (replaces any previous list)',
          items: {
            type: 'object',
            properties: {
              content: {
                type: 'string',
                description: 'Task description in imperative form (e.g. "Fix linting errors")',
              },
              status: {
                type: 'string',
                enum: ['pending', 'in_progress', 'completed'],
                description: 'Current status of this task',
              },
              activeForm: {
                type: 'string',
                description: 'Present-continuous form shown while running (e.g. "Fixing linting errors")',
              },
            },
            required: ['content', 'status', 'activeForm'],
          },
        },
      },
      required: ['todos'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const todos = args.todos as Array<{ content: string; status: string; activeForm?: string }>;
    const done = todos.filter((t) => t.status === 'completed').length;
    const lines = todos.map((t) => {
      const icon = t.status === 'completed' ? '[x]' : t.status === 'in_progress' ? '[~]' : '[ ]';
      return `${icon} ${t.content}`;
    });

    // Persist to TaskManager if available (session tasks)
    const taskManager = context.sharedState?.taskManager as
      | { addSessionTask: (t: { id: string; title: string; status: 'todo' | 'in-progress' | 'done' }) => void } | undefined;
    if (taskManager) {
      for (const todo of todos) {
        const statusMap: Record<string, 'todo' | 'in-progress' | 'done'> = {
          pending: 'todo',
          in_progress: 'in-progress',
          completed: 'done',
        };
        taskManager.addSessionTask({
          id: `session-${todo.content.slice(0, 40).replace(/\s+/g, '-').toLowerCase()}`,
          title: todo.content,
          status: statusMap[todo.status] ?? 'todo',
        });
      }
    }

    return {
      success: true,
      output: `Tasks updated (${done}/${todos.length} done):\n${lines.join('\n')}`,
    };
  }
}
