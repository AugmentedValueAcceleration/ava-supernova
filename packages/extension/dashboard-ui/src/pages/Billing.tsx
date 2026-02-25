import { post } from '../App';
import type { AccountInfo } from '../types/messages';
import { UsageBar } from '../components/UsageBar';
import { TierBadge } from '../components/TierBadge';

interface BillingProps {
  account: AccountInfo;
}

const TOPUP_PACKAGES = [
  { id: 'starter', label: '2.5M tokens', price: '$5', tokens: '2,500,000' },
  { id: 'standard', label: '12M tokens', price: '$20', tokens: '12,000,000' },
  { id: 'pro_pack', label: '50M tokens', price: '$70', tokens: '50,000,000' },
] as const;

const PLAN_FEATURES: Record<string, string[]> = {
  pro: [
    'Managed API access — no keys needed',
    '5M tokens / month included',
    'All supported models',
    'Top-up tokens anytime',
    'Priority support',
  ],
  ultra: [
    'Everything in Pro',
    'Unlimited tokens',
    'Highest-priority routing',
    'Early access to new models',
    'Rate-limited only during extreme load',
  ],
};

export function Billing({ account }: BillingProps) {
  return (
    <div style={{ maxWidth: '600px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1
          style={{
            fontSize: '18px',
            fontWeight: 700,
            marginBottom: '4px',
            background: 'linear-gradient(135deg, #a78bfa, #c084fc)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Billing
        </h1>
        <p style={{ opacity: 0.55, fontSize: '13px' }}>
          Manage your subscription and token usage.
        </p>
      </div>

      {/* Current plan */}
      <Card style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <TierBadge tier={account.tier} />
          {account.usage?.period_end && (
            <span style={{ fontSize: '12px', opacity: 0.5 }}>
              Renews {new Date(account.usage.period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}
        </div>

        {account.tier === 'pro' && account.usage && account.usage.tokens_limit !== null && (
          <div style={{ marginBottom: '16px' }}>
            <p style={{ fontSize: '12px', fontWeight: 600, opacity: 0.5, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Token Usage This Month
            </p>
            <UsageBar used={account.usage.tokens_used} limit={account.usage.tokens_limit} />
          </div>
        )}

        {account.tier === 'ultra' && (
          <p style={{ fontSize: '13px', color: '#a78bfa', fontWeight: 500, marginBottom: '16px' }}>
            ∞ Unlimited tokens
          </p>
        )}

        {account.tier !== 'free' && (
          <button
            onClick={() => post({ type: 'open_portal' })}
            style={{
              padding: '7px 14px',
              borderRadius: '5px',
              border: '1px solid var(--vscode-panel-border, #555)',
              background: 'transparent',
              color: 'var(--vscode-foreground)',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'var(--vscode-font-family)',
            }}
          >
            Manage Subscription →
          </button>
        )}
      </Card>

      {/* Top-ups (Pro only) */}
      {account.tier === 'pro' && (
        <Card style={{ marginBottom: '16px' }}>
          <p style={{ fontSize: '12px', fontWeight: 600, opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '14px' }}>
            Top Up Tokens
          </p>
          <p style={{ fontSize: '13px', opacity: 0.65, marginBottom: '14px' }}>
            Running low? Add extra tokens to your account — they never expire.
          </p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {TOPUP_PACKAGES.map(pkg => (
              <button
                key={pkg.id}
                onClick={() => post({ type: 'open_topup', package: pkg.id as 'starter' | 'standard' | 'pro_pack' })}
                style={{
                  padding: '12px 16px',
                  borderRadius: '6px',
                  border: '1px solid var(--vscode-panel-border, #444)',
                  background: 'var(--vscode-editorWidget-background)',
                  color: 'var(--vscode-foreground)',
                  cursor: 'pointer',
                  fontFamily: 'var(--vscode-font-family)',
                  textAlign: 'center',
                  minWidth: '100px',
                }}
              >
                <p style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 4px', color: '#a78bfa' }}>{pkg.price}</p>
                <p style={{ fontSize: '12px', opacity: 0.7, margin: 0 }}>{pkg.label}</p>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Upgrade cards */}
      {account.tier !== 'ultra' && (
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {account.tier === 'free' && (
            <UpgradeCard
              plan="pro"
              title="Pro"
              price="$19/mo"
              features={PLAN_FEATURES.pro}
              highlight={false}
              onUpgrade={() => post({ type: 'open_checkout', plan: 'pro' })}
            />
          )}
          <UpgradeCard
            plan="ultra"
            title="Ultra"
            price="$49/mo"
            features={PLAN_FEATURES.ultra}
            highlight={true}
            onUpgrade={() => post({ type: 'open_checkout', plan: 'ultra' })}
          />
        </div>
      )}
    </div>
  );
}

function UpgradeCard({
  title,
  price,
  features,
  highlight,
  onUpgrade,
}: {
  plan: string;
  title: string;
  price: string;
  features: string[];
  highlight: boolean;
  onUpgrade: () => void;
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: '220px',
        background: 'var(--vscode-editorWidget-background)',
        border: `1px solid ${highlight ? '#7c3aed66' : 'var(--vscode-panel-border, #333)'}`,
        borderRadius: '8px',
        padding: '18px',
      }}
    >
      <p style={{ fontSize: '15px', fontWeight: 700, marginBottom: '2px' }}>{title}</p>
      <p style={{ fontSize: '20px', fontWeight: 800, color: '#a78bfa', marginBottom: '14px' }}>{price}</p>
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {features.map(f => (
          <li key={f} style={{ fontSize: '12px', opacity: 0.75, display: 'flex', gap: '6px' }}>
            <span style={{ color: '#22c55e', flexShrink: 0 }}>✓</span>
            {f}
          </li>
        ))}
      </ul>
      <button
        onClick={onUpgrade}
        style={{
          width: '100%',
          padding: '8px',
          borderRadius: '6px',
          border: 'none',
          background: highlight ? '#7c3aed' : '#5b21b6',
          color: '#fff',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'var(--vscode-font-family)',
        }}
      >
        Upgrade to {title}
      </button>
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
