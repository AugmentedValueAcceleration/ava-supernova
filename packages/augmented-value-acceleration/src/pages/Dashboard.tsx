const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
};

const formatDate = () => new Date().toLocaleDateString('en-GB', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});

const stats = [
  { label: 'Total Users', value: '1,234', icon: '👥', color: '#a855f7' },
  { label: 'Revenue', value: '$0', sub: 'Pre-launch', icon: '💰', color: '#10b981' },
  { label: 'Active Projects', value: '3', icon: '📁', color: '#f59e0b' },
  { label: 'Open Tickets', value: '0', icon: '🎫', color: '#ef4444' },
];

const quickActions = [
  { label: 'Create Content', icon: '✏️', page: 'creative-studio' },
  { label: 'Check News', icon: '📰', page: 'news' },
  { label: 'View Financials', icon: '📊', page: 'financials' },
  { label: 'Run Security Scan', icon: '🔒', page: 'security' },
];

const recentActivity = [
  { text: 'Published v0.21.4 to VS Code Marketplace', time: '2h ago' },
  { text: 'Nested system prompt architecture shipped', time: '4h ago' },
  { text: 'FocusFlow app built live on stream', time: '6h ago' },
  { text: '1,200 installs milestone reached', time: '8h ago' },
  { text: 'Feedback + self-improvement system deployed', time: '12h ago' },
];

interface DashboardProps {
  onNavigate: (page: string) => void;
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  return (
    <div style={{ padding: '40px 48px', overflowY: 'auto', height: '100%', background: '#0a0a1a' }}>

      {/* Header */}
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#fff', margin: 0 }}>{getGreeting()}, Stewart</h1>
        <p style={{ fontSize: 14, color: '#6b7280', marginTop: 6 }}>{formatDate()}</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, marginBottom: 48 }}>
        {stats.map((s) => (
          <div key={s.label} style={{
            background: '#111127',
            border: '1px solid #1f1f3a',
            borderRadius: 16,
            padding: '28px 24px',
          }}>
            <div style={{ fontSize: 28, marginBottom: 16 }}>{s.icon}</div>
            <div style={{ fontSize: 36, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 8 }}>
              {s.label}
              {s.sub && <span style={{ marginLeft: 6, opacity: 0.6 }}>· {s.sub}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 10, fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase' as const, color: '#6b7280', marginBottom: 16 }}>Quick Actions</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {quickActions.map((a) => (
            <button
              key={a.label}
              onClick={() => onNavigate(a.page)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                background: '#111127',
                border: '1px solid #1f1f3a',
                borderRadius: 16,
                padding: '20px 24px',
                cursor: 'pointer',
                color: '#fff',
                fontSize: 14,
                fontWeight: 500,
                transition: 'border-color 0.2s',
              }}
              onMouseOver={(e) => e.currentTarget.style.borderColor = '#a855f7'}
              onMouseOut={(e) => e.currentTarget.style.borderColor = '#1f1f3a'}
            >
              <span style={{ fontSize: 24 }}>{a.icon}</span>
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 10, fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase' as const, color: '#6b7280', marginBottom: 16 }}>Recent Activity</h2>
        <div style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 16, overflow: 'hidden' }}>
          {recentActivity.map((item, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 24px',
                borderBottom: i < recentActivity.length - 1 ? '1px solid #1f1f3a' : 'none',
              }}
            >
              <span style={{ fontSize: 14, color: '#e5e7eb' }}>{item.text}</span>
              <span style={{ fontSize: 12, color: '#6b7280', flexShrink: 0, marginLeft: 16 }}>{item.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
