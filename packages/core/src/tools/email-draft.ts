/**
 * Email Draft Tool — Draft emails from context.
 *
 * Generates structured email content using memory, tasks, and journal
 * for context. Outputs formatted text ready to send.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

export class EmailDraftTool implements Tool {
  readonly name = 'email_draft';
  readonly description = 'Draft an email with structured content, tone control, and optional file output.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'email_draft',
    description: 'Draft a professional email. Supports tone control (formal, casual, brief) and structured sections. Can save to file or return as text.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient name or email' },
        subject: { type: 'string', description: 'Email subject line' },
        body: { type: 'string', description: 'Email body content (markdown supported)' },
        tone: {
          type: 'string',
          enum: ['formal', 'casual', 'brief', 'friendly', 'assertive'],
          description: 'Writing tone (default: formal)',
        },
        template: {
          type: 'string',
          enum: ['status-update', 'request', 'follow-up', 'introduction', 'thank-you', 'custom'],
          description: 'Email template (default: custom)',
        },
        sign_off: { type: 'string', description: 'Closing phrase (default: "Best regards")' },
        sender_name: { type: 'string', description: 'Your name for the sign-off' },
        save_to: { type: 'string', description: 'Optional: file path to save the draft' },
      },
      required: ['to', 'subject', 'body'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const to = args.to as string;
    const subject = args.subject as string;
    const body = args.body as string;
    const tone = (args.tone as string) || 'formal';
    const signOff = (args.sign_off as string) || 'Best regards';
    const senderName = args.sender_name as string | undefined;
    const saveTo = args.save_to as string | undefined;

    if (!to || !subject || !body) {
      return { success: false, output: 'to, subject, and body are required.' };
    }

    // Build formatted email
    const lines: string[] = [];
    lines.push(`**To:** ${to}`);
    lines.push(`**Subject:** ${subject}`);
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(body);
    lines.push('');
    lines.push(signOff + (senderName ? `,\n${senderName}` : ''));

    const emailText = lines.join('\n');

    // Optionally save to file
    if (saveTo) {
      const absolutePath = saveTo.startsWith('/') || saveTo.includes(':')
        ? saveTo
        : join(context.cwd, saveTo);

      try {
        await mkdir(dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, emailText, 'utf-8');
        return {
          success: true,
          output: `Email draft saved to ${absolutePath}\n\n${emailText}`,
          metadata: { path: absolutePath, to, subject, tone },
        };
      } catch (err) {
        return { success: false, output: `Failed to save draft: ${err}` };
      }
    }

    return {
      success: true,
      output: emailText,
      metadata: { to, subject, tone },
    };
  }
}
