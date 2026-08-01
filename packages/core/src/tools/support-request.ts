import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { containsCredentials } from './security.js';

export class SupportRequestTool implements Tool {
  readonly name = 'support_request';
  readonly description = 'Submit a support ticket to the Ava development team. Use when the user reports a bug you can\'t fix, requests a feature, or needs help that\'s beyond your capabilities. Captures the user\'s email, issue description, and category.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'support_request',
    description:
      'Submit a support ticket to the Ava team. Use this when the user needs help with something ' +
      'you cannot resolve — bugs, account issues, feature requests, billing questions, or any problem ' +
      'that requires human support. You MUST confirm the details with the user before sending. ' +
      'Always categorise the ticket based on the issue type. ' +
      'The user\'s email is required so the team can reply. If the user has a platform account, ' +
      'their email may already be available in shared state.',
    parameters: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description:
            'The user\'s email address for receiving replies. Ask the user if not known.',
        },
        name: {
          type: 'string',
          description: 'The user\'s name (optional).',
        },
        subject: {
          type: 'string',
          description:
            'Optional short summary. If omitted, auto-generated from the first line of the message.',
        },
        message: {
          type: 'string',
          description:
            'Detailed description of the issue, including relevant context like ' +
            'error messages, steps to reproduce, environment info, etc. (max 10,000 chars).',
        },
        category: {
          type: 'string',
          enum: ['bug', 'feature', 'question', 'account', 'feedback', 'teach', 'other'],
          description:
            'The type of support request. Categorise based on what the user is reporting: ' +
            'bug (something broken), feature (feature request), question (how do I...), ' +
            'account (billing/login/API keys), feedback (general feedback), ' +
            'teach (Teach mode specific), other (anything else).',
        },
      },
      required: ['email', 'message', 'category'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const email = (args.email as string)?.trim();
    const name = (args.name as string)?.trim() || undefined;
    const message = (args.message as string)?.trim();
    const category = (args.category as string)?.trim() || 'other';
    const subject = (args.subject as string)?.trim() || (message ? message.slice(0, 80) + (message.length > 80 ? '...' : '') : '');

    if (!email || !email.includes('@')) {
      return { success: false, output: 'A valid email address is required.' };
    }

    if (!message) {
      return { success: false, output: 'Message is required.' };
    }

    if (message.length > 10_000) {
      return { success: false, output: 'Message must be 10,000 characters or fewer.' };
    }

    // Block credential submission
    if (containsCredentials(subject) || containsCredentials(message)) {
      return {
        success: false,
        output: 'Blocked: the message appears to contain API keys, tokens, or credentials. ' +
          'Please remove sensitive data before submitting a support ticket.',
      };
    }

    // Get the API base URL — prefer platform config, fall back to default
    const apiBase = (context.sharedState?.platformApiBase as string) || 'https://avasupernova.com';
    const platformKey = context.sharedState?.platformKey as string | undefined;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (platformKey) {
        headers['Authorization'] = `Bearer ${platformKey}`;
      }

      // Try live chat conversations API first, fall back to legacy tickets
      const response = await fetch(`${apiBase}/api/support/conversations`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: `[${category}] ${subject}\n\n${message}\n\nContact: ${email}${name ? ` (${name})` : ''}`,
          platform: 'tool',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = (errorData as Record<string, string>).error || `HTTP ${response.status}`;
        return { success: false, output: `Failed to submit support request: ${errorMsg}` };
      }

      const data = await response.json();
      const convId = (data as Record<string, any>).conversation?.id?.slice(0, 8) || 'unknown';

      return {
        success: true,
        output:
          `Support conversation started (ID: ${convId}).\n\n` +
          `Ava is looking into your request right now. If she can't help, ` +
          `the team will jump in. You can track the conversation in the ` +
          `Support section of your dashboard.`,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, output: `Failed to submit support ticket: ${msg}` };
    }
  }
}
