import { useEffect, useState } from 'react';
import { getStats, getRecentActivity } from '../lib/supabase';
import PageHeader from '../components/PageHeader';
import { theme, pageStyle, sectionHeaderStyle } from '../lib/theme';

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
};

const formatDate = () => new Date().toLocaleDateString('en-GB', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});

interface DashboardProps {
  onNavigate: (page: string) => void;
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const [stats, setStats] = useState({ totalUsers: 0, openTickets: 0, totalScans: 0 });
  const [activity, setActivity] = useState<Array<{ text: string; time: string }>>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [s, a] = await Promise.all([getStats(), getRecentActivity()]);
      setStats(s);
      setActivity(a);
    } catch {
      // silent
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const statCards = [
    { label: 'Total Users', value: loading ? '...' : stats.totalUsers.toLocaleString(), icon: '👥', color: theme.accent },
    { label: 'Revenue', value: '$0', sub: 'Pre-launch', icon: '💰', color: theme.green },
    { label: 'Active Projects', value: '3', icon: '📁', color: theme.yellow },
    { label: 'Open Tickets', value: loading ? '...' : String(stats.openTickets), icon: '🎫', color: theme.red },
  ];

  const quickActions = [
    { label: 'Create Content', icon: '✏️', page: 'creative-studio' },
    { label: 'Check News', icon: '📰', page: 'news' },
    { label: 'View Financials', icon: '📊', page: 'financials' },
    { label: 'Run Security Scan', icon: '🔒', page: 'security' },
  ];

  return (
    <div style={pageStyle}>

      <PageHeader title={`${getGreeting()}, Stewart`} subtitle={formatDate()} onRefresh={fetchData} />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, marginBottom: 48 }}>
        {statCards.map((s) => (
          <div key={s.label} style={{
            background: theme.cardBg,
            border: `1px solid ${theme.border}`,
            borderRadius: theme.radiusLg,
            padding: '28px 24px',
            transition: 'border-color 0.2s',
          }}
            onMouseOver={(e) => e.currentTarget.style.borderColor = theme.accent}
            onMouseOut={(e) => e.currentTarget.style.borderColor = theme.border}
          >
            <div style={{
              width: 44, height: 44, borderRadius: theme.radiusMd,
              background: theme.inputBg, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, marginBottom: 16,
            }}>{s.icon}</div>
            <div style={{ fontSize: 36, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 8 }}>
              {s.label}
              {s.sub && <span style={{ marginLeft: 6, opacity: 0.6 }}>&middot; {s.sub}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div style={{ marginBottom: 48 }}>
        <h2 style={{ ...sectionHeaderStyle, marginBottom: 16 }}>Quick Actions</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 16 }}>
          {quickActions.map((a) => (
            <button
              key={a.label}
              onClick={() => onNavigate(a.page)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                background: theme.cardBg,
                border: `1px solid ${theme.border}`,
                borderRadius: theme.radiusLg,
                padding: '20px 24px',
                cursor: 'pointer',
                color: theme.text,
                fontSize: 14,
                fontWeight: 500,
                transition: 'border-color 0.2s',
              }}
              onMouseOver={(e) => e.currentTarget.style.borderColor = theme.accent}
              onMouseOut={(e) => e.currentTarget.style.borderColor = theme.border}
            >
              <span style={{
                width: 40, height: 40, borderRadius: theme.radiusSm,
                background: theme.inputBg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, flexShrink: 0,
              }}>{a.icon}</span>
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div style={{ marginBottom: 40 }}>
        <h2 style={{ ...sectionHeaderStyle, marginBottom: 16 }}>Recent Releases</h2>
        <div style={{
          background: theme.cardBg, border: `1px solid ${theme.border}`,
          borderRadius: theme.radiusLg, overflow: 'hidden', marginTop: 16,
        }}>
          {loading ? (
            <div style={{ padding: '24px', textAlign: 'center', color: theme.textMuted }}>Loading...</div>
          ) : activity.length === 0 ? (
            <div style={{ padding: '48px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.5 }}>📋</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: theme.textSecondary, marginBottom: 4 }}>No recent activity</div>
              <div style={{ fontSize: 13, color: theme.textMuted }}>Activity will appear here as it happens</div>
            </div>
          ) : (
            activity.map((item, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 24px',
                  borderBottom: i < activity.length - 1 ? `1px solid ${theme.border}` : 'none',
                  transition: 'background 0.15s',
                  cursor: 'default',
                }}
                onMouseOver={(e) => e.currentTarget.style.background = theme.hoverBg}
                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ fontSize: 14, color: theme.text }}>{item.text}</span>
                <span style={{ fontSize: 12, color: theme.textMuted, flexShrink: 0, marginLeft: 16 }}>{item.time}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
