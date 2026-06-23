import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { HEALTH_PROFILE_FIELD_IDS } from '../health/profile-fields.js';

/**
 * Ask the user to fill ONE health-profile field through a structured control —
 * the same goal cards / chips / number inputs the profile page uses — instead
 * of free text. Health-room only. Like `ask_user`, the body is bypassed: the
 * host renders the field's card, the user answers, the host saves the value to
 * the General / Health profile and returns a confirmation as the tool result.
 *
 * This is the "Ava sets up your profile" flow — she asks for gaps one field at
 * a time, each answer saves as the user taps, and she sees what landed.
 */
export class HealthProfileAskTool implements Tool {
  readonly name = 'health_profile_ask';
  readonly description =
    'Ask the user to fill one health-profile field via a structured control (goal cards, equipment chips, a number box) and save it. Use in the Health room when the profile is missing something you need.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'health_profile_ask',
    description:
      'Ask the user for ONE missing health-profile field through a tap-friendly card (not free text), and save their answer to their profile. ' +
      'Use this in the Health room when the profile is thin and you need a detail to tailor a plan — ask one field at a time, in a natural order, and only for gaps. ' +
      'The user picks/taps an answer; it saves immediately and the result comes back to you. Do not ask for fields the profile already has.',
    parameters: {
      type: 'object',
      properties: {
        field: {
          type: 'string',
          enum: HEALTH_PROFILE_FIELD_IDS,
          description:
            'Which profile field to ask for. General/body: sex, date_of_birth, height_cm, weight_kg. ' +
            'Health: goal, weekly_focus, allergens, dietary, equipment, injuries, minutes_per_day. ' +
            'Food & taste: likes, dislikes, cuisines.',
        },
        question: {
          type: 'string',
          description: 'Your natural, warm one-line question for this field, in your own voice (e.g. "What\'s your main goal right now?").',
        },
      },
      required: ['field', 'question'],
    },
  };

  async execute(_args: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> {
    // Normally bypassed — the host's confirmation handler saves the answer and
    // returns a confirmation string. This fallback runs only if a surface has
    // no profile-fill bridge wired.
    return {
      success: true,
      output: 'Profile question shown.',
    };
  }
}
