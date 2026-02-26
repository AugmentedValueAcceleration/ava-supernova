import { post } from '../App';
import type { Page } from '../types/messages';
import { BoltIcon, SparklesIcon, LinkIcon, CreditCardIcon, CogIcon } from './Icons';

interface NavSidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  mode: 'platform' | 'byok';
  email?: string | null;
  onConnectAccount?: () => void;
}

const NAV_ITEMS: Array<{ page: Page; label: string; icon: React.FC<{ className?: string }>; platformOnly?: boolean; comingSoon?: boolean }> = [
  { page: 'overview', label: 'Overview', icon: BoltIcon, platformOnly: true },
  { page: 'memory', label: 'Memory', icon: SparklesIcon, platformOnly: true, comingSoon: true },
  { page: 'connections', label: 'Connections', icon: LinkIcon, platformOnly: true, comingSoon: true },
  { page: 'billing', label: 'Billing', icon: CreditCardIcon, platformOnly: true },
  { page: 'settings', label: 'Settings', icon: CogIcon },
];

export function NavSidebar({ currentPage, onNavigate, mode, email, onConnectAccount }: NavSidebarProps) {
  const visibleItems = mode === 'byok'
    ? NAV_ITEMS.filter(item => !item.platformOnly)
    : NAV_ITEMS;

  return (
    <nav className="flex w-56 shrink-0 flex-col border-r border-[var(--border-card)] bg-[var(--bg-card)] p-4">
      {/* Logo */}
      <div className="mb-4 border-b border-[var(--border-card)] px-3 pb-4">
        <span className="bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)] bg-clip-text text-sm font-semibold text-transparent">
          Ava | Supernova
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-1">
        {visibleItems.map(({ page, label, icon: Icon, comingSoon }) => {
          if (comingSoon) {
            return (
              <div
                key={page}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-[var(--text-muted)] cursor-not-allowed"
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
                <span className="ml-auto rounded bg-[var(--bg-input)] px-1.5 py-0.5 text-[10px]">Soon</span>
              </div>
            );
          }
          const isActive = currentPage === page;
          return (
            <button
              key={page}
              onClick={() => onNavigate(page)}
              className={`flex items-center gap-3 rounded-lg border-none px-3 py-2 text-left text-sm transition ${
                isActive
                  ? 'bg-[var(--bg-input)] font-medium text-white'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-input)] hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      <div className="border-t border-[var(--border-card)] px-3 pt-3">
        {mode === 'platform' ? (
          <>
            {email && (
              <p className="mb-2 truncate text-[10px] text-[var(--text-muted)]">{email}</p>
            )}
            <button
              onClick={() => post({ type: 'disconnect_account' })}
              className="w-full rounded-lg border border-red-500/30 bg-transparent px-3 py-1.5 text-xs text-red-400 transition hover:bg-red-500/10"
            >
              Disconnect Account
            </button>
          </>
        ) : (
          <>
            <p className="mb-2 text-[10px] text-[var(--text-muted)]">Using your own API keys</p>
            <button
              onClick={onConnectAccount}
              className="w-full rounded-lg border border-[var(--border-input)] bg-transparent px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-input)] hover:text-white"
            >
              Connect Account
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
