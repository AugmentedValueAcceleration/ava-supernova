import { useState, useEffect, useRef } from 'react';
import { useLocale } from '../i18n';
import type { AccountInfo } from '../types/messages';

/* ── Constants ─────────────────────────────────────────────────────── */

const PLATFORM_URL = 'https://ava-supernova.com/api';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

const TABS = [
  { key: 'images', icon: '\uD83D\uDDBC\uFE0F', label: 'Images' },
  { key: 'audio', icon: '\uD83C\uDFB5', label: 'Audio' },
  { key: 'voice', icon: '\uD83C\uDF99\uFE0F', label: 'Voice' },
  /* { key: 'sfx', icon: '\uD83D\uDD0A', label: 'SFX' }, */
  { key: 'video', icon: '\uD83C\uDFAC', label: 'Video' },
  { key: 'library', icon: '\uD83D\uDCDA', label: 'Library' },
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

const LIBRARY_FILTERS: { key: LibraryFilter; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: '\uD83D\uDCCB' },
  { key: 'images', label: 'Images', icon: '\uD83D\uDDBC\uFE0F' },
  { key: 'music', label: 'Music', icon: '\uD83C\uDFB5' },
  { key: 'video', label: 'Video', icon: '\uD83C\uDFAC' },
  { key: 'voice', label: 'Voice', icon: '\uD83C\uDF99\uFE0F' },
  { key: 'documents', label: 'Documents', icon: '\uD83D\uDCC4' },
  { key: 'spreadsheets', label: 'Spreadsheets', icon: '\uD83D\uDCCA' },
  { key: 'presentations', label: 'Presentations', icon: '\uD83D\uDCBD' },
];

/* ── Auth helpers ──────────────────────────────────────────────────── */

function getAuthHeaders(): Record<string, string> {
  const key = localStorage.getItem('ava-platform-key') || '';
  return {
    'Content-Type': 'application/json',
    ...(key ? { Authorization: `Bearer ${key}` } : {}),
  };
}

function hasAuth(): boolean {
  return !!localStorage.getItem('ava-platform-key');
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
  const tokensUsed = usage ? (usage.tokens_used + usage.free_tokens_used) : 0;
  const tokensLimit = usage ? (usage.tokens_limit || usage.free_tokens_limit) : 0;
  const tokenPct = tokensLimit > 0 ? Math.min((tokensUsed / tokensLimit) * 100, 100) : 0;

  const [activeTab, setActiveTab] = useState<string>('images');
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
    if (!requiresAuth()) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`${PLATFORM_URL}/generate-image`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ prompt: imagePrompt.trim(), size: imageSize, model: 'minimax' }),
      });
      if (!res.ok) throw new Error(`Image generation failed (${res.status})`);
      const data = await res.json();
      if (data.url) {
        setLastImage(data.url);
        saveLocalAsset('image', data.url, imagePrompt.slice(0, 60), imagePrompt);
      } else throw new Error(data.error || 'No image URL returned');
    } catch (e: any) {
      setError(e.message || 'Image generation failed');
    }
    setGenerating(false);
  };

  /* ── Music generation ─────────────────────────────────────────────── */

  const handleGenerateMusic = async () => {
    if (!musicPrompt.trim() || generating) return;
    if (!requiresAuth()) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`${PLATFORM_URL}/generate-music`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ prompt: musicPrompt.trim(), lyrics: musicLyrics.trim() || undefined }),
      });
      if (!res.ok) throw new Error(`Music generation failed (${res.status})`);
      const data = await res.json();
      if (data.url) {
        setLastAudio(data.url);
        saveLocalAsset('music', data.url, musicPrompt.slice(0, 60), musicPrompt);
      } else throw new Error(data.error || 'No audio URL returned');
    } catch (e: any) {
      setError(e.message || 'Music generation failed');
    }
    setGenerating(false);
  };

  /* ── Voice generation ─────────────────────────────────────────────── */

  const handleGenerateVoice = async () => {
    if (!voiceText.trim() || generating) return;
    if (!requiresAuth()) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`${PLATFORM_URL}/generate-voice`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ text: voiceText.trim(), voice_id: voiceId, speed: voiceSpeed }),
      });
      if (!res.ok) throw new Error(`Voice generation failed (${res.status})`);
      const data = await res.json();
      if (data.url) {
        setLastVoice(data.url);
        saveLocalAsset('voice', data.url, voiceText.slice(0, 60), voiceText);
      } else throw new Error(data.error || 'No voice URL returned');
    } catch (e: any) {
      setError(e.message || 'Voice generation failed');
    }
    setGenerating(false);
  };

  /* ── Video generation ─────────────────────────────────────────────── */

  const handleGenerateVideo = async () => {
    if (!videoPrompt.trim() || generating) return;
    if (!requiresAuth()) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`${PLATFORM_URL}/generate-video`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ prompt: videoPrompt.trim(), duration: videoDuration }),
      });
      if (!res.ok) throw new Error(`Video generation failed (${res.status})`);
      const data = await res.json();
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
                <span>Token Balance</span>
                <span>{tokenPct.toFixed(0)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-[var(--bg-input)] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    tokenPct > 90 ? 'bg-red-500' : tokenPct > 70 ? 'bg-amber-500' : 'bg-[var(--accent)]'
                  }`}
                  style={{ width: `${tokenPct}%` }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-[var(--text-muted)] mt-0.5">
                <span>{formatTokens(tokensUsed)}</span>
                <span>{formatTokens(tokensLimit)}</span>
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
            {tab.icon} {tab.label}
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
                {f.icon} {f.label}
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

              {/* Detail panel */}
              {selectedAsset && (
                <div className="w-72 shrink-0 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4">
                  <div className="mb-3 flex items-start justify-between">
                    <h3 className="text-sm font-semibold text-white truncate pr-2">
                      {selectedAsset.title || selectedAsset.name || 'Untitled'}
                    </h3>
                    <button
                      onClick={() => { setSelectedAsset(null); setConfirmDelete(false); }}
                      className="shrink-0 text-xs text-[var(--text-muted)] hover:text-white transition"
                    >
                      {'\u2715'}
                    </button>
                  </div>

                  {/* Preview */}
                  {['image', 'graphic'].includes(selectedAsset.asset_type || '') && selectedAsset.url ? (
                    <img
                      src={selectedAsset.url}
                      alt=""
                      className="mb-3 w-full rounded-lg object-contain"
                    />
                  ) : ['music', 'voice', 'sfx'].includes(selectedAsset.asset_type || '') && selectedAsset.url ? (
                    <div className="mb-3">
                      <AudioPlayer src={selectedAsset.url} />
                    </div>
                  ) : selectedAsset.asset_type === 'video' && selectedAsset.url ? (
                    <video
                      controls
                      src={selectedAsset.url}
                      className="mb-3 w-full rounded-lg"
                    />
                  ) : (
                    <div className="mb-3 flex h-32 items-center justify-center rounded-lg bg-[var(--bg-input)] text-4xl opacity-30">
                      {typeIcon(selectedAsset.asset_type || selectedAsset.type || '')}
                    </div>
                  )}

                  {/* Metadata */}
                  {selectedAsset.prompt && (
                    <p className="mb-3 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                      {selectedAsset.prompt}
                    </p>
                  )}
                  {selectedAsset.created_at && (
                    <p className="mb-3 text-[10px] text-[var(--text-muted)]">
                      Created {new Date(selectedAsset.created_at).toLocaleString()}
                    </p>
                  )}

                  {/* Actions */}
                  <div className="space-y-2">
                    {selectedAsset.url && (
                      <a
                        href={selectedAsset.url}
                        download
                        target="_blank"
                        rel="noreferrer"
                        className="block w-full rounded-lg bg-[var(--accent)] py-2 text-center text-xs font-medium text-white transition hover:opacity-90"
                      >
                        Download
                      </a>
                    )}

                    {!confirmDelete ? (
                      <button
                        onClick={() => setConfirmDelete(true)}
                        className="w-full rounded-lg border border-[var(--border-card)] py-2 text-xs font-medium text-[var(--text-secondary)] transition hover:border-red-400/50 hover:text-red-400"
                      >
                        Delete
                      </button>
                    ) : (
                      <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                        <p className="mb-2 text-xs text-red-400">Are you sure?</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setConfirmDelete(false)}
                            className="flex-1 rounded-md border border-[var(--border-card)] py-1.5 text-xs text-[var(--text-secondary)] transition hover:text-white"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleDeleteAsset(selectedAsset)}
                            className="flex-1 rounded-md bg-red-500/20 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/30"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
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
                  <video
                    controls
                    src={lastVideo}
                    className="w-full rounded-lg"
                  />
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
