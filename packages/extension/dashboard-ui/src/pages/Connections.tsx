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
  /** i18n key for the field label, resolved with t() at render time. */
  labelKey: string;
  placeholder: string;
  type?: string;
}

// title/description carry i18n keys resolved with t() at render time.
const SERVICE_DEFS: Record<string, { icon: React.FC<{ className?: string }>; titleKey: string; descKey: string; fields: FieldDef[] }> = {
  github: {
    icon: GitHubIcon,
    titleKey: 'dash.connections.github',
    descKey: 'connections.github_desc',
    fields: [
      { key: 'token', labelKey: 'dash.connections.pat', placeholder: 'ghp_...', type: 'password' },
    ],
  },
  email: {
    icon: EnvelopeIcon,
    titleKey: 'dash.connections.email',
    descKey: 'connections.email_desc',
    fields: [
      { key: 'host', labelKey: 'dash.connections.smtp_host', placeholder: 'smtp.gmail.com' },
      { key: 'port', labelKey: 'dash.connections.smtp_port', placeholder: '587' },
      { key: 'user', labelKey: 'dash.connections.smtp_user', placeholder: 'you@example.com' },
      { key: 'pass', labelKey: 'dash.connections.smtp_password', placeholder: 'App password', type: 'password' },
    ],
  },
  slack: {
    icon: ChatBubbleIcon,
    titleKey: 'dash.connections.slack',
    descKey: 'connections.slack_desc',
    fields: [
      { key: 'webhook', labelKey: 'dash.connections.slack_webhook', placeholder: 'https://hooks.slack.com/...', type: 'password' },
    ],
  },
  discord: {
    icon: GameControllerIcon,
    titleKey: 'dash.connections.discord',
    descKey: 'connections.discord_desc',
    fields: [
      { key: 'webhook', labelKey: 'dash.connections.discord_webhook', placeholder: 'https://discord.com/api/webhooks/...', type: 'password' },
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
    <div className="w-full">
      <div className="mb-10">
        <h1 className="text-[22px] font-semibold text-[#cdd6f4]">{t('dash.connections.title')}</h1>
        <p className="mt-1.5 text-[13px] text-[#6c7086]">
          {connectedCount}/4 {t('connections.services_connected')}
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
                  <p className="text-sm font-semibold">{t(def.titleKey)}</p>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t(def.descKey)}</p>
                </div>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                    connected
                      ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400'
                      : 'border-[var(--border-card)] text-[var(--text-muted)]'
                  }`}
                >
                  {connected ? t('dash.connections.connected') : t('dash.connections.not_connected')}
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
                          {t(field.labelKey)}
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
                        {saving === service ? t('dash.connections.saving') : connected ? t('dash.connections.update') : t('dash.connections.connect')}
                      </button>
                      {connected && (
                        <button
                          onClick={() => handleDisconnect(service)}
                          className="rounded-lg border border-red-500/30 px-4 py-2 text-xs text-red-400 transition hover:bg-red-500/10"
                        >
                          {t('dash.connections.disconnect')}
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
