import { useState } from 'react';
import { post } from '../App';

export function ConnectAccount() {
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = () => {
    const trimmed = key.trim();
    if (!trimmed.startsWith('sk-ava-')) {
      setError('Key must start with sk-ava-');
      return;
    }
    setError(null);
    setLoading(true);
    post({ type: 'connect_account', key: trimmed });
    // Extension host will respond with account_updated or error
    setTimeout(() => setLoading(false), 8000);
  };

  return (
    <div style={{ maxWidth: '480px', margin: '48px auto' }}>
      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <h1
          style={{
            fontSize: '24px',
            fontWeight: 700,
            background: 'linear-gradient(135deg, #a78bfa, #c084fc)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '8px',
          }}
        >
          Ava | Supernova
        </h1>
        <p style={{ opacity: 0.6, fontSize: '13px' }}>
          Connect your account for managed API access and cloud sync
        </p>
      </div>

      {/* Steps */}
      <div
        style={{
          background: 'var(--vscode-editorWidget-background)',
          border: '1px solid var(--vscode-panel-border, #333)',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '20px',
        }}
      >
        <p style={{ fontSize: '12px', fontWeight: 600, opacity: 0.5, marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          How to connect
        </p>
        {[
          'Sign up at ava-supernova.com',
          'Go to Dashboard → API Key',
          'Copy your sk-ava-... key and paste it below',
        ].map((step, i) => (
          <div key={i} style={{ display: 'flex', gap: '10px', marginBottom: '10px', fontSize: '13px' }}>
            <span
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: '#a78bfa22',
                color: '#a78bfa',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {i + 1}
            </span>
            <span style={{ opacity: 0.8, paddingTop: '1px' }}>{step}</span>
          </div>
        ))}
      </div>

      {/* Input */}
      <div style={{ marginBottom: '12px' }}>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
          placeholder="sk-ava-..."
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: '6px',
            border: `1px solid ${error ? 'var(--vscode-inputValidation-errorBorder)' : 'var(--vscode-input-border, #555)'}`,
            background: 'var(--vscode-input-background)',
            color: 'var(--vscode-input-foreground)',
            fontSize: '13px',
            fontFamily: 'var(--vscode-editor-font-family, monospace)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        {error && (
          <p style={{ color: 'var(--vscode-errorForeground)', fontSize: '12px', marginTop: '6px' }}>
            {error}
          </p>
        )}
      </div>

      {/* Button */}
      <button
        onClick={handleConnect}
        disabled={loading || !key.trim()}
        style={{
          width: '100%',
          padding: '10px',
          borderRadius: '6px',
          border: 'none',
          background: loading || !key.trim() ? '#6b7280' : '#7c3aed',
          color: '#fff',
          fontSize: '13px',
          fontWeight: 600,
          cursor: loading || !key.trim() ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--vscode-font-family)',
        }}
      >
        {loading ? 'Connecting…' : 'Connect Account'}
      </button>

      {/* Footer */}
      <p style={{ textAlign: 'center', fontSize: '12px', opacity: 0.5, marginTop: '16px' }}>
        No account?{' '}
        <button
          onClick={() => post({ type: 'open_checkout', plan: 'pro' })}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--vscode-textLink-foreground)',
            cursor: 'pointer',
            fontSize: '12px',
            padding: 0,
            fontFamily: 'inherit',
          }}
        >
          Sign up free →
        </button>
      </p>
    </div>
  );
}
