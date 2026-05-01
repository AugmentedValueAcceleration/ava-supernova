import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react';
import { useLocale } from '../i18n';
import { post } from '../App';
import type { AccountInfo } from '../types/messages';
import {
  FolderOpen, Image as ImageIcon, MusicNotes, Microphone, VideoCamera,
  FileText, GridFour, Table, FilePdf,
  FileDoc, FileXls, FileCsv, FileMd,
  Briefcase, ChartLineUp, Receipt, EnvelopeSimple, NotePencil, IdentificationCard,
} from '@phosphor-icons/react';
import {
  CreativeGalleryStrip, type GalleryItem, type GalleryMediumKind,
} from '../components/CreativeOutputCard';

// Exact credit count with locale-grouped digits — operator wants
// the precise number, not "5K" / "1.2M" rounded buckets, so they can
// see exactly how many credits a generation actually cost.
function formatTokens(n: number): string {
  return n.toLocaleString();
}

const TAB_ICONS: Record<string, ReactNode> = {
  library: <FolderOpen weight="duotone" size={16} />,
  images: <ImageIcon weight="duotone" size={16} />,
  audio: <MusicNotes weight="duotone" size={16} />,
  voice: <Microphone weight="duotone" size={16} />,
  video: <VideoCamera weight="duotone" size={16} />,
  documents: <FileText weight="duotone" size={16} />,
};

// Creative Studio is a pure creation surface — no library tab. Browsing
// generated assets lives in the top-level Library page which rolls up
// cloud assets, courses, and documents into a single navigable view.
// Tabs mirror IDE CreativeStudioPage at DashboardPages.tsx:13798. Documents
// removed — document creation lives in the top-level Library page now.
const TABS = [
  { key: 'images', label: 'Images' },
  { key: 'audio', label: 'Audio' },
  { key: 'voice', label: 'Voice' },
  { key: 'video', label: 'Video' },
];

const VOICES = [
  { id: 'Calm_Woman', label: 'Calm Woman' },
  { id: 'Wise_Woman', label: 'Wise Woman' },
  { id: 'Friendly_Person', label: 'Friendly' },
  { id: 'Inspirational_girl', label: 'Inspirational' },
  { id: 'Deep_Voice_Man', label: 'Deep Voice' },
  { id: 'Calm_Man', label: 'Calm Man' },
  { id: 'Newsman', label: 'Newscaster' },
  { id: 'Lively_Girl', label: 'Lively' },
  { id: 'Patient_Man', label: 'Patient' },
  { id: 'Determined_Man', label: 'Determined' },
];

/* ── Preset registries ─────────────────────────────────────────────────
 * Style / mood / emotion / camera presets are appended to the user's
 * raw prompt at submit time. They are never the ONLY input — the user
 * still drives intent — but they shape the generator's output without
 * the user having to know the right adjectives. Auto = no append.
 *
 * Keep these short. The model has more taste than we do; the goal is
 * to nudge, not over-specify. Anything longer than one sentence per
 * preset is over-engineering. */

const IMAGE_STYLES: { id: string; label: string; suffix: string }[] = [
  { id: 'auto',         label: 'Auto',         suffix: '' },
  { id: 'cinematic',    label: 'Cinematic',    suffix: ', cinematic lighting, anamorphic lens, film grain, professional colour grade' },
  { id: 'photoreal',    label: 'Photoreal',    suffix: ', photorealistic, 50mm lens, natural lighting, sharp focus, high detail' },
  { id: 'illustration', label: 'Illustration', suffix: ', digital illustration, vibrant colours, clean linework, painterly shading' },
  { id: 'anime',        label: 'Anime',        suffix: ', anime style, expressive features, soft pastels, detailed background' },
  { id: 'watercolour',  label: 'Watercolour',  suffix: ', watercolour painting, soft edges, paper texture, washed pigments' },
  { id: 'graphic',      label: 'Graphic',      suffix: ', vector art, flat colours, bold shapes, modern poster aesthetic' },
];

const MUSIC_MOODS: { id: string; label: string; suffix: string }[] = [
  { id: 'auto',       label: 'Auto',       suffix: '' },
  { id: 'cinematic',  label: 'Cinematic',  suffix: ', cinematic orchestral score, sweeping strings, epic build' },
  { id: 'lofi',       label: 'Lo-fi',      suffix: ', lo-fi hip hop, mellow drums, vinyl crackle, warm bass' },
  { id: 'synthwave',  label: 'Synthwave',  suffix: ', 80s synthwave, analogue synths, gated reverb drums, neon mood' },
  { id: 'orchestral', label: 'Orchestral', suffix: ', full orchestral arrangement, lush strings, brass, timpani' },
  { id: 'ambient',    label: 'Ambient',    suffix: ', ambient pads, drones, ethereal textures, no percussion' },
  { id: 'trailer',    label: 'Trailer',    suffix: ', movie trailer score, hybrid orchestral, big drums, tension build' },
];

const VOICE_EMOTIONS: { id: string; label: string }[] = [
  { id: 'neutral',  label: 'Neutral'   },
  { id: 'calm',     label: 'Calm'      },
  { id: 'excited',  label: 'Excited'   },
  { id: 'serious',  label: 'Serious'   },
  { id: 'playful',  label: 'Playful'   },
  { id: 'whisper',  label: 'Whispered' },
];

const VIDEO_CAMERAS: { id: string; label: string; suffix: string }[] = [
  { id: 'auto',   label: 'Auto',   suffix: '' },
  { id: 'static', label: 'Static', suffix: ', static camera, locked-off shot' },
  { id: 'pan',    label: 'Pan',    suffix: ', slow horizontal camera pan' },
  { id: 'zoom',   label: 'Zoom',   suffix: ', gentle zoom in on subject' },
  { id: 'dolly',  label: 'Dolly',  suffix: ', dolly forward, smooth tracking shot' },
  { id: 'orbit',  label: 'Orbit',  suffix: ', orbital camera move around subject' },
];

const VIDEO_MOTION: { id: 'subtle' | 'dynamic' | 'wild'; label: string; suffix: string }[] = [
  { id: 'subtle',  label: 'Subtle',  suffix: ', minimal motion, gentle movement' },
  { id: 'dynamic', label: 'Dynamic', suffix: ', dynamic motion, energetic action' },
  { id: 'wild',    label: 'Wild',    suffix: ', explosive motion, high-energy action' },
];

/* ── Cost estimates (credits per generation) ───────────────────────────
 * Anchored to the platform's credit math at the time of writing. The
 * cost preview is illustrative — the server is the source of truth and
 * the actual credit charge lands on the next account refresh. Values
 * tuned to be slightly conservative so users aren't surprised by a
 * higher charge. */
const CREDITS = {
  image:   50,        // Wan T2I, single variation
  music:   200,       // MiniMax music-01, baseline
  voicePerHundredChars: 12, // ~12 credits per 100 chars
  voiceMin: 24,       // floor for short utterances
  video6s: 2000,
  video10s: 3500,
};

/** Build the cost-preview pill content for the active tab + its
 *  current settings. Returns the integer credit estimate plus a short
 *  human label for the cost-breakdown line. */
function estimateImageCredits(variations: number): number {
  return CREDITS.image * Math.max(1, variations);
}
function estimateMusicCredits(durationSec: number): number {
  // Baseline 200 credits for 30s, scales linearly.
  return Math.round(CREDITS.music * (durationSec / 30));
}
function estimateVoiceCredits(textLen: number): number {
  return Math.max(CREDITS.voiceMin, Math.ceil(textLen / 100) * CREDITS.voicePerHundredChars);
}
function estimateVideoCredits(durationSec: number): number {
  return durationSec === 10 ? CREDITS.video10s : CREDITS.video6s;
}

type LibraryFilter = 'all' | 'images' | 'music' | 'video' | 'voice' | 'documents' | 'spreadsheets';

const FILTER_ICONS: Record<string, ReactNode> = {
  all: <GridFour weight="duotone" size={16} />,
  images: <ImageIcon weight="duotone" size={16} />,
  music: <MusicNotes weight="duotone" size={16} />,
  video: <VideoCamera weight="duotone" size={16} />,
  voice: <Microphone weight="duotone" size={16} />,
  documents: <FileText weight="duotone" size={16} />,
  spreadsheets: <Table weight="duotone" size={16} />,
};

const LIBRARY_FILTERS: { key: LibraryFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'images', label: 'Images' },
  { key: 'music', label: 'Music' },
  { key: 'video', label: 'Video' },
  { key: 'voice', label: 'Voice' },
  { key: 'documents', label: 'Documents' },
  { key: 'spreadsheets', label: 'Spreadsheets' },
];

/* ── Auth helpers ──────────────────────────────────────────────────── */

const PLATFORM_URL = 'https://ava-supernova.com/api';

function getAuthHeaders(): Record<string, string> {
  const key = (window as any).__avaPlatformKey || '';
  return {
    'Content-Type': 'application/json',
    ...(key ? { Authorization: `Bearer ${key}` } : {}),
  };
}

function hasAuth(): boolean {
  return !!(window as any).__avaPlatformKey;
}

/* ── Asset type helpers ────────────────────────────────────────────── */

function typeIcon(type: string): string {
  if (['image', 'graphic'].includes(type)) return '\uD83D\uDDBC\uFE0F';
  if (type === 'music') return '\uD83C\uDFB5';
  if (type === 'video') return '\uD83C\uDFAC';
  if (type === 'voice') return '\uD83C\uDF99\uFE0F';
  if (['document', 'content'].includes(type)) return '\uD83D\uDCC4';
  if (type === 'spreadsheet') return '\uD83D\uDCCA';
  return '\uD83D\uDCC1';
}

/** Config for rendering a non-media asset card (docs, spreadsheets).
 * Mirrors the Documents tab colour scheme so file type is readable at a
 * glance. Keeps all media-less previews consistent in shape. */
function docCardConfig(asset: { asset_type?: string; type?: string; path?: string; title?: string; name?: string }): {
  label: string;
  accent: string;
  icon: ReactNode;
} | null {
  const ext = (asset.path || asset.title || asset.name || '').split('.').pop()?.toLowerCase() || '';
  const type = (asset.asset_type || asset.type || '').toLowerCase();

  if (ext === 'docx' || ext === 'doc') return { label: 'Word Document', accent: '#60a5fa', icon: <FileDoc weight="duotone" size={56} /> };
  if (ext === 'xlsx' || ext === 'xls') return { label: 'Spreadsheet', accent: '#4ade80', icon: <FileXls weight="duotone" size={56} /> };
  if (ext === 'csv') return { label: 'CSV', accent: '#a78bfa', icon: <FileCsv weight="duotone" size={56} /> };
  if (ext === 'md') return { label: 'Markdown', accent: '#f472b6', icon: <FileMd weight="duotone" size={56} /> };
  if (ext === 'pdf') return { label: 'PDF Document', accent: '#f87171', icon: <FilePdf weight="duotone" size={56} /> };
  if (type === 'spreadsheet') return { label: 'Spreadsheet', accent: '#4ade80', icon: <FileXls weight="duotone" size={56} /> };
  if (['document', 'content'].includes(type)) return { label: 'Document', accent: '#60a5fa', icon: <FileDoc weight="duotone" size={56} /> };
  return null;
}

/* ── Custom Video Player ──────────────────────────────────────────── */

function VideoPlayer({ src, hideFullscreen }: { src: string; hideFullscreen?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;

  // Capture first frame as thumbnail
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const capture = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          setThumbnail(canvas.toDataURL('image/jpeg', 0.8));
        }
      } catch { /* cross-origin or not ready */ }
    };
    video.addEventListener('loadeddata', () => {
      // Seek to 0.1s to get a good frame (avoids black first frame)
      video.currentTime = 0.1;
    });
    video.addEventListener('seeked', capture, { once: true });
  }, [src]);

  const toggle = () => {
    if (!videoRef.current) return;
    if (playing) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setPlaying(!playing);
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    videoRef.current.currentTime = pct * duration;
  };

  const toggleFullscreen = () => {
    setIsExpanded(prev => !prev);
  };

  // Close expanded view on Escape key
  useEffect(() => {
    if (!isExpanded) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsExpanded(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isExpanded]);

  // Auto-hide controls during playback
  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setShowControls(true);
    if (playing) {
      hideTimer.current = setTimeout(() => setShowControls(false), 3000);
    }
  }, [playing]);

  useEffect(() => { scheduleHide(); }, [playing, scheduleHide]);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden bg-black group cursor-pointer ${
        isExpanded
          ? 'fixed inset-0 z-[9999] rounded-none flex items-center justify-center'
          : 'rounded-lg'
      }`}
      onMouseMove={scheduleHide}
      onMouseLeave={() => playing && setShowControls(false)}
      onClick={toggle}
    >
      <video
        ref={videoRef}
        src={src}
        preload="metadata"
        className={isExpanded ? 'max-w-full max-h-full block' : 'w-full block'}
        poster={thumbnail || undefined}
        onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
        onTimeUpdate={() => setProgress(videoRef.current?.currentTime || 0)}
        onEnded={() => { setPlaying(false); setShowControls(true); }}
        onPlay={() => setPlaying(true)}
        onPause={() => { setPlaying(false); setShowControls(true); }}
      />

      {/* Play overlay — shows when paused */}
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)]/80 text-white backdrop-blur-sm transition hover:bg-[var(--accent)]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        </div>
      )}

      {/* Bottom controls bar */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2.5 pt-8 transition-opacity duration-200 ${showControls ? 'opacity-100' : 'opacity-0'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Progress bar */}
        <div
          className="h-1.5 cursor-pointer overflow-hidden rounded-full bg-white/15 mb-2"
          onClick={seek}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-purple-400 transition-[width] duration-100"
            style={{ width: `${duration ? (progress / duration) * 100 : 0}%` }}
          />
        </div>

        {/* Time + controls */}
        <div className="flex items-center justify-between text-[10px] text-white/70">
          <div className="flex items-center gap-3">
            <button
              onClick={toggle}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white border-none cursor-pointer hover:bg-white/20 transition"
            >
              {playing ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              )}
            </button>
            <span>{fmt(progress)} / {fmt(duration)}</span>
          </div>
          {!hideFullscreen && <button
            onClick={toggleFullscreen}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white border-none cursor-pointer hover:bg-white/20 transition"
            title={isExpanded ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
          >
            {isExpanded ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 14h6v6m10-10h-6V4m0 6l7-7M3 21l7-7"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/>
              </svg>
            )}
          </button>}
        </div>
      </div>
    </div>
  );
}

/* ── Custom Audio Player ──────────────────────────────────────────── */

function AudioPlayer({ src }: { src: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = () => {
    if (!ref.current) return;
    if (playing) ref.current.pause();
    else ref.current.play();
    setPlaying(!playing);
  };

  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    ref.current.currentTime = pct * duration;
  };

  return (
    <div className="flex items-center gap-3 rounded-lg bg-[var(--bg-input)] border border-[var(--border-card)] p-3">
      <audio
        ref={ref}
        src={src}
        preload="metadata"
        onLoadedMetadata={() => setDuration(ref.current?.duration || 0)}
        onTimeUpdate={() => setProgress(ref.current?.currentTime || 0)}
        onEnded={() => setPlaying(false)}
      />
      <button
        onClick={toggle}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/15 text-[var(--accent)] transition hover:bg-[var(--accent)]/25"
      >
        {playing ? '\u23F8' : '\u25B6'}
      </button>
      <div className="flex flex-1 flex-col gap-1">
        <div
          className="h-1.5 cursor-pointer overflow-hidden rounded-full bg-[var(--accent)]/10"
          onClick={seek}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-purple-400 transition-[width] duration-100"
            style={{ width: `${duration ? (progress / duration) * 100 : 0}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-[var(--text-muted)]">
          <span>{fmt(progress)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>
    </div>
  );
}

/* ── Generator-card primitives ─────────────────────────────────────────
 * The Images / Audio / Voice / Video tabs share a card-based form
 * layout. These primitives keep each tab's JSX flat and readable —
 * the alternative was 200 lines of repeated rounded-xl border
 * className blobs per tab. Each card has a ten-pixel uppercase
 * label, an optional hint on the right, and a child slot for the
 * actual control.
 */

function FieldCard({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-3">
      <div className="mb-1.5 flex items-baseline justify-between">
        <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{label}</label>
        {hint && <span className="text-[9px] text-[var(--text-muted)]">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function PromptCard({ label, value, onChange, placeholder, rows }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  rows: number;
}) {
  return (
    <FieldCard label={label}>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full resize-y rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
      />
    </FieldCard>
  );
}

function PresetCard({ label, presets, value, onChange }: {
  label: string;
  presets: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <FieldCard label={label}>
      <div className="flex flex-wrap gap-1">
        {presets.map(p => (
          <button
            key={p.id}
            onClick={() => onChange(p.id)}
            className={`rounded-md px-2.5 py-1 text-[10px] font-medium transition border-none cursor-pointer ${
              value === p.id
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </FieldCard>
  );
}

function ReferenceCard({ label, hint, value, onChange }: {
  label: string;
  hint?: string;
  value: { name: string; dataUrl: string } | null;
  onChange: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <FieldCard label={label} hint={hint}>
      {value ? (
        <div className="flex items-center gap-2">
          <img src={value.dataUrl} alt={value.name} className="h-12 w-12 rounded-md object-cover border border-[var(--border-card)]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] text-[var(--text-primary)]">{value.name}</p>
            <button
              onClick={() => onChange(null)}
              className="text-[10px] text-[var(--text-muted)] hover:text-red-400 transition cursor-pointer bg-transparent border-none p-0"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full rounded-lg border border-dashed border-[var(--border-card)] bg-[var(--bg-input)]/50 py-3 text-[11px] text-[var(--text-muted)] hover:border-[var(--accent)]/50 hover:text-[var(--text-secondary)] transition cursor-pointer"
        >
          + Upload reference
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) onChange(file);
          e.target.value = ''; // allow re-uploading the same file
        }}
      />
    </FieldCard>
  );
}

function CostPreviewPill({ credits, note }: { credits: number; note?: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)]/40 px-3 py-2 text-[11px]">
      <span className="text-[var(--text-muted)]">Estimated cost{note ? ` · ${note}` : ''}</span>
      <span className="font-semibold text-[var(--accent)]">{credits.toLocaleString()} cr</span>
    </div>
  );
}

/* ── localStorage helpers for library ─────────────────────────────── */

function loadLocalAssets(): any[] {
  try {
    const raw = localStorage.getItem('ava-creative-assets');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalAsset(type: string, url: string, title: string, prompt: string) {
  // Always save to localStorage (Creative Studio's local store)
  const assets = loadLocalAssets();
  const id = `${type}_${Date.now()}`;
  assets.unshift({
    id,
    type,
    asset_type: type,
    title,
    prompt,
    url,
    created_at: new Date().toISOString(),
  });
  try {
    localStorage.setItem('ava-creative-assets', JSON.stringify(assets));
  } catch { /* quota */ }

  // When Local or Both mode is active, also save the file to disk
  const dataMode = localStorage.getItem('ava-data-mode') || 'local';
  if (dataMode === 'local' || dataMode === 'both') {
    const extMap: Record<string, string> = { image: 'png', music: 'mp3', voice: 'mp3', video: 'mp4' };
    const dirMap: Record<string, string> = { image: 'images', music: '.ava/creative/audio', voice: '.ava/creative/voice', video: '.ava/creative/video' };
    const ext = extMap[type] || 'bin';
    const dir = dirMap[type] || '.ava/creative';
    const safeName = title.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '-').toLowerCase().slice(0, 60) || 'untitled';
    const filename = `${dir}/${safeName}.${ext}`;
    // Send to extension host to download the URL and save to disk
    post({ type: 'save_creative_to_disk', url, filename, assetType: type, prompt } as any);
  }

  // Notify any open gallery views to refresh their derived state.
  window.dispatchEvent(new CustomEvent('ava-creative-assets-updated'));
}

function deleteLocalAsset(id: string) {
  const assets = loadLocalAssets().filter((a: any) => a.id !== id);
  try {
    localStorage.setItem('ava-creative-assets', JSON.stringify(assets));
  } catch { /* quota */ }
  window.dispatchEvent(new CustomEvent('ava-creative-assets-updated'));
}

/* ══════════════════════════════════════════════════════════════════════
   Creative Studio
   ══════════════════════════════════════════════════════════════════════ */

export function CreativeStudio({ account }: { account?: AccountInfo | null }) {
  useLocale();

  const usage = account?.usage;
  // Unified total — free + subscription + top-ups. Backend still burns
  // free pool first then overflows, but users only see the combined
  // number here.
  const totalUsed = (usage?.free_credits_used || 0) + (usage?.credits_used || 0);
  const totalLimit = (usage?.free_credits_limit || 0) + (usage?.credits_limit || 0);
  const tokensRemaining = Math.max(0, totalLimit - totalUsed);
  const remainPct = totalLimit > 0 ? Math.min((tokensRemaining / totalLimit) * 100, 100) : 0;

  // API helper: send request through extension host (avoids CORS)
  const pendingResolve = useRef<((data: any) => void) | null>(null);
  const pendingReject = useRef<((err: string) => void) | null>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.type === 'creative_result') {
        if (msg.success && pendingResolve.current) {
          pendingResolve.current(msg.data);
        } else if (!msg.success && pendingReject.current) {
          pendingReject.current(msg.error || 'Generation failed');
        }
        pendingResolve.current = null;
        pendingReject.current = null;
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const apiCall = useCallback(async (endpoint: string, body: Record<string, unknown>): Promise<any> => {
    const result = await new Promise((resolve, reject) => {
      pendingResolve.current = resolve;
      pendingReject.current = reject;
      post({ type: 'creative_generate', endpoint, body } as any);
    });
    // Refresh account to update token balance after generation
    post({ type: 'refresh_account' } as any);
    return result;
  }, []);

  // Default to Images. Any stale 'library' value from localStorage (prior
  // default) gets normalised below — the tab is gone from this surface
  // entirely now that the top-level Library page owns asset browsing.
  const [activeTab, setActiveTab] = useState<string>(() => {
    try {
      const stored = localStorage.getItem('ava-creative-studio-tab');
      if (stored && TABS.some(t => t.key === stored)) return stored;
    } catch { /* ignore storage access failures */ }
    return 'images';
  });
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Images
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageSize, setImageSize] = useState<string>('1280*1280');
  const [imageStyle, setImageStyle] = useState<string>('auto');
  const [imageNegative, setImageNegative] = useState('');
  const [imageVariations, setImageVariations] = useState<1 | 2 | 4>(1);
  const [imageReference, setImageReference] = useState<{ name: string; dataUrl: string } | null>(null);

  // Audio
  const [musicPrompt, setMusicPrompt] = useState('');
  const [musicLyrics, setMusicLyrics] = useState('');
  const [musicMood, setMusicMood] = useState<string>('auto');
  const [musicDuration, setMusicDuration] = useState<30 | 60 | 90 | 120>(60);

  // Voice — when avaVoice is true, voiceId is locked to MiniMax's
  // English_radiant_girl per the brand identity. Toggle off to pick a
  // character voice from the list. Two flags rather than a sentinel
  // value so the picker can default to a sensible non-Ava voice when
  // unlocked without losing the user's last selection.
  const [voiceText, setVoiceText] = useState('');
  const [voiceId, setVoiceId] = useState('Calm_Woman');
  const [avaVoice, setAvaVoice] = useState(false);
  const [voiceSpeed, setVoiceSpeed] = useState(1.0);
  const [voicePitch, setVoicePitch] = useState(0); // -12..+12 semitones
  const [voiceEmotion, setVoiceEmotion] = useState<string>('neutral');

  // Video
  const [videoPrompt, setVideoPrompt] = useState('');
  const [videoDuration, setVideoDuration] = useState<6 | 10>(6);
  const [videoCamera, setVideoCamera] = useState<string>('auto');
  const [videoMotion, setVideoMotion] = useState<'subtle' | 'dynamic' | 'wild'>('dynamic');
  const [videoReference, setVideoReference] = useState<{ name: string; dataUrl: string } | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Per-medium gallery state — derived from localStorage assets via
  // loadLocalAssets() (already used for the Library tab) plus cloud
  // assets when data-mode includes cloud. Refreshes on data-mode change.
  // Replaces the single-slot lastX state — the gallery's first item IS
  // the most recent generation, displayed at the front of the strip.
  const [galleryRefresh, setGalleryRefresh] = useState(0);
  // Cloud assets are not yet merged into the gallery in this surface —
  // wired via the existing `load_cloud_assets` flow on the Library tab,
  // separate state. Leaving an empty array here keeps the merge logic
  // intact so when we wire the cloud broadcast through, the gallery
  // picks up new entries without further refactor.
  const cloudAssets: any[] = [];
  const MEDIA_KINDS = ['image','music','voice','sfx','video'] as const;
  const allGalleryItems = useMemo(() => {
    const local = loadLocalAssets();
    const seen = new Set<string>();
    const merged: GalleryItem[] = [];
    for (const a of [...local, ...cloudAssets]) {
      const id = a.id || `${a.type || a.asset_type}_${a.created_at}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const kind = (a.type || a.asset_type || '').toLowerCase();
      // Skip documents / text / anything that isn't a recognised media
      // kind. Previously these got relabelled as 'image' via fallback,
      // which is why .docx files leaked into the Images strip. Library
      // is the canonical surface for documents — they don't belong here.
      if (!(MEDIA_KINDS as readonly string[]).includes(kind)) continue;
      // No fabricated createdAt — items without one are already foreign
      // to the per-session view and shouldn't earn a NOW timestamp that
      // makes them survive the session filter. Fall through with empty.
      merged.push({
        id,
        kind: kind as GalleryMediumKind,
        url: a.url || '',
        prompt: a.prompt || '',
        title: a.title || '',
        createdAt: a.created_at || '',
        local: !!a.local || local.some((l: any) => l.id === id),
        cloud: cloudAssets.some(c => c.id === id),
      });
    }
    merged.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return merged;
    // galleryRefresh forces re-derive when localStorage changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudAssets, galleryRefresh]);

  // Session start — anchors the per-medium views to "things made this
  // session". Library is the canonical archive surface; Creative Studio
  // is for creation only. Older items live in Library, not here. Captured
  // once on mount so reload = empty right panel; new generations stack.
  const sessionStart = useMemo(() => new Date().toISOString(), []);
  const isSessionItem = useCallback(
    (i: GalleryItem) => (i.createdAt || '') >= sessionStart,
    [sessionStart],
  );

  // Per-medium filtered views — current session only. After generation,
  // items appear here AND save to Library; the strip on this page is
  // the "you just made this" trail, not a mini-archive.
  const imageItems = useMemo(() => allGalleryItems.filter(i => i.kind === 'image' && isSessionItem(i)), [allGalleryItems, isSessionItem]);
  const musicItems = useMemo(() => allGalleryItems.filter(i => i.kind === 'music' && isSessionItem(i)), [allGalleryItems, isSessionItem]);
  const voiceItems = useMemo(() => allGalleryItems.filter(i => i.kind === 'voice' && isSessionItem(i)), [allGalleryItems, isSessionItem]);
  const videoItems = useMemo(() => allGalleryItems.filter(i => i.kind === 'video' && isSessionItem(i)), [allGalleryItems, isSessionItem]);

  // Refresh handler — called after every save / delete to re-read
  // localStorage. Cheap; localStorage is in-memory.
  const refreshGallery = useCallback(() => setGalleryRefresh(t => t + 1), []);

  // Subscribe to local-asset and cloud-asset update events from the
  // existing infrastructure. The existing CustomEvent already fires on
  // saveLocalAsset; we just need to listen.
  useEffect(() => {
    const onLocalChange = () => refreshGallery();
    window.addEventListener('ava-creative-assets-updated', onLocalChange);
    return () => window.removeEventListener('ava-creative-assets-updated', onLocalChange);
  }, [refreshGallery]);

  // Library
  const [libraryAssets, setLibraryAssets] = useState<any[]>([]);
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>('all');
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [librarySource, setLibrarySource] = useState<'local' | 'cloud'>('local');

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clear error on tab switch
  useEffect(() => { setError(null); }, [activeTab]);

  // Elapsed timer for video generation
  useEffect(() => {
    if (generating && activeTab === 'video') {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(p => p + 1), 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setElapsed(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [generating, activeTab]);

  // Load library assets when switching to library tab or changing source
  useEffect(() => {
    if (activeTab !== 'library') return;
    setLibraryLoading(true);
    setLibraryAssets([]);
    if (librarySource === 'local') {
      setLibraryAssets(loadLocalAssets());
      setLibraryLoading(false);
    } else if (hasAuth()) {
      fetch(`${PLATFORM_URL}/library`, { headers: getAuthHeaders() })
        .then(r => r.json())
        .then(data => {
          const list = Array.isArray(data) ? data : (data?.files || data?.assets || data?.items || []);
          setLibraryAssets(list);
        })
        .catch(() => setLibraryAssets([]))
        .finally(() => setLibraryLoading(false));
    } else {
      setLibraryLoading(false);
    }
  }, [activeTab, librarySource]);

  // Re-read local assets when App.tsx fires the bus event after the host
  // writes a new asset (e.g. Documents tab file creation). Without this the
  // library tab only refreshes on tab switch, so the new file would be
  // invisible until the user clicks away and back.
  useEffect(() => {
    if (librarySource !== 'local') return;
    const refresh = () => setLibraryAssets(loadLocalAssets());
    window.addEventListener('ava-creative-assets-updated', refresh);
    return () => window.removeEventListener('ava-creative-assets-updated', refresh);
  }, [librarySource]);

  /* ── Prompt composition ───────────────────────────────────────────── */
  // Compose the final prompt sent to the server: user prompt + style/mood
  // suffix (when not 'auto'). Suffixes are short fragments registered
  // above. Negative prompt is plumbed separately to the server.

  const composeImagePrompt = useCallback(() => {
    const style = IMAGE_STYLES.find(s => s.id === imageStyle);
    return imagePrompt.trim() + (style?.suffix ?? '');
  }, [imagePrompt, imageStyle]);

  const composeMusicPrompt = useCallback(() => {
    const mood = MUSIC_MOODS.find(m => m.id === musicMood);
    return musicPrompt.trim() + (mood?.suffix ?? '');
  }, [musicPrompt, musicMood]);

  const composeVideoPrompt = useCallback(() => {
    const cam = VIDEO_CAMERAS.find(c => c.id === videoCamera);
    const mot = VIDEO_MOTION.find(m => m.id === videoMotion);
    return videoPrompt.trim() + (cam?.suffix ?? '') + (mot?.suffix ?? '');
  }, [videoPrompt, videoCamera, videoMotion]);

  /* ── Image generation ─────────────────────────────────────────────── */

  const handleGenerateImage = async () => {
    if (!imagePrompt.trim() || generating) return;
    setGenerating(true); setError(null);
    try {
      // No model field → server defaults to Wan (DashScope wan2.6-t2i).
      // Wan handles vector / graphic-design output materially better than
      // MiniMax image-01 — the previous default — which renders every
      // prompt as soft painterly illustration.
      // Variations: fire N parallel calls so the user sees a small
      // batch land at once. Server doesn't have a native batch endpoint
      // so we parallelise client-side; when one fails the others still
      // surface, which beats all-or-nothing batching.
      const finalPrompt = composeImagePrompt();
      const negative = imageNegative.trim() || undefined;
      const reference = imageReference?.dataUrl;
      const calls = Array.from({ length: imageVariations }).map(() =>
        apiCall('generate-image', {
          prompt: finalPrompt,
          size: imageSize,
          negative_prompt: negative,
          reference_image: reference,
        }).then(data => {
          if (data?.url) saveLocalAsset('image', data.url, imagePrompt.slice(0, 60), imagePrompt);
          else throw new Error(data?.error || 'No image URL returned');
        }),
      );
      const results = await Promise.allSettled(calls);
      const failures = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];
      if (failures.length === results.length) {
        const first = failures[0]?.reason;
        throw new Error(first?.message || first || 'Generation failed');
      }
    } catch (e: any) { setError(e.message || e); }
    setGenerating(false);
  };

  /* ── Music generation ─────────────────────────────────────────────── */

  const handleGenerateMusic = async () => {
    if (!musicPrompt.trim() || generating) return;
    setGenerating(true); setError(null);
    try {
      const data = await apiCall('generate-music', {
        prompt: composeMusicPrompt(),
        lyrics: musicLyrics.trim() || undefined,
        duration: musicDuration,
      });
      if (data.url) {
        saveLocalAsset('music', data.url, musicPrompt.slice(0, 60), musicPrompt);
      } else throw new Error(data.error || 'No audio URL returned');
    } catch (e: any) { setError(e.message || e); }
    setGenerating(false);
  };

  /* ── Voice generation ─────────────────────────────────────────────── */

  const handleGenerateVoice = async () => {
    if (!voiceText.trim() || generating) return;
    setGenerating(true); setError(null);
    try {
      // Brand identity: Ava narrates in MiniMax's English_radiant_girl
      // unconditionally. The avaVoice toggle hard-locks the voice id —
      // user can't override even by editing voiceId. See feedback memory
      // project_ava_voice_identity.md.
      const effectiveVoice = avaVoice ? 'English_radiant_girl' : voiceId;
      const data = await apiCall('generate-voice', {
        text: voiceText.trim(),
        voice_id: effectiveVoice,
        speed: voiceSpeed,
        pitch: voicePitch,
        emotion: voiceEmotion,
      });
      if (data.url) {
        saveLocalAsset('voice', data.url, voiceText.slice(0, 60), voiceText);
      } else throw new Error(data.error || 'No voice URL returned');
    } catch (e: any) { setError(e.message || e); }
    setGenerating(false);
  };

  /* ── Video generation ─────────────────────────────────────────────── */

  const handleGenerateVideo = async () => {
    if (!videoPrompt.trim() || generating) return;
    setGenerating(true); setError(null);
    try {
      const data = await apiCall('generate-video', {
        prompt: composeVideoPrompt(),
        duration: videoDuration,
        reference_image: videoReference?.dataUrl,
      });
      if (data.url) {
        saveLocalAsset('video', data.url, videoPrompt.slice(0, 60), videoPrompt);
      } else throw new Error(data.error || 'No video URL returned');
    } catch (e: any) {
      setError(e.message || 'Video generation failed');
    }
    setGenerating(false);
  };

  /* ── Cross-tab "Send to" ──────────────────────────────────────────── */
  // When the user clicks an action on a session item (or the gallery
  // strip's onSendTo callback fires), we switch tab + pre-fill prompt
  // and reference where applicable. The whole point of unifying these
  // four modes is so the user doesn't have to copy-paste between them.

  const sendImageToVideo = useCallback((item: GalleryItem) => {
    setActiveTab('video');
    setVideoPrompt(item.prompt || '');
    if (item.url) {
      setVideoReference({ name: 'reference.png', dataUrl: item.url });
    }
  }, []);

  const sendImageToVoice = useCallback((item: GalleryItem) => {
    setActiveTab('voice');
    if (item.prompt) setVoiceText(item.prompt);
  }, []);

  const sendMusicToVideo = useCallback((item: GalleryItem) => {
    // Music doesn't pre-fill a video prompt cleanly — the user wants
    // the score on top of an existing or new video. Switch + nudge
    // the user with the music's prompt as scene context.
    setActiveTab('video');
    if (!videoPrompt.trim() && item.prompt) setVideoPrompt(item.prompt);
  }, [videoPrompt]);

  /* ── Reference image upload ───────────────────────────────────────── */

  const handleUploadReference = useCallback(
    (file: File, target: 'image' | 'video') => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        if (target === 'image') setImageReference({ name: file.name, dataUrl });
        else setVideoReference({ name: file.name, dataUrl });
      };
      reader.readAsDataURL(file);
    },
    [],
  );

  /* ── Library delete ───────────────────────────────────────────────── */

  const handleDeleteAsset = async (asset: any) => {
    if (librarySource === 'local') {
      deleteLocalAsset(asset.id);
      setLibraryAssets(prev => prev.filter(a => a.id !== asset.id));
    } else {
      try {
        await fetch(`${PLATFORM_URL}/library/${asset.id}`, {
          method: 'DELETE',
          headers: getAuthHeaders(),
        });
        setLibraryAssets(prev => prev.filter(a => a.id !== asset.id));
      } catch { /* ignore */ }
    }
    setSelectedAsset(null);
    setConfirmDelete(false);
  };

  /* ── Library filter ───────────────────────────────────────────────── */

  const filteredAssets = libraryFilter === 'all' ? libraryAssets : libraryAssets.filter((a: any) => {
    const aType = (a.asset_type || a.type || '').toLowerCase();
    const ext = (a.name || a.title || '').split('.').pop()?.toLowerCase() || '';
    if (libraryFilter === 'images') return ['image', 'graphic'].includes(aType) || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
    if (libraryFilter === 'music') return aType === 'music';
    if (libraryFilter === 'video') return aType === 'video' || ['mp4', 'webm', 'mov'].includes(ext);
    if (libraryFilter === 'voice') return aType === 'voice';
    if (libraryFilter === 'documents') return ['document', 'content'].includes(aType) || ['docx', 'pdf', 'md', 'txt', 'csv'].includes(ext);
    if (libraryFilter === 'spreadsheets') return aType === 'spreadsheet' || ['xlsx', 'xls'].includes(ext);
    return false;
  });

  /* ── Error box ────────────────────────────────────────────────────── */

  const errorBox = error ? (
    <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-xs text-red-400 leading-relaxed">
      {error}
    </div>
  ) : null;

  /* ══════════════════════════════════════════════════════════════════
     Render
     ══════════════════════════════════════════════════════════════════ */

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      {/* Header + Token Bar — mirrors IDE CreativeStudioPage at
          DashboardPages.tsx:13785-13793. */}
      <div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[22px] font-semibold text-[#cdd6f4]">Creative Studio</h1>
            <p className="mt-1.5 text-[13px] text-[#6c7086]">
              Images, music, voice, and video — every modality on tap, with style presets, references, and one-click hand-offs between them.
            </p>
          </div>
          {account?.usage && (
            <div className="w-48 shrink-0">
              <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] mb-1">
                <span>Tokens Remaining</span>
                <span>{formatTokens(tokensRemaining)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-[var(--bg-input)] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    remainPct < 10 ? 'bg-red-500' : remainPct < 30 ? 'bg-amber-500' : 'bg-[var(--accent)]'
                  }`}
                  style={{ width: `${remainPct}%` }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-[var(--text-muted)] mt-0.5">
                <span>{formatTokens(totalUsed)} used</span>
                <span>{formatTokens(totalLimit)} limit</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="mb-4 flex gap-1 border-b border-[var(--border-card)]">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition ${
              activeTab === tab.key
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            <span className="inline-flex items-center gap-1.5">{TAB_ICONS[tab.key]} {tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── Library tab (full width) ──────────────────────────────── */}
      {activeTab === 'library' && (
        <div className="space-y-4">
          {/* Source toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLibrarySource('local')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                librarySource === 'local'
                  ? 'bg-[var(--accent)]/20 text-white'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              Local
            </button>
            <button
              onClick={() => { if (hasAuth()) setLibrarySource('cloud'); }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                librarySource === 'cloud'
                  ? 'bg-[var(--accent)]/20 text-white'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              } ${!hasAuth() ? 'cursor-not-allowed opacity-30' : ''}`}
              title={hasAuth() ? 'Browse cloud assets' : 'Connect account to access cloud'}
            >
              Cloud
            </button>
            {!hasAuth() && (
              <span className="text-[9px] text-[var(--text-muted)]">Connect account for cloud</span>
            )}
          </div>

          {/* Filter pills */}
          <div className="flex flex-wrap gap-1">
            {LIBRARY_FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setLibraryFilter(f.key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  libraryFilter === f.key
                    ? 'bg-[var(--accent)]/20 text-white'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                <span className="inline-flex items-center gap-1.5">{FILTER_ICONS[f.key]} {f.label}</span>
              </button>
            ))}
          </div>

          <div className="text-[11px] text-[var(--text-muted)]">
            {filteredAssets.length} {libraryFilter === 'all' ? 'assets' : libraryFilter}
          </div>

          {/* Loading */}
          {libraryLoading && (
            <div className="py-8 text-center text-xs text-[var(--text-muted)]">Loading assets...</div>
          )}

          {/* Empty */}
          {!libraryLoading && filteredAssets.length === 0 && (
            <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-8 text-center">
              <div className="mb-2 text-3xl opacity-30">{'\u2728'}</div>
              <p className="text-sm text-[var(--text-muted)]">
                {libraryFilter === 'all'
                  ? 'No assets yet. Generate something from the other tabs!'
                  : `No ${libraryFilter} found.`}
              </p>
            </div>
          )}

          {/* Asset grid + detail */}
          {!libraryLoading && filteredAssets.length > 0 && (
            <div className="flex gap-4 min-h-0">
              {/* Grid */}
              <div className="flex-1 overflow-y-auto">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {filteredAssets.map((asset: any, i: number) => (
                    <button
                      key={asset.id || i}
                      onClick={() => setSelectedAsset(selectedAsset?.id === asset.id ? null : asset)}
                      className={`group rounded-xl border bg-[var(--bg-card)] p-2.5 text-left transition hover:border-[var(--accent)]/50 ${
                        selectedAsset?.id === asset.id
                          ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/30'
                          : 'border-[var(--border-card)]'
                      }`}
                    >
                      {['image', 'graphic'].includes(asset.asset_type || '') && (asset.thumbnail_url || asset.url) ? (
                        <img
                          src={asset.thumbnail_url || asset.url}
                          alt=""
                          className="mb-2 h-24 w-full rounded-lg object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="mb-2 flex h-24 w-full items-center justify-center rounded-lg bg-[var(--bg-input)] text-3xl opacity-40">
                          {typeIcon(asset.asset_type || asset.type || '')}
                        </div>
                      )}
                      <p className="truncate text-[10px] font-medium text-[var(--text-primary)]">
                        {asset.title || asset.name || 'Untitled'}
                      </p>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="rounded bg-[var(--accent)]/10 px-1.5 py-0.5 text-[8px] font-medium text-[var(--accent)]">
                          {asset.asset_type || asset.type || 'file'}
                        </span>
                        {asset.created_at && (
                          <span className="text-[8px] text-[var(--text-muted)]">
                            {new Date(asset.created_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview overlay */}
              {selectedAsset && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
                  onClick={() => { setSelectedAsset(null); setConfirmDelete(false); }}
                >
                  <div
                    className="relative w-full max-w-2xl mx-4 rounded-2xl border border-[var(--accent)]/20 bg-[var(--bg-card)] shadow-2xl overflow-hidden"
                    onClick={e => e.stopPropagation()}
                  >
                    {/* Close button */}
                    <button
                      onClick={() => { setSelectedAsset(null); setConfirmDelete(false); }}
                      className="absolute top-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/70 hover:text-white hover:bg-black/60 border-none cursor-pointer transition backdrop-blur-sm"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>

                    {(() => {
                      const docCfg = docCardConfig(selectedAsset);
                      const isImage = ['image', 'graphic'].includes(selectedAsset.asset_type || '') && selectedAsset.url;
                      const isAudio = ['music', 'voice', 'sfx'].includes(selectedAsset.asset_type || '') && selectedAsset.url;
                      const isVideo = selectedAsset.asset_type === 'video' && selectedAsset.url;
                      return (
                        <>
                          {/* Preview area */}
                          <div className={docCfg ? '' : 'bg-black/30'} style={docCfg ? { background: `linear-gradient(135deg, ${docCfg.accent}10 0%, ${docCfg.accent}04 100%)` } : undefined}>
                            {isImage ? (
                              <img src={selectedAsset.url} alt="" className="w-full max-h-[60vh] object-contain" />
                            ) : isAudio ? (
                              <div className="p-6">
                                <div className="flex items-center justify-center h-32 mb-4">
                                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--accent)]/15 text-[var(--accent)]">
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"/>
                                    </svg>
                                  </div>
                                </div>
                                <AudioPlayer src={selectedAsset.url} />
                              </div>
                            ) : isVideo ? (
                              <VideoPlayer src={selectedAsset.url} hideFullscreen />
                            ) : docCfg ? (
                              <div className="flex flex-col items-center justify-center py-12 px-6">
                                <div
                                  className="flex h-24 w-24 items-center justify-center rounded-2xl mb-5"
                                  style={{ background: `${docCfg.accent}18`, color: docCfg.accent, boxShadow: `0 0 0 1px ${docCfg.accent}22 inset` }}
                                >
                                  {docCfg.icon}
                                </div>
                                <div className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: docCfg.accent }}>
                                  {docCfg.label}
                                </div>
                                <div className="mt-1 text-sm font-medium text-white max-w-[90%] truncate text-center">
                                  {selectedAsset.title || selectedAsset.name || 'Untitled'}
                                </div>
                                {selectedAsset.path && (
                                  <div className="mt-2 text-[10px] text-[var(--text-muted)] font-mono max-w-[90%] truncate">
                                    {selectedAsset.path}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="flex h-48 items-center justify-center text-5xl opacity-20">
                                {typeIcon(selectedAsset.asset_type || selectedAsset.type || '')}
                              </div>
                            )}
                          </div>

                          {/* Info + actions */}
                          <div className="p-5">
                            {/* Only show title block when not already shown by the doc card */}
                            {!docCfg && (
                              <h3 className="text-sm font-semibold text-white mb-1">
                                {selectedAsset.title || selectedAsset.name || 'Untitled'}
                              </h3>
                            )}

                            {selectedAsset.prompt && (
                              <p className="text-[11px] leading-relaxed text-[var(--text-secondary)] mb-2">
                                {selectedAsset.prompt}
                              </p>
                            )}

                            <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)] mb-4">
                              <span className="capitalize">{selectedAsset.asset_type || selectedAsset.type}</span>
                              {selectedAsset.created_at && (
                                <>
                                  <span className="opacity-30">&middot;</span>
                                  <span>{new Date(selectedAsset.created_at).toLocaleDateString()}</span>
                                </>
                              )}
                            </div>

                            {/* Actions — grid so icon buttons line up evenly on all asset types */}
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                              {selectedAsset.path && (
                                <button
                                  onClick={() => post({ type: 'open_external', path: selectedAsset.path } as any)}
                                  title="Opens LibreOffice / OpenOffice when installed, falls back to the OS default"
                                  className="flex items-center justify-center gap-1.5 rounded-lg bg-[var(--accent)] py-2.5 px-3 text-xs font-medium text-white transition hover:opacity-90 border-none cursor-pointer"
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
                                  Open
                                </button>
                              )}
                              {selectedAsset.path && (
                                <button
                                  onClick={() => post({ type: 'reveal_in_explorer', path: selectedAsset.path } as any)}
                                  title="Show this file in your OS file browser"
                                  className="flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] py-2.5 px-3 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--accent)]/40 hover:text-white cursor-pointer"
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4h5l2 2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>
                                  Reveal
                                </button>
                              )}
                              {selectedAsset.path && (
                                <button
                                  onClick={() => post({ type: 'download_asset', path: selectedAsset.path } as any)}
                                  title="Save a copy to your Downloads folder"
                                  className="flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] py-2.5 px-3 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--accent)]/40 hover:text-white cursor-pointer"
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                  Download
                                </button>
                              )}
                              {!confirmDelete ? (
                                <button
                                  onClick={() => setConfirmDelete(true)}
                                  className="flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] py-2.5 px-3 text-xs font-medium text-[var(--text-secondary)] transition hover:border-red-400/50 hover:text-red-400 cursor-pointer"
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                                  Delete
                                </button>
                              ) : (
                                <div className="col-span-2 sm:col-span-1 flex gap-2">
                                  <button
                                    onClick={() => setConfirmDelete(false)}
                                    className="flex-1 rounded-lg border border-[var(--border-card)] py-2.5 text-xs text-[var(--text-secondary)] transition hover:text-white cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => handleDeleteAsset(selectedAsset)}
                                    className="flex-1 rounded-lg bg-red-500/20 py-2.5 text-xs font-medium text-red-400 transition hover:bg-red-500/30 border-none cursor-pointer"
                                  >
                                    Confirm
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Generation tabs (two-panel layout) ────────────────────── */
       /* Each tab gets the same skeleton — generator card on the left,
        * canvas on the right — but the generator's controls are
        * mode-specific. Style/mood/emotion presets sit at the top of
        * the form, just under the prompt, so taste-shaping is one click
        * not three.
        */}
      {activeTab !== 'library' && (
        <div className="flex gap-4 min-h-0">
          {/* LEFT: Generator card (~360px) */}
          <div className="w-[360px] shrink-0 space-y-3 overflow-y-auto pr-1">
            {/* ── Images generate ──────────────────────────────── */}
            {activeTab === 'images' && (
              <>
                <PromptCard label="Prompt" value={imagePrompt} onChange={setImagePrompt} placeholder="Describe the image — subject, scene, mood, framing." rows={4} />
                <PresetCard label="Style" presets={IMAGE_STYLES} value={imageStyle} onChange={setImageStyle} />
                <ReferenceCard label="Reference image" hint="Style + composition reference. Optional." value={imageReference} onChange={(f) => f ? handleUploadReference(f, 'image') : setImageReference(null)} />
                <FieldCard label="Size">
                  <div className="flex gap-1">
                    {([
                      { value: '1280*1280', label: 'Square 1:1' },
                      { value: '768*1280',  label: 'Portrait 3:4' },
                      { value: '1280*768',  label: 'Landscape 4:3' },
                    ] as const).map(s => (
                      <button
                        key={s.value}
                        onClick={() => setImageSize(s.value)}
                        className={`flex-1 rounded-lg py-1.5 text-[11px] font-medium transition border-none cursor-pointer ${
                          imageSize === s.value
                            ? 'bg-[var(--accent)] text-white'
                            : 'bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </FieldCard>
                <FieldCard label="Variations">
                  <div className="flex gap-1">
                    {[1, 2, 4].map(n => (
                      <button
                        key={n}
                        onClick={() => setImageVariations(n as 1 | 2 | 4)}
                        title={n === 1 ? 'Single image' : `Generate ${n} variations in parallel`}
                        className={`flex-1 rounded-lg py-1.5 text-[11px] font-medium transition border-none cursor-pointer ${
                          imageVariations === n
                            ? 'bg-[var(--accent)] text-white'
                            : 'bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                        }`}
                      >
                        {n === 1 ? '1 image' : `${n} variations`}
                      </button>
                    ))}
                  </div>
                </FieldCard>
                <FieldCard label="Negative prompt" hint="Things to avoid. Optional.">
                  <input
                    type="text"
                    value={imageNegative}
                    onChange={e => setImageNegative(e.target.value)}
                    placeholder="e.g. blurry, distorted, watermark"
                    className="w-full rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] px-3 py-2 text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
                  />
                </FieldCard>
                {errorBox}
                <CostPreviewPill credits={estimateImageCredits(imageVariations)} note={imageVariations > 1 ? `${imageVariations} × ${CREDITS.image} cr` : undefined} />
                <button
                  onClick={handleGenerateImage}
                  disabled={!imagePrompt.trim() || generating}
                  className="w-full rounded-lg bg-[var(--accent)] py-2.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 border-none cursor-pointer"
                >
                  {generating ? 'Generating…' : imageVariations > 1 ? `Generate ${imageVariations} variations` : 'Generate Image'}
                </button>
              </>
            )}

            {/* ── Audio generate ───────────────────────────────── */}
            {activeTab === 'audio' && (
              <>
                <PromptCard label="Prompt" value={musicPrompt} onChange={setMusicPrompt} placeholder="Describe the track — instruments, vibe, energy." rows={4} />
                <PresetCard label="Mood" presets={MUSIC_MOODS} value={musicMood} onChange={setMusicMood} />
                <FieldCard label="Duration">
                  <div className="flex gap-1">
                    {([30, 60, 90, 120] as const).map(d => (
                      <button
                        key={d}
                        onClick={() => setMusicDuration(d)}
                        className={`flex-1 rounded-lg py-1.5 text-[11px] font-medium transition border-none cursor-pointer ${
                          musicDuration === d
                            ? 'bg-[var(--accent)] text-white'
                            : 'bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                        }`}
                      >
                        {d}s
                      </button>
                    ))}
                  </div>
                </FieldCard>
                <FieldCard label="Lyrics" hint="Optional. Add for a vocal track.">
                  <textarea
                    value={musicLyrics}
                    onChange={e => setMusicLyrics(e.target.value)}
                    placeholder="Verse, chorus, bridge…"
                    rows={3}
                    className="w-full resize-y rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] px-3 py-2 text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
                  />
                </FieldCard>
                {errorBox}
                <CostPreviewPill credits={estimateMusicCredits(musicDuration)} note={`${musicDuration}s track`} />
                <button
                  onClick={handleGenerateMusic}
                  disabled={!musicPrompt.trim() || generating}
                  className="w-full rounded-lg bg-[var(--accent)] py-2.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 border-none cursor-pointer"
                >
                  {generating ? 'Composing…' : 'Generate Music'}
                </button>
              </>
            )}

            {/* ── Voice generate ───────────────────────────────── */}
            {activeTab === 'voice' && (
              <>
                <FieldCard label="Text" hint={`${voiceText.length} characters`}>
                  <textarea
                    value={voiceText}
                    onChange={e => setVoiceText(e.target.value)}
                    placeholder="What should it say?"
                    rows={5}
                    className="w-full resize-y rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] px-3 py-2 text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
                  />
                </FieldCard>
                <FieldCard label="Voice">
                  {/* Brand-correct voice lock. Ava narration is locked
                      to MiniMax's English_radiant_girl per the brand
                      identity — toggle off to pick a character voice. */}
                  <div className="space-y-2">
                    <button
                      onClick={() => setAvaVoice(v => !v)}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-[11px] font-medium transition border cursor-pointer ${
                        avaVoice
                          ? 'border-[var(--accent)]/50 bg-[var(--accent)]/15 text-[var(--accent)]'
                          : 'border-[var(--border-card)] bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-white'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className={`inline-block h-2 w-2 rounded-full ${avaVoice ? 'bg-[var(--accent)]' : 'bg-[var(--text-muted)]'}`} />
                        Ava's voice
                      </span>
                      <span className="text-[10px] opacity-70">{avaVoice ? 'Locked' : 'Pick a character voice'}</span>
                    </button>
                    {!avaVoice && (
                      <div className="flex flex-wrap gap-1">
                        {VOICES.map(v => (
                          <button
                            key={v.id}
                            onClick={() => setVoiceId(v.id)}
                            className={`rounded-md px-2.5 py-1 text-[10px] font-medium transition border-none cursor-pointer ${
                              voiceId === v.id
                                ? 'bg-[var(--accent)] text-white'
                                : 'bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                            }`}
                          >
                            {v.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </FieldCard>
                <FieldCard label="Emotion">
                  <div className="flex flex-wrap gap-1">
                    {VOICE_EMOTIONS.map(e => (
                      <button
                        key={e.id}
                        onClick={() => setVoiceEmotion(e.id)}
                        className={`rounded-md px-2.5 py-1 text-[10px] font-medium transition border-none cursor-pointer ${
                          voiceEmotion === e.id
                            ? 'bg-[var(--accent)] text-white'
                            : 'bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                        }`}
                      >
                        {e.label}
                      </button>
                    ))}
                  </div>
                </FieldCard>
                <FieldCard label="Speed">
                  <div className="flex gap-1">
                    {[0.8, 1.0, 1.2, 1.5].map(s => (
                      <button
                        key={s}
                        onClick={() => setVoiceSpeed(s)}
                        className={`flex-1 rounded-md py-1 text-[11px] font-medium transition border-none cursor-pointer ${
                          voiceSpeed === s
                            ? 'bg-[var(--accent)] text-white'
                            : 'bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                        }`}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                </FieldCard>
                <FieldCard label="Pitch" hint={`${voicePitch >= 0 ? '+' : ''}${voicePitch} semitones`}>
                  <input
                    type="range"
                    min={-12}
                    max={12}
                    step={1}
                    value={voicePitch}
                    onChange={e => setVoicePitch(Number(e.target.value))}
                    className="w-full accent-[var(--accent)]"
                  />
                </FieldCard>
                {errorBox}
                <CostPreviewPill credits={estimateVoiceCredits(voiceText.length)} note={`${voiceText.length} chars`} />
                <button
                  onClick={handleGenerateVoice}
                  disabled={!voiceText.trim() || generating}
                  className="w-full rounded-lg bg-[var(--accent)] py-2.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 border-none cursor-pointer"
                >
                  {generating ? 'Speaking…' : 'Generate Voice'}
                </button>
              </>
            )}

            {/* ── Video generate ───────────────────────────────── */}
            {activeTab === 'video' && (
              <>
                <PromptCard label="Prompt" value={videoPrompt} onChange={setVideoPrompt} placeholder="Describe the scene — subject, action, atmosphere." rows={4} />
                <ReferenceCard label="Reference image" hint="Image-to-video. Optional but recommended for control." value={videoReference} onChange={(f) => f ? handleUploadReference(f, 'video') : setVideoReference(null)} />
                <PresetCard label="Camera" presets={VIDEO_CAMERAS} value={videoCamera} onChange={setVideoCamera} />
                <FieldCard label="Motion intensity">
                  <div className="flex gap-1">
                    {VIDEO_MOTION.map(m => (
                      <button
                        key={m.id}
                        onClick={() => setVideoMotion(m.id)}
                        className={`flex-1 rounded-lg py-1.5 text-[11px] font-medium transition border-none cursor-pointer ${
                          videoMotion === m.id
                            ? 'bg-[var(--accent)] text-white'
                            : 'bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </FieldCard>
                <FieldCard label="Duration">
                  <div className="flex gap-1">
                    <button
                      onClick={() => setVideoDuration(6)}
                      className={`flex-1 rounded-lg py-1.5 text-[11px] font-medium transition border-none cursor-pointer ${
                        videoDuration === 6 ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                      }`}
                    >
                      6s · 1080P
                    </button>
                    <button
                      onClick={() => setVideoDuration(10)}
                      className={`flex-1 rounded-lg py-1.5 text-[11px] font-medium transition border-none cursor-pointer ${
                        videoDuration === 10 ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                      }`}
                    >
                      10s · 768P
                    </button>
                  </div>
                </FieldCard>
                {errorBox}
                {/* Video is the most expensive mode — make the cost
                    impossible to miss. Different visual treatment than
                    the other tabs' inline pill. */}
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-[11px] text-amber-200">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Estimated cost</span>
                    <span className="font-bold">{estimateVideoCredits(videoDuration).toLocaleString()} credits</span>
                  </div>
                  <p className="mt-1 text-[10px] text-amber-200/70 leading-relaxed">
                    Video is compute-intensive. Generation takes 2–4 minutes. Final charge from the server may differ slightly.
                  </p>
                </div>
                <button
                  onClick={handleGenerateVideo}
                  disabled={!videoPrompt.trim() || generating}
                  className="w-full rounded-lg bg-[var(--accent)] py-2.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 border-none cursor-pointer"
                >
                  {generating ? `Generating… ${elapsed}s` : 'Generate Video'}
                </button>
              </>
            )}
          </div>

          {/* RIGHT: Canvas + session reel */}
          <div className="flex-1 overflow-y-auto space-y-4">
            {/* In-flight indicator — replaces the empty void with a
                heartbeat while a generation is running. Different copy
                per tab so the user knows what's actually happening. */}
            {generating && (
              <div className="rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-6 text-center">
                <div className="mx-auto mb-3 h-8 w-8 rounded-full border-[2.5px] border-[rgba(168,85,247,0.18)] border-t-[var(--accent)] animate-spin" />
                <p className="text-[12px] font-medium text-[var(--text-primary)]">
                  {activeTab === 'images' && (imageVariations > 1 ? `Generating ${imageVariations} variations…` : 'Generating image…')}
                  {activeTab === 'audio' && 'Composing music…'}
                  {activeTab === 'voice' && 'Synthesising voice…'}
                  {activeTab === 'video' && `Rendering video… ${elapsed}s`}
                </p>
                <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                  {activeTab === 'video' ? 'Hang tight — this typically takes 2–4 minutes.' : 'Should be ready in moments.'}
                </p>
              </div>
            )}

            {/* Per-medium gallery strip — newest first. Cross-tab
                "Send to" actions live on each item so the user can
                animate a still, voice-over a scene, etc. without
                copy-pasting between tabs. */}
            {activeTab === 'images' && (
              <CreativeGalleryStrip
                items={imageItems}
                onRegenerate={(item) => setImagePrompt(item.prompt)}
                onDelete={(item) => {
                  deleteLocalAsset(item.id);
                  if (item.cloud) post({ type: 'delete_cloud_asset', id: item.id } as any);
                }}
                onSendTo={[
                  { label: 'Animate to video', action: sendImageToVideo },
                  { label: 'Voice-over from this', action: sendImageToVoice },
                ]}
                emptyHint="Generate an image — it'll appear here for this session, then live in your Library."
              />
            )}
            {activeTab === 'audio' && (
              <CreativeGalleryStrip
                items={musicItems}
                onRegenerate={(item) => setMusicPrompt(item.prompt)}
                onDelete={(item) => {
                  deleteLocalAsset(item.id);
                  if (item.cloud) post({ type: 'delete_cloud_asset', id: item.id } as any);
                }}
                onSendTo={[
                  { label: 'Use as score for video', action: sendMusicToVideo },
                ]}
                emptyHint="Generate music — it'll appear here for this session, then live in your Library."
              />
            )}
            {activeTab === 'voice' && (
              <CreativeGalleryStrip
                items={voiceItems}
                onRegenerate={(item) => setVoiceText(item.prompt)}
                onDelete={(item) => {
                  deleteLocalAsset(item.id);
                  if (item.cloud) post({ type: 'delete_cloud_asset', id: item.id } as any);
                }}
                emptyHint="Generate voice — it'll appear here for this session, then live in your Library."
              />
            )}
            {activeTab === 'video' && (
              <CreativeGalleryStrip
                items={videoItems}
                onRegenerate={(item) => setVideoPrompt(item.prompt)}
                onDelete={(item) => {
                  deleteLocalAsset(item.id);
                  if (item.cloud) post({ type: 'delete_cloud_asset', id: item.id } as any);
                }}
                emptyHint="Generate a video — it'll appear here for this session, then live in your Library."
              />
            )}
          </div>
        </div>
      )}

      {/* ── Documents tab ──────────────────────────────────────── */}
      {activeTab === 'documents' && (
        <div className="p-6">
          <h2 className="text-lg font-semibold text-white mb-2">Create a Document</h2>
          <p className="text-xs text-[var(--text-muted)] mb-6">
            Create blank files or use templates. Files save to your project's documents/ folder and appear in the Library.
          </p>

          {/* Blank file creation */}
          <div className="mb-8">
            <h3 className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium mb-3">New Blank File</h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { ext: 'docx', label: 'Word Document', icon: <FileDoc weight="duotone" size={24} />, color: '#60a5fa' },
                { ext: 'xlsx', label: 'Spreadsheet', icon: <FileXls weight="duotone" size={24} />, color: '#4ade80' },
                { ext: 'csv', label: 'CSV File', icon: <FileCsv weight="duotone" size={24} />, color: '#a78bfa' },
                { ext: 'md', label: 'Markdown', icon: <FileMd weight="duotone" size={24} />, color: '#f472b6' },
                { ext: 'pdf', label: 'PDF Document', icon: <FilePdf weight="duotone" size={24} />, color: '#f87171' },
              ].map(item => (
                <button
                  key={item.ext}
                  onClick={() => {
                    post({ type: 'create_blank_document', format: item.ext as 'docx' | 'xlsx' | 'csv' | 'md' | 'pdf' });
                  }}
                  className="flex flex-col items-center gap-2 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4 text-center transition hover:border-[var(--accent)]/30 hover:bg-[var(--accent)]/5 cursor-pointer"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: `${item.color}15`, color: item.color }}>
                    {item.icon}
                  </div>
                  <span className="text-xs font-medium text-white">{item.label}</span>
                  <span className="text-[10px] text-[var(--text-muted)]">.{item.ext}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Templates */}
          <div>
            <h3 className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium mb-3">From Template</h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: 'proposal', label: 'Project Proposal', desc: 'Executive summary, objectives, timeline, budget', icon: <Briefcase weight="duotone" size={22} />, color: '#60a5fa' },
                { id: 'report', label: 'Status Report', desc: 'Progress, issues, next steps', icon: <ChartLineUp weight="duotone" size={22} />, color: '#4ade80' },
                { id: 'invoice', label: 'Invoice', desc: 'Items table, payment terms', icon: <Receipt weight="duotone" size={22} />, color: '#fbbf24' },
                { id: 'letter', label: 'Formal Letter', desc: 'Recipient, body, closing', icon: <EnvelopeSimple weight="duotone" size={22} />, color: '#a78bfa' },
                { id: 'meeting_notes', label: 'Meeting Notes', desc: 'Agenda, discussion, action items', icon: <NotePencil weight="duotone" size={22} />, color: '#f472b6' },
                { id: 'resume', label: 'Resume', desc: 'Contact, experience, education, skills', icon: <IdentificationCard weight="duotone" size={22} />, color: '#22d3ee' },
              ].map(tmpl => (
                <button
                  key={tmpl.id}
                  onClick={() => {
                    post({ type: 'create_from_template', template: tmpl.id as 'proposal' | 'report' | 'invoice' | 'letter' | 'meeting_notes' | 'resume' });
                  }}
                  className="flex items-start gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4 text-left transition hover:border-[var(--accent)]/30 hover:bg-[var(--accent)]/5 cursor-pointer"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: `${tmpl.color}15`, color: tmpl.color }}>
                    {tmpl.icon}
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-medium text-white block">{tmpl.label}</span>
                    <span className="text-[10px] text-[var(--text-muted)] leading-relaxed">{tmpl.desc}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
