/**
 * Authoring engine — public surface.
 *
 * Markdown(-extended) is the canonical, editable source; this module parses it
 * to a rich DocModel and renders that model to .docx / .pdf / normalized .md.
 * The heavy renderers (docx/pdfkit) are optional peers, loaded via callbacks so
 * the engine has no hard dependency on them — parsing always works, only the
 * `build` step needs the peer for that format.
 */

import type { DocModel } from './doc-model.js';
import { parseMarkdown } from './md-parse.js';
import { renderMarkdown } from './render-md.js';
import { renderDocx } from './render-docx.js';
import { renderPdf } from './render-pdf.js';

export type RenderTarget = 'docx' | 'pdf' | 'md';

export interface RenderOptions {
  /** Loads the `docx` peer (required for target 'docx'). */
  loadDocx?: () => Promise<unknown>;
  /** Loads the `pdfkit` peer (required for target 'pdf'). */
  loadPdf?: () => Promise<unknown>;
  /** Base directory for resolving relative image paths. */
  baseDir?: string;
}

/**
 * Render a parsed model to one of the supported targets. Returns a Buffer for
 * docx/pdf and a string for md. Throws a clear, actionable error when the peer
 * for the requested binary format isn't available.
 */
export async function renderDocument(model: DocModel, target: RenderTarget, opts: RenderOptions = {}): Promise<Buffer | string> {
  switch (target) {
    case 'md':
      return renderMarkdown(model);
    case 'docx':
      if (!opts.loadDocx) throw new Error('docx rendering requires the docx package. Install it with: npm install docx');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return renderDocx(model, { loadDocx: opts.loadDocx as () => Promise<any>, baseDir: opts.baseDir });
    case 'pdf':
      if (!opts.loadPdf) throw new Error('pdf rendering requires the pdfkit package. Install it with: npm install pdfkit');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return renderPdf(model, { loadPdf: opts.loadPdf as () => Promise<any>, baseDir: opts.baseDir });
  }
}

/** Parse extended Markdown straight to a rendered target in one call. */
export async function renderMarkdownSource(source: string, target: RenderTarget, opts: RenderOptions = {}): Promise<Buffer | string> {
  return renderDocument(parseMarkdown(source), target, opts);
}

export { parseMarkdown } from './md-parse.js';
export { renderMarkdown } from './render-md.js';
export { renderDocx } from './render-docx.js';
export { renderPdf } from './render-pdf.js';
export { legacyToDocModel } from './doc-model.js';
export type {
  DocModel, DocMeta, Block, Inline, ListItem, Align, CalloutVariant, BrandTokens,
} from './doc-model.js';
