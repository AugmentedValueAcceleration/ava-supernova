import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import PageHeader from '../components/PageHeader';
import { theme, pageStyle, cardStyle, inputStyle as themeInputStyle, labelStyle, primaryBtnStyle } from '../lib/theme';

interface PlatformSetting {
  id: string;
  key: string;
  value: string;
  description: string | null;
  updated_at: string;
}

const DEFAULT_SETTINGS = [
  { key: 'banner_message', label: 'Banner Message', description: 'Scrolling banner text displayed on the website.', type: 'textarea' as const },
  { key: 'site_name', label: 'Site Name', description: 'The platform display name.', type: 'text' as const },
  { key: 'site_url', label: 'Site URL', description: 'Primary URL of the platform.', type: 'text' as const },
  { key: 'support_email', label: 'Support Email', description: 'Email address for support inquiries.', type: 'text' as const },
  { key: 'maintenance_mode', label: 'Maintenance Mode', description: 'Enable to show maintenance page to users.', type: 'toggle' as const },
  { key: 'signup_enabled', label: 'Signups Enabled', description: 'Allow new user registrations.', type: 'toggle' as const },
  { key: 'plans_enabled', label: 'Plans Enabled', description: 'Enable paid subscription plans.', type: 'toggle' as const },
  { key: 'free_tier_requests', label: 'Free Tier Requests/Day', description: 'Number of API requests allowed per day on free tier.', type: 'number' as const },
  { key: 'discord_invite', label: 'Discord Invite URL', description: 'Link to the Discord server invite.', type: 'text' as const },
  { key: 'github_url', label: 'GitHub URL', description: 'Link to the GitHub organization.', type: 'text' as const },
];

export default function Settings() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveAll, setSaveAll] = useState(false);
  const [dirty, setDirty] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('platform_settings')
        .select('*');
      const map: Record<string, string> = {};
      (data || []).forEach((s: PlatformSetting) => {
        map[s.key] = s.value;
      });
      setSettings(map);
    } catch {
      // silent
    }
    setLoading(false);
  }

  function updateSetting(key: string, value: string) {
    setSettings(prev => ({ ...prev, [key]: value }));
    setDirty(prev => new Set(prev).add(key));
  }

  async function saveSetting(key: string) {
    setSaving(key);
    try {
      const { data: existing } = await supabase
        .from('platform_settings')
        .select('id')
        .eq('key', key)
        .single();

      if (existing) {
        await supabase
          .from('platform_settings')
          .update({ value: settings[key] || '', updated_at: new Date().toISOString() })
          .eq('key', key);
      } else {
        await supabase
          .from('platform_settings')
          .insert({ key, value: settings[key] || '', updated_at: new Date().toISOString() });
      }

      setDirty(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      setSaveSuccess(key);
      setTimeout(() => setSaveSuccess(null), 2000);
    } catch {
      // silent
    }
    setSaving(null);
  }

  async function saveAllSettings() {
    setSaveAll(true);
    for (const key of dirty) {
      await saveSetting(key);
    }
    setSaveAll(false);
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: theme.pageBg }}>
        <div style={{ fontSize: 14, color: theme.textMuted }}>Loading settings...</div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>

      <PageHeader title="Platform Settings" subtitle="Configure platform-wide settings stored in Supabase." onRefresh={loadSettings}>
        {dirty.size > 0 && (
          <button
            onClick={saveAllSettings}
            disabled={saveAll}
            style={{
              ...primaryBtnStyle,
              cursor: saveAll ? 'not-allowed' : 'pointer',
              opacity: saveAll ? 0.5 : 1,
            }}
          >
            {saveAll ? 'Saving...' : `Save All (${dirty.size})`}
          </button>
        )}
      </PageHeader>

      {/* Settings list */}
      <div style={{ maxWidth: 700 }}>
        {DEFAULT_SETTINGS.map((config) => {
          const isDirty = dirty.has(config.key);
          const isSaving = saving === config.key;
          const isSuccess = saveSuccess === config.key;

          return (
            <div
              key={config.key}
              style={{
                ...cardStyle,
                border: isDirty ? `1px solid ${theme.accent}60` : `1px solid ${theme.border}`,
                marginBottom: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>{config.label}</div>
                  {config.description && (
                    <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>{config.description}</div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {isSuccess && <span style={{ fontSize: 11, color: theme.green }}>Saved</span>}
                  {isDirty && (
                    <button
                      onClick={() => saveSetting(config.key)}
                      disabled={isSaving}
                      style={{
                        ...primaryBtnStyle,
                        padding: '6px 14px',
                        fontSize: 11,
                        cursor: isSaving ? 'not-allowed' : 'pointer',
                        opacity: isSaving ? 0.5 : 1,
                      }}
                    >
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                  )}
                </div>
              </div>

              {config.type === 'textarea' ? (
                <textarea
                  value={settings[config.key] || ''}
                  onChange={(e) => updateSetting(config.key, e.target.value)}
                  rows={3}
                  placeholder={`Enter ${config.label.toLowerCase()}...`}
                  style={{
                    ...themeInputStyle,
                    resize: 'vertical',
                    fontFamily: 'inherit',
                  }}
                />
              ) : config.type === 'toggle' ? (
                <button
                  onClick={() => updateSetting(config.key, settings[config.key] === 'true' ? 'false' : 'true')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  <div style={{
                    width: 44,
                    height: 24,
                    borderRadius: 12,
                    background: settings[config.key] === 'true' ? theme.accent : theme.inputBg,
                    position: 'relative',
                    transition: 'background 0.2s',
                  }}>
                    <div style={{
                      position: 'absolute',
                      top: 3,
                      left: settings[config.key] === 'true' ? 23 : 3,
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: '#fff',
                      transition: 'left 0.2s',
                    }} />
                  </div>
                  <span style={{ fontSize: 13, color: settings[config.key] === 'true' ? theme.green : theme.textMuted }}>
                    {settings[config.key] === 'true' ? 'Enabled' : 'Disabled'}
                  </span>
                </button>
              ) : (
                <input
                  type={config.type}
                  value={settings[config.key] || ''}
                  onChange={(e) => updateSetting(config.key, e.target.value)}
                  placeholder={`Enter ${config.label.toLowerCase()}...`}
                  style={themeInputStyle}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Footer info */}
      <div style={{ marginTop: 24, ...cardStyle, maxWidth: 700, padding: '16px 20px' }}>
        <div style={{ fontSize: 11, color: theme.textMuted }}>
          Settings are stored in the <code style={{ background: theme.inputBg, padding: '2px 6px', borderRadius: 4, fontSize: 10 }}>platform_settings</code> table in Supabase.
          Changes take effect immediately upon save. Toggle settings accept "true"/"false" string values.
        </div>
      </div>
    </div>
  );
}
