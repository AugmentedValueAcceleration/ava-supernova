import { useEffect, useMemo, useState } from 'react';
import { post } from '../App';
import { tt } from '../i18n';
import type { CreativeAsset } from '../types/messages';

// ─── Choose a kit's logo from the Library ──────────────────────────────────────
//
// Sits inside the brand kit drawer. Lists everything in the Library that is a
// picture. A piece of GIMP work is a folder, so each finished file in it gets
// its own tile: the Library's card for that work is only a contact sheet.
// Only finished files show: what's marked final, or the work's main image if
// nothing is yet. Show all files is there for the rest, not the default.

interface Choice { key: string; assetId: string; file?: string; title: string; url: string }

const isPicture = (url?: string | null) => !!url && /\.(png|jpe?g|webp|svg)$/i.test(url.split('?')[0]);

export function libraryChoices(assets: CreativeAsset[], everything = false): Choice[] {
  const out: Choice[] = [];
  for (const a of assets) {
    const title = a.title || 'Untitled';
    if (a.asset_type === 'gimp' && a.url && a.model?.files?.length) {
      const [path, query] = a.url.split('?');
      const base = path.slice(0, path.lastIndexOf('/') + 1);
      const finals = a.model.finals ?? [];
      const files = everything ? a.model.files : finals.length ? finals : a.model.files.filter((f) => !f.includes('/'));
      for (const file of files) {
        if (!/\.(png|jpe?g|webp)$/i.test(file) || file === 'preview.png') continue;
        const name = file.split('/').pop() as string;
        out.push({ key: `${a.id}:${file}`, assetId: a.id, file, title: `${title} · ${name}`, url: `${base}${file.split('/').map(encodeURIComponent).join('/')}${query ? `?${query}` : ''}` });
      }
    } else if (isPicture(a.url)) {
      out.push({ key: a.id, assetId: a.id, title, url: a.url as string });
    }
  }
  return out;
}

export function KitLibraryPicker({ onPick, onClose }: { onPick: (assetId: string, file?: string) => void; onClose: () => void }) {
  const [assets, setAssets] = useState<CreativeAsset[] | null>(null);
  const [search, setSearch] = useState('');
  const [everything, setEverything] = useState(false);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'local_creative_loaded') setAssets(e.data.assets as CreativeAsset[]);
    };
    window.addEventListener('message', onMessage);
    post({ type: 'load_local_creative' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const choices = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = libraryChoices(assets ?? [], everything);
    return q ? all.filter((c) => c.title.toLowerCase().includes(q)) : all;
  }, [assets, search, everything]);

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div className="w-full max-w-[420px] max-h-[80%] rounded-xl border border-[var(--border-card)] p-4 flex flex-col gap-3" style={{ background: 'rgba(17,12,26,0.99)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <h3 className="flex-1 text-[14px] text-[var(--text-primary)]">{tt('ext.studio.kit_from_library', 'Choose from your Library')}</h3>
          <button onClick={onClose} className="px-2.5 py-1 rounded-md text-[11px] border border-[var(--border-card)] text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]">
            {tt('library.cancel', 'Cancel')}
          </button>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tt('ext.studio.kit_library_search', 'Search your Library')}
          className="w-full bg-[rgba(255,255,255,0.03)] border border-[var(--border-card)] rounded px-2.5 py-1.5 text-[12.5px] text-[var(--text-primary)] outline-none"
        />
        <label className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)] cursor-pointer">
          <input type="checkbox" checked={everything} onChange={(e) => setEverything(e.target.checked)} />
          {tt('ext.studio.kit_library_all', 'Show all files, including tests and comparisons')}
        </label>
        <div className="min-h-[120px] flex-1 overflow-y-auto">
          {assets === null ? (
            <p className="py-8 text-center text-[12px] text-[var(--text-muted)]">{tt('dash.studio.model.loading', 'Loading…')}</p>
          ) : !choices.length ? (
            <p className="py-8 text-center text-[12px] text-[var(--text-muted)]">
              {search ? tt('ext.studio.kit_library_none', 'Nothing matches that.') : tt('ext.studio.kit_library_empty', 'No images in your Library yet.')}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {choices.map((c) => (
                <button
                  key={c.key}
                  title={c.title}
                  onClick={() => onPick(c.assetId, c.file)}
                  className="flex flex-col gap-1 rounded-lg border border-[var(--border-card)] p-1.5 text-left transition hover:border-[var(--accent)]/60 hover:bg-[var(--bg-hover)]"
                >
                  <img src={c.url} alt={c.title} loading="lazy" className="ava-checker w-full aspect-square rounded object-contain" />
                  <span className="truncate text-[10.5px] text-[var(--text-secondary)]">{c.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
