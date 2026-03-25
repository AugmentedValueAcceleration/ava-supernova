import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import PageHeader from '../components/PageHeader';
import { theme, pageStyle, cardStyle, inputStyle, primaryBtnStyle, ghostBtnStyle, chipStyle } from '../lib/theme';

/* ══════════════════════════════════════════════════════════════════════
   Library — Creative Assets Browser
   Augmented Value Acceleration Platform
   ══════════════════════════════════════════════════════════════════════ */

type AssetType = 'image' | 'content' | 'plan' | 'document';
type FilterTab = 'all' | AssetType;

interface CreativeAsset {
  id: string;
  title: string;
  type: string;
  asset_type: AssetType;
  source: string | null;
  url: string | null;
  prompt: string | null;
  content: string | null;
  thumbnail_url: string | null;
  created_at: string;
}

const TAB_OPTIONS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'image', label: 'Images' },
  { key: 'content', label: 'Content' },
  { key: 'plan', label: 'Plans' },
  { key: 'document', label: 'Documents' },
];

/* ── Asset type badge colours ────────────────────────────────────────── */
const typeChipColors: Record<AssetType, { bg: string; fg: string }> = {
  image:    { bg: theme.blueBg,   fg: theme.blue },
  content:  { bg: theme.tealBg,   fg: theme.teal },
  plan:     { bg: theme.yellowBg, fg: theme.yellow },
  document: { bg: theme.greenBg,  fg: theme.green },
};

/* ── Source badge colours ────────────────────────────────────────────── */
const sourceChipColors: Record<string, { bg: string; fg: string }> = {
  'Creative Studio':   { bg: theme.accentBg, fg: theme.accent },
  'Business Planning': { bg: theme.blueBg,   fg: theme.blue },
  'Support':           { bg: theme.greenBg,  fg: theme.green },
};

const defaultSourceChip = { bg: theme.accentBg, fg: theme.textMuted };

export default function Library() {
  const [assets, setAssets] = useState<CreativeAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const fetchAssets = async () => {
    setLoading(true);
    let query = supabase
      .from('creative_assets')
      .select('id, title, type, asset_type, source, url, prompt, content, thumbnail_url, created_at')
      .order('created_at', { ascending: false });

    if (filter !== 'all') query = query.eq('asset_type', filter);
    if (search.trim()) query = query.ilike('title', `%${search.trim()}%`);

    const { data } = await query;
    setAssets(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAssets(); }, [filter, search]);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    await supabase.from('creative_assets').delete().eq('id', id);
    setAssets(prev => prev.filter(a => a.id !== id));
    if (expandedId === id) setExpandedId(null);
    setDeleting(null);
  };

  const handleCopyUrl = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleDownload = (url: string, title: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = title || 'download';
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  /* ── Empty-asset filter ────────────────────────────────────────────── */
  const filtered = assets.filter(a => {
    const t = a.asset_type;
    if (t === 'image' && !a.thumbnail_url && !a.url) return false;
    if ((t === 'content' || t === 'plan' || t === 'document') && !a.content) return false;
    return true;
  });

  /* ── Helpers ───────────────────────────────────────────────────────── */
  const typeChip = (at: AssetType) => typeChipColors[at] || typeChipColors.content;
  const sourceChip = (src: string | null) => (src && sourceChipColors[src]) ? sourceChipColors[src] : defaultSourceChip;

  return (
    <div style={pageStyle}>
      <PageHeader title="Library" subtitle="Browse and manage creative assets" onRefresh={fetchAssets} />

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 4, background: theme.inputBg, borderRadius: theme.radiusSm, padding: 3 }}>
          {TAB_OPTIONS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: 'none',
                fontSize: 12,
                fontWeight: 400,
                cursor: 'pointer',
                background: filter === tab.key ? theme.accent : 'transparent',
                color: filter === tab.key ? '#fff' : theme.textSecondary,
                transition: 'all 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Search assets..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, maxWidth: 280 }}
        />
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ padding: '40px 0', textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: theme.textMuted }}>Loading...</div>
        </div>
      )}

      {/* Asset grid */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {filtered.map(asset => {
            const isExpanded = expandedId === asset.id;
            const tc = typeChip(asset.asset_type);
            const sc = sourceChip(asset.source);
            return (
              <div key={asset.id} style={{ gridColumn: isExpanded ? '1 / -1' : undefined }}>
                {/* Card */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : asset.id)}
                  style={{
                    ...cardStyle,
                    padding: '16px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    overflow: 'hidden',
                  }}
                  onMouseOver={e => { if (!isExpanded) e.currentTarget.style.background = theme.accentBg; }}
                  onMouseOut={e => { if (!isExpanded) e.currentTarget.style.background = theme.cardBg; }}
                >
                  {!isExpanded ? (
                    /* ── Compact card ───────────────────────────────────────── */
                    <>
                      {/* Thumbnail — only for images with actual URLs */}
                      {asset.asset_type === 'image' && (asset.thumbnail_url || asset.url) && (
                        <div style={{
                          width: '100%',
                          height: 150,
                          borderRadius: theme.radiusSm,
                          overflow: 'hidden',
                          marginBottom: 10,
                        }}>
                          <img
                            src={asset.thumbnail_url || asset.url || ''}
                            alt={asset.title}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        </div>
                      )}
                      {/* Text preview for content / plan / document assets */}
                      {asset.asset_type !== 'image' && asset.content && (
                        <div style={{
                          fontSize: 12, color: theme.textSecondary, lineHeight: 1.5,
                          marginBottom: 8, maxHeight: 56, overflow: 'hidden', fontWeight: 300,
                        }}>
                          {asset.content.slice(0, 150)}{asset.content.length > 150 ? '...' : ''}
                        </div>
                      )}

                      {/* Info */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 13, fontWeight: 400, color: theme.text,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            {asset.title || 'Untitled'}
                          </div>
                          <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2, fontWeight: 300 }}>
                            {formatDate(asset.created_at)}
                          </div>
                          {/* Source badge */}
                          {asset.source && (
                            <span style={{
                              ...chipStyle(sc.bg, sc.fg),
                              fontSize: 10,
                              padding: '2px 8px',
                              marginTop: 4,
                              fontWeight: 400,
                            }}>
                              {asset.source}
                            </span>
                          )}
                        </div>
                        <span style={chipStyle(tc.bg, tc.fg)}>
                          {asset.asset_type}
                        </span>
                      </div>
                    </>
                  ) : (
                    /* ── Expanded detail view ──────────────────────────────── */
                    <div>
                      <div style={{ display: 'flex', gap: 24 }}>
                        {/* Preview */}
                        <div style={{ flex: '0 0 400px' }}>
                          {asset.asset_type === 'image' && asset.url ? (
                            <img
                              src={asset.url}
                              alt={asset.title}
                              style={{
                                width: '100%',
                                maxHeight: 400,
                                objectFit: 'contain',
                                borderRadius: theme.radiusSm,
                                background: theme.inputBg,
                              }}
                            />
                          ) : (
                            <div style={{
                              padding: 20,
                              background: theme.inputBg,
                              borderRadius: theme.radiusSm,
                              fontSize: 13,
                              color: theme.textSecondary,
                              lineHeight: 1.6,
                              maxHeight: 400,
                              overflowY: 'auto',
                              whiteSpace: 'pre-wrap',
                              fontWeight: 300,
                            }}>
                              {asset.content || 'No content'}
                            </div>
                          )}
                        </div>

                        {/* Details */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                            <h2 style={{ fontSize: 16, fontWeight: 400, color: theme.text, margin: 0 }}>
                              {asset.title || 'Untitled'}
                            </h2>
                            <span style={chipStyle(tc.bg, tc.fg)}>
                              {asset.asset_type}
                            </span>
                          </div>

                          <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 6, fontWeight: 300 }}>
                            Created {formatDate(asset.created_at)}
                          </div>

                          {/* Source badge — expanded view */}
                          {asset.source && (
                            <div style={{ marginBottom: 16 }}>
                              <span style={{
                                ...chipStyle(sc.bg, sc.fg),
                                fontSize: 10,
                                padding: '2px 8px',
                                fontWeight: 400,
                              }}>
                                {asset.source}
                              </span>
                            </div>
                          )}

                          {/* Prompt */}
                          {asset.prompt && (
                            <div style={{ marginBottom: 20 }}>
                              <div style={{ fontSize: 10, fontWeight: 400, letterSpacing: '1px', textTransform: 'uppercase' as const, color: theme.textMuted, marginBottom: 6 }}>
                                PROMPT
                              </div>
                              <div style={{
                                padding: 14,
                                background: theme.inputBg,
                                borderRadius: theme.radiusSm,
                                fontSize: 12,
                                color: theme.textSecondary,
                                lineHeight: 1.6,
                                whiteSpace: 'pre-wrap',
                                fontWeight: 300,
                              }}>
                                {asset.prompt}
                              </div>
                            </div>
                          )}

                          {/* Actions */}
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {asset.url && (
                              <>
                                <button
                                  onClick={e => { e.stopPropagation(); handleDownload(asset.url!, asset.title); }}
                                  style={primaryBtnStyle}
                                  onMouseOver={e => { e.currentTarget.style.background = theme.accentHover; }}
                                  onMouseOut={e => { e.currentTarget.style.background = theme.accent; }}
                                >
                                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                                      <polyline points="7 10 12 15 17 10" />
                                      <line x1="12" y1="15" x2="12" y2="3" />
                                    </svg>
                                    Download
                                  </span>
                                </button>

                                <button
                                  onClick={e => { e.stopPropagation(); handleCopyUrl(asset.url!, asset.id); }}
                                  style={ghostBtnStyle}
                                  onMouseOver={e => { e.currentTarget.style.background = theme.hoverBg; }}
                                  onMouseOut={e => { e.currentTarget.style.background = theme.inputBg; }}
                                >
                                  {copied === asset.id ? 'Copied!' : 'Copy URL'}
                                </button>
                              </>
                            )}

                            <button
                              onClick={e => { e.stopPropagation(); handleDelete(asset.id); }}
                              disabled={deleting === asset.id}
                              style={{
                                ...ghostBtnStyle,
                                color: theme.red,
                                opacity: deleting === asset.id ? 0.5 : 1,
                              }}
                              onMouseOver={e => { e.currentTarget.style.background = theme.redBg; }}
                              onMouseOut={e => { e.currentTarget.style.background = theme.inputBg; }}
                            >
                              {deleting === asset.id ? 'Deleting...' : 'Delete'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
