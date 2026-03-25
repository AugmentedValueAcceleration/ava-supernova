import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import { theme, pageStyle, cardStyle, statCardStyle, primaryBtnStyle, ghostBtnStyle, tableHeaderStyle, tableCellStyle, chipStyle, sectionHeaderStyle } from '../lib/theme';

const PLANS = [
  { tier: 'Free', price: '$0', period: '/month', tokens: '3M tokens', features: ['Qwen models', 'Basic tools', 'Community support'], color: theme.textSecondary, current: true },
  { tier: 'Pro', price: '$29', period: '/month', tokens: '50M tokens', features: ['All open-source models', 'Full 54 tools', 'Priority support'], color: theme.blue, current: false },
  { tier: 'Ultra', price: '$79', period: '/month', tokens: '200M tokens', features: ['All models inc. Anthropic', 'Priority routing', 'Advanced analytics'], color: theme.accent, current: false },
  { tier: 'Enterprise', price: '$249', period: '/month', tokens: 'Unlimited', features: ['Custom models', 'Dedicated support', 'SLA guarantee', 'Team management'], color: theme.yellow, current: false },
];

const PLACEHOLDER_PAYMENTS = [
  { date: '2026-03-01', amount: '$0.00', description: 'Free tier — no charge', status: 'completed' },
];

export default function UserBilling() {
  const [currentPlan] = useState('Free');

  return (
    <div style={pageStyle}>
      <PageHeader title="My Plan" subtitle="Manage your subscription and billing." />

      {/* Current Plan Card */}
      <div style={{
        ...cardStyle, marginBottom: 24,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={sectionHeaderStyle}>Current Plan</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
            <span style={{ fontSize: 32, fontWeight: 800, color: theme.text }}>{currentPlan}</span>
            <span style={{ fontSize: 13, color: theme.textMuted }}>$0/month</span>
          </div>
          <div style={{ fontSize: 12, color: theme.textSecondary, marginTop: 8 }}>3M tokens/month included</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: theme.textMuted }}>Next billing date</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: theme.text, marginTop: 4 }}>N/A (Free tier)</div>
        </div>
      </div>

      {/* Plans Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {PLANS.map(plan => (
          <div key={plan.tier} style={{
            ...cardStyle,
            border: plan.current ? `2px solid ${theme.accent}` : `1px solid ${theme.border}`,
            display: 'flex', flexDirection: 'column',
          }}>
            {plan.current && (
              <div style={{
                fontSize: 9, fontWeight: 700, color: theme.accent, textTransform: 'uppercase' as const,
                letterSpacing: '1px', marginBottom: 8,
              }}>
                Current Plan
              </div>
            )}
            <div style={{ fontSize: 16, fontWeight: 600, color: plan.color, marginBottom: 4 }}>{plan.tier}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginBottom: 4 }}>
              <span style={{ fontSize: 28, fontWeight: 800, color: theme.text }}>{plan.price}</span>
              <span style={{ fontSize: 12, color: theme.textMuted }}>{plan.period}</span>
            </div>
            <div style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 16 }}>{plan.tokens}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, marginBottom: 16 }}>
              {plan.features.map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: theme.textSecondary }}>
                  <div style={{ width: 4, height: 4, borderRadius: '50%', background: plan.color, flexShrink: 0 }} />
                  {f}
                </div>
              ))}
            </div>
            <button
              disabled={plan.current}
              style={{
                ...(plan.current ? ghostBtnStyle : primaryBtnStyle),
                width: '100%', padding: '10px 16px',
                color: plan.current ? theme.textMuted : '#fff',
                cursor: plan.current ? 'default' : 'pointer',
              }}
            >
              {plan.current ? 'Current' : 'Upgrade'}
            </button>
          </div>
        ))}
      </div>

      {/* Payment History */}
      <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${theme.border}` }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: theme.text, margin: 0 }}>Payment History</h2>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
              {['Date', 'Description', 'Amount', 'Status'].map(h => (
                <th key={h} style={tableHeaderStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PLACEHOLDER_PAYMENTS.map((p, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${theme.border}` }}>
                <td style={{ ...tableCellStyle, color: theme.textSecondary }}>{p.date}</td>
                <td style={{ ...tableCellStyle, color: theme.text }}>{p.description}</td>
                <td style={{ ...tableCellStyle, color: theme.textSecondary }}>{p.amount}</td>
                <td style={tableCellStyle}>
                  <span style={chipStyle(theme.greenBg, theme.green)}>
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
