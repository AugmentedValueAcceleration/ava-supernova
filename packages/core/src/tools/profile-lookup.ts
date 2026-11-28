/**
 * profile_lookup: the detail behind the profile index (27 Nov 2026).
 *
 * The index in the system prompt says WHAT Ava can look up about the person;
 * this returns the full picture for one area when the conversation makes it
 * relevant. Read-only, local files only, no model call. Every mode has it
 * (ALWAYS_ALLOWED_TOOLS), because relevance is decided by the conversation,
 * not by the mode.
 */

import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { AVA_HOME } from '../core/constants.js';
import { MemorySession, memoryV4Root } from '../memory-v4/reader.js';
import { readProfileFiles } from '../profile/sources.js';
import { profileSectionText } from '../profile/index-builder.js';
import { PROFILE_SECTIONS, type ProfileSection, type ProfileSources } from '../profile/types.js';
import { todayLocal } from '../core/dates.js';

export class ProfileLookupTool implements Tool {
  readonly name = 'profile_lookup';
  readonly description = 'Look up what is recorded about the person in one area: learning, training, eating or projects.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'profile_lookup',
    description:
      'Read the full picture for one area of the person\'s profile, the detail behind the <profile-index> in your instructions. ' +
      'learning: their courses, progress and skills. training: goals, injuries, equipment, today\'s and tomorrow\'s sessions, plans and what they actually logged. ' +
      'eating: diet, allergies, likes and dislikes, cooking time, today\'s and tomorrow\'s meals and meal plans. ' +
      'projects: what they have been building and what was last done in each. ' +
      'Call it before answering anything about food, training, energy, injuries, their course or a project they name, ' +
      'instead of asking them for what it holds. Not for tasks unrelated to those areas.',
    parameters: {
      type: 'object',
      properties: {
        section: { type: 'string', enum: [...PROFILE_SECTIONS], description: 'Which area to read.' },
      },
      required: ['section'],
    },
  };

  constructor(private readonly opts: { home?: string; memoryRoot?: string } = {}) {}

  private async sources(): Promise<ProfileSources> {
    const home = this.opts.home ?? AVA_HOME;
    let projects: ProfileSources['projects'] = [];
    try {
      const session = await MemorySession.open({ root: this.opts.memoryRoot ?? memoryV4Root() });
      projects = await session.projectWork();
    } catch { /* no memory yet: no projects */ }
    return { ...readProfileFiles(home), projects };
  }

  async execute(args: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> {
    const section = String(args.section ?? '') as ProfileSection;
    if (!PROFILE_SECTIONS.includes(section)) {
      return { success: false, output: `section must be one of: ${PROFILE_SECTIONS.join(', ')}.` };
    }
    try {
      return { success: true, output: profileSectionText(section, await this.sources(), todayLocal()) };
    } catch (err) {
      return { success: false, output: `Could not read the profile: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}
