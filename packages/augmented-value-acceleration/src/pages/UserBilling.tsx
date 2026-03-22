import { useState } from 'react';

const PLANS = [
  { tier: 'Free', price: '$0', period: '/month', tokens: '3M tokens', features: ['Qwen models', 'Basic tools', 'Community support'], color: '#9ca3af', current: true },
  { tier: 'Pro', price: '$29', period: '/month', tokens: '50M tokens', features: ['All open-source models', 'Full 54 tools', 'Priority support'], color: '#60a5fa', current: false },
  { tier: 'Ultra', price: '$79', period: '/month', tokens: '200M tokens', features: ['All models inc. Anthropic', 'Priority routing', 'Advanced analytics'], color: '#a855f7', current: false },
  { tier: 'Enterprise', price: '$249', period: '/month', tokens: 'Unlimited', features: ['Custom models', 'Dedicated support', 'SLA guarantee', 'Team management'], color: '#fbbf24', current: false },
];

const PLACEHOLDER_PAYMENTS = [
  { date: '2026-03-01', amount: '$0.00', description: 'Free tier — no charge', status: 'completed' },
];

export default function UserBilling() {
  const [currentPlan] = useState('Free');

  return (
    <div style={{ padding: '32px 40px', overflowY: 'auto', height: '100%', background: '#0a0a1a' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: 0 }}>My Plan</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4, marginBottom: 24 }}>
        Manage your subscription and billing.
      </p>

      {/* Current Plan Card */}
      <div style={{
        background: '#111127', border: '1px solid #1f1f3a', borderRadius: 14, padding: 24, marginBottom: 24,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase' as const, color: '#6b7280', marginBottom: 8 }}>
            Current Plan
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 32, fontWeight: 800, color: '#fff' }}>{currentPlan}</span>
            <span style={{ fontSize: 13, color: '#6b7280' }}>$0/month</span>
          </div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 8 }}>3M tokens/month included</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: '#6b7280' }}>Next billing date</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#fff', marginTop: 4 }}>N/A (Free tier)</div>
        </div>
      </div>

      {/* Plans Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {PLANS.map(plan => (
          <div key={plan.tier} style={{
            background: '#111127',
            border: plan.current ? '2px solid #a855f7' : '1px solid #1f1f3a',
            borderRadius: 14, padding: 24,
            display: 'flex', flexDirection: 'column',
          }}>
            {plan.current && (
              <div style={{
                fontSize: 9, fontWeight: 700, color: '#a855f7', textTransform: 'uppercase' as const,
                letterSpacing: '1px', marginBottom: 8,
              }}>
                Current Plan
              </div>
            )}
            <div style={{ fontSize: 16, fontWeight: 600, color: plan.color, marginBottom: 4 }}>{plan.tier}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginBottom: 4 }}>
              <span style={{ fontSize: 28, fontWeight: 800, color: '#fff' }}>{plan.price}</span>
              <span style={{ fontSize: 12, color: '#6b7280' }}>{plan.period}</span>
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 16 }}>{plan.tokens}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, marginBottom: 16 }}>
              {plan.features.map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#9ca3af' }}>
                  <div style={{ width: 4, height: 4, borderRadius: '50%', background: plan.color, flexShrink: 0 }} />
                  {f}
                </div>
              ))}
            </div>
            <button
              disabled={plan.current}
              style={{
                width: '100%', padding: '10px 16px', borderRadius: 10, border: 'none',
                fontSize: 12, fontWeight: 600, cursor: plan.current ? 'default' : 'pointer',
                background: plan.current ? '#1a1a35' : '#a855f7',
                color: plan.current ? '#6b7280' : '#fff',
              }}
            >
              {plan.current ? 'Current' : 'Upgrade'}
            </button>
          </div>
        ))}
      </div>

      {/* Payment History */}
      <div style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #1f1f3a' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#fff', margin: 0 }}>Payment History</h2>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1f1f3a' }}>
              {['Date', 'Description', 'Amount', 'Status'].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: '#6b7280', fontSize: 11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PLACEHOLDER_PAYMENTS.map((p, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #1f1f3a' }}>
                <td style={{ padding: '10px 16px', color: '#9ca3af' }}>{p.date}</td>
                <td style={{ padding: '10px 16px', color: '#fff' }}>{p.description}</td>
                <td style={{ padding: '10px 16px', color: '#9ca3af' }}>{p.amount}</td>
                <td style={{ padding: '10px 16px' }}>
                  <span style={{
                    background: 'rgba(34, 197, 94, 0.12)', color: '#4ade80', fontSize: 10, fontWeight: 700,
                    padding: '3px 10px', borderRadius: 10, textTransform: 'capitalize' as const,
                  }}>
                    {p.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
