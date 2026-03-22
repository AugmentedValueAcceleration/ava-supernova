import { useState } from 'react';
import PageHeader from '../components/PageHeader';

interface Model {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  maxOutputTokens: number;
  inputPrice: number;
  outputPrice: number;
  vision: boolean;
  thinking: boolean;
  tools: boolean;
  enabled: boolean;
  free: boolean;
}

const INITIAL_MODELS: Model[] = [
  { id: 'deepseek-chat', name: 'DeepSeek V3.2', provider: 'DeepSeek', contextWindow: 128000, maxOutputTokens: 8192, inputPrice: 0.28, outputPrice: 0.42, vision: false, thinking: false, tools: true, enabled: true, free: false },
  { id: 'deepseek-reasoner', name: 'DeepSeek V3.2 Reasoner', provider: 'DeepSeek', contextWindow: 128000, maxOutputTokens: 64000, inputPrice: 0.28, outputPrice: 0.42, vision: false, thinking: true, tools: true, enabled: true, free: false },
  { id: 'moonshot-v1-128k', name: 'Moonshot V1 128K', provider: 'Kimi', contextWindow: 128000, maxOutputTokens: 8192, inputPrice: 0.82, outputPrice: 0.82, vision: false, thinking: false, tools: true, enabled: true, free: false },
  { id: 'kimi-k2', name: 'Kimi K2', provider: 'Kimi', contextWindow: 128000, maxOutputTokens: 8192, inputPrice: 0.82, outputPrice: 0.82, vision: false, thinking: false, tools: true, enabled: true, free: false },
  { id: 'qwen-plus', name: 'Qwen Plus', provider: 'Qwen', contextWindow: 131072, maxOutputTokens: 8192, inputPrice: 0.80, outputPrice: 2.00, vision: false, thinking: false, tools: true, enabled: true, free: false },
  { id: 'qwen-turbo', name: 'Qwen Turbo', provider: 'Qwen', contextWindow: 131072, maxOutputTokens: 8192, inputPrice: 0.30, outputPrice: 0.60, vision: false, thinking: false, tools: true, enabled: true, free: true },
  { id: 'qwen-long', name: 'Qwen Long', provider: 'Qwen', contextWindow: 1000000, maxOutputTokens: 8192, inputPrice: 0.30, outputPrice: 0.60, vision: false, thinking: false, tools: true, enabled: true, free: true },
  { id: 'qwen-max', name: 'Qwen Max', provider: 'Qwen', contextWindow: 131072, maxOutputTokens: 8192, inputPrice: 2.40, outputPrice: 9.60, vision: false, thinking: false, tools: true, enabled: true, free: false },
  { id: 'glm-4-plus', name: 'GLM-4 Plus', provider: 'Zhipu', contextWindow: 128000, maxOutputTokens: 4096, inputPrice: 7.14, outputPrice: 7.14, vision: false, thinking: false, tools: true, enabled: true, free: false },
  { id: 'glm-4v-plus', name: 'GLM-4V Plus', provider: 'Zhipu', contextWindow: 8192, maxOutputTokens: 1024, inputPrice: 7.14, outputPrice: 7.14, vision: true, thinking: false, tools: false, enabled: true, free: false },
  { id: 'mistral-large-latest', name: 'Mistral Large', provider: 'Mistral', contextWindow: 128000, maxOutputTokens: 8192, inputPrice: 2.00, outputPrice: 6.00, vision: false, thinking: false, tools: true, enabled: true, free: false },
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'Anthropic', contextWindow: 200000, maxOutputTokens: 64000, inputPrice: 3.00, outputPrice: 15.00, vision: true, thinking: true, tools: true, enabled: true, free: false },
];

const PROVIDER_COLORS: Record<string, string> = {
  DeepSeek: '#60a5fa',
  Kimi: '#f472b6',
  Qwen: '#4ade80',
  Zhipu: '#fbbf24',
  Mistral: '#fb923c',
  Anthropic: '#a78bfa',
};

function formatContext(tokens: number): string {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(0)}M`;
  return `${(tokens / 1000).toFixed(0)}K`;
}

export default function Models() {
  const [models, setModels] = useState<Model[]>(INITIAL_MODELS);
  const [providerFilter, setProviderFilter] = useState('all');
  const [search, setSearch] = useState('');

  const providers = [...new Set(models.map(m => m.provider))].sort();

  const filtered = models.filter(m => {
    if (providerFilter !== 'all' && m.provider !== providerFilter) return false;
    if (search && !m.name.toLowerCase().includes(search.toLowerCase()) && !m.id.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function toggleModel(id: string) {
    setModels(prev => prev.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m));
  }

  const capBadge = (label: string, active: boolean) => (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 8,
      background: active ? 'rgba(168, 85, 247, 0.15)' : 'rgba(107, 114, 128, 0.1)',
      color: active ? '#a855f7' : '#3f3f46',
    }}>
      {label}
    </span>
  );

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', background: '#1a1a35', border: '1px solid #1f1f3a',
    borderRadius: 10, color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ padding: '32px 40px', overflowY: 'auto', height: '100%', background: '#0a0a1a' }}>
      <PageHeader title="Models" subtitle={`${models.length} models across ${providers.length} providers. ${models.filter(m => m.enabled).length} enabled.`} />

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <input
          style={{ ...inputStyle, flex: 1 }}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search models..."
        />
        <select
          style={{ ...inputStyle, width: 'auto', minWidth: 140 }}
          value={providerFilter}
          onChange={e => setProviderFilter(e.target.value)}
        >
          <option value="all">All Providers</option>
          {providers.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Model Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map(model => (
          <div
            key={model.id}
            style={{
              background: '#111127', border: '1px solid #1f1f3a', borderRadius: 14,
              padding: '16px 20px', opacity: model.enabled ? 1 : 0.5,
              transition: 'opacity 0.2s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {/* Provider dot + name */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: PROVIDER_COLORS[model.provider] || '#6b7280', flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{model.name}</span>
                  {model.free && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 8,
                      background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80',
                    }}>
                      FREE
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>{model.id}</span>
                  <span style={{ fontSize: 11, color: '#3f3f46' }}>|</span>
                  <span style={{ fontSize: 11, color: PROVIDER_COLORS[model.provider] || '#6b7280' }}>{model.provider}</span>
                </div>
              </div>

              {/* Context + Pricing */}
              <div style={{ textAlign: 'right', minWidth: 100 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{formatContext(model.contextWindow)}</div>
                <div style={{ fontSize: 10, color: '#6b7280' }}>context</div>
              </div>
              <div style={{ textAlign: 'right', minWidth: 100 }}>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>${model.inputPrice} / ${model.outputPrice}</div>
                <div style={{ fontSize: 10, color: '#6b7280' }}>in / out per 1M</div>
              </div>

              {/* Capabilities */}
              <div style={{ display: 'flex', gap: 4, minWidth: 150 }}>
                {capBadge('Vision', model.vision)}
                {capBadge('Thinking', model.thinking)}
                {capBadge('Tools', model.tools)}
              </div>

              {/* Toggle */}
              <button
                onClick={() => toggleModel(model.id)}
                style={{
                  width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: model.enabled ? '#a855f7' : '#1f1f3a',
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                }}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: '50%', background: '#fff',
                  position: 'absolute', top: 3,
                  left: model.enabled ? 23 : 3,
                  transition: 'left 0.2s',
                }} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>
          No models match the current filters.
        </div>
      )}
    </div>
  );
}
