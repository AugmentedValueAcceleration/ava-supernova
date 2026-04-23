// Minimal ambient module declaration for pdfkit — @types/pdfkit exists on
// DefinitelyTyped but drags in node's canvas/fs surface that we don't want
// to pin. We only use PDFDocument's event emitter + text/end methods, so a
// narrow shim is enough to satisfy strict typecheck.
declare module 'pdfkit' {
  class PDFDocument {
    constructor(opts?: Record<string, unknown>);
    on(event: 'data', listener: (chunk: Buffer) => void): this;
    on(event: 'end', listener: () => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
    text(text: string): this;
    end(): void;
  }
  export default PDFDocument;
}
