import { useState } from 'react';
import { t } from '../i18n';
import { post } from '../App';
import { KeyIcon } from '../components/Icons';

interface ConnectAccountProps {
  onSkipAccount: () => void;
}

export function ConnectAccount({ onSkipAccount }: ConnectAccountProps) {
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
    setTimeout(() => setLoading(false), 8000);
  };

  return (
    <div className="mx-auto mt-12 max-w-md">
      {/* Logo */}
      <div className="mb-8 text-center">
        <h1 className="mb-2 bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)] bg-clip-text text-2xl font-bold text-transparent">
          Ava | Supernova
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Connect your account for managed API access and cloud sync
        </p>
      </div>

      {/* Steps */}
      <div className="mb-5 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          How to connect
        </p>
        {[
          'Sign up at ava-supernova.com',
          'Go to Dashboard \u2192 API Keys',
          'Copy your sk-ava-... key and paste it below',
        ].map((step, i) => (
          <div key={i} className="mb-2.5 flex items-start gap-3 text-sm">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--gradient-start)]/10 text-[10px] font-bold text-[var(--gradient-start)]">
              {i + 1}
            </span>
            <span className="pt-px text-[var(--text-secondary)]">{step}</span>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="mb-3">
        <div className="relative">
          <KeyIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
            placeholder={t('dash.auth.enter_key')}
            className={`w-full rounded-lg border bg-[var(--bg-input)] py-2.5 pl-10 pr-4 font-mono text-sm text-white placeholder-[var(--text-muted)] outline-none transition ${
              error ? 'border-red-500' : 'border-[var(--border-input)] focus:border-[var(--accent)]'
            }`}
          />
        </div>
        {error && (
          <p className="mt-1.5 text-xs text-red-400">{error}</p>
        )}
      </div>

      {/* Button */}
      <button
        onClick={handleConnect}
        disabled={loading || !key.trim()}
        className="w-full rounded-lg bg-[var(--accent)] py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Connecting...' : t('dash.auth.connect')}
      </button>

      {/* Divider */}
      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-[var(--border-card)]" />
        <span className="text-xs text-[var(--text-muted)]">or</span>
        <div className="h-px flex-1 bg-[var(--border-card)]" />
      </div>

      {/* BYOK Alternative */}
      <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5 text-center">
        <p className="mb-2 text-sm font-semibold">Use your own API keys</p>
        <p className="mb-4 text-xs text-[var(--text-muted)]">
          Skip account creation and configure your own provider keys directly.
        </p>
        <button
          onClick={onSkipAccount}
          className="w-full rounded-lg border border-[var(--border-input)] bg-transparent py-2.5 text-sm font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--bg-input)] hover:text-white"
        >
          Configure API Keys &rarr;
        </button>
      </div>

      {/* Footer */}
      <p className="mt-4 text-center text-xs text-[var(--text-muted)]">
        No account?{' '}
        <button
          onClick={() => post({ type: 'open_url', url: 'https://ava-supernova.com/' })}
          className="border-none bg-transparent text-xs text-[var(--gradient-start)] hover:underline"
        >
          Sign up free &rarr;
        </button>
      </p>
    </div>
  );
}
