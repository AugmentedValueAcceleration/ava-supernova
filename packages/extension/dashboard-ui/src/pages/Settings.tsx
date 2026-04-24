import { useState, useEffect, useRef } from 'react';
import { t, initLocale, useLocale } from '../i18n';
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
  account?: { email?: string; tier?: string } | null;
  avatarDataUrl?: string;
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
    signupUrl: 'https://platform.moonshot.ai',
    description: 'Kimi K2.5 — best multi-step tool calling',
  },
  {
    id: 'glm' as const,
    name: 'GLM (Zhipu AI)',
    placeholder: '...',
    signupUrl: 'https://z.ai',
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
  {
    id: 'xiaomi' as const,
    name: 'Xiaomi (MiMo)',
    placeholder: '...',
    signupUrl: 'https://platform.xiaomimimo.com',
    description: 'MiMo V2.5 and V2.5-Pro — 1M context, native multimodal',
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

// ── Component ────────────────────────────────────────────────────────────────

export function Settings({
  settings,
  onSettingsChange,
  providerKeys,
  showProviderKeys,
  onNavigate,
  personality,
  account,
  avatarDataUrl,
}: SettingsProps) {
  useLocale();
  const [local, setLocal] = useState<DashboardSettings>(settings);
  const [providerInputs, setProviderInputs] = useState<Record<string, string>>({});
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [savingProvider, setSavingProvider] = useState<string | null>(null);
  const [apiKeysOpen, setApiKeysOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) return;
    if (file.size > 2 * 1024 * 1024) return;
    setAvatarUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      post({ type: 'save_avatar', data: dataUrl, mimeType: file.type });
      setAvatarUploading(false);
    };
    reader.readAsDataURL(file);
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  }

  useEffect(() => setLocal(settings), [settings]);

  // ── Dataset capture config (separate from DashboardSettings) ─────────────
  // Lives at ~/.ava/datasets/config.json with its own granular schema. The
  // extension host owns the file; we sync via dataset:get_config /
  // dataset:set_config messages.
  type DatasetConfigShape = {
    enabled: boolean;
    capture_modes: string[];
    capture_datasets: string[];
    redact_patterns: string[];
    min_trajectory_length: number;
  };
  const ALL_AVA_MODES = ['work', 'plan', 'chat', 'teach', 'security', 'brainstorm'];
  const ALL_DATASET_KINDS = [
    'tool-trajectories', 'persona-handoffs', 'verification-pairs',
    'auto-mode-classification', 'error-recovery', 'memory-operations',
    'continuation-recovery', 'mode-transitions', 'generation-effectiveness',
    'knowledge-pack-effectiveness',
  ];
  const [datasetConfig, setDatasetConfig] = useState<DatasetConfigShape | null>(null);
  useEffect(() => {
    post({ type: 'dataset:get_config' } as any);
    function onMessage(e: MessageEvent) {
      const m = e.data;
      if (m && m.type === 'dataset:config') setDatasetConfig(m.config);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  function saveDatasetConfig(next: DatasetConfigShape): void {
    setDatasetConfig(next);
    post({ type: 'dataset:set_config', config: next } as any);
  }
  function toggleDatasetMode(mode: string): void {
    if (!datasetConfig) return;
    const has = datasetConfig.capture_modes.includes(mode);
    saveDatasetConfig({
      ...datasetConfig,
      capture_modes: has
        ? datasetConfig.capture_modes.filter(m => m !== mode)
        : [...datasetConfig.capture_modes, mode],
    });
  }
  function toggleDatasetKind(kind: string): void {
    if (!datasetConfig) return;
    const has = datasetConfig.capture_datasets.includes(kind);
    saveDatasetConfig({
      ...datasetConfig,
      capture_datasets: has
        ? datasetConfig.capture_datasets.filter(k => k !== kind)
        : [...datasetConfig.capture_datasets, kind],
    });
  }
  function setDatasetMaster(enabled: boolean): void {
    if (!datasetConfig) return;
    // First-time enable auto-fills empty whitelists so capture isn't
    // master-on-but-everything-still-off.
    saveDatasetConfig({
      ...datasetConfig,
      enabled,
      capture_modes: enabled && datasetConfig.capture_modes.length === 0
        ? ALL_AVA_MODES
        : datasetConfig.capture_modes,
      capture_datasets: enabled && datasetConfig.capture_datasets.length === 0
        ? ALL_DATASET_KINDS
        : datasetConfig.capture_datasets,
    });
  }

  // ── Auto-save ────────────────────────────────────────────────────────────

  function saveImmediate<K extends keyof DashboardSettings>(key: K, value: DashboardSettings[K]) {
    const updated = { ...local, [key]: value };
    setLocal(updated);
    onSettingsChange(updated);
    post({ type: 'save_settings', settings: updated });
    if (key === 'language') {
      localStorage.setItem('ava-dashboard-language', value as string);
      initLocale(value as string);
    }
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
      <SectionLabel>{t('dash.settings.section.your_ai')}</SectionLabel>
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
                  : t('dash.settings.default_personality')}
              </p>
            </div>
          </div>
          {onNavigate && (
            <button
              onClick={() => onNavigate('personality')}
              className="text-xs font-medium text-purple-400 transition hover:text-purple-300"
            >
              {t('dash.settings.customise')} &rarr;
            </button>
          )}
        </div>
      </div>

      {/* ── Avatar ──────────────────────────────────────────────────────── */}
      <SectionLabel>Avatar</SectionLabel>
      <div className="mb-4 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
        <div className="flex items-center gap-4">
          <div
            className="h-14 w-14 shrink-0 rounded-full border-2 border-[var(--border-card)] flex items-center justify-center text-lg font-light overflow-hidden"
            style={{
              background: avatarDataUrl ? `url(${avatarDataUrl}) center/cover no-repeat` : 'rgba(168,85,247,0.15)',
              color: 'var(--accent)',
            }}
          >
            {!avatarDataUrl && (account?.email?.[0]?.toUpperCase() || personality?.name?.[0]?.toUpperCase() || 'A')}
          </div>
          <div>
            <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleAvatarUpload} className="hidden" />
            <div className="flex gap-2">
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[11px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {avatarUploading ? 'Saving...' : avatarDataUrl ? 'Change Avatar' : 'Upload Avatar'}
              </button>
              {avatarDataUrl && (
                <button
                  onClick={() => post({ type: 'remove_avatar' })}
                  className="rounded-lg border border-[var(--border-card)] px-3 py-1.5 text-[11px] text-red-400 transition hover:border-red-400/40"
                >
                  Remove
                </button>
              )}
            </div>
            <p className="mt-1.5 text-[10px] text-[var(--text-muted)]">Saved locally. Sync to cloud from the Sync page. JPEG, PNG, WebP or GIF. Max 2 MB.</p>
          </div>
        </div>
      </div>

      {/* ── 2. Privacy & Data ───────────────────────────────────────────── */}
      <SectionLabel>{t('dash.settings.section.privacy')}</SectionLabel>
      <div className="mb-4 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
        {/* Auto Memory */}
        <ToggleRow
          icon={<span className="text-base">&#x1f9e0;</span>}
          title={t('dash.settings.auto_memory')}
          description={t('dash.settings.auto_memory_desc')}
          value={local.autoMemory}
          onChange={v => saveImmediate('autoMemory', v)}
        />

        <Divider />

        {/* Local Only */}
        <ToggleRow
          icon={<span className="text-base">&#x1f512;</span>}
          title={t('dash.settings.local_only')}
          description={t('dash.settings.local_only_desc')}
          value={local.memoryLocalOnly}
          onChange={v => saveImmediate('memoryLocalOnly', v)}
        />

        <Divider />

        {/* Shared Learning */}
        <div>
          <ToggleRow
            icon={<span className="text-base">&#x1f4a1;</span>}
            title={t('dash.settings.shared_learning')}
            description={t('dash.settings.shared_learning_desc')}
            value={local.contributeSharedLearning}
            onChange={v => saveImmediate('contributeSharedLearning', v)}
          />
          <p className={`mt-2 pl-8 text-xs ${local.contributeSharedLearning ? 'text-emerald-400' : 'text-[var(--text-muted)]'}`}>
            {local.contributeSharedLearning
              ? t('dash.settings.contributing')
              : t('dash.settings.learnings_local')}
          </p>
        </div>
      </div>

      {/* ── 3. Dataset capture (Ava action capture) ─────────────────────── */}
      <SectionLabel>Help train Ava's own model</SectionLabel>
      <div className="mb-4 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
        <ToggleRow
          icon={<span className="text-base">&#x1f9ea;</span>}
          title="Capture Ava's actions as training data"
          description="Records Ava's tool choices, persona handoffs, memory ops, etc. to ~/.ava/datasets/. Local-only by default. Never captures your prompts or files — only her decisions and shape-only context."
          value={datasetConfig?.enabled ?? false}
          onChange={setDatasetMaster}
        />

        {datasetConfig?.enabled && (
          <>
            <Divider />
            <p className="mb-2 text-xs font-semibold text-[var(--text-secondary)]">Modes captured</p>
            <p className="mb-3 text-[11px] text-[var(--text-muted)]">
              Choose which thought modes feed the dataset. Toggle any off to keep that mode private.
            </p>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {ALL_AVA_MODES.map(mode => {
                const on = datasetConfig.capture_modes.includes(mode);
                return (
                  <button
                    key={mode}
                    onClick={() => toggleDatasetMode(mode)}
                    className={`rounded-full border px-3 py-1 text-[11px] transition ${
                      on
                        ? 'border-emerald-400 bg-emerald-400/10 text-emerald-300'
                        : 'border-[var(--border-card)] text-[var(--text-muted)] hover:border-emerald-400/40'
                    }`}
                  >
                    {mode}
                  </button>
                );
              })}
            </div>

            <Divider />
            <p className="mb-2 text-xs font-semibold text-[var(--text-secondary)]">Dataset kinds</p>
            <p className="mb-3 text-[11px] text-[var(--text-muted)]">
              The 10 distinct training datasets Ava generates. All on by default; uncheck any you'd rather not contribute to.
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {ALL_DATASET_KINDS.map(kind => {
                const on = datasetConfig.capture_datasets.includes(kind);
                return (
                  <button
                    key={kind}
                    onClick={() => toggleDatasetKind(kind)}
                    className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-[11px] transition ${
                      on
                        ? 'border-emerald-400/40 bg-emerald-400/5 text-[var(--text-secondary)]'
                        : 'border-[var(--border-card)] text-[var(--text-muted)] hover:border-emerald-400/30'
                    }`}
                  >
                    <span className={on ? 'text-emerald-400' : 'text-[var(--text-muted)]'}>
                      {on ? '\u25cf' : '\u25cb'}
                    </span>
                    <span className="truncate">{kind}</span>
                  </button>
                );
              })}
            </div>

            <p className="mt-4 text-[10px] text-[var(--text-muted)]">
              All capture is local and append-only. Nothing leaves your machine until you explicitly push to your private dataset repo (separate, opt-in).
            </p>
          </>
        )}
      </div>

      {/* ── 4. Behavior ─────────────────────────────────────────────────── */}
      <SectionLabel>{t('dash.settings.section.behavior')}</SectionLabel>
      <div className="mb-4 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
        <p className="mb-1 text-sm font-semibold">{t('dash.settings.permission')}</p>
        <p className="mb-3 text-xs text-[var(--text-muted)]">{t('dash.settings.permission_desc')}</p>

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

        {local.permissionMode === 'custom' && (
          <div className="mb-3 rounded-lg border border-purple-500/30 bg-purple-500/5 px-3 py-2 text-[11px] text-purple-300">
            Custom — you've adjusted individual categories. Select a preset above to reset.
          </div>
        )}

        {/* Category-level permissions */}
        <details className="mb-4 group">
          <summary className="cursor-pointer text-xs font-semibold text-[var(--text-secondary)] hover:text-white transition select-none">
            Customise by Category
          </summary>
          <div className="mt-3 space-y-1.5">
            {([
              { id: 'file_ops', icon: '📁', label: 'File Operations', desc: 'read, write, edit, glob, grep' },
              { id: 'shell', icon: '💻', label: 'Shell', desc: 'bash, test_run, test_generate' },
              { id: 'git', icon: '🔀', label: 'Git', desc: 'status, diff, commit, PR, rollback' },
              { id: 'web', icon: '🌐', label: 'Web', desc: 'search, http_request, browser' },
              { id: 'media', icon: '🎨', label: 'Media', desc: 'screenshot, generate_image, remove_bg' },
              { id: 'database', icon: '🗄️', label: 'Database', desc: 'database_query' },
              { id: 'system', icon: '🖥️', label: 'System', desc: 'computer_use' },
              { id: 'documents', icon: '📄', label: 'Documents', desc: 'docs, reports, emails' },
              { id: 'memory', icon: '🧠', label: 'Memory', desc: 'save, recall, update, delete' },
              { id: 'learning', icon: '🎓', label: 'Learning', desc: 'create, teach, progress' },
            ] as const).map(cat => {
              const currentPerm = (local.categoryPermissions || {})[cat.id] || 'auto';
              return (
                <div key={cat.id} className="flex items-center gap-3 rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)]/30 px-3 py-2">
                  <span className="text-sm">{cat.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-[var(--text-secondary)]">{cat.label}</p>
                    <p className="text-[9px] text-[var(--text-muted)] truncate">{cat.desc}</p>
                  </div>
                  <div className="flex gap-0.5 rounded-md border border-[var(--border-card)] bg-[var(--bg-card)] p-0.5">
                    {(['auto', 'first_time', 'always_ask'] as const).map(perm => (
                      <button
                        key={perm}
                        onClick={() => {
                          const updated = { ...local.categoryPermissions, [cat.id]: perm };
                          saveImmediate('categoryPermissions', updated);
                          post({ type: 'set_category_permission', category: cat.id, permission: perm });
                        }}
                        className={`px-2 py-0.5 rounded text-[9px] font-medium transition border-none cursor-pointer ${
                          currentPerm === perm
                            ? 'bg-[var(--accent)] text-white'
                            : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                        }`}
                      >
                        {perm === 'auto' ? 'Auto' : perm === 'first_time' ? 'First Time' : 'Always Ask'}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </details>

        <Divider />

        <ToggleRow
          icon={null}
          title={t('dash.settings.stream_responses')}
          description={t('dash.settings.stream_responses_desc')}
          value={local.streamResponses}
          onChange={v => saveImmediate('streamResponses', v)}
        />
      </div>

      {/* ── 4b. Auto Mode coordinator (admin-only) ──────────────────────────
          Staged-rollout toggle for the DeepSeek V4 experiment. Normal users
          get the default PLATFORM_PRIORITY ladder (Qwen 3.6 Plus). Admin can
          swap to V4 Pro to A/B without a code change. Flows through
          DashboardSettings → /settings/sync so it follows the operator
          across devices when Settings sync is on. */}
      {account?.tier === 'admin' && (
        <>
          <SectionLabel>Auto Mode coordinator</SectionLabel>
          <div className="mb-4 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
            <p className="mb-3 text-[11px] text-[var(--text-muted)] leading-relaxed">
              The model that orchestrates Auto Mode — classifies tasks, routes to specialists, runs the Conductor loop. Default is Qwen 3.6 Plus, tuned over many months. Alternatives are experimental — personas and prompts were tuned against Qwen and may behave differently on another coordinator.
            </p>
            <Select
              value={local.autoCoordinator ?? ''}
              onChange={v => saveImmediate('autoCoordinator', v || undefined)}
              options={[
                { value: '', label: 'Default (Qwen 3.6 Plus)' },
                { value: 'platform:deepseek-v4-pro-platform', label: 'DeepSeek V4 Pro (experimental)' },
              ]}
            />
          </div>
        </>
      )}

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
                    ? t('dash.settings.no_providers')
                    : t('dash.settings.providers_configured', { count: configuredCount, total: PROVIDERS.length })}
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
                            <span className="text-xs text-emerald-400">{t('dash.settings.saved')}</span>
                          ) : (
                            <>
                              <span className="font-mono text-xs text-[var(--text-muted)]">
                                &#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;
                              </span>
                              <button
                                onClick={() => handleRemoveProviderKey(provider.id)}
                                className="rounded-md px-2 py-1 text-[10px] text-red-400 transition hover:bg-red-500/10"
                              >
                                {t('dash.settings.remove')}
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
                            {t('dash.settings.save')}
                          </button>
                          <button
                            onClick={() => {
                              setEditingProvider(null);
                              setProviderInputs(prev => ({ ...prev, [provider.id]: '' }));
                            }}
                            className="rounded-md px-2 py-1.5 text-[10px] text-[var(--text-muted)] transition hover:text-white"
                          >
                            {t('dash.settings.cancel')}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[var(--text-muted)]">{t('dash.settings.not_set')}</span>
                          <button
                            onClick={() => setEditingProvider(provider.id)}
                            className="rounded-md border border-[var(--border-input)] px-3 py-1.5 text-[10px] font-medium text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-white"
                          >
                            {t('dash.settings.edit')}
                          </button>
                        </div>
                      )}
                    </div>
                    {!providerKeys[provider.id] && editingProvider !== provider.id && (
                      <a
                        href={provider.signupUrl}
                        className="text-[10px] text-[var(--gradient-start)] hover:underline"
                      >
                        {t('dash.settings.get_api_key')} &rarr;
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
      <SectionLabel>{t('dash.settings.section.advanced')}</SectionLabel>
      <div className="mb-4 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)]">
        <button
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className="flex w-full items-center justify-between p-5 text-left"
        >
          <div>
            <p className="text-sm font-semibold">{t('dash.settings.advanced_settings')}</p>
            <p className="text-xs text-[var(--text-muted)]">{t('dash.settings.advanced_hint')}</p>
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
                <p className="text-sm font-semibold">{t('dash.settings.temperature')}</p>
                <span className="rounded-md bg-[var(--bg-input)] px-2 py-0.5 font-mono text-xs text-[var(--text-secondary)]">
                  {local.temperature.toFixed(1)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-[var(--text-muted)]">{t('dash.settings.precise')}</span>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.1}
                  value={local.temperature}
                  onChange={e => saveImmediate('temperature', parseFloat(e.target.value))}
                  className="flex-1 accent-[var(--accent)]"
                />
                <span className="text-[10px] text-[var(--text-muted)]">{t('dash.settings.creative')}</span>
              </div>
            </div>

            <Divider />

            {/* Max Tokens */}
            <div className="mt-5">
              <p className="mb-2 text-sm font-semibold">{t('dash.settings.max_tokens')}</p>
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
          <SectionLabel>{t('dash.settings.section.danger_zone')}</SectionLabel>
          <div className="mb-4 rounded-xl border border-red-500/30 bg-[var(--bg-card)] p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-red-400">{t('dash.settings.disconnect_account')}</p>
                <p className="text-xs text-red-400/70">
                  {t('dash.settings.disconnect_desc')}
                </p>
              </div>
              <button
                onClick={() => post({ type: 'disconnect_account' })}
                className="rounded-lg border border-red-500/40 px-4 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-500/10"
              >
                {t('dash.settings.disconnect')}
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
