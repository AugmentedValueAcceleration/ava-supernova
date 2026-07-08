import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

/**
 * Hand off any creative request from the MAIN chat to the focused Creative
 * Studio. Creative generation — icons, images, short videos, voiceovers — is
 * done in the Studio, the dedicated space with the shape library, brand kit,
 * canvas, Open Canvas and the Design Architect. When the user asks for one of
 * these in the main chat, Ava calls this instead of generating it here; the
 * surface renders a button that takes them straight there. Mirror of
 * OpenHealthRoomTool / OpenLearningRoomTool.
 */
export class OpenDesignStudioTool implements Tool {
  readonly name = 'open_design_studio';
  readonly description =
    'Hand the user to the focused Creative Studio to make a creative asset — an icon, image, short video, or voiceover. Use in the main chat when they ask for any of these; it shows a button that takes them there. Do not try to generate it in the main chat.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'open_design_studio',
    description:
      'Offer the user a one-tap jump to the Creative Studio (the focused space for creative work — icons with the ' +
      'shape library and brand kit, plus images, short videos and voiceovers on the Open Canvas, with the Design ' +
      'Architect). Call this in the main chat when they ask you to make an icon, image, video or voiceover — the ' +
      'Studio is where these are built. Pair it with a short, warm one-liner; do NOT attempt to generate the asset ' +
      'yourself in the main chat.',
    parameters: {
      type: 'object',
      properties: {
        primer: {
          type: 'string',
          description:
            "The user's specific request, written in the FIRST PERSON as their opening message to the Design " +
            'Studio — capture the real detail (subject, material, colour, where it lives), e.g. "Make me a metal ' +
            'camera icon in my brand purple for the app nav." When they tap through, the Studio sends this so Ava ' +
            'picks up the thread with full context instead of starting cold. Omit only if they gave no specifics.',
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
      output: 'Offered a jump to the Design Studio.',
    };
  }
}
