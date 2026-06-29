import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

/**
 * Hand off a learning request from the MAIN chat to the focused Learning room.
 * Courses, study plans and guided teaching live in the Learning room — the
 * dedicated space (the "Ava" tab) where Ava builds a curriculum and teaches it
 * step by step, with the learner's progress and the course catalogue on hand.
 * When the user asks to learn a topic / wants a course in the main chat, Ava
 * calls this instead of teaching it inline; the surface renders a button that
 * takes them straight to the Learning room. Mirror of OpenHealthRoomTool.
 */
export class OpenLearningRoomTool implements Tool {
  readonly name = 'open_learning_room';
  readonly description =
    'Hand the user to the focused Learning room to build a study plan and start a guided course. Use in the main chat when they ask to learn a topic or want a course — it shows a button that takes them there; do not build the curriculum or teach it in the main chat.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'open_learning_room',
    description:
      'Offer the user a one-tap jump to the Learning room (the focused Ava space for courses & teaching, with their progress + the course catalogue). ' +
      'Call this in the main chat when they ask to learn something or want a course / study plan — the room is where curriculums are built and taught. ' +
      'Pair it with a short, warm one-liner; do NOT attempt to build the curriculum or run the lesson yourself in the main chat.',
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'What they want to learn, so the button can name it (e.g. "Rust ownership"). Omit if unclear.',
        },
        primer: {
          type: 'string',
          description:
            "The user's specific request, written in the FIRST PERSON as their opening message to the Learning room — capture the real detail they gave (level, goal, constraints), e.g. \"I want to learn Rust ownership and borrowing; I already know C and I'm comfortable with pointers.\" When they tap through, the room sends this for them so Ava picks up the thread with full context instead of starting cold. Omit only if they gave no specifics.",
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
      output: 'Offered a jump to the Learning room.',
    };
  }
}
