/**
 * Text out of a Word or PDF file — ONE place, shared by document_author and
 * document_manage, so a library change is fixed once.
 *
 * Why it exists (14 Nov 2026): reading a PDF had quietly failed everywhere —
 * pdf-parse moved to v2 and both tools still called it the v1 way.
 *
 * The libraries are loaded when needed (they are large), and a failure says
 * what happened in plain words: never "npm install", which means nothing to
 * someone writing a letter.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface OfficeText {
  text: string;
  /** PDF page count, when known. */
  pages?: number;
}

/**
 * PDF text via unpdf (15 Nov 2026, his call: "the more professional way").
 * unpdf ships a pdf.js build made for servers and bundles — no browser-only
 * globals, no worker file, no native canvas — so it reads the same in the
 * extension bundle, the IDE sidecar and on the dev host. It replaced
 * pdf-parse, whose v2 needed a DOMMatrix stand-in and a worker file copied
 * beside every bundle.
 */
export async function readPdfText(data: Uint8Array): Promise<OfficeText> {
  const { getDocumentProxy, extractText } = await import('unpdf');
  // A fresh copy: pdf.js takes ownership of (detaches) the buffer it is given.
  const pdf = await getDocumentProxy(new Uint8Array(data));
  try {
    const r = await extractText(pdf, { mergePages: true });
    return { text: r.text, pages: r.totalPages };
  } finally {
    try { await (pdf as { destroy?: () => Promise<void> }).destroy?.(); } catch { /* best effort */ }
  }
}

export async function readDocxText(path: string): Promise<OfficeText> {
  const mod: any = await import('mammoth');
  const mammoth = mod.extractRawText ? mod : mod.default;
  if (!mammoth?.extractRawText) throw new Error('The Word reader is not available in this build.');
  const r = await mammoth.extractRawText({ path });
  return { text: String(r?.value ?? '') };
}

/** A plain sentence for a reader that failed — what happened, not how to install it. */
export function unreadable(kind: 'Word' | 'PDF', file: string, err: unknown): string {
  const why = err instanceof Error ? err.message : String(err);
  return `I could not read the text of this ${kind} file (${file}): ${why}. If it is a scanned image, there is no text in it to read.`;
}
