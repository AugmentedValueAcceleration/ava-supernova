import { useState } from 'react';

export default function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  const handleMinimize = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().minimize();
    } catch { /* browser fallback */ }
  };

  const handleMaximize = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      if (await win.isMaximized()) {
        await win.unmaximize();
        setIsMaximized(false);
      } else {
        await win.maximize();
        setIsMaximized(true);
      }
    } catch { /* browser fallback */ }
  };

  const handleClose = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().close();
    } catch { window.close(); }
  };

  return (
    <div
      data-tauri-drag-region
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 48,
        padding: '0 20px',
        background: '#0f0a1a',
        borderBottom: '1px solid rgba(168, 85, 247, 0.12)',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 16, fontWeight: 400, color: '#a855f7' }}>AVA</span>
        <span style={{ fontSize: 12, color: '#4b5563' }}>|</span>
        <span style={{ fontSize: 13, fontWeight: 300, color: '#9ca3af', letterSpacing: '0.5px' }}>
          Augmented Value Acceleration
        </span>
      </div>

      {/* Window controls */}
      <div className="flex items-center gap-1 -mr-2">
        <button
          onClick={handleMinimize}
          className="flex items-center justify-center w-8 h-8 rounded hover:bg-white/5 transition-colors"
        >
          <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor" style={{ color: 'var(--text-muted)' }}>
            <rect width="10" height="1" />
          </svg>
        </button>
        <button
          onClick={handleMaximize}
          className="flex items-center justify-center w-8 h-8 rounded hover:bg-white/5 transition-colors"
        >
          {isMaximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1" style={{ color: 'var(--text-muted)' }}>
              <rect x="2" y="0" width="8" height="8" rx="1" />
              <rect x="0" y="2" width="8" height="8" rx="1" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1" style={{ color: 'var(--text-muted)' }}>
              <rect x="0.5" y="0.5" width="9" height="9" rx="1" />
            </svg>
          )}
        </button>
        <button
          onClick={handleClose}
          className="flex items-center justify-center w-8 h-8 rounded hover:bg-red-500/20 transition-colors group"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.2" style={{ color: 'var(--text-muted)' }} className="group-hover:text-red-400">
            <line x1="1" y1="1" x2="9" y2="9" />
            <line x1="9" y1="1" x2="1" y2="9" />
          </svg>
        </button>
      </div>
    </div>
  );
}
