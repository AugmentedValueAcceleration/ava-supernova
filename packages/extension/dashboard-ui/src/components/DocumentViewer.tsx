// The document viewer (Documents 1.0 Part 4, mockup approved 15 Nov 2026 —
// "i love the design"). Opens in its OWN TAB in both apps: a VS Code editor
// tab in the extension, a file tab in the IDE. Read-only, and everything
// stays on the computer: the file's bytes come from the host, nothing is
// fetched or uploaded.
//
//   PDF          → pdf.js (Mozilla): pages, thumbnails, zoom, search
//   Word (.docx) → docx-preview: the real page layout
//   .xlsx / .csv → a grid with sheet tabs and a formula bar (read by the host)
//   anything else → "Open in your app"
//
// ONE SHARED FILE: identical in the extension and the IDE apart from the
// import lines. Inline styles, so it looks the same in both.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { tt, useLocale } from '../i18n';
import type { ViewSheet } from '../../../../core/dist/tools/authoring/sheet-view.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

export type ViewerKind = 'pdf' | 'docx' | 'sheet' | 'other';

export function viewerKind(name: string): ViewerKind {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'xlsx' || ext === 'csv') return 'sheet';
  return 'other';
}

export type ViewerSource =
  | { kind: 'pdf' | 'docx'; bytes: Uint8Array }
  | { kind: 'sheet'; sheets: ViewSheet[] }
  | { kind: 'other' }
  | { kind: 'error'; message: string };

const BORDER = '1px solid #2e2442';
const btn: CSSProperties = { height: 32, padding: '0 12px', borderRadius: 6, border: '1px solid #3a2d55', background: 'transparent', color: '#cdd6f4', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer' };
const iconBtn: CSSProperties = { ...btn, width: 32, padding: 0 };
const primary: CSSProperties = { ...btn, border: 'none', background: 'var(--accent, #a855f7)', color: '#fff', fontWeight: 600 };
const ZOOMS = [50, 67, 80, 100, 125, 150, 200];

export function DocumentViewer({ name, folder, source, onOpenInApp, onShowInFolder }: {
  name: string;
  /** Where it lives, relative to the project ("documents"). */
  folder?: string;
  /** null while the host is still reading the file. */
  source: ViewerSource | null;
  onOpenInApp: () => void;
  onShowInFolder: () => void;
}) {
  useLocale();
  const [zoom, setZoom] = useState(100);
  const [pages, setPages] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [goTo, setGoTo] = useState<{ n: number; at: number } | null>(null);
  const [found, setFound] = useState<string>('');
  const searchRef = useRef<((q: string) => Promise<number[]>) | null>(null);

  const kindLabel = source?.kind === 'pdf' ? 'PDF' : source?.kind === 'docx' ? 'Word' : source?.kind === 'sheet' ? tt('viewer.spreadsheet', 'Spreadsheet') : '';
  const detail = [
    kindLabel,
    source?.kind === 'pdf' && pages ? tt('viewer.pages', '{n} pages').replace('{n}', String(pages)) : '',
    source?.kind === 'sheet' ? tt('viewer.sheets', '{n} sheets').replace('{n}', String(source.sheets.length)) : '',
    folder ? `${folder}/` : '',
  ].filter(Boolean).join(' · ');

  const zoomBy = (d: number) => setZoom((z) => ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, ZOOMS.indexOf(z) + d))] ?? 100);

  const runSearch = async () => {
    const q = query.trim();
    if (!q || !searchRef.current) { setFound(''); return; }
    const hits = await searchRef.current(q);
    if (!hits.length) { setFound(tt('viewer.no_match', 'Not found')); return; }
    const next = hits.find((p) => p > page) ?? hits[0];
    setGoTo({ n: next, at: Date.now() });
    setFound(tt('viewer.found_pages', 'On page {pages}').replace('{pages}', hits.slice(0, 8).join(', ') + (hits.length > 8 ? '…' : '')));
  };

  return (
    <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', background: '#0b0912', color: '#cdd6f4', fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: BORDER, background: '#110d1a', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexGrow: 1, minWidth: 160 }}>
          <span style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
          <span style={{ fontSize: 11, color: '#a6adc8' }}>{detail}</span>
        </div>
        {source?.kind === 'pdf' && pages != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <button type="button" aria-label={tt('viewer.prev_page', 'Previous page')} style={iconBtn} onClick={() => setGoTo({ n: Math.max(1, page - 1), at: Date.now() })}>‹</button>
            <span style={{ minWidth: 64, textAlign: 'center' }}>{page} / {pages}</span>
            <button type="button" aria-label={tt('viewer.next_page', 'Next page')} style={iconBtn} onClick={() => setGoTo({ n: Math.min(pages, page + 1), at: Date.now() })}>›</button>
          </div>
        )}
        {(source?.kind === 'pdf' || source?.kind === 'docx') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <button type="button" aria-label={tt('viewer.zoom_out', 'Zoom out')} style={iconBtn} onClick={() => zoomBy(-1)}>−</button>
            <span style={{ minWidth: 48, textAlign: 'center' }}>{zoom}%</span>
            <button type="button" aria-label={tt('viewer.zoom_in', 'Zoom in')} style={iconBtn} onClick={() => zoomBy(1)}>+</button>
          </div>
        )}
        {source?.kind === 'pdf' && (
          <form onSubmit={(e) => { e.preventDefault(); void runSearch(); }} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 10px', borderRadius: 6, border: '1px solid #3a2d55', fontSize: 12, color: '#a6adc8', width: 180 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
              <input type="text" value={query} onChange={(e) => { setQuery(e.target.value); setFound(''); }} placeholder={tt('viewer.search', 'Search')} aria-label={tt('viewer.search_label', 'Search the document')}
                style={{ border: 'none', background: 'transparent', color: '#cdd6f4', font: 'inherit', outline: 'none', width: 130 }} />
            </label>
            {found && <span style={{ fontSize: 11, color: '#a6adc8' }}>{found}</span>}
          </form>
        )}
        <button type="button" style={btn} onClick={onShowInFolder}>{tt('viewer.show_in_folder', 'Show in folder')}</button>
        <button type="button" style={primary} onClick={onOpenInApp}>{tt('viewer.open_in_app', 'Open in your app')}</button>
      </div>

      <div style={{ flexGrow: 1, minHeight: 0, display: 'flex' }}>
        {!source ? (
          <Centered>{tt('viewer.loading', 'Opening…')}</Centered>
        ) : source.kind === 'error' ? (
          <Centered>{source.message}</Centered>
        ) : source.kind === 'other' ? (
          <Centered>
            <span>{tt('viewer.other', 'This kind of file opens in your own app.')}</span>
            <button type="button" style={{ ...primary, marginTop: 12 }} onClick={onOpenInApp}>{tt('viewer.open_in_app', 'Open in your app')}</button>
          </Centered>
        ) : source.kind === 'pdf' ? (
          <PdfView bytes={source.bytes} zoom={zoom} goTo={goTo} onPages={setPages} onPage={setPage} searchRef={searchRef} />
        ) : source.kind === 'docx' ? (
          <DocxView bytes={source.bytes} zoom={zoom} />
        ) : source.kind === 'sheet' ? (
          <SheetView sheets={source.sheets} />
        ) : null}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#a6adc8', padding: 24, textAlign: 'center' }}>{children}</div>;
}

// ── PDF ──────────────────────────────────────────────────────────────────────

/** pdf.js on the page's own thread: both apps' webviews refuse a worker from
 *  another origin, and documents are small enough that this is quick. The
 *  worker module, imported, registers itself as pdf.js's in-thread handler. */
let pdfjsReady: Promise<any> | null = null;
function loadPdfjs(): Promise<any> {
  if (!pdfjsReady) {
    pdfjsReady = (async () => {
      // The LEGACY build: pdf.js 6's modern build needs JavaScript newer than
      // some VS Code / WebView2 versions have (Uint8Array.toHex). Same viewer.
      const lib: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
      // @ts-expect-error — the worker module ships no type declarations
      const worker: any = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs');
      (globalThis as any).pdfjsWorker = worker;
      return lib;
    })();
  }
  return pdfjsReady;
}

const PAGE_LIMIT = 400;

function PdfView({ bytes, zoom, goTo, onPages, onPage, searchRef }: {
  bytes: Uint8Array;
  zoom: number;
  goTo: { n: number; at: number } | null;
  onPages: (n: number) => void;
  onPage: (n: number) => void;
  searchRef: React.MutableRefObject<((q: string) => Promise<number[]>) | null>;
}) {
  const [doc, setDoc] = useState<any>(null);
  const [error, setError] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const pageEls = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    let cancelled = false;
    let loaded: any = null;
    (async () => {
      try {
        const lib = await loadPdfjs();
        loaded = await lib.getDocument({ data: bytes.slice(), isEvalSupported: false, disableFontFace: false }).promise;
        if (cancelled) { void loaded.destroy(); return; }
        setDoc(loaded);
        onPages(loaded.numPages);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; if (loaded) void loaded.destroy(); };
  }, [bytes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Search: the pages whose text contains the words.
  useEffect(() => {
    if (!doc) { searchRef.current = null; return; }
    const texts = new Map<number, string>();
    searchRef.current = async (q: string) => {
      const needle = q.toLowerCase();
      const hits: number[] = [];
      for (let p = 1; p <= Math.min(doc.numPages, PAGE_LIMIT); p++) {
        if (!texts.has(p)) {
          const tc = await (await doc.getPage(p)).getTextContent();
          texts.set(p, tc.items.map((i: any) => i.str ?? '').join(' ').toLowerCase());
        }
        if (texts.get(p)!.includes(needle)) hits.push(p);
      }
      return hits;
    };
  }, [doc, searchRef]);

  // Which page is in view.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !doc) return;
    const onScroll = () => {
      const mid = el.scrollTop + el.clientHeight / 3;
      let current = 1;
      pageEls.current.forEach((p, i) => { if (p && p.offsetTop <= mid) current = i + 1; });
      onPage(current);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [doc, onPage]);

  useEffect(() => {
    if (!goTo) return;
    pageEls.current[goTo.n - 1]?.scrollIntoView({ block: 'start' });
  }, [goTo]);

  if (error) return <Centered>{tt('viewer.pdf_failed', 'This PDF could not be shown.')} {error}</Centered>;
  if (!doc) return <Centered>{tt('viewer.loading', 'Opening…')}</Centered>;
  const count = Math.min(doc.numPages, PAGE_LIMIT);

  return (
    <>
      <div style={{ width: 120, flexShrink: 0, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12, borderRight: '1px solid #241d33', background: '#0e0b16' }}>
        {Array.from({ length: count }, (_, i) => (
          <button key={i} type="button" aria-label={tt('viewer.go_to_page', 'Page {n}').replace('{n}', String(i + 1))}
            onClick={() => pageEls.current[i]?.scrollIntoView({ block: 'start' })}
            style={{ padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}>
            <PdfPage doc={doc} n={i + 1} scale={0.15} />
          </button>
        ))}
      </div>
      <div ref={scroller} style={{ flexGrow: 1, overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
        {Array.from({ length: count }, (_, i) => (
          <div key={i} ref={(el) => { pageEls.current[i] = el; }} style={{ boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}>
            <PdfPage doc={doc} n={i + 1} scale={zoom / 100} lazy />
          </div>
        ))}
        {doc.numPages > PAGE_LIMIT && <span style={{ fontSize: 12, color: '#a6adc8' }}>{tt('viewer.more_pages', 'The first {n} pages are shown here. Open it in your app for the rest.').replace('{n}', String(PAGE_LIMIT))}</span>}
      </div>
    </>
  );
}

/** One page on a canvas, drawn when it first comes near the screen. */
function PdfPage({ doc, n, scale, lazy }: { doc: any; n: number; scale: number; lazy?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [visible, setVisible] = useState(!lazy);

  useEffect(() => {
    let alive = true;
    void doc.getPage(n).then((p: any) => {
      if (!alive) return;
      const vp = p.getViewport({ scale });
      setSize({ w: vp.width, h: vp.height });
    });
    return () => { alive = false; };
  }, [doc, n, scale]);

  useEffect(() => {
    if (visible || !box.current) return;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) setVisible(true); }, { rootMargin: '800px' });
    io.observe(box.current);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || !size || !canvas.current) return;
    let task: any = null;
    let alive = true;
    void doc.getPage(n).then((p: any) => {
      if (!alive || !canvas.current) return;
      const ratio = window.devicePixelRatio || 1;
      const vp = p.getViewport({ scale: scale * ratio });
      const c = canvas.current;
      c.width = Math.floor(vp.width);
      c.height = Math.floor(vp.height);
      task = p.render({ canvasContext: c.getContext('2d'), viewport: vp, canvas: c });
      task.promise.catch(() => { /* cancelled by a zoom change */ });
    });
    return () => { alive = false; try { task?.cancel(); } catch { /* done */ } };
  }, [visible, size, doc, n, scale]);

  return (
    <div ref={box} style={{ width: size?.w ?? 120 * scale * 5, height: size?.h ?? 160 * scale * 5, background: '#fff' }}>
      <canvas ref={canvas} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}

// ── Word ─────────────────────────────────────────────────────────────────────

function DocxView({ bytes, zoom }: { bytes: Uint8Array; zoom: number }) {
  const body = useRef<HTMLDivElement>(null);
  const styles = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { renderAsync } = await import('docx-preview');
        if (!alive || !body.current || !styles.current) return;
        body.current.innerHTML = '';
        styles.current.innerHTML = '';
        await renderAsync(new Blob([bytes.slice()]), body.current, styles.current, {
          className: 'ava-docx', inWrapper: true, ignoreLastRenderedPageBreak: true, breakPages: true, useBase64URL: true,
        });
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { alive = false; };
  }, [bytes]);

  if (error) return <Centered>{tt('viewer.docx_failed', 'This Word document could not be shown.')} {error}</Centered>;
  return (
    <div style={{ flexGrow: 1, overflow: 'auto', background: '#0b0912' }}>
      <div ref={styles} />
      {/* docx-preview draws grey paper behind the pages; ours is the app's. */}
      <style>{'.ava-docx-wrapper{background:transparent!important;padding:24px!important}.ava-docx-wrapper>section.ava-docx{box-shadow:0 10px 40px rgba(0,0,0,.5)!important;margin-bottom:18px!important}'}</style>
      <div ref={body} style={{ zoom: zoom / 100 } as CSSProperties} />
    </div>
  );
}

// ── Spreadsheet ──────────────────────────────────────────────────────────────

const colName = (i: number): string => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

function SheetView({ sheets }: { sheets: ViewSheet[] }) {
  const [active, setActive] = useState(0);
  const [cell, setCell] = useState<{ r: number; c: number } | null>(null);
  const sheet = sheets[active] ?? { name: '', rows: [] };
  const width = useMemo(() => sheet.rows.reduce((m, r) => Math.max(m, r.length), 0), [sheet]);
  const selected = cell ? sheet.rows[cell.r]?.[cell.c] : undefined;
  const pick = useCallback((r: number, c: number) => setCell({ r, c }), []);
  const th: CSSProperties = { position: 'sticky', top: 0, background: '#14101f', color: '#8d86a3', fontWeight: 400, padding: '6px 10px', borderRight: '1px solid #241d33', borderBottom: '1px solid #241d33', fontSize: 12, zIndex: 1 };

  return (
    <div style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 18px', borderBottom: '1px solid #241d33', fontSize: 12, background: '#0e0b16', minHeight: 18 }}>
        <span style={{ width: 44, color: '#a6adc8' }}>{cell ? `${colName(cell.c)}${cell.r + 1}` : ''}</span>
        {selected?.f
          ? <><span style={{ fontFamily: 'Consolas, monospace', color: '#e2d0ff' }}>={selected.f}</span><span style={{ color: '#a6adc8' }}>→ {selected.v}</span></>
          : <span style={{ color: '#cdd6f4' }}>{selected?.v ?? ''}</span>}
      </div>
      <div style={{ flexGrow: 1, overflow: 'auto' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ ...th, left: 0, zIndex: 2, minWidth: 44 }} />
              {Array.from({ length: width }, (_, c) => <th key={c} style={{ ...th, minWidth: 90 }}>{colName(c)}</th>)}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row, r) => (
              <tr key={r}>
                <th style={{ ...th, position: 'sticky', left: 0, top: 'auto', textAlign: 'center' }}>{r + 1}</th>
                {Array.from({ length: width }, (_, c) => {
                  const v = row[c];
                  const isHead = r === 0;
                  const on = cell?.r === r && cell?.c === c;
                  return (
                    <td key={c} onClick={() => pick(r, c)}
                      style={{
                        padding: '7px 10px', whiteSpace: 'nowrap', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis',
                        borderRight: '1px solid #241d33', borderBottom: '1px solid #241d33', cursor: 'cell',
                        textAlign: v?.n ? 'right' : 'left',
                        background: isHead ? '#3b2563' : 'transparent', color: isHead ? '#fff' : '#cdd6f4', fontWeight: isHead || v?.f ? 600 : 400,
                        outline: on ? '2px solid var(--accent, #a855f7)' : 'none', outlineOffset: -2,
                      }}>{v?.v ?? ''}</td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {sheet.clipped && <p style={{ fontSize: 12, color: '#a6adc8', padding: '10px 18px' }}>{tt('viewer.sheet_clipped', 'Only part of this sheet is shown here. Open it in your app to see all of it.')}</p>}
      </div>
      {sheets.length > 1 && (
        <div style={{ display: 'flex', gap: 2, padding: '0 18px', borderTop: BORDER, background: '#110d1a', overflowX: 'auto' }}>
          {sheets.map((s, i) => (
            <button key={i} type="button" aria-pressed={i === active} onClick={() => { setActive(i); setCell(null); }}
              style={{ height: 34, padding: '0 16px', border: 'none', borderBottom: i === active ? '2px solid var(--accent, #a855f7)' : '2px solid transparent', background: 'transparent', color: i === active ? '#fff' : '#a6adc8', fontFamily: 'inherit', fontSize: 12, fontWeight: i === active ? 600 : 400, cursor: 'pointer' }}>
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
