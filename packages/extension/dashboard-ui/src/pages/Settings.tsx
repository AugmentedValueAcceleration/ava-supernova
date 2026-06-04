import { useState, useEffect, useRef } from 'react';
import { t, tt, initLocale, useLocale } from '../i18n';
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
    description: 'DeepSeek V4 Pro and V4 Flash — 1M context, MIT open-weight',
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
    description: 'Mistral Large 3, Medium 3.5, Small 4, Codestral, Devstral 2',
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

  // 5-tab Settings refactor — mirrors IDE Settings (Models / Personality /
  // Permissions / Data / Advanced). State persists so the user lands on
  // whichever tab they last had open instead of always hitting Models.
  type SettingsTab = 'models' | 'personality' | 'permissions' | 'data' | 'advanced';
  const [tab, setTab] = useState<SettingsTab>(() => {
    try {
      const stored = localStorage.getItem('ava-ext-settings-tab');
      const valid: SettingsTab[] = ['models', 'personality', 'permissions', 'data', 'advanced'];
      if (stored && (valid as string[]).includes(stored)) return stored as SettingsTab;
    } catch { /* */ }
    return 'models';
  });
  const switchTab = (next: SettingsTab) => {
    setTab(next);
    try { localStorage.setItem('ava-ext-settings-tab', next); } catch { /* */ }
  };
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Local / custom OpenAI-compatible provider state — Ollama, LM Studio, vLLM.
  // Loads from the host on mount (it reads SecretStorage); writes go back
  // through save_local_model / remove_local_model messages.
  const [localBaseUrl, setLocalBaseUrl] = useState('');
  const [localModelName, setLocalModelName] = useState('');
  const [localApiKey, setLocalApiKey] = useState('');
  const [localModelLabel, setLocalModelLabel] = useState('');
  const [localHasSavedKey, setLocalHasSavedKey] = useState(false);
  const [localSavedTick, setLocalSavedTick] = useState(0);

  useEffect(() => {
    post({ type: 'load_local_model' });
    // Dashboard uses raw window.addEventListener('message') because App.tsx
    // doesn't expose a subscribe() helper — each page handles its own
    // message types directly. The host sends `local_model_loaded` once
    // after every save / remove / load, so the UI always reflects the
    // current SecretStorage state without polling.
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg && msg.type === 'local_model_loaded') {
        setLocalBaseUrl(msg.baseUrl || '');
        setLocalModelName(msg.modelName || '');
        setLocalModelLabel(msg.modelLabel || '');
        setLocalHasSavedKey(!!msg.hasApiKey);
        // Don't echo the key back — leave the input blank when loaded.
        setLocalApiKey('');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const localIsConfigured = !!(localBaseUrl.trim() && localModelName.trim());

  const handleSaveLocalModel = () => {
    if (!localBaseUrl.trim() || !localModelName.trim()) return;
    post({
      type: 'save_local_model',
      baseUrl: localBaseUrl.trim(),
      modelName: localModelName.trim(),
      apiKey: localApiKey.trim() || undefined,
      modelLabel: localModelLabel.trim() || undefined,
    });
    setLocalSavedTick(n => n + 1);
    setTimeout(() => setLocalSavedTick(n => n + 1), 1800);
  };

  const handleRemoveLocalModel = () => {
    post({ type: 'remove_local_model' });
    setLocalBaseUrl('');
    setLocalModelName('');
    setLocalApiKey('');
    setLocalModelLabel('');
    setLocalHasSavedKey(false);
  };

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
    <div className="w-full pb-12">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold text-[#cdd6f4]">{t('dash.settings.title')}</h1>
        <p className="mt-1.5 text-[13px] text-[#6c7086]">
          {t('dash.settings.subtitle')}
        </p>
      </div>

      {/* ── Tab nav — mirrors IDE Settings 5-tab refactor ────────────── */}
      <div className="mb-6 flex gap-1 border-b border-[var(--border-card)]">
        {([
          { id: 'models' as const,       label: tt('dash.settings.tab.models',       'Models') },
          { id: 'personality' as const,  label: tt('dash.settings.tab.personality',  'Personality') },
          { id: 'permissions' as const,  label: tt('dash.settings.tab.permissions',  'Permissions') },
          { id: 'data' as const,         label: tt('dash.settings.tab.data',         'Data') },
          { id: 'advanced' as const,     label: tt('dash.settings.tab.advanced',     'Advanced') },
        ]).map(t_ => (
          <button
            key={t_.id}
            onClick={() => switchTab(t_.id)}
            className={[
              'px-4 py-2 text-sm transition border-b-2 -mb-px',
              tab === t_.id
                ? 'border-[var(--accent)] text-[var(--text-primary)] font-medium'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
            ].join(' ')}
          >
            {t_.label}
          </button>
        ))}
      </div>

      {/* ── Personality tab — Your AI + Avatar ──────────────────────── */}
      {tab === 'personality' && <>
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
      <SectionLabel>{t('dash.settings.avatar')}</SectionLabel>
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
                {avatarUploading ? t('dash.journal.saving') : avatarDataUrl ? t('dash.settings.change_avatar') : t('dash.settings.upload_avatar')}
              </button>
              {avatarDataUrl && (
                <button
                  onClick={() => post({ type: 'remove_avatar' })}
                  className="rounded-lg border border-[var(--border-card)] px-3 py-1.5 text-[11px] text-red-400 transition hover:border-red-400/40"
                >
                  {t('dash.settings.remove')}
                </button>
              )}
            </div>
            <p className="mt-1.5 text-[10px] text-[var(--text-muted)]">{t('dash.settings.avatar_hint')}</p>
          </div>
        </div>
      </div>

      </>}
      {/* ── Data tab — Privacy + Help train Ava (Language renders below
            Behavior since it shares the same tab but the page order
            keeps the legacy section sequence) ──────────────────────── */}
      {tab === 'data' && <>
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
      <SectionLabel>{t('dash.settings.dataset_section')}</SectionLabel>
      <div className="mb-4 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
        <ToggleRow
          icon={<span className="text-base">&#x1f9ea;</span>}
          title={t('dash.settings.dataset_capture_title')}
          description={t('dash.settings.dataset_capture_desc')}
          value={datasetConfig?.enabled ?? false}
          onChange={setDatasetMaster}
        />

        {datasetConfig?.enabled && (
          <>
            <Divider />
            <p className="mb-2 text-xs font-semibold text-[var(--text-secondary)]">{t('dash.settings.dataset_modes')}</p>
            <p className="mb-3 text-[11px] text-[var(--text-muted)]">
              {t('dash.settings.dataset_modes_desc')}
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
                    {t('dash.settings.dataset_mode.' + mode)}
                  </button>
                );
              })}
            </div>

            <Divider />
            <p className="mb-2 text-xs font-semibold text-[var(--text-secondary)]">{t('dash.settings.dataset_kinds')}</p>
            <p className="mb-3 text-[11px] text-[var(--text-muted)]">
              {t('dash.settings.dataset_kinds_desc')}
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
                    <span className="truncate">{t('dash.settings.dataset_kind.' + kind)}</span>
                  </button>
                );
              })}
            </div>

            <p className="mt-4 text-[10px] text-[var(--text-muted)]">
              {t('dash.settings.dataset_note')}
            </p>
          </>
        )}
      </div>

      </>}
      {/* ── Permissions tab — Behavior (permission mode + caps) ────── */}
      {tab === 'permissions' && <>
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
            onClick={() => {
              if (local.permissionMode === 'autonomous') return; // already on
              const ok = window.confirm(t('dash.settings.autonomous_confirm'));
              if (ok) saveImmediate('permissionMode', 'autonomous');
            }}
          />
        </div>

        {local.permissionMode === 'custom' && (
          <div className="mb-3 rounded-lg border border-purple-500/30 bg-purple-500/5 px-3 py-2 text-[11px] text-purple-300">
            {t('dash.settings.custom_banner')}
          </div>
        )}

        {/* Category-level permissions */}
        <details className="mb-4 group">
          <summary className="cursor-pointer text-xs font-semibold text-[var(--text-secondary)] hover:text-white transition select-none">
            {t('dash.settings.customise_by_category')}
          </summary>
          <div className="mt-3 space-y-1.5">
            {([
              { id: 'file_ops', icon: '📁', labelKey: 'dash.settings.cat_file_ops', desc: 'read, write, edit, glob, grep' },
              { id: 'shell', icon: '💻', labelKey: 'dash.settings.cat_shell', desc: 'bash, test_run, test_generate' },
              { id: 'git', icon: '🔀', labelKey: 'dash.settings.cat_git', desc: 'status, diff, commit, PR, rollback' },
              { id: 'web', icon: '🌐', labelKey: 'dash.settings.cat_web', desc: 'search, http_request, browser' },
              { id: 'media', icon: '🎨', labelKey: 'dash.settings.cat_media', desc: 'generate_image, generate_video, generate_voice, generate_music, remove_bg' },
              { id: 'database', icon: '🗄️', labelKey: 'dash.settings.cat_database', desc: 'database_query' },
              { id: 'system', icon: '🖥️', labelKey: 'dash.settings.cat_system', desc: 'desktop_*, browser_* (IDE only)' },
              { id: 'documents', icon: '📄', labelKey: 'dash.settings.cat_documents', desc: 'docs, reports, emails' },
              { id: 'memory', icon: '🧠', labelKey: 'dash.settings.cat_memory', desc: 'save, recall, update, delete' },
              { id: 'learning', icon: '🎓', labelKey: 'dash.settings.cat_learning', desc: 'create, teach, progress' },
            ] as const).map(cat => {
              const currentPerm = (local.categoryPermissions || {})[cat.id] || 'auto';
              return (
                <div key={cat.id} className="flex items-center gap-3 rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)]/30 px-3 py-2">
                  <span className="text-sm">{cat.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-[var(--text-secondary)]">{t(cat.labelKey)}</p>
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
                        {perm === 'auto' ? t('dash.settings.perm_auto') : perm === 'first_time' ? t('dash.settings.perm_first_time') : t('dash.settings.perm_always_ask')}
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

      </>}
      {/* ── Data tab continued — Language ────────────────────────────── */}
      {tab === 'data' && <>
      <SectionLabel>{t('dash.settings.language')}</SectionLabel>
      <div className="mb-4 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
        <Select
          value={local.language}
          onChange={v => saveImmediate('language', v)}
          options={LANGUAGES.map(l => l.value === 'auto' ? { ...l, label: t('dash.settings.auto_detect') } : l)}
        />
      </div>

      </>}
      {/* ── Models tab — Custom Model + Provider keys (BYOK) ────────── */}
      {tab === 'models' && <>
      {/* ── Custom OpenAI-compatible model — local or remote ────────────
            Covers Ollama / LM Studio / vLLM on your machine AND BYOM cases:
            private vLLM clusters, self-hosted finetunes, OpenRouter,
            Together, anything that speaks the OpenAI Chat Completions API.
            Restart the chat panel after saving so AvaViewProvider re-reads
            SecretStorage and registers the generic provider with the new
            baseUrl + model name. */}
      <SectionLabel>{t('dash.settings.custom_model')}</SectionLabel>
      <div className="mb-4 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
        <div className="flex items-start gap-3">
          <span className="text-[22px]">🦙</span>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">{t('dash.settings.custom_model_title')}</p>
              {localIsConfigured && (
                <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-400 border border-emerald-500/30">
                  {t('dash.settings.configured')}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {t('dash.settings.custom_model_desc')}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <p className="mb-1 text-xs font-medium">{t('dash.settings.base_url')}</p>
            <input
              value={localBaseUrl}
              onChange={e => setLocalBaseUrl(e.target.value)}
              placeholder="http://localhost:11434/v1"
              spellCheck={false}
              className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-1.5 font-mono text-xs text-white placeholder-[var(--text-muted)] outline-none transition focus:border-[var(--accent)]"
            />
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">
              Ollama: <code className="text-white">http://localhost:11434/v1</code>. LM Studio: <code className="text-white">http://localhost:1234/v1</code>.
              Remote: <code className="text-white">https://your-host/v1</code>.
            </p>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium">{t('dash.settings.model_name')}</p>
            <input
              value={localModelName}
              onChange={e => setLocalModelName(e.target.value)}
              placeholder="qwen2.5-coder:7b"
              spellCheck={false}
              className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-1.5 font-mono text-xs text-white placeholder-[var(--text-muted)] outline-none transition focus:border-[var(--accent)]"
            />
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">
              {t('dash.settings.model_name_hint')} <code className="text-white">ollama list</code>
            </p>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium">{t('dash.settings.display_name')} <span className="text-[var(--text-muted)] font-normal">{t('dash.settings.optional_paren')}</span></p>
            <input
              value={localModelLabel}
              onChange={e => setLocalModelLabel(e.target.value)}
              placeholder={t('dash.settings.display_name_placeholder')}
              spellCheck={false}
              className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-1.5 font-mono text-xs text-white placeholder-[var(--text-muted)] outline-none transition focus:border-[var(--accent)]"
            />
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">
              {t('dash.settings.display_name_hint')}
            </p>
          </div>

          <div className="col-span-2">
            <p className="mb-1 text-xs font-medium">{t('dash.settings.api_key')} <span className="text-[var(--text-muted)] font-normal">{t('dash.settings.api_key_optional')}</span></p>
            <input
              type="password"
              value={localApiKey}
              onChange={e => setLocalApiKey(e.target.value)}
              placeholder={localHasSavedKey ? t('dash.settings.api_key_saved_placeholder') : t('dash.settings.api_key_empty_placeholder')}
              spellCheck={false}
              autoComplete="off"
              className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-1.5 font-mono text-xs text-white placeholder-[var(--text-muted)] outline-none transition focus:border-[var(--accent)]"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={handleSaveLocalModel}
            disabled={!localBaseUrl.trim() || !localModelName.trim()}
            className="rounded-md bg-[var(--accent)] px-4 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {localSavedTick % 2 === 1 ? t('dash.settings.saved_check') : t('dash.settings.save')}
          </button>
          {localIsConfigured && (
            <button
              onClick={handleRemoveLocalModel}
              className="rounded-md border border-red-500/30 px-3 py-1.5 text-[11px] font-medium text-red-400 transition hover:bg-red-500/10"
            >
              {t('dash.settings.remove')}
            </button>
          )}
          <span className="flex-1" />
          <a
            href="https://ollama.com/download"
            target="_blank"
            rel="noreferrer"
            className="text-[10px] text-[var(--text-muted)] transition hover:text-[var(--text-secondary)]"
          >
            {t('dash.settings.get_ollama')}
          </a>
        </div>
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

      </>}
      {/* ── Advanced tab — Advanced + Danger Zone ────────────────────── */}
      {tab === 'advanced' && <>
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

            <Divider />

            {/* Loop Prevention — verify_change before close + fresh-eyes
                escalation on stuck same-signature failures. On by default.
                When off, Ava reverts to pre-loop-prevention behaviour: she
                may declare turns done with file edits that don't compile,
                and same-signature failure loops won't trigger an
                independent review. */}
            <div className="mt-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">{t('dash.settings.loop_prevention')}</p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  {t('dash.settings.loop_prevention_desc')}
                </p>
              </div>
              <ToggleSwitch
                value={local.loopPreventionEnabled}
                onChange={v => saveImmediate('loopPreventionEnabled', v)}
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
      </>}
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
