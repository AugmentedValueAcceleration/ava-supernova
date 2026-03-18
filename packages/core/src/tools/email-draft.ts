/**
 * Email Draft Tool — Draft emails as native .docx files.
 *
 * Uses the `docx` library to generate real Word documents with
 * tone-aware formatting. Falls back to markdown if docx is not installed.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

export class EmailDraftTool implements Tool {
  readonly name = 'email_draft';
  readonly description = 'Draft an email with structured content, tone control, and .docx file output.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'email_draft',
    description: 'Draft a professional email. Supports tone control (formal, casual, brief) and structured sections. Can save to .docx file or return as text.',
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
        save_to: { type: 'string', description: 'Optional: file path to save. Save to documents/ for Library access (e.g. "documents/emails/client-update.docx")' },
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

    const absolutePath = saveTo.startsWith('/') || saveTo.includes(':')
      ? saveTo
      : join(context.cwd, saveTo);

    // Try native .docx generation
    try {
      const { Document, Packer, Paragraph, TextRun } = await import('docx');
      return await this.generateDocx(
        { Document, Packer, Paragraph, TextRun },
        absolutePath, to, subject, body, tone, signOff, senderName, emailText,
      );
    } catch {
      // docx not available — fall back to plain text
      return await this.generateTextFallback(absolutePath, to, subject, tone, emailText);
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

  private async generateDocx(
    docxLib: { Document: any; Packer: any; Paragraph: any; TextRun: any },
    absolutePath: string,
    to: string,
    subject: string,
    body: string,
    tone: string,
    signOff: string,
    senderName: string | undefined,
    emailText: string,
  ): Promise<ToolResult> {
    const { Document, Packer, Paragraph, TextRun } = docxLib;

    // Tone-based font selection
    const isSerif = tone === 'formal' || tone === 'assertive';
    const fontFace = isSerif ? 'Times New Roman' : 'Calibri';
    const bodyFontSize = isSerif ? 24 : 22; // half-points (24 = 12pt, 22 = 11pt)

    // Split body into paragraphs
    const bodyParagraphs = body.split(/\n\n+/).filter(p => p.trim());

    const children: any[] = [];

    // "To:" field
    children.push(new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({ text: 'To: ', bold: true, font: fontFace, size: bodyFontSize }),
        new TextRun({ text: to, font: fontFace, size: bodyFontSize }),
      ],
    }));

    // "Subject:" field
    children.push(new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({ text: 'Subject: ', bold: true, font: fontFace, size: bodyFontSize }),
        new TextRun({ text: subject, font: fontFace, size: bodyFontSize }),
      ],
    }));

    // Horizontal rule (thin border paragraph)
    children.push(new Paragraph({
      spacing: { after: 200 },
      border: {
        bottom: { color: '999999', space: 1, style: 'single' as any, size: 6 },
      },
    }));

    // Body paragraphs
    for (const para of bodyParagraphs) {
      // Handle single newlines within a paragraph as line breaks
      const lines = para.split('\n');
      const runs: any[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (i > 0) {
          runs.push(new TextRun({ text: '', break: 1, font: fontFace, size: bodyFontSize }));
        }
        runs.push(new TextRun({ text: lines[i], font: fontFace, size: bodyFontSize }));
      }

      children.push(new Paragraph({
        spacing: { after: 160 },
        children: runs,
      }));
    }

    // Spacer before sign-off
    children.push(new Paragraph({ spacing: { after: 80 } }));

    // Sign-off
    const signOffRuns: any[] = [
      new TextRun({ text: signOff + (senderName ? ',' : ''), font: fontFace, size: bodyFontSize }),
    ];
    if (senderName) {
      signOffRuns.push(new TextRun({ text: '', break: 1, font: fontFace, size: bodyFontSize }));
      signOffRuns.push(new TextRun({ text: senderName, font: fontFace, size: bodyFontSize }));
    }
    children.push(new Paragraph({ children: signOffRuns }));

    const doc = new Document({
      sections: [{
        properties: {},
        children,
      }],
    });

    // Ensure output path ends with .docx
    let outputPath = absolutePath;
    if (!outputPath.toLowerCase().endsWith('.docx')) {
      outputPath = outputPath.replace(/\.[^.]+$/, '.docx');
      if (!outputPath.toLowerCase().endsWith('.docx')) {
        outputPath += '.docx';
      }
    }

    try {
      await mkdir(dirname(outputPath), { recursive: true });
      const buffer = await Packer.toBuffer(doc);
      await writeFile(outputPath, buffer);

      return {
        success: true,
        output: `Email draft saved as .docx: ${outputPath}\n\n${emailText}`,
        metadata: { path: outputPath, to, subject, tone, format: 'docx' },
      };
    } catch (err) {
      return { success: false, output: `Failed to save email draft: ${err}` };
    }
  }

  private async generateTextFallback(
    absolutePath: string,
    to: string,
    subject: string,
    tone: string,
    emailText: string,
  ): Promise<ToolResult> {
    // Keep original path but warn about missing library
    let outputPath = absolutePath;
    if (outputPath.toLowerCase().endsWith('.docx')) {
      outputPath = outputPath.replace(/\.docx$/i, '.txt');
    }

    try {
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, emailText, 'utf-8');

      return {
        success: true,
        output: `Email draft saved as text (docx library not available — install with: pnpm add docx): ${outputPath}\n\n${emailText}`,
        metadata: { path: outputPath, to, subject, tone, format: 'text', fallback: true },
      };
    } catch (err) {
      return { success: false, output: `Failed to save draft: ${err}` };
    }
  }
}
