// Progression export — builds branded certificate + CV documents from the
// derived progression, and renders them to PDF via the shared authoring engine.
// Kept OUT of ./index.ts (the webview-safe barrel) because it pulls the docx/pdf
// renderers; the host imports it via @ava/core/learning/export.

import { renderMarkdownSource } from '../tools/authoring/index.js';

// The pure Markdown builders live in ./progression-markdown.ts (no node deps so
// the webview can import them via @ava/core/learning); re-exported here so the
// host's existing `@ava/core/learning/export` import surface is unchanged.
export { buildCertificateMarkdown, buildCvMarkdown, type CvInput } from './progression-markdown.js';

// pdfkit is an optional peer of @ava/core (installed); loaded lazily only when
// an export actually runs, so importing this module never eagerly pulls it.
async function loadPdf(): Promise<unknown> {
  // @ts-ignore — pdfkit types may be absent
  return import('pdfkit');
}

/** Render progression Markdown to a branded PDF buffer. */
export async function renderProgressionPdf(markdown: string): Promise<Buffer> {
  const out = await renderMarkdownSource(markdown, 'pdf', { loadPdf });
  return out as Buffer;
}
