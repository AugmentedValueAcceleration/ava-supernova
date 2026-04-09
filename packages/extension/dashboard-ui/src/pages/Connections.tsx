import { useState } from 'react';
import { t, useLocale } from '../i18n';
import { post } from '../App';
import { GitHubIcon, EnvelopeIcon, ChatBubbleIcon, GameControllerIcon } from '../components/Icons';
import type { ConnectionStatus } from '../types/messages';

interface ConnectionsProps {
  connections: ConnectionStatus;
}

interface FieldDef {
  key: string;
  label: string;
  placeholder: string;
  type?: string;
}

const SERVICE_DEFS: Record<string, { icon: React.FC<{ className?: string }>; title: string; description: string; fields: FieldDef[] }> = {
  github: {
    icon: GitHubIcon,
    title: 'GitHub',
    description: 'Connect your GitHub account to let Ava create branches, PRs, and issues.',
    fields: [
      { key: 'token', label: 'Personal Access Token', placeholder: 'ghp_...', type: 'password' },
    ],
  },
  email: {
    icon: EnvelopeIcon,
    title: 'Email (SMTP)',
    description: 'Allow Ava to send emails on your behalf with your approval.',
    fields: [
      { key: 'host', label: 'SMTP Host', placeholder: 'smtp.gmail.com' },
      { key: 'port', label: 'Port', placeholder: '587' },
      { key: 'user', label: 'Username / Email', placeholder: 'you@example.com' },
      { key: 'pass', label: 'Password / App Password', placeholder: 'App password', type: 'password' },
    ],
  },
  slack: {
    icon: ChatBubbleIcon,
    title: 'Slack',
    description: 'Post messages or summaries to your Slack workspace.',
    fields: [
      { key: 'webhook', label: 'Incoming Webhook URL', placeholder: 'https://hooks.slack.com/...', type: 'password' },
    ],
  },
  discord: {
    icon: GameControllerIcon,
    title: 'Discord',
    description: 'Send notifications or summaries to your Discord server.',
    fields: [
      { key: 'webhook', label: 'Webhook URL', placeholder: 'https://discord.com/api/webhooks/...', type: 'password' },
    ],
  },
};

export function Connections({ connections }: ConnectionsProps) {
  useLocale();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState<string | null>(null);

  function toggleExpand(service: string) {
    setExpanded(expanded === service ? null : service);
  }

  function setField(service: string, key: string, value: string) {
    setFormData(prev => ({
      ...prev,
      [service]: { ...prev[service], [key]: value },
    }));
  }

  function getField(service: string, key: string): string {
    return formData[service]?.[key] ?? '';
  }

  function handleSave(service: string) {
    const data = formData[service] ?? {};
    const def = SERVICE_DEFS[service];
    const allFilled = def.fields.every(f => data[f.key]?.trim());
    if (!allFilled) return;

    setSaving(service);
    post({ type: 'save_connection', service: service as keyof ConnectionStatus, credentials: data });
    setTimeout(() => setSaving(null), 2000);
  }

  function handleDisconnect(service: string) {
    post({ type: 'save_connection', service: service as keyof ConnectionStatus, credentials: {} });
    setFormData(prev => ({ ...prev, [service]: {} }));
  }

  const connectedCount = Object.values(connections).filter(Boolean).length;

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-10">
        <h1 className="text-2xl font-bold">{t('dash.connections.title')}</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {connectedCount}/4 services connected. Credentials are stored securely in VS Code's secret storage.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {Object.entries(SERVICE_DEFS).map(([service, def]) => {
          const connected = connections[service as keyof ConnectionStatus];
          const isOpen = expanded === service;
          const Icon = def.icon;

          return (
            <div
              key={service}
              className={`overflow-hidden rounded-xl border bg-[var(--bg-card)] ${
                connected ? 'border-emerald-500/20' : 'border-[var(--border-card)]'
              }`}
            >
              {/* Header */}
              <button
                onClick={() => toggleExpand(service)}
                className="flex w-full items-center gap-3 border-none bg-transparent px-5 py-4 text-left text-white"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-input)] text-[var(--gradient-start)]">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">{def.title}</p>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">{def.description}</p>
                </div>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                    connected
                      ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400'
                      : 'border-[var(--border-card)] text-[var(--text-muted)]'
                  }`}
                >
                  {connected ? 'Connected' : 'Not connected'}
                </span>
                <span className="text-xs text-[var(--text-muted)]">{isOpen ? '\u25B2' : '\u25BC'}</span>
              </button>

              {/* Form */}
              {isOpen && (
                <div className="border-t border-[var(--border-card)] px-5 pb-5 pt-4">
                  <div className="flex flex-col gap-3">
                    {def.fields.map(field => (
                      <div key={field.key}>
                        <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                          {field.label}
                        </label>
                        <input
                          type={field.type ?? 'text'}
                          placeholder={field.placeholder}
                          value={getField(service, field.key)}
                          onChange={e => setField(service, field.key, e.target.value)}
                          className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] px-4 py-2.5 text-sm text-white placeholder-[var(--text-muted)] outline-none transition focus:border-[var(--accent)]"
                        />
                      </div>
                    ))}

                    <div className="mt-1 flex gap-2">
                      <button
                        onClick={() => handleSave(service)}
                        disabled={saving === service}
                        className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-70"
                      >
                        {saving === service ? 'Saving...' : connected ? 'Update' : 'Connect'}
                      </button>
                      {connected && (
                        <button
                          onClick={() => handleDisconnect(service)}
                          className="rounded-lg border border-red-500/30 px-4 py-2 text-xs text-red-400 transition hover:bg-red-500/10"
                        >
                          Disconnect
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
