import { useState } from 'react';
import { getPlugins, setPluginEnabled, getPluginCount } from '../lib/plugins';
import PageHeader from '../components/PageHeader';
import type { PluginRegistration } from '../lib/plugins';

/* ── Component ──────────────────────────────────────────────────────────── */

export default function Plugins() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [_, setRefresh] = useState(0);

  const plugins = getPlugins();
  const counts = getPluginCount();

  /* ── Filter + Search ─────────────────────────────────────────────────── */

  const filtered = plugins.filter(p => {
    if (filter === 'enabled' && !p.enabled) return false;
    if (filter === 'disabled' && p.enabled) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        p.plugin.name.toLowerCase().includes(q) ||
        p.plugin.description.toLowerCase().includes(q) ||
        p.plugin.author.toLowerCase().includes(q)
      );
    }
    return true;
  });

  /* ── Toggle ──────────────────────────────────────────────────────────── */

  const handleToggle = (id: string, enabled: boolean) => {
    setPluginEnabled(id, enabled);
    setRefresh(n => n + 1);
  };

  /* ── Styles ──────────────────────────────────────────────────────────── */

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', background: '#1a1a35', border: '1px solid #1f1f3a',
    borderRadius: 10, color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box',
  };

  const cardStyle: React.CSSProperties = {
    background: '#111127', border: '1px solid #1f1f3a', borderRadius: 14, padding: 24,
  };

  return (
    <div style={{ padding: '40px 48px', overflowY: 'auto', height: '100%', background: '#0a0a1a' }}>
      {/* Header */}
      <PageHeader title="Plugins" subtitle="Extend platform capabilities with plugins" />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Total Plugins', value: counts.total, color: '#a855f7' },
          { label: 'Enabled', value: counts.enabled, color: '#34d399' },
          { label: 'Disabled', value: counts.disabled, color: '#f87171' },
        ].map(s => (
          <div key={s.label} style={cardStyle}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Search + Filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
        <input
          style={{ ...inputStyle, flex: 1 }}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search plugins..."
        />
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'enabled', 'disabled'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 500,
                background: filter === f ? '#a855f720' : '#1a1a35',
                color: filter === f ? '#a855f7' : '#6b7280',
                transition: 'all 0.15s',
              }}
            >{f.charAt(0).toUpperCase() + f.slice(1)}</button>
          ))}
        </div>
      </div>

      {/* Plugin List */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 80, color: '#6b7280' }}>
          {plugins.length === 0 ? (
            <>
              <div style={{ fontSize: 48, marginBottom: 16 }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
                </svg>
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#9ca3af', marginBottom: 8 }}>No plugins installed</div>
              <div style={{ fontSize: 14 }}>Plugins extend the platform with new pages, tools, and integrations.</div>
              <div style={{ fontSize: 13, color: '#4b5563', marginTop: 16 }}>
                Register plugins programmatically using <code style={{ padding: '2px 6px', background: '#1f1f3a', borderRadius: 4, fontSize: 12 }}>registerPlugin()</code> from <code style={{ padding: '2px 6px', background: '#1f1f3a', borderRadius: 4, fontSize: 12 }}>lib/plugins</code>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#9ca3af', marginBottom: 8 }}>No matching plugins</div>
              <div style={{ fontSize: 14 }}>Try adjusting your search or filter</div>
            </>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map((reg: PluginRegistration) => (
            <PluginCard key={reg.plugin.id} registration={reg} onToggle={handleToggle} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Plugin Card ────────────────────────────────────────────────────────── */

function PluginCard({ registration, onToggle }: {
  registration: PluginRegistration;
  onToggle: (id: string, enabled: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { plugin, enabled, registeredAt } = registration;

  return (
    <div style={{
      background: '#111127', border: '1px solid #1f1f3a', borderRadius: 14, padding: 20,
      opacity: enabled ? 1 : 0.6, transition: 'opacity 0.15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* Icon */}
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: enabled ? 'rgba(168, 85, 247, 0.1)' : '#1f1f3a',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, flexShrink: 0,
        }}>{plugin.icon}</div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{plugin.name}</span>
            <span style={{
              padding: '1px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
              background: '#1f1f3a', color: '#6b7280',
            }}>v{plugin.version}</span>
          </div>
          <div style={{ fontSize: 13, color: '#9ca3af' }}>{plugin.description}</div>
          <div style={{ fontSize: 11, color: '#4b5563', marginTop: 4 }}>
            by {plugin.author} &middot; Section: {plugin.navItem.section}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
              background: '#1a1a35', color: '#9ca3af', border: '1px solid #1f1f3a',
            }}
          >{expanded ? 'Less' : 'Details'}</button>

          <button
            onClick={() => onToggle(plugin.id, !enabled)}
            style={{
              padding: '6px 18px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: enabled ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
              color: enabled ? '#fca5a5' : '#86efac',
              border: `1px solid ${enabled ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)'}`,
            }}
          >{enabled ? 'Disable' : 'Enable'}</button>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div style={{
          marginTop: 16, paddingTop: 16, borderTop: '1px solid #1f1f3a',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', marginBottom: 6 }}>Permissions</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {plugin.permissions.length > 0 ? plugin.permissions.map(p => (
                <span key={p} style={{
                  padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                  background: '#1a1a35', color: '#9ca3af', border: '1px solid #1f1f3a',
                }}>{p}</span>
              )) : (
                <span style={{ fontSize: 12, color: '#4b5563' }}>No permissions required</span>
              )}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', marginBottom: 6 }}>Registration</div>
            <div style={{ fontSize: 12, color: '#9ca3af' }}>
              Registered: {new Date(registeredAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
              Status: <span style={{ fontWeight: 600, color: enabled ? '#86efac' : '#fca5a5' }}>{enabled ? 'Enabled' : 'Disabled'}</span>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', marginBottom: 6 }}>Navigation</div>
            <div style={{ fontSize: 12, color: '#9ca3af' }}>
              Section: {plugin.navItem.section} &middot; Label: {plugin.navItem.label}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', marginBottom: 6 }}>Plugin ID</div>
            <code style={{ fontSize: 11, color: '#6b7280', background: '#0d0d22', padding: '3px 8px', borderRadius: 4 }}>{plugin.id}</code>
          </div>
        </div>
      )}
    </div>
  );
}
