import { useState } from 'react';

/**
 * Creative Studio output card — extension/webview equivalent of the IDE
 * version. Same chrome (image / video / audio playback + prompt + action
 * pills) and same behaviour (Copy / Download / Regenerate / Delete) but
 * webview-safe — no Tauri imports. Persistence is handled by the parent
 * (existing localStorage + host save/delete messages).
 *
 * Designed for a horizontally-scrolling gallery — fixed card width so a
 * row reads as a creative timeline rather than a stack of forms.
 */

export type GalleryMediumKind = 'image' | 'music' | 'voice' | 'sfx' | 'video';

export interface GalleryItem {
  id: string;
  kind: GalleryMediumKind;
  url: string;
  prompt: string;
  title: string;
  createdAt: string;
  /** True when the asset row exists locally (localStorage / disk). */
  local?: boolean;
  /** True when the asset row exists in cloud (creative_assets table). */
  cloud?: boolean;
}

const CARD_WIDTH = 280;

const cardStyle: React.CSSProperties = {
  flex: `0 0 ${CARD_WIDTH}px`,
  background: 'rgba(26, 16, 40, 0.6)',
  border: '1px solid rgba(168, 85, 247, 0.12)',
  borderRadius: 12,
  padding: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const pillBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 10px',
  borderRadius: 6,
  fontSize: 10,
  fontWeight: 500,
  cursor: 'pointer',
  border: '1px solid rgba(168, 85, 247, 0.2)',
  background: 'rgba(49, 34, 68, 0.5)',
  color: '#cdd6f4',
  fontFamily: 'inherit',
  transition: 'background 0.15s',
};

const dangerPillStyle: React.CSSProperties = {
  ...pillBase,
  border: '1px solid rgba(243, 139, 168, 0.2)',
  color: '#f38ba8',
};

/** Optional cross-tab "Send to" actions surfaced as extra pills on
 *  each card. Each entry's `action` is fired with the item — caller
 *  is expected to switch tab + pre-fill any fields it can derive
 *  (prompt, reference image, etc.). Empty array = no Send-to row. */
export interface SendToAction {
  label: string;
  action: (item: GalleryItem) => void;
}

interface OutputCardProps {
  item: GalleryItem;
  onRegenerate?: (item: GalleryItem) => void;
  onDelete?: (item: GalleryItem) => void;
  onSendTo?: SendToAction[];
}

export function CreativeOutputCard({ item, onRegenerate, onDelete, onSendTo }: OutputCardProps) {
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(item.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* clipboard unavailable */ }
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = item.url;
    a.download = `${item.kind}_${item.id}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDelete = () => {
    if (!onDelete) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    onDelete(item);
  };

  const date = item.createdAt ? new Date(item.createdAt) : null;
  const dateLabel = date ? date.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }) : '';

  const storageLabel = item.local && item.cloud ? 'both' : item.cloud ? 'cloud' : 'local';
  const storageColor = item.cloud ? '#60a5fa' : '#a6e3a1';

  return (
    <div style={cardStyle}>
      <MediumPreview item={item} />

      <div
        style={{
          fontSize: 11, color: '#a6adc8', lineHeight: 1.5,
          maxHeight: 60, overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
        }}
        title={item.prompt}
      >
        {item.prompt || '(no prompt)'}
      </div>

      <div style={{ fontSize: 10, color: '#585b70', display: 'flex', justifyContent: 'space-between' }}>
        <span>{dateLabel}</span>
        <span style={{
          fontSize: 9,
          padding: '1px 6px',
          borderRadius: 4,
          background: `${storageColor}26`,
          color: storageColor,
        }}>
          {storageLabel}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto' }}>
        <button
          onClick={handleCopy}
          style={pillBase}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(168,85,247,0.15)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(49, 34, 68, 0.5)'; }}
        >
          {copied ? '✓ Copied' : 'Copy prompt'}
        </button>
        <button
          onClick={handleDownload}
          style={pillBase}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(168,85,247,0.15)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(49, 34, 68, 0.5)'; }}
        >
          Download
        </button>
        {onRegenerate && (
          <button
            onClick={() => onRegenerate(item)}
            style={pillBase}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(168,85,247,0.15)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(49, 34, 68, 0.5)'; }}
          >
            Regenerate
          </button>
        )}
        {onDelete && (
          <button
            onClick={handleDelete}
            style={dangerPillStyle}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(243,139,168,0.15)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(49, 34, 68, 0.5)'; }}
          >
            {confirmDelete ? 'Click again to confirm' : 'Delete'}
          </button>
        )}
      </div>

      {/* Send-to row — second pill row for cross-tab hand-offs.
          Visually subordinate to the main action row (slightly muted
          accent border) so users read primary actions first. */}
      {onSendTo && onSendTo.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderTop: '1px solid rgba(168,85,247,0.08)', paddingTop: 8 }}>
          {onSendTo.map(act => (
            <button
              key={act.label}
              onClick={() => act.action(item)}
              style={{
                ...pillBase,
                border: '1px solid rgba(168, 85, 247, 0.35)',
                background: 'rgba(168, 85, 247, 0.08)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(168,85,247,0.22)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(168, 85, 247, 0.08)'; }}
            >
              → {act.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MediumPreview({ item }: { item: GalleryItem }) {
  if (item.kind === 'image') {
    return (
      <img
        src={item.url}
        alt={item.title || 'Generated image'}
        style={{
          width: '100%',
          aspectRatio: '1 / 1',
          objectFit: 'cover',
          borderRadius: 8,
          background: 'rgba(0,0,0,0.3)',
          display: 'block',
        }}
        loading="lazy"
      />
    );
  }
  if (item.kind === 'video') {
    return (
      <video
        src={item.url}
        controls
        style={{
          width: '100%',
          aspectRatio: '16 / 9',
          objectFit: 'cover',
          borderRadius: 8,
          background: 'rgba(0,0,0,0.5)',
          display: 'block',
        }}
        preload="metadata"
      />
    );
  }
  return (
    <div
      style={{
        width: '100%',
        aspectRatio: '4 / 1',
        borderRadius: 8,
        background: item.kind === 'voice'
          ? 'linear-gradient(135deg, #f9e2af20, #f9e2af40)'
          : item.kind === 'sfx'
            ? 'linear-gradient(135deg, #f38ba820, #f38ba840)'
            : 'linear-gradient(135deg, #89b4fa20, #89b4fa40)',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <div style={{
        fontSize: 9, fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: 1,
        color: item.kind === 'voice' ? '#f9e2af' : item.kind === 'sfx' ? '#f38ba8' : '#89b4fa',
      }}>
        {item.kind}
      </div>
      <audio src={item.url} controls style={{ width: '100%', height: 32 }} preload="metadata" />
    </div>
  );
}

interface GalleryStripProps {
  items: GalleryItem[];
  onRegenerate?: (item: GalleryItem) => void;
  onDelete?: (item: GalleryItem) => void;
  onSendTo?: SendToAction[];
  emptyHint?: string;
}

export function CreativeGalleryStrip({ items, onRegenerate, onDelete, onSendTo, emptyHint }: GalleryStripProps) {
  if (items.length === 0) {
    return (
      <div style={{
        background: 'rgba(26, 16, 40, 0.6)',
        border: '1px dashed rgba(168, 85, 247, 0.2)',
        borderRadius: 12,
        padding: '40px 20px',
        textAlign: 'center',
        color: '#585b70',
        fontSize: 13,
      }}>
        {emptyHint || 'Your generations will appear here. Make something — they stack up newest first.'}
      </div>
    );
  }
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        overflowX: 'auto',
        paddingBottom: 8,
        scrollSnapType: 'x proximity',
      }}
    >
      {items.map((item) => (
        <div key={item.id} style={{ scrollSnapAlign: 'start' }}>
          <CreativeOutputCard item={item} onRegenerate={onRegenerate} onDelete={onDelete} onSendTo={onSendTo} />
        </div>
      ))}
    </div>
  );
}
