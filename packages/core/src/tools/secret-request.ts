import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

/**
 * Capability-style secret access.
 *
 * Ava calls this tool when she needs an API key or other secret. The host
 * shows the user a grant prompt listing matching vault entries; on approval
 * the host loads the value into its in-memory working set and returns an
 * opaque handle of the form `{{secret:<id>}}` to Ava.
 *
 * The handle — never the value — flows through the conversation. Downstream
 * tool calls (env_write, http_request, bash) reference the handle in their
 * args; the host substitutes the real value at execution time, so secrets
 * never appear in conversation history, model context, or chat persistence.
 */
export class SecretRequestTool implements Tool {
  readonly name = 'secret_request';
  readonly description = "Request access to a secret from the user's vault. Returns an opaque handle (never the value itself) that you can pass into other tools — env_write, http_request, bash — and the host substitutes the real value at execution time.";
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'secret_request',
    description:
      'Ask the user to grant a secret from their vault for use in subsequent tool calls. ' +
      'The user picks which vault entry to grant. You receive an opaque handle like {{secret:abc123}} — pass that handle (NOT the raw value) into env_write/http_request/bash arguments. ' +
      'The host substitutes the real value at execution time, so secrets never enter conversation history. ' +
      'Use a `label` that identifies what the secret is for (e.g. "STRIPE_SECRET_KEY", "OPENAI_KEY"). ' +
      'Provide a `reason` explaining what you need it for so the user can decide knowledgeably.',
    parameters: {
      type: 'object',
      properties: {
        label: {
          type: 'string',
          description: 'What the secret is for, e.g. "STRIPE_SECRET_KEY". Shown verbatim in the grant prompt.',
        },
        reason: {
          type: 'string',
          description: 'One sentence explaining what you need the secret for. Surfaced in the grant prompt so the user can decide.',
        },
      },
      required: ['label'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const label = typeof args.label === 'string' ? args.label.trim() : '';
    const reason = typeof args.reason === 'string' ? args.reason.trim() : undefined;

    if (!label) {
      return { success: false, output: 'secret_request requires a non-empty `label`.' };
    }

    if (!context.secretGranter) {
      return {
        success: false,
        output:
          'Secret vault is not available in this host. Use a different approach (ask the user to provide the value via ask_user, or document the env var name in instructions).',
      };
    }

    try {
      const grant = await context.secretGranter(label, reason);
      if (!grant) {
        return {
          success: true,
          output:
            `Grant denied for "${label}". The user did not approve this secret. Continue without it — ask if a different approach is acceptable.`,
        };
      }
      return {
        success: true,
        output:
          `Granted. Use handle {{secret:${grant.id}}} in subsequent tool args. ` +
          `Vault label: "${grant.label}". The handle is scoped to this chat session and will be wiped on new chat.`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Grant flow failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
