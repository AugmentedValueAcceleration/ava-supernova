import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

/**
 * Offer the user a task you've noticed — as a tappable card, NOT a silent write.
 *
 * This is the heart of "Ava suggests, you decide": when something task-worthy
 * comes up in conversation, Ava proposes it through this tool. The host renders
 * a card in the chat with Add / Edit & add / Dismiss; the task only lands on the
 * user's board if they tap Add. Nothing is persisted otherwise.
 *
 * Like `ask_user` / `health_profile_ask`, the body is bypassed: the host renders
 * the card, the user decides, and the host creates the task (on Add) and returns
 * the outcome as the tool result.
 *
 * Use `task_manage` create ONLY when the user explicitly asks to add a task
 * ("add X to my list"). For anything you merely *noticed*, use this — it keeps
 * the user in control of their own board.
 */
export class TaskSuggestTool implements Tool {
  readonly name = 'task_suggest';
  readonly description =
    'Offer the user a task you noticed, as a card they can Add / edit / dismiss. Use this — not task_manage create — whenever you spot a task-worthy thing in conversation; it never writes to their list without a tap.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'task_suggest',
    description:
      'Suggest a task to the user as a tap-to-add card (it is NOT added until they tap Add). ' +
      'This is your DEFAULT when you notice a task-worthy thing in conversation ("I should call the dentist", "we need to renew the licence by Friday"). ' +
      'Only use task_manage create instead when the user explicitly tells you to add a task. ' +
      'Propose a clean, complete task — fill in due date/time, recurrence, reminder and subtasks when the conversation gives them. One suggestion per item; if they dismiss it, drop it.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short, clear task title.' },
        note: { type: 'string', description: 'Optional one-line note / description for the task.' },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'urgent'],
          description: 'Priority (default: medium).',
        },
        category: {
          type: 'string',
          description: 'Free-form category — personal, admin, health, finance, errands, home, coding… Pick what fits; most users are not coders.',
        },
        due_date: { type: 'string', description: 'Due date YYYY-MM-DD — only if the conversation gives a real date.' },
        due_time: { type: 'string', description: 'Due time HH:MM (24h) — only if a real time was mentioned ("at 6").' },
        reminder: {
          type: 'string',
          enum: ['at_time', '10m', '30m', '1h', '1d'],
          description: 'Reminder lead before due (only if reminding makes sense). Needs a due_date.',
        },
        recurrence: {
          type: 'string',
          enum: ['none', 'daily', 'weekdays', 'weekly', 'monthly'],
          description: 'Recurrence if it repeats (default none).',
        },
        subtasks: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional checklist of subtask titles if the task naturally breaks into steps.',
        },
      },
      required: ['title'],
    },
  };

  async execute(_args: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> {
    // Normally bypassed — the host's confirmation handler creates the task (on
    // Add) and returns the outcome. This fallback runs only if a surface has no
    // task-suggestion bridge wired.
    return { success: true, output: 'Task suggestion shown.' };
  }
}
