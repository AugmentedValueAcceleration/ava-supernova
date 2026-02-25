import { useState } from 'react';
import { post } from '../App';
import type { ConnectionStatus } from '../types/messages';

interface ConnectionsProps {
  connections: ConnectionStatus;
}

interface FieldDef {
  key: string;
  label: string;
  placeholder: string;
  type?: string;
}

const SERVICE_DEFS: Record<string, { icon: string; title: string; description: string; fields: FieldDef[] }> = {
  github: {
    icon: '🐙',
    title: 'GitHub',
    description: 'Connect your GitHub account to let Ava create branches, PRs, and issues.',
    fields: [
      { key: 'token', label: 'Personal Access Token', placeholder: 'ghp_...', type: 'password' },
    ],
  },
  email: {
    icon: '📧',
    title: 'Email (SMTP)',
    description: 'Allow Ava to send emails on your behalf with your approval.',
    fields: [
      { key: 'host', label: 'SMTP Host', placeholder: 'smtp.gmail.com' },
      { key: 'port', label: 'Port', placeholder: '587' },
      { key: 'user', label: 'Username / Email', placeholder: 'you@example.com' },
      { key: 'pass', label: 'Password / App Password', placeholder: '••••••••', type: 'password' },
    ],
  },
  slack: {
    icon: '💬',
    title: 'Slack',
    description: 'Post messages or summaries to your Slack workspace.',
    fields: [
      { key: 'webhook', label: 'Incoming Webhook URL', placeholder: 'https://hooks.slack.com/...', type: 'password' },
    ],
  },
  discord: {
    icon: '🎮',
    title: 'Discord',
    description: 'Send notifications or summaries to your Discord server.',
    fields: [
      { key: 'webhook', label: 'Webhook URL', placeholder: 'https://discord.com/api/webhooks/...', type: 'password' },
    ],
  },
};

export function Connections({ connections }: ConnectionsProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState<string | null>(null);

  function toggleExpand(service: string) {
    setExpanded(expanded === service ? null : service);
  }

  function setField(service: string, key: string, value: string) {
    setFormData(prev => ({
      ...prev,
      [service]: { ...prev[service], [key]: value },
    }));
  }

  function getField(service: string, key: string): string {
    return formData[service]?.[key] ?? '';
  }

  function handleSave(service: string) {
    const data = formData[service] ?? {};
    const def = SERVICE_DEFS[service];
    const allFilled = def.fields.every(f => data[f.key]?.trim());
    if (!allFilled) return;

    setSaving(service);
    post({ type: 'save_connection', service: service as keyof ConnectionStatus, credentials: data });
    // Extension host will reply with updated connection status
    setTimeout(() => setSaving(null), 2000);
  }

  function handleDisconnect(service: string) {
    post({ type: 'save_connection', service: service as keyof ConnectionStatus, credentials: {} });
    setFormData(prev => ({ ...prev, [service]: {} }));
  }

  const connectedCount = Object.values(connections).filter(Boolean).length;

  return (
    <div style={{ maxWidth: '600px' }}>
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
          Connections
        </h1>
        <p style={{ opacity: 0.55, fontSize: '13px' }}>
          {connectedCount}/4 services connected. Credentials are stored securely in VS Code's secret storage.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {Object.entries(SERVICE_DEFS).map(([service, def]) => {
          const connected = connections[service as keyof ConnectionStatus];
          const isOpen = expanded === service;

          return (
            <div
              key={service}
              style={{
                background: 'var(--vscode-editorWidget-background)',
                border: `1px solid ${connected ? '#16a34a44' : 'var(--vscode-panel-border, #333)'}`,
                borderRadius: '8px',
                overflow: 'hidden',
              }}
            >
              {/* Header row */}
              <button
                onClick={() => toggleExpand(service)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '14px 16px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--vscode-foreground)',
                  fontFamily: 'var(--vscode-font-family)',
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: '20px' }}>{def.icon}</span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>{def.title}</p>
                  <p style={{ fontSize: '12px', opacity: 0.5, margin: '2px 0 0 0' }}>{def.description}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '3px 8px',
                      borderRadius: '12px',
                      background: connected ? '#14532d22' : 'transparent',
                      border: `1px solid ${connected ? '#16a34a44' : 'var(--vscode-panel-border, #444)'}`,
                      color: connected ? '#22c55e' : 'var(--vscode-foreground)',
                      opacity: connected ? 1 : 0.5,
                    }}
                  >
                    {connected ? 'Connected' : 'Not connected'}
                  </span>
                  <span style={{ opacity: 0.4, fontSize: '12px' }}>{isOpen ? '▲' : '▼'}</span>
                </div>
              </button>

              {/* Expanded form */}
              {isOpen && (
                <div style={{ padding: '0 16px 16px' }}>
                  <div
                    style={{
                      borderTop: '1px solid var(--vscode-panel-border, #333)',
                      paddingTop: '14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    {def.fields.map(field => (
                      <div key={field.key}>
                        <label
                          style={{
                            display: 'block',
                            fontSize: '12px',
                            fontWeight: 600,
                            opacity: 0.6,
                            marginBottom: '4px',
                          }}
                        >
                          {field.label}
                        </label>
                        <input
                          type={field.type ?? 'text'}
                          placeholder={field.placeholder}
                          value={getField(service, field.key)}
                          onChange={e => setField(service, field.key, e.target.value)}
                          style={{
                            width: '100%',
                            padding: '7px 10px',
                            borderRadius: '5px',
                            border: '1px solid var(--vscode-panel-border, #444)',
                            background: 'var(--vscode-input-background)',
                            color: 'var(--vscode-foreground)',
                            fontSize: '13px',
                            fontFamily: 'var(--vscode-font-family)',
                            boxSizing: 'border-box',
                            outline: 'none',
                          }}
                        />
                      </div>
                    ))}

                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                      <button
                        onClick={() => handleSave(service)}
                        disabled={saving === service}
                        style={{
                          padding: '7px 16px',
                          borderRadius: '5px',
                          border: 'none',
                          background: '#7c3aed',
                          color: '#fff',
                          fontSize: '12px',
                          fontWeight: 500,
                          cursor: 'pointer',
                          fontFamily: 'var(--vscode-font-family)',
                          opacity: saving === service ? 0.7 : 1,
                        }}
                      >
                        {saving === service ? 'Saving...' : connected ? 'Update' : 'Connect'}
                      </button>
                      {connected && (
                        <button
                          onClick={() => handleDisconnect(service)}
                          style={{
                            padding: '7px 16px',
                            borderRadius: '5px',
                            border: '1px solid #dc262644',
                            background: 'transparent',
                            color: '#ef4444',
                            fontSize: '12px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            fontFamily: 'var(--vscode-font-family)',
                          }}
                        >
                          Disconnect
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
