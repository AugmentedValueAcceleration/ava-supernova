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

/** Map a local file's type to the unified asset-kind vocabulary. */
function localFileKind(img: LibraryImage): 'image' | 'document' | 'spreadsheet' {
  return img.fileType || 'image';
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
        if (localFileKind(img) === 'image') list.push(unifyLocalImage(img, projectRoot));
      }
    }
    return typeFilter === 'all'
      ? list
      : list.filter(i => i.kind === typeFilter || (typeFilter === 'image' && i.kind === 'graphic'));
  }, [cloudAssets, images, projectRoot, sourceFilter, typeFilter]);

  // Documents tab — office docs from both sources.
  const documentItems = useMemo(() => {
    const list: UnifiedItem[] = [];
    for (const a of cloudAssets) {
      const k = cloudAssetKind(a);
      if (['document', 'spreadsheet'].includes(k)) list.push(unifyCloudAsset(a));
    }
    for (const img of images) {
      const k = localFileKind(img);
      if (k === 'document' || k === 'spreadsheet') list.push(unifyLocalImage(img, projectRoot));
    }
    return list;
  }, [cloudAssets, images, projectRoot]);

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
          {/* Sub-filters: source + type */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-card)] p-0.5">
              {(['all', 'cloud', 'local'] as AssetSource[]).map(s => (
                <button
                  key={s}
                  onClick={() => setSourceFilter(s)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                    sourceFilter === s ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {s === 'all' ? 'All' : s === 'cloud' ? 'Cloud' : 'Local'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-card)] p-0.5">
              {(['all', 'image', 'music', 'video', 'voice'] as AssetTypeFilter[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                    typeFilter === t ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {t === 'all' ? 'All types' : t[0].toUpperCase() + t.slice(1)}
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
          {documentItems.length === 0 ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-12 text-center">
              <div className="text-4xl mb-3">{'\u{1F4C4}'}</div>
              <p className="text-sm font-medium text-[var(--text-primary)]">No documents yet</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Create documents from templates in Creative Studio, or ask Ava to write one for you.
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
