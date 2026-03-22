import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/* ── Types ──────────────────────────────────────────────────────────────── */

interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  website: string;
  status: string;
  source: string;
  deal_value: number;
  notes: string;
  created_at: string;
}

interface ContactEntry {
  id: string;
  client_id: string;
  type: string;
  subject: string;
  content: string;
  created_at: string;
}

const PIPELINE_STAGES = [
  { key: 'new', label: 'New', color: '#6b7280' },
  { key: 'contacted', label: 'Contacted', color: '#60a5fa' },
  { key: 'qualified', label: 'Qualified', color: '#a855f7' },
  { key: 'proposal', label: 'Proposal', color: '#f59e0b' },
  { key: 'negotiation', label: 'Negotiation', color: '#f97316' },
  { key: 'won', label: 'Won', color: '#34d399' },
  { key: 'lost', label: 'Lost', color: '#ef4444' },
];

const CONTACT_TYPES = ['email', 'call', 'meeting', 'note'];

const CONTACT_ICONS: Record<string, string> = {
  email: '📧', call: '📞', meeting: '🤝', note: '📝',
};

/* ── Component ──────────────────────────────────────────────────────────── */

export default function CRM() {
  const [clients, setClients] = useState<Client[]>([]);
  const [contacts, setContacts] = useState<ContactEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showContact, setShowContact] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '', email: '', phone: '', company: '', website: '',
    status: 'new', source: '', deal_value: '', notes: '',
  });

  const [contactForm, setContactForm] = useState({
    type: 'email', subject: '', content: '',
  });

  /* ── Fetch ─────────────────────────────────────────────────────────── */

  const fetchData = async () => {
    setLoading(true);
    const [clientRes, contactRes] = await Promise.all([
      supabase.from('business_clients').select('*').order('created_at', { ascending: false }),
      supabase.from('business_contact_history').select('*').order('created_at', { ascending: false }),
    ]);
    setClients(clientRes.data || []);
    setContacts(contactRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  /* ── Create Client ─────────────────────────────────────────────────── */

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    await supabase.from('business_clients').insert({
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      company: form.company.trim() || null,
      website: form.website.trim() || null,
      status: form.status,
      source: form.source.trim() || null,
      deal_value: form.deal_value ? parseFloat(form.deal_value) : 0,
      notes: form.notes.trim() || null,
    });
    setForm({ name: '', email: '', phone: '', company: '', website: '', status: 'new', source: '', deal_value: '', notes: '' });
    setShowCreate(false);
    setSaving(false);
    fetchData();
  };

  /* ── Add Contact Entry ─────────────────────────────────────────────── */

  const handleAddContact = async (clientId: string) => {
    if (!contactForm.subject.trim()) return;
    setSaving(true);
    await supabase.from('business_contact_history').insert({
      client_id: clientId,
      type: contactForm.type,
      subject: contactForm.subject.trim(),
      content: contactForm.content.trim() || null,
    });
    setContactForm({ type: 'email', subject: '', content: '' });
    setShowContact(null);
    setSaving(false);
    fetchData();
  };

  /* ── Delete ────────────────────────────────────────────────────────── */

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this client?')) return;
    await supabase.from('business_clients').delete().eq('id', id);
    fetchData();
  };

  /* ── Stats ─────────────────────────────────────────────────────────── */

  const stats = {
    total: clients.length,
    pipelineValue: clients.reduce((s, c) => s + (c.deal_value || 0), 0),
    won: clients.filter(c => c.status === 'won').length,
    lost: clients.filter(c => c.status === 'lost').length,
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', background: '#1a1a35', border: '1px solid #1f1f3a',
    borderRadius: 10, color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ padding: '40px 48px', overflowY: 'auto', height: '100%', background: '#0a0a1a' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#fff', margin: 0 }}>CRM</h1>
          <p style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>Client pipeline and relationship management</p>
        </div>
        <button onClick={() => setShowCreate(true)} style={{
          padding: '10px 24px', background: '#a855f7', color: '#fff', border: 'none',
          borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>+ New Client</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Total Clients', value: stats.total, icon: '👥', color: '#a855f7' },
          { label: 'Pipeline Value', value: `$${stats.pipelineValue.toLocaleString()}`, icon: '💰', color: '#f59e0b' },
          { label: 'Won Deals', value: stats.won, icon: '🏆', color: '#34d399' },
          { label: 'Lost Deals', value: stats.lost, icon: '❌', color: '#ef4444' },
        ].map(s => (
          <div key={s.label} style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 14, padding: '20px 22px' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: s.color }}>{loading ? '...' : s.value}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Loading */}
      {loading && <div style={{ textAlign: 'center', color: '#6b7280', padding: 60 }}>Loading CRM data...</div>}

      {/* Pipeline View */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${PIPELINE_STAGES.length}, 1fr)`, gap: 12, minHeight: 400 }}>
          {PIPELINE_STAGES.map(stage => {
            const stageClients = clients.filter(c => c.status === stage.key);
            const stageValue = stageClients.reduce((s, c) => s + (c.deal_value || 0), 0);
            return (
              <div key={stage.key} style={{ background: '#0d0d22', borderRadius: 14, padding: 14, border: '1px solid #1f1f3a' }}>
                <div style={{ marginBottom: 14, paddingBottom: 10, borderBottom: `2px solid ${stage.color}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: stage.color }}>{stage.label}</span>
                    <span style={{ fontSize: 11, color: '#6b7280', background: '#1f1f3a', borderRadius: 6, padding: '2px 8px' }}>{stageClients.length}</span>
                  </div>
                  {stageValue > 0 && (
                    <div style={{ fontSize: 11, color: '#4b5563', marginTop: 4 }}>${stageValue.toLocaleString()}</div>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {stageClients.length === 0 && (
                    <div style={{ fontSize: 11, color: '#4b5563', textAlign: 'center', padding: 16 }}>No clients</div>
                  )}
                  {stageClients.map(c => {
                    const expanded = expandedId === c.id;
                    const clientContacts = contacts.filter(ct => ct.client_id === c.id);
                    const lastContact = clientContacts[0];
                    return (
                      <div key={c.id} style={{
                        background: '#111127', border: '1px solid #1f1f3a', borderRadius: 10, padding: 12,
                        cursor: 'pointer', transition: 'border-color 0.2s',
                      }}
                        onClick={() => setExpandedId(expanded ? null : c.id)}
                        onMouseOver={e => e.currentTarget.style.borderColor = '#a855f7'}
                        onMouseOut={e => e.currentTarget.style.borderColor = '#1f1f3a'}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 4 }}>{c.name}</div>
                        {c.company && <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>{c.company}</div>}
                        {c.deal_value > 0 && <div style={{ fontSize: 12, color: '#34d399', fontWeight: 600 }}>${c.deal_value.toLocaleString()}</div>}
                        {lastContact && <div style={{ fontSize: 10, color: '#4b5563', marginTop: 4 }}>{CONTACT_ICONS[lastContact.type] || '📋'} {new Date(lastContact.created_at).toLocaleDateString()}</div>}

                        {expanded && (
                          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #1f1f3a' }}>
                            <div style={{ fontSize: 11, color: '#9ca3af', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                              {c.email && <span>📧 {c.email}</span>}
                              {c.phone && <span>📞 {c.phone}</span>}
                              {c.website && <span>🌐 {c.website}</span>}
                              {c.source && <span>📍 Source: {c.source}</span>}
                              {c.notes && <span style={{ fontStyle: 'italic' }}>📝 {c.notes}</span>}
                            </div>

                            {/* Contact History */}
                            {clientContacts.length > 0 && (
                              <div style={{ marginBottom: 8 }}>
                                <div style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Contact History</div>
                                {clientContacts.slice(0, 5).map(ct => (
                                  <div key={ct.id} style={{ fontSize: 11, color: '#6b7280', padding: '4px 0', borderBottom: '1px solid #1a1a35' }}>
                                    <span>{CONTACT_ICONS[ct.type] || '📋'}</span>
                                    <span style={{ color: '#9ca3af', marginLeft: 6 }}>{ct.subject}</span>
                                    <span style={{ marginLeft: 6, fontSize: 10 }}>{new Date(ct.created_at).toLocaleDateString()}</span>
                                  </div>
                                ))}
                              </div>
                            )}

                            <div style={{ display: 'flex', gap: 4 }}>
                              <button onClick={e => { e.stopPropagation(); setShowContact(c.id); }} style={{
                                padding: '3px 10px', background: '#1f1f3a', color: '#a855f7', border: 'none',
                                borderRadius: 6, fontSize: 10, cursor: 'pointer',
                              }}>+ Contact</button>
                              <button onClick={e => { e.stopPropagation(); handleDelete(c.id); }} style={{
                                padding: '3px 10px', background: '#7f1d1d', color: '#fca5a5', border: 'none',
                                borderRadius: 6, fontSize: 10, cursor: 'pointer',
                              }}>Delete</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Client Modal */}
      {showCreate && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setShowCreate(false)}>
          <div style={{
            background: '#111127', border: '1px solid #1f1f3a', borderRadius: 16,
            padding: 32, width: 520, maxHeight: '85vh', overflowY: 'auto',
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 24px' }}>New Client</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Name *</label>
                <input style={inputStyle} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Client name" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Email</label>
                  <input style={inputStyle} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Phone</label>
                  <input style={inputStyle} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+1234567890" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Company</label>
                  <input style={inputStyle} value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} placeholder="Company name" />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Website</label>
                  <input style={inputStyle} value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} placeholder="https://..." />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Status</label>
                  <select style={inputStyle} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    {PIPELINE_STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Source</label>
                  <input style={inputStyle} value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} placeholder="Referral, cold, inbound..." />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Deal Value</label>
                <input type="number" style={inputStyle} value={form.deal_value} onChange={e => setForm({ ...form, deal_value: e.target.value })} placeholder="0.00" />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Notes</label>
                <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Internal notes about this client" />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 28 }}>
              <button onClick={() => setShowCreate(false)} style={{
                padding: '10px 24px', background: '#1f1f3a', color: '#9ca3af', border: 'none',
                borderRadius: 10, fontSize: 14, cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={handleCreate} disabled={saving || !form.name.trim()} style={{
                padding: '10px 24px', background: '#a855f7', color: '#fff', border: 'none',
                borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                opacity: saving || !form.name.trim() ? 0.5 : 1,
              }}>{saving ? 'Creating...' : 'Create Client'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Contact Modal */}
      {showContact && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setShowContact(null)}>
          <div style={{
            background: '#111127', border: '1px solid #1f1f3a', borderRadius: 16,
            padding: 32, width: 440,
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 24px' }}>Add Contact Entry</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Type</label>
                <select style={inputStyle} value={contactForm.type} onChange={e => setContactForm({ ...contactForm, type: e.target.value })}>
                  {CONTACT_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Subject *</label>
                <input style={inputStyle} value={contactForm.subject} onChange={e => setContactForm({ ...contactForm, subject: e.target.value })} placeholder="Brief subject" />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Content</label>
                <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={contactForm.content} onChange={e => setContactForm({ ...contactForm, content: e.target.value })} placeholder="Details..." />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 28 }}>
              <button onClick={() => setShowContact(null)} style={{
                padding: '10px 24px', background: '#1f1f3a', color: '#9ca3af', border: 'none',
                borderRadius: 10, fontSize: 14, cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={() => handleAddContact(showContact)} disabled={saving || !contactForm.subject.trim()} style={{
                padding: '10px 24px', background: '#a855f7', color: '#fff', border: 'none',
                borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                opacity: saving || !contactForm.subject.trim() ? 0.5 : 1,
              }}>{saving ? 'Saving...' : 'Add Entry'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
