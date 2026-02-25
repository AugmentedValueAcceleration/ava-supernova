import { TierBadge } from '../components/TierBadge';
import { UsageBar } from '../components/UsageBar';
import { post } from '../App';
import type { AccountInfo, ConnectionStatus, Page } from '../types/messages';

interface OverviewProps {
  account: AccountInfo;
  connections: ConnectionStatus;
  onNavigate: (page: Page) => void;
}

const CONNECTION_ICONS: Record<string, string> = {
  github: '🐙',
  email: '📧',
  slack: '💬',
  discord: '🎮',
};

export function Overview({ account, connections, onNavigate }: OverviewProps) {
  const connectedCount = Object.values(connections).filter(Boolean).length;

  return (
    <div style={{ maxWidth: '600px' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1
          style={{
            fontSize: '20px',
            fontWeight: 700,
            marginBottom: '4px',
            background: 'linear-gradient(135deg, #a78bfa, #c084fc)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Ava | Supernova
        </h1>
        <p style={{ opacity: 0.6, fontSize: '13px' }}>{account.email}</p>
      </div>

      {/* Account card */}
      <Card style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <TierBadge tier={account.tier} />
          {account.usage?.period_end && (
            <span style={{ fontSize: '12px', opacity: 0.5 }}>
              Renews {new Date(account.usage.period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}
        </div>

        {/* Usage */}
        {account.tier === 'pro' && account.usage && account.usage.tokens_limit !== null && (
          <div>
            <p style={{ fontSize: '12px', fontWeight: 600, opacity: 0.5, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Token Usage This Month
            </p>
            <UsageBar used={account.usage.tokens_used} limit={account.usage.tokens_limit} />
            {account.usage.tokens_used >= account.usage.tokens_limit * 0.95 && (
              <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                <ActionButton onClick={() => post({ type: 'open_topup', package: 'starter' })}>
                  Top Up Tokens
                </ActionButton>
                <ActionButton variant="secondary" onClick={() => post({ type: 'open_checkout', plan: 'ultra' })}>
                  Upgrade to Ultra
                </ActionButton>
              </div>
            )}
          </div>
        )}

        {account.tier === 'ultra' && (
          <p style={{ fontSize: '13px', color: '#a78bfa', fontWeight: 500 }}>
            ∞ Unlimited tokens
          </p>
        )}

        {account.tier === 'free' && (
          <div>
            <p style={{ fontSize: '13px', opacity: 0.7, marginBottom: '12px' }}>
              Using your own API keys. Upgrade for managed access — no configuration needed.
            </p>
            <ActionButton onClick={() => post({ type: 'open_checkout', plan: 'pro' })}>
              Upgrade to Pro — $19/mo
            </ActionButton>
          </div>
        )}
      </Card>

      {/* Connected services */}
      <Card style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <p style={{ fontSize: '12px', fontWeight: 600, opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Connected Services
          </p>
          <span style={{ fontSize: '12px', opacity: 0.5 }}>
            {connectedCount}/4 connected
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {(Object.entries(connections) as Array<[keyof ConnectionStatus, boolean]>).map(([service, connected]) => (
            <div
              key={service}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '20px',
                background: connected ? '#14532d22' : 'var(--vscode-editorWidget-background)',
                border: `1px solid ${connected ? '#16a34a44' : 'var(--vscode-panel-border, #333)'}`,
                fontSize: '12px',
              }}
            >
              <span>{CONNECTION_ICONS[service]}</span>
              <span style={{ textTransform: 'capitalize', opacity: connected ? 1 : 0.5 }}>{service}</span>
              <span style={{ color: connected ? '#22c55e' : '#6b7280', fontSize: '10px' }}>
                {connected ? '✓' : '✗'}
              </span>
            </div>
          ))}
        </div>
        {connectedCount < 4 && (
          <button
            onClick={() => onNavigate('connections')}
            style={{
              marginTop: '12px',
              background: 'none',
              border: 'none',
              color: 'var(--vscode-textLink-foreground)',
              cursor: 'pointer',
              fontSize: '12px',
              padding: 0,
              fontFamily: 'inherit',
            }}
          >
            Set up connections →
          </button>
        )}
      </Card>

      {/* Quick actions */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <ActionButton variant="secondary" onClick={() => onNavigate('billing')}>
          Manage Billing
        </ActionButton>
        <ActionButton variant="secondary" onClick={() => onNavigate('memory')}>
          View Memory
        </ActionButton>
        <ActionButton variant="secondary" onClick={() => post({ type: 'open_chat' })}>
          Open Chat
        </ActionButton>
      </div>
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: 'var(--vscode-editorWidget-background)',
        border: '1px solid var(--vscode-panel-border, #333)',
        borderRadius: '8px',
        padding: '18px',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  variant = 'primary',
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 14px',
        borderRadius: '6px',
        border: variant === 'secondary' ? '1px solid var(--vscode-panel-border, #555)' : 'none',
        background: variant === 'primary' ? '#7c3aed' : 'transparent',
        color: variant === 'primary' ? '#fff' : 'var(--vscode-foreground)',
        fontSize: '12px',
        fontWeight: 500,
        cursor: 'pointer',
        fontFamily: 'var(--vscode-font-family)',
      }}
    >
      {children}
    </button>
  );
}
