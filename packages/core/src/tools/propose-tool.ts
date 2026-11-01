import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

export class ProposeToolTool implements Tool {
  readonly name = 'propose_tool';
  readonly description = 'Propose a new tool when you hit a capability gap — something you should be able to do but can\'t. Drafts the proposal as a post for the #feature-requests channel of the Ava Supernova Discord, where the team and other users see it.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'propose_tool',
    description:
      'Propose a new tool when you identify a capability gap — something you need to accomplish the ' +
      'user\'s task but cannot do with existing tools. This DRAFTS the proposal as a post for #feature-requests ' +
      'in the Ava Supernova Discord (https://discord.gg/bbtnKMW4rf) — the user posts it, and others who need ' +
      'the same thing can back it there. Nothing is sent from here and there is no reward. ' +
      'You MUST explain to the user what you\'re proposing and why before invoking this tool. ' +
      'Only propose tools that would be genuinely useful and reusable — not one-off workarounds.',
    parameters: {
      type: 'object',
      properties: {
        tool_name: {
          type: 'string',
          description:
            'A snake_case name for the proposed tool (e.g. "docker_exec", "slack_send", "pdf_read"). ' +
            'Keep it consistent with existing tool naming conventions.',
        },
        description: {
          type: 'string',
          description:
            'What the tool does — a clear, concise description suitable for an LLM tool description. ' +
            'Max 2,000 characters.',
        },
        proposed_schema: {
          type: 'object',
          description:
            'The proposed JSON Schema for the tool\'s parameters. Follow the same structure as ' +
            'existing tools: { type: "object", properties: { ... }, required: [...] }.',
        },
        risk_level: {
          type: 'string',
          enum: ['safe', 'write', 'dangerous'],
          description:
            'Proposed risk level. "safe" = read-only, "write" = modifies files/state, ' +
            '"dangerous" = arbitrary system commands or destructive potential.',
        },
        justification: {
          type: 'string',
          description:
            'Why this tool is needed — what you were trying to do, what existing tools fall short, ' +
            'and how this tool would help. Be specific about the gap. Max 5,000 characters.',
        },
        task_context: {
          type: 'string',
          description:
            'Brief description of what the user was working on when you identified this gap (optional).',
        },
      },
      required: ['tool_name', 'description', 'risk_level', 'justification'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const toolName = (args.tool_name as string)?.trim();
    const description = (args.description as string)?.trim();
    const proposedSchema = args.proposed_schema || {};
    const riskLevel = args.risk_level as string;
    const justification = (args.justification as string)?.trim();
    const taskContext = (args.task_context as string)?.trim() || undefined;

    if (!toolName) {
      return { success: false, output: 'Tool name is required.' };
    }

    if (!/^[a-z][a-z0-9_]*$/.test(toolName)) {
      return { success: false, output: 'Tool name must be snake_case (lowercase letters, numbers, underscores).' };
    }

    if (toolName.length > 100) {
      return { success: false, output: 'Tool name must be 100 characters or fewer.' };
    }

    if (!description) {
      return { success: false, output: 'Description is required.' };
    }

    if (description.length > 2000) {
      return { success: false, output: 'Description must be 2,000 characters or fewer.' };
    }

    if (!justification) {
      return { success: false, output: 'Justification is required.' };
    }

    if (justification.length > 5000) {
      return { success: false, output: 'Justification must be 5,000 characters or fewer.' };
    }

    if (!['safe', 'write', 'dangerous'].includes(riskLevel)) {
      return { success: false, output: 'Risk level must be one of: safe, write, dangerous.' };
    }

    // Accounts are going (1 Nov 2026), and with them the proposals endpoint,
    // the dashboard to track them on and the "bonus tokens" reward. Ideas live
    // where the community can see and back them: Discord #feature-requests.
    void context;
    const post = [
      `**Tool idea: \`${toolName}\`** (risk: ${riskLevel})`,
      '',
      description,
      '',
      `**Why:** ${justification}`,
      ...(taskContext ? ['', `**Where it came up:** ${taskContext}`] : []),
      ...(proposedSchema ? ['', '**Proposed parameters:**', '```json', JSON.stringify(proposedSchema, null, 2), '```'] : []),
    ].join('\n');
    return {
      success: true,
      output:
        'Drafted as a post for #feature-requests in the Ava Supernova Discord (https://discord.gg/bbtnKMW4rf). ' +
        'Show it to the user; they post it, and anyone else who needs it can back it there:\n\n' + post,
      metadata: { channel: 'discord', discordChannel: '#feature-requests', toolName },
    };
  }
}
