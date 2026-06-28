// ─── Shared UI design tokens ─────────────────────────────────────────────────
//
// The Tasks tab is the canonical design for the whole dashboard. These class
// strings encode that language so every page renders identical buttons, tabs,
// pills and inputs. Always use these (and `var(--accent)`) — never hardcode the
// accent purple (#A855F7 / rgba(168,85,247,…)), so the whole UI tracks the theme.

/** Primary action button — outlined accent (e.g. "New Task", "Write entry").
 *  Pair with an icon: <button className={btnPrimary}><PlusIcon … />Label</button> */
export const btnPrimary =
  'flex items-center gap-1.5 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-xs font-medium text-[var(--accent)] transition hover:bg-[var(--accent)]/20 cursor-pointer';

/** Destructive action button — outlined red (e.g. "Clear all", "Delete"). */
export const btnDanger =
  'flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/20 cursor-pointer';

/** Secondary / toggle button (e.g. a "Year view" toggle). Pass whether it's on. */
export const btnToggle = (active: boolean): string =>
  `rounded-md px-2.5 py-1 text-[11px] font-medium border transition cursor-pointer ${
    active
      ? 'border-[var(--accent)]/40 bg-[var(--accent)]/15 text-white'
      : 'border-[var(--border-card)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
  }`;

/** Underline tab-bar container — wraps a row of `tab()` buttons. */
export const tabBar =
  'flex items-center gap-4 border-b border-[var(--border-card)] pb-px';

/** A single underline tab. Pass whether it's the active tab. */
export const tab = (active: boolean): string =>
  `shrink-0 pb-2 text-xs font-medium transition cursor-pointer ${
    active
      ? 'border-b-2 border-[var(--accent)] text-white'
      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
  }`;

/** A subtle filter pill (e.g. priority / category). Pass whether it's selected. */
export const filterPill = (active: boolean): string =>
  `rounded-full px-2 py-0.5 text-[10px] font-medium transition cursor-pointer ${
    active ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'text-[var(--text-muted)] hover:bg-white/5'
  }`;

/** Search / text input field (use with an absolutely-positioned SearchIcon). */
export const searchInput =
  'w-full rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] py-1.5 pl-8 pr-3 text-xs text-white placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent)]/50';
