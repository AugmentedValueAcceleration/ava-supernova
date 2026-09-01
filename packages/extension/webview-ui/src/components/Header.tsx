import { ModelSelector } from './ModelSelector';
import { t, tt, useLocale } from '../i18n';

/** Byte formatting identical to the dashboard StorageBar's, so the chip and
 *  the bar never render the same number two different ways. */
function formatBytes(n: number): string {
  if (!n || n < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

interface HeaderProps {
  models: Array<{ id: string; name: string; provider: string; supportsVision?: boolean; available: boolean }>;
  activeModel: string | null;
  needsSetup: boolean;
  onSwitch: (modelId: string) => void;
  onOpenDashboard: () => void;
  onOpenHistory: () => void;
  onNewChat: () => void;
  onToggleTasks: () => void;
  tasksOpen: boolean;
  /** Length of session task list — drives the badge on the Tasks pill. */
  sessionTaskCount?: number;
  /** Loaded conversation title — chip next to the model picker. null
   *  hides the chip (fresh chat). Mirrors IDE chat header. */
  conversationTitle?: string | null;
  /** Total bytes under ~/.ava. Undefined until the scan lands — the chip is
   *  hidden rather than showing a zero that would read as "nothing stored". */
  storageBytes?: number;
}

// ── Step 1b of extension↔IDE chat alignment ─────────────────────────────────
// Right-side icon cluster (history / dashboard / new-chat icon-only buttons)
// dropped in favour of labelled pills matching the IDE chat header at
// DashboardPages.tsx:4232-4273. Tasks gets a count badge; New Chat becomes
// a labelled `+ New Chat` pill. The Branding block stays — it's panel-only
// chrome (the IDE doesn't need it because its window already says "Ava
// Supernova IDE"). Dashboard navigation (Settings entry) folds into the
// model picker's empty-state placeholder; the standalone gear button is
// gone. History is reachable from the dashboard sidebar's History page;
// the icon-only header button is gone.

export function Header({
  models,
  activeModel,
  needsSetup,
  onSwitch,
  onOpenDashboard,
  onNewChat,
  conversationTitle,
  storageBytes,
}: HeaderProps) {
  useLocale();

  // Cloud-sync toggle removed — Ava is local-first; nothing syncs to the
  // cloud (storage sunsets 1 Jul 2026). Managers default to local-only.

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 border-b"
      style={{ borderColor: 'rgba(168, 85, 247, 0.12)' }}
      role="toolbar"
      aria-label={t('header.controls_aria')}
    >
      {/* Branding — panel-only chrome (IDE doesn't need a wordmark inside
          the chat surface because the window title already carries it). */}
      <div className="flex items-baseline gap-1 mr-1 select-none flex-shrink-0">
        <span className="text-[15px] font-bold" style={{ color: '#cdd6f4' }}>Ava</span>
        <span className="text-[9px] uppercase tracking-[2px] opacity-40" style={{ color: '#cdd6f4' }}>{t('brand.supernova')}</span>
      </div>

      {/* Model selector */}
      <div className="min-w-0 flex justify-start">
        <ModelSelector
          models={models}
          activeModel={activeModel}
          needsSetup={needsSetup}
          onSwitch={onSwitch}
          onOpenDashboard={onOpenDashboard}
        />
      </div>

      {/* Conversation title chip — mirrors IDE chat header at
          DashboardPages.tsx:4154-4157. Hidden when no conversation
          loaded (fresh chat). */}
      {conversationTitle && (
        <span
          style={{
            fontSize: 12,
            color: '#6c7086',
            maxWidth: 200,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={conversationTitle}
        >
          {conversationTitle}
        </span>
      )}

      <div className="flex-1" />

      {/* Cloud-sync toggle removed — Ava is local-first; everything stays on
          this machine. Cloud storage is sunsetting (1 Jul 2026). */}

      {/* Tasks toggle removed — the always-visible Tasks spine on the right
          edge is the single control now (its grip expands/collapses). */}

      {/* Local footprint. The total only: this sidebar is resizable down to a
          couple of hundred pixels, and the dashboard's eight-segment bar is
          unreadable at any width that would fit beside the model picker. Click
          opens the dashboard, where the real breakdown and the reclaim flow
          live. Same relative position as the bar in the dashboard's top strip,
          so it is found in the same place on both surfaces. */}
      {typeof storageBytes === 'number' && storageBytes > 0 && (
        <button
          onClick={onOpenDashboard}
          title={t('dash.cc.storage')}
          className="flex-shrink-0 rounded-md px-2 py-1 text-[10px] tabular-nums transition"
          style={{
            background: 'rgba(168,85,247,0.06)',
            border: '1px solid rgba(168,85,247,0.15)',
            color: '#6c7086',
            fontFamily: 'monospace',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#a855f7'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#6c7086'; }}
        >
          {formatBytes(storageBytes)}
        </button>
      )}

      {/* New Chat — labelled pill, mirrors IDE header at
          DashboardPages.tsx:4256-4273. */}
      <button
        onClick={onNewChat}
        title={t('header.new_chat')}
        aria-label={t('header.new_chat')}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
          background: 'rgba(168,85,247,0.1)',
          border: '1px solid rgba(168,85,247,0.25)',
          borderRadius: 8,
          color: '#a855f7',
          fontSize: 11, fontWeight: 600, cursor: 'pointer',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(168,85,247,0.2)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(168,85,247,0.1)'; }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        {tt('header.new_chat', 'New Chat')}
      </button>
    </div>
  );
}
