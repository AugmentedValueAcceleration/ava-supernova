import { useState, useEffect } from 'react';
import { post } from '../App';
import type { DashboardSettings } from '../types/messages';

interface SettingsProps {
  settings: DashboardSettings;
  onSettingsChange: (s: DashboardSettings) => void;
}

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

export function Settings({ settings, onSettingsChange }: SettingsProps) {
  const [local, setLocal] = useState<DashboardSettings>(settings);
  const [saved, setSaved] = useState(false);

  // Sync if parent changes
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

  const hasChanges = JSON.stringify(local) !== JSON.stringify(settings);

  return (
    <div style={{ maxWidth: '520px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1
          style={{
            fontSize: '18px',
            fontWeight: 700,
            marginBottom: '4px',
            background: 'linear-gradient(135deg, #a78bfa, #c084fc)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Settings
        </h1>
        <p style={{ opacity: 0.55, fontSize: '13px' }}>
          Preferences for Ava | Supernova.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* Language */}
        <Section title="Language" description="Language for Ava's responses and the UI.">
          <SelectField
            value={local.language}
            onChange={v => update('language', v)}
            options={LANGUAGES}
          />
        </Section>

        {/* Tool permissions */}
        <Section title="Permission Mode" description="Controls when Ava asks before running tools.">
          <RadioGroup
            value={local.permissionMode}
            onChange={v => update('permissionMode', v as DashboardSettings['permissionMode'])}
            options={PERMISSION_MODES}
          />
        </Section>

        {/* Temperature */}
        <Section
          title="Temperature"
          description={`Controls response creativity vs. precision. (${local.temperature.toFixed(1)})`}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '11px', opacity: 0.5 }}>Precise</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={local.temperature}
              onChange={e => update('temperature', parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: '#7c3aed' }}
            />
            <span style={{ fontSize: '11px', opacity: 0.5 }}>Creative</span>
          </div>
        </Section>

        {/* Max tokens per response */}
        <Section title="Max Response Tokens" description="Maximum tokens per model response.">
          <SelectField
            value={String(local.maxTokens)}
            onChange={v => update('maxTokens', parseInt(v))}
            options={[
              { value: '2048', label: '2,048' },
              { value: '4096', label: '4,096' },
              { value: '8192', label: '8,192' },
              { value: '16384', label: '16,384' },
              { value: '32768', label: '32,768' },
            ]}
          />
        </Section>

        {/* Auto-memory */}
        <Section title="Auto Memory" description="Automatically save important details from conversations.">
          <ToggleSwitch
            value={local.autoMemory}
            onChange={v => update('autoMemory', v)}
            label={local.autoMemory ? 'Enabled' : 'Disabled'}
          />
        </Section>

        {/* Stream responses */}
        <Section title="Stream Responses" description="Show tokens as they arrive instead of waiting for completion.">
          <ToggleSwitch
            value={local.streamResponses}
            onChange={v => update('streamResponses', v)}
            label={local.streamResponses ? 'Enabled' : 'Disabled'}
          />
        </Section>

      </div>

      {/* Save button */}
      <div style={{ marginTop: '28px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={handleSave}
          disabled={!hasChanges}
          style={{
            padding: '8px 20px',
            borderRadius: '6px',
            border: 'none',
            background: hasChanges ? '#7c3aed' : '#7c3aed44',
            color: '#fff',
            fontSize: '13px',
            fontWeight: 600,
            cursor: hasChanges ? 'pointer' : 'default',
            fontFamily: 'var(--vscode-font-family)',
          }}
        >
          Save Changes
        </button>
        {saved && <span style={{ fontSize: '12px', color: '#22c55e' }}>✓ Saved</span>}
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: 'var(--vscode-editorWidget-background)',
        border: '1px solid var(--vscode-panel-border, #333)',
        borderRadius: '8px',
        padding: '16px',
      }}
    >
      <div style={{ marginBottom: '10px' }}>
        <p style={{ fontSize: '13px', fontWeight: 600, margin: '0 0 2px' }}>{title}</p>
        <p style={{ fontSize: '12px', opacity: 0.5, margin: 0 }}>{description}</p>
      </div>
      {children}
    </div>
  );
}

function SelectField({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        padding: '7px 10px',
        borderRadius: '5px',
        border: '1px solid var(--vscode-panel-border, #444)',
        background: 'var(--vscode-input-background)',
        color: 'var(--vscode-foreground)',
        fontSize: '13px',
        fontFamily: 'var(--vscode-font-family)',
        cursor: 'pointer',
        outline: 'none',
        width: '100%',
      }}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function RadioGroup({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {options.map(o => (
        <label
          key={o.value}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            fontSize: '13px',
            padding: '6px 10px',
            borderRadius: '5px',
            background: value === o.value ? '#7c3aed22' : 'transparent',
            border: `1px solid ${value === o.value ? '#7c3aed44' : 'transparent'}`,
          }}
        >
          <input
            type="radio"
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            style={{ accentColor: '#7c3aed' }}
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

function ToggleSwitch({
  value,
  onChange,
  label,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <button
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        style={{
          width: '40px',
          height: '22px',
          borderRadius: '11px',
          border: 'none',
          background: value ? '#7c3aed' : 'var(--vscode-panel-border, #555)',
          cursor: 'pointer',
          position: 'relative',
          transition: 'background 0.2s',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: '3px',
            left: value ? '21px' : '3px',
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 0.2s',
          }}
        />
      </button>
      <span style={{ fontSize: '13px', opacity: 0.7 }}>{label}</span>
    </div>
  );
}
