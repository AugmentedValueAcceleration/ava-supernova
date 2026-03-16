import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { containsCredentials } from './security.js';

export class SupportRequestTool implements Tool {
  readonly name = 'support_request';
  readonly description = 'Submit a support ticket to the Ava team on behalf of the user';
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
            'A short summary of the issue (max 500 chars). Be clear and specific.',
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
      required: ['email', 'subject', 'message', 'category'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const email = (args.email as string)?.trim();
    const name = (args.name as string)?.trim() || undefined;
    const subject = (args.subject as string)?.trim();
    const message = (args.message as string)?.trim();
    const category = (args.category as string)?.trim() || 'other';

    if (!email || !email.includes('@')) {
      return { success: false, output: 'A valid email address is required.' };
    }

    if (!subject) {
      return { success: false, output: 'Subject is required.' };
    }

    if (!message) {
      return { success: false, output: 'Message is required.' };
    }

    if (subject.length > 500) {
      return { success: false, output: 'Subject must be 500 characters or fewer.' };
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
    const apiBase = (context.sharedState?.platformApiBase as string) || 'https://ava-supernova.com';
    const platformKey = context.sharedState?.platformKey as string | undefined;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (platformKey) {
        headers['Authorization'] = `Bearer ${platformKey}`;
      }

      const response = await fetch(`${apiBase}/api/support`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email,
          name,
          subject,
          message,
          source: 'tool',
          category,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = (errorData as Record<string, string>).error || `HTTP ${response.status}`;
        return { success: false, output: `Failed to submit support ticket: ${errorMsg}` };
      }

      const ticket = await response.json();
      const ticketId = (ticket as Record<string, string>).id?.slice(0, 8) || 'unknown';

      return {
        success: true,
        output:
          `Support ticket submitted successfully (ID: ${ticketId}).\n\n` +
          `The Ava team will review your request and reply to ${email}. ` +
          `You can also track your ticket at ${apiBase}/dashboard/support.`,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, output: `Failed to submit support ticket: ${msg}` };
    }
  }
}
