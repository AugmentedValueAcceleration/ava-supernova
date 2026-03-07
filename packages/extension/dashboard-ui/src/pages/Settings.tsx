import { useState, useEffect } from 'react';
import { post } from '../App';
import { Select } from '../components/Select';
import type { DashboardSettings, ProviderKeyStatus } from '../types/messages';

interface SettingsProps {
  settings: DashboardSettings;
  onSettingsChange: (s: DashboardSettings) => void;
  providerKeys: ProviderKeyStatus;
  showProviderKeys: boolean;
}

const PROVIDERS = [
  {
    id: 'deepseek' as const,
    name: 'DeepSeek',
    placeholder: 'sk-...',
    signupUrl: 'https://platform.deepseek.com',
    description: 'DeepSeek V3 and R1 models',
  },
  {
    id: 'kimi' as const,
    name: 'Kimi (Moonshot)',
    placeholder: 'sk-...',
    signupUrl: 'https://platform.moonshot.cn',
    description: 'Kimi K2.5 — best multi-step tool calling',
  },
  {
    id: 'qwen' as const,
    name: 'Qwen (Alibaba)',
    placeholder: 'sk-...',
    signupUrl: 'https://dashscope.console.aliyun.com',
    description: 'Qwen 3.5 Plus and Qwen Turbo',
  },
  {
    id: 'anthropic' as const,
    name: 'Anthropic (Claude)',
    placeholder: 'sk-ant-...',
    signupUrl: 'https://console.anthropic.com',
    description: 'Claude Opus 4.6, Sonnet 4.6, Haiku 4.5',
  },
];

const LANGUAGES = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'en', label: 'English' },
  { value: 'zh-CN', label: '中文（简体）' },
  { value: 'zh-TW', label: '中文（繁體）' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'es', label: 'Español' },
  { value: 'pt', label: 'Português' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'ru', label: 'Русский' },
  { value: 'ar', label: 'العربية' },
  { value: 'hi', label: 'हिन्दी' },
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'th', label: 'ภาษาไทย' },
  { value: 'tr', label: 'Türkçe' },
  { value: 'it', label: 'Italiano' },
  { value: 'pl', label: 'Polski' },
  { value: 'uk', label: 'Українська' },
  { value: 'nl', label: 'Nederlands' },
  { value: 'id', label: 'Bahasa Indonesia' },
];

const PERMISSION_MODES = [
  { value: 'strict', label: 'Strict — confirm every tool call' },
  { value: 'balanced', label: 'Balanced — approve safe tools automatically' },
  { value: 'autonomous', label: 'Autonomous — approve everything' },
];

const TOKEN_OPTIONS = [
  { value: '2048', label: '2,048' },
  { value: '4096', label: '4,096' },
  { value: '8192', label: '8,192' },
  { value: '16384', label: '16,384' },
  { value: '32768', label: '32,768' },
];

export function Settings({ settings, onSettingsChange, providerKeys, showProviderKeys }: SettingsProps) {
  const [local, setLocal] = useState<DashboardSettings>(settings);
  const [saved, setSaved] = useState(false);
  const [providerInputs, setProviderInputs] = useState<Record<string, string>>({});
  const [savingProvider, setSavingProvider] = useState<string | null>(null);

  useEffect(() => setLocal(settings), [settings]);

  function update<K extends keyof DashboardSettings>(key: K, value: DashboardSettings[K]) {
    setLocal(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function handleSave() {
    post({ type: 'save_settings', settings: local });
    onSettingsChange(local);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleSaveProviderKey(provider: 'deepseek' | 'kimi' | 'qwen' | 'anthropic') {
    const key = providerInputs[provider]?.trim();
    if (!key) return;
    setSavingProvider(provider);
    post({ type: 'save_provider_key', provider, apiKey: key });
    setProviderInputs(prev => ({ ...prev, [provider]: '' }));
    setTimeout(() => setSavingProvider(null), 1500);
  }

  function handleRemoveProviderKey(provider: 'deepseek' | 'kimi' | 'qwen' | 'anthropic') {
    post({ type: 'remove_provider_key', provider });
  }

  const hasChanges = JSON.stringify(local) !== JSON.stringify(settings);
  const configuredCount = [providerKeys.deepseek, providerKeys.kimi, providerKeys.qwen, providerKeys.anthropic].filter(Boolean).length;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {showProviderKeys
            ? 'Configure your API providers and preferences.'
            : 'Preferences for Ava | Supernova.'}
        </p>
      </div>

      <div className="space-y-5">
        {/* Provider Keys */}
        {showProviderKeys && (
          <>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                API Providers
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {configuredCount === 0
                  ? 'Add at least one provider API key to start using Ava.'
                  : `${configuredCount}/4 providers configured.`}
              </p>
            </div>

            {PROVIDERS.map(provider => (
              <Section
                key={provider.id}
                title={provider.name}
                description={provider.description}
              >
                {providerKeys[provider.id] ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      <span className="text-sm text-emerald-400">Connected</span>
                    </div>
                    <button
                      onClick={() => handleRemoveProviderKey(provider.id)}
                      className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-400 transition hover:bg-red-500/10"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={providerInputs[provider.id] ?? ''}
                        onChange={e => setProviderInputs(prev => ({
                          ...prev,
                          [provider.id]: e.target.value,
                        }))}
                        placeholder={provider.placeholder}
                        className="flex-1 rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] px-4 py-2.5 font-mono text-sm text-white placeholder-[var(--text-muted)] outline-none transition focus:border-[var(--accent)]"
                      />
                      <button
                        onClick={() => handleSaveProviderKey(provider.id)}
                        disabled={!providerInputs[provider.id]?.trim() || savingProvider === provider.id}
                        className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
                      >
                        {savingProvider === provider.id ? 'Saved' : 'Save'}
                      </button>
                    </div>
                    <a
                      href={provider.signupUrl}
                      className="mt-1.5 inline-block text-[10px] text-[var(--gradient-start)] hover:underline"
                    >
                      Get an API key &rarr;
                    </a>
                  </div>
                )}
              </Section>
            ))}

            <div className="border-t border-[var(--border-card)]" />
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Preferences
            </p>
          </>
        )}

        {/* Language */}
        <Section title="Language" description="Language for Ava's responses and the UI.">
          <Select
            value={local.language}
            onChange={v => update('language', v)}
            options={LANGUAGES}
          />
        </Section>

        {/* Permission Mode */}
        <Section title="Permission Mode" description="Controls when Ava asks before running tools.">
          <div className="flex flex-col gap-1.5">
            {PERMISSION_MODES.map(o => (
              <label
                key={o.value}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                  local.permissionMode === o.value
                    ? 'border-[var(--accent)]/30 bg-[var(--accent)]/10'
                    : 'border-transparent hover:bg-[var(--bg-input)]'
                }`}
              >
                <input
                  type="radio"
                  checked={local.permissionMode === o.value}
                  onChange={() => update('permissionMode', o.value as DashboardSettings['permissionMode'])}
                  className="accent-[var(--accent)]"
                />
                <span className="text-[var(--text-secondary)]">{o.label}</span>
              </label>
            ))}
          </div>
        </Section>

        {/* Temperature */}
        <Section title="Temperature" description={`Controls response creativity vs. precision. (${local.temperature.toFixed(1)})`}>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-[var(--text-muted)]">Precise</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={local.temperature}
              onChange={e => update('temperature', parseFloat(e.target.value))}
              className="flex-1 accent-[var(--accent)]"
            />
            <span className="text-[10px] text-[var(--text-muted)]">Creative</span>
          </div>
        </Section>

        {/* Max Tokens */}
        <Section title="Max Response Tokens" description="Maximum tokens per model response.">
          <Select
            value={String(local.maxTokens)}
            onChange={v => update('maxTokens', parseInt(v))}
            options={TOKEN_OPTIONS}
          />
        </Section>

        {/* Auto Memory */}
        <Section title="Auto Memory" description="Automatically save important details from conversations.">
          <ToggleSwitch
            value={local.autoMemory}
            onChange={v => update('autoMemory', v)}
            label={local.autoMemory ? 'Enabled' : 'Disabled'}
          />
        </Section>

        {/* Stream Responses */}
        <Section title="Stream Responses" description="Show tokens as they arrive instead of waiting for completion.">
          <ToggleSwitch
            value={local.streamResponses}
            onChange={v => update('streamResponses', v)}
            label={local.streamResponses ? 'Enabled' : 'Disabled'}
          />
        </Section>
      </div>

      {/* Save */}
      <div className="mt-8 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={!hasChanges}
          className="rounded-lg bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          Save Changes
        </button>
        {saved && <span className="text-sm text-emerald-400">Saved</span>}
      </div>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
      <div className="mb-3">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">{description}</p>
      </div>
      {children}
    </div>
  );
}

function ToggleSwitch({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <button
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          value ? 'bg-[var(--accent)]' : 'bg-[var(--border-input)]'
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            value ? 'translate-x-5' : ''
          }`}
        />
      </button>
      <span className="text-sm text-[var(--text-secondary)]">{label}</span>
    </div>
  );
}
