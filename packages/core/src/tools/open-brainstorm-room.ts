import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

/**
 * Hand off from the main chat to the Brainstorm room (plan
 * 2026-11-17-brainstorm, Phase 3) — the focused space where a fragment of an
 * idea becomes ideas, a plan and an experience, all kept and visible beside the
 * chat. Mirror of open_learning_room: the surface renders a button; tapping it
 * opens the room on a NEW brainstorm and sends the primer as its first message,
 * so the thread continues instead of starting cold.
 *
 * Since 17 Nov 2026 the room is the ONLY place brainstorming happens — it is no
 * longer a main-chat mode — so this is how Code, Plan and Chat get there.
 */
export class OpenBrainstormRoomTool implements Tool {
  readonly name = 'open_brainstorm_room';
  readonly description =
    'Hand the user to the Brainstorm room to work an idea through properly — its ideas, plan and experience kept and visible beside the chat. Shows a button that takes them there.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'open_brainstorm_room',
    description:
      'Offer a one-tap jump to the Brainstorm room (the focused space where an idea — a project, a feature, an experience or a direction — '
      + 'becomes ideas, a plan and an experience, kept beside the chat). Brainstorming lives there, not in the main chat: use it whenever '
      + 'they want to brainstorm or work an idea through. Pair it with one warm line. A passing question about an idea you can just answer.',
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'What the brainstorm is about, so the button can name it. Omit if unclear.' },
        primer: {
          type: 'string',
          description:
            'Their idea so far, written in the FIRST PERSON as their opening message to the room — the real detail they gave '
            + '(the fragment, what it is for, how it should feel), e.g. "I want a budgeting app that feels calm — money stresses me out." '
            + 'When they tap through, the room sends this for them so the thread continues. Omit only if they gave no specifics.',
        },
      },
      required: [],
    },
  };

  async execute(_args: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> {
    return { success: true, output: 'Offered a jump to the Brainstorm room.' };
  }
}
