import type { Page } from '../types/messages';

interface NavSidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

const NAV_ITEMS: Array<{ page: Page; icon: string; label: string }> = [
  { page: 'overview', icon: '⚡', label: 'Overview' },
  { page: 'memory', icon: '🧠', label: 'Memory' },
  { page: 'connections', icon: '🔗', label: 'Connections' },
  { page: 'billing', icon: '💳', label: 'Billing' },
  { page: 'settings', icon: '⚙️', label: 'Settings' },
];

export function NavSidebar({ currentPage, onNavigate }: NavSidebarProps) {
  return (
    <nav
      style={{
        width: '180px',
        flexShrink: 0,
        borderRight: '1px solid var(--vscode-panel-border, #333)',
        padding: '16px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: '8px 12px 16px',
          marginBottom: '8px',
          borderBottom: '1px solid var(--vscode-panel-border, #333)',
        }}
      >
        <span
          style={{
            fontSize: '13px',
            fontWeight: 600,
            background: 'linear-gradient(135deg, #a78bfa, #c084fc)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Ava | Supernova
        </span>
      </div>

      {NAV_ITEMS.map(({ page, icon, label }) => {
        const isActive = currentPage === page;
        return (
          <button
            key={page}
            onClick={() => onNavigate(page)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 12px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: '13px',
              fontFamily: 'var(--vscode-font-family)',
              fontWeight: isActive ? 600 : 400,
              background: isActive
                ? 'var(--vscode-list-activeSelectionBackground, #a78bfa22)'
                : 'transparent',
              color: isActive
                ? 'var(--vscode-list-activeSelectionForeground, #a78bfa)'
                : 'var(--vscode-foreground)',
              opacity: isActive ? 1 : 0.75,
              transition: 'background 0.15s, opacity 0.15s',
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLButtonElement).style.background =
                  'var(--vscode-list-hoverBackground)';
                (e.currentTarget as HTMLButtonElement).style.opacity = '1';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.opacity = '0.75';
              }
            }}
          >
            <span style={{ fontSize: '14px' }}>{icon}</span>
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
