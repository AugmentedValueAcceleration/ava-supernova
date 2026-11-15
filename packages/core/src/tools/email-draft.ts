/**
 * Email Draft Tool — draft an email, and save it as a document when asked
 * (Word, PDF, OpenDocument or Markdown, by the file name), through the one
 * document engine.
 */

import { extname } from 'node:path';
import { validatePath } from './security.js';
import { documentPathFor } from './authoring/document-places.js';
import { writeDocumentFromMarkdown } from './authoring/export-document.js';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

export class EmailDraftTool implements Tool {
  readonly name = 'email_draft';
  readonly description = 'Draft an email with structured content, tone control, and .docx file output.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'email_draft',
    description: 'Draft a professional email. Supports tone control (formal, casual, brief) and structured sections. Returns the text, and can save it as a Word, PDF, OpenDocument or Markdown file.',
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
        save_to: { type: 'string', description: 'Optional: save it as a document — .docx, .pdf, .odt or .md by the name, e.g. "client-update.docx". A bare name is saved in the project documents/ folder, where the Library shows it.' },
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

    // Build plain text for display/return
    const emailText = this.buildPlainText(to, subject, body, signOff, senderName);

    // If no save path, just return the text
    if (!saveTo) {
      return {
        success: true,
        output: emailText,
        metadata: { to, subject, tone },
      };
    }

    // Inside the project; a bare name goes to documents/, where the Library shows it.
    let absolutePath: string;
    try { absolutePath = validatePath(documentPathFor(saveTo), context.cwd); } catch (e) { return { success: false, output: (e as Error).message }; }

    // One engine for every document (15 Nov 2026): the draft is written as
    // Markdown and turned into the format its file name asks for.
    const lines = [`**To:** ${to}`, '', `**Subject:** ${subject}`, '', body.trim(), '', `${signOff}${senderName ? `,  \n${senderName}` : ''}`];
    const markdown = `---\ntitle: ${JSON.stringify(subject)}\nstyle: letter\n---\n\n${lines.join('\n')}\n`;
    try {
      const out = await writeDocumentFromMarkdown(markdown, absolutePath);
      return {
        success: true,
        output: `Email draft saved: ${out.path}\n\n${emailText}`,
        metadata: { path: out.path, to, subject, tone, format: extname(out.path).slice(1) },
      };
    } catch (err) {
      return { success: false, output: `Failed to save email draft: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  private buildPlainText(to: string, subject: string, body: string, signOff: string, senderName?: string): string {
    const lines: string[] = [];
    lines.push(`To: ${to}`);
    lines.push(`Subject: ${subject}`);
    lines.push('');
    lines.push(body);
    lines.push('');
    lines.push(signOff + (senderName ? `,\n${senderName}` : ''));
    return lines.join('\n');
  }

}
