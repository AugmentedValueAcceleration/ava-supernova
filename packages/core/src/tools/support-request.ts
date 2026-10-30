import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { containsCredentials } from './security.js';

/**
 * Open a private support TICKET (30 Oct 2026 — one ticket system replaced the
 * old chat-style conversations). Every ticket is answered by a person: Ava's
 * part is to help write it and send it, never to answer it.
 *
 * Tickets belong to an account, so this needs the platform key. Without one
 * the user is pointed to the Discord for public questions; email support for
 * people without an account comes later.
 */
const CATEGORIES = ['question', 'bug', 'feature', 'account', 'billing', 'privacy', 'security', 'other'] as const;

export class SupportRequestTool implements Tool {
  readonly name = 'support_request';
  readonly description = 'Open a PRIVATE support ticket with the Ava team, answered by a person. Public questions, bugs and ideas go to the Ava Supernova Discord first; use this for anything private (account, billing, personal data, security) or when the user would rather not post publicly.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'support_request',
    description:
      'Open a PRIVATE support ticket with the Ava team. A PERSON answers every ticket — never say you will ' +
      'answer it yourself, and never promise a reply time. For public questions, bugs and ideas, point the ' +
      'user to the Ava Supernova Discord first (https://discord.gg/bbtnKMW4rf — #help, #bug-reports, ' +
      '#feature-requests), where answers stay searchable. Use this ticket for anything private — account, ' +
      'billing, personal data, a security issue — or when the user would rather not post publicly. ' +
      'Draft the subject, category and message from the conversation, SHOW the user exactly what will be ' +
      'sent, and only send once they confirm. Never include API keys, passwords or tokens.',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: [...CATEGORIES],
          description:
            'question (how do I…), bug (something broken), feature (an idea), account (login, keys, profile), ' +
            'billing (plans, credits, payments), privacy (their data — export, deletion, what is stored), ' +
            'security (a vulnerability or a suspected compromise), other (anything else).',
        },
        subject: {
          type: 'string',
          description: 'A short, specific summary — "Can\'t sign in after changing email", not "help". Max 200 characters.',
        },
        message: {
          type: 'string',
          description:
            'The full detail: what they were doing, what happened, what they expected, any error text, and ' +
            'their surface and version (extension or IDE) when relevant. Max 10,000 characters.',
        },
      },
      required: ['category', 'subject', 'message'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const category = (CATEGORIES as readonly string[]).includes(String(args.category)) ? String(args.category) : 'other';
    const subject = String(args.subject ?? '').trim().slice(0, 200);
    const message = String(args.message ?? '').trim();

    if (!subject) return { success: false, output: 'A subject is required.' };
    if (!message) return { success: false, output: 'A message is required.' };
    if (message.length > 10_000) return { success: false, output: 'The message must be 10,000 characters or fewer.' };

    if (containsCredentials(subject) || containsCredentials(message)) {
      return {
        success: false,
        output: 'Blocked: the ticket appears to contain an API key, token or password. Remove it before sending — the team never needs a key to help.',
      };
    }

    const platformKey = context.sharedState?.platformKey as string | undefined;
    if (!platformKey) {
      return {
        success: false,
        output:
          'A private ticket needs the user to be signed in to their Ava Supernova account, and they are not. ' +
          'Tell them so plainly. For a public question, bug or idea, the Discord works without signing in: ' +
          'https://discord.gg/bbtnKMW4rf. Do not ask them to paste anything private into Discord.',
      };
    }

    const apiBase = (context.sharedState?.platformApiBase as string) || 'https://avasupernova.com';
    try {
      const response = await fetch(`${apiBase}/api/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${platformKey}` },
        body: JSON.stringify({ category, subject, message, source: 'ava' }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        return { success: false, output: `The ticket was not sent: ${errorData.error || `HTTP ${response.status}`}` };
      }

      const data = await response.json() as { ticket?: { ref_label?: string } };
      const ref = data.ticket?.ref_label || 'a new ticket';
      return {
        success: true,
        output:
          `Ticket ${ref} is open. A person on the Ava team will answer it — not you. They will be emailed ` +
          `when there is a reply, and can follow it in Help → Support (or Support in their dashboard on the ` +
          `website). Tell them the reference and that it is private: only they and the team can see it.`,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, output: `The ticket was not sent: ${msg}` };
    }
  }
}
