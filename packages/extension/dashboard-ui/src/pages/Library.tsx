import { useState, useMemo, useEffect, useRef } from 'react';
import { t } from '../i18n';
import { post } from '../App';
import { Select } from '../components/Select';
import type { LibraryImage, LibraryFileType } from '../types/messages';

interface Props {
  images: LibraryImage[];
  projectRoot: string;
  hasImagesFolder?: boolean;
}

type FilterTab = 'all' | 'image' | 'document' | 'spreadsheet' | 'presentation';

const FILE_TYPE_ICONS: Record<string, string> = {
  document: '\u{1F4C4}',
  spreadsheet: '\u{1F4CA}',
  presentation: '\u{1F4BD}',
};

function getFileTypeLabels(): Record<FilterTab, string> {
  return {
    all: t('dash.library.all'),
    image: t('dash.library.images'),
    document: t('dash.library.docs'),
    spreadsheet: t('dash.library.sheets'),
    presentation: t('dash.library.slides'),
  };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileType(item: LibraryImage): LibraryFileType {
  return item.fileType || 'image';
}

function isImageFile(item: LibraryImage): boolean {
  return getFileType(item) === 'image';
}

export function Library({ images, projectRoot, hasImagesFolder = true }: Props) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [filterFolder, setFilterFolder] = useState<string>('all');
  const [filterType, setFilterType] = useState<FilterTab>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [scanning, setScanning] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const scanningRef = useRef(false);

  // Detect scan completion when images prop updates while scanning
  useEffect(() => {
    if (scanningRef.current) {
      scanningRef.current = false;
      setScanning(false);
      setScanComplete(true);
      const timer = setTimeout(() => setScanComplete(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [images]);

  // Extract unique folders
  const folders = useMemo(() => {
    const set = new Set(images.map(i => i.folder));
    return ['all', ...Array.from(set).sort()];
  }, [images]);

  // Count by file type
  const typeCounts = useMemo(() => {
    const counts: Record<FilterTab, number> = { all: images.length, image: 0, document: 0, spreadsheet: 0, presentation: 0 };
    for (const img of images) {
      const ft = getFileType(img);
      if (ft in counts) counts[ft as FilterTab]++;
    }
    return counts;
  }, [images]);

  // Filter by folder and type
  const filtered = useMemo(() => {
    let result = images;
    if (filterFolder !== 'all') result = result.filter(i => i.folder === filterFolder);
    if (filterType !== 'all') result = result.filter(i => getFileType(i) === filterType);
    return result;
  }, [images, filterFolder, filterType]);

  const selected = images.find(i => i.path === selectedPath);

  return (
    <div className="mx-auto w-full max-w-5xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('dash.library.title')}</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {t('dash.library.subtitle')}
          </p>
        </div>
        <button
          onClick={() => {
            setScanning(true);
            setScanComplete(false);
            scanningRef.current = true;
            post({ type: 'load_library' });
            // The library_loaded message will trigger a re-render with new data
            // Use a timeout as a safety net in case the message is slow
            setTimeout(() => setScanning(false), 10000);
          }}
          disabled={scanning}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition disabled:opacity-50"
        >
          {scanning ? (
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 border-2 border-[var(--text-muted)] border-t-[var(--accent)] rounded-full animate-spin" />
              Scanning...
            </span>
          ) : scanComplete ? (
            <span className="flex items-center gap-1.5 text-emerald-400">
              ✓ Done
            </span>
          ) : (
            'Scan'
          )}
        </button>
      </div>

      {/* File type filter tabs */}
      <div className="mb-4 flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-1 overflow-x-auto">
        {(['all', 'image', 'document', 'spreadsheet', 'presentation'] as FilterTab[]).map(tab => {
          const labels = getFileTypeLabels();
          return (
          <button
            key={tab}
            onClick={() => setFilterType(tab)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition whitespace-nowrap ${
              filterType === tab
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            {labels[tab]}
            <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold px-1 ${
              filterType === tab
                ? 'bg-white/20 text-white'
                : 'bg-[var(--border)] text-[var(--text-muted)]'
            }`}>
              {typeCounts[tab]}
            </span>
          </button>
        );
        })}
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex items-center gap-3">
        {/* Folder filter */}
        <div className="w-52">
          <Select
            value={filterFolder}
            onChange={setFilterFolder}
            options={folders.map(f => ({
              value: f,
              label: f === 'all' ? `All folders (${images.length})` : `${f} (${images.filter(i => i.folder === f).length})`,
            }))}
          />
        </div>

        {/* View toggle */}
        <div className="ml-auto flex rounded-lg border border-[var(--border)] overflow-hidden">
          <button
            onClick={() => setViewMode('grid')}
            className={`px-2.5 py-1.5 text-xs ${viewMode === 'grid' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)]'}`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-2.5 py-1.5 text-xs ${viewMode === 'list' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)]'}`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Empty state */}
      {images.length === 0 && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-12 text-center">
          <div className="text-4xl mb-3">{hasImagesFolder ? '\u{1F3A8}' : '\u{1F4C1}'}</div>
          <p className="text-sm font-medium text-[var(--text-primary)]">
            {hasImagesFolder ? t('dash.library.no_files') : t('dash.library.no_files')}
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {t('dash.library.ask_ava')}
          </p>
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            Scans: images/ and documents/ folders and all subfolders
          </p>
        </div>
      )}

      {/* Grid view */}
      {filtered.length > 0 && viewMode === 'grid' && (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
          {filtered.map(img => (
            <button
              key={img.path}
              onClick={() => setSelectedPath(selectedPath === img.path ? null : img.path)}
              className={`group relative aspect-square rounded-xl overflow-hidden border transition hover:border-[var(--accent)]/50 ${
                selectedPath === img.path ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/30' : 'border-[var(--border)]'
              }`}
            >
              {isImageFile(img) ? (
                <img
                  src={img.dataUri || `${projectRoot}/${img.path}`}
                  alt={img.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-[var(--bg-card)] gap-2 p-3">
                  <span className="text-4xl">{FILE_TYPE_ICONS[getFileType(img)] || '\u{1F4C4}'}</span>
                  <p className="text-[10px] text-[var(--text-secondary)] font-medium truncate w-full text-center">{img.name}</p>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 group-hover:opacity-100 transition">
                <p className="text-[10px] text-white font-medium truncate">{img.name}</p>
                <p className="text-[9px] text-white/60">{formatSize(img.size)}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* List view */}
      {filtered.length > 0 && viewMode === 'list' && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
          {filtered.map((img, i) => (
            <button
              key={img.path}
              onClick={() => setSelectedPath(selectedPath === img.path ? null : img.path)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition hover:bg-[var(--bg-hover)] ${
                i > 0 ? 'border-t border-[var(--border)]' : ''
              } ${selectedPath === img.path ? 'bg-[var(--accent)]/5' : ''}`}
            >
              {isImageFile(img) ? (
                <img
                  src={img.dataUri || `${projectRoot}/${img.path}`}
                  alt={img.name}
                  className="w-10 h-10 rounded-lg object-cover border border-[var(--border)]"
                  loading="lazy"
                />
              ) : (
                <div className="w-10 h-10 rounded-lg border border-[var(--border)] flex items-center justify-center bg-[var(--bg-hover)] text-xl">
                  {FILE_TYPE_ICONS[getFileType(img)] || '\u{1F4C4}'}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)] truncate">{img.name}</p>
                <p className="text-[11px] text-[var(--text-muted)]">{img.folder}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[11px] text-[var(--text-secondary)]">{formatSize(img.size)}</p>
                {isImageFile(img) && img.dimensions && <p className="text-[10px] text-[var(--text-muted)]">{img.dimensions}</p>}
                {!isImageFile(img) && (
                  <p className="text-[10px] text-[var(--text-muted)] capitalize">{getFileType(img)}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Selected file detail */}
      {selected && (
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 relative">
          <button
            onClick={() => setSelectedPath(null)}
            className="absolute top-3 right-3 w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white text-xs"
          >{'\u2715'}</button>
          <div className="flex gap-4">
            {isImageFile(selected) ? (
              <img
                src={selected.dataUri || `${projectRoot}/${selected.path}`}
                alt={selected.name}
                className="w-48 h-48 rounded-lg object-contain bg-black/20 border border-[var(--border)]"
              />
            ) : (
              <div className="w-48 h-48 rounded-lg bg-[var(--bg-hover)] border border-[var(--border)] flex flex-col items-center justify-center gap-3">
                <span className="text-6xl">{FILE_TYPE_ICONS[getFileType(selected)] || '\u{1F4C4}'}</span>
                <span className="text-xs font-medium text-[var(--text-secondary)] capitalize">{getFileType(selected)}</span>
              </div>
            )}
            <div className="flex-1">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">{selected.name}</h3>
              <p className="text-xs text-[var(--text-muted)] mt-1">{selected.path}</p>

              <div className="mt-3 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--text-secondary)]">Size</span>
                  <span className="text-[var(--text-primary)]">{formatSize(selected.size)}</span>
                </div>
                {isImageFile(selected) && selected.dimensions && (
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--text-secondary)]">Dimensions</span>
                    <span className="text-[var(--text-primary)]">{selected.dimensions}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--text-secondary)]">Type</span>
                  <span className="text-[var(--text-primary)] capitalize">{getFileType(selected)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--text-secondary)]">Modified</span>
                  <span className="text-[var(--text-primary)]">{new Date(selected.modified).toLocaleDateString()}</span>
                </div>
              </div>

              <div className="mt-4 flex gap-2 flex-wrap">
                <button
                  onClick={() => post({ type: 'open_library_image', path: selected.path })}
                  className="flex-1 py-2 rounded-lg text-xs font-medium bg-[var(--accent)] text-white hover:opacity-90 transition"
                >
                  Open in Editor
                </button>
                {!isImageFile(selected) && (
                  <button
                    onClick={() => post({ type: 'open_external', path: selected.path })}
                    className="flex-1 py-2 rounded-lg text-xs font-medium border border-[var(--accent)]/50 text-[var(--accent)] hover:bg-[var(--accent)]/10 transition"
                  >
                    Open Externally
                  </button>
                )}
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(selected.path);
                  }}
                  className="px-3 py-2 rounded-lg text-xs font-medium border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
                >
                  Copy Path
                </button>
                <button
                  onClick={() => {
                    post({ type: 'delete_library_image', path: selected.path });
                    setSelectedPath(null);
                  }}
                  className="px-3 py-2 rounded-lg text-xs font-medium border border-[var(--border)] text-[var(--text-secondary)] hover:text-red-400 hover:border-red-400/50 transition"
                >
                  Delete
                </button>
              </div>

              {!isImageFile(selected) && (
                <p className="mt-3 text-[10px] text-[var(--text-muted)]">
                  For full editing, we recommend <a href="#" onClick={(e) => { e.preventDefault(); post({ type: 'open_url', url: 'https://libreoffice.org' }); }} className="text-[var(--accent)] hover:underline">LibreOffice</a> (free, open source) — libreoffice.org
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      {images.length > 0 && (
        <p className="mt-4 text-center text-[11px] text-[var(--text-muted)]">
          {images.length} file{images.length !== 1 ? 's' : ''} across {folders.length - 1} folder{folders.length - 1 !== 1 ? 's' : ''}
          {typeCounts.image > 0 && ` \u00B7 ${typeCounts.image} image${typeCounts.image !== 1 ? 's' : ''}`}
          {typeCounts.document > 0 && ` \u00B7 ${typeCounts.document} document${typeCounts.document !== 1 ? 's' : ''}`}
          {typeCounts.spreadsheet > 0 && ` \u00B7 ${typeCounts.spreadsheet} spreadsheet${typeCounts.spreadsheet !== 1 ? 's' : ''}`}
          {typeCounts.presentation > 0 && ` \u00B7 ${typeCounts.presentation} presentation${typeCounts.presentation !== 1 ? 's' : ''}`}
        </p>
      )}
    </div>
  );
}
