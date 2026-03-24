import { useState, useEffect } from 'react';
import { t } from '../i18n';
import { post } from '../App';
import { Select } from '../components/Select';
import { ChevronDownIcon } from '../components/Icons';
import type { DashboardSettings, ProviderKeyStatus, PersonalityData, Page } from '../types/messages';

interface SettingsProps {
  settings: DashboardSettings;
  onSettingsChange: (s: DashboardSettings) => void;
  providerKeys: ProviderKeyStatus;
  showProviderKeys: boolean;
  onNavigate?: (page: Page) => void;
  personality?: PersonalityData | null;
  account?: { email?: string } | null;
}

// ── Static Data ──────────────────────────────────────────────────────────────

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
  { value: 'auto', label: 'Auto-detect' }, // resolved at runtime via t('dash.settings.auto_detect') when i18n is loaded
  { value: 'en', label: 'English' },
  { value: 'zh-CN', label: '\u4e2d\u6587\uff08\u7b80\u4f53\uff09' },
  { value: 'zh-TW', label: '\u4e2d\u6587\uff08\u7e41\u9ad4\uff09' },
  { value: 'ja', label: '\u65e5\u672c\u8a9e' },
  { value: 'ko', label: '\ud55c\uad6d\uc5b4' },
  { value: 'es', label: 'Espa\u00f1ol' },
  { value: 'pt', label: 'Portugu\u00eas' },
  { value: 'fr', label: 'Fran\u00e7ais' },
  { value: 'de', label: 'Deutsch' },
  { value: 'ru', label: '\u0420\u0443\u0441\u0441\u043a\u0438\u0439' },
  { value: 'ar', label: '\u0627\u0644\u0639\u0631\u0628\u064a\u0629' },
  { value: 'hi', label: '\u0939\u093f\u0928\u094d\u0926\u0940' },
  { value: 'vi', label: 'Ti\u1ebfng Vi\u1ec7t' },
  { value: 'th', label: '\u0e20\u0e32\u0e29\u0e32\u0e44\u0e17\u0e22' },
  { value: 'tr', label: 'T\u00fcrk\u00e7e' },
  { value: 'it', label: 'Italiano' },
  { value: 'pl', label: 'Polski' },
  { value: 'uk', label: '\u0423\u043a\u0440\u0430\u0457\u043d\u0441\u044c\u043a\u0430' },
  { value: 'nl', label: 'Nederlands' },
  { value: 'id', label: 'Bahasa Indonesia' },
];

const MODEL_OPTIONS = [
  { value: '', label: 'Auto (recommended)' },
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
  { value: 'deepseek-chat', label: 'DeepSeek V3' },
  { value: 'deepseek-reasoner', label: 'DeepSeek R1' },
  { value: 'kimi-k2-0711', label: 'Kimi K2' },
  { value: 'glm-4-plus', label: 'GLM-4 Plus' },
  { value: 'qwen-plus', label: 'Qwen Plus' },
  { value: 'mistral-large-latest', label: 'Mistral Large' },
  { value: 'codestral-latest', label: 'Codestral' },
];

// ── Component ────────────────────────────────────────────────────────────────

export function Settings({
  settings,
  onSettingsChange,
  providerKeys,
  showProviderKeys,
  onNavigate,
  personality,
  account,
}: SettingsProps) {
  const [local, setLocal] = useState<DashboardSettings>(settings);
  const [providerInputs, setProviderInputs] = useState<Record<string, string>>({});
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [savingProvider, setSavingProvider] = useState<string | null>(null);
  const [apiKeysOpen, setApiKeysOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => setLocal(settings), [settings]);

  // ── Auto-save ────────────────────────────────────────────────────────────

  function saveImmediate<K extends keyof DashboardSettings>(key: K, value: DashboardSettings[K]) {
    const updated = { ...local, [key]: value };
    setLocal(updated);
    onSettingsChange(updated);
    post({ type: 'save_settings', settings: updated });
  }

  // ── Provider key handlers ────────────────────────────────────────────────

  function handleSaveProviderKey(provider: string) {
    const key = providerInputs[provider]?.trim();
    if (!key) return;
    setSavingProvider(provider);
    post({ type: 'save_provider_key', provider: provider as any, apiKey: key });
    setProviderInputs(prev => ({ ...prev, [provider]: '' }));
    setEditingProvider(null);
    setTimeout(() => setSavingProvider(null), 1500);
  }

  function handleRemoveProviderKey(provider: string) {
    post({ type: 'remove_provider_key', provider: provider as any });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  const configuredCount = Object.values(providerKeys).filter(Boolean).length;

  const modelLabel = MODEL_OPTIONS.find(m => m.value === local.activeModel)?.label
    ?? (local.activeModel || 'Auto');

  const providerForModel = (): string => {
    const m = local.activeModel;
    if (!m) return 'Auto-selected';
    if (m.startsWith('claude')) return 'Anthropic';
    if (m.startsWith('deepseek')) return 'DeepSeek';
    if (m.startsWith('kimi')) return 'Moonshot';
    if (m.startsWith('glm')) return 'Zhipu AI';
    if (m.startsWith('qwen')) return 'Alibaba';
    if (m.startsWith('mistral') || m.startsWith('codestral')) return 'Mistral AI';
    return '';
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-2xl pb-12">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t('dash.settings.title')}</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {t('dash.settings.subtitle')}
        </p>
      </div>

      {/* ── 1. Your AI ──────────────────────────────────────────────────── */}
      <SectionLabel>Your AI</SectionLabel>
      <div className="mb-4 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-500/20 text-lg">
              {personality?.name?.[0]?.toUpperCase() ?? 'A'}
            </div>
            <div>
              <p className="text-sm font-semibold">{personality?.name ?? 'Ava'}</p>
              <p className="text-xs text-[var(--text-muted)]">
                {personality
                  ? `${personality.tone} / ${personality.energy} / ${personality.style}`
                  : 'Default personality'}
              </p>
            </div>
          </div>
          {onNavigate && (
            <button
              onClick={() => onNavigate('personality')}
              className="text-xs font-medium text-purple-400 transition hover:text-purple-300"
            >
              Customise &rarr;
            </button>
          )}
        </div>
      </div>

      {/* ── 2. Model ────────────────────────────────────────────────────── */}
      <SectionLabel>Model</SectionLabel>
      <div className="mb-4 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
        <div className="mb-3">
          <p className="text-lg font-semibold">{modelLabel}</p>
          <p className="text-xs text-[var(--text-muted)]">{providerForModel()}</p>
        </div>
        <Select
          value={local.activeModel}
          onChange={v => saveImmediate('activeModel', v)}
          options={MODEL_OPTIONS}
        />
      </div>

      {/* ── 3. Privacy & Data ───────────────────────────────────────────── */}
      <SectionLabel>Privacy & Data</SectionLabel>
      <div className="mb-4 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
        {/* Auto Memory */}
        <ToggleRow
          icon={<span className="text-base">&#x1f9e0;</span>}
          title="Auto Memory"
          description="Automatically save important details from conversations"
          value={local.autoMemory}
          onChange={v => saveImmediate('autoMemory', v)}
        />

        <Divider />

        {/* Local Only */}
        <ToggleRow
          icon={<span className="text-base">&#x1f512;</span>}
          title="Local Only"
          description="Keep all data on your machine. Disable to enable cloud sync."
          value={local.memoryLocalOnly}
          onChange={v => saveImmediate('memoryLocalOnly', v)}
        />

        <Divider />

        {/* Shared Learning */}
        <div>
          <ToggleRow
            icon={<span className="text-base">&#x1f4a1;</span>}
            title="Shared Learning"
            description="Help improve Ava for everyone. Anonymised technical patterns only."
            value={local.contributeSharedLearning}
            onChange={v => saveImmediate('contributeSharedLearning', v)}
          />
          <p className={`mt-2 pl-8 text-xs ${local.contributeSharedLearning ? 'text-emerald-400' : 'text-[var(--text-muted)]'}`}>
            {local.contributeSharedLearning
              ? 'Contributing to shared learning'
              : 'Off \u2014 your learnings stay local'}
          </p>
        </div>
      </div>

      {/* ── 4. Behavior ─────────────────────────────────────────────────── */}
      <SectionLabel>Behavior</SectionLabel>
      <div className="mb-4 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
        <p className="mb-1 text-sm font-semibold">{t('dash.settings.permission')}</p>
        <p className="mb-3 text-xs text-[var(--text-muted)]">Controls when Ava asks before running tools.</p>

        <div className="mb-5 grid grid-cols-3 gap-2">
          <PermissionCard
            icon={<span className="text-lg">&#x1f6e1;&#xfe0f;</span>}
            label={t('dash.settings.permission.strict')}
            description={t('dash.settings.permission.strict_desc')}
            selected={local.permissionMode === 'strict'}
            onClick={() => saveImmediate('permissionMode', 'strict')}
          />
          <PermissionCard
            icon={<span className="text-lg">&#x2696;&#xfe0f;</span>}
            label={t('dash.settings.permission.balanced')}
            description={t('dash.settings.permission.balanced_desc')}
            selected={local.permissionMode === 'balanced'}
            onClick={() => saveImmediate('permissionMode', 'balanced')}
          />
          <PermissionCard
            icon={<span className="text-lg">&#x1f680;</span>}
            label={t('dash.settings.permission.autonomous')}
            description={t('dash.settings.permission.autonomous_desc')}
            selected={local.permissionMode === 'autonomous'}
            onClick={() => saveImmediate('permissionMode', 'autonomous')}
          />
        </div>

        <Divider />

        <ToggleRow
          icon={null}
          title="Stream Responses"
          description="Show tokens as they arrive instead of waiting for completion."
          value={local.streamResponses}
          onChange={v => saveImmediate('streamResponses', v)}
        />
      </div>

      {/* ── 5. Language ──────────────────────────────────────────────────── */}
      <SectionLabel>{t('dash.settings.language')}</SectionLabel>
      <div className="mb-4 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
        <Select
          value={local.language}
          onChange={v => saveImmediate('language', v)}
          options={LANGUAGES}
        />
      </div>

      {/* ── 6. API Keys (collapsible) ───────────────────────────────────── */}
      {showProviderKeys && (
        <>
          <SectionLabel>{t('dash.settings.provider_keys')}</SectionLabel>
          <div className="mb-4 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)]">
            <button
              onClick={() => setApiKeysOpen(!apiKeysOpen)}
              className="flex w-full items-center justify-between p-5 text-left"
            >
              <div>
                <p className="text-sm font-semibold">{t('dash.settings.provider_keys')}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {configuredCount === 0
                    ? 'No providers configured'
                    : `${configuredCount}/${PROVIDERS.length} providers configured`}
                </p>
              </div>
              <ChevronDownIcon
                className={`h-4 w-4 text-[var(--text-muted)] transition-transform ${apiKeysOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {apiKeysOpen && (
              <div className="border-t border-[var(--border-card)] px-5 pb-5">
                {PROVIDERS.map((provider, i) => (
                  <div key={provider.id}>
                    {i > 0 && <Divider />}
                    <div className="flex items-center justify-between py-1">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{provider.name}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">{provider.description}</p>
                      </div>

                      {providerKeys[provider.id] ? (
                        <div className="flex items-center gap-3">
                          {savingProvider === provider.id ? (
                            <span className="text-xs text-emerald-400">Saved</span>
                          ) : (
                            <>
                              <span className="font-mono text-xs text-[var(--text-muted)]">
                                &#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;
                              </span>
                              <button
                                onClick={() => handleRemoveProviderKey(provider.id)}
                                className="rounded-md px-2 py-1 text-[10px] text-red-400 transition hover:bg-red-500/10"
                              >
                                Remove
                              </button>
                            </>
                          )}
                        </div>
                      ) : editingProvider === provider.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="password"
                            value={providerInputs[provider.id] ?? ''}
                            onChange={e =>
                              setProviderInputs(prev => ({
                                ...prev,
                                [provider.id]: e.target.value,
                              }))
                            }
                            placeholder={provider.placeholder}
                            className="w-48 rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-1.5 font-mono text-xs text-white placeholder-[var(--text-muted)] outline-none transition focus:border-[var(--accent)]"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveProviderKey(provider.id)}
                            disabled={!providerInputs[provider.id]?.trim()}
                            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-[10px] font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setEditingProvider(null);
                              setProviderInputs(prev => ({ ...prev, [provider.id]: '' }));
                            }}
                            className="rounded-md px-2 py-1.5 text-[10px] text-[var(--text-muted)] transition hover:text-white"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[var(--text-muted)]">Not set</span>
                          <button
                            onClick={() => setEditingProvider(provider.id)}
                            className="rounded-md border border-[var(--border-input)] px-3 py-1.5 text-[10px] font-medium text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-white"
                          >
                            Edit
                          </button>
                        </div>
                      )}
                    </div>
                    {!providerKeys[provider.id] && editingProvider !== provider.id && (
                      <a
                        href={provider.signupUrl}
                        className="text-[10px] text-[var(--gradient-start)] hover:underline"
                      >
                        Get an API key &rarr;
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── 7. Advanced (collapsible) ───────────────────────────────────── */}
      <SectionLabel>Advanced</SectionLabel>
      <div className="mb-4 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)]">
        <button
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className="flex w-full items-center justify-between p-5 text-left"
        >
          <div>
            <p className="text-sm font-semibold">Advanced Settings</p>
            <p className="text-xs text-[var(--text-muted)]">Most users don't need to change these.</p>
          </div>
          <ChevronDownIcon
            className={`h-4 w-4 text-[var(--text-muted)] transition-transform ${advancedOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {advancedOpen && (
          <div className="border-t border-[var(--border-card)] p-5">
            {/* Temperature */}
            <div className="mb-5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold">Temperature</p>
                <span className="rounded-md bg-[var(--bg-input)] px-2 py-0.5 font-mono text-xs text-[var(--text-secondary)]">
                  {local.temperature.toFixed(1)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-[var(--text-muted)]">Precise</span>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.1}
                  value={local.temperature}
                  onChange={e => saveImmediate('temperature', parseFloat(e.target.value))}
                  className="flex-1 accent-[var(--accent)]"
                />
                <span className="text-[10px] text-[var(--text-muted)]">Creative</span>
              </div>
            </div>

            <Divider />

            {/* Max Tokens */}
            <div className="mt-5">
              <p className="mb-2 text-sm font-semibold">Max Response Tokens</p>
              <input
                type="number"
                min={256}
                max={65536}
                step={256}
                value={local.maxTokens}
                onChange={e => {
                  const v = parseInt(e.target.value);
                  if (!isNaN(v) && v >= 256 && v <= 65536) {
                    saveImmediate('maxTokens', v);
                  }
                }}
                className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] px-4 py-2.5 font-mono text-sm text-white outline-none transition focus:border-[var(--accent)]"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── 8. Danger Zone ──────────────────────────────────────────────── */}
      {account && (
        <>
          <SectionLabel>Danger Zone</SectionLabel>
          <div className="mb-4 rounded-xl border border-red-500/30 bg-[var(--bg-card)] p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-red-400">Disconnect Account</p>
                <p className="text-xs text-red-400/70">
                  This will sign you out and remove your account connection from this device.
                </p>
              </div>
              <button
                onClick={() => post({ type: 'disconnect_account' })}
                className="rounded-lg border border-red-500/40 px-4 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-500/10"
              >
                Disconnect
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[1.5px] text-[var(--text-muted)]">
      {children}
    </p>
  );
}

function Divider() {
  return <div className="my-4 border-t border-[var(--border-card)]" />;
}

function ToggleRow({
  icon,
  title,
  description,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        {icon && <span className="flex-shrink-0">{icon}</span>}
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">{description}</p>
        </div>
      </div>
      <ToggleSwitch value={value} onChange={onChange} />
    </div>
  );
}

function ToggleSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
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
  );
}

function PermissionCard({
  icon,
  label,
  description,
  selected,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border p-3 text-left transition ${
        selected
          ? 'border-purple-500/60 bg-purple-500/10 shadow-[0_0_12px_rgba(168,85,247,0.15)]'
          : 'border-[var(--border-card)] bg-[var(--bg-card)] hover:border-[var(--border-input)]'
      }`}
    >
      <div className="mb-1.5">{icon}</div>
      <p className={`text-xs font-semibold ${selected ? 'text-purple-400' : 'text-[var(--text-secondary)]'}`}>
        {label}
      </p>
      <p className="mt-1 text-[10px] leading-snug text-[var(--text-muted)]">{description}</p>
    </button>
  );
}
