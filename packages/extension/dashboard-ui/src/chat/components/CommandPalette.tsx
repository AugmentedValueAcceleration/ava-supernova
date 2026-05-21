import { useLayoutEffect, useMemo, useRef } from 'react';
import { t, useLocale } from '../../i18n';

// ─── Command palette ──────────────────────────────────────────────────────────
//
// A scrollable upward-growing dropdown of user-aid actions. Each button fires
// a *pre-classified intent* — the user has told us which tool they want, so
// Ava skips intent detection and goes straight to gathering the tool's
// fields. The conversational path is untouched.
//
// Two ways to open it:
//   1) Click the `/` button beside the vault.
//   2) Type `/` at the start of the chat input (Slack-/Discord-style).
//      The text after the slash filters the list as you type, ↑/↓ moves the
//      highlight, Enter fires the highlighted action.
//
// See COMMAND_PALETTE_PLAN.md.

/** User-aid tool categories a palette button can target. */
export type PaletteTool = 'task' | 'journal' | 'memory' | 'support' | 'learning' | 'creative' | 'plans';

export interface PaletteAction {
  tool: PaletteTool;
  /** 'create' for most tools; for `creative`: image | music | video | voice. */
  action: string;
  labelKey: string;
  sectionKey: string;
}

const ALL_ACTIONS: PaletteAction[] = [
  { tool: 'task',     action: 'create', labelKey: 'palette.task.create',     sectionKey: 'palette.col.task' },
  { tool: 'journal',  action: 'create', labelKey: 'palette.journal.create',  sectionKey: 'palette.col.journal' },
  { tool: 'creative', action: 'image',  labelKey: 'palette.creative.image',  sectionKey: 'palette.col.creative' },
  { tool: 'creative', action: 'music',  labelKey: 'palette.creative.music',  sectionKey: 'palette.col.creative' },
  { tool: 'creative', action: 'video',  labelKey: 'palette.creative.video',  sectionKey: 'palette.col.creative' },
  { tool: 'creative', action: 'voice',  labelKey: 'palette.creative.voice',  sectionKey: 'palette.col.creative' },
  { tool: 'support',  action: 'create', labelKey: 'palette.support.create',  sectionKey: 'palette.col.support' },
  { tool: 'memory',   action: 'create', labelKey: 'palette.memory.create',   sectionKey: 'palette.col.memory' },
  { tool: 'learning', action: 'create', labelKey: 'palette.learning.create', sectionKey: 'palette.col.learning' },
  { tool: 'plans',    action: 'meal',     labelKey: 'palette.plans.meal',     sectionKey: 'palette.col.plans' },
  { tool: 'plans',    action: 'fitness',  labelKey: 'palette.plans.fitness',  sectionKey: 'palette.col.plans' },
  { tool: 'plans',    action: 'combined', labelKey: 'palette.plans.combined', sectionKey: 'palette.col.plans' },
];

/**
 * Filter the flat action list by a free-form query. Matches against the
 * action label, its section label, and the raw tool/action ids — so typing
 * the section name, the action name, or part of either will surface it.
 */
export function filterPaletteActions(query: string): PaletteAction[] {
  const q = query.trim().toLowerCase();
  if (!q) return ALL_ACTIONS;
  return ALL_ACTIONS.filter((a) => {
    const label = t(a.labelKey).toLowerCase();
    const section = t(a.sectionKey).toLowerCase();
    return (
      label.includes(q) ||
      section.includes(q) ||
      a.tool.includes(q) ||
      a.action.includes(q)
    );
  });
}

interface CommandPaletteProps {
  query: string;
  activeIndex: number;
  onActiveIndexChange: (i: number) => void;
  onSelect: (tool: PaletteTool, action: string) => void;
}

export function CommandPalette({ query, activeIndex, onActiveIndexChange, onSelect }: CommandPaletteProps) {
  useLocale();
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  const filtered = useMemo(() => filterPaletteActions(query), [query]);

  // Group filtered items into sections (preserving the canonical order).
  // Section headers only render for sections that have at least one match,
  // so the dropdown collapses cleanly as the user narrows the query.
  const grouped = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, PaletteAction[]>();
    for (const a of filtered) {
      if (!map.has(a.sectionKey)) {
        map.set(a.sectionKey, []);
        order.push(a.sectionKey);
      }
      map.get(a.sectionKey)!.push(a);
    }
    return order.map((sectionKey) => ({ sectionKey, items: map.get(sectionKey)! }));
  }, [filtered]);

  // Keep the highlighted item scrolled into view as the active index moves
  // — important once the list scrolls beyond max-height.
  useLayoutEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  // Flat-index lookup so we can wire the active highlight without grouping
  // logic leaking into the InputArea keyboard handler.
  const indexOf = (a: PaletteAction) => filtered.indexOf(a);

  return (
    <div
      ref={listRef}
      className="absolute z-50 rounded-xl overflow-hidden"
      style={{
        bottom: '100%',
        left: 12,
        marginBottom: 8,
        width: 320,
        maxHeight: 320,
        overflowY: 'auto',
        background: 'var(--vscode-editor-background, #1e1e1e)',
        border: '1.5px solid rgba(168, 85, 247, 0.25)',
        boxShadow: '0 -4px 24px rgba(0, 0, 0, 0.4), 0 0 12px rgba(168, 85, 247, 0.1)',
        animation: 'vault-slide-up 0.18s ease-out',
      }}
      role="listbox"
      aria-label={t('palette.title')}
    >
      {filtered.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs opacity-40">
          {t('palette.empty')}
        </div>
      ) : (
        grouped.map((group) => (
          <div key={group.sectionKey}>
            <div
              className="px-3 pt-2.5 pb-1 text-[9px] font-bold uppercase tracking-wider"
              style={{ color: 'rgba(168, 85, 247, 0.7)' }}
            >
              {t(group.sectionKey)}
            </div>
            {group.items.map((a) => {
              const idx = indexOf(a);
              const isActive = idx === activeIndex;
              return (
                <button
                  key={`${a.tool}.${a.action}`}
                  ref={isActive ? activeRef : undefined}
                  onClick={() => onSelect(a.tool, a.action)}
                  onMouseEnter={() => onActiveIndexChange(idx)}
                  className="w-full text-left px-4 py-2 text-xs font-medium cursor-pointer
                             border-none transition-colors duration-100"
                  style={{
                    background: isActive ? 'rgba(168, 85, 247, 0.18)' : 'transparent',
                    color: isActive ? '#fff' : 'var(--vscode-foreground)',
                  }}
                  role="option"
                  aria-selected={isActive}
                >
                  {t(a.labelKey)}
                </button>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
