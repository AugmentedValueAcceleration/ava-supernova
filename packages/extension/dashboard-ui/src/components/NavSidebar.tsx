import { post } from '../App';
import type { Page } from '../types/messages';
import { BoltIcon, KeyIcon, ChartBarIcon, SparklesIcon, LinkIcon, ClockIcon, HelpCircleIcon, CreditCardIcon, CogIcon, ShieldIcon, WrenchIcon } from './Icons';

interface NavSidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  mode: 'platform' | 'byok';
  email?: string | null;
  isAdmin?: boolean;
  onConnectAccount?: () => void;
}

const NAV_ITEMS: Array<{ page: Page; label: string; icon: React.FC<{ className?: string }>; platformOnly?: boolean; adminOnly?: boolean; comingSoon?: boolean }> = [
  { page: 'overview', label: 'Overview', icon: BoltIcon },
  { page: 'keys', label: 'API Keys', icon: KeyIcon },
  { page: 'usage', label: 'Usage', icon: ChartBarIcon },
  { page: 'memory', label: 'Memory', icon: SparklesIcon },
  { page: 'connections', label: 'Connections', icon: LinkIcon, platformOnly: true, comingSoon: true },
  { page: 'history', label: 'History', icon: ClockIcon, platformOnly: true },
  { page: 'support', label: 'Support', icon: HelpCircleIcon },
  { page: 'billing', label: 'Plans & Billing', icon: CreditCardIcon, platformOnly: true },
  { page: 'settings', label: 'Settings', icon: CogIcon },
  // Admin pages
  { page: 'admin_support', label: 'Admin: Support', icon: ShieldIcon, platformOnly: true, adminOnly: true },
  { page: 'admin_proposals', label: 'Admin: Proposals', icon: WrenchIcon, platformOnly: true, adminOnly: true },
];

export function NavSidebar({ currentPage, onNavigate, mode, email, isAdmin, onConnectAccount }: NavSidebarProps) {
  const visibleItems = NAV_ITEMS.filter(item => {
    if (mode === 'byok' && item.platformOnly) return false;
    if (item.adminOnly && !isAdmin) return false;
    return true;
  });

  return (
    <nav className="flex w-56 shrink-0 flex-col border-r border-[var(--border-card)] bg-[var(--bg-card)]">
      {/* Logo */}
      <div className="border-b border-[var(--border-card)] px-6 py-4">
        <span className="bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)] bg-clip-text text-sm font-semibold text-transparent">
          Ava | Supernova
        </span>
      </div>

      {/* Navigation */}
      <div className="flex flex-1 flex-col gap-1 p-4">
        {visibleItems.map(({ page, label, icon: Icon, adminOnly, comingSoon }, idx) => {
          // Add divider before admin section
          const prevItem = visibleItems[idx - 1];
          const showDivider = adminOnly && prevItem && !prevItem.adminOnly;
          const elements: React.ReactNode[] = [];

          if (showDivider) {
            elements.push(
              <div key={`divider-${page}`} className="my-2 border-t border-[var(--border-card)]">
                <span className="mt-2 block px-3 text-[9px] font-bold uppercase tracking-wider text-red-400">Admin</span>
              </div>
            );
          }

          if (comingSoon) {
            elements.push(
              <div
                key={page}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-[var(--text-muted)] cursor-not-allowed"
              >
                <span className="w-4 shrink-0"><Icon className="h-4 w-4" /></span>
                <span>{label}</span>
                <span className="ml-auto rounded bg-[var(--bg-input)] px-1.5 py-0.5 text-[10px]">Soon</span>
              </div>
            );
            return elements;
          }

          const isActive = currentPage === page;
          elements.push(
            <button
              key={page}
              onClick={() => onNavigate(page)}
              className={`flex items-center gap-3 rounded-lg border-none px-3 py-2 text-left text-sm transition ${
                isActive
                  ? 'bg-[var(--bg-input)] font-medium text-white'
                  : adminOnly
                    ? 'text-red-400/70 hover:bg-[var(--bg-input)] hover:text-red-300'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-input)] hover:text-white'
              }`}
            >
              <span className="w-4 shrink-0"><Icon className="h-4 w-4" /></span>
              <span>{label.replace('Admin: ', '')}</span>
            </button>
          );
          return elements;
        })}

      </div>

      {/* Account section */}
      <div className="border-t border-[var(--border-card)] p-4">
        {mode === 'platform' ? (
          <>
            {email && (
              <p className="mb-2 truncate px-3 text-[10px] text-[var(--text-muted)]">{email}</p>
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
            <p className="mb-2 px-3 text-[10px] text-[var(--text-muted)]">Using your own API keys</p>
            <button
              onClick={onConnectAccount}
              className="w-full rounded-lg border border-[var(--accent)]/40 bg-transparent px-3 py-1.5 text-xs text-[var(--accent)] transition hover:bg-[var(--accent)]/10"
            >
              Connect Account
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
