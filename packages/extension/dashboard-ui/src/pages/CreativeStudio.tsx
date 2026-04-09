import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocale } from '../i18n';
import { post } from '../App';
import type { AccountInfo } from '../types/messages';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

// SVG icon components for the Creative Studio tabs
const TabIcon = ({ d, size = 16 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const TAB_ICONS: Record<string, JSX.Element> = {
  library: <TabIcon d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />,
  images: <TabIcon d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />,
  audio: <TabIcon d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />,
  voice: <TabIcon d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4M12 15a3 3 0 003-3V5a3 3 0 00-6 0v7a3 3 0 003 3z" />,
  video: <TabIcon d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />,
};

const TABS = [
  { key: 'library', label: 'Library' },
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

type LibraryFilter = 'all' | 'images' | 'music' | 'video' | 'voice' | 'documents' | 'spreadsheets' | 'presentations';

const FILTER_ICONS: Record<string, JSX.Element> = {
  all: <TabIcon d="M4 6h16M4 10h16M4 14h16M4 18h16" />,
  images: <TabIcon d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />,
  music: <TabIcon d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />,
  video: <TabIcon d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />,
  voice: <TabIcon d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4M12 15a3 3 0 003-3V5a3 3 0 00-6 0v7a3 3 0 003 3z" />,
  documents: <TabIcon d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />,
  spreadsheets: <TabIcon d="M3 10h18M3 14h18M3 6h18M3 18h18M8 6v12M16 6v12" />,
  presentations: <TabIcon d="M8 13v-1m4 1v-3m4 3V8M8 21l4-4 4 4M3 4h18v12H3z" />,
};

const LIBRARY_FILTERS: { key: LibraryFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'images', label: 'Images' },
  { key: 'music', label: 'Music' },
  { key: 'video', label: 'Video' },
  { key: 'voice', label: 'Voice' },
  { key: 'documents', label: 'Documents' },
  { key: 'spreadsheets', label: 'Spreadsheets' },
  { key: 'presentations', label: 'Presentations' },
];

/* ── Auth helpers ──────────────────────────────────────────────────── */

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
  if (type === 'presentation') return '\uD83D\uDCBD';
  return '\uD83D\uDCC1';
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
  const assets = loadLocalAssets();
  assets.unshift({
    id: `${type}_${Date.now()}`,
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
  // Exact same calculation as chat header bar (Header.tsx line 291)
  const freeUsed = usage?.free_tokens_used || 0;
  const freeLimit = usage?.free_tokens_limit || 0;
  const tokensRemaining = Math.max(0, freeLimit - freeUsed);
  const remainPct = freeLimit > 0 ? Math.min((tokensRemaining / freeLimit) * 100, 100) : 0;

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
    if (libraryFilter === 'presentations') return aType === 'presentation' || ['pptx', 'ppt'].includes(ext);
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
                <span>{formatTokens(freeUsed)} used</span>
                <span>{formatTokens(freeLimit)} limit</span>
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

                    {/* Preview area */}
                    <div className="bg-black/30">
                      {['image', 'graphic'].includes(selectedAsset.asset_type || '') && selectedAsset.url ? (
                        <img
                          src={selectedAsset.url}
                          alt=""
                          className="w-full max-h-[60vh] object-contain"
                        />
                      ) : ['music', 'voice', 'sfx'].includes(selectedAsset.asset_type || '') && selectedAsset.url ? (
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
                      ) : selectedAsset.asset_type === 'video' && selectedAsset.url ? (
                        <VideoPlayer src={selectedAsset.url} hideFullscreen />
                      ) : (
                        <div className="flex h-48 items-center justify-center text-5xl opacity-20">
                          {typeIcon(selectedAsset.asset_type || selectedAsset.type || '')}
                        </div>
                      )}
                    </div>

                    {/* Info + actions */}
                    <div className="p-5">
                      <h3 className="text-sm font-semibold text-white mb-1">
                        {selectedAsset.title || selectedAsset.name || 'Untitled'}
                      </h3>

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

                      {/* Actions */}
                      <div className="flex gap-2">
                        {selectedAsset.path && (
                          <button
                            onClick={() => post({ type: 'download_asset', path: selectedAsset.path } as any)}
                            className="flex-1 rounded-lg bg-[var(--accent)] py-2.5 text-center text-xs font-medium text-white transition hover:opacity-90 border-none cursor-pointer"
                          >
                            Download
                          </button>
                        )}
                        {!confirmDelete ? (
                          <button
                            onClick={() => setConfirmDelete(true)}
                            className="rounded-lg border border-[var(--border-card)] px-4 py-2.5 text-xs font-medium text-[var(--text-secondary)] transition hover:border-red-400/50 hover:text-red-400 cursor-pointer"
                          >
                            Delete
                          </button>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={() => setConfirmDelete(false)}
                              className="rounded-lg border border-[var(--border-card)] px-4 py-2.5 text-xs text-[var(--text-secondary)] transition hover:text-white cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleDeleteAsset(selectedAsset)}
                              className="rounded-lg bg-red-500/20 px-4 py-2.5 text-xs font-medium text-red-400 transition hover:bg-red-500/30 border-none cursor-pointer"
                            >
                              Confirm Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
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
    </div>
  );
}
