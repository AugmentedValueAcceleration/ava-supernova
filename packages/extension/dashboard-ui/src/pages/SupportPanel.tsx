import { post } from '../App';
import { tt, useLocale } from '../i18n';

/**
 * Help → Support. Discord for anything public, email for anything private.
 *
 * Replaces the private ticket system (retired 1 Nov 2026 with accounts — a
 * ticket needed an account to belong to). Same split the docs and Ava's own
 * help rule use, so the three never disagree about where to go.
 */

const DISCORD_URL = 'https://discord.gg/bbtnKMW4rf';
const SUPPORT_EMAIL = 'support@avasupernova.com';

export function SupportPanel() {
  useLocale();
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
        <h2 className="mb-1.5 text-sm font-semibold text-white">{tt('dash.support.discord_title', 'Ask on Discord')}</h2>
        <p className="mb-4 text-xs leading-relaxed text-[var(--text-secondary)]">
          {tt('dash.support.discord_desc', 'Questions in #help, bugs in #bug-reports, ideas in #feature-requests. Answers are public, so they help the next person too.')}
        </p>
        <button
          type="button"
          onClick={() => post({ type: 'open_url', url: DISCORD_URL })}
          className="rounded-lg px-4 py-2 text-xs font-semibold transition"
          style={{
            border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
            background: 'color-mix(in srgb, var(--accent) 18%, transparent)',
            color: 'var(--accent)',
          }}
        >
          {tt('dash.support.discord_cta', 'Open the Discord')}
        </button>
      </div>

      <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
        <h2 className="mb-1.5 text-sm font-semibold text-white">{tt('dash.support.email_title', 'Something private?')}</h2>
        <p className="mb-4 text-xs leading-relaxed text-[var(--text-secondary)]">
          {tt('dash.support.email_desc', 'Your data, a security issue or a donation question — email us. Never post a key or a password anywhere.')}
        </p>
        <p className="select-all font-mono text-sm text-white">{SUPPORT_EMAIL}</p>
        <p className="mt-3 text-[11px] text-[var(--text-muted)]">
          {tt('dash.support.email_ava', 'Or ask Ava: she drafts the email and opens it in your own mail app. You check it and press send.')}
        </p>
      </div>
    </div>
  );
}
