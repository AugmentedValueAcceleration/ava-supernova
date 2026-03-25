import { useState } from 'react';
import { supabaseAuth } from '../lib/supabase';
import { theme, inputStyle as themeInputStyle, primaryBtnStyle } from '../lib/theme';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('Email and password required'); return; }

    setLoading(true);
    setError('');

    const { error: authError } = await supabaseAuth.auth.signInWithPassword({ email, password });

    if (authError) {
      setError(authError.message === 'Invalid login credentials'
        ? 'Invalid email or password'
        : authError.message);
    }
    setLoading(false);
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: theme.pageBg,
    }}>
      <div style={{
        width: 400, padding: 40, borderRadius: theme.radiusLg,
        background: theme.cardBg, border: `1px solid ${theme.border}`,
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 300, color: theme.accent, marginBottom: 8 }}>AVA</div>
          <div style={{ fontSize: 14, color: theme.textSecondary, letterSpacing: '0.5px' }}>
            Augmented Value Acceleration
          </div>
        </div>

        {/* Title */}
        <h1 style={{ fontSize: 20, fontWeight: 400, color: theme.text, textAlign: 'center', marginBottom: 8 }}>
          Sign In
        </h1>
        <p style={{ fontSize: 13, color: theme.textMuted, textAlign: 'center', marginBottom: 32 }}>
          Admin accounts are created manually. Contact your administrator if you need access.
        </p>

        {/* Error */}
        {error && (
          <div style={{
            padding: '10px 14px', borderRadius: 10, marginBottom: 16,
            background: theme.redBg, border: `1px solid ${theme.red}40`,
            color: theme.red, fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 400, color: theme.textSecondary, marginBottom: 6 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              autoFocus
              style={{
                ...themeInputStyle,
                padding: '12px 14px',
              }}
              onFocus={(e) => e.target.style.borderColor = theme.accent}
              onBlur={(e) => e.target.style.borderColor = theme.border}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 400, color: theme.textSecondary, marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                ...themeInputStyle,
                padding: '12px 14px',
              }}
              onFocus={(e) => e.target.style.borderColor = theme.accent}
              onBlur={(e) => e.target.style.borderColor = theme.border}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              ...primaryBtnStyle,
              width: '100%',
              padding: '12px 0',
              borderRadius: theme.radiusSm,
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
            onMouseOver={(e) => { if (!loading) e.currentTarget.style.background = theme.accentHover; }}
            onMouseOut={(e) => { if (!loading) e.currentTarget.style.background = theme.accent; }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {/* Footer */}
        <div style={{ marginTop: 32, textAlign: 'center' }}>
          <p style={{ fontSize: 11, color: theme.textMuted }}>
            Internal system — authorised personnel only
          </p>
        </div>
      </div>
    </div>
  );
}
