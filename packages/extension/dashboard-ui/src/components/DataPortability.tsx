import { useState, useRef, useEffect, useCallback } from 'react';
import { post } from '../vscode';
import { t, useLocale } from '../i18n';

// Visual-only metadata \u2014 labels/descriptions are resolved through t() at the
// render site (module consts evaluate once at import, so a live t() here would
// freeze to English; nameKey/descKey are read against the live locale below).
const DATA_TYPES = [
  { id: 'memory', nameKey: 'dash.nav.memory', icon: '\uD83E\uDDE0', descKey: 'dash.portability.type.memory_desc' },
  { id: 'tasks', nameKey: 'dash.nav.tasks', icon: '\u2705', descKey: 'dash.portability.type.tasks_desc' },
  { id: 'journal', nameKey: 'dash.nav.journal', icon: '\uD83D\uDCD3', descKey: 'dash.portability.type.journal_desc' },
  { id: 'learning', nameKey: 'dash.nav.learning', icon: '\uD83C\uDF93', descKey: 'dash.portability.type.learning_desc' },
  { id: 'history', nameKey: 'dash.nav.chat_history', icon: '\uD83D\uDCAC', descKey: 'dash.portability.type.history_desc' },
  // Health & Nutrition \u2014 fitness + recipe + meal plans (~/.ava/health: profile, plans, daily-plans).
  { id: 'health', nameKey: 'dash.nav.health', icon: '\uD83E\uDD57', descKey: 'dash.portability.type.health_desc' },
  // Creative Studio \u2014 generated images/music/video/voice. Exports a zip of
  // metadata + the media files (binaries aren't JSON-serialisable).
  { id: 'creative', nameKey: 'dash.nav.creative_studio', icon: '\uD83C\uDFAC', descKey: 'dash.portability.type.creative_desc' },
  { id: 'settings', nameKey: 'dash.nav.settings', icon: '\u2699\uFE0F', descKey: 'dash.portability.type.settings_desc' },
  { id: 'personality', nameKey: 'dash.nav.personality', icon: '\uD83C\uDFA8', descKey: 'dash.portability.type.personality_desc' },
];

/** Cheap client-side check for an encrypted .ava-backup (no crypto needed —
 *  just the envelope magic / extension). */
function looksLikeSealedBackup(content: string, name: string): boolean {
  if (name.toLowerCase().endsWith('.ava-backup')) return true;
  try { return (JSON.parse(content) as { magic?: string })?.magic === 'AVABKP'; } catch { return false; }
}

interface DataPortabilityProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DataPortability({ isOpen, onClose }: DataPortabilityProps) {
  useLocale();
  const [tab, setTab] = useState<'export' | 'import'>('export');
  const [exportSelected, setExportSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState<string | null>(null);
  const [importFiles, setImportFiles] = useState<Array<{ name: string; dataType: string; content: string; size: number }>>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Encrypted backup / readable export (data sovereignty). Inline English for
  // now — TODO: lift to i18n keys like the rest of the panel.
  const [passModal, setPassModal] = useState<null | { mode: 'export' | 'import'; content?: string; name?: string }>(null);
  const [passInput, setPassInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onClose]);

  // Listen for export results from host
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.type === 'data_exported') {
        setExporting(null);
        // Trigger download
        const blob = new Blob([msg.content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = msg.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      if (msg?.type === 'data_imported') {
        setImporting(false);
        setImportResult(t('dash.portability.imported_result', { count: msg.count, dataType: msg.dataType }));
        setTimeout(() => setImportResult(null), 3000);
      }
      if (msg?.type === 'import_files_picked') {
        const files = msg.files as Array<{ name: string; content: string; size: number }>;
        // An encrypted .ava-backup takes the passphrase path; everything else
        // is per-type readable JSON.
        const backup = files.find(f => looksLikeSealedBackup(f.content, f.name));
        if (backup) {
          setPassModal({ mode: 'import', content: backup.content, name: backup.name });
        } else {
          const detected = files.map(f => ({
            name: f.name,
            dataType: detectDataType(f.content, f.name),
            content: f.content,
            size: f.size,
          }));
          setImportFiles(prev => [...prev, ...detected]);
        }
      }
      if (msg?.type === 'backup_done') {
        setBusy(false); setPassModal(null); setPassInput('');
        if (msg.ok) { setStatusMsg(t('dash.portability.backup_saved')); setTimeout(() => setStatusMsg(null), 4000); }
      }
      if (msg?.type === 'backup_imported') {
        setBusy(false); setPassModal(null); setPassInput('');
        setStatusMsg(msg.ok ? t('dash.portability.restored') : t('dash.portability.import_failed'));
        setTimeout(() => setStatusMsg(null), 5000);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const toggleExport = useCallback((id: string) => {
    setExportSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllExport = useCallback(() => {
    setExportSelected(new Set(DATA_TYPES.map(d => d.id)));
  }, []);

  const handleExport = useCallback(() => {
    if (exportSelected.size === 1) {
      // Single type — individual file save
      const dataType = [...exportSelected][0];
      setExporting(dataType);
      post({ type: 'export_data', dataType } as any);
    } else {
      // Multiple types — zip bundle
      setExporting('all');
      post({ type: 'export_data', dataType: 'bundle', types: [...exportSelected] } as any);
    }
  }, [exportSelected]);

  const handleExportSingle = useCallback((dataType: string) => {
    setExporting(dataType);
    post({ type: 'export_data', dataType } as any);
  }, []);

  // Detect data type from file content
  const detectDataType = (content: string, filename: string): string => {
    const lower = filename.toLowerCase();
    if (lower.includes('memory')) return 'memory';
    if (lower.includes('task')) return 'tasks';
    if (lower.includes('journal')) return 'journal';
    if (lower.includes('learn') || lower.includes('curriculum')) return 'learning';
    if (lower.includes('history') || lower.includes('conversation')) return 'history';
    if (lower.includes('health') || lower.includes('plan') || lower.includes('fitness') || lower.includes('recipe')) return 'health';
    if (lower.includes('creative')) return 'creative';
    if (lower.includes('setting') || lower.includes('config')) return 'settings';
    if (lower.includes('personality')) return 'personality';
    // Try detecting from content
    try {
      const data = JSON.parse(content);
      if (data.memory && typeof data.memory === 'object') return 'memory';
      if (data.entries && data.entries[0]?.category) return 'memory';
      if (data.tasks || (Array.isArray(data) && data[0]?.priority)) return 'tasks';
      if (data.date && (data.userEntry || data.avaEntry)) return 'journal';
      if (data.curriculums || (Array.isArray(data) && data[0]?.modules)) return 'learning';
      if (data.messages && data.title) return 'history';
      if (data.health || data.plans || data.profile) return 'health';
      if (data.creative || data.assets) return 'creative';
      if (data.name && data.pronouns) return 'personality';
      if (data.language || data.permissionMode) return 'settings';
    } catch { /* not JSON */ }
    return 'unknown';
  };

  const handleImportAll = useCallback(() => {
    setImporting(true);
    for (const file of importFiles) {
      if (file.dataType !== 'unknown') {
        post({ type: 'import_data', dataType: file.dataType, content: file.content } as any);
      }
    }
    setImportFiles([]);
  }, [importFiles]);

  const removeImportFile = useCallback((index: number) => {
    setImportFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const confirmPass = useCallback(() => {
    if (!passModal || !passInput) return;
    setBusy(true);
    if (passModal.mode === 'export') {
      post({ type: 'export_encrypted_backup', passphrase: passInput } as any);
    } else {
      post({ type: 'import_encrypted_backup', content: passModal.content, passphrase: passInput } as any);
    }
  }, [passModal, passInput]);

  const fmtSize = (bytes: number) => {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  if (!isOpen) return null;

  const tabBtn = (which: 'export' | 'import') => ({
    background: tab === which ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
    color: tab === which ? 'var(--accent)' : 'var(--text-muted)',
    border: 'none', borderRadius: 6, padding: '6px 16px',
    fontSize: 12, fontWeight: 600 as const, cursor: 'pointer' as const,
  });

  const dataTypeIcon = (id: string) => DATA_TYPES.find(d => d.id === id)?.icon || '\uD83D\uDCC1';

  return (
    <div ref={panelRef} className="fixed z-[9999] rounded-xl border"
      style={{
        top: 80, left: 60, width: 340, maxHeight: 'calc(100vh - 120px)', overflowY: 'auto',
        background: '#1e1e2e', borderColor: 'color-mix(in srgb, var(--accent) 20%, transparent)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}>
        <span className="text-xs font-semibold" style={{ color: '#cdd6f4' }}>{t('dash.portability.title')}</span>
        <div className="flex gap-1">
          <button onClick={() => setTab('export')} style={tabBtn('export')}>{t('dash.portability.export')}</button>
          <button onClick={() => setTab('import')} style={tabBtn('import')}>{t('dash.portability.import')}</button>
        </div>
      </div>

      {/* Export Tab */}
      {tab === 'export' && (
        <div className="p-3">
          {/* Data sovereignty — local backup + readable export. These live
              ABOVE the cloud export: your data is on your machine; this is how
              you keep it safe, move it, and see it. */}
          <button
            onClick={() => { setPassInput(''); setPassModal({ mode: 'export' }); }}
            className="mb-2 w-full rounded-lg border px-3 py-2.5 text-left transition hover:bg-[var(--accent)]/10"
            style={{ borderColor: 'color-mix(in srgb, var(--accent) 35%, transparent)', background: 'color-mix(in srgb, var(--accent) 6%, transparent)' }}
          >
            <div className="flex items-center gap-2">
              <span className="text-base">{'\u{1F512}'}</span>
              <div className="flex-1">
                <div className="text-xs font-semibold" style={{ color: '#cdd6f4' }}>{t('dash.portability.enc_backup')} (.ava-backup)</div>
                <div className="text-[10px] opacity-60" style={{ color: '#a6adc8' }}>
                  {t('dash.portability.enc_backup_desc')}
                </div>
              </div>
            </div>
          </button>
          <button
            onClick={() => { setStatusMsg(t('dash.portability.preparing')); post({ type: 'export_readable_all' } as { type: 'export_readable_all' }); }}
            className="mb-3 w-full rounded-lg border px-3 py-2.5 text-left transition hover:bg-white/[0.04]"
            style={{ borderColor: 'rgba(108,112,134,0.3)' }}
          >
            <div className="flex items-center gap-2">
              <span className="text-base">{'\u{1F4D6}'}</span>
              <div className="flex-1">
                <div className="text-xs font-semibold" style={{ color: '#cdd6f4' }}>{t('dash.portability.readable')}</div>
                <div className="text-[10px] opacity-60" style={{ color: '#a6adc8' }}>
                  {t('dash.portability.readable_desc')}
                </div>
              </div>
            </div>
          </button>
          {/* GDPR Article 20 — full cloud-stored data export. Lives at
              the top of the Export tab as a hero CTA so users see the
              "everything in one file" path before the per-type list.
              Hits /api/export-my-data via the host (auth lives in
              SecretStorage). Distinct from per-type below because it
              covers tables the per-type flow doesn't (subscriptions,
              consent records, etc.) — true GDPR completeness. */}
          {/* Cloud sunset — the platform stops storing user data on 1 Jul 2026.
              This is the last-chance path to pull anything we still hold in the
              cloud before it's deleted for good. Styled amber as a warning. */}
          <button
            onClick={() => post({ type: 'export_full_account_data' } as { type: 'export_full_account_data' })}
            className="mb-3 w-full rounded-lg border px-3 py-2.5 text-left transition hover:bg-amber-500/10"
            style={{ borderColor: 'rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.08)' }}
          >
            <div className="flex items-center gap-2">
              <span className="text-base">{'⚠️'}</span>
              <div className="flex-1">
                <div className="text-xs font-semibold" style={{ color: '#fbbf24' }}>{t('dash.portability.download_all')}</div>
                <div className="text-[10px] font-semibold mt-0.5" style={{ color: '#fbbf24' }}>
                  {t('dash.portability.cloud_sunset')}
                </div>
                <div className="text-[10px] opacity-60 mt-0.5" style={{ color: '#a6adc8' }}>
                  {t('dash.portability.download_all_desc')}
                </div>
              </div>
            </div>
          </button>
          <div className="mb-3 px-1 text-[10px] opacity-50" style={{ color: '#6c7086' }}>
            {t('dash.portability.pick_specific')}
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wider opacity-40">{t('dash.portability.select_data')}</span>
            <button onClick={selectAllExport} className="text-[10px] bg-transparent border-none cursor-pointer" style={{ color: 'var(--accent)' }}>
              {t('dash.portability.select_all')}
            </button>
          </div>
          {DATA_TYPES.map(dt => {
            const selected = exportSelected.has(dt.id);
            return (
              <div key={dt.id} className="flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer hover:bg-white/[0.04]"
                onClick={() => toggleExport(dt.id)}
              >
                <span className="text-sm">{dt.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium" style={{ color: selected ? '#cdd6f4' : '#6c7086' }}>{t(dt.nameKey)}</div>
                  <div className="text-[10px] opacity-40">{t(dt.descKey)}</div>
                </div>
                {/* Quick export single */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleExportSingle(dt.id); }}
                  className="text-[10px] px-2 py-1 rounded bg-transparent border-none cursor-pointer opacity-0 group-hover:opacity-100 hover:bg-white/[0.06]"
                  style={{ color: 'var(--accent)' }}
                  title={t('dash.portability.export_one', { name: t(dt.nameKey) })}
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 1v10.293L4.854 8.146l-.708.708L8 12.707l3.854-3.853-.708-.708L8 11.293V1H8zM2 14h12v1H2v-1z"/>
                  </svg>
                </button>
                {/* Checkbox */}
                <div className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0"
                  style={{
                    borderColor: selected ? 'var(--accent)' : 'rgba(108,112,134,0.3)',
                    background: selected ? 'var(--accent)' : 'transparent',
                  }}
                >
                  {selected && <svg width="10" height="10" viewBox="0 0 16 16" fill="white"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>}
                </div>
              </div>
            );
          })}
          {exportSelected.size > 0 && (
            <button
              onClick={handleExport}
              disabled={!!exporting}
              className="w-full mt-3 py-2 rounded-lg text-xs font-medium text-white border-none cursor-pointer"
              style={{ background: exporting ? '#6c7086' : 'linear-gradient(135deg, var(--accent), #7c3aed)' }}
            >
              {exporting ? t('dash.portability.exporting') : t('dash.portability.export_n_selected', { n: exportSelected.size })}
            </button>
          )}
        </div>
      )}

      {/* Import Tab */}
      {tab === 'import' && (
        <div className="p-3">
          {/* Drop zone */}
          <div
            onClick={() => {
              // VS Code webview can't use native file input — route through host
              post({ type: 'import_pick_files' } as any);
            }}
            className="flex flex-col items-center justify-center gap-2 py-6 rounded-lg cursor-pointer hover:bg-[color-mix(in_srgb,var(--accent)_6%,transparent)] transition"
            style={{ border: '2px dashed color-mix(in srgb, var(--accent) 20%, transparent)', background: 'color-mix(in srgb, var(--accent) 3%, transparent)' }}
          >
            <svg width="24" height="24" viewBox="0 0 16 16" fill="var(--accent)" opacity={0.4}>
              <path d="M8 1L4.146 4.854l.708.708L7.5 2.914V11h1V2.914l2.646 2.648.708-.708L8 1zM2 14h12v1H2v-1z"/>
            </svg>
            <span className="text-xs opacity-40">{t('dash.portability.click_select')}</span>
            <span className="text-[10px] opacity-25">{t('dash.portability.accepts_json')}</span>
          </div>

          {/* Detected files */}
          {importFiles.length > 0 && (
            <div className="mt-3 space-y-1">
              <span className="text-[10px] uppercase tracking-wider opacity-40">{t('dash.portability.detected_files')}</span>
              {importFiles.map((file, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-2 rounded-lg" style={{ background: 'color-mix(in srgb, var(--accent) 5%, transparent)' }}>
                  <span className="text-sm">{dataTypeIcon(file.dataType)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate" style={{ color: file.dataType !== 'unknown' ? '#cdd6f4' : '#ef4444' }}>
                      {file.dataType !== 'unknown' ? (() => { const dt = DATA_TYPES.find(d => d.id === file.dataType); return dt ? t(dt.nameKey) : file.dataType; })() : t('dash.portability.unknown_format')}
                    </div>
                    <div className="text-[10px] opacity-40">{file.name} ({fmtSize(file.size)})</div>
                  </div>
                  <button onClick={() => removeImportFile(i)} className="text-[10px] bg-transparent border-none cursor-pointer opacity-40 hover:opacity-100" style={{ color: '#ef4444' }}>
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={handleImportAll}
                disabled={importing || importFiles.every(f => f.dataType === 'unknown')}
                className="w-full mt-2 py-2 rounded-lg text-xs font-medium text-white border-none cursor-pointer"
                style={{ background: importing ? '#6c7086' : 'linear-gradient(135deg, var(--accent), #7c3aed)' }}
              >
                {importing ? t('dash.portability.importing') : t('dash.portability.import_n_files', { n: importFiles.filter(f => f.dataType !== 'unknown').length })}
              </button>
            </div>
          )}

          {/* Import result */}
          {importResult && (
            <div className="mt-2 px-3 py-2 rounded-lg text-xs" style={{ background: 'rgba(166,227,161,0.1)', color: '#a6e3a1' }}>
              {importResult}
            </div>
          )}
        </div>
      )}

      {/* Status banner (backup saved / restored) */}
      {statusMsg && (
        <div className="mx-3 mb-2 px-3 py-2 rounded-lg text-[11px]" style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)', color: '#cdd6f4' }}>
          {statusMsg}
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-2 text-[10px] opacity-30 border-t" style={{ borderColor: 'color-mix(in srgb, var(--accent) 8%, transparent)' }}>
        {t('dash.portability.footer')}
      </div>

      {/* Passphrase modal — for creating or opening an encrypted backup. */}
      {passModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', padding: 16 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) { setPassModal(null); setPassInput(''); } }}
        >
          <div className="rounded-xl border p-4" style={{ width: 320, background: '#1e1e2e', borderColor: 'color-mix(in srgb, var(--accent) 30%, transparent)' }}>
            <div className="text-xs font-semibold mb-1" style={{ color: '#cdd6f4' }}>
              {passModal.mode === 'export' ? t('dash.portability.pass_set') : t('dash.portability.pass_enter')}
            </div>
            <div className="text-[10px] opacity-60 mb-3" style={{ color: '#a6adc8', lineHeight: 1.5 }}>
              {passModal.mode === 'export' ? t('dash.portability.pass_set_desc') : (passModal.name || '')}
            </div>
            <input
              type="password" value={passInput} autoFocus
              onChange={(e) => setPassInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && passInput && !busy) confirmPass(); }}
              placeholder={t('dash.portability.passphrase')}
              className="w-full mb-3 px-2 py-1.5 rounded text-xs"
              style={{ background: '#11111b', color: '#cdd6f4', border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', outline: 'none' }}
            />
            <div className="flex gap-2">
              <button onClick={() => { setPassModal(null); setPassInput(''); }} disabled={busy}
                className="flex-1 py-1.5 rounded text-xs cursor-pointer"
                style={{ background: 'transparent', color: '#a6adc8', border: '1px solid rgba(108,112,134,0.3)' }}>
                {t('dash.portability.cancel')}
              </button>
              <button onClick={confirmPass} disabled={!passInput || busy}
                className="flex-1 py-1.5 rounded text-xs text-white border-none cursor-pointer"
                style={{ background: (!passInput || busy) ? '#6c7086' : 'linear-gradient(135deg, var(--accent), #7c3aed)' }}>
                {busy ? t('dash.portability.working') : passModal.mode === 'export' ? t('dash.portability.create_backup') : t('dash.portability.restore')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
