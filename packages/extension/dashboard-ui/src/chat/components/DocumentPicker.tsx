/**
 * Find a document to work on — search, not a file dialog.
 *
 * Mirrors the IDE's picker. The list arrives from the extension host, because a
 * webview cannot walk the filesystem itself, but the behaviour is identical:
 *
 *   1. Recent — what Ava just made, or what was open yesterday. The view before
 *      anything is typed, because it covers most opens.
 *   2. Everything the project holds, filtered as you type.
 *   3. Browse… — the host's own file dialog, for anything outside those roots.
 *
 * The entry point for this lives on the chat header next to + New Chat, not in
 * the workspace pane: the pane does not exist until a document is open, so a
 * picker inside it would have nowhere to be clicked from.
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { t, useLocale } from '../../i18n';
import type { DocumentCandidateUI } from '../../types/messages';

export interface DocumentPickerProps {
  candidates: DocumentCandidateUI[];
  /** Paths opened before, newest first. Shown above everything else. */
  recentPaths: string[];
  onPick: (doc: DocumentCandidateUI) => void;
  onBrowse: () => void;
  onClose: () => void;
}

export function DocumentPicker({ candidates, recentPaths, onPick, onBrowse, onClose }: DocumentPickerProps) {
  useLocale();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setActive(0); }, [query]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // Someone who opens this without typing almost always wants the thing
      // they had open last, so recents lead in the order they were opened.
      const byPath = new Map(candidates.map((c) => [c.path, c]));
      const recent = recentPaths.map((p) => byPath.get(p)).filter(Boolean) as DocumentCandidateUI[];
      const rest = candidates
        .filter((c) => !recentPaths.includes(c.path))
        .sort((a, b) => (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0));
      return [...recent, ...rest].slice(0, 40);
    }
    return candidates
      .filter((c) => c.name.toLowerCase().includes(q) || c.relPath.toLowerCase().includes(q))
      .slice(0, 40);
  }, [query, candidates, recentPaths]);

  const choose = (i: number) => {
    const doc = results[i];
    if (doc) onPick(doc);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(results.length - 1, i + 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); return; }
    if (e.key === 'Enter') { e.preventDefault(); choose(active); }
  };

  const showingRecents = query.trim() === '' && recentPaths.length > 0;

  return (
    <>
      <div className="fixed inset-0 z-[200]" style={{ background: 'rgba(0,0,0,0.35)' }} onClick={onClose} />
      <div
        role="dialog"
        aria-label={t('doc.open_title')}
        className="fixed z-[201] flex flex-col rounded-xl overflow-hidden"
        style={{
          top: 80, left: '50%', transform: 'translateX(-50%)',
          width: 540, maxWidth: '90vw', maxHeight: '60vh',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-card)',
          boxShadow: '0 12px 48px rgba(0,0,0,0.5)',
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t('doc.open_placeholder')}
          className="px-4 py-3 bg-transparent border-none outline-none text-[13px] text-[var(--text-primary)]"
          style={{ borderBottom: '1px solid var(--border-card)' }}
        />

        <div className="overflow-y-auto flex-1">
          {showingRecents && (
            <div className="px-4 pt-2 pb-1 text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
              {t('doc.recent')}
            </div>
          )}

          {results.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12px] text-[var(--text-muted)]">
              {candidates.length === 0 ? t('doc.none_found') : t('doc.no_match')}
            </div>
          ) : (
            results.map((c, i) => (
              <button
                key={c.path}
                onClick={() => choose(i)}
                onMouseEnter={() => setActive(i)}
                className="block w-full text-left border-none cursor-pointer px-4 py-2 text-[var(--text-primary)]"
                style={{ background: i === active ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'transparent' }}
              >
                <div className={`text-[12.5px] ${i === active ? 'font-semibold' : ''}`}>{c.name}</div>
                <div className="text-[10px] mt-px text-[var(--text-muted)]">{c.relPath}</div>
              </button>
            ))
          )}
        </div>

        {/* Always last: documents outside the scanned roots are rare, but a
            picker with no way out is a picker people stop trusting. */}
        <button
          onClick={onBrowse}
          className="px-4 py-2.5 text-left border-none cursor-pointer bg-transparent text-[11.5px] text-[var(--text-secondary)]"
          style={{ borderTop: '1px solid var(--border-card)' }}
        >
          {t('doc.browse')}
        </button>
      </div>
    </>
  );
}
