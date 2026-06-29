import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

/**
 * Hand off a plan request from the MAIN chat to the focused Health room.
 * Fitness / meal / combined plans are built in the Health room — the dedicated
 * space with the exercise + recipe library and the user's health profile loaded.
 * When the user asks for one in the main chat, Ava calls this instead of trying
 * to build it here; the surface renders a button that takes them straight to the
 * Health room (the "Ava" tab in Health). Clean handoff, right place to build.
 */
export class OpenHealthRoomTool implements Tool {
  readonly name = 'open_health_room';
  readonly description =
    'Hand the user to the focused Health room to build a fitness / meal / combined plan. Use in the main chat when they ask for a workout or meal plan — it shows a button that takes them there; do not build the plan in the main chat.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'open_health_room',
    description:
      'Offer the user a one-tap jump to the Health room (the focused Ava space for health & fitness, with the catalogue + their profile). ' +
      'Call this in the main chat when they ask you to build a fitness, meal, or combined plan — the room is where plans are built. ' +
      'Pair it with a short, warm one-liner; do NOT attempt to build the plan yourself in the main chat.',
    parameters: {
      type: 'object',
      properties: {
        plan_type: {
          type: 'string',
          enum: ['fitness', 'meal', 'combined'],
          description: 'Which kind of plan they asked for, so the button can name it. Omit if unclear.',
        },
        primer: {
          type: 'string',
          description:
            "The user's specific request, written in the FIRST PERSON as their opening message to the Health room — capture the real detail they gave (goal, schedule, equipment, dietary needs, injuries), e.g. \"Build me a 4-day strength plan; I train at home with dumbbells and a pull-up bar, and I'm working around a dodgy left knee.\" When they tap through, the room sends this for them so Ava picks up the thread with full context instead of starting cold. Omit only if they gave no specifics.",
        },
      },
      required: [],
    },
  };

  async execute(_args: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> {
    // The surface renders the handoff button from the tool call; the tool body
    // just confirms the offer was shown.
    return {
      success: true,
      output: 'Offered a jump to the Health room.',
    };
  }
}
