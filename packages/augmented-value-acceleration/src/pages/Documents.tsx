import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/* ── Types ──────────────────────────────────────────────────────────────── */

interface Document {
  id: string;
  name: string;
  type: string;
  size: number;
  folder: string;
  project_id: string;
  client_id: string;
  uploaded_by: string;
  storage_path: string;
  created_at: string;
}

interface Project { id: string; name: string; }
interface Client { id: string; name: string; }

const TYPE_ICONS: Record<string, string> = {
  docx: '\uD83D\uDCC4', doc: '\uD83D\uDCC4',
  xlsx: '\uD83D\uDCCA', xls: '\uD83D\uDCCA', csv: '\uD83D\uDCCA',
  pptx: '\uD83D\uDCBD', ppt: '\uD83D\uDCBD',
  pdf: '\uD83D\uDCCB',
  png: '\uD83D\uDDBC\uFE0F', jpg: '\uD83D\uDDBC\uFE0F', jpeg: '\uD83D\uDDBC\uFE0F', gif: '\uD83D\uDDBC\uFE0F', svg: '\uD83D\uDDBC\uFE0F',
  zip: '\uD83D\uDCE6', rar: '\uD83D\uDCE6',
  mp4: '\uD83C\uDFAC', mov: '\uD83C\uDFAC',
  mp3: '\uD83C\uDFB5', wav: '\uD83C\uDFB5',
};

function getIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return TYPE_ICONS[ext] || '\uD83D\uDCDD';
}

function formatSize(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ── Component ──────────────────────────────────────────────────────────── */

export default function Documents() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [currentFolder, setCurrentFolder] = useState('/');
  const [projectFilter, setProjectFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '', type: '', folder: '/', project_id: '', client_id: '', uploaded_by: '',
  });

  /* ── Fetch ─────────────────────────────────────────────────────────── */

  const fetchData = async () => {
    setLoading(true);
    const [docRes, projRes, clientRes] = await Promise.all([
      supabase.from('business_documents').select('*').order('created_at', { ascending: false }),
      supabase.from('business_projects').select('id, name'),
      supabase.from('business_clients').select('id, name'),
    ]);
    setDocs(docRes.data || []);
    setProjects(projRes.data || []);
    setClients(clientRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  /* ── Upload ────────────────────────────────────────────────────────── */

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    const path = `documents/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage.from('business-files').upload(path, file);

    if (!uploadError) {
      await supabase.from('business_documents').insert({
        name: file.name,
        type: file.name.split('.').pop()?.toLowerCase() || 'unknown',
        size: file.size,
        folder: currentFolder,
        storage_path: path,
        uploaded_by: 'Admin',
      });
      fetchData();
    }
    setUploading(false);
  };

  /* ── Create (manual entry) ─────────────────────────────────────────── */

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    await supabase.from('business_documents').insert({
      name: form.name.trim(),
      type: form.type.trim() || form.name.split('.').pop()?.toLowerCase() || 'unknown',
      size: 0,
      folder: form.folder || '/',
      project_id: form.project_id || null,
      client_id: form.client_id || null,
      uploaded_by: form.uploaded_by.trim() || 'Admin',
      storage_path: null,
    });
    setForm({ name: '', type: '', folder: '/', project_id: '', client_id: '', uploaded_by: '' });
    setShowCreate(false);
    setSaving(false);
    fetchData();
  };

  /* ── Delete ────────────────────────────────────────────────────────── */

  const handleDelete = async (doc: Document) => {
    if (!confirm(`Delete "${doc.name}"?`)) return;
    if (doc.storage_path) {
      await supabase.storage.from('business-files').remove([doc.storage_path]);
    }
    await supabase.from('business_documents').delete().eq('id', doc.id);
    fetchData();
  };

  /* ── Download ──────────────────────────────────────────────────────── */

  const handleDownload = async (doc: Document) => {
    if (!doc.storage_path) return;
    const { data } = await supabase.storage.from('business-files').createSignedUrl(doc.storage_path, 300);
    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank');
    }
  };

  /* ── Derived ───────────────────────────────────────────────────────── */

  const folders = [...new Set(docs.map(d => d.folder || '/'))].sort();
  const breadcrumbs = currentFolder.split('/').filter(Boolean);

  let filtered = docs.filter(d => (d.folder || '/') === currentFolder || currentFolder === '/');
  if (projectFilter !== 'all') filtered = filtered.filter(d => d.project_id === projectFilter);
  if (clientFilter !== 'all') filtered = filtered.filter(d => d.client_id === clientFilter);
  if (typeFilter !== 'all') filtered = filtered.filter(d => d.type === typeFilter);

  const fileTypes = [...new Set(docs.map(d => d.type).filter(Boolean))].sort();

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', background: '#1a1a35', border: '1px solid #1f1f3a',
    borderRadius: 10, color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ padding: '40px 48px', overflowY: 'auto', height: '100%', background: '#0a0a1a' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#fff', margin: 0 }}>Documents</h1>
          <p style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>File management and storage</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <label style={{
            padding: '10px 24px', background: '#1f1f3a', color: '#9ca3af', border: 'none',
            borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            {uploading ? 'Uploading...' : '📤 Upload'}
            <input type="file" style={{ display: 'none' }} onChange={handleUpload} disabled={uploading} />
          </label>
          <button onClick={() => setShowCreate(true)} style={{
            padding: '10px 24px', background: '#a855f7', color: '#fff', border: 'none',
            borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>+ Add Document</button>
        </div>
      </div>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, fontSize: 13, color: '#6b7280' }}>
        <span style={{ cursor: 'pointer', color: currentFolder === '/' ? '#a855f7' : '#9ca3af' }} onClick={() => setCurrentFolder('/')}>📁 Root</span>
        {breadcrumbs.map((crumb, i) => (
          <span key={i}>
            <span style={{ margin: '0 4px' }}>/</span>
            <span style={{ cursor: 'pointer', color: '#9ca3af' }} onClick={() => setCurrentFolder('/' + breadcrumbs.slice(0, i + 1).join('/'))}>{crumb}</span>
          </span>
        ))}
        {/* Folder shortcuts */}
        {folders.filter(f => f !== '/').length > 0 && (
          <span style={{ marginLeft: 16, display: 'flex', gap: 6 }}>
            {folders.filter(f => f !== '/').map(f => (
              <span key={f} onClick={() => setCurrentFolder(f)} style={{
                padding: '2px 10px', borderRadius: 6, background: currentFolder === f ? '#a855f720' : '#1f1f3a',
                color: currentFolder === f ? '#a855f7' : '#6b7280', cursor: 'pointer', fontSize: 11,
              }}>{f}</span>
            ))}
          </span>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <select style={{ ...inputStyle, width: 'auto', minWidth: 140 }} value={projectFilter} onChange={e => setProjectFilter(e.target.value)}>
          <option value="all">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select style={{ ...inputStyle, width: 'auto', minWidth: 140 }} value={clientFilter} onChange={e => setClientFilter(e.target.value)}>
          <option value="all">All Clients</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select style={{ ...inputStyle, width: 'auto', minWidth: 120 }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="all">All Types</option>
          {fileTypes.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
        </select>
      </div>

      {/* Loading */}
      {loading && <div style={{ textAlign: 'center', color: '#6b7280', padding: 60 }}>Loading documents...</div>}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 80, color: '#6b7280' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📂</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#9ca3af', marginBottom: 8 }}>No documents found</div>
          <div style={{ fontSize: 14 }}>Upload a file or add a document entry to get started</div>
        </div>
      )}

      {/* File Grid */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {filtered.map(doc => (
            <div key={doc.id} style={{
              background: '#111127', border: '1px solid #1f1f3a', borderRadius: 14, padding: 20,
              transition: 'border-color 0.2s', display: 'flex', flexDirection: 'column',
            }}
              onMouseOver={e => e.currentTarget.style.borderColor = '#a855f7'}
              onMouseOut={e => e.currentTarget.style.borderColor = '#1f1f3a'}
            >
              {/* Icon */}
              <div style={{ fontSize: 40, textAlign: 'center', marginBottom: 14 }}>{getIcon(doc.name)}</div>

              {/* Name */}
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', textAlign: 'center', marginBottom: 8, wordBreak: 'break-word' }}>{doc.name}</div>

              {/* Meta */}
              <div style={{ fontSize: 11, color: '#6b7280', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 12 }}>
                <span>{doc.type?.toUpperCase() || '—'} · {formatSize(doc.size)}</span>
                <span>{doc.uploaded_by || '—'}</span>
                <span>{new Date(doc.created_at).toLocaleDateString()}</span>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 'auto' }}>
                {doc.storage_path && (
                  <button onClick={() => handleDownload(doc)} style={{
                    padding: '5px 14px', background: '#1f1f3a', color: '#60a5fa', border: 'none',
                    borderRadius: 6, fontSize: 11, cursor: 'pointer',
                  }}>Download</button>
                )}
                <button onClick={() => handleDelete(doc)} style={{
                  padding: '5px 14px', background: '#7f1d1d', color: '#fca5a5', border: 'none',
                  borderRadius: 6, fontSize: 11, cursor: 'pointer',
                }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setShowCreate(false)}>
          <div style={{
            background: '#111127', border: '1px solid #1f1f3a', borderRadius: 16,
            padding: 32, width: 480, maxHeight: '85vh', overflowY: 'auto',
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 24px' }}>Add Document Entry</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>File Name *</label>
                <input style={inputStyle} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="report.docx" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Type</label>
                  <input style={inputStyle} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} placeholder="docx, pdf, xlsx..." />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Folder</label>
                  <input style={inputStyle} value={form.folder} onChange={e => setForm({ ...form, folder: e.target.value })} placeholder="/" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Project</label>
                  <select style={inputStyle} value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })}>
                    <option value="">— None —</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Client</label>
                  <select style={inputStyle} value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })}>
                    <option value="">— None —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Uploaded By</label>
                <input style={inputStyle} value={form.uploaded_by} onChange={e => setForm({ ...form, uploaded_by: e.target.value })} placeholder="Admin" />
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
              }}>{saving ? 'Adding...' : 'Add Document'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
