/**
 * Propose the brief for one post — before it is written, for the operator to
 * question (20 Oct 2026).
 *
 * The operator, asking for this: *"I want a discussion to happen before the
 * creation, so we decide together the vision of the post — that's a marketing
 * partner."* He is learning marketing through these conversations, so the
 * brief is where the teaching happens: who this is for, why that angle, why
 * that form. A post generated straight from a one-line angle teaches nothing
 * and carries none of what was agreed.
 *
 * Side-effect-free, and NOT a producing tool: it works in a talking turn,
 * which is exactly where a brief is discussed.
 */

import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { BriefStore, PostBrief } from '../social/index.js';

const FIELDS: Array<[keyof PostBrief, string]> = [
  ['argues', 'what it argues'],
  ['audience', 'who it is for'],
  ['angle', 'the way in'],
  ['form', 'the form'],
  ['mustLand', 'the one line it has to land'],
  ['reasoning', 'your reasoning'],
];

export class ProposeBriefTool implements Tool {
  readonly name = 'propose_brief';
  readonly description =
    'Propose the brief for one post — what it argues, who it is for, the angle, the form, the one line it must land — for the operator to question BEFORE anything is written.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'propose_brief',
    description:
      'Propose the BRIEF for one post, before it is written, so you and the operator decide its vision together. '
      + 'Open with YOUR point of view — never "what would you like this to be?", which hands the marketing thinking back '
      + 'to the person who does not do marketing. He learns by questioning a position, so give him one with its reasoning. '
      + 'Call it again with the full brief whenever the discussion changes it; the latest call replaces what is on the table. '
      + 'Do NOT write the post: he agrees the brief first, and the writing turn is given the agreed brief.',
    parameters: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: 'The story, as it stands on the plan.' },
        argues: { type: 'string', description: 'What this post ARGUES — its point, in one sentence. Not its topic.' },
        audience: { type: 'string', description: 'Who it is for, specifically enough to picture one person. "Developers" is a category; "a backend dev who tried an agent once, got burned, and stopped" is a reader.' },
        angle: { type: 'string', description: 'The way in — what makes THAT reader stop scrolling and care.' },
        form: { type: 'string', description: 'The shape — single post, thread, clip, piece to camera, still — and why that form suits this idea.' },
        mustLand: { type: 'string', description: 'The ONE line the post has to land. Everything else serves it.' },
        reasoning: { type: 'string', description: 'Why this brief: what you weighed, what you rejected and why. This is the part he learns from — teach the thinking, not only the conclusion.' },
      },
      required: ['subject', 'argues', 'audience', 'angle', 'form', 'mustLand', 'reasoning'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = context.sharedState?.briefStore as BriefStore | undefined;
    if (!store) {
      return {
        success: false,
        output: 'Briefs are not available in this context. The host must inject `briefStore` into shared state.',
      };
    }

    const str = (k: string) => (typeof args[k] === 'string' ? (args[k] as string).trim() : '');
    const brief: PostBrief = {
      subject: str('subject'),
      argues: str('argues'),
      audience: str('audience'),
      angle: str('angle'),
      form: str('form'),
      mustLand: str('mustLand'),
      reasoning: str('reasoning'),
    };

    // A brief with a hole in it is the vague brief this replaces. Say which
    // part is missing rather than accepting it and letting the writing fill it.
    const missing = FIELDS.filter(([k]) => !brief[k]).map(([, label]) => label);
    if (missing.length) {
      return {
        success: false,
        output: `The brief is missing ${missing.join(', ')}. Every part matters — a hole here is filled by guesswork when the post is written.`,
      };
    }

    try {
      await store.propose(brief);
      return {
        success: true,
        output: 'Brief proposed. He questions it before anything is written — answer with your reasoning, hold where you still think you are right, change it where he has a point. He agrees it when he is happy.',
        metadata: { subject: brief.subject },
      };
    } catch (err) {
      return { success: false, output: `Failed to propose the brief: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}
