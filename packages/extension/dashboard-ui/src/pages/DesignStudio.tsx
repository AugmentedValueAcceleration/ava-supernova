import { useEffect, useMemo, useRef, useState, useCallback, type ReactNode, type CSSProperties } from 'react';
import type { AccountInfo, ExtToDashboardMessage, ChatModel, ChatPlatformStatus } from '../types/messages';
import { PenNib } from '@phosphor-icons/react';
import { post } from '../App';
import { Chat } from './Chat';
import { ModelSelector } from '../chat/components/ModelSelector';

type DesignModelState = { models: ChatModel[]; activeModel: string | null; needsSetup: boolean; platformStatus: ChatPlatformStatus | null };
import { Select } from '../components/Select';
import { buildShapeSvg, svgToPngDataUrl } from '../lib/asset-forge/icon-svg';
import { searchShapes, getShape, type ShapeHit } from '../lib/asset-forge/shape-library';
import { activeKit, loadKits, upsertKit, type BrandKit } from '../lib/asset-forge/brand-kit';
import { MATERIALS, armatureSvg, composeIconPrompt, ICON_NEGATIVE } from '../lib/asset-forge/generate';

type GenOutcome = { ok: boolean; dataUrl?: string; error?: string };

/**
 * Design Studio — the user-facing home for guided asset generation, ported from
 * the operator hub's proven "Asset Forge". Slice A = the workspace layout + the
 * FREE deterministic vector lane (Lucide shape × style × brand colours, pure
 * client-side SVG — no backend). The generated (Qwen shape-as-dial) lane and the
 * Design Architect dock land in the next slices, wired host-side to the
 * platform /api/asset-forge/* routes. AI designs, code renders.
 */

const CHECKER = 'repeating-conic-gradient(#221a30 0% 25%, #181123 0% 50%) 50% / 16px 16px';

const PNG_SIZES = [1024, 512, 256, 128, 64, 32];

// Collapsed height of the chat dock (just the handle + static composer). The
// dock is bottom-anchored and animates its height to this ⇄ 58%, so the
// composer stays pinned at the bottom while the conversation slides above it.
const DOCK_COLLAPSED = 108;

// HSV↔hex helpers for the custom colour picker.
function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }
function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  const to = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}
function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return { h: 0, s: 0, v: 1 };
  const int = parseInt(m[1], 16);
  const r = ((int >> 16) & 255) / 255, g = ((int >> 8) & 255) / 255, b = (int & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) { if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return { h, s: max ? d / max : 0, v: max };
}

// On-brand custom colour picker — a bespoke popover (saturation/value square +
// hue slider, fully our design, NO OS dialog), plus one-click Brand-Kit
// swatches and a hex field. Replaces the raw <input type="color">.
function ColorField({ value, onChange, swatches }: { value: string; onChange: (v: string) => void; swatches: string[] }) {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState(value.toUpperCase());
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const ref = useRef<HTMLDivElement>(null);
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);

  useEffect(() => setHex(value.toUpperCase()), [value]);
  // Re-derive HSV from the value only when the picker opens, so square/hue drags
  // keep a stable hue instead of fighting the round-tripped hex.
  useEffect(() => { if (open) setHsv(hexToHsv(value)); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const commit = (next: { h: number; s: number; v: number }) => { setHsv(next); onChange(hsvToHex(next.h, next.s, next.v)); };
  const onSv = (e: { clientX: number; clientY: number }) => {
    const r = svRef.current?.getBoundingClientRect(); if (!r) return;
    commit({ ...hsv, s: clamp((e.clientX - r.left) / r.width, 0, 1), v: clamp(1 - (e.clientY - r.top) / r.height, 0, 1) });
  };
  const onHue = (e: { clientX: number }) => {
    const r = hueRef.current?.getBoundingClientRect(); if (!r) return;
    commit({ ...hsv, h: clamp((e.clientX - r.left) / r.width, 0, 1) * 360 });
  };
  const pickExternal = (v: string) => { onChange(v); setHsv(hexToHsv(v)); };
  const norm = value.toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} title="Change colour" aria-label="Change colour"
        className="w-7 h-7 rounded-md cursor-pointer border border-[var(--border-card)]" style={{ background: value }} />
      {open && (
        <div className="absolute z-[60] top-9 left-0 w-[200px] rounded-lg border border-[var(--border-card)] bg-[#1a1028] p-2.5 shadow-lg select-none">
          <div ref={svRef}
            onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); onSv(e); }}
            onPointerMove={e => { if (e.buttons) onSv(e); }}
            className="relative w-full h-[120px] rounded-md cursor-crosshair mb-2"
            style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))` }}>
            <div className="absolute w-3 h-3 rounded-full border-2 border-white shadow -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
          </div>
          <div ref={hueRef}
            onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); onHue(e); }}
            onPointerMove={e => { if (e.buttons) onHue(e); }}
            className="relative w-full h-3 rounded-full cursor-pointer mb-2.5"
            style={{ background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}>
            <div className="absolute top-1/2 w-3.5 h-3.5 rounded-full border-2 border-white shadow -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{ left: `${(hsv.h / 360) * 100}%` }} />
          </div>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-6 h-6 rounded-md border border-[var(--border-card)] shrink-0" style={{ background: value }} />
            <input value={hex}
              onChange={e => { const v = e.target.value.toUpperCase(); setHex(v); if (/^#[0-9A-F]{6}$/.test(v)) pickExternal(v); }}
              className="flex-1 min-w-0 px-2 py-1 rounded-md text-[11px] bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-card)] outline-none focus:border-[var(--accent)]" />
          </div>
          <div className="flex gap-1.5">
            {swatches.map((sw, i) => (
              <button key={i} onClick={() => pickExternal(sw)} title={sw.toUpperCase()} aria-label={sw}
                className="w-6 h-6 rounded-md cursor-pointer border" style={{ background: sw, borderColor: norm === sw.toUpperCase() ? 'var(--accent)' : 'var(--border-card)' }} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Collapsible inspector group — clickable uppercase header + chevron, remembers
// its own open state. defaultOpen=false starts collapsed (the vector styles).
function Section({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between w-full bg-transparent border-none p-0 cursor-pointer" style={{ marginBottom: open ? 9 : 0 }}>
        <span className="text-[10.5px] tracking-[1.2px] uppercase font-medium text-[var(--text-muted)]">{title}</span>
        <span className="text-[8px] text-[var(--text-muted)] transition-transform leading-none" style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▼</span>
      </button>
      {open && children}
    </div>
  );
}

// The IDE uses a `CARD_BORDER` const for the soft accent-tinted hairline; the
// extension's equivalent is the --border-card token. Alias it so the ported
// inline-styled players read identically to the IDE source.
const CARD_BORDER = 'var(--border-card)';

// mm:ss for the player time readouts.
function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// A bespoke horizontal drag bar — same pointer technique as ColorField's hue
// slider (onPointerDown → setPointerCapture, onPointerMove while buttons held,
// fraction derived from the track's bounding rect). Accent-filled progress + a
// draggable circular thumb. Used for the video scrubber and the volume control.
function DragBar({ value, onChange, height = 6, thumb = 13, dimTrack = 'var(--bg-input)', accent = 'var(--accent)', title }:
  { value: number; onChange: (v: number) => void; height?: number; thumb?: number; dimTrack?: string; accent?: string; title?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const seek = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect(); if (!r) return;
    onChange(clamp((clientX - r.left) / r.width, 0, 1));
  };
  const pct = clamp(value, 0, 1) * 100;
  return (
    <div ref={ref} title={title}
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); seek(e.clientX); }}
      onPointerMove={e => { if (e.buttons) seek(e.clientX); }}
      style={{ position: 'relative', width: '100%', height, borderRadius: 999, cursor: 'pointer', background: dimTrack, border: `1px solid ${CARD_BORDER}`, userSelect: 'none', touchAction: 'none' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, borderRadius: 999, background: accent, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: '50%', left: `${pct}%`, width: thumb, height: thumb, borderRadius: '50%', background: '#fff', border: `2px solid ${accent}`, boxShadow: '0 1px 4px rgba(0,0,0,0.5)', transform: 'translate(-50%,-50%)', pointerEvents: 'none' }} />
    </div>
  );
}

// A small round transport button (play/pause and friends), accent-tinted.
function TransportButton({ onClick, title, accent = false, children }:
  { onClick: () => void; title: string; accent?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-label={title}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: '50%', cursor: 'pointer', flexShrink: 0,
        border: `1px solid ${accent ? 'var(--accent)' : CARD_BORDER}`,
        background: accent ? 'var(--accent)' : 'var(--bg-input)',
        color: accent ? '#0d0916' : 'var(--text-primary)' }}>
      {children}
    </button>
  );
}

const iconBtnStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, cursor: 'pointer', flexShrink: 0, border: `1px solid ${CARD_BORDER}`, background: 'var(--bg-input)', color: 'var(--text-secondary)' };

// ── Bespoke Video player ────────────────────────────────────────────────────
// Dark stage + hand-built transport (NO <video controls>). A hidden <video ref>
// is wired so the controls "just work" the day a real src is set; with no src we
// drive a fake playhead over the chosen placeholder duration so the design is
// fully feelable. Scrubber = DragBar (ColorField pointer technique).
function VideoStage({ durationSec, src, generating }: { durationSec: number; src?: string; generating?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [isMax, setIsMax] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const lastRef = useRef<number>(0);

  const hasSrc = () => !!videoRef.current?.currentSrc;

  // A fresh clip arrived → rewind the transport so it plays the new one from 0.
  useEffect(() => { setPlaying(false); setProgress(0); }, [src]);

  // Fake playhead — advance progress over durationSec while playing and no real
  // clip is loaded. A real <video> drives progress via onTimeUpdate instead.
  useEffect(() => {
    if (!playing || hasSrc()) return;
    lastRef.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - lastRef.current) / 1000; lastRef.current = now;
      setProgress(p => {
        const next = p + dt / Math.max(0.1, durationSec);
        if (next >= 1) { setPlaying(false); return 1; }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, durationSec]);

  // Keep the (optional) real element in sync with our controls.
  useEffect(() => { if (videoRef.current) videoRef.current.volume = muted ? 0 : volume; }, [volume, muted]);

  const toggle = () => {
    const v = videoRef.current;
    setPlaying(prev => {
      const next = !prev;
      if (next && progress >= 1) setProgress(0);
      if (v && hasSrc()) { if (next) void v.play().catch(() => {}); else v.pause(); }
      return next;
    });
  };
  const seek = (frac: number) => {
    setProgress(frac);
    const v = videoRef.current;
    if (v && hasSrc() && Number.isFinite(v.duration)) v.currentTime = frac * v.duration;
  };
  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (v && hasSrc() && Number.isFinite(v.duration) && v.duration > 0) setProgress(v.currentTime / v.duration);
  };
  // "Fullscreen" = maximise within the panel. The real Fullscreen API is blocked
  // inside the VS Code webview (sandboxed iframe), so we fill the surface via a
  // fixed overlay instead — reliable on both the extension and the IDE.
  const toggleMax = () => setIsMax(m => !m);
  useEffect(() => {
    if (!isMax) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsMax(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMax]);

  const cur = progress * durationSec;

  return (
    <div style={isMax
      ? { position: 'fixed', inset: 0, zIndex: 2147483000, background: '#000', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }
      : { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Stage — clean dark (not the transparency checker; video isn't transparent) */}
      <div ref={stageRef} style={{ flex: 1, minHeight: 220, borderRadius: 12, border: `1px solid ${CARD_BORDER}`, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(120% 120% at 50% 30%, #171021, #0c0814)' }}>
        <video ref={videoRef} src={src || undefined} onTimeUpdate={onTimeUpdate} onEnded={() => setPlaying(false)} playsInline
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: 'transparent' }} />
        {!src && (
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center', padding: '0 32px', pointerEvents: 'none' }}>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="5" width="15" height="14" rx="2" /><path d="m17 9 5-3v12l-5-3" />
            </svg>
            <div style={{ fontSize: 13.5, color: 'var(--text-secondary)' }}>Your video will appear here</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 320, lineHeight: 1.6 }}>Describe it on the right — Ava generates it and it plays here.</div>
          </div>
        )}
        {generating && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'rgba(12,8,20,0.74)', backdropFilter: 'blur(2px)' }}>
            <div className="animate-spin" style={{ width: 26, height: 26, borderRadius: '50%', border: '2px solid var(--border-card)', borderTopColor: 'var(--accent)' }} />
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>Generating your video… this can take a minute or two.</div>
          </div>
        )}
      </div>

      {/* Transport chrome — bespoke, always visible so the design is feelable */}
      <div style={{ borderRadius: 12, border: `1px solid ${CARD_BORDER}`, background: 'rgba(20,13,32,0.7)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <TransportButton onClick={toggle} title={playing ? 'Pause' : 'Play'} accent>
            {playing
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>}
          </TransportButton>
          <div style={{ flex: 1, minWidth: 0 }}>
            <DragBar value={progress} onChange={seek} title="Scrub" />
          </div>
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fmtTime(cur)} / {fmtTime(durationSec)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" onClick={() => setMuted(m => !m)} title={muted ? 'Unmute' : 'Mute'} aria-label={muted ? 'Unmute' : 'Mute'} style={iconBtnStyle}>
            {muted || volume === 0
              ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z" /><line x1="22" y1="9" x2="16" y2="15" /><line x1="16" y1="9" x2="22" y2="15" /></svg>
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /></svg>}
          </button>
          <div style={{ width: 96 }}>
            <DragBar value={muted ? 0 : volume} onChange={v => { setVolume(v); setMuted(false); }} height={5} thumb={11} title="Volume" />
          </div>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={toggleMax} title={isMax ? 'Restore (Esc)' : 'Maximise'} aria-label={isMax ? 'Restore' : 'Maximise'} style={iconBtnStyle}>
            {isMax
              ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 3v3a2 2 0 0 1-2 2H3" /><path d="M21 8h-3a2 2 0 0 1-2-2V3" /><path d="M3 16h3a2 2 0 0 1 2 2v3" /><path d="M16 21v-3a2 2 0 0 1 2-2h3" /></svg>
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /></svg>}
          </button>
          <button type="button" onClick={() => {}} title="Save (coming soon)" aria-label="Save"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bespoke Waveform (voice) player ─────────────────────────────────────────
// The signature element: a custom-drawn waveform on a devicePixelRatio-aware
// <canvas>. Bars are a DETERMINISTIC function of index (no Math.random → stable
// render). The waveform IS the scrubber: pointer down/move on it seeks (same
// setPointerCapture technique as ColorField). Played bars bright accent,
// unplayed dimmed. No <audio controls> — a fake playhead sweeps on play.
function deterministicAmp(i: number): number {
  // Layered sines over the bar index → an organic-but-stable envelope in 0..1.
  const a = Math.sin(i * 0.45) * 0.5 + 0.5;
  const b = Math.sin(i * 0.13 + 1.7) * 0.5 + 0.5;
  const c = Math.sin(i * 0.9 + 0.3) * 0.25 + 0.25;
  return clamp(0.12 + (a * 0.55 + b * 0.3 + c * 0.15) * 0.88, 0.06, 1);
}

function WaveformPlayer({ voiceName, durationSec }: { voiceName: string; durationSec: number }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const lastRef = useRef<number>(0);
  const progressRef = useRef(0);
  useEffect(() => { progressRef.current = progress; }, [progress]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
    if (cssW === 0 || cssH === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    let accent = getComputedStyle(canvas).getPropertyValue('--accent').trim();
    if (!accent) accent = '#c9a2ff';
    const barW = 3, gap = 2, step = barW + gap;
    const count = Math.max(1, Math.floor(cssW / step));
    const mid = cssH / 2;
    const p = progressRef.current;
    for (let i = 0; i < count; i++) {
      const amp = deterministicAmp(i);
      const h = Math.max(2, amp * (cssH * 0.86));
      const x = i * step;
      const played = (i + 0.5) / count <= p;
      ctx.globalAlpha = played ? 1 : 0.26;
      ctx.fillStyle = accent;
      const y = mid - h / 2;
      const r = Math.min(1.5, barW / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + barW, y, x + barW, y + h, r);
      ctx.arcTo(x + barW, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + barW, y, r);
      ctx.closePath();
      ctx.fill();
    }
    // Playhead line.
    ctx.globalAlpha = 1;
    const px = clamp(p, 0, 1) * cssW;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(px - 0.75, 0, 1.5, cssH);
  }, []);

  // Redraw on progress change.
  useEffect(() => { draw(); }, [progress, draw]);
  // Redraw on resize (ResizeObserver) + once on mount.
  useEffect(() => {
    draw();
    const el = wrapRef.current; if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(el);
    return () => ro.disconnect();
  }, [draw]);

  // Fake playhead sweep on play.
  useEffect(() => {
    if (!playing) return;
    lastRef.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - lastRef.current) / 1000; lastRef.current = now;
      setProgress(pr => {
        const next = pr + dt / Math.max(0.1, durationSec);
        if (next >= 1) { setPlaying(false); return 1; }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, durationSec]);

  const toggle = () => setPlaying(prev => { const next = !prev; if (next && progressRef.current >= 1) setProgress(0); return next; });
  const seek = (clientX: number) => {
    const r = canvasRef.current?.getBoundingClientRect(); if (!r) return;
    setProgress(clamp((clientX - r.left) / r.width, 0, 1));
  };

  const cur = progress * durationSec;

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 14, justifyContent: 'center' }}>
      <div style={{ borderRadius: 14, border: `1px solid ${CARD_BORDER}`, background: 'radial-gradient(120% 140% at 50% 0%, #171021, #0c0814)', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Waveform = scrubber */}
        <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: 120 }}>
          <canvas ref={canvasRef}
            onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); seek(e.clientX); }}
            onPointerMove={e => { if (e.buttons) seek(e.clientX); }}
            style={{ width: '100%', height: '100%', display: 'block', cursor: 'pointer', touchAction: 'none' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <TransportButton onClick={toggle} title={playing ? 'Pause' : 'Play'} accent>
            {playing
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>}
          </TransportButton>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{voiceName}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Voiceover preview</span>
          </div>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fmtTime(cur)} / {fmtTime(durationSec)}</span>
          <button type="button" onClick={() => {}} title="Save (coming soon)" aria-label="Save"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
            Save
          </button>
        </div>
      </div>
      <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>No audio yet — this is the transport. Write a script on the right and Ava speaks it here.</div>
    </div>
  );
}

type ViewId = 'icon' | 'iconset' | 'appicon' | 'logo' | 'badge' | 'avatar' | 'banner' | 'hero' | 'ogimage' | 'illustration' | 'pattern' | 'gamekit' | 'gamepiece' | 'canvas' | 'video' | 'voice' | 'brandkit';

// Left-nav group accent colours mirror the hub (Web/App purple, Game orange,
// Open Canvas blue).
const GROUPS: { label: string; accent: string; items: { id: ViewId; label: string; badge?: string }[] }[] = [
  { label: 'Web / App', accent: 'var(--accent)', items: [
    { id: 'icon', label: 'Icon' },
    { id: 'iconset', label: 'Icon Set', badge: 'SOON' },
    { id: 'appicon', label: 'App Icon / Favicon', badge: 'SOON' },
    { id: 'logo', label: 'Logo', badge: 'NEXT' },
    { id: 'badge', label: 'Badge / Mark', badge: 'SOON' },
    { id: 'avatar', label: 'Avatar', badge: 'SOON' },
    { id: 'banner', label: 'Banner', badge: 'SOON' },
    { id: 'hero', label: 'Hero', badge: 'SOON' },
    { id: 'ogimage', label: 'Social / OG Image', badge: 'SOON' },
    { id: 'illustration', label: 'Illustration', badge: 'SOON' },
    { id: 'pattern', label: 'Pattern / Background', badge: 'SOON' },
  ] },
  { label: 'Game', accent: '#f0a24b', items: [
    { id: 'gamekit', label: 'UI Kit', badge: 'SOON' }, { id: 'gamepiece', label: 'Single Piece', badge: 'SOON' },
  ] },
  { label: 'Open Canvas', accent: '#6aa9ff', items: [
    { id: 'video', label: 'Video' },
    { id: 'voice', label: 'Voiceover' },
    { id: 'canvas', label: 'Image', badge: 'SOON' },
  ] },
];

// Qwen3-TTS built-in voice roster — PLACEHOLDER names for the shell (no wiring).
const VOICES = ['Aria', 'Ovis', 'Nofish', 'Cherry', 'Ember', 'Sunny', 'Marcus', 'Willow', 'Koda'];

export function DesignStudio({ onRegisterDesignChatDispatch, designModelState, onSwitchDesignModel, userName, userAvatarUrl }: {
  account?: AccountInfo | null;
  onRegisterDesignChatDispatch?: (dispatch: (msg: ExtToDashboardMessage) => void) => void;
  designModelState?: DesignModelState;
  onSwitchDesignModel?: (id: string) => void;
  userName?: string | null;
  userAvatarUrl?: string | null;
}) {
  const kit = useMemo(() => activeKit(), []);
  const [view, setView] = useState<ViewId>('icon');
  // Which room the Design Architect chat should reflect. The Open-Canvas Video
  // and Voiceover views map to their own rooms; everything else is the icon
  // studio (greeting / chips / heading / persona all follow this).
  const designRoom: 'icon' | 'video' | 'voice' = view === 'video' ? 'video' : view === 'voice' ? 'voice' : 'icon';

  const [query, setQuery] = useState('');
  const [shapeId, setShapeId] = useState('Bell');
  const [color, setColor] = useState<string>(kit.palette.primary);
  const [boardBg, setBoardBg] = useState(CHECKER);

  // ── Video lane (Wan 2.5 via host: submit → poll → clip) ──
  const [videoDuration, setVideoDuration] = useState('5'); // Wan: '5' | '10' seconds only
  const [videoAspect, setVideoAspect] = useState('16:9');
  const [videoResolution, setVideoResolution] = useState('1080p');
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoGenerating, setVideoGenerating] = useState(false);

  // ── Voice lane (UI shell — local state only) ──
  const [voiceName, setVoiceName] = useState(VOICES[0]);
  const [voiceScript, setVoiceScript] = useState('');
  const [voiceEmotion, setVoiceEmotion] = useState('neutral');
  const [voiceSpeed, setVoiceSpeed] = useState('1.0');

  // Design Studio is a GENERATION surface — the free deterministic vector-icon
  // styling moves to the Library tab (all the free icon packs, usable in any
  // project). Here: pick a shape → a material → your colour → generate.
  const [materialId, setMaterialId] = useState('glass');
  const [genResult, setGenResult] = useState<string | null>(null);
  const [genStatus, setGenStatus] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [genSize, setGenSize] = useState(512);
  const [dockOpen, setDockOpen] = useState(false);
  // Keep the conversation mounted through the slide-down so the collapse
  // animates too (not just the expand): true while open, and for one transition
  // after it closes, then it unmounts leaving the static composer.
  const [renderConv, setRenderConv] = useState(false);
  useEffect(() => {
    if (dockOpen) { setRenderConv(true); return; }
    const t = window.setTimeout(() => setRenderConv(false), 320);
    return () => window.clearTimeout(t);
  }, [dockOpen]);
  const material = MATERIALS.find(m => m.id === materialId) ?? MATERIALS[0];
  // The real Ava avatar — the host injects it as a webview URI on #root, the
  // same one the chat bubbles use (relative paths don't load in a webview).
  const avaAvatarUri = typeof document !== 'undefined' ? document.getElementById('root')?.dataset.avaAvatarUri : '';

  const hits = useMemo(() => searchShapes(query, 24), [query]);
  const shape = useMemo(() => getShape(shapeId), [shapeId]);

  // A generated result belongs to one (shape × material × colour); invalidate.
  useEffect(() => { setGenResult(null); setGenError(null); }, [shapeId, materialId, color]);

  // One generation in flight → one resolver. runGeneration parks the resolver
  // here; the asset_forge_result listener below fulfils it. Both the Generate
  // button and the Design Architect's tools await the same path.
  const genResolverRef = useRef<((r: GenOutcome) => void) | null>(null);
  // Latest generated PNG, read by design_save / set auto-save without stale closures.
  const genResultRef = useRef<string | null>(null);
  useEffect(() => { genResultRef.current = genResult; }, [genResult]);

  // The host runs the pipeline and posts the matted PNG back here. We update the
  // canvas AND resolve whatever generation is awaiting (button or tool).
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const m = e.data as { type?: string; success?: boolean; dataUrl?: string; error?: string };
      if (!m || m.type !== 'asset_forge_result') return;
      if (m.success && m.dataUrl) { setGenResult(m.dataUrl); setDockOpen(false); } // icon's ready → slide the chat down, reveal it on the canvas
      else setGenError(m.error || 'Generation failed');
      setGenStatus(null);
      const resolve = genResolverRef.current;
      if (resolve) {
        genResolverRef.current = null;
        resolve(m.success && m.dataUrl ? { ok: true, dataUrl: m.dataUrl } : { ok: false, error: m.error || 'Generation failed' });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Shape-as-dial: render the shape to a white-silhouette armature, hand it to
  // the host with an art-director prompt → Qwen-Image-edit-max → server matte.
  // Returns a promise so a caller can await the matted result.
  // `look` is Ava's authored art direction (or a material preset's text). The
  // prompt composer wraps it in the locked, matte-critical isolation frame.
  const runGeneration = (shapeHit: ShapeHit, look: string, colorHex: string): Promise<GenOutcome> => {
    return new Promise<GenOutcome>((resolve) => {
      genResolverRef.current = resolve;
      setGenError(null); setGenResult(null);
      setGenStatus('Preparing…');
      svgToPngDataUrl(armatureSvg(shapeHit), 1024, 1024)
        .then((armature) => {
          const prompt = composeIconPrompt(shapeHit.label, look, colorHex);
          setGenStatus('Generating with Qwen-Image…');
          post({ type: 'asset_forge_generate', body: { prompt, referenceImage: armature, size: '1024*1024', negativePrompt: ICON_NEGATIVE } });
        })
        .catch((e) => {
          genResolverRef.current = null;
          const err = e instanceof Error ? e.message : 'Generation failed';
          setGenError(err); setGenStatus(null);
          resolve({ ok: false, error: err });
        });
    });
  };

  // ── Video lane wiring (mirror of the icon runGeneration/resolver pattern) ──
  // One video in flight → one parked resolver. runVideoGeneration posts to the
  // host and awaits `asset_forge_video_result`; the listener below fulfils it.
  type VideoOutcome = { ok: boolean; url?: string; error?: string };
  const videoResolverRef = useRef<((r: VideoOutcome) => void) | null>(null);
  // Submit a Wan 2.5 job to the host (POST + poll) and await the finished clip.
  // `resolution` is the exact route value ('720P' | '1080P'); duration is 5 | 10.
  const runVideoGeneration = (prompt: string, duration: string, aspect: string, resolution: string): Promise<VideoOutcome> => {
    return new Promise<VideoOutcome>((resolve) => {
      videoResolverRef.current = resolve;
      setVideoSrc(null);
      setVideoGenerating(true);
      post({ type: 'asset_forge_video', body: { prompt, duration: Number(duration), aspect, resolution } } as any);
    });
  };
  // The host runs submit+poll and posts the finished clip URL back. We drop it on
  // the stage AND resolve whatever generation is awaiting (the design tool).
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const m = e.data as { type?: string; success?: boolean; url?: string; error?: string };
      if (!m || m.type !== 'asset_forge_video_result') return;
      setVideoGenerating(false);
      const ok = !!m.success && !!m.url;
      if (ok) { setVideoSrc(m.url!); setDockOpen(false); } // clip ready → slide the chat down, reveal it
      const resolve = videoResolverRef.current;
      if (resolve) {
        videoResolverRef.current = null;
        resolve(ok ? { ok: true, url: m.url } : { ok: false, error: m.error || 'Video generation failed' });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Resolve a Lucide id ("Camera") or a plain subject ("camera") to a shape.
  const resolveShape = (idOrSubject: string): ShapeHit | null => {
    const s = idOrSubject.trim();
    if (!s) return null;
    return getShape(s) ?? searchShapes(s, 1)[0] ?? null;
  };

  // Save a matted PNG to the local creative library (transparent icon).
  const saveToLibrary = (dataUrl: string, title: string) => {
    post({ type: 'save_creative_to_disk', url: dataUrl, filename: `${title}.png`, assetType: 'image', prompt: title } as any);
  };

  // ── Design Architect tool bridge ──────────────────────────────────────────
  // Ava's design_* tools post a `design_tool` command (via the host); we run it
  // against this canvas using the same code the UI uses, then reply. Held in a
  // ref reassigned every render so it always closes over fresh state.
  const cmdHandlerRef = useRef<(m: { requestId: string; command: string; args: Record<string, unknown> }) => void>(() => {});
  cmdHandlerRef.current = async (m) => {
    const reply = (ok: boolean, data?: unknown, error?: string) =>
      post({ type: 'design_tool_result', requestId: m.requestId, ok, data, error } as any);
    const args = m.args || {};
    try {
      if (m.command === 'find_shape') {
        const q = String(args.query ?? '').trim();
        const shapes = searchShapes(q, 8).map((s) => ({ id: s.id, label: s.label }));
        reply(true, { shapes });
        return;
      }
      if (m.command === 'generate_icon') {
        const resolved = resolveShape(String(args.shape ?? ''));
        if (!resolved) { reply(false, undefined, `No shape matches "${String(args.shape ?? '')}".`); return; }
        const artDir = typeof args.art_direction === 'string' ? args.art_direction.trim() : '';
        const matArg = MATERIALS.find((x) => x.id === args.material);
        const mat = matArg ?? material; // for the inspector preset display
        const look = artDir || mat.prompt; // Ava's authored look wins; material preset is the fallback
        const col = typeof args.colour === 'string' && /^#[0-9a-fA-F]{6}$/.test(args.colour) ? args.colour : color;
        // Sync the inspector so the user sees what she's making.
        setView('icon'); setShapeId(resolved.id); if (matArg) setMaterialId(matArg.id);
        setColor(col); if (typeof args.size === 'number') setGenSize(args.size);
        const out = await runGeneration(resolved, look, col);
        if (out.ok) reply(true, { label: resolved.label, material: artDir ? 'custom-direction' : mat.label, credits: 20 });
        else reply(false, undefined, out.error || 'Generation failed.');
        return;
      }
      if (m.command === 'generate_set') {
        const list = Array.isArray(args.shapes) ? (args.shapes as unknown[]).map(String) : [];
        const artDir = typeof args.art_direction === 'string' ? args.art_direction.trim() : '';
        const matArg = MATERIALS.find((x) => x.id === args.material);
        const mat = matArg ?? material;
        const look = artDir || mat.prompt; // one look held constant across the whole family
        const col = typeof args.colour === 'string' && /^#[0-9a-fA-F]{6}$/.test(args.colour) ? args.colour : color;
        setView('icon'); if (matArg) setMaterialId(matArg.id); setColor(col);
        let made = 0; const failed: string[] = [];
        for (const s of list) {
          const resolved = resolveShape(s);
          if (!resolved) { failed.push(s); continue; }
          setShapeId(resolved.id);
          const out = await runGeneration(resolved, look, col);
          if (out.ok && out.dataUrl) { made++; saveToLibrary(out.dataUrl, `${resolved.label}-${mat.label}`.toLowerCase().replace(/\s+/g, '-')); }
          else failed.push(resolved.label);
        }
        reply(true, { made, failed, credits: made * 20 });
        return;
      }
      if (m.command === 'brand_kit') {
        if (args.action === 'update') {
          const kits = loadKits();
          const active = activeKit();
          const next: BrandKit = {
            ...active,
            name: typeof args.name === 'string' && args.name.trim() ? args.name.trim() : active.name,
            palette: { ...active.palette, ...(args.palette as Partial<BrandKit['palette']> | undefined ?? {}) },
            styleTags: Array.isArray(args.styleTags) ? (args.styleTags as unknown[]).map(String) : active.styleTags,
          };
          upsertKit(next);
          void kits;
          reply(true, { name: next.name, palette: next.palette, styleTags: next.styleTags });
        } else {
          const k = activeKit();
          reply(true, { name: k.name, palette: k.palette, styleTags: k.styleTags });
        }
        return;
      }
      if (m.command === 'generate_video') {
        const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : '';
        if (!prompt) { reply(false, undefined, 'A prompt is required to generate a video.'); return; }
        setView('video');
        // Wan duration is 5 or 10 seconds only.
        const dur = (args.duration === 10 || args.duration === '10') ? '10' : '5';
        setVideoDuration(dur);
        // Aspect + resolution both go to Wan (mapped to its `size` param
        // server-side), so 9:16 genuinely renders vertical.
        const asp = typeof args.aspect === 'string' && ['16:9', '9:16', '1:1'].includes(args.aspect) ? args.aspect : videoAspect;
        setVideoAspect(asp);
        const resArg = typeof args.resolution === 'string' && args.resolution.includes('1080') ? '1080p'
          : typeof args.resolution === 'string' && args.resolution.includes('720') ? '720p'
          : videoResolution;
        setVideoResolution(resArg);
        const wanRes = resArg === '1080p' ? '1080P' : '720P'; // route: '480P' | '720P' | '1080P'
        const out = await runVideoGeneration(prompt, dur, asp, wanRes);
        if (out.ok) reply(true, { duration: Number(dur), credits: wanRes === '1080P' ? 300 : 150 });
        else reply(false, undefined, out.error || 'Video generation failed.');
        return;
      }
      if (m.command === 'save') {
        const url = genResultRef.current;
        if (!url) { reply(false, undefined, 'Nothing on the canvas to save yet.'); return; }
        const title = (typeof args.title === 'string' && args.title.trim())
          ? args.title.trim()
          : `${(getShape(shapeId)?.label ?? 'icon')}-${material.label}`.toLowerCase().replace(/\s+/g, '-');
        saveToLibrary(url, title);
        reply(true, { title });
        return;
      }
      reply(false, undefined, `Unknown design command: ${m.command}`);
    } catch (e) {
      reply(false, undefined, e instanceof Error ? e.message : 'Design command failed');
    }
  };
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const m = e.data as { type?: string; requestId?: string; command?: string; args?: Record<string, unknown> };
      if (m?.type === 'design_tool' && m.requestId && m.command) {
        cmdHandlerRef.current({ requestId: m.requestId, command: m.command, args: m.args ?? {} });
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const boards: { bg: string; label: string }[] = [
    { bg: CHECKER, label: 'checker' }, { bg: '#000000', label: 'black' },
    { bg: '#ffffff', label: 'white' }, { bg: kit.palette.surface, label: 'brand surface' },
  ];


  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* LEFT RAIL — the three areas, permanently separate */}
      <nav className="w-[220px] shrink-0 border-r border-[var(--border-card)] flex flex-col p-3 overflow-y-auto">
        {GROUPS.map(g => (
          <div key={g.label} className="mb-3.5">
            <div className="flex items-center gap-1.5 px-2.5 pb-1.5 text-[10px] tracking-[1.4px] uppercase font-semibold" style={{ color: g.accent }}>
              <span className="w-[3px] h-3 rounded" style={{ background: g.accent }} />{g.label}
            </div>
            {g.items.map(it => {
              const on = view === it.id;
              // Badged items aren't built yet — inactive so the nav never implies
              // something works when it doesn't. Only 'Icon' is live.
              const disabled = !!it.badge;
              return (
                <button key={it.id} onClick={disabled ? undefined : () => setView(it.id)} disabled={disabled}
                  className={`flex items-center gap-2 w-full px-2.5 py-[7px] rounded-lg text-[12.5px] text-left border ${
                    disabled ? 'opacity-45 cursor-default border-transparent bg-transparent text-[var(--text-secondary)] font-light'
                    : on ? 'cursor-pointer border-[var(--accent)]/40 bg-[var(--accent)]/12 text-[var(--accent)] font-normal'
                    : 'cursor-pointer border-transparent bg-transparent text-[var(--text-secondary)] font-light hover:text-[var(--text-primary)]'
                  }`}>
                  {it.label}
                  {it.badge && <span className="ml-auto text-[9px] tracking-wider text-[var(--text-muted)] border border-[var(--border-card)] px-1.5 rounded-full">{it.badge}</span>}
                </button>
              );
            })}
          </div>
        ))}
        <div className="mt-auto border-t border-[var(--border-card)] pt-2">
          <button onClick={() => setView('brandkit')}
            className={`flex items-center gap-2 w-full px-2.5 py-[7px] rounded-lg text-[12.5px] text-left cursor-pointer border ${
              view === 'brandkit' ? 'border-[var(--accent)]/40 bg-[var(--accent)]/12 text-[var(--accent)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}>
            Brand Kit
            <span className="ml-auto flex gap-[3px]">
              <span className="w-[9px] h-[9px] rounded-full" style={{ background: kit.palette.primary }} />
              <span className="w-[9px] h-[9px] rounded-full" style={{ background: kit.palette.accent }} />
            </span>
          </button>
        </div>
      </nav>

      {/* CENTRE — the stage. The designer dock OVERLAYS the lower part when
          expanded (the canvas stays full-size behind it); relative anchors it.
          paddingBottom reserves room for the collapsed dock so the canvas
          content never hides behind the static composer. */}
      <div className="flex-1 flex flex-col min-w-0 relative" style={{ paddingBottom: DOCK_COLLAPSED }}>
        {/* TOP BAR — the model dropdown + credit balance, always visible (BYOK:
            dropdown for everyone; credit only for platform users). */}
        <div className="flex items-center gap-3 px-6 py-2 border-b border-[var(--border-card)] shrink-0">
          <ModelSelector
            models={designModelState?.models ?? []}
            activeModel={designModelState?.activeModel ?? null}
            needsSetup={designModelState?.needsSetup ?? false}
            onSwitch={(id) => onSwitchDesignModel?.(id)}
            onOpenDashboard={() => {}}
          />
          <div className="flex-1" />
          {(() => {
            const ps = designModelState?.platformStatus;
            if (!ps?.connected) return null;
            const limit = (ps.freeTokensLimit ?? 0) + (ps.subTokensLimit ?? 0);
            const used = (ps.freeTokensUsed ?? 0) + (ps.subTokensUsed ?? 0);
            if (limit >= 999_999_999) return <span className="text-[11px] tabular-nums opacity-50" style={{ fontFamily: 'monospace', color: '#6c7086' }}>∞ credits</span>;
            if (limit <= 0) return null;
            const remaining = Math.max(0, limit - used);
            const pct = (used / limit) * 100;
            const color = pct >= 95 ? '#ef4444' : pct >= 80 ? '#eab308' : '#a6e3a1';
            return <span className="text-[11px] tabular-nums font-semibold" style={{ fontFamily: 'monospace', color }} title={`${remaining.toLocaleString()} of ${limit.toLocaleString()} credits remaining`}>{remaining.toLocaleString()} left</span>;
          })()}
        </div>
        {view === 'icon' ? (
          <div className="flex-1 min-h-0 px-6 py-5 flex flex-col overflow-hidden">
            <div className="mb-3">
              <h2 className="text-[17px] font-normal text-[var(--text-primary)]">Icon</h2>
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5">Your shape, your brand, any material — generated and matted to a clean transparent icon.</p>
            </div>
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-[11px] text-[var(--text-muted)]">Check against</span>
              {boards.map(b => (
                <button key={b.label} onClick={() => setBoardBg(b.bg)} title={b.label} aria-label={b.label}
                  className="w-5 h-5 rounded cursor-pointer" style={{ background: b.bg, border: `1px solid ${boardBg === b.bg ? '#fff' : 'var(--border-card)'}` }} />
              ))}
            </div>
            <div className="flex-1 min-h-[240px] rounded-xl border border-[var(--border-card)] flex flex-col items-center justify-center gap-3.5 relative" style={{ background: boardBg }}>
              {genResult && <img src={genResult} alt="Generated icon" className="w-[200px] h-[200px] object-contain" />}
              {!genResult && !genStatus && shape && (
                <>
                  <div className="w-[132px] h-[132px] opacity-80" dangerouslySetInnerHTML={{ __html: buildShapeSvg(shape.elements, 'flat', ['#8b93b8'], 2.6) }} />
                  <p className="text-[12px] text-[var(--text-muted)] max-w-[320px] text-center leading-relaxed"><b className="text-[var(--text-secondary)] font-medium">{material.label}</b> — Qwen restyles this shape into the material, then mattes it to a clean transparent icon.</p>
                </>
              )}
              {genStatus && (
                <div className="flex flex-col items-center gap-2.5 text-[12.5px] text-[var(--text-secondary)]">
                  <div className="w-[22px] h-[22px] rounded-full border-2 border-[var(--border-card)] border-t-[var(--accent)] animate-spin" />
                  {genStatus}
                </div>
              )}
            </div>
            {genError && <p className="text-[12px] text-red-400 mt-2.5">{genError}</p>}
          </div>
        ) : view === 'video' ? (
          <div className="flex-1 min-h-0 px-6 py-5 flex flex-col overflow-hidden">
            <div className="mb-3.5">
              <h2 className="text-[17px] font-normal text-[var(--text-primary)]">Video</h2>
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5">Describe a shot — Ava generates a short clip and it plays in this bespoke stage.</p>
            </div>
            <VideoStage durationSec={Number(videoDuration)} src={videoSrc ?? undefined} generating={videoGenerating} />
          </div>
        ) : view === 'voice' ? (
          <div className="flex-1 min-h-0 px-6 py-5 flex flex-col overflow-hidden">
            <div className="mb-3.5">
              <h2 className="text-[17px] font-normal text-[var(--text-primary)]">Voiceover</h2>
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5">Pick a voice, write the line — Ava speaks it and it renders as a waveform you can scrub.</p>
            </div>
            <WaveformPlayer voiceName={voiceName} durationSec={8} />
          </div>
        ) : view === 'brandkit' ? (
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <h2 className="text-[17px] font-normal text-[var(--text-primary)]">Brand Kit</h2>
            <p className="text-[12px] text-[var(--text-muted)] mt-0.5 mb-4">Set once — every tool reads it. The Design Architect will propose updates when she arrives.</p>
            <div className="max-w-[460px]">
              <label className="text-[11px] text-[var(--text-muted)] block mb-1.5">Palette</label>
              {(Object.keys(kit.palette) as (keyof typeof kit.palette)[]).map(role => (
                <div key={role} className="flex items-center gap-2.5 py-1 text-[12.5px] text-[var(--text-secondary)]">
                  <span className="w-6 h-6 rounded" style={{ background: kit.palette[role] }} />
                  <span className="capitalize">{role}</span>
                  <code className="ml-auto text-[11px] text-[var(--text-muted)]">{kit.palette[role].toUpperCase()}</code>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-2.5 text-center px-10 text-[var(--text-muted)]">
            <PenNib weight="duotone" size={26} style={{ color: 'var(--accent)' }} />
            <span className="text-[15px] text-[var(--text-secondary)]">{GROUPS.flatMap(g => g.items).find(i => i.id === view)?.label}</span>
            <span className="max-w-[420px] text-[13px] leading-relaxed">Being brought over from the hub. The Icon lane is live — this one lands in an upcoming slice.</span>
          </div>
        )}

        {/* DESIGN ARCHITECT DOCK — bottom-anchored. The composer stays STATIC at
            the bottom while the conversation slides UP above it: the dock grows
            upward (height animates COLLAPSED ⇄ 58%), so the composer never moves.
            Auto: slides up when you focus the composer to type, slides down when
            an icon finishes generating. The height transition IS the slide. */}
        <div
          className="absolute left-0 right-0 bottom-0 z-30 flex flex-col overflow-hidden transition-[height] duration-300 ease-out"
          style={{ height: dockOpen ? '58%' : DOCK_COLLAPSED, background: 'rgba(13,9,22,0.97)' }}
        >
          {/* one clean expand/hide handle, just above the static composer */}
          <div className="shrink-0 flex justify-center pt-1.5 pb-1 border-t border-[var(--accent)]/25">
            <button onClick={() => setDockOpen(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-[var(--border-card)] text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition"
              style={{ background: 'rgba(13,9,22,0.92)' }}>
              <span className="w-[14px] h-[14px] rounded-full overflow-hidden inline-flex items-center justify-center text-[8px] font-semibold text-white" style={{ background: 'linear-gradient(135deg, var(--accent), #6366f1)' }}>
                {avaAvatarUri ? <img src={avaAvatarUri} alt="" className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} /> : 'A'}
              </span>
              Design Architect
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: dockOpen ? 'rotate(180deg)' : 'none' }} aria-hidden="true"><polyline points="18 15 12 9 6 15" /></svg>
            </button>
          </div>
          {/* messages (flex-1) sit above the composer, which is pinned to the
              bottom. renderConv keeps them mounted through the slide-down so the
              collapse animates too — justify-end keeps the composer flush at the
              bottom when collapsed (no dead space below it). */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col justify-end">
            <Chat
              lane="design"
              designRoom={designRoom}
              isActive
              hideHeader
              hideMessages={!renderConv}
              onRegisterDispatch={onRegisterDesignChatDispatch ?? (() => {})}
              onComposerFocus={() => setDockOpen(true)}
              userName={userName ?? null}
              userAvatarUrl={userAvatarUrl ?? null}
            />
          </div>
        </div>
      </div>

      {/* RIGHT RAIL — the inspector (icon lane) */}
      {view === 'icon' && (
        <aside className="w-[320px] shrink-0 border-l border-[var(--border-card)] flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-[18px]">
            <Section title="Shape">
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder={'Search 1,990 shapes… "bell"'}
                className="w-full px-3 py-2 rounded-lg text-[12px] outline-none bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-card)] box-border" />
              <div className="grid grid-cols-4 gap-[7px] mt-2.5">
                {hits.map((h: ShapeHit) => {
                  const on = h.id === shapeId;
                  return (
                    <button key={h.id} onClick={() => setShapeId(h.id)} title={h.label} aria-label={h.label}
                      className="aspect-square rounded-lg cursor-pointer p-[9px]" style={{ background: on ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--bg-input)', border: `1px solid ${on ? 'var(--accent)' : 'var(--border-card)'}` }}
                      dangerouslySetInnerHTML={{ __html: buildShapeSvg(h.elements, 'line', [on ? '#c9a2ff' : '#8b93b8']) }} />
                  );
                })}
              </div>
              <p className="text-[10.5px] text-[var(--text-muted)] mt-1.5">Lucide · 1,990 shapes · licence-clean (ISC)</p>
            </Section>

            <Section title="Material — generated (Qwen-Image)">
              <div className="grid grid-cols-2 gap-2">
                {MATERIALS.map(m => {
                  const on = materialId === m.id;
                  return (
                    <button key={m.id} onClick={() => setMaterialId(m.id)} title={m.label}
                      className={`px-2.5 py-[7px] rounded-lg cursor-pointer text-[11.5px] text-center border ${
                        on ? 'border-[var(--accent)]/40 bg-[var(--accent)]/12 text-[var(--accent)]' : 'border-[var(--border-card)] bg-[var(--bg-input)] text-[var(--text-secondary)]'
                      }`}>{m.label}</button>
                  );
                })}
              </div>
              <p className="text-[10.5px] text-[var(--text-muted)] mt-1.5">The shape becomes a reference the model paints onto — then matted to a transparent icon. Uses credits.</p>
            </Section>

            <Section title="Colour — from Brand Kit">
              <div className="flex items-center gap-2.5 py-1 text-[12px] text-[var(--text-secondary)]">
                <ColorField value={color} onChange={setColor} swatches={Object.values(kit.palette)} />
                Icon colour
                <code className="ml-auto text-[10.5px] text-[var(--text-muted)]">{color.toUpperCase()}</code>
              </div>
              <p className="text-[10.5px] text-[var(--text-muted)] mt-1">The material is rendered in this colour.</p>
            </Section>

            <Section title="Output">
              <div className="flex items-center justify-between text-[12px] text-[var(--text-secondary)] py-[5px]">
                <span>Icon size</span>
                <Select size="sm" className="w-[118px]" value={String(genSize)} onChange={v => setGenSize(Number(v))}
                  options={PNG_SIZES.map(s => ({ value: String(s), label: `${s} × ${s}` }))} />
              </div>
              <p className="text-[10.5px] text-[var(--text-muted)]">Generated at a 1024 master, exported at your chosen size. Save / export land next.</p>
            </Section>
          </div>

          {/* No Generate button — Ava generates now. Ask her in the dock; she
              sets these controls and fires the shape-as-dial pipeline herself. */}
        </aside>
      )}

      {/* RIGHT RAIL — the inspector (video lane) */}
      {view === 'video' && (
        <aside className="w-[320px] shrink-0 border-l border-[var(--border-card)] flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-[18px]">
            <Section title="Output">
              <div className="flex items-center justify-between text-[12px] text-[var(--text-secondary)] py-[5px]">
                <span>Duration</span>
                <Select size="sm" className="w-[118px]" value={videoDuration} onChange={v => setVideoDuration(v)}
                  options={[{ value: '5', label: '5s' }, { value: '10', label: '10s' }]} />
              </div>
              <div className="flex items-center justify-between text-[12px] text-[var(--text-secondary)] py-[5px]">
                <span>Aspect ratio</span>
                <Select size="sm" className="w-[118px]" value={videoAspect} onChange={v => setVideoAspect(v)}
                  options={[{ value: '16:9', label: '16:9' }, { value: '9:16', label: '9:16' }, { value: '1:1', label: '1:1' }]} />
              </div>
              <div className="flex items-center justify-between text-[12px] text-[var(--text-secondary)] py-[5px]">
                <span>Resolution</span>
                <Select size="sm" className="w-[118px]" value={videoResolution} onChange={v => setVideoResolution(v)}
                  options={[{ value: '720p', label: '720p' }, { value: '1080p', label: '1080p' }]} />
              </div>
            </Section>

            <p className="text-[10.5px] text-[var(--text-muted)] m-0">Talk to Ava — she directs the shot and generates it.</p>
          </div>
        </aside>
      )}

      {/* RIGHT RAIL — the inspector (voice lane) */}
      {view === 'voice' && (
        <aside className="w-[320px] shrink-0 border-l border-[var(--border-card)] flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-[18px]">
            <Section title="Voice">
              <div className="grid grid-cols-3 gap-2">
                {VOICES.map(v => {
                  const on = v === voiceName;
                  return (
                    <button key={v} onClick={() => setVoiceName(v)} title={v}
                      className={`px-1.5 py-2 rounded-lg cursor-pointer text-[11.5px] text-center overflow-hidden text-ellipsis whitespace-nowrap border ${
                        on ? 'border-[var(--accent)]/40 bg-[var(--accent)]/12 text-[var(--accent)]' : 'border-[var(--border-card)] bg-[var(--bg-input)] text-[var(--text-secondary)]'
                      }`}>{v}</button>
                  );
                })}
              </div>
              <p className="text-[10.5px] text-[var(--text-muted)] mt-2">Qwen3-TTS built-in voices. Placeholder names — the real roster lands with wiring.</p>
            </Section>

            <Section title="Script">
              <textarea value={voiceScript} onChange={e => setVoiceScript(e.target.value)}
                placeholder="Type the line for Ava to speak…"
                rows={4}
                className="w-full resize-y min-h-[80px] px-3 py-2.5 rounded-lg text-[12px] leading-normal outline-none bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-card)] box-border"
                style={{ fontFamily: 'inherit' }} />
            </Section>

            <Section title="Delivery">
              <div className="flex items-center justify-between text-[12px] text-[var(--text-secondary)] py-[5px]">
                <span>Emotion</span>
                <Select size="sm" className="w-[130px]" value={voiceEmotion} onChange={v => setVoiceEmotion(v)}
                  options={[{ value: 'neutral', label: 'Neutral' }, { value: 'warm', label: 'Warm' }, { value: 'bright', label: 'Bright' }, { value: 'calm', label: 'Calm' }, { value: 'excited', label: 'Excited' }]} />
              </div>
              <div className="flex items-center justify-between text-[12px] text-[var(--text-secondary)] py-[5px]">
                <span>Speed</span>
                <Select size="sm" className="w-[130px]" value={voiceSpeed} onChange={v => setVoiceSpeed(v)}
                  options={[{ value: '0.75', label: '0.75×' }, { value: '1.0', label: '1.0×' }, { value: '1.25', label: '1.25×' }]} />
              </div>
            </Section>

            <p className="text-[10.5px] text-[var(--text-muted)] m-0">Talk to Ava — she writes the read and voices it.</p>
          </div>
        </aside>
      )}
    </div>
  );
}
