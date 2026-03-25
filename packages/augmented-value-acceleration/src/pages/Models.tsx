import { useState, useEffect, useCallback, useMemo } from 'react';
import PageHeader from '../components/PageHeader';
import { supabase } from '../lib/supabase';
import {
  theme, pageStyle, inputStyle as themeInputStyle, cardStyle, chipStyle,
  primaryBtnStyle, ghostBtnStyle, labelStyle, modalOverlayStyle, modalContentStyle,
  sectionHeaderStyle,
} from '../lib/theme';

/* ── Types ───────────────────────────────────────────────────────────────── */

interface Model {
  id: string;
  name: string;
  provider: string;
  section: 'platform' | 'byok';
  context_window: number;
  max_output: number;
  input_price: number;
  output_price: number;
  vision: boolean;
  thinking: boolean;
  tools: boolean;
  enabled: boolean;
  free: boolean;
}

interface FormState {
  id: string;
  name: string;
  provider: string;
  section: 'platform' | 'byok';
  context_window: string;
  max_output: string;
  input_price: string;
  output_price: string;
  vision: boolean;
  thinking: boolean;
  tools: boolean;
  free: boolean;
}

const EMPTY_FORM: FormState = {
  id: '', name: '', provider: '', section: 'platform',
  context_window: '128000', max_output: '8192',
  input_price: '0', output_price: '0',
  vision: false, thinking: false, tools: true, free: false,
};

/* ── Helpers ─────────────────────────────────────────────────────────────── */

const PROVIDER_COLORS: Record<string, string> = {
  DeepSeek: theme.blue,
  Kimi: '#f472b6',
  Qwen: theme.green,
  Zhipu: theme.yellow,
  Mistral: theme.orange,
  Anthropic: '#a78bfa',
  Google: '#4ade80',
  OpenRouter: theme.teal,
  Groq: '#fb923c',
  Together: '#f97316',
  Fireworks: theme.red,
};

function formatContext(tokens: number): string {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(0)}M`;
  return `${(tokens / 1000).toFixed(0)}K`;
}

function providerColor(provider: string): string {
  return PROVIDER_COLORS[provider] || theme.textMuted;
}

/* ── Component ───────────────────────────────────────────────────────────── */

export default function Models() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [collapsedProviders, setCollapsedProviders] = useState<Set<string>>(new Set());

  /* ── Fetch ────────────────────────────────────────────────────────────── */

  const fetchModels = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('models')
      .select('*')
      .order('provider')
      .order('name');

    if (!error && data) setModels(data as Model[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchModels(); }, [fetchModels]);

  /* ── Derived ──────────────────────────────────────────────────────────── */

  const filtered = useMemo(() => {
    if (!search) return models;
    const q = search.toLowerCase();
    return models.filter(m =>
      m.name.toLowerCase().includes(q) ||
      m.id.toLowerCase().includes(q) ||
      m.provider.toLowerCase().includes(q)
    );
  }, [models, search]);

  const platformModels = useMemo(() => filtered.filter(m => m.section === 'platform'), [filtered]);
  const byokModels = useMemo(() => filtered.filter(m => m.section === 'byok'), [filtered]);

  const byokGrouped = useMemo(() => {
    const groups: Record<string, Model[]> = {};
    for (const m of byokModels) {
      (groups[m.provider] ??= []).push(m);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [byokModels]);

  const enabledCount = models.filter(m => m.enabled).length;
  const providerCount = new Set(models.map(m => m.provider)).size;

  /* ── Toggle ───────────────────────────────────────────────────────────── */

  async function toggleModel(id: string, currentEnabled: boolean) {
    setModels(prev => prev.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m));
    const { error } = await supabase
      .from('models')
      .update({ enabled: !currentEnabled })
      .eq('id', id);

    if (error) {
      setModels(prev => prev.map(m => m.id === id ? { ...m, enabled: currentEnabled } : m));
    }
  }

  /* ── Add Model ────────────────────────────────────────────────────────── */

  async function handleAddModel() {
    if (!form.id || !form.name || !form.provider) return;
    setSaving(true);

    const record = {
      id: form.id,
      name: form.name,
      provider: form.provider,
      section: form.section,
      context_window: parseInt(form.context_window) || 128000,
      max_output: parseInt(form.max_output) || 8192,
      input_price: parseFloat(form.input_price) || 0,
      output_price: parseFloat(form.output_price) || 0,
      vision: form.vision,
      thinking: form.thinking,
      tools: form.tools,
      free: form.free,
      enabled: true,
    };

    const { error } = await supabase.from('models').insert(record);
    setSaving(false);

    if (!error) {
      setShowForm(false);
      setForm(EMPTY_FORM);
      fetchModels();
    }
  }

  /* ── Collapse toggle ──────────────────────────────────────────────────── */

  function toggleProvider(provider: string) {
    setCollapsedProviders(prev => {
      const next = new Set(prev);
      if (next.has(provider)) next.delete(provider); else next.add(provider);
      return next;
    });
  }

  /* ── Sub-components ───────────────────────────────────────────────────── */

  const capChip = (label: string, active: boolean) => (
    <span style={{
      fontSize: 9, fontWeight: 400, padding: '2px 8px', borderRadius: 8,
      background: active ? theme.accentBg : 'rgba(107, 114, 128, 0.08)',
      color: active ? theme.accent : theme.textMuted,
      lineHeight: '16px',
    }}>
      {label}
    </span>
  );

  const toggle = (id: string, enabled: boolean) => (
    <button
      onClick={() => toggleModel(id, enabled)}
      style={{
        width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
        background: enabled ? theme.accent : theme.inputBg,
        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
      }}
    >
      <div style={{
        width: 16, height: 16, borderRadius: '50%', background: '#fff',
        position: 'absolute', top: 3,
        left: enabled ? 21 : 3,
        transition: 'left 0.2s',
      }} />
    </button>
  );

  const modelRow = (model: Model) => (
    <div
      key={model.id}
      style={{
        ...cardStyle,
        opacity: model.enabled ? 1 : 0.45,
        padding: '14px 18px',
        transition: 'opacity 0.2s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Name + ID */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{
              width: 7, height: 7, borderRadius: '50%',
              background: providerColor(model.provider), flexShrink: 0,
            }} />
            <span style={{ fontSize: 13, fontWeight: 300, color: theme.text }}>{model.name}</span>
            <span style={{
              fontSize: 9, fontWeight: 400, padding: '1px 8px', borderRadius: 6,
              background: `${providerColor(model.provider)}18`,
              color: providerColor(model.provider),
            }}>
              {model.provider}
            </span>
            {model.free && (
              <span style={chipStyle(theme.greenBg, theme.green)}>FREE</span>
            )}
          </div>
          <span style={{ fontSize: 11, color: theme.textMuted, fontFamily: 'monospace', fontWeight: 300 }}>{model.id}</span>
        </div>

        {/* Context */}
        <div style={{ textAlign: 'right', minWidth: 70 }}>
          <div style={{ fontSize: 12, fontWeight: 300, color: theme.text }}>{formatContext(model.context_window)}</div>
          <div style={{ fontSize: 9, color: theme.textMuted, fontWeight: 300 }}>context</div>
        </div>

        {/* Pricing */}
        <div style={{ textAlign: 'right', minWidth: 90 }}>
          <div style={{ fontSize: 11, fontWeight: 300, color: theme.textSecondary }}>
            ${model.input_price} / ${model.output_price}
          </div>
          <div style={{ fontSize: 9, color: theme.textMuted, fontWeight: 300 }}>in / out per 1M</div>
        </div>

        {/* Capabilities */}
        <div style={{ display: 'flex', gap: 4, minWidth: 130 }}>
          {capChip('Vision', model.vision)}
          {capChip('Thinking', model.thinking)}
          {capChip('Tools', model.tools)}
        </div>

        {/* Toggle */}
        {toggle(model.id, model.enabled)}
      </div>
    </div>
  );

  /* ── Render ───────────────────────────────────────────────────────────── */

  return (
    <div style={pageStyle}>
      <PageHeader
        title="Models"
        subtitle={loading ? 'Loading...' : `${models.length} models across ${providerCount} providers. ${enabledCount} enabled.`}
        onRefresh={fetchModels}
      >
        <button
          onClick={() => { setForm(EMPTY_FORM); setShowForm(true); }}
          style={{ ...primaryBtnStyle, fontSize: 12, padding: '8px 18px' }}
        >
          Add Model
        </button>
      </PageHeader>

      {/* Search */}
      <div style={{ marginBottom: 20 }}>
        <input
          style={{ ...themeInputStyle, maxWidth: 400 }}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search models by name, ID, or provider..."
        />
      </div>

      {/* ── Platform Models ─────────────────────────────────────────────── */}
      {platformModels.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ ...sectionHeaderStyle, marginBottom: 10 }}>Platform Models</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {platformModels.map(modelRow)}
          </div>
        </div>
      )}

      {/* ── BYOK Models (grouped by provider) ──────────────────────────── */}
      {byokGrouped.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ ...sectionHeaderStyle, marginBottom: 10 }}>BYOK Models</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {byokGrouped.map(([provider, provModels]) => {
              const collapsed = collapsedProviders.has(provider);
              return (
                <div key={provider}>
                  {/* Provider header */}
                  <button
                    onClick={() => toggleProvider(provider)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      width: '100%', background: 'none', border: 'none',
                      cursor: 'pointer', padding: '8px 4px', textAlign: 'left',
                    }}
                  >
                    <svg
                      width="12" height="12" viewBox="0 0 24 24" fill="none"
                      stroke={theme.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      style={{ transition: 'transform 0.2s', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                    <div style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: providerColor(provider),
                    }} />
                    <span style={{ fontSize: 12, fontWeight: 400, color: theme.text }}>{provider}</span>
                    <span style={{ fontSize: 10, color: theme.textMuted, fontWeight: 300 }}>
                      {provModels.length} model{provModels.length !== 1 ? 's' : ''}
                    </span>
                  </button>

                  {/* Provider models */}
                  {!collapsed && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4, paddingLeft: 4 }}>
                      {provModels.map(modelRow)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────── */}
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: theme.textMuted, fontWeight: 300 }}>
          {search ? 'No models match the current search.' : 'No models configured yet.'}
        </div>
      )}

      {/* ── Add Model Modal ─────────────────────────────────────────────── */}
      {showForm && (
        <div style={modalOverlayStyle} onClick={() => setShowForm(false)}>
          <div
            style={{ ...modalContentStyle, width: 480 }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 14, fontWeight: 400, color: theme.text, margin: '0 0 20px' }}>Add Model</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* ID */}
              <div>
                <label style={labelStyle}>Model ID</label>
                <input
                  style={themeInputStyle}
                  value={form.id}
                  onChange={e => setForm(f => ({ ...f, id: e.target.value }))}
                  placeholder="e.g. qwen-plus"
                />
              </div>

              {/* Name */}
              <div>
                <label style={labelStyle}>Display Name</label>
                <input
                  style={themeInputStyle}
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Qwen Plus"
                />
              </div>

              {/* Provider + Section row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Provider</label>
                  <input
                    style={themeInputStyle}
                    value={form.provider}
                    onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}
                    placeholder="e.g. Qwen"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Section</label>
                  <select
                    style={{ ...themeInputStyle, cursor: 'pointer' }}
                    value={form.section}
                    onChange={e => setForm(f => ({ ...f, section: e.target.value as 'platform' | 'byok' }))}
                  >
                    <option value="platform">Platform</option>
                    <option value="byok">BYOK</option>
                  </select>
                </div>
              </div>

              {/* Context + Max Output row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Context Window</label>
                  <input
                    style={themeInputStyle}
                    type="number"
                    value={form.context_window}
                    onChange={e => setForm(f => ({ ...f, context_window: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Max Output</label>
                  <input
                    style={themeInputStyle}
                    type="number"
                    value={form.max_output}
                    onChange={e => setForm(f => ({ ...f, max_output: e.target.value }))}
                  />
                </div>
              </div>

              {/* Pricing row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Input Price (per 1M)</label>
                  <input
                    style={themeInputStyle}
                    type="number"
                    step="0.01"
                    value={form.input_price}
                    onChange={e => setForm(f => ({ ...f, input_price: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Output Price (per 1M)</label>
                  <input
                    style={themeInputStyle}
                    type="number"
                    step="0.01"
                    value={form.output_price}
                    onChange={e => setForm(f => ({ ...f, output_price: e.target.value }))}
                  />
                </div>
              </div>

              {/* Capabilities checkboxes */}
              <div>
                <label style={labelStyle}>Capabilities</label>
                <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                  {(['vision', 'thinking', 'tools', 'free'] as const).map(cap => (
                    <label
                      key={cap}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: theme.textSecondary, fontWeight: 300 }}
                    >
                      <input
                        type="checkbox"
                        checked={form[cap]}
                        onChange={e => setForm(f => ({ ...f, [cap]: e.target.checked }))}
                        style={{ accentColor: theme.accent }}
                      />
                      {cap.charAt(0).toUpperCase() + cap.slice(1)}
                    </label>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  style={ghostBtnStyle}
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>
                <button
                  style={{ ...primaryBtnStyle, opacity: saving ? 0.6 : 1 }}
                  onClick={handleAddModel}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Add Model'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
