import { post } from '../App';
import type { Page } from '../types/messages';
import { BoltIcon, ChartBarIcon, SparklesIcon, LinkIcon, CreditCardIcon, CogIcon } from './Icons';

interface NavSidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  mode: 'platform' | 'byok';
  email?: string | null;
  onConnectAccount?: () => void;
}

const NAV_ITEMS: Array<{ page: Page; label: string; icon: React.FC<{ className?: string }>; platformOnly?: boolean; comingSoon?: boolean }> = [
  { page: 'overview', label: 'Overview', icon: BoltIcon, platformOnly: true },
  { page: 'usage', label: 'Usage', icon: ChartBarIcon, platformOnly: true },
  { page: 'memory', label: 'Memory', icon: SparklesIcon, platformOnly: true },
  { page: 'connections', label: 'Connections', icon: LinkIcon, platformOnly: true, comingSoon: true },
  { page: 'billing', label: 'Billing', icon: CreditCardIcon, platformOnly: true },
  { page: 'settings', label: 'Settings', icon: CogIcon },
];

export function NavSidebar({ currentPage, onNavigate, mode, email, onConnectAccount }: NavSidebarProps) {
  const visibleItems = mode === 'byok'
    ? NAV_ITEMS.filter(item => !item.platformOnly)
    : NAV_ITEMS;

  return (
    <nav className="flex shrink-0 items-center gap-1 border-b border-[var(--border-card)] bg-[var(--bg-card)] px-3 py-2">
      {/* Logo */}
      <span className="mr-2 bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)] bg-clip-text text-xs font-semibold text-transparent">
        Ava
      </span>

      {/* Tab icons */}
      {visibleItems.map(({ page, label, icon: Icon, comingSoon }) => {
        if (comingSoon) {
          return (
            <div
              key={page}
              className="relative flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-lg text-[var(--text-muted)]"
              title={`${label} (Coming Soon)`}
            >
              <Icon className="h-4 w-4" />
            </div>
          );
        }
        const isActive = currentPage === page;
        return (
          <button
            key={page}
            onClick={() => onNavigate(page)}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border-none transition ${
              isActive
                ? 'bg-[var(--bg-input)] text-white'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-input)] hover:text-white'
            }`}
            title={label}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Account section */}
      {mode === 'platform' ? (
        <div className="flex items-center gap-2">
          {email && (
            <span className="truncate text-[10px] text-[var(--text-muted)]" style={{ maxWidth: '120px' }}>{email}</span>
          )}
          <button
            onClick={() => post({ type: 'disconnect_account' })}
            className="rounded-md border border-red-500/30 bg-transparent px-2 py-1 text-[10px] text-red-400 transition hover:bg-red-500/10"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <button
          onClick={onConnectAccount}
          className="rounded-md border border-[var(--accent)]/40 bg-transparent px-2 py-1 text-[10px] text-[var(--accent)] transition hover:bg-[var(--accent)]/10"
        >
          Connect
        </button>
      )}
    </nav>
  );
}
