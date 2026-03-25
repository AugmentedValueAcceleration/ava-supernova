import { useState, useEffect } from 'react';
import PageHeader from '../components/PageHeader';
import { supabase } from '../lib/supabase';
import { theme, pageStyle, cardStyle, statCardStyle, sectionHeaderStyle, primaryBtnStyle, ghostBtnStyle, inputStyle, tableCellStyle, tableHeaderStyle, chipStyle } from '../lib/theme';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  succeeded: { bg: theme.greenBg, text: theme.green },
  refunded: { bg: theme.yellowBg, text: theme.yellow },
  failed: { bg: theme.redBg, text: theme.red },
};

interface PlanSubscription {
  id: string;
  email: string;
  plan: string;
  status: string;
  started_at: string;
  amount: number;
}

export default function Billing() {
  const [tab, setTab] = useState<'overview' | 'plans' | 'topups'>('overview');
  const [freeCount, setFreeCount] = useState(() => {
    const saved = localStorage.getItem('ava-platform-free-users');
    return saved ? parseInt(saved, 10) : 1354;
  });
  const [editingFree, setEditingFree] = useState(false);
  const [freeInput, setFreeInput] = useState(String(freeCount));
  const [subscriptions, setSubscriptions] = useState<PlanSubscription[]>([]);
  const [subsLoading, setSubsLoading] = useState(false);

  const saveFreeCount = () => {
    const val = parseInt(freeInput, 10);
    if (!isNaN(val) && val >= 0) {
      setFreeCount(val);
      localStorage.setItem('ava-platform-free-users', String(val));
    }
    setEditingFree(false);
  };

  const loadSubscriptions = async () => {
    setSubsLoading(true);
    const { data } = await supabase
      .from('subscriptions')
      .select('id, email, plan, status, started_at, amount')
      .order('started_at', { ascending: false });
    setSubscriptions(data || []);
    setSubsLoading(false);
  };

  useEffect(() => { if (tab === 'plans') loadSubscriptions(); }, [tab]);

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
      <div style={{ display: 'flex', gap: 4, background: theme.cardBg, borderRadius: 10, padding: 4, marginBottom: 24 }}>
        <button onClick={() => setTab('overview')} style={tabStyle(tab === 'overview')}>Overview</button>
        <button onClick={() => setTab('plans')} style={tabStyle(tab === 'plans')}>Plans</button>
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
                <div style={{ fontSize: 22, fontWeight: 300, color: s.color, marginTop: 6, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 6 }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Subscription Breakdown */}
          <div style={{ ...cardStyle, marginBottom: 24 }}>
            <h2 style={{ fontSize: 14, fontWeight: 400, color: theme.text, margin: '0 0 16px 0' }}>Subscription Breakdown</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { tier: 'Free', count: freeCount, price: '$0', color: theme.textSecondary, editable: true },
                { tier: 'Pro', count: 0, price: '$19/mo', color: theme.blue, editable: false },
                { tier: 'Ultra', count: 0, price: '$39/mo', color: theme.accent, editable: false },
                { tier: 'Enterprise', count: 0, price: '$79/mo', color: theme.yellow, editable: false },
              ].map(t => (
                <div key={t.tier} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px', background: theme.surfaceBg, borderRadius: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 400, color: theme.text, width: 100 }}>{t.tier}</span>
                  <span style={{ fontSize: 13, color: theme.textSecondary, flex: 1 }}>{t.price}</span>
                  {t.editable && editingFree ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        value={freeInput}
                        onChange={e => setFreeInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveFreeCount(); if (e.key === 'Escape') setEditingFree(false); }}
                        autoFocus
                        style={{ ...inputStyle, width: 80, padding: '4px 8px', fontSize: 14, textAlign: 'right' }}
                      />
                      <button onClick={saveFreeCount} style={{ ...primaryBtnStyle, padding: '4px 10px', fontSize: 11 }}>Save</button>
                    </div>
                  ) : (
                    <span
                      style={{ fontSize: 20, fontWeight: 300, color: t.color, cursor: t.editable ? 'pointer' : 'default' }}
                      onClick={() => { if (t.editable) { setFreeInput(String(freeCount)); setEditingFree(true); } }}
                      title={t.editable ? 'Click to edit' : undefined}
                    >{t.count}</span>
                  )}
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

      {/* Plans Tab */}
      {tab === 'plans' && (
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                {['User', 'Plan', 'Amount', 'Started', 'Status'].map(h => (
                  <th key={h} style={tableHeaderStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subsLoading ? (
                <tr><td colSpan={5} style={{ ...tableCellStyle, textAlign: 'center', color: theme.textMuted }}>Loading...</td></tr>
              ) : subscriptions.length === 0 ? (
                <tr><td colSpan={5} style={{ ...tableCellStyle, textAlign: 'center', color: theme.textMuted, padding: '32px 16px' }}>No active subscriptions</td></tr>
              ) : subscriptions.map(sub => {
                const sc = STATUS_COLORS[sub.status] || STATUS_COLORS.succeeded;
                return (
                  <tr key={sub.id} style={{ borderBottom: `1px solid ${theme.border}` }}
                    onMouseOver={e => e.currentTarget.style.background = theme.inputBg}
                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ ...tableCellStyle, color: theme.text }}>{sub.email}</td>
                    <td style={{ ...tableCellStyle, color: theme.textSecondary }}>{sub.plan}</td>
                    <td style={{ ...tableCellStyle, color: theme.green, fontWeight: 400 }}>${sub.amount}</td>
                    <td style={{ ...tableCellStyle, color: theme.textMuted }}>{new Date(sub.started_at).toLocaleDateString('en-GB')}</td>
                    <td style={tableCellStyle}>
                      <span style={chipStyle(sc.bg, sc.text)}>{sub.status}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Top-ups Tab */}
      {tab === 'topups' && (
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                {['User', 'Tokens', 'Amount', 'Date', 'Status'].map(h => (
                  <th key={h} style={tableHeaderStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr><td colSpan={5} style={{ ...tableCellStyle, textAlign: 'center', color: theme.textMuted, padding: '32px 16px' }}>No top-ups yet</td></tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
