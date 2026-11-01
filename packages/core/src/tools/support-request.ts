import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { containsCredentials } from './security.js';

/**
 * Help the user reach the Ava team (1 Nov 2026 — support is Discord and
 * email only; accounts are going, and private tickets went with them).
 *
 * Public questions, bugs and ideas go to the Discord, where answers stay
 * searchable for the next person. Anything private — their data, a security
 * issue, a payment — becomes an email to support@avasupernova.com that Ava
 * DRAFTS and the user sends from their own mail app. Nothing leaves the
 * machine from here: the user presses send, so no confirmation is needed and
 * no account is either. A person answers every message, never Ava.
 */
export const SUPPORT_EMAIL = 'support@avasupernova.com';
export const DISCORD_INVITE = 'https://discord.gg/bbtnKMW4rf';

const CATEGORIES = ['question', 'bug', 'feature', 'privacy', 'security', 'donation', 'other'] as const;
type Category = typeof CATEGORIES[number];
const PRIVATE: ReadonlySet<Category> = new Set(['privacy', 'security', 'donation']);

/** A mailto link: the user's own mail app opens with the message written. */
export function supportMailto(subject: string, body: string): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export class SupportRequestTool implements Tool {
  readonly name = 'support_request';
  readonly description = 'Help the user contact the Ava team: the Discord for public questions, bugs and ideas; a drafted email to support@avasupernova.com for anything private. A person answers.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'support_request',
    description:
      'Help the user reach the Ava team. A PERSON answers — never say you will answer it yourself, and never ' +
      'promise a reply time. PUBLIC questions, bugs and ideas go to the Ava Supernova Discord ' +
      `(${DISCORD_INVITE} — #help, #bug-reports, #feature-requests), where answers stay searchable. ` +
      `Anything PRIVATE — their data, a security issue, a donation — becomes an email to ${SUPPORT_EMAIL}: ` +
      'draft the subject and message from the conversation; this returns the draft and a link that opens it ' +
      'in their own mail app, and THEY send it. Show them exactly what it says. Never include API keys, ' +
      'passwords or tokens. Ava has no accounts, so there is no account, login or billing to help with.',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: [...CATEGORIES],
          description:
            'question (how do I…), bug (something broken), feature (an idea) — these three go to the Discord; ' +
            'privacy (their data), security (a vulnerability or suspected compromise), donation (a payment or ' +
            'sponsorship question), other — these get an email draft.',
        },
        subject: {
          type: 'string',
          description: 'A short, specific summary — "Voice generation fails with my Qwen key", not "help". Max 200 characters.',
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

  async execute(args: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> {
    const category: Category = (CATEGORIES as readonly string[]).includes(String(args.category)) ? args.category as Category : 'other';
    const subject = String(args.subject ?? '').trim().slice(0, 200);
    const message = String(args.message ?? '').trim();

    if (!subject) return { success: false, output: 'A subject is required.' };
    if (!message) return { success: false, output: 'A message is required.' };
    if (message.length > 10_000) return { success: false, output: 'The message must be 10,000 characters or fewer.' };

    if (containsCredentials(subject) || containsCredentials(message)) {
      return {
        success: false,
        output: 'Blocked: this appears to contain an API key, token or password. Remove it — the team never needs a key to help.',
      };
    }

    if (!PRIVATE.has(category) && category !== 'other') {
      const channel = category === 'bug' ? '#bug-reports' : category === 'feature' ? '#feature-requests' : '#help';
      return {
        success: true,
        output:
          `This belongs in the Ava Supernova Discord, ${channel}: ${DISCORD_INVITE} — public, so the answer helps ` +
          `the next person too. Here is the post, ready to paste:\n\n**${subject}**\n${message}\n\n` +
          `If any of it is private after all, say so and it becomes an email to ${SUPPORT_EMAIL} instead.`,
        metadata: { channel: 'discord', discordChannel: channel, url: DISCORD_INVITE },
      };
    }

    const mailto = supportMailto(subject, message);
    return {
      success: true,
      output:
        `Private, so it goes by email to ${SUPPORT_EMAIL} — only they and the team see it. The draft is below; ` +
        `this link opens it in their mail app to check and send: ${mailto}\n\n**Subject:** ${subject}\n\n${message}\n\n` +
        'They send it, not you. A person on the team replies by email.',
      metadata: { channel: 'email', to: SUPPORT_EMAIL, subject, mailto },
    };
  }
}
