import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

export class ProposeToolTool implements Tool {
  readonly name = 'propose_tool';
  readonly description = 'Propose a new tool when you hit a capability gap — something you should be able to do but can\'t. The proposal is reviewed by the development team and may be built. Include: what the tool would do, why it\'s needed, and example use cases. This is how Ava evolves.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'propose_tool',
    description:
      'Propose a new tool when you identify a capability gap — something you need to accomplish the ' +
      'user\'s task but cannot do with existing tools. The proposal is sent to the Ava development team ' +
      'for review. The user who triggered this proposal may receive bonus tokens as a reward. ' +
      'You MUST explain to the user what you\'re proposing and why before invoking this tool. ' +
      'Only propose tools that would be genuinely useful and reusable — not one-off workarounds.',
    parameters: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description:
            'The user\'s email address (for crediting the proposal). Ask the user if not known.',
        },
        name: {
          type: 'string',
          description: 'The user\'s name (optional, for crediting).',
        },
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
      required: ['email', 'tool_name', 'description', 'risk_level', 'justification'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const email = (args.email as string)?.trim();
    const name = (args.name as string)?.trim() || undefined;
    const toolName = (args.tool_name as string)?.trim();
    const description = (args.description as string)?.trim();
    const proposedSchema = args.proposed_schema || {};
    const riskLevel = args.risk_level as string;
    const justification = (args.justification as string)?.trim();
    const taskContext = (args.task_context as string)?.trim() || undefined;

    // Validate
    if (!email || !email.includes('@')) {
      return { success: false, output: 'A valid email address is required to credit the proposal.' };
    }

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

    // Get the API base URL
    const apiBase = (context.sharedState?.platformApiBase as string) || 'https://ava-supernova.com';
    const platformKey = context.sharedState?.platformKey as string | undefined;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (platformKey) {
        headers['Authorization'] = `Bearer ${platformKey}`;
      }

      const response = await fetch(`${apiBase}/api/tool-proposals`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email,
          name,
          tool_name: toolName,
          description,
          proposed_schema: proposedSchema,
          risk_level: riskLevel,
          justification,
          task_context: taskContext,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = (errorData as Record<string, string>).error || `HTTP ${response.status}`;
        return { success: false, output: `Failed to submit tool proposal: ${errorMsg}` };
      }

      const result = await response.json() as Record<string, unknown>;

      if (result.duplicate) {
        return {
          success: true,
          output:
            `This tool ("${toolName}") has already been proposed by another user! ` +
            `Your vote has been recorded (now ${result.vote_count} votes). ` +
            `The more users who need this tool, the higher priority it gets. ` +
            `The user who triggered this will be credited if the tool is implemented.`,
        };
      }

      const proposalId = (result.id as string)?.slice(0, 8) || 'unknown';

      return {
        success: true,
        output:
          `Tool proposal submitted successfully (ID: ${proposalId}).\n\n` +
          `**Proposed tool:** \`${toolName}\`\n` +
          `**Risk level:** ${riskLevel}\n` +
          `**Status:** Pending review\n\n` +
          `The Ava development team will review this proposal. ` +
          `If approved and implemented, ${email} will receive bonus tokens as a thank-you. ` +
          `You can track proposals at ${apiBase}/dashboard.`,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, output: `Failed to submit tool proposal: ${msg}` };
    }
  }
}
