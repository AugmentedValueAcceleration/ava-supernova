import { useState, useEffect } from 'react';
import { post } from '../App';
import { Select } from '../components/Select';
import { SectionGroup } from '../components/SectionGroup';
import type { DashboardSettings, ProviderKeyStatus } from '../types/messages';

interface SettingsProps {
  settings: DashboardSettings;
  onSettingsChange: (s: DashboardSettings) => void;
  providerKeys: ProviderKeyStatus;
  showProviderKeys: boolean;
}

const PROVIDERS = [
  {
    id: 'anthropic' as const,
    name: 'Anthropic (Claude)',
    placeholder: 'sk-ant-...',
    signupUrl: 'https://console.anthropic.com',
    description: 'Claude Opus 4.6, Sonnet 4.6, Haiku 4.5',
  },
  {
    id: 'deepseek' as const,
    name: 'DeepSeek',
    placeholder: 'sk-...',
    signupUrl: 'https://platform.deepseek.com',
    description: 'DeepSeek V3 and R1 — best price/performance',
  },
  {
    id: 'kimi' as const,
    name: 'Kimi (Moonshot)',
    placeholder: 'sk-...',
    signupUrl: 'https://platform.moonshot.cn',
    description: 'Kimi K2.5 — best multi-step tool calling',
  },
  {
    id: 'glm' as const,
    name: 'GLM (Zhipu AI)',
    placeholder: '...',
    signupUrl: 'https://open.bigmodel.cn',
    description: 'GLM-5, GLM-4.7 — best tool-call reliability',
  },
  {
    id: 'qwen' as const,
    name: 'Qwen (Alibaba)',
    placeholder: 'sk-...',
    signupUrl: 'https://dashscope.console.aliyun.com',
    description: 'Qwen 3.5 Plus and Qwen Turbo',
  },
  {
    id: 'mistral' as const,
    name: 'Mistral AI',
    placeholder: '...',
    signupUrl: 'https://console.mistral.ai',
    description: 'Mistral Large 3, Codestral, Devstral 2',
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

type SettingsTab = 'providers' | 'general' | 'response';

export function Settings({ settings, onSettingsChange, providerKeys, showProviderKeys }: SettingsProps) {
  const [local, setLocal] = useState<DashboardSettings>(settings);
  const [saved, setSaved] = useState(false);
  const [providerInputs, setProviderInputs] = useState<Record<string, string>>({});
  const [savingProvider, setSavingProvider] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>(showProviderKeys ? 'providers' : 'general');

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

  function handleSaveProviderKey(provider: string) {
    const key = providerInputs[provider]?.trim();
    if (!key) return;
    setSavingProvider(provider);
    post({ type: 'save_provider_key', provider: provider as any, apiKey: key });
    setProviderInputs(prev => ({ ...prev, [provider]: '' }));
    setTimeout(() => setSavingProvider(null), 1500);
  }

  function handleRemoveProviderKey(provider: string) {
    post({ type: 'remove_provider_key', provider: provider as any });
  }

  const hasChanges = JSON.stringify(local) !== JSON.stringify(settings);
  const configuredCount = Object.values(providerKeys).filter(Boolean).length;

  const tabs: Array<{ id: SettingsTab; label: string }> = [
    ...(showProviderKeys ? [{ id: 'providers' as const, label: 'Providers' }] : []),
    { id: 'general', label: 'General' },
    { id: 'response', label: 'Response' },
  ];

  return (
    <div className="mx-auto max-w-2xl">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {showProviderKeys
            ? 'Configure your API providers and preferences.'
            : 'Preferences for Ava | Supernova.'}
        </p>
      </div>

      {/* Tab Bar */}
      <div className="mb-8 flex gap-1 rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] p-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
              activeTab === tab.id
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-input)] hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Providers Tab ─────────────────────────────────────────── */}
      {activeTab === 'providers' && showProviderKeys && (
        <div className="mb-10">
          <SectionGroup
            label="API Providers"
            description={
              configuredCount === 0
                ? 'Add at least one provider API key to start using Ava.'
                : `${configuredCount}/${PROVIDERS.length} providers configured.`
            }
          >
            {PROVIDERS.map(provider => (
              <div
                key={provider.id}
                className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5"
              >
                <div className="mb-3">
                  <p className="text-sm font-semibold">{provider.name}</p>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">{provider.description}</p>
                </div>
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
              </div>
            ))}
          </SectionGroup>
        </div>
      )}

      {/* ── General Tab ───────────────────────────────────────────── */}
      {activeTab === 'general' && (
        <>
          <div className="mb-10">
            <SectionGroup label="Language &amp; Permissions">
              <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
                <div className="mb-4">
                  <p className="text-sm font-semibold">Language</p>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">Language for Ava's responses and the UI.</p>
                </div>
                <Select
                  value={local.language}
                  onChange={v => update('language', v)}
                  options={LANGUAGES}
                />

                <div className="my-5 border-t border-[var(--border-card)]" />

                <div className="mb-4">
                  <p className="text-sm font-semibold">Permission Mode</p>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">Controls when Ava asks before running tools.</p>
                </div>
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
              </div>
            </SectionGroup>
          </div>

          <div className="mb-10">
            <SectionGroup label="Behavior">
              <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">Auto Memory</p>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">Automatically save important details from conversations.</p>
                  </div>
                  <ToggleSwitch
                    value={local.autoMemory}
                    onChange={v => update('autoMemory', v)}
                    label={local.autoMemory ? 'On' : 'Off'}
                  />
                </div>

                <div className="my-5 border-t border-[var(--border-card)]" />

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">Onboarding</p>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">Re-run the welcome walkthrough and setup guide.</p>
                  </div>
                  <button
                    onClick={() => post({ type: 'run_onboarding' })}
                    className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-4 py-2 text-xs font-semibold text-[var(--accent)] transition hover:bg-[var(--accent)]/20"
                  >
                    Run Onboarding
                  </button>
                </div>
              </div>
            </SectionGroup>
          </div>
        </>
      )}

      {/* ── Response Tab ──────────────────────────────────────────── */}
      {activeTab === 'response' && (
        <div className="mb-10">
          <SectionGroup label="Model Output">
            <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
              {/* Temperature */}
              <div className="mb-4">
                <p className="text-sm font-semibold">Temperature</p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">Controls response creativity vs. precision. ({local.temperature.toFixed(1)})</p>
              </div>
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

              <div className="my-5 border-t border-[var(--border-card)]" />

              {/* Max Tokens */}
              <div className="mb-4">
                <p className="text-sm font-semibold">Max Response Tokens</p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">Maximum tokens per model response.</p>
              </div>
              <Select
                value={String(local.maxTokens)}
                onChange={v => update('maxTokens', parseInt(v))}
                options={TOKEN_OPTIONS}
              />

              <div className="my-5 border-t border-[var(--border-card)]" />

              {/* Stream Responses */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">Stream Responses</p>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">Show tokens as they arrive instead of waiting for completion.</p>
                </div>
                <ToggleSwitch
                  value={local.streamResponses}
                  onChange={v => update('streamResponses', v)}
                  label={local.streamResponses ? 'On' : 'Off'}
                />
              </div>
            </div>
          </SectionGroup>
        </div>
      )}

      {/* ── Save Button ───────────────────────────────────────────── */}
      <div className="flex items-center gap-3 pb-8">
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
