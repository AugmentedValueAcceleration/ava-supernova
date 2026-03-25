import { useState } from 'react';
import { theme } from '../lib/theme';

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
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.sectionGap }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 300, color: theme.text, margin: 0, letterSpacing: '-0.02em' }}>{title}</h1>
          {subtitle && <p style={{ fontSize: 14, color: theme.textMuted, marginTop: 6, margin: '6px 0 0 0', fontWeight: 300 }}>{subtitle}</p>}
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
              width: 40, height: 40, borderRadius: theme.radiusSm,
              background: 'transparent', border: 'none',
              color: theme.textMuted, cursor: 'pointer', transition: 'color 0.2s',
            }}
            onMouseOver={(e) => { e.currentTarget.style.color = theme.accent; }}
            onMouseOut={(e) => { e.currentTarget.style.color = theme.textMuted; }}
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
