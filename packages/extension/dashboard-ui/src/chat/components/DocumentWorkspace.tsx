/**
 * The document workspace — a document open beside the conversation about it.
 *
 * Mirrors the IDE's `DocumentWorkspace`, with one structural difference that
 * drives the whole shape: **a VS Code webview cannot touch the filesystem.**
 * Every read and write goes to the extension host and comes back as a message,
 * so this component asks and waits where the IDE simply reads.
 *
 * Decisions, settled with the operator on 2026-08-21 and identical on both
 * surfaces:
 *
 * - **Free edit, always.** Not read-only-first. On the web there is no other
 *   editor, so a read-only pane means the user cannot fix their own typo.
 * - **Autosave on a short debounce.** Ava reads the file from DISK, so an
 *   unsaved buffer means she works from an older version than the one on
 *   screen — the failure where she looks unreliable while the file is fine.
 * - **The Tasks rail yields** while a document is open, and returns on close.
 * - **Markdown is the source of truth**, so this edits Markdown text. docx and
 *   pdf are exports built from it and are never edited here.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { t, useLocale } from '../../i18n';

export interface OpenDocument {
  path: string;
  name: string;
}

export interface DocumentWorkspaceProps {
  doc: OpenDocument;
  /** Body from the host, or null while it is still being fetched. */
  content: string | null;
  /** True once the host has answered and said it could not read the file. */
  failed: boolean;
  /** Ask the host to write. Debounced by this component, not by the caller. */
  onSave: (path: string, content: string) => void;
  onClose: () => void;
  onSwitch: () => void;
  width: number;
  onWidthChange: (w: number) => void;
}

const MIN_WIDTH = 320;
const MAX_WIDTH = 900;
/** Long enough not to write on every keystroke, short enough that Ava is never
 *  more than a moment behind what is on screen. */
const AUTOSAVE_MS = 800;

export function DocumentWorkspace({
  doc, content, failed, onSave, onClose, onSwitch, width, onWidthChange,
}: DocumentWorkspaceProps) {
  useLocale();
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(true);
  const saveTimer = useRef<number | null>(null);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  /** Which path the current buffer belongs to — guards against a late reply
   *  for the PREVIOUS document overwriting what is on screen now. */
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (content === null) return;
    loadedFor.current = doc.path;
    setText(content);
    setSaved(true);
  }, [content, doc.path]);

  useEffect(() => () => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
  }, []);

  const handleChange = (body: string) => {
    setText(body);
    setSaved(false);
    // Never save into a document the buffer does not belong to.
    if (loadedFor.current !== doc.path) return;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      onSave(doc.path, body);
      setSaved(true);
    }, AUTOSAVE_MS);
  };

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: width };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startX - ev.clientX;
      onWidthChange(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragRef.current.startW + delta)));
    };
    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [width, onWidthChange]);

  return (
    <div
      className="relative flex flex-col h-full flex-shrink-0"
      style={{
        width, minWidth: MIN_WIDTH,
        borderLeft: '1px solid var(--border-card)',
        background: 'var(--bg-card)',
      }}
    >
      <div
        onMouseDown={onDragStart}
        className="absolute top-0 bottom-0 z-10"
        style={{ left: -3, width: 6, cursor: 'col-resize' }}
      />

      {/* Header — which document, switch, close */}
      <div
        className="flex items-center gap-2 px-3 flex-shrink-0"
        style={{ height: 40, borderBottom: '1px solid var(--border-card)' }}
      >
        <span className="flex-1 min-w-0 truncate text-[12px] font-semibold text-[var(--text-primary)]" title={doc.path}>
          {doc.name}
        </span>

        {/* Quiet when saved. A permanent tick is noise — the only moment worth
            reporting is when the file is BEHIND the screen. */}
        {!saved && <span className="text-[9.5px] text-[var(--text-muted)]">{t('doc.saving')}</span>}

        <button
          onClick={onSwitch}
          title={t('doc.switch')}
          className="px-2 py-0.5 rounded text-[10px] cursor-pointer bg-transparent text-[var(--text-secondary)]"
          style={{ border: '1px solid var(--border-card)' }}
        >
          {t('doc.switch')}
        </button>
        <button
          onClick={onClose}
          title={t('doc.close')}
          aria-label={t('doc.close')}
          className="w-[22px] h-[22px] rounded border-none cursor-pointer bg-transparent text-[var(--text-muted)] text-[14px] leading-none"
        >
          ×
        </button>
      </div>

      {/* Body */}
      {failed ? (
        <div className="p-5 text-[12px] leading-relaxed" style={{ color: '#f38ba8' }}>
          {t('doc.unavailable')}
          <div className="mt-1.5 text-[11px] font-mono break-all text-[var(--text-muted)]">{doc.path}</div>
        </div>
      ) : content === null ? (
        <div className="p-5 text-[12px] text-[var(--text-muted)]">{t('doc.loading')}</div>
      ) : (
        <textarea
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          spellCheck
          className="flex-1 w-full resize-none border-none outline-none bg-transparent px-4 py-4 text-[13px] leading-[1.7] text-[var(--text-primary)]"
          // Markdown is the source of truth, so this is a text editor, not a
          // word processor. Monospace keeps tables and front-matter legible.
          style={{ fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace' }}
        />
      )}
    </div>
  );
}
