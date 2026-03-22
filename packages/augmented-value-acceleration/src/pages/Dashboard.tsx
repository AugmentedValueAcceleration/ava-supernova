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
  { label: 'Total Users', value: '1,234', icon: '👥', color: 'var(--ava-purple)' },
  { label: 'Revenue', value: '$0', sub: 'Pre-launch', icon: '💰', color: 'var(--success)' },
  { label: 'Active Projects', value: '3', icon: '📁', color: 'var(--warning)' },
  { label: 'Open Tickets', value: '0', icon: '🎫', color: 'var(--danger)' },
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
    <div className="p-8 overflow-y-auto h-full">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold">{getGreeting()}, Stewart</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{formatDate()}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-lg">{s.icon}</span>
            </div>
            <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              {s.label}
              {s.sub && <span className="ml-1 opacity-60">· {s.sub}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-xs font-semibold tracking-[1.5px] uppercase mb-3" style={{ color: 'var(--text-muted)' }}>Quick Actions</h2>
        <div className="grid grid-cols-4 gap-3">
          {quickActions.map((a) => (
            <button
              key={a.label}
              onClick={() => onNavigate(a.page)}
              className="flex items-center gap-3 rounded-xl p-4 transition-all cursor-pointer hover:scale-[1.02]"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}
            >
              <span className="text-xl">{a.icon}</span>
              <span className="text-sm font-medium">{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <h2 className="text-xs font-semibold tracking-[1.5px] uppercase mb-3" style={{ color: 'var(--text-muted)' }}>Recent Activity</h2>
        <div className="rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
          {recentActivity.map((item, i) => (
            <div
              key={i}
              className="flex items-center justify-between px-5 py-3"
              style={{ borderBottom: i < recentActivity.length - 1 ? '1px solid var(--border-card)' : 'none' }}
            >
              <span className="text-sm">{item.text}</span>
              <span className="text-xs shrink-0 ml-4" style={{ color: 'var(--text-muted)' }}>{item.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
