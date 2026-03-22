import { useState } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
  badge?: React.ReactNode;
  children?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, onRefresh, badge, children }: PageHeaderProps) {
  const [spinning, setSpinning] = useState(false);

  const handleRefresh = () => {
    if (!onRefresh || spinning) return;
    setSpinning(true);
    onRefresh();
    setTimeout(() => setSpinning(false), 1000);
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: 0 }}>{title}</h1>
          {subtitle && <p style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>{subtitle}</p>}
        </div>
        {badge}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {children}
        {onRefresh && (
          <button
            onClick={handleRefresh}
            title="Refresh"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 36, height: 36, borderRadius: 10,
              background: '#111127', border: '1px solid #1f1f3a',
              color: '#9ca3af', cursor: 'pointer', transition: 'all 0.2s',
            }}
            onMouseOver={(e) => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.color = '#a855f7'; }}
            onMouseOut={(e) => { e.currentTarget.style.borderColor = '#1f1f3a'; e.currentTarget.style.color = '#9ca3af'; }}
          >
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ animation: spinning ? 'spin 0.6s linear' : 'none' }}
            >
              <path d="M21 2v6h-6" />
              <path d="M3 12a9 9 0 0115-6.7L21 8" />
              <path d="M3 22v-6h6" />
              <path d="M21 12a9 9 0 01-15 6.7L3 16" />
            </svg>
          </button>
        )}
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
