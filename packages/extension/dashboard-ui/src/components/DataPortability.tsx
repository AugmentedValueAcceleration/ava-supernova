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
  { id: 'settings', nameKey: 'dash.nav.settings', icon: '\u2699\uFE0F', descKey: 'dash.portability.type.settings_desc' },
  { id: 'personality', nameKey: 'dash.nav.personality', icon: '\uD83C\uDFA8', descKey: 'dash.portability.type.personality_desc' },
];

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
        const detected = files.map(f => ({
          name: f.name,
          dataType: detectDataType(f.content, f.name),
          content: f.content,
          size: f.size,
        }));
        setImportFiles(prev => [...prev, ...detected]);
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
    if (lower.includes('setting') || lower.includes('config')) return 'settings';
    if (lower.includes('personality')) return 'personality';
    // Try detecting from content
    try {
      const data = JSON.parse(content);
      if (data.entries && data.entries[0]?.category) return 'memory';
      if (data.tasks || (Array.isArray(data) && data[0]?.priority)) return 'tasks';
      if (data.date && (data.userEntry || data.avaEntry)) return 'journal';
      if (data.curriculums || (Array.isArray(data) && data[0]?.modules)) return 'learning';
      if (data.messages && data.title) return 'history';
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

  const fmtSize = (bytes: number) => {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  if (!isOpen) return null;

  const tabBtn = (which: 'export' | 'import') => ({
    background: tab === which ? 'rgba(168,85,247,0.15)' : 'transparent',
    color: tab === which ? '#a855f7' : 'var(--text-muted)',
    border: 'none', borderRadius: 6, padding: '6px 16px',
    fontSize: 12, fontWeight: 600 as const, cursor: 'pointer' as const,
  });

  const dataTypeIcon = (id: string) => DATA_TYPES.find(d => d.id === id)?.icon || '\uD83D\uDCC1';

  return (
    <div ref={panelRef} className="fixed z-[9999] rounded-xl border"
      style={{
        top: 80, left: 60, width: 340, maxHeight: 'calc(100vh - 120px)', overflowY: 'auto',
        background: '#1e1e2e', borderColor: 'rgba(168,85,247,0.2)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'rgba(168,85,247,0.1)' }}>
        <span className="text-xs font-semibold" style={{ color: '#cdd6f4' }}>{t('dash.portability.title')}</span>
        <div className="flex gap-1">
          <button onClick={() => setTab('export')} style={tabBtn('export')}>{t('dash.portability.export')}</button>
          <button onClick={() => setTab('import')} style={tabBtn('import')}>{t('dash.portability.import')}</button>
        </div>
      </div>

      {/* Export Tab */}
      {tab === 'export' && (
        <div className="p-3">
          {/* GDPR Article 20 — full cloud-stored data export. Lives at
              the top of the Export tab as a hero CTA so users see the
              "everything in one file" path before the per-type list.
              Hits /api/export-my-data via the host (auth lives in
              SecretStorage). Distinct from per-type below because it
              covers tables the per-type flow doesn't (subscriptions,
              consent records, etc.) — true GDPR completeness. */}
          <button
            onClick={() => post({ type: 'export_full_account_data' } as { type: 'export_full_account_data' })}
            className="mb-3 w-full rounded-lg border px-3 py-2.5 text-left transition hover:bg-[var(--accent)]/10"
            style={{ borderColor: 'rgba(168,85,247,0.35)', background: 'rgba(168,85,247,0.06)' }}
          >
            <div className="flex items-center gap-2">
              <span className="text-base">{'\u{1F4E6}'}</span>
              <div className="flex-1">
                <div className="text-xs font-semibold" style={{ color: '#cdd6f4' }}>{t('dash.portability.download_all')}</div>
                <div className="text-[10px] opacity-60" style={{ color: '#a6adc8' }}>
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
            <button onClick={selectAllExport} className="text-[10px] bg-transparent border-none cursor-pointer" style={{ color: '#a855f7' }}>
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
                  style={{ color: '#a855f7' }}
                  title={t('dash.portability.export_one', { name: t(dt.nameKey) })}
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 1v10.293L4.854 8.146l-.708.708L8 12.707l3.854-3.853-.708-.708L8 11.293V1H8zM2 14h12v1H2v-1z"/>
                  </svg>
                </button>
                {/* Checkbox */}
                <div className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0"
                  style={{
                    borderColor: selected ? '#a855f7' : 'rgba(108,112,134,0.3)',
                    background: selected ? '#a855f7' : 'transparent',
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
              style={{ background: exporting ? '#6c7086' : 'linear-gradient(135deg, #a855f7, #7c3aed)' }}
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
            className="flex flex-col items-center justify-center gap-2 py-6 rounded-lg cursor-pointer hover:bg-[rgba(168,85,247,0.06)] transition"
            style={{ border: '2px dashed rgba(168,85,247,0.2)', background: 'rgba(168,85,247,0.03)' }}
          >
            <svg width="24" height="24" viewBox="0 0 16 16" fill="#a855f7" opacity={0.4}>
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
                <div key={i} className="flex items-center gap-2 px-2 py-2 rounded-lg" style={{ background: 'rgba(168,85,247,0.05)' }}>
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
                style={{ background: importing ? '#6c7086' : 'linear-gradient(135deg, #a855f7, #7c3aed)' }}
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

      {/* Footer */}
      <div className="px-4 py-2 text-[10px] opacity-30 border-t" style={{ borderColor: 'rgba(168,85,247,0.08)' }}>
        {t('dash.portability.footer')}
      </div>
    </div>
  );
}
