import { useState } from 'react';
import PageHeader from '../components/PageHeader';

const PLACEHOLDER_TRANSACTIONS = [
  { id: '1', user: 'john.doe@example.com', amount: 29, plan: 'Pro', date: '2026-03-20', status: 'succeeded' },
  { id: '2', user: 'jane.smith@example.com', amount: 79, plan: 'Ultra', date: '2026-03-19', status: 'succeeded' },
  { id: '3', user: 'team@company.io', amount: 249, plan: 'Enterprise', date: '2026-03-18', status: 'succeeded' },
  { id: '4', user: 'dev@startup.com', amount: 29, plan: 'Pro', date: '2026-03-17', status: 'refunded' },
  { id: '5', user: 'alex@agency.co', amount: 79, plan: 'Ultra', date: '2026-03-16', status: 'succeeded' },
];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  succeeded: { bg: 'rgba(34, 197, 94, 0.12)', text: '#4ade80' },
  refunded: { bg: 'rgba(245, 158, 11, 0.12)', text: '#fbbf24' },
  failed: { bg: 'rgba(239, 68, 68, 0.12)', text: '#f87171' },
};

export default function Billing() {
  const [tab, setTab] = useState<'overview' | 'transactions' | 'topups'>('overview');

  const tabStyle = (isActive: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '10px 14px',
    fontSize: 12,
    fontWeight: isActive ? 600 : 400,
    color: isActive ? '#fff' : '#6b7280',
    background: isActive ? '#a855f7' : 'transparent',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
  });

  return (
    <div style={{ padding: '32px 40px', overflowY: 'auto', height: '100%', background: '#0a0a1a' }}>
      <PageHeader title="Billing" subtitle="Revenue overview and subscription management." />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, background: '#111127', border: '1px solid #1f1f3a', borderRadius: 10, padding: 4, marginBottom: 24 }}>
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
              { label: 'Monthly Recurring Revenue', value: '$0', sub: 'Pre-launch', color: '#4ade80' },
              { label: 'Total Revenue', value: '$0', sub: 'Lifetime', color: '#a855f7' },
              { label: 'Active Subscribers', value: '0', sub: 'Paid plans', color: '#60a5fa' },
              { label: 'Churn Rate', value: '0%', sub: 'Last 30 days', color: '#fbbf24' },
            ].map(s => (
              <div key={s.label} style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 14, padding: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: '#6b7280' }}>{s.label}</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: s.color, marginTop: 8, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Subscription Breakdown */}
          <div style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 14, padding: 24, marginBottom: 24 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: '#fff', margin: '0 0 16px 0' }}>Subscription Breakdown</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { tier: 'Free', count: 858, price: '$0', color: '#9ca3af' },
                { tier: 'Pro', count: 0, price: '$29/mo', color: '#60a5fa' },
                { tier: 'Ultra', count: 0, price: '$79/mo', color: '#a855f7' },
                { tier: 'Enterprise', count: 0, price: '$249/mo', color: '#fbbf24' },
              ].map(t => (
                <div key={t.tier} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px', background: '#0a0a1a', borderRadius: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#fff', width: 100 }}>{t.tier}</span>
                  <span style={{ fontSize: 13, color: '#9ca3af', flex: 1 }}>{t.price}</span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: t.color }}>{t.count}</span>
                  <span style={{ fontSize: 11, color: '#6b7280' }}>users</span>
                </div>
              ))}
            </div>
          </div>

          {/* Stripe Link */}
          <div style={{
            background: '#111127', border: '1px solid #1f1f3a', borderRadius: 14, padding: 24,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>Stripe Dashboard</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Access full revenue data, invoices, and subscription management.</div>
            </div>
            <a
              href="https://dashboard.stripe.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: '#a855f7', color: '#fff', padding: '10px 20px', borderRadius: 10,
                fontSize: 12, fontWeight: 600, textDecoration: 'none',
              }}
            >
              Open Stripe
            </a>
          </div>
        </div>
      )}

      {/* Transactions Tab */}
      {tab === 'transactions' && (
        <div style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1f1f3a' }}>
                {['User', 'Plan', 'Amount', 'Date', 'Status'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: '#6b7280', fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PLACEHOLDER_TRANSACTIONS.map(tx => {
                const sc = STATUS_COLORS[tx.status] || STATUS_COLORS.succeeded;
                return (
                  <tr key={tx.id} style={{ borderBottom: '1px solid #1f1f3a' }}>
                    <td style={{ padding: '10px 16px', color: '#fff' }}>{tx.user}</td>
                    <td style={{ padding: '10px 16px', color: '#9ca3af' }}>{tx.plan}</td>
                    <td style={{ padding: '10px 16px', color: '#4ade80', fontWeight: 600 }}>${tx.amount}</td>
                    <td style={{ padding: '10px 16px', color: '#6b7280' }}>{tx.date}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{
                        background: sc.bg, color: sc.text, fontSize: 10, fontWeight: 700,
                        padding: '3px 10px', borderRadius: 10, textTransform: 'capitalize' as const,
                      }}>
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: '16px 24px', textAlign: 'center', fontSize: 11, color: '#6b7280', borderTop: '1px solid #1f1f3a' }}>
            Placeholder data. Live transactions will sync from Stripe.
          </div>
        </div>
      )}

      {/* Top-ups Tab */}
      {tab === 'topups' && (
        <div style={{
          background: '#111127', border: '1px solid #1f1f3a', borderRadius: 14, padding: 40,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#9889;</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#9ca3af', marginBottom: 8 }}>Token Top-up History</div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>
            Top-up purchases will appear here once the token marketplace is live.
          </div>
        </div>
      )}
    </div>
  );
}
