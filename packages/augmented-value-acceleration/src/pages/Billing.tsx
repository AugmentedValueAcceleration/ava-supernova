import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import { theme, pageStyle, cardStyle, statCardStyle, sectionHeaderStyle, primaryBtnStyle, tableCellStyle, tableHeaderStyle, chipStyle } from '../lib/theme';

const PLACEHOLDER_TRANSACTIONS = [
  { id: '1', user: 'john.doe@example.com', amount: 29, plan: 'Pro', date: '2026-03-20', status: 'succeeded' },
  { id: '2', user: 'jane.smith@example.com', amount: 79, plan: 'Ultra', date: '2026-03-19', status: 'succeeded' },
  { id: '3', user: 'team@company.io', amount: 249, plan: 'Enterprise', date: '2026-03-18', status: 'succeeded' },
  { id: '4', user: 'dev@startup.com', amount: 29, plan: 'Pro', date: '2026-03-17', status: 'refunded' },
  { id: '5', user: 'alex@agency.co', amount: 79, plan: 'Ultra', date: '2026-03-16', status: 'succeeded' },
];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  succeeded: { bg: theme.greenBg, text: theme.green },
  refunded: { bg: theme.yellowBg, text: theme.yellow },
  failed: { bg: theme.redBg, text: theme.red },
};

export default function Billing() {
  const [tab, setTab] = useState<'overview' | 'transactions' | 'topups'>('overview');

  const tabStyle = (isActive: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '10px 14px',
    fontSize: 12,
    fontWeight: isActive ? 400 : 300,
    color: isActive ? '#fff' : theme.textMuted,
    background: isActive ? theme.accent : 'transparent',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
  });

  return (
    <div style={pageStyle}>
      <PageHeader title="Billing" subtitle="Revenue overview and subscription management." />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 4, marginBottom: 24 }}>
        <button onClick={() => setTab('overview')} style={tabStyle(tab === 'overview')}>Overview</button>
        <button onClick={() => setTab('transactions')} style={tabStyle(tab === 'transactions')}>Transactions</button>
        <button onClick={() => setTab('topups')} style={tabStyle(tab === 'topups')}>Top-ups</button>
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <div>
          {/* Revenue Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
            {[
              { label: 'Monthly Recurring Revenue', value: '$0', sub: 'Pre-launch', color: theme.green },
              { label: 'Total Revenue', value: '$0', sub: 'Lifetime', color: theme.accent },
              { label: 'Active Subscribers', value: '0', sub: 'Paid plans', color: theme.blue },
              { label: 'Churn Rate', value: '0%', sub: 'Last 30 days', color: theme.yellow },
            ].map(s => (
              <div key={s.label} style={statCardStyle}>
                <div style={{ fontSize: 11, fontWeight: 400, color: theme.textMuted }}>{s.label}</div>
                <div style={{ fontSize: 32, fontWeight: 300, color: s.color, marginTop: 8, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 6 }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Subscription Breakdown */}
          <div style={{ ...cardStyle, marginBottom: 24 }}>
            <h2 style={{ fontSize: 14, fontWeight: 400, color: theme.text, margin: '0 0 16px 0' }}>Subscription Breakdown</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { tier: 'Free', count: 858, price: '$0', color: theme.textSecondary },
                { tier: 'Pro', count: 0, price: '$29/mo', color: theme.blue },
                { tier: 'Ultra', count: 0, price: '$79/mo', color: theme.accent },
                { tier: 'Enterprise', count: 0, price: '$249/mo', color: theme.yellow },
              ].map(t => (
                <div key={t.tier} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px', background: theme.surfaceBg, borderRadius: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 400, color: theme.text, width: 100 }}>{t.tier}</span>
                  <span style={{ fontSize: 13, color: theme.textSecondary, flex: 1 }}>{t.price}</span>
                  <span style={{ fontSize: 20, fontWeight: 300, color: t.color }}>{t.count}</span>
                  <span style={{ fontSize: 11, color: theme.textMuted }}>users</span>
                </div>
              ))}
            </div>
          </div>

          {/* Stripe Link */}
          <div style={{
            ...cardStyle,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 400, color: theme.text }}>Stripe Dashboard</div>
              <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>Access full revenue data, invoices, and subscription management.</div>
            </div>
            <a
              href="https://dashboard.stripe.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                ...primaryBtnStyle,
                textDecoration: 'none',
              }}
            >
              Open Stripe
            </a>
          </div>
        </div>
      )}

      {/* Transactions Tab */}
      {tab === 'transactions' && (
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                {['User', 'Plan', 'Amount', 'Date', 'Status'].map(h => (
                  <th key={h} style={tableHeaderStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PLACEHOLDER_TRANSACTIONS.map(tx => {
                const sc = STATUS_COLORS[tx.status] || STATUS_COLORS.succeeded;
                return (
                  <tr key={tx.id} style={{ borderBottom: `1px solid ${theme.border}` }}
                    onMouseOver={e => e.currentTarget.style.background = theme.inputBg}
                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ ...tableCellStyle, color: theme.text }}>{tx.user}</td>
                    <td style={{ ...tableCellStyle, color: theme.textSecondary }}>{tx.plan}</td>
                    <td style={{ ...tableCellStyle, color: theme.green, fontWeight: 400 }}>${tx.amount}</td>
                    <td style={{ ...tableCellStyle, color: theme.textMuted }}>{tx.date}</td>
                    <td style={tableCellStyle}>
                      <span style={chipStyle(sc.bg, sc.text)}>
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: '16px 24px', textAlign: 'center', fontSize: 11, color: theme.textMuted, borderTop: `1px solid ${theme.border}` }}>
            Placeholder data. Live transactions will sync from Stripe.
          </div>
        </div>
      )}

      {/* Top-ups Tab */}
      {tab === 'topups' && (
        <div style={{
          ...cardStyle, padding: 40,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#9889;</div>
          <div style={{ fontSize: 16, fontWeight: 400, color: theme.textSecondary, marginBottom: 8 }}>Token Top-up History</div>
          <div style={{ fontSize: 13, color: theme.textMuted }}>
            Top-up purchases will appear here once the token marketplace is live.
          </div>
        </div>
      )}
    </div>
  );
}
