import { useState, useMemo, useEffect, useRef } from 'react';
import { t, useLocale } from '../i18n';
import { post } from '../App';
import type { LibraryImage, LibraryPaper, PapersTab, PaperDiscipline, CreativeAsset } from '../types/messages';
import { LibraryPapers } from './LibraryPapers';
import { Skeleton } from '../components/Skeleton';
import { Icon } from '../components/Icon';
import { tabBar, tab as tabClass } from '../components/ui';

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
  /** Papers tab data — keyed by sub-tab. Pushed by the host on load_papers. */
  papersByTab: Record<PapersTab, LibraryPaper[]>;
  papersTabLoading: Record<PapersTab, boolean>;
  paperSearchResults: LibraryPaper[];
  paperSearchLoading: boolean;
  paperSearchQuery: string;
  onLoadPapers: (tab: PapersTab, discipline?: PaperDiscipline) => void;
  onSearchPapers: (query: string, discipline?: PaperDiscipline) => void;
  onClearPaperSearch: () => void;
  onReadPaperWithAva: (paper: LibraryPaper) => void;
  /** Enriched paper record from /api/papers/{id} — populates the
   *  detail modal with the full abstract / OA PDF / publisher URL
   *  that may be missing from the slim list-row response. */
  paperDetail: LibraryPaper | null;
  paperDetailLoading: boolean;
  onLoadPaperDetail: (id: string) => void;
  onClearPaperDetail: () => void;
  /** Cloud-synced creative assets from /api/creative-assets. Documents tab only
   *  now — the Assets tab is local-first (see `localCreative`). */
  cloudAssets: CreativeAsset[];
  /** Local-first creative gallery (~/.ava/users/<id>/creative) — the source the
   *  Assets tab reads. No cloud; everything Creative Studio makes is saved here. */
  localCreative: CreativeAsset[];
  /** True while the host is fetching the cloud asset list. Drives a
   *  non-blocking "Pulling cloud assets…" pill above the grid so the
   *  user understands incomplete-looking thumbnails are still in
   *  flight rather than missing. The grid keeps rendering whatever
   *  it has — never a full-page block. */
  cloudAssetsLoading?: boolean;
  /** Request a fresh cloud-asset pull. Library calls this when the
   *  user switches tabs (assets ↔ documents) so the loading pill stays
   *  in sync with the parent's state — without it, Library's own
   *  fetch fired but the parent didn't know to flip the gate, leaving
   *  the spinner invisible during legitimate refetches. */
  onReloadCloudAssets?: () => void;
  /** Local project files from the workspace scan. */
  images: LibraryImage[];
  projectRoot: string;
  hasImagesFolder?: boolean;
}

type TopTab = 'papers' | 'assets' | 'documents';
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
    // Prefer the host's webviewUri (streams from disk, no size cap) over
    // the legacy dataUri. Falls back to a raw path string only if the
    // host is older than the asWebviewUri rollout — webviews can't load
    // those, but the broken-image glyph at least signals what's missing.
    thumbnail: kind === 'image' ? (img.webviewUri || img.dataUri || `${projectRoot}/${img.path}`) : undefined,
    createdAt: img.modified,
    raw: img,
  };
}

export function Library({
  papersByTab,
  papersTabLoading,
  paperSearchResults,
  paperSearchLoading,
  paperSearchQuery,
  onLoadPapers,
  onSearchPapers,
  onClearPaperSearch,
  onReadPaperWithAva,
  paperDetail,
  paperDetailLoading,
  onLoadPaperDetail,
  onClearPaperDetail,
  cloudAssets,
  localCreative,
  cloudAssetsLoading,
  onReloadCloudAssets,
  images,
  projectRoot,
  hasImagesFolder = true,
}: Props) {
  useLocale();
  // Papers is the entry-point tab — Library is a research/output surface
  // (courses moved to the dedicated Learning room). Assets / Documents are
  // the other browse surfaces.
  const [tab, setTab] = useState<TopTab>('papers');
  const [typeFilter, setTypeFilter] = useState<AssetTypeFilter>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [docType, setDocType] = useState<DocTypeFilter>('all');
  const [docSource, setDocSource] = useState<AssetSource>('all');
  const [newDocOpen, setNewDocOpen] = useState(false);
  const [selected, setSelected] = useState<UnifiedItem | null>(null);

  // Refresh cloud assets when the user switches into assets/documents.
  // Routes through the parent so the loading pill stays in sync with
  // App.tsx's libraryCloudAssetsLoading state. The parent fires the
  // initial load on page-nav; this handles subsequent tab toggles.
  useEffect(() => {
    if (tab === 'assets' || tab === 'documents') {
      onReloadCloudAssets?.();
    }
  }, [tab, onReloadCloudAssets]);

  // Unified item list for Assets tab — excludes office documents, those
  // live on the Documents tab to match what the user expects.
  const assetItems = useMemo(() => {
    const list: UnifiedItem[] = [];
    // Local-first creative gallery is the primary source. Voice/music/sfx are
    // hidden — Creative Studio no longer produces audio, so only image + video.
    for (const a of localCreative) {
      const k = cloudAssetKind(a);
      if (['image', 'video', 'graphic'].includes(k)) {
        list.push({ ...unifyCloudAsset(a), source: 'local' });
      }
    }
    // Plus image/video files scanned from the open workspace.
    for (const img of images) {
      const k = localFileKind(img);
      if (['image', 'video'].includes(k)) list.push(unifyLocalImage(img, projectRoot));
    }
    return typeFilter === 'all'
      ? list
      : list.filter(i => i.kind === typeFilter || (typeFilter === 'image' && i.kind === 'graphic'));
  }, [localCreative, images, projectRoot, typeFilter]);

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

  return (
    <div className="w-full">
      {/* Header — mirrors IDE LibraryPage at DashboardPages.tsx:8266-8295.
          No top-level Refresh button (IDE doesn't have one — refresh is
          handled by the kind-specific sub-views). */}
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold text-[#cdd6f4]">{t('dash.library.title')}</h1>
        <p className="mt-0.5 text-xs text-[#9b8caa]">
          {t('library.subtitle_made')}
        </p>
      </div>

      {/* Top-level tabs — canonical Tasks tab language (underline active state,
          accent tracks the theme). No counts (IDE doesn't show them). */}
      <div className={`mb-6 ${tabBar}`}>
        {([
          { key: 'papers',    label: t('library.tab.papers') },
          { key: 'assets',    label: t('library.tab.assets') },
          { key: 'documents', label: t('library.tab.documents') },
        ] as const).map(tb => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={tabClass(tab === tb.key)}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'papers' && (
        <LibraryPapers
          papersByTab={papersByTab}
          papersTabLoading={papersTabLoading}
          searchResults={paperSearchResults}
          searchLoading={paperSearchLoading}
          searchQuery={paperSearchQuery}
          onLoadTab={onLoadPapers}
          onSearch={onSearchPapers}
          onClearSearch={onClearPaperSearch}
          onReadWithAva={onReadPaperWithAva}
          paperDetail={paperDetail}
          paperDetailLoading={paperDetailLoading}
          onLoadPaperDetail={onLoadPaperDetail}
          onClearPaperDetail={onClearPaperDetail}
        />
      )}

      {tab === 'assets' && (
        <div>
          {/* Sub-filters: source + type — match house tab style (underlined
              bottom border, accent colour on active). Smaller text than the
              top-level tabs so hierarchy stays clear: primary nav ≠ filter. */}
          <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-[var(--border-card)]">
            <div className="flex items-center gap-1">
              <span className="mr-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)] self-end pb-2">{t('library.filter.type')}</span>
              {(['all', 'image', 'video'] as AssetTypeFilter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setTypeFilter(f)}
                  className={`px-2.5 py-2 text-[11px] font-medium border-b-2 transition ${
                    typeFilter === f
                      ? 'border-[var(--accent)] text-[var(--accent)]'
                      : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {f === 'all' ? t('dash.library.all') : f === 'image' ? t('library.kind.image') : t('library.kind.video')}
                </button>
              ))}
            </div>
            <div className="ml-auto mb-1 flex items-center gap-2">
              <ViewToggle mode={viewMode} onChange={setViewMode} />
              <button
                onClick={() => post({ type: 'open_creative_folder' })}
                title={t('library.open_save_folder.title')}
                className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 transition"
              >
                {t('library.open_save_folder')}
              </button>
            </div>
          </div>

          {/* Inline loading pill — non-blocking. Stays visible while
              the host is still pulling cloud assets so the user knows
              an incomplete-looking grid is mid-fetch, not broken.
              Disappears when the response arrives or after the 15s
              safety timeout in App.tsx. */}
          {cloudAssetsLoading && (
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--border-card)] bg-[var(--bg-card)] px-3 py-1.5 text-[11px] text-[var(--text-secondary)]">
              <span className="ava-library-spinner" aria-hidden />
              {t('library.pulling_cloud_assets')}
              <style>{`
                .ava-library-spinner {
                  width: 11px; height: 11px; border-radius: 50%;
                  border: 1.5px solid color-mix(in srgb, var(--accent) 25%, transparent);
                  border-top-color: var(--accent);
                  animation: avaLibSpin 0.85s linear infinite;
                  display: inline-block;
                }
                @keyframes avaLibSpin { to { transform: rotate(360deg); } }
              `}</style>
            </div>
          )}

          {/* Empty state — shown only when nothing is loaded AND
              nothing is in flight. While loading, the pill above carries
              the visual weight; we don't want to flash "No assets yet"
              for a fraction of a second before thumbnails appear. */}
          {assetItems.length === 0 && !cloudAssetsLoading && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-12 text-center">
              <div className="text-4xl mb-3">{hasImagesFolder ? '\u{1F3A8}' : '\u{1F4C1}'}</div>
              <p className="text-sm font-medium text-[var(--text-primary)]">{t('library.no_assets')}</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {t('library.no_assets_hint')}
              </p>
            </div>
          )}

          {/* Skeleton grid while the first cloud-asset fetch is in
              flight and nothing has arrived yet — keeps the page's
              shape instead of an empty void under the pill. */}
          {assetItems.length === 0 && cloudAssetsLoading && (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} height={120} radius={12} />
              ))}
            </div>
          )}

          {assetItems.length > 0 && (
            viewMode === 'grid' ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                {assetItems.map(item => (
                  <AssetCard key={item.id} item={item} selected={selected?.id === item.id} onSelect={() => setSelected(selected?.id === item.id ? null : item)} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {assetItems.map(item => (
                  <AssetRow key={item.id} item={item} selected={selected?.id === item.id} onSelect={() => setSelected(selected?.id === item.id ? null : item)} />
                ))}
              </div>
            )
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
                <span className="mr-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)] self-end pb-2">{t('library.filter.source')}</span>
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
                    {s === 'all' ? t('dash.library.all') : s === 'cloud' ? t('library.source.cloud') : t('library.source.local')}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <span className="mr-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)] self-end pb-2">{t('library.filter.type')}</span>
                {(['all', 'document', 'spreadsheet'] as DocTypeFilter[]).map(dt => (
                  <button
                    key={dt}
                    onClick={() => setDocType(dt)}
                    className={`px-2.5 py-2 text-[11px] font-medium border-b-2 transition ${
                      docType === dt
                        ? 'border-[var(--accent)] text-[var(--accent)]'
                        : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    {dt === 'all' ? t('dash.library.all') : dt === 'document' ? t('library.filter.documents') : t('library.filter.spreadsheets')}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-1 flex items-center gap-2">
              <ViewToggle mode={viewMode} onChange={setViewMode} />
              <button
                onClick={() => setNewDocOpen(true)}
                className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 transition"
              >
                {t('library.new_document_plus')}
              </button>
            </div>
          </div>

          {/* Same non-blocking pill as the Assets tab — cloud documents
              ride the same /creative-assets fetch so the loading state
              applies here too. */}
          {cloudAssetsLoading && (
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--border-card)] bg-[var(--bg-card)] px-3 py-1.5 text-[11px] text-[var(--text-secondary)]">
              <span className="ava-library-spinner" aria-hidden />
              {t('library.pulling_cloud_documents')}
            </div>
          )}

          {documentItems.length === 0 && !cloudAssetsLoading ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-12 text-center">
              <div className="text-4xl mb-3">{'\u{1F4C4}'}</div>
              <p className="text-sm font-medium text-[var(--text-primary)]">{t('library.no_documents')}</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {t('library.no_documents_hint_pre')} <span className="font-medium text-[var(--accent)]">{t('library.new_document_plus')}</span> {t('library.no_documents_hint_post')}
              </p>
            </div>
          ) : documentItems.length > 0 ? (
            viewMode === 'grid' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {documentItems.map(item => (
                  <AssetCard key={item.id} item={item} selected={selected?.id === item.id} onSelect={() => setSelected(selected?.id === item.id ? null : item)} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {documentItems.map(item => (
                  <AssetRow key={item.id} item={item} selected={selected?.id === item.id} onSelect={() => setSelected(selected?.id === item.id ? null : item)} />
                ))}
              </div>
            )
          ) : cloudAssetsLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} height={132} radius={12} />
              ))}
            </div>
          ) : null}
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

  // Playback source — cloud assets use their public URL; local files
  // prefer the host's webviewUri (vscode-webview-resource://) which
  // streams from disk so video plays at any size. Falls back to the
  // legacy dataUri for in-flight messages from older hosts. Webview CSP
  // allows vscode-webview-resource:, data:, https:, blob: for media-src.
  const localRaw = isLocal ? (item.raw as LibraryImage) : undefined;
  const localPlaybackUrl = localRaw?.webviewUri || localRaw?.dataUri;
  const mediaSrc: string | undefined = isLocal ? localPlaybackUrl : cloudUrl ?? undefined;

  const handleOpen = () => {
    // Local-only path. Cloud items don't expose a browser-open action —
    // previewing in-modal and Download are the user-facing flows; the
    // raw Supabase storage URL is infrastructure the user should never
    // see unless they explicitly choose Copy URL.
    if (!isLocal || !localPath) return;
    if (isOfficeDoc) post({ type: 'open_external', path: localPath });
    else if (isImage) post({ type: 'open_library_image', path: localPath });
    else post({ type: 'open_external', path: localPath });
    onClose();
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
      // Host-side silent download — no browser, no URL prompt, no
      // infrastructure leakage. File lands in ~/Downloads and a VS Code
      // toast offers Reveal. Derive a filename from the storage path
      // so the saved file gets its original extension.
      let filename = item.title || 'download';
      try {
        const last = new URL(cloudUrl).pathname.split('/').pop();
        if (last && last.includes('.')) filename = last;
      } catch { /* malformed URL — fall back to title */ }
      post({ type: 'download_cloud_asset', url: cloudUrl, filename });
      onClose();
    }
  };

  const handleDelete = () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    if (isLocal && localPath) {
      post({ type: 'delete_library_image', path: localPath });
      onClose();
      return;
    }
    if (!isLocal) {
      const cloudId = (item.raw as CreativeAsset).id;
      if (cloudId) {
        post({ type: 'delete_cloud_asset', id: cloudId });
        onClose();
      }
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
          aria-label={t('library.close_preview')}
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
              {t('library.inline_playback_unavailable')}
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
              {isLocal ? <span className="inline-flex items-center gap-1"><Icon.local size={10} />local</span> : <span className="inline-flex items-center gap-1"><Icon.cloud size={10} />cloud</span>}
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

          {/* Actions
              Local: Open (LibreOffice for office docs / default viewer
                otherwise) · Reveal · Download · Delete
              Cloud: Download · Copy URL
                — no "Open in browser" — users get inline playback in
                the modal above for all media, and Download for keeping
                a copy. Raw Supabase URLs are only exposed via Copy URL
                when the user explicitly asks for them. */}
          <div className="mt-5 flex flex-wrap gap-2">
            {isLocal && (
              <button
                onClick={handleOpen}
                className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 transition"
              >
                {isOfficeDoc ? t('library.open_libreoffice') : t('dash.library.open')}
              </button>
            )}
            {isLocal && (
              <button
                onClick={handleReveal}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition"
              >
                {t('library.reveal')}
              </button>
            )}
            <button
              onClick={handleDownload}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                !isLocal
                  ? 'border border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20'
                  : 'border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              {t('library.download')}
            </button>
            {!isLocal && cloudUrl && (
              <button
                onClick={handleCopyUrl}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition"
              >
                {copied ? t('library.copied') : t('library.copy_url')}
              </button>
            )}
            <button
              onClick={handleDelete}
              className={`ml-auto rounded-lg px-3 py-1.5 text-xs font-medium transition border ${
                confirmDelete
                  ? 'border-red-500/60 bg-red-500/15 text-red-400 hover:bg-red-500/25'
                  : 'border-[var(--border)] text-[var(--text-muted)] hover:text-red-400 hover:border-red-500/40'
              }`}
            >
              {confirmDelete ? t('library.confirm_delete') : t('library.delete')}
            </button>
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
          aria-label={playing ? t('input.pause_aria') : t('library.play')}
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
            aria-label={t('library.fullscreen')}
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
// label/desc carry i18n keys; resolved with t() at render time so the
// modal re-localises when the user changes language. Format names that
// stay English everywhere (CSV / Markdown / PDF) keep literal labels.
const BLANK_FORMATS: { id: BlankFormat; labelKey: string; label: string; icon: string; ext: string }[] = [
  { id: 'docx', labelKey: 'library.format.word',  label: 'Word Document', icon: '\u{1F4C4}', ext: '.docx' },
  { id: 'xlsx', labelKey: 'library.format.spreadsheet', label: 'Spreadsheet', icon: '\u{1F4CA}', ext: '.xlsx' },
  { id: 'csv',  labelKey: '', label: 'CSV',            icon: '\u{1F4C8}', ext: '.csv'  },
  { id: 'md',   labelKey: '', label: 'Markdown',       icon: '\u{1F4DD}', ext: '.md'   },
  { id: 'pdf',  labelKey: '', label: 'PDF',            icon: '\u{1F4D1}', ext: '.pdf'  },
];

const TEMPLATES: { id: TemplateId; labelKey: string; descKey: string; icon: string }[] = [
  { id: 'proposal',      labelKey: 'library.template.proposal.label', descKey: 'library.template.proposal.desc', icon: '\u{1F4BC}' },
  { id: 'report',        labelKey: 'library.template.report.label',   descKey: 'library.template.report.desc',   icon: '\u{1F4C8}' },
  { id: 'invoice',       labelKey: 'library.template.invoice.label',  descKey: 'library.template.invoice.desc',  icon: '\u{1F9FE}' },
  { id: 'letter',        labelKey: 'library.template.letter.label',   descKey: 'library.template.letter.desc',   icon: '\u{2709}\u{FE0F}' },
  { id: 'meeting_notes', labelKey: 'library.template.meeting.label',  descKey: 'library.template.meeting.desc',  icon: '\u{1F5D2}\u{FE0F}' },
  { id: 'resume',        labelKey: 'library.template.resume.label',   descKey: 'library.template.resume.desc',   icon: '\u{1F465}' },
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
          aria-label={t('dash.library.close')}
        >
          ×
        </button>

        <h2 className="text-base font-semibold text-[var(--text-primary)] mb-1">{t('library.new_document')}</h2>
        <p className="text-xs text-[var(--text-muted)] mb-5">
          {t('library.new_document_note_pre')} <code className="font-mono text-[10px] px-1 rounded bg-[var(--bg-input)]">documents/</code> {t('library.new_document_note_post')}
        </p>

        <h3 className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium mb-2">{t('library.blank_file')}</h3>
        <div className="grid grid-cols-3 gap-2 mb-5">
          {BLANK_FORMATS.map(f => (
            <button
              key={f.id}
              onClick={() => createBlank(f.id)}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-[var(--border-card)] bg-[var(--bg-input)] p-3 text-center transition hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/5 cursor-pointer"
            >
              <span className="text-2xl">{f.icon}</span>
              <span className="text-[11px] font-medium text-[var(--text-primary)]">{f.labelKey ? t(f.labelKey) : f.label}</span>
              <span className="text-[9px] text-[var(--text-muted)]">{f.ext}</span>
            </button>
          ))}
        </div>

        <h3 className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium mb-2">{t('library.from_template')}</h3>
        <div className="grid grid-cols-2 gap-2">
          {TEMPLATES.map(tmpl => (
            <button
              key={tmpl.id}
              onClick={() => createTemplate(tmpl.id)}
              className="flex items-start gap-2.5 rounded-xl border border-[var(--border-card)] bg-[var(--bg-input)] p-3 text-left transition hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/5 cursor-pointer"
            >
              <span className="text-xl shrink-0">{tmpl.icon}</span>
              <div className="min-w-0">
                <span className="block text-[11px] font-medium text-[var(--text-primary)]">{t(tmpl.labelKey)}</span>
                <span className="block text-[10px] text-[var(--text-muted)] leading-snug">{t(tmpl.descKey)}</span>
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
            {item.source === 'cloud' ? <span className="inline-flex items-center gap-1"><Icon.cloud size={10} />cloud</span> : <span className="inline-flex items-center gap-1"><Icon.local size={10} />local</span>}
          </span>
          <span className="text-[9px] text-[var(--text-muted)]">
            {item.kind}
          </span>
        </div>
      </div>
    </button>
  );
}

/** List-view row — same item, horizontal layout. Mirrors the IDE Library's
 *  list mode: small thumbnail, title + kind, source badge on the right. */
function AssetRow({
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
      className={`group flex w-full items-center gap-3 rounded-lg border bg-[var(--bg-card)] p-2 text-left transition hover:border-[var(--accent)]/50 ${
        selected ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]/30' : 'border-[var(--border)]'
      }`}
    >
      {item.thumbnail ? (
        <img
          src={item.thumbnail}
          alt={item.title}
          className="h-10 w-10 flex-shrink-0 rounded object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded bg-[var(--text-muted)]/10 text-lg opacity-50">
          {ASSET_TYPE_ICONS[item.kind] || '\u{1F4C4}'}
        </div>
      )}
      <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-[var(--text-primary)]">{item.title}</p>
      <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium ${
        item.source === 'cloud'
          ? 'bg-[var(--accent)]/10 text-[var(--accent)]'
          : 'bg-[var(--text-muted)]/10 text-[var(--text-muted)]'
      }`}>
        {item.source === 'cloud' ? '☁ cloud' : '\u{1F4BE} local'}
      </span>
      <span className="flex-shrink-0 text-[9px] text-[var(--text-muted)]">{item.kind}</span>
    </button>
  );
}

/** Grid/list view switch — small segmented toggle. Shared by Assets +
 *  Documents tabs so the two surfaces stay consistent. */
function ViewToggle({
  mode,
  onChange,
}: {
  mode: 'grid' | 'list';
  onChange: (m: 'grid' | 'list') => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-[var(--border-card)] p-0.5">
      {(['grid', 'list'] as const).map(v => (
        <button
          key={v}
          onClick={() => onChange(v)}
          title={v === 'grid' ? 'Grid view' : 'List view'}
          className={`rounded-md px-2 py-1 text-[12px] leading-none transition ${
            mode === v
              ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
          }`}
        >
          {v === 'grid' ? <Icon.grid size={14} /> : <Icon.list size={14} />}
        </button>
      ))}
    </div>
  );
}
