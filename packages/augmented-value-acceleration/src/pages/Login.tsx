import { useState } from 'react';
import { supabaseAuth } from '../lib/supabase';

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
      height: '100vh', background: '#0a0a1a',
    }}>
      <div style={{
        width: 400, padding: 40, borderRadius: 20,
        background: '#111127', border: '1px solid #1f1f3a',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#a855f7', marginBottom: 8 }}>AVA</div>
          <div style={{ fontSize: 14, color: '#9ca3af', letterSpacing: '0.5px' }}>
            Augmented Value Acceleration
          </div>
        </div>

        {/* Title */}
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#fff', textAlign: 'center', marginBottom: 8 }}>
          Sign In
        </h1>
        <p style={{ fontSize: 13, color: '#6b7280', textAlign: 'center', marginBottom: 32 }}>
          Admin accounts are created manually. Contact your administrator if you need access.
        </p>

        {/* Error */}
        {error && (
          <div style={{
            padding: '10px 14px', borderRadius: 10, marginBottom: 16,
            background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)',
            color: '#ef4444', fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#9ca3af', marginBottom: 6 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              autoFocus
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 10,
                background: '#1a1a35', border: '1px solid #2a2a4a', color: '#fff',
                fontSize: 14, outline: 'none',
              }}
              onFocus={(e) => e.target.style.borderColor = '#a855f7'}
              onBlur={(e) => e.target.style.borderColor = '#2a2a4a'}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#9ca3af', marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 10,
                background: '#1a1a35', border: '1px solid #2a2a4a', color: '#fff',
                fontSize: 14, outline: 'none',
              }}
              onFocus={(e) => e.target.style.borderColor = '#a855f7'}
              onBlur={(e) => e.target.style.borderColor = '#2a2a4a'}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '12px 0', borderRadius: 10,
              background: loading ? '#6b21a8' : '#a855f7', border: 'none',
              color: '#fff', fontSize: 14, fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
              transition: 'background 0.2s',
            }}
            onMouseOver={(e) => { if (!loading) e.currentTarget.style.background = '#9333ea'; }}
            onMouseOut={(e) => { if (!loading) e.currentTarget.style.background = '#a855f7'; }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {/* Footer */}
        <div style={{ marginTop: 32, textAlign: 'center' }}>
          <p style={{ fontSize: 11, color: '#4b5563' }}>
            Internal system — authorised personnel only
          </p>
        </div>
      </div>
    </div>
  );
}
