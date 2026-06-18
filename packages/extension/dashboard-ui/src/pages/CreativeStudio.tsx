import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react';
import { t, useLocale } from '../i18n';
import { post } from '../App';
import type { AccountInfo } from '../types/messages';
import {
  Image as ImageIcon, MusicNotes, Microphone, VideoCamera,
  Gear, Paperclip, X as XIcon,
} from '@phosphor-icons/react';
import {
  type GalleryItem, type GalleryMediumKind,
} from '../components/CreativeOutputCard';
import { Tooltip } from '../components/Tooltip';
// Granular import — webview can't load `@ava/core` root export because
// it transitively pulls Node-only constants. The creative leaf (which
// itself re-uses billing/credits) is browser-safe.
import {
  type CreativeMode,
  VALID_MODES, HIDDEN_MODES,
  VOICES, IMAGE_STYLES, MUSIC_MOODS, VOICE_EMOTIONS, VIDEO_CAMERAS, VIDEO_MOTION,
  AVA_VOICE_ID,
  estimateImageCredits, estimateMusicCredits, estimateVoiceCredits, estimateVideoCredits,
  SUGGESTIONS, pickRandom,
} from '@ava/core/creative';

// Exact credit count with locale-grouped digits — operator wants
// the precise number, not "5K" / "1.2M" rounded buckets, so they can
// see exactly how many credits a generation actually cost.
function formatTokens(n: number): string {
  return n.toLocaleString();
}

/** Compose the platform-correct send-shortcut label for the composer
 *  hint. Mac users see ⌘↵; everyone else sees Ctrl+↵. The handler
 *  already accepts both modifiers — only the visible label needs to
 *  match the user's keyboard. Falls back to Ctrl+↵ in browser
 *  environments that don't expose `navigator.platform` (e.g. some
 *  webview hardenings). */
function sendShortcutLabel(): string {
  try {
    const isMac = typeof navigator !== 'undefined' &&
      /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');
    return isMac ? '⌘↵' : 'Ctrl+↵';
  } catch {
    return 'Ctrl+↵';
  }
}

// Active mode union — values stored in localStorage as 'images' / 'audio'
// / 'voice' / 'video'. Old persisted values like 'library' or 'documents'
// from prior versions are normalised back to 'images' on load. Registries,
// voices, cost estimators, AVA_VOICE_ID and SUGGESTIONS all live in the
// shared `@ava/core/creative` leaf so the extension + IDE can't drift.
type Mode = CreativeMode;

// Library filter types and asset-type icons retired — browsing now lives
// on the top-level Library page. typeIcon / docCardConfig deleted with
// the Documents/Library tabs.

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

// Generator-card primitives (FieldCard / PromptCard / PresetCard /
// ReferenceCard / CostPreviewPill) all retired with the form-first
// design. The conversation-first canvas defines its primitives
// (ChipRow, ReferenceChip, ReferenceAttachButton, FeedActionPill)
// inline, lower in the file.

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

  // Always save the file to disk — local-first: the asset is kept on
  // the machine regardless of cloud-sync state. (Cloud upload, when
  // sync is on, is handled separately by the host.)
  {
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
          pendingReject.current(msg.error || t('dash.creative.generation_failed'));
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
  const [activeTab, setActiveTab] = useState<Mode>(() => {
    try {
      const stored = localStorage.getItem('ava-creative-studio-tab');
      if (stored && (VALID_MODES as readonly string[]).includes(stored) && !HIDDEN_MODES.has(stored as Mode)) return stored as Mode;
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
  // Wan 2.6 T2I doesn't accept a reference image — text-to-image only.
  // No imageReference state. If we wire a future i2i model variant
  // (wan2.6-i2i or similar) we add it back here.

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
  const [videoDuration, setVideoDuration] = useState<5 | 10>(5);
  const [videoResolution, setVideoResolution] = useState<'720P' | '1080P'>('720P');
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

  // Refresh handler — called after every save / delete to re-read
  // localStorage. Cheap; localStorage is in-memory.
  const refreshGallery = useCallback(() => setGalleryRefresh(t => t + 1), []);

  // Subscribe to local-asset update events from the existing
  // infrastructure. The existing CustomEvent already fires on
  // saveLocalAsset; we just need to listen.
  useEffect(() => {
    const onLocalChange = () => refreshGallery();
    window.addEventListener('ava-creative-assets-updated', onLocalChange);
    return () => window.removeEventListener('ava-creative-assets-updated', onLocalChange);
  }, [refreshGallery]);

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
      // Wan 2.6 T2I is text-to-image only — no reference-image input
      // accepted by the server endpoint. Don't send the field even if
      // someone passes one in.
      const calls = Array.from({ length: imageVariations }).map(() =>
        apiCall('generate-image', {
          prompt: finalPrompt,
          size: imageSize,
          negative_prompt: negative,
        }).then(data => {
          if (data?.url) saveLocalAsset('image', data.url, imagePrompt.slice(0, 60), imagePrompt);
          else throw new Error(data?.error || t('dash.creative.err_no_image_url'));
        }),
      );
      const results = await Promise.allSettled(calls);
      const failures = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];
      if (failures.length === results.length) {
        const first = failures[0]?.reason;
        throw new Error(first?.message || first || t('dash.creative.generation_failed'));
      }
      // At least one variation succeeded — clear the composer so the
      // user can type the next prompt straight away. Errors keep the
      // prompt so the user can retry / tweak without retyping.
      setImagePrompt('');
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
        // Clear the composer + lyrics on success — see image handler.
        setMusicPrompt('');
        setMusicLyrics('');
      } else throw new Error(data.error || t('dash.creative.err_no_audio_url'));
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
      const effectiveVoice = avaVoice ? AVA_VOICE_ID : voiceId;
      const data = await apiCall('generate-voice', {
        text: voiceText.trim(),
        voice_id: effectiveVoice,
        speed: voiceSpeed,
        pitch: voicePitch,
        emotion: voiceEmotion,
      });
      if (data.url) {
        saveLocalAsset('voice', data.url, voiceText.slice(0, 60), voiceText);
        // Clear the text on success — see image handler.
        setVoiceText('');
      } else throw new Error(data.error || t('dash.creative.err_no_voice_url'));
    } catch (e: any) { setError(e.message || e); }
    setGenerating(false);
  };

  /* ── Video generation ─────────────────────────────────────────────── */

  const handleGenerateVideo = async () => {
    if (!videoPrompt.trim() || generating) return;
    setGenerating(true); setError(null);
    try {
      // Wan supports an optional first-frame image-to-video input
      // (wan2.5-i2v-preview). The server expects `first_frame_image`
      // exactly — see generate-video/route.ts, which maps it to Wan's
      // `img_url`. Sending `reference_image` was a no-op before this fix.
      const data = await apiCall('generate-video', {
        prompt: composeVideoPrompt(),
        duration: videoDuration,
        resolution: videoResolution,
        first_frame_image: videoReference?.dataUrl,
      });
      if (data.url) {
        saveLocalAsset('video', data.url, videoPrompt.slice(0, 60), videoPrompt);
        // Clear the composer + first-frame on success — see image
        // handler. Reference image consumed; user starts fresh.
        setVideoPrompt('');
        setVideoReference(null);
      } else throw new Error(data.error || t('dash.creative.err_no_video_url'));
    } catch (e: any) {
      setError(e.message || t('dash.creative.err_video_failed'));
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

  /* ── Reference image upload (video only) ──────────────────────────── */
  // Wired to the `first_frame_image` parameter on the generate-video
  // endpoint (Wan i2v). Image generation (Wan 2.6 T2I) doesn't accept a
  // reference, so we don't surface the affordance there.

  const handleUploadVideoReference = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        setVideoReference({ name: file.name, dataUrl });
      };
      reader.readAsDataURL(file);
    },
    [],
  );

  // Library delete + filter retired with the legacy Library tab. Per-card
  // delete now lives on FeedCard; browsing has moved to the top-level
  // Library page. Inline error UI is in the composer surface.

  /* ══════════════════════════════════════════════════════════════════
     Unified composer routing
     ══════════════════════════════════════════════════════════════════
     The page presents a single prompt input that always writes to the
     active mode's per-mode prompt state. We keep the per-mode states
     so switching modes preserves what the user typed in each (an
     image idea you abandoned at 70% completion is still there when
     you switch back from Voice).
  */

  // Active mode is the existing activeTab — keeps localStorage
  // persistence, handler wiring, and the compose* helpers untouched.
  const mode = activeTab as 'images' | 'audio' | 'voice' | 'video';

  const currentPrompt =
    mode === 'images' ? imagePrompt :
    mode === 'audio'  ? musicPrompt :
    mode === 'voice'  ? voiceText :
                        videoPrompt;

  const setCurrentPrompt = (v: string) => {
    if (mode === 'images') setImagePrompt(v);
    else if (mode === 'audio') setMusicPrompt(v);
    else if (mode === 'voice') setVoiceText(v);
    else setVideoPrompt(v);
  };

  const currentSend = () => {
    if (mode === 'images') void handleGenerateImage();
    else if (mode === 'audio') void handleGenerateMusic();
    else if (mode === 'voice') void handleGenerateVoice();
    else void handleGenerateVideo();
  };

  const currentCredits =
    mode === 'images' ? estimateImageCredits(imageVariations) :
    mode === 'audio'  ? estimateMusicCredits(musicDuration) :
    mode === 'voice'  ? estimateVoiceCredits(voiceText.length) :
                        estimateVideoCredits(videoResolution);

  const currentPlaceholder =
    mode === 'images' ? t('dash.creative.placeholder_image') :
    mode === 'audio'  ? t('dash.creative.placeholder_music') :
    mode === 'voice'  ? t('dash.creative.placeholder_voice') :
                        t('dash.creative.placeholder_video');

  // Unified chronological feed across every mode. Oldest first so the
  // composer at the bottom is where the user's eye naturally tracks
  // — same shape as Ava chat.
  const feedAsc = useMemo(
    () => allGalleryItems
      .filter(isSessionItem)
      .slice()
      .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')),
    [allGalleryItems, isSessionItem],
  );

  // Auto-scroll to bottom when feed grows or generation starts so the
  // newest card is always in view above the composer.
  const feedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [feedAsc.length, generating]);

  // Drop reference image directly onto the composer. Only video mode
  // accepts one (Wan image-to-video via first_frame_image). Wan 2.6 T2I
  // has no image-input slot so the image tab doesn't surface the
  // affordance.
  const composerAcceptsReference = mode === 'video';

  const handleComposerDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/') && composerAcceptsReference) {
      handleUploadVideoReference(file);
    }
  };

  /* ══════════════════════════════════════════════════════════════════
     Render
     ══════════════════════════════════════════════════════════════════ */

  // Mode glyph dock — small phosphor icons that float at the right
  // edge of the composer. Replaces the old tab bar so Creative Studio
  // doesn't read like a settings page. Selected glows accent.
  const allModeGlyphs: { key: Mode; icon: ReactNode; label: string }[] = [
    { key: 'images', icon: <ImageIcon weight="duotone" size={16} />,   label: t('dash.creative.mode_image') },
    { key: 'audio',  icon: <MusicNotes weight="duotone" size={16} />,  label: t('dash.creative.mode_music') },
    { key: 'voice',  icon: <Microphone weight="duotone" size={16} />,  label: t('dash.creative.mode_voice') },
    { key: 'video',  icon: <VideoCamera weight="duotone" size={16} />, label: t('dash.creative.mode_video') },
  ];
  const modeGlyphs = allModeGlyphs.filter(g => !HIDDEN_MODES.has(g.key));

  return (
    <div className="w-full flex flex-col" style={{ height: 'calc(100vh - 80px)', minHeight: 0 }}>
      {/* Compact header — title + soft mauve subtitle that hints
          conversation, not "tool". Token bar collapses into a slim pill
          on the right when account is connected. */}
      <header className="flex items-start justify-between mb-3 shrink-0">
        <div>
          <h1 className="text-[22px] font-semibold text-[#cdd6f4]">{t('dash.nav.creative_studio')}</h1>
          <p className="mt-1 text-[12px] text-[#9b8caa]">{t('dash.creative.subtitle')}</p>
        </div>
        {/* Credit balance card. Four states, in priority order:
              1. admin tier → "Unlimited"
              2. platform user with real usage data → live balance + bar
              3. signed-in user without usage data yet → loading skeleton
                 (the host's account fetch hasn't completed yet)
              4. signed-out user → "Connect to see balance"
            BYOK doesn't get a separate state here because Creative Studio
            uses platform-routed media endpoints regardless of BYOK toggle
            for chat — every signed-in user has a credit balance. */}
        {account?.tier === 'admin' ? (
          <div className="shrink-0 rounded-2xl border border-[rgba(168,85,247,0.30)] bg-gradient-to-br from-[#0f0f17] to-[#1a1625] px-4 py-2.5 shadow-[0_0_18px_rgba(168,85,247,0.10)] min-w-[200px]">
            <span className="text-[9px] uppercase tracking-wider font-semibold text-[var(--text-muted)] block mb-1.5">{t('dash.creative.credit_balance')}</span>
            <div className="flex items-baseline gap-2">
              <span className="text-[18px] font-semibold leading-none bg-gradient-to-r from-[var(--accent)] to-purple-300 bg-clip-text text-transparent">
                {t('dash.creative.unlimited')}
              </span>
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mt-1">{t('dash.creative.admin_no_caps')}</p>
          </div>
        ) : account?.usage ? (
          <div className="shrink-0 rounded-2xl border border-[rgba(168,85,247,0.20)] bg-gradient-to-br from-[#0f0f17] to-[#1a1625] px-4 py-2.5 shadow-[0_0_18px_rgba(168,85,247,0.06)] min-w-[200px]">
            <div className="flex items-baseline justify-between gap-3 mb-1.5">
              <span className="text-[9px] uppercase tracking-wider font-semibold text-[var(--text-muted)]">{t('dash.creative.credit_balance')}</span>
              <span className="text-[10px] text-[var(--text-muted)] tabular-nums">
                {formatTokens(totalUsed)}<span className="opacity-60"> / {formatTokens(totalLimit)}</span>
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span
                className={`text-[18px] font-semibold tabular-nums leading-none ${
                  remainPct < 10 ? 'text-red-400' : remainPct < 30 ? 'text-amber-400' : 'text-[var(--accent)]'
                }`}
              >
                {formatTokens(tokensRemaining)}
              </span>
              <span className="text-[10px] text-[var(--text-muted)]">{t('dash.creative.credits_left')}</span>
            </div>
            <div className="mt-2 h-1 w-full rounded-full bg-[var(--bg-input)] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  remainPct < 10 ? 'bg-red-500' : remainPct < 30 ? 'bg-amber-500' : 'bg-[var(--accent)]'
                }`}
                style={{ width: `${remainPct}%` }}
              />
            </div>
          </div>
        ) : account ? (
          <div className="shrink-0 rounded-2xl border border-[rgba(168,85,247,0.16)] bg-[#0f0f17]/60 px-4 py-2.5 min-w-[200px]">
            <span className="text-[9px] uppercase tracking-wider font-semibold text-[var(--text-muted)] block mb-1.5">{t('dash.creative.credit_balance')}</span>
            <div className="h-4 w-20 rounded bg-[var(--bg-input)]/60 animate-pulse" />
            <div className="mt-2 h-1 w-full rounded-full bg-[var(--bg-input)] animate-pulse" />
          </div>
        ) : (
          <div className="shrink-0 rounded-2xl border border-[rgba(168,85,247,0.16)] bg-[#0f0f17]/60 px-4 py-2.5 min-w-[200px]">
            <span className="text-[9px] uppercase tracking-wider font-semibold text-[var(--text-muted)] block mb-1">{t('dash.creative.credit_balance')}</span>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              {t('dash.creative.sign_in_credits')}
            </p>
          </div>
        )}
      </header>

      {/* Feed — scrolls oldest-top to newest-bottom. Empty state is a
          full-card invitation with the brand voice; once a generation
          lands, the empty card disappears and feed cards stack like a
          chat thread. */}
      <div ref={feedRef} className="flex-1 overflow-y-auto -mx-1 px-1 pb-4 space-y-3 min-h-0">
        {feedAsc.length === 0 && !generating && (
          <EmptyInvitation onSuggest={(text) => setCurrentPrompt(text)} mode={mode} />
        )}
        {feedAsc.map(item => (
          <FeedCard
            key={item.id}
            item={item}
            onRegenerate={(it) => {
              if (it.kind === 'image') setImagePrompt(it.prompt);
              else if (it.kind === 'music') setMusicPrompt(it.prompt);
              else if (it.kind === 'voice') setVoiceText(it.prompt);
              else if (it.kind === 'video') setVideoPrompt(it.prompt);
            }}
            onDelete={(it) => {
              deleteLocalAsset(it.id);
              if (it.cloud) post({ type: 'delete_cloud_asset', id: it.id } as any);
            }}
            onSendToVideo={sendImageToVideo}
            onSendToVoice={sendImageToVoice}
            onSendMusicToVideo={sendMusicToVideo}
          />
        ))}
        {generating && <GeneratingCard mode={mode} elapsed={elapsed} />}
      </div>

      {/* Composer — sticky at the bottom of the page. Reference chip,
          textarea, mode-glyph dock, cost preview, send button, and the
          inline mode-settings card all live in this one composite. */}
      <div className="shrink-0 pt-2 -mx-1 px-1 bg-gradient-to-t from-[#0f0f17] via-[#0f0f17]/95 to-transparent">
        {/* Inline error pill — sits above the composer, not inside it,
            so the input never visually jumps when an error appears. */}
        {error && (
          <div className="mb-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-[11px] text-red-400 leading-relaxed">
            {error}
          </div>
        )}

        {/* Mode-specific settings strip — appears above the composer so
            the user sees taste-shaping options at thumb-distance. Style
            chips, mood, voice, camera. Quiet by default; only emphasises
            when the user has picked something other than Auto. */}
        <ModeSettingsStrip
          mode={mode}
          // Image controls
          imageStyle={imageStyle} setImageStyle={setImageStyle}
          imageSize={imageSize} setImageSize={setImageSize}
          imageVariations={imageVariations} setImageVariations={setImageVariations}
          imageNegative={imageNegative} setImageNegative={setImageNegative}
          // Music controls
          musicMood={musicMood} setMusicMood={setMusicMood}
          musicDuration={musicDuration} setMusicDuration={setMusicDuration}
          musicLyrics={musicLyrics} setMusicLyrics={setMusicLyrics}
          // Voice controls
          voiceId={voiceId} setVoiceId={setVoiceId}
          avaVoice={avaVoice} setAvaVoice={setAvaVoice}
          voiceEmotion={voiceEmotion} setVoiceEmotion={setVoiceEmotion}
          voiceSpeed={voiceSpeed} setVoiceSpeed={setVoiceSpeed}
          voicePitch={voicePitch} setVoicePitch={setVoicePitch}
          // Video controls
          videoCamera={videoCamera} setVideoCamera={setVideoCamera}
          videoMotion={videoMotion} setVideoMotion={setVideoMotion}
          videoDuration={videoDuration} setVideoDuration={setVideoDuration}
          videoResolution={videoResolution} setVideoResolution={setVideoResolution}
        />

        <div
          onDrop={composerAcceptsReference ? handleComposerDrop : undefined}
          onDragOver={composerAcceptsReference ? (e) => e.preventDefault() : undefined}
          className="rounded-2xl border border-[rgba(168,85,247,0.20)] bg-gradient-to-br from-[#0f0f17] to-[#1a1625] p-3 shadow-[0_0_30px_rgba(168,85,247,0.06)] focus-within:border-[rgba(168,85,247,0.45)] focus-within:shadow-[0_0_30px_rgba(168,85,247,0.14)] transition"
        >
          {/* Reference chip — pinned at the top of the composer when a
              first-frame image is attached for video. Click × to remove. */}
          {(mode === 'video' && videoReference) && (
            <ReferenceChip
              ref={videoReference}
              onRemove={() => setVideoReference(null)}
            />
          )}

          {/* Prompt textarea. Mode determines placeholder. Cmd/Ctrl+Enter
              fires the active mode's generate. */}
          <textarea
            value={currentPrompt}
            onChange={e => setCurrentPrompt(e.target.value)}
            placeholder={currentPlaceholder}
            rows={3}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (currentPrompt.trim() && !generating) currentSend();
              }
            }}
            className="w-full resize-none bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[#6c7086] focus:outline-none"
          />

          {/* Bottom row — mode glyph dock left, attach + cost + send right. */}
          <div className="mt-2 flex items-center justify-between gap-2">
            {/* Mode glyph dock */}
            <div className="flex items-center gap-0.5">
              {modeGlyphs.map(g => (
                <Tooltip key={g.key} content={g.label}>
                  <button
                    onClick={() => setActiveTab(g.key)}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg border transition cursor-pointer ${
                      mode === g.key
                        ? 'border-[var(--accent)]/50 bg-[var(--accent)]/15 text-[var(--accent)]'
                        : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-input)]/50'
                    }`}
                  >
                    {g.icon}
                  </button>
                </Tooltip>
              ))}

              {/* Attach first-frame image — video mode only. Sent as
                  MiniMax `first_frame_image` for image-to-video. */}
              {composerAcceptsReference && (
                <ReferenceAttachButton
                  hasReference={!!videoReference}
                  onPick={handleUploadVideoReference}
                />
              )}
            </div>

            {/* Cost + send. The cost line goes amber when this single
                generation would push the user over their remaining
                balance — a soft warning, not a hard block (the server
                still does the cap check on submit). */}
            <div className="flex items-center gap-3">
              <Tooltip
                content={
                  account?.usage && currentCredits > tokensRemaining
                    ? t('dash.creative.cost_over_balance', { credits: currentCredits.toLocaleString(), balance: tokensRemaining.toLocaleString() })
                    : t('dash.creative.cost_for_generation', { credits: currentCredits.toLocaleString() })
                }
              >
                <span
                  className={`text-[10px] tabular-nums ${
                    account?.usage && currentCredits > tokensRemaining
                      ? 'text-amber-400 font-semibold'
                      : 'text-[var(--text-muted)]'
                  }`}
                >
                  {t('dash.creative.cost_cr', { credits: currentCredits.toLocaleString() })}
                </span>
              </Tooltip>
              <button
                onClick={currentSend}
                disabled={!currentPrompt.trim() || generating}
                className="rounded-lg bg-gradient-to-br from-[var(--accent)] to-purple-500 px-4 py-2 text-[12px] font-semibold text-white transition shadow-[0_0_18px_rgba(168,85,247,0.25)] hover:shadow-[0_0_22px_rgba(168,85,247,0.4)] disabled:cursor-not-allowed disabled:opacity-30 disabled:shadow-none border-none cursor-pointer"
              >
                {generating ? t('dash.creative.generating') : t('dash.creative.send')}
              </button>
            </div>
          </div>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-[var(--text-muted)]">
          {t('dash.creative.hint_newline')} ·{' '}
          <kbd className="rounded bg-[var(--bg-input)]/60 px-1 py-0.5 text-[9px]">{sendShortcutLabel()}</kbd> {t('dash.creative.hint_to_send')}
          {composerAcceptsReference && <> · {t('dash.creative.hint_drop_image')}</>}
        </p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Conversation-first canvas components
   ══════════════════════════════════════════════════════════════════════
   These render Creative Studio as a chat-style thread instead of a
   form-and-gallery split. EmptyInvitation greets with the brand voice;
   FeedCard renders one generation per kind; GeneratingCard is the
   live progress card; ModeSettingsStrip is the inline taste-shaping row
   that appears above the composer per-mode. ReferenceChip is the
   pinned-at-top thumbnail when a reference image is attached.
*/

// Suggestion pools + pickRandom now live in `@ava/core/creative` (shared
// with the IDE). EmptyInvitation picks 3 at random per visit so first
// impressions aren't the same Tokyo alley every time.

function EmptyInvitation({ mode, onSuggest }: { mode: 'images' | 'audio' | 'voice' | 'video'; onSuggest: (text: string) => void }) {
  useLocale();
  const modeLabel =
    mode === 'images' ? t('dash.creative.modeword_images') :
    mode === 'audio'  ? t('dash.creative.modeword_music') :
    mode === 'voice'  ? t('dash.creative.modeword_voice') :
                        t('dash.creative.modeword_video');

  // Pick 3 random suggestions per visit / mode change. Tick state lets
  // the user shuffle on demand without changing mode. useState (not
  // useMemo on Date.now()) keeps the picks stable through re-renders
  // until the user actually asks for new ones.
  const [shuffleTick, setShuffleTick] = useState(0);
  const picks = useMemo(
    () => pickRandom(SUGGESTIONS[mode], 3),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, shuffleTick],
  );

  return (
    <div className="flex flex-col items-start py-10 px-1">
      <h2 className="text-[18px] font-semibold text-[#cdd6f4]">{t('dash.creative.ready_title')}</h2>
      <p className="mt-1.5 text-[12px] text-[#9b8caa] max-w-md leading-relaxed">
        {t('dash.creative.ready_desc', { mode: modeLabel })}
      </p>
      <div className="mt-5 flex flex-col gap-2 w-full">
        {picks.map((s, i) => (
          <button
            key={`${mode}-${shuffleTick}-${i}`}
            onClick={() => onSuggest(s)}
            className="text-left rounded-xl border border-[rgba(168,85,247,0.12)] bg-transparent px-4 py-2.5 text-[12px] text-[var(--text-secondary)] transition hover:border-[rgba(168,85,247,0.35)] hover:bg-[#1a1625]/40 hover:text-white cursor-pointer"
          >
            {s}
          </button>
        ))}
      </div>
      <button
        onClick={() => setShuffleTick(t => t + 1)}
        className="mt-3 self-start text-[10px] text-[var(--text-muted)] hover:text-[var(--accent)] transition cursor-pointer bg-transparent border-none p-0"
      >
        {t('dash.creative.shuffle_suggestions')}
      </button>
    </div>
  );
}

function GeneratingCard({ mode, elapsed }: { mode: 'images' | 'audio' | 'voice' | 'video'; elapsed: number }) {
  useLocale();
  const label =
    mode === 'images' ? t('dash.creative.gen_image') :
    mode === 'audio'  ? t('dash.creative.gen_music') :
    mode === 'voice'  ? t('dash.creative.gen_voice') :
                        t('dash.creative.gen_video', { elapsed });
  return (
    <div className="rounded-2xl border border-[rgba(168,85,247,0.30)] bg-gradient-to-br from-[#0f0f17] to-[#1a1625] px-5 py-4 flex items-center gap-3">
      <div className="h-7 w-7 rounded-full border-[2.5px] border-[rgba(168,85,247,0.18)] border-t-[var(--accent)] animate-spin" />
      <div className="flex-1">
        <p className="text-[12px] font-medium text-[var(--text-primary)]">{label}</p>
        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
          {mode === 'video' ? t('dash.creative.gen_video_eta') : t('dash.creative.gen_eta')}
        </p>
      </div>
    </div>
  );
}

function ReferenceChip({ ref: refValue, onRemove }: { ref: { name: string; dataUrl: string }; onRemove: () => void }) {
  useLocale();
  return (
    <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-[rgba(168,85,247,0.20)] bg-[var(--bg-input)]/60 pl-1 pr-2 py-1">
      <img src={refValue.dataUrl} alt={refValue.name} className="h-7 w-7 rounded-md object-cover" />
      <span className="text-[10px] text-[var(--text-secondary)] max-w-[180px] truncate">{refValue.name}</span>
      <Tooltip content={t('dash.creative.remove_first_frame')}>
        <button
          onClick={onRemove}
          className="flex items-center justify-center text-[var(--text-muted)] hover:text-red-400 transition cursor-pointer bg-transparent border-none p-0"
        >
          <XIcon weight="bold" size={11} />
        </button>
      </Tooltip>
    </div>
  );
}

function ReferenceAttachButton({ hasReference, onPick }: { hasReference: boolean; onPick: (file: File) => void }) {
  useLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <Tooltip content={hasReference ? t('dash.creative.replace_first_frame') : t('dash.creative.attach_first_frame')}>
        <button
          onClick={() => inputRef.current?.click()}
          className={`flex h-8 w-8 items-center justify-center rounded-lg border transition cursor-pointer ${
            hasReference
              ? 'border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)]'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-input)]/50'
          }`}
        >
          <Paperclip weight="duotone" size={14} />
        </button>
      </Tooltip>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.target.value = '';
        }}
      />
    </>
  );
}

function FeedCard({
  item,
  onRegenerate,
  onDelete,
  onSendToVideo,
  onSendToVoice,
  onSendMusicToVideo,
}: {
  item: GalleryItem;
  onRegenerate: (item: GalleryItem) => void;
  onDelete: (item: GalleryItem) => void;
  onSendToVideo: (item: GalleryItem) => void;
  onSendToVoice: (item: GalleryItem) => void;
  onSendMusicToVideo: (item: GalleryItem) => void;
}) {
  useLocale();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

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
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    onDelete(item);
  };

  return (
    <div
      className="rounded-2xl border border-[rgba(168,85,247,0.16)] bg-gradient-to-br from-[#0f0f17] to-[#1a1625] overflow-hidden transition hover:border-[rgba(168,85,247,0.32)]"
      style={{ boxShadow: '0 0 0 rgba(168,85,247,0)' }}
    >
      {/* Prompt header */}
      <div className="px-4 pt-3 pb-2 text-[11px] text-[#a6adc8] leading-relaxed">
        {item.prompt || t('dash.creative.no_prompt')}
      </div>

      {/* Asset. Images cap at 60% viewport height with object-contain
          so the whole picture is visible without cropping AND the next
          feed card stays reachable without scrolling past one image.
          Video keeps its native player aspect; audio is small by
          nature. */}
      <div className="px-4 pb-3">
        {item.kind === 'image' && (
          <img
            src={item.url}
            alt={item.title || t('dash.creative.generated_image_alt')}
            className="mx-auto block rounded-xl object-contain"
            style={{ maxHeight: '32vh', maxWidth: '100%' }}
            loading="lazy"
          />
        )}
        {(item.kind === 'music' || item.kind === 'voice' || item.kind === 'sfx') && (
          <AudioPlayer src={item.url} />
        )}
        {item.kind === 'video' && (
          <VideoPlayer src={item.url} />
        )}
      </div>

      {/* Actions */}
      <div className="px-4 pb-3 flex flex-wrap gap-1.5 border-t border-[rgba(168,85,247,0.08)] pt-2.5">
        <FeedActionPill onClick={() => onRegenerate(item)}>{t('dash.creative.action_variations')}</FeedActionPill>
        {item.kind === 'image' && (
          <>
            <FeedActionPill accent onClick={() => onSendToVideo(item)}>→ {t('dash.creative.action_animate')}</FeedActionPill>
            <FeedActionPill accent onClick={() => onSendToVoice(item)}>→ {t('dash.creative.action_voiceover')}</FeedActionPill>
          </>
        )}
        {item.kind === 'music' && (
          <FeedActionPill accent onClick={() => onSendMusicToVideo(item)}>→ {t('dash.creative.action_use_as_score')}</FeedActionPill>
        )}
        <FeedActionPill onClick={handleCopy}>{copied ? `✓ ${t('dash.creative.copied')}` : t('dash.creative.copy_prompt')}</FeedActionPill>
        <FeedActionPill onClick={handleDownload}>{t('dash.chat.download')}</FeedActionPill>
        <FeedActionPill danger onClick={handleDelete}>
          {confirmDelete ? t('dash.creative.click_again') : t('dash.common.delete')}
        </FeedActionPill>
        {item.createdAt && (
          <span className="ml-auto text-[9px] text-[#585b70] self-center">
            {new Date(item.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
    </div>
  );
}

function FeedActionPill({ children, onClick, accent, danger }: { children: ReactNode; onClick: () => void; accent?: boolean; danger?: boolean }) {
  const base = 'rounded-md px-2.5 py-1 text-[10px] font-medium transition border cursor-pointer';
  const tone = danger
    ? 'border-red-500/20 bg-transparent text-[#f38ba8] hover:bg-red-500/10'
    : accent
    ? 'border-[rgba(168,85,247,0.35)] bg-[rgba(168,85,247,0.08)] text-[var(--accent)] hover:bg-[rgba(168,85,247,0.18)]'
    : 'border-[rgba(168,85,247,0.20)] bg-[rgba(49,34,68,0.5)] text-[#cdd6f4] hover:bg-[rgba(168,85,247,0.15)]';
  return (
    <button onClick={onClick} className={`${base} ${tone}`}>
      {children}
    </button>
  );
}

interface ModeSettingsStripProps {
  mode: 'images' | 'audio' | 'voice' | 'video';
  // image
  imageStyle: string; setImageStyle: (v: string) => void;
  imageSize: string; setImageSize: (v: string) => void;
  imageVariations: 1 | 2 | 4; setImageVariations: (v: 1 | 2 | 4) => void;
  imageNegative: string; setImageNegative: (v: string) => void;
  // music
  musicMood: string; setMusicMood: (v: string) => void;
  musicDuration: 30 | 60 | 90 | 120; setMusicDuration: (v: 30 | 60 | 90 | 120) => void;
  musicLyrics: string; setMusicLyrics: (v: string) => void;
  // voice
  voiceId: string; setVoiceId: (v: string) => void;
  avaVoice: boolean; setAvaVoice: React.Dispatch<React.SetStateAction<boolean>>;
  voiceEmotion: string; setVoiceEmotion: (v: string) => void;
  voiceSpeed: number; setVoiceSpeed: (v: number) => void;
  voicePitch: number; setVoicePitch: (v: number) => void;
  // video
  videoCamera: string; setVideoCamera: (v: string) => void;
  videoMotion: 'subtle' | 'dynamic' | 'wild'; setVideoMotion: (v: 'subtle' | 'dynamic' | 'wild') => void;
  videoDuration: 5 | 10; setVideoDuration: (v: 5 | 10) => void;
  videoResolution: '720P' | '1080P'; setVideoResolution: (v: '720P' | '1080P') => void;
}

function ModeSettingsStrip(props: ModeSettingsStripProps) {
  useLocale();
  const { mode } = props;
  const [open, setOpen] = useState(false);

  // Compact summary line — what the active mode is set to. Click the
  // trigger pill to open the settings overlay. Overlay sits above the
  // composer rather than expanding inline so the page never shifts
  // when settings open.
  const summary = (() => {
    if (mode === 'images') {
      const styleItem = IMAGE_STYLES.find(s => s.id === props.imageStyle);
      const style = styleItem ? t(styleItem.labelKey) : t('dash.creative.style_auto');
      const size = props.imageSize === '1280*1280' ? t('dash.creative.size_square') : props.imageSize === '768*1280' ? t('dash.creative.size_portrait') : t('dash.creative.size_landscape');
      const count = props.imageVariations === 1 ? t('dash.creative.one_image') : t('dash.creative.n_variations', { n: props.imageVariations });
      return `${style} · ${size} · ${count}`;
    }
    if (mode === 'audio') {
      const moodItem = MUSIC_MOODS.find(m => m.id === props.musicMood);
      const mood = moodItem ? t(moodItem.labelKey) : t('dash.creative.mood_auto');
      return `${mood} · ${props.musicDuration}s${props.musicLyrics ? ` · ${t('dash.creative.with_lyrics')}` : ''}`;
    }
    if (mode === 'voice') {
      const voiceItem = VOICES.find(v => v.id === props.voiceId);
      const voiceLabel = props.avaVoice ? t('dash.creative.voice_ava') : (voiceItem ? t(voiceItem.labelKey) : t('dash.creative.voice_calm_woman'));
      const emotionItem = VOICE_EMOTIONS.find(e => e.id === props.voiceEmotion);
      const emotion = emotionItem ? t(emotionItem.labelKey) : t('dash.creative.emotion_neutral');
      return `${voiceLabel} · ${emotion} · ${props.voiceSpeed}x`;
    }
    const camItem = VIDEO_CAMERAS.find(c => c.id === props.videoCamera);
    const cam = camItem ? t(camItem.labelKey) : t('dash.creative.camera_auto');
    const motItem = VIDEO_MOTION.find(m => m.id === props.videoMotion);
    const mot = motItem ? t(motItem.labelKey) : t('dash.creative.motion_dynamic');
    return `${cam} · ${mot} · ${props.videoDuration}s`;
  })();

  const modeLabel = mode === 'images' ? t('dash.creative.mode_image') : mode === 'audio' ? t('dash.creative.mode_music') : mode === 'voice' ? t('dash.creative.mode_voice') : t('dash.creative.mode_video');

  // Close on Escape — standard overlay affordance. Listener attached
  // only while open so it doesn't compete with the chat surface's
  // own Escape handler.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      {/* Trigger pill — sits inline above the composer. Mirrors the
          composer's rounded-xl + lavender-low-opacity treatment so it
          reads as part of the same surface group. */}
      <button
        onClick={() => setOpen(true)}
        className="w-full mb-2 rounded-xl border border-[rgba(168,85,247,0.12)] bg-[#0f0f17]/60 px-3 py-2 flex items-center justify-between text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:border-[rgba(168,85,247,0.25)] transition cursor-pointer"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="uppercase tracking-wider font-semibold opacity-70 shrink-0">{t('dash.creative.mode_settings', { mode: modeLabel })}</span>
          <span className="opacity-90 truncate">{summary}</span>
        </span>
        <Gear weight="duotone" size={14} className="shrink-0 ml-2 opacity-60" />
      </button>

      {/* Overlay — full-screen backdrop + centered settings card. Click
          the backdrop or hit Escape to close. Card uses the same
          gradient surface treatment as the composer / feed cards so
          it reads as part of the same dashboard, not a foreign modal. */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm p-3 sm:p-6 animate-[avaModalIn_120ms_ease-out]"
        >
          <style>{`
            @keyframes avaModalIn { from { opacity: 0 } to { opacity: 1 } }
            @keyframes avaModalCardIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
          `}</style>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[520px] max-h-[80vh] overflow-y-auto rounded-2xl border border-[rgba(168,85,247,0.20)] bg-gradient-to-br from-[#0f0f17] to-[#1a1625] shadow-[0_0_60px_rgba(168,85,247,0.12)]"
            style={{ animation: 'avaModalCardIn 160ms ease-out' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(168,85,247,0.10)]">
              <div>
                <h3 className="text-[13px] font-semibold text-[#cdd6f4]">{t('dash.creative.mode_settings', { mode: modeLabel })}</h3>
                <p className="text-[10px] text-[#9b8caa] mt-0.5">{summary}</p>
              </div>
              <Tooltip content={t('dash.creative.close_esc')}>
                <button
                  onClick={() => setOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-input)]/60 transition cursor-pointer bg-transparent border-none"
                >
                  <XIcon weight="bold" size={12} />
                </button>
              </Tooltip>
            </div>

            {/* Body */}
            <div className="px-4 py-4 space-y-3">
          {mode === 'images' && (
            <>
              <ChipRow label={t('dash.creative.label_style')} options={IMAGE_STYLES.map(s => ({ id: s.id, label: t(s.labelKey) }))} value={props.imageStyle} onChange={props.setImageStyle} />
              <ChipRow label={t('dash.creative.label_size')} options={[
                { id: '1280*1280', label: t('dash.creative.size_square') },
                { id: '768*1280', label: t('dash.creative.size_portrait') },
                { id: '1280*768', label: t('dash.creative.size_landscape') },
              ]} value={props.imageSize} onChange={props.setImageSize} />
              <ChipRow label={t('dash.creative.label_variations')} options={[
                { id: '1', label: '1' }, { id: '2', label: '2' }, { id: '4', label: '4' },
              ]} value={String(props.imageVariations)} onChange={(v) => props.setImageVariations(Number(v) as 1 | 2 | 4)} />
              <div>
                <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] block mb-1">{t('dash.creative.label_avoid')}</span>
                <input
                  type="text"
                  value={props.imageNegative}
                  onChange={e => props.setImageNegative(e.target.value)}
                  placeholder={t('dash.creative.avoid_placeholder')}
                  className="w-full rounded-md border border-[rgba(168,85,247,0.16)] bg-[var(--bg-input)] px-2.5 py-1.5 text-[11px] text-[var(--text-primary)] placeholder:text-[#6c7086] focus:border-[var(--accent)] focus:outline-none"
                />
              </div>
            </>
          )}
          {mode === 'audio' && (
            <>
              <ChipRow label={t('dash.creative.label_mood')} options={MUSIC_MOODS.map(m => ({ id: m.id, label: t(m.labelKey) }))} value={props.musicMood} onChange={props.setMusicMood} />
              <ChipRow label={t('dash.creative.label_duration')} options={[
                { id: '30', label: '30s' }, { id: '60', label: '60s' }, { id: '90', label: '90s' }, { id: '120', label: '120s' },
              ]} value={String(props.musicDuration)} onChange={(v) => props.setMusicDuration(Number(v) as 30 | 60 | 90 | 120)} />
              <div>
                <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] block mb-1">{t('dash.creative.label_lyrics')}</span>
                <textarea
                  value={props.musicLyrics}
                  onChange={e => props.setMusicLyrics(e.target.value)}
                  placeholder={t('dash.creative.lyrics_placeholder')}
                  rows={2}
                  className="w-full resize-none rounded-md border border-[rgba(168,85,247,0.16)] bg-[var(--bg-input)] px-2.5 py-1.5 text-[11px] text-[var(--text-primary)] placeholder:text-[#6c7086] focus:border-[var(--accent)] focus:outline-none"
                />
              </div>
            </>
          )}
          {mode === 'voice' && (
            <>
              <div>
                <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] block mb-1">{t('dash.creative.label_voice')}</span>
                <button
                  onClick={() => props.setAvaVoice(v => !v)}
                  className={`w-full flex items-center justify-between rounded-md px-2.5 py-1.5 text-[11px] font-medium transition border cursor-pointer mb-1 ${
                    props.avaVoice
                      ? 'border-[var(--accent)]/50 bg-[var(--accent)]/15 text-[var(--accent)]'
                      : 'border-[rgba(168,85,247,0.16)] bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className={`inline-block h-2 w-2 rounded-full ${props.avaVoice ? 'bg-[var(--accent)]' : 'bg-[var(--text-muted)]'}`} />
                    {t('dash.creative.avas_voice')}
                  </span>
                  <span className="text-[10px] opacity-70">{props.avaVoice ? t('dash.creative.voice_locked') : t('dash.creative.voice_pick_character')}</span>
                </button>
                {!props.avaVoice && (
                  <ChipRow label="" options={VOICES.map(v => ({ id: v.id, label: t(v.labelKey) }))} value={props.voiceId} onChange={props.setVoiceId} />
                )}
              </div>
              <ChipRow label={t('dash.creative.label_emotion')} options={VOICE_EMOTIONS.map(e => ({ id: e.id, label: t(e.labelKey) }))} value={props.voiceEmotion} onChange={props.setVoiceEmotion} />
              <ChipRow label={t('dash.creative.label_speed')} options={[
                { id: '0.8', label: '0.8x' }, { id: '1', label: '1x' }, { id: '1.2', label: '1.2x' }, { id: '1.5', label: '1.5x' },
              ]} value={String(props.voiceSpeed)} onChange={(v) => props.setVoiceSpeed(Number(v))} />
              <div>
                <div className="flex justify-between text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-1">
                  <span>{t('dash.creative.label_pitch')}</span>
                  <span className="opacity-90">{props.voicePitch >= 0 ? '+' : ''}{props.voicePitch} st</span>
                </div>
                <input
                  type="range" min={-12} max={12} step={1}
                  value={props.voicePitch}
                  onChange={e => props.setVoicePitch(Number(e.target.value))}
                  className="w-full accent-[var(--accent)]"
                />
              </div>
            </>
          )}
          {mode === 'video' && (
            <>
              <ChipRow label={t('dash.creative.label_camera')} options={VIDEO_CAMERAS.map(c => ({ id: c.id, label: t(c.labelKey) }))} value={props.videoCamera} onChange={props.setVideoCamera} />
              <ChipRow label={t('dash.creative.label_motion')} options={VIDEO_MOTION.map(m => ({ id: m.id, label: t(m.labelKey) }))} value={props.videoMotion} onChange={(v) => props.setVideoMotion(v as 'subtle' | 'dynamic' | 'wild')} />
              <ChipRow label={t('dash.creative.label_duration')} options={[
                { id: '5', label: '5s · audio' }, { id: '10', label: '10s · audio' },
              ]} value={String(props.videoDuration)} onChange={(v) => props.setVideoDuration(Number(v) as 5 | 10)} />
              <ChipRow label="Resolution" options={[
                { id: '720P', label: `720p · ${estimateVideoCredits('720P')} cr` },
                { id: '1080P', label: `1080p · ${estimateVideoCredits('1080P')} cr` },
              ]} value={props.videoResolution} onChange={(v) => props.setVideoResolution(v as '720P' | '1080P')} />
            </>
          )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[rgba(168,85,247,0.10)]">
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg bg-[var(--accent)]/15 border border-[var(--accent)]/35 px-3 py-1.5 text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/25 transition cursor-pointer"
              >
                {t('dash.creative.done')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ChipRow({ label, options, value, onChange }: { label: string; options: { id: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      {label && <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] block mb-1">{label}</span>}
      <div className="flex flex-wrap gap-1">
        {options.map(o => (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className={`rounded-md px-2.5 py-1 text-[10px] font-medium transition border-none cursor-pointer ${
              value === o.id
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
