import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { useLocale } from '../i18n';
import { post } from '../App';
import type { AccountInfo } from '../types/messages';
import {
  FolderOpen, Image as ImageIcon, MusicNotes, Microphone, VideoCamera,
  FileText, GridFour, Table, FilePdf,
  FileDoc, FileXls, FileCsv, FileMd,
  Briefcase, ChartLineUp, Receipt, EnvelopeSimple, NotePencil, IdentificationCard,
} from '@phosphor-icons/react';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

const TAB_ICONS: Record<string, ReactNode> = {
  library: <FolderOpen weight="duotone" size={16} />,
  images: <ImageIcon weight="duotone" size={16} />,
  audio: <MusicNotes weight="duotone" size={16} />,
  voice: <Microphone weight="duotone" size={16} />,
  video: <VideoCamera weight="duotone" size={16} />,
  documents: <FileText weight="duotone" size={16} />,
};

const TABS = [
  { key: 'library', label: 'Library' },
  { key: 'images', label: 'Images' },
  { key: 'audio', label: 'Audio' },
  { key: 'voice', label: 'Voice' },
  { key: 'video', label: 'Video' },
  { key: 'documents', label: 'Documents' },
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
}

function deleteLocalAsset(id: string) {
  const assets = loadLocalAssets().filter((a: any) => a.id !== id);
  try {
    localStorage.setItem('ava-creative-assets', JSON.stringify(assets));
  } catch { /* quota */ }
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
  const totalUsed = (usage?.free_tokens_used || 0) + (usage?.tokens_used || 0);
  const totalLimit = (usage?.free_tokens_limit || 0) + (usage?.tokens_limit || 0);
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

  const [activeTab, setActiveTab] = useState<string>('library');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Images
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageSize, setImageSize] = useState<string>('1280*1280');
  const [lastImage, setLastImage] = useState<string | null>(null);

  // Audio
  const [musicPrompt, setMusicPrompt] = useState('');
  const [musicLyrics, setMusicLyrics] = useState('');
  const [lastAudio, setLastAudio] = useState<string | null>(null);

  // Voice
  const [voiceText, setVoiceText] = useState('');
  const [voiceId, setVoiceId] = useState('Calm_Woman');
  const [voiceSpeed, setVoiceSpeed] = useState(1.0);
  const [lastVoice, setLastVoice] = useState<string | null>(null);

  // Video
  const [videoPrompt, setVideoPrompt] = useState('');
  const [videoDuration, setVideoDuration] = useState<number>(6);
  const [lastVideo, setLastVideo] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

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

  /* ── Auth gate ────────────────────────────────────────────────────── */

  function requiresAuth(): boolean {
    if (!hasAuth()) {
      setError('Creative Studio requires a platform account. Connect your account in Settings.');
      return false;
    }
    return true;
  }

  /* ── Image generation ─────────────────────────────────────────────── */

  const handleGenerateImage = async () => {
    if (!imagePrompt.trim() || generating) return;
    setGenerating(true); setError(null);
    try {
      const data = await apiCall('generate-image', { prompt: imagePrompt.trim(), size: imageSize, model: 'minimax' });
      if (data.url) {
        setLastImage(data.url);
        saveLocalAsset('image', data.url, imagePrompt.slice(0, 60), imagePrompt);
      } else throw new Error(data.error || 'No image URL returned');
    } catch (e: any) { setError(e.message || e); }
    setGenerating(false);
  };

  /* ── Music generation ─────────────────────────────────────────────── */

  const handleGenerateMusic = async () => {
    if (!musicPrompt.trim() || generating) return;
    setGenerating(true); setError(null);
    try {
      const data = await apiCall('generate-music', { prompt: musicPrompt.trim(), lyrics: musicLyrics.trim() || undefined });
      if (data.url) {
        setLastAudio(data.url);
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
      const data = await apiCall('generate-voice', { text: voiceText.trim(), voice_id: voiceId, speed: voiceSpeed });
      if (data.url) {
        setLastVoice(data.url);
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
      const data = await apiCall('generate-video', { prompt: videoPrompt.trim(), duration: videoDuration });
      if (data.url) {
        setLastVideo(data.url);
        saveLocalAsset('video', data.url, videoPrompt.slice(0, 60), videoPrompt);
      } else throw new Error(data.error || 'No video URL returned');
    } catch (e: any) {
      setError(e.message || 'Video generation failed');
    }
    setGenerating(false);
  };

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
      {/* Header + Token Bar */}
      <div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold text-white">Creative Studio</h1>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Generate images, music, voice, and video with MiniMax
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

      {/* ── Generation tabs (two-panel layout) ────────────────────── */}
      {activeTab !== 'library' && (
        <div className="flex gap-4 min-h-0">
          {/* LEFT: Generate panel (~320px) */}
          <div className="w-80 shrink-0 space-y-3 overflow-y-auto">
            {/* ── Images generate ──────────────────────────────── */}
            {activeTab === 'images' && (
              <>
                <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-3">
                  <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Prompt
                  </label>
                  <textarea
                    value={imagePrompt}
                    onChange={e => setImagePrompt(e.target.value)}
                    placeholder="Describe the image you want to create..."
                    rows={5}
                    className="w-full resize-y rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
                  />
                </div>
                <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-3">
                  <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Size
                  </label>
                  <div className="flex gap-1">
                    {([
                      { value: '1280*1280', label: 'Square 1:1' },
                      { value: '768*1280', label: 'Portrait 3:4' },
                      { value: '1280*768', label: 'Landscape 4:3' },
                    ] as const).map(s => (
                      <button
                        key={s.value}
                        onClick={() => setImageSize(s.value)}
                        className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition ${
                          imageSize === s.value
                            ? 'bg-[var(--accent)] text-white'
                            : 'bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                {errorBox}
                <button
                  onClick={handleGenerateImage}
                  disabled={!imagePrompt.trim() || generating}
                  className="w-full rounded-lg bg-[var(--accent)] py-2.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {generating ? 'Generating...' : 'Generate Image'}
                </button>
              </>
            )}

            {/* ── Audio generate ───────────────────────────────── */}
            {activeTab === 'audio' && (
              <>
                <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-3">
                  <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Prompt
                  </label>
                  <textarea
                    value={musicPrompt}
                    onChange={e => setMusicPrompt(e.target.value)}
                    placeholder="Describe the music — genre, mood, instruments..."
                    rows={4}
                    className="w-full resize-y rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
                  />
                </div>
                <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-3">
                  <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Lyrics (optional)
                  </label>
                  <textarea
                    value={musicLyrics}
                    onChange={e => setMusicLyrics(e.target.value)}
                    placeholder="Add lyrics for a vocal track (optional)"
                    rows={4}
                    className="w-full resize-y rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
                  />
                </div>
                {errorBox}
                <button
                  onClick={handleGenerateMusic}
                  disabled={!musicPrompt.trim() || generating}
                  className="w-full rounded-lg bg-[var(--accent)] py-2.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {generating ? 'Generating...' : 'Generate Music'}
                </button>
              </>
            )}

            {/* ── Voice generate ───────────────────────────────── */}
            {activeTab === 'voice' && (
              <>
                <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-3">
                  <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Text
                  </label>
                  <textarea
                    value={voiceText}
                    onChange={e => setVoiceText(e.target.value)}
                    placeholder="Enter text to speak..."
                    rows={5}
                    className="w-full resize-y rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
                  />
                </div>
                <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-3">
                  <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Voice
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {VOICES.map(v => (
                      <button
                        key={v.id}
                        onClick={() => setVoiceId(v.id)}
                        className={`rounded-md px-2.5 py-1 text-[10px] font-medium transition ${
                          voiceId === v.id
                            ? 'bg-[var(--accent)] text-white'
                            : 'bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                        }`}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-3">
                  <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Speed
                  </label>
                  <div className="flex gap-1">
                    {[0.8, 1.0, 1.2, 1.5].map(s => (
                      <button
                        key={s}
                        onClick={() => setVoiceSpeed(s)}
                        className={`rounded-md px-3 py-1 text-[11px] font-medium transition ${
                          voiceSpeed === s
                            ? 'bg-[var(--accent)] text-white'
                            : 'bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                        }`}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                </div>
                {errorBox}
                <button
                  onClick={handleGenerateVoice}
                  disabled={!voiceText.trim() || generating}
                  className="w-full rounded-lg bg-[var(--accent)] py-2.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {generating ? 'Generating...' : 'Generate Voice'}
                </button>
              </>
            )}

            {/* ── Video generate ───────────────────────────────── */}
            {activeTab === 'video' && (
              <>
                <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-3">
                  <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Prompt
                  </label>
                  <textarea
                    value={videoPrompt}
                    onChange={e => setVideoPrompt(e.target.value)}
                    placeholder="Describe the video scene..."
                    rows={5}
                    className="w-full resize-y rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
                  />
                </div>
                <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-3">
                  <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Duration
                  </label>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setVideoDuration(6)}
                      className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition ${
                        videoDuration === 6
                          ? 'bg-[var(--accent)] text-white'
                          : 'bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                      }`}
                    >
                      6s 1080P
                    </button>
                    <button
                      onClick={() => setVideoDuration(10)}
                      className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition ${
                        videoDuration === 10
                          ? 'bg-[var(--accent)] text-white'
                          : 'bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                      }`}
                    >
                      10s 768P
                    </button>
                  </div>
                </div>
                {errorBox}
                <button
                  onClick={handleGenerateVideo}
                  disabled={!videoPrompt.trim() || generating}
                  className="w-full rounded-lg bg-[var(--accent)] py-2.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {generating ? 'Generating...' : 'Generate Video'}
                </button>
                {generating && activeTab === 'video' && (
                  <div className="rounded-lg border border-[var(--accent)]/12 bg-[var(--accent)]/5 py-2.5 text-center text-xs text-[var(--text-secondary)]">
                    Generating... {elapsed}s
                  </div>
                )}
              </>
            )}
          </div>

          {/* RIGHT: Results panel */}
          <div className="flex-1 overflow-y-auto">
            {/* ── Images results ──────────────────────────────── */}
            {activeTab === 'images' && (
              lastImage ? (
                <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4">
                  <img
                    src={lastImage}
                    alt="Generated image"
                    className="w-full rounded-lg"
                  />
                  <p className="mt-3 text-[11px] text-[var(--text-muted)]">Generated image</p>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">{imagePrompt}</p>
                  <a
                    href={lastImage}
                    download
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-block rounded-md border border-[var(--accent)]/12 bg-[var(--bg-input)] px-3.5 py-1.5 text-[11px] font-medium text-[var(--text-primary)] no-underline transition hover:border-[var(--accent)]/30"
                  >
                    Download
                  </a>
                </div>
              ) : (
                <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] text-sm text-[var(--text-muted)]">
                  Generated images will appear here
                </div>
              )
            )}

            {/* ── Audio results ───────────────────────────────── */}
            {activeTab === 'audio' && (
              lastAudio ? (
                <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4 space-y-3">
                  <AudioPlayer src={lastAudio} />
                  <p className="text-[11px] text-[var(--text-muted)]">Generated audio</p>
                  <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{musicPrompt}</p>
                  <a
                    href={lastAudio}
                    download
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block rounded-md border border-[var(--accent)]/12 bg-[var(--bg-input)] px-3.5 py-1.5 text-[11px] font-medium text-[var(--text-primary)] no-underline transition hover:border-[var(--accent)]/30"
                  >
                    Download
                  </a>
                </div>
              ) : (
                <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] text-sm text-[var(--text-muted)]">
                  Generated audio will appear here
                </div>
              )
            )}

            {/* ── Voice results ───────────────────────────────── */}
            {activeTab === 'voice' && (
              lastVoice ? (
                <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4 space-y-3">
                  <AudioPlayer src={lastVoice} />
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Generated voice — {VOICES.find(v => v.id === voiceId)?.label || voiceId}
                  </p>
                  <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{voiceText}</p>
                </div>
              ) : (
                <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] text-sm text-[var(--text-muted)]">
                  Generated voice will appear here
                </div>
              )
            )}

            {/* ── Video results ───────────────────────────────── */}
            {activeTab === 'video' && (
              lastVideo ? (
                <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4 space-y-3">
                  <VideoPlayer src={lastVideo} />
                  <p className="text-[11px] text-[var(--text-muted)]">Generated video</p>
                  <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{videoPrompt}</p>
                  <a
                    href={lastVideo}
                    download
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block rounded-md border border-[var(--accent)]/12 bg-[var(--bg-input)] px-3.5 py-1.5 text-[11px] font-medium text-[var(--text-primary)] no-underline transition hover:border-[var(--accent)]/30"
                  >
                    Download
                  </a>
                </div>
              ) : (
                <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] text-sm text-[var(--text-muted)]">
                  Generated videos will appear here
                </div>
              )
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
