import { useState, useMemo, useEffect, useRef } from 'react';
import { useLocale } from '../i18n';
import { post } from '../App';
import type { LibraryImage, LibraryPath, LibraryPathDetail, CreativeAsset } from '../types/messages';
import { LearningLibrary } from './LearningLibrary';

/**
 * Unified Library — single entry point for everything Ava has made for the
 * user. Replaces the prior split between "Creative Library" (inside Creative
 * Studio) and "Learning Library" (top-level nav). Creative Studio stays as
 * a pure creation surface; browsing/managing generated output lives here.
 *
 * Top-level tabs:
 *   - Courses    — learning paths (delegates to LearningLibrary)
 *   - Assets     — cloud-synced creative assets + local project files,
 *                  filterable by type (image / music / video / voice)
 *   - Documents  — office docs (cloud + local)
 *
 * The tab bar is intentionally flat. Previous surfaces buried the library
 * two clicks deep inside Creative Studio; this exposes everything at one
 * navigation level.
 */

interface Props {
  /** Courses from the Learning Library backend (/api/learning/library). */
  paths: LibraryPath[];
  pathDetail: LibraryPathDetail | null;
  onNavigate: (page: string) => void;
  /** Cloud-synced creative assets from /api/creative-assets. */
  cloudAssets: CreativeAsset[];
  cloudAssetsLoading?: boolean;
  /** Local project files from the workspace scan. */
  images: LibraryImage[];
  projectRoot: string;
  hasImagesFolder?: boolean;
}

type TopTab = 'courses' | 'assets' | 'documents';
type AssetTypeFilter = 'all' | 'image' | 'music' | 'video' | 'voice';
type AssetSource = 'all' | 'cloud' | 'local';
type DocTypeFilter = 'all' | 'document' | 'spreadsheet';
type BlankFormat = 'docx' | 'xlsx' | 'csv' | 'md' | 'pdf';
type TemplateId = 'proposal' | 'report' | 'invoice' | 'letter' | 'meeting_notes' | 'resume';

const ASSET_TYPE_ICONS: Record<string, string> = {
  image: '\u{1F5BC}\u{FE0F}',
  music: '\u{1F3B5}',
  video: '\u{1F3AC}',
  voice: '\u{1F3A4}',
  document: '\u{1F4C4}',
  spreadsheet: '\u{1F4CA}',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Map a local file's type to the unified asset-kind vocabulary.
 *  The local scan can't distinguish music from voice (both are audio on disk),
 *  so local audio lands under 'music' — users can rename / move the file if
 *  they want a voice clip to surface on the Voice filter. */
function localFileKind(img: LibraryImage): 'image' | 'document' | 'spreadsheet' | 'music' | 'video' {
  const ft = img.fileType;
  if (ft === 'audio') return 'music';
  if (ft === 'video') return 'video';
  return (ft as 'image' | 'document' | 'spreadsheet' | undefined) || 'image';
}

/** Items unified for the Assets / Documents grid. */
interface UnifiedItem {
  id: string;
  source: 'cloud' | 'local';
  kind: string;
  title: string;
  subtitle: string;
  thumbnail?: string;
  createdAt?: string;
  raw: CreativeAsset | LibraryImage;
}

function cloudAssetKind(a: CreativeAsset): string {
  return (a.asset_type || a.type || 'image').toLowerCase();
}

function unifyCloudAsset(a: CreativeAsset): UnifiedItem {
  const kind = cloudAssetKind(a);
  return {
    id: `cloud:${a.id}`,
    source: 'cloud',
    kind,
    title: a.title || 'Untitled',
    subtitle: a.prompt?.slice(0, 80) || '',
    thumbnail: (kind === 'image' ? (a.thumbnail_url || a.url) : undefined) || undefined,
    createdAt: a.created_at,
    raw: a,
  };
}

function unifyLocalImage(img: LibraryImage, projectRoot: string): UnifiedItem {
  const kind = localFileKind(img);
  return {
    id: `local:${img.path}`,
    source: 'local',
    kind,
    title: img.name,
    subtitle: `${img.folder} · ${formatSize(img.size)}`,
    thumbnail: kind === 'image' ? (img.dataUri || `${projectRoot}/${img.path}`) : undefined,
    createdAt: img.modified,
    raw: img,
  };
}

export function Library({
  paths,
  pathDetail,
  onNavigate,
  cloudAssets,
  cloudAssetsLoading,
  images,
  projectRoot,
  hasImagesFolder = true,
}: Props) {
  useLocale();
  const [tab, setTab] = useState<TopTab>('assets');
  const [typeFilter, setTypeFilter] = useState<AssetTypeFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<AssetSource>('all');
  const [docType, setDocType] = useState<DocTypeFilter>('all');
  const [docSource, setDocSource] = useState<AssetSource>('all');
  const [newDocOpen, setNewDocOpen] = useState(false);
  const [selected, setSelected] = useState<UnifiedItem | null>(null);
  const [scanning, setScanning] = useState(false);
  const scanningRef = useRef(false);

  // Pull cloud assets once the tab opens to assets/documents, and re-request
  // whenever the user explicitly refreshes.
  useEffect(() => {
    if (tab === 'assets' || tab === 'documents') {
      post({ type: 'load_cloud_assets' });
    }
  }, [tab]);

  useEffect(() => {
    if (scanningRef.current) {
      scanningRef.current = false;
      setScanning(false);
    }
  }, [images, cloudAssets]);

  // Unified item list for Assets tab — excludes office documents, those
  // live on the Documents tab to match what the user expects.
  const assetItems = useMemo(() => {
    const list: UnifiedItem[] = [];
    if (sourceFilter === 'all' || sourceFilter === 'cloud') {
      for (const a of cloudAssets) {
        const k = cloudAssetKind(a);
        if (['image', 'music', 'video', 'voice', 'graphic'].includes(k)) {
          list.push(unifyCloudAsset(a));
        }
      }
    }
    if (sourceFilter === 'all' || sourceFilter === 'local') {
      for (const img of images) {
        const k = localFileKind(img);
        if (['image', 'music', 'video'].includes(k)) list.push(unifyLocalImage(img, projectRoot));
      }
    }
    return typeFilter === 'all'
      ? list
      : list.filter(i => i.kind === typeFilter || (typeFilter === 'image' && i.kind === 'graphic'));
  }, [cloudAssets, images, projectRoot, sourceFilter, typeFilter]);

  // Documents tab — office docs from both sources, filterable by source
  // (cloud/local) and kind (document/spreadsheet). Matches the Assets tab
  // filter shape so users learn one pattern.
  const documentItems = useMemo(() => {
    const list: UnifiedItem[] = [];
    if (docSource === 'all' || docSource === 'cloud') {
      for (const a of cloudAssets) {
        const k = cloudAssetKind(a);
        if (['document', 'spreadsheet'].includes(k)) list.push(unifyCloudAsset(a));
      }
    }
    if (docSource === 'all' || docSource === 'local') {
      for (const img of images) {
        const k = localFileKind(img);
        if (k === 'document' || k === 'spreadsheet') list.push(unifyLocalImage(img, projectRoot));
      }
    }
    return docType === 'all' ? list : list.filter(i => i.kind === docType);
  }, [cloudAssets, images, projectRoot, docSource, docType]);

  const handleScan = () => {
    setScanning(true);
    scanningRef.current = true;
    post({ type: 'load_library' });
    post({ type: 'load_cloud_assets' });
    setTimeout(() => setScanning(false), 10000);
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Library</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Your courses, assets, and documents — everything Ava has made for you.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tab !== 'courses' && (
            <button
              onClick={handleScan}
              disabled={scanning}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition disabled:opacity-50"
            >
              {scanning ? (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 border-2 border-[var(--text-muted)] border-t-[var(--accent)] rounded-full animate-spin" />
                  Refreshing...
                </span>
              ) : 'Refresh'}
            </button>
          )}
        </div>
      </div>

      {/* Top-level tabs — matches Creative Studio / house style: underlined
          bottom border, accent colour on active, no pill backgrounds. */}
      <div className="mb-6 flex gap-1 border-b border-[var(--border-card)]">
        {([
          { key: 'courses',   label: 'Courses',   count: paths.length },
          { key: 'assets',    label: 'Assets',    count: assetItems.length },
          { key: 'documents', label: 'Documents', count: documentItems.length },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition ${
              tab === t.key
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              {t.label}
              <span className={`inline-flex items-center justify-center min-w-[18px] h-[16px] rounded text-[9px] font-bold px-1 ${
                tab === t.key
                  ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
                  : 'bg-[var(--border)] text-[var(--text-muted)]'
              }`}>
                {t.count}
              </span>
            </span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'courses' && (
        <LearningLibrary paths={paths} detail={pathDetail} onNavigate={onNavigate} />
      )}

      {tab === 'assets' && (
        <div>
          {/* Sub-filters: source + type — match house tab style (underlined
              bottom border, accent colour on active). Smaller text than the
              top-level tabs so hierarchy stays clear: primary nav ≠ filter. */}
          <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-[var(--border-card)]">
            <div className="flex items-center gap-1">
              <span className="mr-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)] self-end pb-2">Source</span>
              {(['all', 'cloud', 'local'] as AssetSource[]).map(s => (
                <button
                  key={s}
                  onClick={() => setSourceFilter(s)}
                  className={`px-2.5 py-2 text-[11px] font-medium border-b-2 transition ${
                    sourceFilter === s
                      ? 'border-[var(--accent)] text-[var(--accent)]'
                      : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {s === 'all' ? 'All' : s === 'cloud' ? 'Cloud' : 'Local'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <span className="mr-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)] self-end pb-2">Type</span>
              {(['all', 'image', 'music', 'video', 'voice'] as AssetTypeFilter[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-2.5 py-2 text-[11px] font-medium border-b-2 transition ${
                    typeFilter === t
                      ? 'border-[var(--accent)] text-[var(--accent)]'
                      : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {t === 'all' ? 'All' : t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {cloudAssetsLoading && cloudAssets.length === 0 && (
            <div className="py-12 text-center text-sm text-[var(--text-muted)]">Loading cloud assets...</div>
          )}

          {!cloudAssetsLoading && assetItems.length === 0 && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-12 text-center">
              <div className="text-4xl mb-3">{hasImagesFolder ? '\u{1F3A8}' : '\u{1F4C1}'}</div>
              <p className="text-sm font-medium text-[var(--text-primary)]">No assets yet</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Ask Ava to generate an image, or head to Creative Studio to start.
              </p>
            </div>
          )}

          {assetItems.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
              {assetItems.map(item => (
                <AssetCard key={item.id} item={item} selected={selected?.id === item.id} onSelect={() => setSelected(selected?.id === item.id ? null : item)} />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'documents' && (
        <div>
          {/* Sub-filters + New button — filter style matches Assets tab;
              New button sits on the right so it reads as an action, not a
              filter. Opens a modal with the same blank+template options
              Creative Studio's Documents tab exposes, without duplicating
              the card layout. */}
          <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-[var(--border-card)]">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="flex items-center gap-1">
                <span className="mr-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)] self-end pb-2">Source</span>
                {(['all', 'cloud', 'local'] as AssetSource[]).map(s => (
                  <button
                    key={s}
                    onClick={() => setDocSource(s)}
                    className={`px-2.5 py-2 text-[11px] font-medium border-b-2 transition ${
                      docSource === s
                        ? 'border-[var(--accent)] text-[var(--accent)]'
                        : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    {s === 'all' ? 'All' : s === 'cloud' ? 'Cloud' : 'Local'}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <span className="mr-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)] self-end pb-2">Type</span>
                {(['all', 'document', 'spreadsheet'] as DocTypeFilter[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setDocType(t)}
                    className={`px-2.5 py-2 text-[11px] font-medium border-b-2 transition ${
                      docType === t
                        ? 'border-[var(--accent)] text-[var(--accent)]'
                        : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    {t === 'all' ? 'All' : t === 'document' ? 'Documents' : 'Spreadsheets'}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => setNewDocOpen(true)}
              className="mb-1 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 transition"
            >
              + New document
            </button>
          </div>

          {documentItems.length === 0 ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-12 text-center">
              <div className="text-4xl mb-3">{'\u{1F4C4}'}</div>
              <p className="text-sm font-medium text-[var(--text-primary)]">No documents yet</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Click <span className="font-medium text-[var(--accent)]">+ New document</span> to start from blank or a template — or ask Ava to write one for you.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {documentItems.map(item => (
                <AssetCard key={item.id} item={item} selected={selected?.id === item.id} onSelect={() => setSelected(selected?.id === item.id ? null : item)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* New document modal — blank formats + templates. Routes through
          create_blank_document / create_from_template host messages which
          handle the filename prompt + write to disk. */}
      {newDocOpen && (
        <NewDocumentModal onClose={() => setNewDocOpen(false)} />
      )}

      {/* Preview + actions modal. Renders for Assets and Documents tabs;
          Courses delegates to LearningLibrary which has its own detail view. */}
      {selected && (tab === 'assets' || tab === 'documents') && (
        <PreviewModal item={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

// ── Preview modal ────────────────────────────────────────────────────────
//
// Full-screen overlay matching Creative Studio's preview style. Actions
// are contextual to the item's source + kind:
//
//   Local images         → Open (viewer) · Reveal · Download · Delete
//   Local docs/sheets    → Open (LibreOffice preferred) · Reveal · Download · Delete
//   Cloud any            → Open URL · Copy URL
//
// All local actions route through the existing dashboard-message-types
// handlers (open_library_image / open_external / reveal_in_explorer /
// download_asset / delete_library_image) so we don't duplicate the file
// plumbing. Cloud items use open_url for the public storage URL.
function PreviewModal({
  item,
  onClose,
}: {
  item: UnifiedItem;
  onClose: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  const isLocal = item.source === 'local';
  const isImage = item.kind === 'image' || item.kind === 'graphic';
  const isOfficeDoc = item.kind === 'document' || item.kind === 'spreadsheet';
  const isVideo = item.kind === 'video';
  const isMusic = item.kind === 'music';
  const isVoice = item.kind === 'voice';
  const isAudio = isMusic || isVoice;

  const localPath = isLocal ? (item.raw as LibraryImage).path : undefined;
  const cloudUrl = !isLocal ? (item.raw as CreativeAsset).url ?? undefined : undefined;

  // Playback source — cloud assets use their public URL; local audio
  // gets a base64 dataUri from the library scan (videos are skipped
  // for size, so local video items have no inline preview and rely on
  // the Open button instead). Webview CSP allows data:, https:, blob:
  // for media-src, so both paths work.
  const localDataUri = isLocal ? (item.raw as LibraryImage).dataUri : undefined;
  const mediaSrc: string | undefined = isLocal ? localDataUri : cloudUrl ?? undefined;

  const handleOpen = () => {
    if (isLocal && localPath) {
      // Office docs get the LibreOffice-preferred handler; everything
      // else (images, audio, video) opens in the OS default viewer.
      if (isOfficeDoc) post({ type: 'open_external', path: localPath });
      else if (isImage) post({ type: 'open_library_image', path: localPath });
      else post({ type: 'open_external', path: localPath });
      onClose();
    } else if (cloudUrl) {
      post({ type: 'open_url', url: cloudUrl });
    }
  };

  const handleReveal = () => {
    if (isLocal && localPath) {
      post({ type: 'reveal_in_explorer', path: localPath });
      onClose();
    }
  };

  const handleDownload = () => {
    if (isLocal && localPath) {
      post({ type: 'download_asset', path: localPath });
      return;
    }
    if (cloudUrl) {
      // Supabase Storage honours ?download=<filename> by setting
      // Content-Disposition: attachment on the response, which makes
      // the browser save the file instead of rendering inline. Without
      // it, images/audio/video would just open in a new tab.
      // Derive a filename from the storage path so the user gets the
      // original .png / .mp4 / etc. rather than a cryptic default.
      let filename = item.title || 'download';
      try {
        const last = new URL(cloudUrl).pathname.split('/').pop();
        if (last && last.includes('.')) filename = last;
      } catch { /* malformed URL — fall back to title */ }
      const sep = cloudUrl.includes('?') ? '&' : '?';
      const downloadUrl = `${cloudUrl}${sep}download=${encodeURIComponent(filename)}`;
      post({ type: 'open_url', url: downloadUrl });
    }
  };

  const handleDelete = () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    if (isLocal && localPath) {
      post({ type: 'delete_library_image', path: localPath });
      onClose();
    }
  };

  const handleCopyUrl = async () => {
    if (!cloudUrl) return;
    try {
      await navigator.clipboard.writeText(cloudUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* webview may block clipboard; fall through silently */ }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card)] shadow-2xl"
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 text-white flex items-center justify-center text-lg border-none cursor-pointer transition"
          aria-label="Close preview"
        >
          ×
        </button>

        {/* Preview area — images render inline, audio/video get playback
            controls, office docs + unknowns show the type icon. */}
        {isImage && item.thumbnail ? (
          <img src={item.thumbnail} alt={item.title} className="w-full max-h-[50vh] object-contain bg-black/20" />
        ) : isVideo && mediaSrc ? (
          <MediaPlayer src={mediaSrc} kind="video" />
        ) : isAudio && mediaSrc ? (
          <div className="flex flex-col items-center gap-5 py-10 bg-[var(--bg-input)]">
            <span className="text-5xl opacity-60">{ASSET_TYPE_ICONS[item.kind] || '\u{1F3B5}'}</span>
            <div className="w-[min(92%,480px)]">
              <MediaPlayer src={mediaSrc} kind="audio" />
            </div>
          </div>
        ) : isVideo || isAudio ? (
          // Media item without an inline source — local video (skipped by
          // the scan for size) or a cloud asset whose URL didn't come back.
          // Show the icon + a hint to use the Open button.
          <div className="flex flex-col items-center justify-center gap-2 py-14 bg-[var(--bg-input)]">
            <span className="text-6xl opacity-40">{ASSET_TYPE_ICONS[item.kind] || '\u{1F4C4}'}</span>
            <p className="text-[11px] text-[var(--text-muted)]">
              Inline playback unavailable — use Open to play in your default app.
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-center py-16 bg-[var(--bg-input)]">
            <span className="text-6xl opacity-40">{ASSET_TYPE_ICONS[item.kind] || '\u{1F4C4}'}</span>
          </div>
        )}

        {/* Meta */}
        <div className="p-5">
          <h3 className="text-base font-semibold text-[var(--text-primary)] truncate">{item.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
            <span className={`rounded px-1.5 py-0.5 font-medium ${
              isLocal
                ? 'bg-[var(--text-muted)]/10 text-[var(--text-muted)]'
                : 'bg-[var(--accent)]/10 text-[var(--accent)]'
            }`}>
              {isLocal ? '\u{1F4BE} local' : '☁ cloud'}
            </span>
            <span className="rounded px-1.5 py-0.5 font-medium bg-[var(--border)] text-[var(--text-secondary)]">
              {item.kind}
            </span>
            {item.createdAt && (
              <span className="text-[var(--text-muted)]">
                {new Date(item.createdAt).toLocaleString()}
              </span>
            )}
          </div>
          {item.subtitle && (
            <p className="mt-3 text-xs text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
              {item.subtitle}
            </p>
          )}

          {/* Actions */}
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              onClick={handleOpen}
              className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 transition"
            >
              {isOfficeDoc && isLocal ? 'Open (LibreOffice)' : isLocal ? 'Open' : 'Open in browser'}
            </button>
            {isLocal && (
              <button
                onClick={handleReveal}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition"
              >
                Reveal
              </button>
            )}
            <button
              onClick={handleDownload}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition"
            >
              Download
            </button>
            {!isLocal && cloudUrl && (
              <button
                onClick={handleCopyUrl}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition"
              >
                {copied ? 'Copied ✓' : 'Copy URL'}
              </button>
            )}
            {isLocal && (
              <button
                onClick={handleDelete}
                className={`ml-auto rounded-lg px-3 py-1.5 text-xs font-medium transition border ${
                  confirmDelete
                    ? 'border-red-500/60 bg-red-500/15 text-red-400 hover:bg-red-500/25'
                    : 'border-[var(--border)] text-[var(--text-muted)] hover:text-red-400 hover:border-red-500/40'
                }`}
              >
                {confirmDelete ? 'Confirm delete' : 'Delete'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Media player ────────────────────────────────────────────────────────
//
// Custom player replacing the native browser controls, which look jarring
// against the dark purple dashboard theme. Minimal surface: play/pause,
// scrubber with played portion + hover preview, time readout, and (for
// video) a fullscreen toggle. Volume is intentionally out — users keep
// it at the OS level for AI-generated media and the bar bloats fast.
//
// The <video> element stays visible in the card with controls overlaid
// at the bottom; <audio> renders just the control bar on a transparent
// background because the surrounding modal already carries the icon and
// title above it.
function formatClockTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function MediaPlayer({ src, kind }: { src: string; kind: 'audio' | 'video' }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hoverPct, setHoverPct] = useState<number | null>(null);

  const el = (): HTMLMediaElement | null => (kind === 'audio' ? audioRef.current : videoRef.current);

  useEffect(() => {
    const m = el();
    if (!m) return;
    const onTime = () => setCurrent(m.currentTime);
    const onMeta = () => setDuration(m.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);
    m.addEventListener('timeupdate', onTime);
    m.addEventListener('loadedmetadata', onMeta);
    m.addEventListener('durationchange', onMeta);
    m.addEventListener('play', onPlay);
    m.addEventListener('pause', onPause);
    m.addEventListener('ended', onEnded);
    return () => {
      m.removeEventListener('timeupdate', onTime);
      m.removeEventListener('loadedmetadata', onMeta);
      m.removeEventListener('durationchange', onMeta);
      m.removeEventListener('play', onPlay);
      m.removeEventListener('pause', onPause);
      m.removeEventListener('ended', onEnded);
    };
  }, [kind]);

  const toggle = () => {
    const m = el();
    if (!m) return;
    if (playing) m.pause(); else void m.play();
  };

  const scrubTo = (clientX: number) => {
    const track = trackRef.current;
    const m = el();
    if (!track || !m || !duration) return;
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    m.currentTime = pct * duration;
  };

  const onTrackMove = (e: React.MouseEvent) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    setHoverPct(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
  };

  const toggleFullscreen = () => {
    const v = videoRef.current;
    if (!v) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void v.requestFullscreen();
  };

  const playedPct = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <div className={`relative w-full rounded-lg overflow-hidden ${kind === 'video' ? 'bg-black' : 'bg-[var(--bg-card)] border border-[var(--border-card)]'}`}>
      {kind === 'video' ? (
        <video
          ref={videoRef}
          src={src}
          preload="metadata"
          onClick={toggle}
          className="w-full max-h-[60vh] block cursor-pointer"
        />
      ) : (
        <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
      )}

      {/* Control bar */}
      <div
        className={`${kind === 'video'
          ? 'absolute left-0 right-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 py-2.5'
          : 'px-3 py-2.5'
        } flex items-center gap-3 text-[11px] text-[var(--text-primary)]`}
      >
        <button
          onClick={toggle}
          aria-label={playing ? 'Pause' : 'Play'}
          className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white flex items-center justify-center border-none cursor-pointer transition"
        >
          {playing ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72c0 .78.86 1.25 1.52.83l10.76-6.86a1 1 0 000-1.66L9.52 4.31C8.86 3.89 8 4.36 8 5.14z"/></svg>
          )}
        </button>

        <span className="tabular-nums text-[10px] opacity-70 min-w-[34px] text-right">{formatClockTime(current)}</span>

        {/* Scrubber track */}
        <div
          ref={trackRef}
          onClick={e => scrubTo(e.clientX)}
          onMouseMove={onTrackMove}
          onMouseLeave={() => setHoverPct(null)}
          className={`relative flex-1 h-1.5 rounded-full cursor-pointer ${kind === 'video' ? 'bg-white/20' : 'bg-[var(--border)]'}`}
        >
          {/* Played portion */}
          <div
            className="absolute inset-y-0 left-0 bg-[var(--accent)] rounded-full"
            style={{ width: `${playedPct}%` }}
          />
          {/* Hover marker */}
          {hoverPct !== null && (
            <div
              className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-[var(--accent)]/60 pointer-events-none"
              style={{ left: `${hoverPct * 100}%` }}
            />
          )}
          {/* Thumb on played end */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-[var(--accent)] shadow-md pointer-events-none"
            style={{ left: `${playedPct}%` }}
          />
        </div>

        <span className="tabular-nums text-[10px] opacity-70 min-w-[34px]">{formatClockTime(duration)}</span>

        {kind === 'video' && (
          <button
            onClick={toggleFullscreen}
            aria-label="Fullscreen"
            className="flex-shrink-0 w-7 h-7 rounded hover:bg-white/10 text-white flex items-center justify-center border-none cursor-pointer transition"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 14v6h6M20 10V4h-6M20 4l-7 7M4 20l7-7"/></svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ── New document modal ──────────────────────────────────────────────────
//
// Small create flow for the Library's Documents tab. Exposes the same
// blank-format and template options as Creative Studio's Documents tab
// without duplicating the rich card layout — Library is a browse surface
// first, creation second. Both actions route through existing host
// messages (create_blank_document / create_from_template) which handle
// the filename prompt (vscode.window.showInputBox) and write to
// documents/ on disk. After the write fires, the local library scan
// picks up the new file and it surfaces in this tab.
const BLANK_FORMATS: { id: BlankFormat; label: string; icon: string; ext: string }[] = [
  { id: 'docx', label: 'Word Document',  icon: '\u{1F4C4}', ext: '.docx' },
  { id: 'xlsx', label: 'Spreadsheet',    icon: '\u{1F4CA}', ext: '.xlsx' },
  { id: 'csv',  label: 'CSV',            icon: '\u{1F4C8}', ext: '.csv'  },
  { id: 'md',   label: 'Markdown',       icon: '\u{1F4DD}', ext: '.md'   },
  { id: 'pdf',  label: 'PDF',            icon: '\u{1F4D1}', ext: '.pdf'  },
];

const TEMPLATES: { id: TemplateId; label: string; desc: string; icon: string }[] = [
  { id: 'proposal',      label: 'Project Proposal', desc: 'Executive summary, objectives, timeline', icon: '\u{1F4BC}' },
  { id: 'report',        label: 'Status Report',    desc: 'Progress, issues, next steps',            icon: '\u{1F4C8}' },
  { id: 'invoice',       label: 'Invoice',          desc: 'Items table, payment terms',              icon: '\u{1F9FE}' },
  { id: 'letter',        label: 'Formal Letter',    desc: 'Recipient, body, closing',                icon: '\u{2709}\u{FE0F}' },
  { id: 'meeting_notes', label: 'Meeting Notes',    desc: 'Agenda, discussion, action items',        icon: '\u{1F5D2}\u{FE0F}' },
  { id: 'resume',        label: 'Resume',           desc: 'Contact, experience, education, skills',  icon: '\u{1F465}' },
];

function NewDocumentModal({ onClose }: { onClose: () => void }) {
  const createBlank = (format: BlankFormat) => {
    post({ type: 'create_blank_document', format });
    onClose();
  };
  const createTemplate = (template: TemplateId) => {
    post({ type: 'create_from_template', template });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card)] shadow-2xl p-6"
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/20 hover:bg-black/40 text-[var(--text-muted)] hover:text-white flex items-center justify-center text-lg border-none cursor-pointer transition"
          aria-label="Close"
        >
          ×
        </button>

        <h2 className="text-base font-semibold text-[var(--text-primary)] mb-1">New document</h2>
        <p className="text-xs text-[var(--text-muted)] mb-5">
          Files save to your project's <code className="font-mono text-[10px] px-1 rounded bg-[var(--bg-input)]">documents/</code> folder and appear here.
        </p>

        <h3 className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium mb-2">Blank file</h3>
        <div className="grid grid-cols-3 gap-2 mb-5">
          {BLANK_FORMATS.map(f => (
            <button
              key={f.id}
              onClick={() => createBlank(f.id)}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-[var(--border-card)] bg-[var(--bg-input)] p-3 text-center transition hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/5 cursor-pointer"
            >
              <span className="text-2xl">{f.icon}</span>
              <span className="text-[11px] font-medium text-[var(--text-primary)]">{f.label}</span>
              <span className="text-[9px] text-[var(--text-muted)]">{f.ext}</span>
            </button>
          ))}
        </div>

        <h3 className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium mb-2">From template</h3>
        <div className="grid grid-cols-2 gap-2">
          {TEMPLATES.map(tmpl => (
            <button
              key={tmpl.id}
              onClick={() => createTemplate(tmpl.id)}
              className="flex items-start gap-2.5 rounded-xl border border-[var(--border-card)] bg-[var(--bg-input)] p-3 text-left transition hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/5 cursor-pointer"
            >
              <span className="text-xl shrink-0">{tmpl.icon}</span>
              <div className="min-w-0">
                <span className="block text-[11px] font-medium text-[var(--text-primary)]">{tmpl.label}</span>
                <span className="block text-[10px] text-[var(--text-muted)] leading-snug">{tmpl.desc}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Asset card ──────────────────────────────────────────────────────────

function AssetCard({
  item,
  selected,
  onSelect,
}: {
  item: UnifiedItem;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`group relative rounded-xl overflow-hidden border bg-[var(--bg-card)] text-left transition hover:border-[var(--accent)]/50 ${
        selected ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/30' : 'border-[var(--border)]'
      }`}
    >
      {item.thumbnail ? (
        <img
          src={item.thumbnail}
          alt={item.title}
          className="h-28 w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-28 w-full items-center justify-center text-4xl opacity-40">
          {ASSET_TYPE_ICONS[item.kind] || '\u{1F4C4}'}
        </div>
      )}
      <div className="p-2.5">
        <p className="truncate text-[11px] font-medium text-[var(--text-primary)]">{item.title}</p>
        <div className="mt-1 flex items-center justify-between gap-1">
          <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
            item.source === 'cloud'
              ? 'bg-[var(--accent)]/10 text-[var(--accent)]'
              : 'bg-[var(--text-muted)]/10 text-[var(--text-muted)]'
          }`}>
            {item.source === 'cloud' ? '☁ cloud' : '\u{1F4BE} local'}
          </span>
          <span className="text-[9px] text-[var(--text-muted)]">
            {item.kind}
          </span>
        </div>
      </div>
    </button>
  );
}
