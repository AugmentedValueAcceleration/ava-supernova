import { useEffect, useMemo, useRef, useState, useCallback, type ReactNode, type CSSProperties } from 'react';
import type { AccountInfo, ExtToDashboardMessage, ChatModel, ChatPlatformStatus } from '../types/messages';
import { PenNib } from '@phosphor-icons/react';
import { post } from '../App';
import { Chat } from './Chat';
import { ModelSelector } from '../chat/components/ModelSelector';

type DesignModelState = { models: ChatModel[]; activeModel: string | null; needsSetup: boolean; platformStatus: ChatPlatformStatus | null };
import { Select } from '../components/Select';
import { tt, useLocale } from '../i18n';
import { buildShapeSvg, svgToPngDataUrl } from '../lib/asset-forge/icon-svg';
import { searchShapes, getShape, type ShapeHit } from '../lib/asset-forge/shape-library';
import { activeKit, loadKits, upsertKit, setActiveKit, createKit, deleteKit, type BrandKit } from '../lib/asset-forge/brand-kit';
import { MATERIALS, armatureSvg, composeIconPrompt, ICON_NEGATIVE, withBrandDirection } from '../lib/asset-forge/generate';
import { buildLettermark } from '../lib/asset-forge/logo/lettermark';
import { typesetWordmark } from '../lib/asset-forge/logo/wordmark';
import { composeLogoSystem, brandInk } from '../lib/asset-forge/logo/compose';
import { emblemVariants } from '../lib/asset-forge/logo/emblem';
import { fontById, suggestFont, WORDMARK_FONTS } from '../lib/asset-forge/logo/fonts';
import { loadFont, registerWordmarkFonts } from '../lib/asset-forge/logo/pipeline';
import { renderMark, renderElements, type MarkSpec, type MarkStyle } from '../lib/asset-forge/logo/mark-primitives';
import type { LogoBrief, LogoSystem, LogoVariant } from '../lib/asset-forge/logo/types';
import { DESIGN_GROUPS, type ViewId } from '../lib/design-types';
import { toWebp } from '../lib/compress';

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

// Logo styles — REAL vector paints from the shape engine, not prompt words. A
// gradient logo is a true SVG gradient: still scalable, still exact, no model.
const LOGO_STYLES: { id: MarkStyle; label: string }[] = [
  { id: 'flat', label: 'Solid' },
  { id: 'gradient', label: 'Gradient' },
  { id: 'line', label: 'Monoline' },
  { id: 'duotone', label: 'Duotone' },
];
/** Styles that paint with a second colour. */
const TWO_TONE = (s: MarkStyle) => s === 'gradient' || s === 'duotone';

/** How the mark gets made. */
const MARK_TYPES: { id: 'letter' | 'geometry' | 'icon'; label: string }[] = [
  { id: 'geometry', label: 'Constructed' },
  { id: 'letter', label: 'Lettermark' },
  { id: 'icon', label: 'Icon' },
];

// Compose N logo lockups into ONE contact-sheet SVG — a numbered grid Ava can
// see all at once to compare and pick (best-of-N). Each lockup is embedded as a
// nested <svg> with its own viewBox, so preserveAspectRatio fits it cleanly.
function contactSheetSvg(items: { svg: string; label: string }[]): { svg: string; w: number; h: number } {
  const n = items.length;
  const cols = n <= 2 ? n : 2;
  const rows = Math.ceil(n / cols);
  const CELL = 380, PAD = 22, LBL = 36;
  const W = cols * CELL + (cols + 1) * PAD;
  const H = rows * (CELL + LBL) + (rows + 1) * PAD;
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const parts = [`<rect width="${W}" height="${H}" fill="#ffffff"/>`];
  items.forEach((it, i) => {
    const vbM = /viewBox="([\d.\-]+) ([\d.\-]+) ([\d.]+) ([\d.]+)"/.exec(it.svg);
    const vb = vbM ? `${vbM[1]} ${vbM[2]} ${vbM[3]} ${vbM[4]}` : '0 0 100 100';
    const inner = it.svg.replace(/^[\s\S]*?<svg[^>]*>/i, '').replace(/<\/svg>\s*$/i, '');
    const col = i % cols, row = Math.floor(i / cols);
    const x = PAD + col * (CELL + PAD), y = PAD + row * (CELL + LBL + PAD);
    parts.push(`<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="12" fill="#f5f5f7"/>`);
    parts.push(`<svg x="${x + 26}" y="${y + 26}" width="${CELL - 52}" height="${CELL - 52}" viewBox="${vb}" preserveAspectRatio="xMidYMid meet">${inner}</svg>`);
    parts.push(`<text x="${x + CELL / 2}" y="${y + CELL + 24}" text-anchor="middle" font-family="sans-serif" font-size="19" font-weight="600" fill="#111111">${i + 1}. ${esc(it.label)}</text>`);
  });
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${parts.join('')}</svg>`, w: W, h: H };
}

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
      <button onClick={() => setOpen(o => !o)} title={tt('dash.studio.change_colour','Change colour')} aria-label={tt('dash.studio.change_colour','Change colour')}
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
function VideoStage({ durationSec, src, generating, onDownload }: { durationSec: number; src?: string; generating?: boolean; onDownload?: () => void }) {
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
            <div style={{ fontSize: 13.5, color: 'var(--text-secondary)' }}>{tt('dash.studio.video.empty','Your video will appear here')}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 320, lineHeight: 1.6 }}>{tt('dash.studio.video.empty_hint','Describe it on the right — Ava generates it and it plays here.')}</div>
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
            <DragBar value={progress} onChange={seek} title={tt('dash.studio.transport.scrub','Scrub')} />
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
            <DragBar value={muted ? 0 : volume} onChange={v => { setVolume(v); setMuted(false); }} height={5} thumb={11} title={tt('dash.studio.transport.volume','Volume')} />
          </div>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={toggleMax} title={isMax ? 'Restore (Esc)' : 'Maximise'} aria-label={isMax ? 'Restore' : 'Maximise'} style={iconBtnStyle}>
            {isMax
              ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 3v3a2 2 0 0 1-2 2H3" /><path d="M21 8h-3a2 2 0 0 1-2-2V3" /><path d="M3 16h3a2 2 0 0 1 2 2v3" /><path d="M16 21v-3a2 2 0 0 1 2-2h3" /></svg>
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /></svg>}
          </button>
          <button type="button" onClick={onDownload} disabled={!src || !onDownload} title={tt('ext.studio.download_copy','Download a copy')} aria-label={tt('ext.studio.download_copy','Download a copy')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, cursor: src && onDownload ? 'pointer' : 'default', opacity: src && onDownload ? 1 : 0.45, fontSize: 12, fontWeight: 600, border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
            Download
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

// A short display name for a generated voiceover, derived from its script.
function deriveVoiceTitle(script: string): string {
  const clean = script.replace(/\s+/g, ' ').trim();
  if (!clean) return 'Voiceover';
  const words = clean.split(' ');
  return words.length > 6 ? words.slice(0, 6).join(' ') + '…' : words.join(' ');
}

// Short display name for any generated clip, derived from its prompt.
function deriveMediaTitle(text: string, fallback = 'Clip'): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return fallback;
  const words = clean.split(' ');
  return words.length > 6 ? words.slice(0, 6).join(' ') + '…' : words.join(' ');
}

function WaveformPlayer({ voiceName, title, durationSec, src, generating, onDownload }: { voiceName: string; title?: string; durationSec: number; src?: string; generating?: boolean; onDownload?: () => void }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [realDur, setRealDur] = useState(0); // real <audio> duration once loaded (0 = not yet)
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const rafRef = useRef<number>(0);
  const lastRef = useRef<number>(0);
  const progressRef = useRef(0);
  useEffect(() => { progressRef.current = progress; }, [progress]);

  // True once a real clip is loaded — then the <audio> drives progress and the
  // fake sweep stays off (mirror of VideoStage.hasSrc).
  const hasSrc = () => !!audioRef.current?.currentSrc;
  // A fresh clip arrived → rewind the transport so it plays the new one from 0.
  useEffect(() => { setPlaying(false); setProgress(0); setRealDur(0); }, [src]);

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

  // Fake playhead sweep on play — ONLY when no real clip is loaded. With real
  // audio, onTimeUpdate drives progress instead (mirror of VideoStage).
  useEffect(() => {
    if (!playing || hasSrc()) return;
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

  // The real duration once loaded wins over the placeholder so the clock + scrub
  // math track actual playback.
  const dur = realDur > 0 ? realDur : durationSec;

  const toggle = () => {
    const a = audioRef.current;
    setPlaying(prev => {
      const next = !prev;
      if (next && progressRef.current >= 1) setProgress(0);
      if (a && hasSrc()) {
        if (next) { if (progressRef.current >= 1) a.currentTime = 0; void a.play().catch(() => {}); }
        else a.pause();
      }
      return next;
    });
  };
  const seek = (clientX: number) => {
    const r = canvasRef.current?.getBoundingClientRect(); if (!r) return;
    const frac = clamp((clientX - r.left) / r.width, 0, 1);
    setProgress(frac);
    const a = audioRef.current;
    if (a && hasSrc() && Number.isFinite(a.duration)) a.currentTime = frac * a.duration;
  };
  const onTimeUpdate = () => {
    const a = audioRef.current;
    if (a && hasSrc() && Number.isFinite(a.duration) && a.duration > 0) setProgress(a.currentTime / a.duration);
  };
  const onLoadedMeta = () => {
    const a = audioRef.current;
    if (a && Number.isFinite(a.duration) && a.duration > 0) setRealDur(a.duration);
  };

  const cur = progress * dur;

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 14, justifyContent: 'center' }}>
      {/* Real audio — hidden; the bespoke transport below drives it. */}
      <audio ref={audioRef} src={src || undefined} onLoadedMetadata={onLoadedMeta} onTimeUpdate={onTimeUpdate} onEnded={() => setPlaying(false)} style={{ display: 'none' }} />
      <div style={{ borderRadius: 14, border: `1px solid ${CARD_BORDER}`, background: 'radial-gradient(120% 140% at 50% 0%, #171021, #0c0814)', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Waveform = scrubber. A generating overlay dims it while Ava synthesises. */}
        <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: 120 }}>
          <canvas ref={canvasRef}
            onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); seek(e.clientX); }}
            onPointerMove={e => { if (e.buttons) seek(e.clientX); }}
            style={{ width: '100%', height: '100%', display: 'block', cursor: src ? 'pointer' : 'default', touchAction: 'none' }} />
          {generating && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, background: 'rgba(12,8,20,0.66)', backdropFilter: 'blur(2px)', borderRadius: 10 }}>
              <div className="animate-spin" style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid var(--border-card)', borderTopColor: 'var(--accent)' }} />
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Voicing your read…</div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <TransportButton onClick={toggle} title={playing ? 'Pause' : 'Play'} accent>
            {playing
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>}
          </TransportButton>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title || voiceName}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{title ? voiceName : 'Voiceover preview'}</span>
          </div>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fmtTime(cur)} / {fmtTime(dur)}</span>
          <button type="button" onClick={onDownload} disabled={!src || !onDownload} title={tt('ext.studio.download_copy','Download a copy')} aria-label={tt('ext.studio.download_copy','Download a copy')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, cursor: src && onDownload ? 'pointer' : 'default', opacity: src && onDownload ? 1 : 0.45, fontSize: 12, fontWeight: 600, border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
            Download
          </button>
        </div>
      </div>
      <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>{src ? 'Play or scrub the waveform to hear the read.' : 'No audio yet — ask Ava for a voiceover and it plays here.'}</div>
    </div>
  );
}

// Qwen3-TTS curated voice roster — the exact Qwen voice ids the platform route
// speaks. Ava picks one from here; the user can override in the inspector.
const VOICES = ['Cherry', 'Serena', 'Vivian', 'Maia', 'Bellona', 'Ethan', 'Moon', 'Vincent', 'Neil', 'Kai'];
// The 10 spoken languages Qwen3-TTS supports. Ava translates the script herself
// and sets the language; the SAME voice speaks the translated words.
const VOICE_LANGUAGES = ['English', 'French', 'Spanish', 'German', 'Japanese', 'Korean', 'Italian', 'Portuguese', 'Chinese', 'Russian'];

export function DesignStudio({ onRegisterDesignChatDispatch, designModelState, onSwitchDesignModel, userName, userAvatarUrl }: {
  account?: AccountInfo | null;
  onRegisterDesignChatDispatch?: (dispatch: (msg: ExtToDashboardMessage) => void) => void;
  designModelState?: DesignModelState;
  onSwitchDesignModel?: (id: string) => void;
  userName?: string | null;
  userAvatarUrl?: string | null;
}) {
  useLocale();  // re-render Studio labels when the language changes
  const [kit, setKit] = useState<BrandKit>(() => activeKit());     // the ACTIVE kit
  const [panelKit, setPanelKit] = useState<BrandKit | null>(null);  // kit shown in the right drawer
  const [panelOpen, setPanelOpen] = useState(false);                // drawer slid in?
  const [confirmDelete, setConfirmDelete] = useState<BrandKit | null>(null); // kit pending delete-confirm
  // Edit the kit in the drawer — persist live; keep the active copy in sync if it's the one.
  const saveKit = (patch: Partial<BrandKit>) => {
    if (!panelKit) return;
    const next = { ...panelKit, ...patch, updatedAt: Date.now() };
    upsertKit(next); setPanelKit(next);
    if (next.id === kit.id) setKit(next);
  };
  // Read a picked logo file → data URL → into the kit's primary logo slot.
  const onLogoFile = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === 'string') saveKit({ logo: { ...(panelKit?.logo ?? {}), primary: reader.result } }); };
    reader.readAsDataURL(file);
  };
  const openKit = (id: string) => { setPanelKit(loadKits().find(k => k.id === id) ?? null); setPanelOpen(true); };
  const addKit = () => { setPanelKit(createKit('New brand')); setPanelOpen(true); };
  const closePanel = () => setPanelOpen(false);
  const makeActiveId = (id: string) => { setActiveKit(id); setKit(activeKit()); };
  const doDelete = (id: string) => { deleteKit(id); if (panelKit?.id === id) setPanelOpen(false); setKit(activeKit()); setConfirmDelete(null); };
  const KIT_INP = 'w-full bg-[rgba(255,255,255,0.03)] border border-[var(--border-card)] rounded px-2.5 py-1.5 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]';
  const KIT_LBL = 'text-[11px] text-[var(--text-muted)] block mb-1.5';
  const KIT_BTN_PRIMARY = 'px-2.5 py-1 rounded-md text-[11px] font-medium text-white transition hover:brightness-110';
  const KIT_BTN_GHOST = 'px-2.5 py-1 rounded-md text-[11px] border border-[var(--border-card)] text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] hover:border-[var(--text-muted)]';
  const [view, setView] = useState<ViewId>('icon');
  // Which room the Design Architect chat should reflect. The Open-Canvas Video
  // and Voiceover views map to their own rooms; everything else is the icon
  // studio (greeting / chips / heading / persona all follow this).
  const designRoom: 'icon' | 'video' | 'voice' | 'image' | 'logo' = view === 'video' ? 'video' : view === 'voice' ? 'voice' : view === 'image' ? 'image' : view === 'logo' ? 'logo' : 'icon';

  const [query, setQuery] = useState('');
  const [shapeId, setShapeId] = useState('Bell');
  const [color, setColor] = useState<string>(kit.palette.primary);
  const [boardBg, setBoardBg] = useState(CHECKER);
  // Icons follow the ACTIVE brand: the icon lane predates brand kits, so its
  // colour was set once at mount and never tracked the kit. Re-sync to the brand
  // primary whenever the active kit switches or its palette is edited.
  useEffect(() => { setColor(kit.palette.primary); }, [kit.id, kit.palette.primary]);

  // ── Video lane (Wan 2.5 via host: submit → poll → clip) ──
  const [videoDuration, setVideoDuration] = useState('5'); // Wan: '5' | '10' seconds only
  const [videoAspect, setVideoAspect] = useState('16:9');
  const [videoResolution, setVideoResolution] = useState('1080p');
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoGenerating, setVideoGenerating] = useState(false);

  // ── Image lane (free-form, reuses the icon /api/asset-forge/image route but
  // full-frame — NO matte, NO armature) ──
  const [imageSize, setImageSize] = useState('1024*1024'); // '1024*1024' | '1280*720' | '720*1280'
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageGenerating, setImageGenerating] = useState(false);

  // ── Voice lane (Qwen3-TTS via host: synchronous synth → audio URL) ──
  const [voiceName, setVoiceName] = useState(VOICES[0]); // 'Jennifer' — live inspector selection
  const [voiceUsed, setVoiceUsed] = useState(VOICES[0]); // voice captured at generation (stable in the player)
  const [voiceTitle, setVoiceTitle] = useState(''); // the generated voiceover's name (from its script)
  const [voiceLanguage, setVoiceLanguage] = useState('English');
  const [voiceSrc, setVoiceSrc] = useState<string | null>(null);
  const [voiceGenerating, setVoiceGenerating] = useState(false);

  // Design Studio is a GENERATION surface — the free deterministic vector-icon
  // styling moves to the Library tab (all the free icon packs, usable in any
  // project). Here: pick a shape → a material → your colour → generate.
  const [materialId, setMaterialId] = useState('glass');
  const [genResult, setGenResult] = useState<string | null>(null);
  const [genStatus, setGenStatus] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [genSize, setGenSize] = useState(512);
  const [dockOpen, setDockOpen] = useState(false);
  // Unread badge: Ava produced content while the dock was collapsed. We never
  // force the dock open on her activity — we flag it and let the operator open it.
  const [unread, setUnread] = useState(false);
  const dockOpenRef = useRef(dockOpen);
  dockOpenRef.current = dockOpen;
  useEffect(() => { if (dockOpen) setUnread(false); }, [dockOpen]);
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

  // ── Image lane resolver — shares the `asset_forge_result` message with the
  // icon lane, so route by a flag. pendingImageRef is set true while a free-form
  // image gen is in flight; the shared listener below hands that result to the
  // image lane (imageResolverRef) instead of the icon lane.
  type ImageOutcome = { ok: boolean; dataUrl?: string; error?: string };
  const imageResolverRef = useRef<((r: ImageOutcome) => void) | null>(null);
  const pendingImageRef = useRef(false);
  const lastImageTitleRef = useRef('Image'); // names the "Download a copy" file for the current image
  const [logoSystem, setLogoSystem] = useState<LogoSystem | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  // The results MODAL is only for logos Ava makes from chat while the operator is
  // on another view. A logo made in the Logo room shows inline; without this flag
  // the leftover system re-popped as a modal on every other page.
  const [logoShowModal, setLogoShowModal] = useState(false);
  const [logoFontId, setLogoFontId] = useState('');                          // font OPTION Ava respects
  const [logoVariant, setLogoVariant] = useState<LogoVariant>('primary');    // which variant is on the board
  const [logoExplore, setLogoExplore] = useState<LogoSystem[] | null>(null); // best-of-N candidates on the board; click to pick
  // The dials. These are TWO-WAY, exactly like the icon lane: they are fed into
  // Ava's brief so she designs from what's set, and whatever she chooses is
  // synced back here after a make — so the panel always shows the real logo.
  const [logoMark, setLogoMark] = useState('Star');                          // Lucide shape id (markType 'icon')
  const [logoQuery, setLogoQuery] = useState('');                            // shape search
  const [logoStyle, setLogoStyle] = useState<MarkStyle>('flat');
  const [logoColour, setLogoColour] = useState<string>(kit.palette.primary); // the mark's brand colour
  const [logoSecondary, setLogoSecondary] = useState<string>(kit.palette.accent || kit.palette.primary);
  const [logoForm, setLogoForm] = useState<'combination' | 'emblem'>('combination');
  const [logoTagline, setLogoTagline] = useState('');   // emblem bottom text
  const [logoMarkType, setLogoMarkType] = useState<'letter' | 'geometry' | 'icon'>('geometry');
  // The wordmark's colour is its OWN decision — a gradient mark has no single hue
  // for the word to borrow. 'ink' is a deep tint of the brand, not flat black.
  const [logoWordColour, setLogoWordColour] = useState<'ink' | 'brand' | string>('ink');
  const [logoContainer, setLogoContainer] = useState<'none' | 'ring'>('none');
  const [logoSpec, setLogoSpec] = useState<MarkSpec | null>(null);           // the construction Ava last authored
  const [logoBoard, setLogoBoard] = useState(CHECKER); // check-against board; defaults to the first option (checker), never forced white
  const logoHits = useMemo(() => searchShapes(logoQuery, 24), [logoQuery]);

  // What the right-hand panel is set to, in one line, sent with every design-lane
  // turn. This is the half that was missing: the dials were only ever a silent
  // fallback, so Ava designed blind and her arguments always won. Now she sees
  // them, works from them, and may change them when the design calls for it.
  const designPanel = useMemo(() => {
    if (view !== 'logo') return undefined;
    const bits = [
      `form: ${logoForm}`,
      logoForm === 'emblem' ? `tagline: ${logoTagline || '(none)'}` : '',
      `mark type: ${logoMarkType}`,
      logoMarkType === 'icon' ? `shape: ${logoMark}` : '',
      logoMarkType === 'letter' ? `container: ${logoContainer}` : '',
      logoMarkType === 'geometry' && logoSpec ? `current construction: ${logoSpec.concept}` : '',
      `style: ${logoStyle}`,
      `colour: ${logoColour}`,
      TWO_TONE(logoStyle) ? `second colour: ${logoSecondary}` : '',
      `wordmark font: ${logoFontId || suggestFont(kit.styleTags).id}`,
      `wordmark colour: ${logoWordColour}`,
    ].filter(Boolean);
    return bits.join(' · ');
  }, [view, logoForm, logoTagline, logoMarkType, logoMark, logoContainer, logoSpec, logoStyle, logoColour, logoSecondary, logoWordColour, logoFontId, kit.styleTags]);
  // Register the bundled wordmark fonts (from bytes) when the Logo room opens, so
  // the font picker previews each name in its own typeface.
  useEffect(() => { if (view === 'logo') void registerWordmarkFonts(); }, [view]);
  // Set the generated logo as the active brand's logo (its primary lockup, as an
  // SVG data URL). Manual mirror of Ava's set_logo.
  const setLogoAsBrand = () => {
    if (!logoSystem) return;
    const primary = logoSystem.assets.find(a => a.variant === 'primary') ?? logoSystem.assets[0];
    if (!primary) return;
    const dataUrl = 'data:image/svg+xml,' + encodeURIComponent(primary.svg);
    const next: BrandKit = { ...kit, logo: { ...(kit.logo ?? {}), primary: dataUrl }, updatedAt: Date.now() };
    upsertKit(next); setKit(next);
    if (panelKit && panelKit.id === next.id) setPanelKit(next);
  };

  // The host runs the pipeline and posts the matted PNG back here. We update the
  // canvas AND resolve whatever generation is awaiting (button or tool).
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const m = e.data as { type?: string; success?: boolean; dataUrl?: string; error?: string };
      if (!m || m.type !== 'asset_forge_result') return;
      // Route to the free-form image lane when an image gen is in flight (it
      // reuses this same message, but full-frame — no matte, its own stage).
      if (pendingImageRef.current) {
        pendingImageRef.current = false;
        setImageGenerating(false);
        const ok = !!m.success && !!m.dataUrl;
        if (ok) { setImageSrc(m.dataUrl!); setDockOpen(false); } // image ready → slide the chat down, reveal it
        const resolveImg = imageResolverRef.current;
        if (resolveImg) {
          imageResolverRef.current = null;
          resolveImg(ok ? { ok: true, dataUrl: m.dataUrl } : { ok: false, error: m.error || 'Image generation failed' });
        }
        return;
      }
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
          const prompt = composeIconPrompt(shapeHit.label, look, colorHex, kit.styleTags);
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
  const lastVideoTitleRef = useRef('Video'); // names the "Download a copy" file for the current clip
  // Submit a Wan 2.5 job to the host (POST + poll) and await the finished clip.
  // `resolution` is the exact route value ('720P' | '1080P'); duration is 5 | 10.
  const runVideoGeneration = (prompt: string, duration: string, aspect: string, resolution: string): Promise<VideoOutcome> => {
    return new Promise<VideoOutcome>((resolve) => {
      // Persist the finished clip to the local gallery before resolving, so every
      // caller (Ava's tool + the UI Generate button) saves it — video is costly
      // and used to evaporate on navigation. Lands in the Library's Video section.
      const title = deriveMediaTitle(prompt, 'Video');
      lastVideoTitleRef.current = title;
      videoResolverRef.current = (r) => {
        if (r.ok && r.url) saveMediaToLibrary(r.url, title, 'video', 'video');
        resolve(r);
      };
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

  // ── Image lane wiring (mirror of runVideoGeneration) ──
  // Park a resolver + raise pendingImageRef, then post an asset_forge_generate
  // with matte:false and NO referenceImage (free-form, no armature, no matte).
  // The shared asset_forge_result listener above routes the result back here.
  const runImageGeneration = (prompt: string, size: string): Promise<ImageOutcome> => {
    return new Promise<ImageOutcome>((resolve) => {
      // Auto-save to the local library on success, like video/voice — every caller
      // (Ava's tool + the UI Generate button) persists it into creative/images/.
      const title = deriveMediaTitle(prompt, 'Image');
      lastImageTitleRef.current = title;
      imageResolverRef.current = (r) => {
        if (r.ok && r.dataUrl) saveToLibrary(r.dataUrl, title, 'image');
        resolve(r);
      };
      pendingImageRef.current = true;
      setImageSrc(null);
      setImageGenerating(true);
      // Layer the active brand (style words + palette) onto the free-form prompt
      // — the active kit shapes everything the studio makes. Title stays off the
      // user's original words, above.
      const branded = withBrandDirection(prompt, { styleTags: kit.styleTags, palette: kit.palette });
      post({ type: 'asset_forge_generate', body: { prompt: branded, size, matte: false } } as any);
    });
  };

  // ── Logo lane ──────────────────────────────────────────────────────────
  // The mark is CONSTRUCTED — exact vector, instantly, for nothing. No image
  // model, no matte, no trace. Three sources of geometry, one renderer:
  //   letter    the brand initial, set in the wordmark's own font
  //   geometry  the construction Ava authored from primitives
  //   icon      a Lucide shape, when a literal object genuinely fits
  // MONO is a second render of the SAME geometry rather than a repaint, so the
  // one-colour test can actually fail and tell us something.
  const runLogoGeneration = async (brief: LogoBrief): Promise<{ ok: boolean; system?: LogoSystem; error?: string }> => {
    try {
      const font = fontById(brief.fontId);
      const otf = await loadFont(font.file);
      const wordmark = typesetWordmark(otf, brief.brandName);
      const ink = ['#111111'];
      const paint = [brief.palette.primary, brief.palette.accent ?? brief.palette.primary];

      let symbolSvg: string;
      let symbolMonoSvg: string;
      if (brief.markType === 'letter') {
        const letter = (color: string) => buildLettermark({ font: otf, text: brief.brandName, container: brief.container ?? 'none', color });
        symbolSvg = letter(brief.palette.primary);
        symbolMonoSvg = letter(ink[0]);
      } else if (brief.markType === 'geometry') {
        if (!brief.markSpec?.elements?.length) return { ok: false, error: 'No construction to build from — Ava must author a mark spec, or switch to a lettermark.' };
        symbolSvg = renderMark(brief.markSpec, brief.style, paint);
        symbolMonoSvg = renderMark(brief.markSpec, 'flat', ink);
      } else {
        const shape = resolveShape(brief.mark || brief.symbolDirection || brief.brandName);
        if (!shape) return { ok: false, error: 'No shape found — search one (design_find_shape), construct a mark, or use a lettermark.' };
        symbolSvg = renderElements(shape.elements, brief.style, paint);
        symbolMonoSvg = renderElements(shape.elements, 'flat', ink);
      }

      const wordmarkColor =
        brief.wordmarkColor === 'ink' ? brandInk(brief.palette.primary)
        : brief.wordmarkColor === 'brand' ? brief.palette.primary
        : brief.wordmarkColor;

      const form = brief.form ?? 'combination';
      let assets = composeLogoSystem({ symbolSvg, symbolMonoSvg, wordmark, primary: brief.palette.primary, wordmarkColor });
      if (form === 'emblem') {
        assets = emblemVariants(assets, {
          font: otf, brandName: brief.brandName, tagline: brief.tagline,
          markSvg: symbolSvg, markMonoSvg: symbolMonoSvg, color: brief.palette.primary,
        });
      }
      return {
        ok: true,
        system: {
          brandName: brief.brandName, fontId: brief.fontId, symbolSvg,
          markType: brief.markType, form, style: brief.style, markSpec: brief.markSpec,
          assets, rationale: brief.symbolDirection || undefined,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Logo generation failed' };
    }
  };

  // Resolve a logo BRIEF from tool args, falling back to the panel dials for
  // anything Ava leaves unset. Shared by the single make (generate_logo) and the
  // multi-candidate explore (explore_logos) so they can never drift apart.
  const resolveLogoBrief = (args: Record<string, unknown>): { brief: LogoBrief } | { error: string } => {
    const form: NonNullable<LogoBrief['form']> =
      (args.form === 'combination' || args.form === 'emblem') ? args.form : logoForm;
    const markType: LogoBrief['markType'] =
      (args.mark_type === 'letter' || args.mark_type === 'geometry' || args.mark_type === 'icon') ? args.mark_type : logoMarkType;
    const style: MarkStyle = LOGO_STYLES.some(s => s.id === args.style) ? (args.style as MarkStyle) : logoStyle;
    const primary = (typeof args.colour === 'string' && /^#[0-9a-f]{6}$/i.test(args.colour)) ? args.colour : (logoColour || kit.palette.primary);
    const accent = (typeof args.secondary === 'string' && /^#[0-9a-f]{6}$/i.test(args.secondary)) ? args.secondary : logoSecondary;
    const wordmarkColor =
      (args.wordmark_colour === 'ink' || args.wordmark_colour === 'brand' || (typeof args.wordmark_colour === 'string' && /^#[0-9a-f]{6}$/i.test(args.wordmark_colour)))
        ? args.wordmark_colour as string : logoWordColour;
    let markSpec: MarkSpec | undefined = logoSpec ?? undefined;
    if (typeof args.mark_spec === 'string' && args.mark_spec.trim()) {
      try {
        const parsed = JSON.parse(args.mark_spec) as MarkSpec;
        if (!Array.isArray(parsed?.elements) || !parsed.elements.length) throw new Error('spec has no elements');
        markSpec = parsed;
      } catch (e) {
        return { error: `That mark spec isn't valid JSON: ${e instanceof Error ? e.message : String(e)}` };
      }
    }
    return {
      brief: {
        brandName: (typeof args.brand_name === 'string' && args.brand_name.trim()) ? args.brand_name.trim() : kit.name,
        fontId: (typeof args.font === 'string' && args.font) ? args.font : (logoFontId || suggestFont(kit.styleTags).id),
        markType,
        container: (args.container === 'ring' || args.container === 'none') ? args.container : logoContainer,
        mark: (typeof args.mark === 'string' && args.mark.trim()) ? args.mark.trim() : logoMark,
        markSpec,
        form,
        tagline: typeof args.tagline === 'string' ? args.tagline.trim() : logoTagline,
        style,
        wordmarkColor,
        symbolDirection: typeof args.direction === 'string' ? args.direction : (markSpec?.concept ?? ''),
        palette: { primary, accent },
        styleTags: kit.styleTags,
      },
    };
  };

  // ── Voice lane wiring (mirror of runVideoGeneration — its OWN resolver, no
  // collision with icon/image/video) ──
  // One voiceover in flight → one parked resolver. runVoiceGeneration posts to
  // the host and awaits `asset_forge_voice_result`; the listener below fulfils
  // it. Qwen3-TTS is synchronous host-side, so this returns in a few seconds.
  type VoiceOutcome = { ok: boolean; url?: string; error?: string };
  const voiceResolverRef = useRef<((r: VoiceOutcome) => void) | null>(null);
  const runVoiceGeneration = (script: string, voice: string, language: string, instructions?: string): Promise<VoiceOutcome> => {
    return new Promise<VoiceOutcome>((resolve) => {
      // Same as video: persist the read before resolving so every caller saves it.
      // Lands in the Library's Voiceover section (Open Canvas).
      voiceResolverRef.current = (r) => {
        if (r.ok && r.url) saveMediaToLibrary(r.url, deriveVoiceTitle(script), 'voice', 'voice');
        resolve(r);
      };
      setVoiceSrc(null);
      setVoiceGenerating(true);
      post({ type: 'asset_forge_voice', body: { text: script, voice, language_type: language, instructions } } as any);
    });
  };
  // The host synthesises and posts the finished audio URL back. We drop it on the
  // waveform stage AND resolve whatever generation is awaiting (the design tool).
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const m = e.data as { type?: string; success?: boolean; url?: string; error?: string };
      if (!m || m.type !== 'asset_forge_voice_result') return;
      setVoiceGenerating(false);
      const ok = !!m.success && !!m.url;
      if (ok) { setVoiceSrc(m.url!); setDockOpen(false); } // audio ready → slide the chat down, reveal it
      const resolve = voiceResolverRef.current;
      if (resolve) {
        voiceResolverRef.current = null;
        resolve(ok ? { ok: true, url: m.url } : { ok: false, error: m.error || 'Voice generation failed' });
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

  // Save an image to the local creative library. WebP-compress it first — lossless
  // (q1.0, alpha-safe) for icons/flat art, high-quality lossy (q0.9) for photos —
  // then hand the host the smaller bytes. toWebp falls back to the original on any
  // failure, so a save never breaks. Tagged with the active view's design type
  // (icon / image / logo / …) so the Library sorts it into the bucket it was made
  // in. Defaults to the current canvas — every save happens while its lane is active.
  const saveToLibrary = async (dataUrl: string, title: string, designType: ViewId = view) => {
    const encoded = await toWebp(dataUrl, designType === 'image' ? 0.9 : 1.0);
    const ext = encoded.startsWith('data:image/webp') ? 'webp' : 'png';
    post({ type: 'save_creative_to_disk', url: encoded, filename: `${title}.${ext}`, assetType: 'image', designType, prompt: title } as any);
  };
  // Save the WHOLE logo system to the Library — every variant, kept as SVG (true
  // vector), under a shared group id so the Library shows them as ONE logo card.
  const saveLogoSystemToLibrary = (system: LogoSystem) => {
    const group = `logo_${Date.now()}`;
    const brand = system.brandName || 'logo';
    for (const a of system.assets) {
      post({
        type: 'save_creative_to_disk',
        id: `${group}_${a.variant}`,
        url: 'data:image/svg+xml,' + encodeURIComponent(a.svg),
        filename: `${brand} — ${a.label}`,
        assetType: 'image',
        designType: 'logo',
        prompt: `${brand} logo — ${a.label}`,
      } as any);
    }
  };
  // Media (video / voiceover) save straight to the local creative gallery — no
  // webp re-encode (that's image-only). The host fetches the URL (remote or
  // data:) and writes the real bytes. `assetType` maps to the on-disk kind and
  // `designType` decides which Library section it lands in (video → Video,
  // voice → Voiceover under Open Canvas). See creative-store.ts / design-types.ts.
  const saveMediaToLibrary = (url: string, title: string, kind: 'video' | 'voice', designType: ViewId) => {
    post({ type: 'save_creative_to_disk', url, filename: title, assetType: kind, designType, prompt: title } as any);
  };
  // "Download a copy" — export a generated asset (data: or remote URL) to a
  // location the user picks. Library-save is automatic; this button is only for
  // getting a copy out to disk. The host decodes/fetches and pops a Save dialog.
  const saveAssetCopy = (url: string, filename: string) => {
    post({ type: 'save_asset_copy', url, filename } as any);
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
        if (out.ok && out.dataUrl) {
          // Auto-save to the Library, like every other lane (the set already does).
          saveToLibrary(out.dataUrl, `${resolved.label}-${mat.label}`.toLowerCase().replace(/\s+/g, '-'), 'icon');
          reply(true, { label: resolved.label, material: artDir ? 'custom-direction' : mat.label, credits: 20 });
        } else reply(false, undefined, out.error || 'Generation failed.');
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
          if (out.ok && out.dataUrl) { made++; saveToLibrary(out.dataUrl, `${resolved.label}-${mat.label}`.toLowerCase().replace(/\s+/g, '-'), 'icon'); }
          else failed.push(resolved.label);
        }
        reply(true, { made, failed, credits: made * 20 });
        return;
      }
      if (m.command === 'generate_logo') {
        // Full logo make. The PANEL is the starting brief — whatever Ava leaves
        // unset, the dials supply. Whatever she does set is synced back into them
        // afterwards, so the panel always describes the logo actually on screen.
        const resolved = resolveLogoBrief(args);
        if ('error' in resolved) { reply(false, undefined, resolved.error); return; }
        const brief = resolved.brief;
        const { markSpec } = brief;
        const primary = brief.palette.primary;
        const accent = brief.palette.accent ?? primary;
        const wordColour = brief.wordmarkColor;
        setLogoBusy(true); setLogoSystem(null); setLogoExplore(null); setLogoVariant('primary');
        setLogoShowModal(view !== 'logo');   // pop the modal only when made from elsewhere
        const out = await runLogoGeneration(brief);
        setLogoBusy(false);
        if (out.ok && out.system) {
          setLogoSystem(out.system);
          saveLogoSystemToLibrary(out.system);        // auto-save to the Library, like every other lane
          if (view === 'logo') setDockOpen(false);   // reveal the result on the canvas, like every other lane
          // Sync the dials to what Ava actually built — the icon lane's pattern.
          setLogoMarkType(brief.markType);
          setLogoStyle(brief.style);
          setLogoColour(primary);
          setLogoSecondary(accent);
          setLogoWordColour(wordColour);
          setLogoForm(brief.form ?? 'combination');
          setLogoTagline(brief.tagline ?? '');
          setLogoFontId(brief.fontId);
          if (brief.container) setLogoContainer(brief.container);
          if (brief.markType === 'icon' && brief.mark) setLogoMark(brief.mark);
          if (markSpec) setLogoSpec(markSpec);
          // Rasterise the primary lockup so Ava SEES what she made — fed back to
          // her via the tool's base64_image so she can actually judge the type
          // and the mark instead of designing blind. On white (the lockup's ground).
          let preview: string | undefined;
          try {
            const primary = out.system.assets.find(a => a.variant === 'primary') ?? out.system.assets[0];
            if (primary) {
              const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(primary.svg);
              const w = vb ? Math.round(parseFloat(vb[1])) : 640;
              const h = vb ? Math.round(parseFloat(vb[2])) : 200;
              const scale = Math.min(3, 900 / Math.max(w, 1));
              const onWhite = primary.svg.replace(/(<svg[^>]*>)/, '$1<rect width="100%" height="100%" fill="#ffffff"/>');
              const dataUrl = await svgToPngDataUrl(onWhite, Math.round(w * scale), Math.round(h * scale));
              preview = dataUrl.replace(/^data:image\/png;base64,/, '');
            }
          } catch { /* preview is best-effort — the make already succeeded */ }
          reply(true, { brandName: brief.brandName, markType: brief.markType, style: brief.style, concept: brief.symbolDirection, font: brief.fontId, variants: out.system.assets.length, preview });
        }
        else reply(false, undefined, out.error || 'Logo generation failed.');
        return;
      }
      if (m.command === 'explore_logos') {
        // Best-of-N: render several DIRECTIONS at once into one contact sheet so
        // Ava can SEE them together and pick. Exploration only — it does NOT touch
        // the canvas; the winner gets made properly via generate_logo afterwards.
        const cands = Array.isArray(args.candidates) ? (args.candidates as Record<string, unknown>[]) : [];
        if (cands.length < 2) { reply(false, undefined, 'Give at least two candidates to explore.'); return; }
        const brandName = (typeof args.brand_name === 'string' && args.brand_name.trim()) ? args.brand_name.trim() : kit.name;
        setLogoBusy(true); setLogoSystem(null); setLogoExplore(null); setLogoShowModal(false);
        const systems: LogoSystem[] = [];
        for (const c of cands.slice(0, 5)) {
          const co: Record<string, unknown> = { ...c, brand_name: (c.brand_name as string) ?? brandName };
          const rb = resolveLogoBrief(co);
          if ('error' in rb) continue;
          const out = await runLogoGeneration(rb.brief);
          if (out.ok && out.system) systems.push(out.system);
        }
        setLogoBusy(false);
        if (systems.length < 2) { reply(false, undefined, 'Could not render enough candidates — check the mark specs.'); return; }
        setLogoExplore(systems);          // show the options to the operator on the canvas
        setDockOpen(false);               // slide the chat down so they can see them
        // Contact sheet for Ava's eyes uses the STACKED lockup — for a long name a
        // horizontal lockup shrinks the mark to nothing; stacked keeps it prominent.
        const cell = (s: LogoSystem) => s.assets.find(a => a.variant === 'stacked')?.svg ?? s.assets.find(a => a.variant === 'primary')!.svg;
        const items = systems.map(s => ({ svg: cell(s), label: `${fontById(s.fontId).label}${s.form === 'emblem' ? ' · emblem' : ''}` }));
        const sheet = contactSheetSvg(items);
        let preview: string | undefined;
        try {
          const dataUrl = await svgToPngDataUrl(sheet.svg, sheet.w, sheet.h);
          preview = dataUrl.replace(/^data:image\/png;base64,/, '');
        } catch { /* best-effort */ }
        reply(true, { count: systems.length, preview });
        return;
      }
      if (m.command === 'brand_kit') {
        const a = String(args.action || 'read');
        const targetId = typeof args.kit_id === 'string' ? args.kit_id : undefined;
        const find = (id?: string): BrandKit => (id ? loadKits().find(k => k.id === id) : undefined) ?? activeKit();
        // Fold any provided fields onto a base kit (only the ones passed change).
        const withFields = (base: BrandKit): BrandKit => ({
          ...base,
          name: typeof args.name === 'string' && args.name.trim() ? args.name.trim() : base.name,
          tagline: typeof args.tagline === 'string' ? args.tagline : base.tagline,
          positioning: typeof args.positioning === 'string' ? args.positioning : base.positioning,
          palette: { ...base.palette, ...(args.palette as Partial<BrandKit['palette']> | undefined ?? {}) },
          styleTags: Array.isArray(args.styleTags) ? (args.styleTags as unknown[]).map(String) : base.styleTags,
          voice: typeof args.voice === 'string' ? args.voice : base.voice,
          doRules: Array.isArray(args.doRules) ? (args.doRules as unknown[]).map(String) : base.doRules,
          dontRules: Array.isArray(args.dontRules) ? (args.dontRules as unknown[]).map(String) : base.dontRules,
          defaultHashtags: Array.isArray(args.defaultHashtags) ? (args.defaultHashtags as unknown[]).map(String) : base.defaultHashtags,
          defaultLink: typeof args.defaultLink === 'string' ? args.defaultLink : base.defaultLink,
        });

        if (a === 'list') {
          const activeId = activeKit().id;
          reply(true, { kits: loadKits().map(k => ({ id: k.id, name: k.name, active: k.id === activeId })) });
        } else if (a === 'create') {
          const created = withFields(createKit(typeof args.name === 'string' ? args.name : 'New brand'));
          upsertKit(created);
          setKit(activeKit());
          reply(true, created);
        } else if (a === 'set_active') {
          if (targetId) setActiveKit(targetId);
          const k = activeKit();
          setKit(k);
          reply(true, k);
        } else if (a === 'delete') {
          const name = find(targetId).name;
          if (targetId) deleteKit(targetId);
          setKit(activeKit());
          if (panelKit && targetId && panelKit.id === targetId) closePanel(); // she deleted the kit we had open
          reply(true, { name, deleted: true });
        } else if (a === 'rename' || a === 'update') {
          const next = withFields(find(targetId));
          upsertKit(next);
          if (next.id === activeKit().id) setKit(next);
          if (panelKit && panelKit.id === next.id) setPanelKit(next); // live-refresh the open drawer
          reply(true, next);
        } else if (a === 'set_logo') {
          // Assign what's on the canvas as this kit's logo. A designed LOGO (the
          // variant currently on the board) takes priority; otherwise a fresh
          // image/icon. This is why picking a candidate then "set it as the logo"
          // now works — the logo system is a valid canvas asset, not just images.
          const slot = (['primary', 'mark', 'light', 'dark'] as const).find(s => s === args.slot) ?? 'primary';
          let asset: string | null = null;
          if (logoSystem) {
            const v = logoSystem.assets.find(x => x.variant === logoVariant)
              ?? logoSystem.assets.find(x => x.variant === 'primary') ?? logoSystem.assets[0];
            if (v) asset = 'data:image/svg+xml,' + encodeURIComponent(v.svg);
          }
          if (!asset) asset = imageSrc || genResultRef.current || null;
          if (!asset) { reply(false, undefined, 'Nothing on the canvas to assign — design a logo, or make/open an image or icon first, then set it as the logo.'); return; }
          const target = find(targetId);
          const next: BrandKit = { ...target, logo: { ...(target.logo ?? {}), [slot]: asset } };
          upsertKit(next);
          if (next.id === activeKit().id) setKit(next);
          if (panelKit && panelKit.id === next.id) setPanelKit(next);
          reply(true, { name: next.name, slot });
        } else {
          reply(true, find(targetId));
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
      if (m.command === 'generate_image') {
        const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : '';
        if (!prompt) { reply(false, undefined, 'A prompt is required to generate an image.'); return; }
        setView('image');
        const size = typeof args.size === 'string' && ['1024*1024', '1280*720', '720*1280'].includes(args.size) ? args.size : imageSize;
        setImageSize(size);
        const out = await runImageGeneration(prompt, size);
        if (out.ok) reply(true, { credits: 12 });
        else reply(false, undefined, out.error || 'Image generation failed.');
        return;
      }
      if (m.command === 'generate_voice') {
        const script = typeof args.script === 'string' ? args.script.trim() : '';
        if (!script) { reply(false, undefined, 'A script is required to generate a voiceover.'); return; }
        setView('voice');
        // Sync the inspector to what she's voicing (voice + spoken language).
        const voice = typeof args.voice === 'string' && VOICES.includes(args.voice) ? args.voice : voiceName;
        setVoiceName(voice);
        setVoiceUsed(voice);          // freeze the voice shown in the player
        setVoiceTitle(deriveVoiceTitle(script)); // name the voiceover from its script
        const language = typeof args.language === 'string' && args.language.trim() ? args.language.trim() : voiceLanguage;
        setVoiceLanguage(language);
        const instructions = typeof args.instructions === 'string' && args.instructions.trim() ? args.instructions.trim() : undefined;
        const out = await runVoiceGeneration(script, voice, language, instructions);
        if (out.ok) reply(true, { voice, credits: 10 });
        else reply(false, undefined, out.error || 'Voice generation failed.');
        return;
      }
      if (m.command === 'save') {
        // A logo on the board saves as the WHOLE system (all forms) → one Library
        // card. Otherwise the single icon.
        if (logoSystem) {
          saveLogoSystemToLibrary(logoSystem);
          reply(true, { title: logoSystem.brandName, forms: logoSystem.assets.length });
          return;
        }
        const url = genResultRef.current;
        if (!url) { reply(false, undefined, 'Nothing on the canvas to save yet.'); return; }
        const title = (typeof args.title === 'string' && args.title.trim())
          ? args.title.trim()
          : `${(getShape(shapeId)?.label ?? 'icon')}-${material.label}`.toLowerCase().replace(/\s+/g, '-');
        await saveToLibrary(url, title);
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
        {DESIGN_GROUPS.map(g => (
          <div key={g.label} className="mb-3.5">
            <div className="flex items-center gap-1.5 px-2.5 pb-1.5 text-[10px] tracking-[1.4px] uppercase font-semibold" style={{ color: g.accent }}>
              <span className="w-[3px] h-3 rounded" style={{ background: g.accent }} />{tt(g.labelKey, g.label)}
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
                  {tt('dash.studio.asset.' + it.id, it.label)}
                  {it.badge && <span className="ml-auto text-[9px] tracking-wider text-[var(--text-muted)] border border-[var(--border-card)] px-1.5 rounded-full">{tt('dash.studio.soon', it.badge)}</span>}
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
              <h2 className="text-[17px] font-normal text-[var(--text-primary)]">{tt('dash.studio.icon.title', 'Icon')}</h2>
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5">{tt('dash.studio.icon.subtitle', 'Your shape, your brand, any material — generated and matted to a clean transparent icon.')}</p>
            </div>
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-[11px] text-[var(--text-muted)]">{tt('dash.studio.check_against', 'Check against')}</span>
              {boards.map(b => (
                <button key={b.label} onClick={() => setBoardBg(b.bg)} title={b.label} aria-label={b.label}
                  className="w-5 h-5 rounded cursor-pointer" style={{ background: b.bg, border: `1px solid ${boardBg === b.bg ? '#fff' : 'var(--border-card)'}` }} />
              ))}
            </div>
            <div className="flex-1 min-h-[240px] rounded-xl border border-[var(--border-card)] flex flex-col items-center justify-center gap-3.5 relative" style={{ background: boardBg }}>
              {genResult && <img src={genResult} alt={tt('dash.studio.generated_icon','Generated icon')} className="w-[200px] h-[200px] object-contain" />}
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
              <h2 className="text-[17px] font-normal text-[var(--text-primary)]">{tt('dash.studio.video.title', 'Video')}</h2>
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5">{tt('dash.studio.video.subtitle', 'Describe a shot — Ava generates a short clip and it plays in this bespoke stage.')}</p>
            </div>
            <VideoStage durationSec={Number(videoDuration)} src={videoSrc ?? undefined} generating={videoGenerating} onDownload={videoSrc ? () => saveAssetCopy(videoSrc, `${lastVideoTitleRef.current || 'video'}.mp4`) : undefined} />
          </div>
        ) : view === 'voice' ? (
          <div className="flex-1 min-h-0 px-6 py-5 flex flex-col overflow-hidden">
            <div className="mb-3.5">
              <h2 className="text-[17px] font-normal text-[var(--text-primary)]">{tt('dash.studio.voice.title', 'Voiceover')}</h2>
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5">{tt('dash.studio.voice.subtitle', 'Talk to Ava — she writes the read, directs the delivery, and voices it as a waveform you can scrub.')}</p>
            </div>
            <WaveformPlayer voiceName={voiceUsed} title={voiceTitle} durationSec={8} src={voiceSrc ?? undefined} generating={voiceGenerating} onDownload={voiceSrc ? () => saveAssetCopy(voiceSrc, `${voiceTitle || 'voiceover'}.mp3`) : undefined} />
          </div>
        ) : view === 'image' ? (
          <div className="flex-1 min-h-0 px-6 py-5 flex flex-col overflow-hidden">
            <div className="mb-3.5">
              <h2 className="text-[17px] font-normal text-[var(--text-primary)]">{tt('dash.studio.image.title', 'Image')}</h2>
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5">{tt('dash.studio.image.subtitle', 'Free-form — a hero shot, illustration, background or scene. Describe it; Ava composes it and it appears here.')}</p>
            </div>
            <div className="flex-1 min-h-[240px] rounded-xl border border-[var(--border-card)] flex items-center justify-center relative overflow-hidden" style={{ background: 'radial-gradient(120% 120% at 50% 30%, #171021, #0c0814)' }}>
              {imageSrc && <img src={imageSrc} alt={tt('dash.studio.generated_image','Generated image')} className="max-w-full max-h-full object-contain" />}
              {!imageSrc && !imageGenerating && (
                <div className="flex flex-col items-center gap-2.5 text-center px-8 pointer-events-none">
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.5-3.5a2 2 0 0 0-3 0L5 21" />
                  </svg>
                  <div className="text-[13.5px] text-[var(--text-secondary)]">{tt('ext.studio.image_empty','Your image will appear here')}</div>
                  <div className="text-[12px] text-[var(--text-muted)] max-w-[320px] leading-relaxed">{tt('ext.studio.image_empty_hint','Describe it — Ava composes it and it appears here.')}</div>
                </div>
              )}
              {imageGenerating && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ background: 'rgba(12,8,20,0.74)', backdropFilter: 'blur(2px)' }}>
                  <div className="w-[26px] h-[26px] rounded-full border-2 border-[var(--border-card)] border-t-[var(--accent)] animate-spin" />
                  <div className="text-[12.5px] text-[var(--text-secondary)]">Composing your image…</div>
                </div>
              )}
            </div>
            {imageSrc && (
              <div className="flex justify-end mt-3">
                <button type="button" onClick={() => saveAssetCopy(imageSrc, `${lastImageTitleRef.current || 'image'}.${imageSrc.startsWith('data:image/webp') ? 'webp' : 'png'}`)} title={tt('ext.studio.download_copy','Download a copy')} aria-label={tt('ext.studio.download_copy','Download a copy')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
                  Download
                </button>
              </div>
            )}
          </div>
        ) : view === 'logo' ? (
          <div className="flex-1 min-h-0 px-6 py-5 flex flex-col overflow-hidden">
            <div className="mb-3">
              <h2 className="text-[17px] font-normal text-[var(--text-primary)]">{tt('dash.studio.logo.title', 'Logo')}</h2>
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5">{tt('dash.studio.logo.subtitle', "Your brand's whole identity — one system, all its forms. Talk to Ava to design it; check every form against light and dark right here.")}</p>
            </div>
            {/* Check against — the logo's own board (light by default so the dark-ink lockup reads); a logo must hold on light AND dark. */}
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-[11px] text-[var(--text-muted)]">{tt('dash.studio.check_against', 'Check against')}</span>
              {boards.map(b => (
                <button key={b.label} onClick={() => setLogoBoard(b.bg)} title={b.label} aria-label={b.label}
                  className="w-5 h-5 rounded cursor-pointer" style={{ background: b.bg, border: `1px solid ${logoBoard === b.bg ? '#fff' : 'var(--border-card)'}` }} />
              ))}
            </div>
            <style>{`.logo-stage svg{max-height:150px;max-width:82%;width:auto;height:auto;display:block}.logo-chip svg{max-height:34px;max-width:100%;width:auto;height:auto;display:block}.logo-cand svg{max-height:120px;max-width:88%;width:auto;height:auto;display:block}`}</style>
            <div className="flex-1 min-h-[220px] rounded-xl border border-[var(--border-card)] flex items-center justify-center relative overflow-hidden" style={{ background: logoBoard }}>
              {/* Best-of-N: the options grid. Click one to pick it as the logo. */}
              {logoExplore && !logoBusy && (
                <div className="w-full h-full overflow-y-auto p-4">
                  <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${logoExplore.length <= 2 ? logoExplore.length : 2}, 1fr)` }}>
                    {logoExplore.map((s, i) => {
                      // Show the SAME variant the pick will land on, so it's never deceiving.
                      const shown = s.assets.some(x => x.variant === 'stacked') ? 'stacked' as const : 'primary' as const;
                      const a = s.assets.find(x => x.variant === shown)!;
                      return (
                        <button key={i} onClick={() => { setLogoSystem(s); setLogoVariant(shown); setLogoExplore(null); saveLogoSystemToLibrary(s); }} title={`Pick ${i + 1}`}
                          style={{ background: logoBoard }}
                          className="group rounded-lg border border-[var(--border-card)] hover:border-[var(--accent)] cursor-pointer p-4 flex flex-col items-center gap-2 transition">
                          <div className="logo-cand flex items-center justify-center w-full h-[150px]" dangerouslySetInnerHTML={{ __html: a.svg.replace(/\s(width|height)="[^"]*"/g, '') }} />
                          <div className="text-[10.5px] text-[var(--text-muted)] font-medium">{i + 1}. {fontById(s.fontId).label}{s.form === 'emblem' ? ' · emblem' : ''}</div>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-center text-[11px] text-[var(--text-muted)] mt-3">{tt('dash.studio.logo.pick_hint', "Click a direction to pick it — or ask Ava which she'd choose.")}</p>
                </div>
              )}
              {logoSystem && !logoExplore && !logoBusy && (() => {
                const a = logoSystem.assets.find(x => x.variant === logoVariant) ?? logoSystem.assets[0];
                return <div className="logo-stage flex items-center justify-center w-full h-full p-8" dangerouslySetInnerHTML={{ __html: a.svg.replace(/\s(width|height)="[^"]*"/g, '') }} />;
              })()}
              {!logoSystem && !logoExplore && !logoBusy && (
                <div className="flex flex-col items-center gap-2.5 text-center px-8 pointer-events-none">
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v10M7 12h10" opacity="0.5" /></svg>
                  <div className="text-[13.5px] text-[var(--text-secondary)]">{tt('dash.studio.logo.empty_title', "Let's design a logo for")} {kit.name}</div>
                  <div className="text-[12px] text-[var(--text-muted)] max-w-[360px] leading-relaxed">{tt('dash.studio.logo.empty_desc', "Tell Ava about the brand — what it does, who it's for, the one idea the mark should carry. She'll design it and it lands here.")}</div>
                </div>
              )}
              {logoBusy && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ background: 'rgba(12,8,20,0.6)' }}>
                  <div className="w-[26px] h-[26px] rounded-full border-2 border-[var(--border-card)] border-t-[var(--accent)] animate-spin" />
                  <div className="text-[12.5px] text-[var(--text-secondary)]">{tt('dash.studio.logo.busy', 'Constructing the mark → wordmark → variants…')}</div>
                </div>
              )}
            </div>
            {/* Variant strip — pick which form sits on the board. */}
            {logoSystem && !logoExplore && !logoBusy && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {logoSystem.assets.map(a => (
                  <button key={a.variant} onClick={() => setLogoVariant(a.variant)} title={a.label}
                    className={`shrink-0 w-[76px] rounded-lg border overflow-hidden transition ${logoVariant === a.variant ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]/40' : 'border-[var(--border-card)] hover:border-[var(--text-muted)]'}`}>
                    <div className="logo-chip flex items-center justify-center h-11 px-2" style={{ background: a.variant === 'mono-light' ? '#1b1b22' : '#ffffff' }} dangerouslySetInnerHTML={{ __html: a.svg.replace(/\s(width|height)="[^"]*"/g, '') }} />
                    <div className="px-1 py-1 text-[8.5px] text-[var(--text-muted)] border-t border-[var(--border-card)] truncate text-center">{a.label}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : view === 'brandkit' ? (
          <div className="flex-1 overflow-hidden relative">
            {/* Overview — all brand kits at a glance */}
            <div className="h-full overflow-y-auto px-6 py-5">
              <h2 className="text-[17px] font-normal text-[var(--text-primary)]">{tt('ext.studio.brand_kits','Brand Kits')}</h2>
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5 mb-4">{tt('ext.studio.brand_kits_sub','Multiple brands, one active. The active kit is what every icon, image, and post comes out on. Click a kit to edit it.')}</p>
              <div className="grid gap-3 max-w-[760px]" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(215px, 1fr))' }}>
                {loadKits().map(k => (
                  <div key={k.id} onClick={() => openKit(k.id)}
                    className={`rounded-xl border p-3.5 cursor-pointer transition flex flex-col ${k.id === kit.id ? 'border-[var(--accent)] bg-[var(--accent)]/[0.06]' : panelOpen && panelKit?.id === k.id ? 'border-[var(--text-muted)]' : 'border-[var(--border-card)] hover:border-[var(--text-muted)]'}`}>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[13px] text-[var(--text-primary)] truncate">{k.name}</span>
                      {k.id === kit.id && <span className="text-[8.5px] uppercase tracking-wider text-[var(--accent)] border border-[var(--accent)]/40 rounded px-1.5 py-0.5 shrink-0">Active</span>}
                    </div>
                    {k.tagline ? <div className="text-[11px] text-[var(--text-muted)] mb-2.5 truncate">{k.tagline}</div> : <div className="h-[16px]" />}
                    <div className="flex gap-1 mb-3">
                      {Object.values(k.palette).map((c, i) => <span key={i} className="w-5 h-5 rounded" style={{ background: c }} />)}
                    </div>
                    <div className="flex items-center gap-2 mt-auto">
                      {k.id !== kit.id && (
                        <button onClick={e => { e.stopPropagation(); makeActiveId(k.id); }} className={KIT_BTN_PRIMARY} style={{ background: 'var(--accent)' }}>{tt('ext.studio.make_active','Make active')}</button>
                      )}
                      {loadKits().length > 1 && (
                        <button onClick={e => { e.stopPropagation(); setConfirmDelete(k); }} className={`${KIT_BTN_GHOST} ml-auto`}>Delete</button>
                      )}
                    </div>
                  </div>
                ))}
                <button onClick={addKit}
                  className="rounded-xl border border-dashed border-[var(--border-card)] text-[12px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:border-[var(--text-muted)] flex items-center justify-center min-h-[128px] transition">
                  + Add brand
                </button>
              </div>
            </div>

            {/* Right drawer — slides in to edit / create the selected kit */}
            <div className={`absolute top-0 right-0 bottom-0 w-[380px] border-l border-[var(--border-card)] overflow-y-auto px-5 py-5 transition-transform duration-300 ease-out ${panelOpen ? 'translate-x-0' : 'translate-x-full'}`}
              style={{ background: 'rgba(17,12,26,0.98)', boxShadow: panelOpen ? '-16px 0 44px rgba(0,0,0,0.45)' : 'none' }}>
              {panelKit && (<>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <h3 className="text-[14px] font-normal text-[var(--text-primary)] truncate">{panelKit.name || 'New brand'}</h3>
                    {panelKit.id === kit.id && <span className="text-[8.5px] uppercase tracking-wider text-[var(--accent)] shrink-0">active</span>}
                  </div>
                  <button onClick={closePanel} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-[15px] leading-none shrink-0" title="Close">✕</button>
                </div>

                <div className="flex flex-col gap-4">
                  <div><label className={KIT_LBL}>{tt('ext.studio.brand_name','Brand name')}</label><input value={panelKit.name} onChange={e => saveKit({ name: e.target.value })} className={KIT_INP} /></div>
                  <div><label className={KIT_LBL}>{tt('ext.studio.tagline','Tagline')}</label><input value={panelKit.tagline ?? ''} onChange={e => saveKit({ tagline: e.target.value })} className={KIT_INP} placeholder="one-liner" /></div>
                  <div><label className={KIT_LBL}>{tt('ext.studio.positioning','Positioning')}</label><input value={panelKit.positioning ?? ''} onChange={e => saveKit({ positioning: e.target.value })} className={KIT_INP} placeholder={tt('ext.studio.positioning_ph',"what it is + who it's for")} /></div>

                  <div>
                    <label className={KIT_LBL}>{tt('dash.studio.brandkit.palette','Palette')}</label>
                    <div className="grid grid-cols-5 gap-2">
                      {(Object.keys(panelKit.palette) as (keyof BrandKit['palette'])[]).map(role => (
                        <label key={role} className="flex flex-col items-center gap-1 text-[10px] text-[var(--text-muted)]">
                          <input type="color" value={panelKit.palette[role]} onChange={e => saveKit({ palette: { ...panelKit.palette, [role]: e.target.value } })}
                            className="w-8 h-8 rounded cursor-pointer bg-transparent border border-[var(--border-card)] p-0" />
                          <span className="capitalize">{role}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div><label className={KIT_LBL}>Style words (comma-separated)</label><input value={(panelKit.styleTags ?? []).join(', ')} onChange={e => saveKit({ styleTags: e.target.value.split(',').map(x => x.trim()).filter(Boolean) })} className={KIT_INP} placeholder="minimal, premium, bold" /></div>

                  <div>
                    <label className={KIT_LBL}>Logo</label>
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-14 rounded-lg border border-[var(--border-card)] flex items-center justify-center overflow-hidden shrink-0" style={{ background: 'var(--bg-input)' }}>
                        {panelKit.logo?.primary
                          ? <img src={panelKit.logo.primary} alt="Logo" className="w-full h-full object-contain" />
                          : <span className="text-[9px] text-[var(--text-muted)]">None</span>}
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className={`${KIT_BTN_GHOST} cursor-pointer text-center`}>
                          {panelKit.logo?.primary ? 'Replace' : 'Upload'}
                          <input type="file" accept="image/*" className="hidden" onChange={e => { onLogoFile(e.target.files?.[0]); e.currentTarget.value = ''; }} />
                        </label>
                        {panelKit.logo?.primary && <button onClick={() => saveKit({ logo: { ...panelKit.logo, primary: undefined } })} className={KIT_BTN_GHOST}>Remove</button>}
                      </div>
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)] mt-1">{tt('ext.studio.logo_upload_hint','Upload one, or ask Ava to set the image she just made as your logo.')}</p>
                  </div>

                  <div><label className={KIT_LBL}>{tt('ext.studio.voice_tone','Voice / tone (flows into posts)')}</label><textarea value={panelKit.voice ?? ''} onChange={e => saveKit({ voice: e.target.value })} className={`${KIT_INP} h-20 resize-none`} placeholder={tt('ext.studio.voice_ph','First person, punchy, honest, no hype…')} /></div>
                  <div><label className={KIT_LBL}>Do (one per line)</label><textarea value={(panelKit.doRules ?? []).join('\n')} onChange={e => saveKit({ doRules: e.target.value.split('\n').map(x => x.trim()).filter(Boolean) })} className={`${KIT_INP} h-16 resize-none`} /></div>
                  <div><label className={KIT_LBL}>Don't (one per line)</label><textarea value={(panelKit.dontRules ?? []).join('\n')} onChange={e => saveKit({ dontRules: e.target.value.split('\n').map(x => x.trim()).filter(Boolean) })} className={`${KIT_INP} h-16 resize-none`} /></div>
                  <div><label className={KIT_LBL}>Default hashtags (comma-separated)</label><input value={(panelKit.defaultHashtags ?? []).join(', ')} onChange={e => saveKit({ defaultHashtags: e.target.value.split(',').map(x => x.trim().replace(/^#/, '')).filter(Boolean) })} className={KIT_INP} placeholder="buildinpublic, localfirst" /></div>
                  <div><label className={KIT_LBL}>{tt('ext.studio.default_link','Default link')}</label><input value={panelKit.defaultLink ?? ''} onChange={e => saveKit({ defaultLink: e.target.value })} className={KIT_INP} placeholder="avasupernova.com" /></div>

                  <div className="flex items-center gap-3 pt-1">
                    {panelKit.id !== kit.id && <button onClick={() => makeActiveId(panelKit.id)} className={KIT_BTN_PRIMARY} style={{ background: 'var(--accent)' }}>{tt('ext.studio.make_active','Make active')}</button>}
                    {loadKits().length > 1 && <button onClick={() => setConfirmDelete(panelKit)} className={`${KIT_BTN_GHOST} ml-auto`}>Delete</button>}
                  </div>
                </div>
              </>)}
            </div>

            {/* Delete confirmation overlay */}
            {confirmDelete && (
              <div className="absolute inset-0 z-40 flex items-center justify-center px-6" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={() => setConfirmDelete(null)}>
                <div className="rounded-xl border border-[var(--border-card)] p-5 w-[320px]" style={{ background: 'rgba(17,12,26,0.99)' }} onClick={e => e.stopPropagation()}>
                  <h3 className="text-[14px] text-[var(--text-primary)] mb-1.5">Delete &ldquo;{confirmDelete.name}&rdquo;?</h3>
                  <p className="text-[12px] text-[var(--text-muted)] mb-4">This brand kit will be removed. This can&rsquo;t be undone.</p>
                  <div className="flex items-center justify-end gap-2.5">
                    <button onClick={() => setConfirmDelete(null)} className={KIT_BTN_GHOST}>Cancel</button>
                    <button onClick={() => doDelete(confirmDelete.id)} className="px-2.5 py-1 rounded-md text-[11px] font-medium text-white transition hover:brightness-110" style={{ background: '#ef4444' }}>Delete</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-2.5 text-center px-10 text-[var(--text-muted)]">
            <PenNib weight="duotone" size={26} style={{ color: 'var(--accent)' }} />
            <span className="text-[15px] text-[var(--text-secondary)]">{DESIGN_GROUPS.flatMap(g => g.items).find(i => i.id === view)?.label}</span>
            <span className="max-w-[420px] text-[13px] leading-relaxed">{tt('dash.studio.coming_soon','Being brought over from the hub. The Icon lane is live — this one lands in an upcoming slice.')}</span>
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
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] transition ${unread && !dockOpen ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-[var(--border-card)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
              style={{ background: 'rgba(13,9,22,0.92)' }}>
              <span className="w-[14px] h-[14px] rounded-full overflow-hidden inline-flex items-center justify-center text-[8px] font-semibold text-white" style={{ background: 'linear-gradient(135deg, var(--accent), #6366f1)' }}>
                {avaAvatarUri ? <img src={avaAvatarUri} alt="" className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} /> : 'A'}
              </span>
              {unread && !dockOpen ? 'Ava replied' : 'Design Architect'}
              {unread && !dockOpen && <span className="w-[6px] h-[6px] rounded-full animate-pulse" style={{ background: 'var(--accent)' }} aria-hidden="true" />}
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
              designPanel={designPanel}
              isActive
              hideHeader
              hideMessages={!renderConv}
              onRegisterDispatch={onRegisterDesignChatDispatch ?? (() => {})}
              onComposerFocus={() => setDockOpen(true)}
              suppressAutoFocus
              onActivity={() => { if (!dockOpenRef.current) setUnread(true); }}
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
            <Section title={tt('dash.studio.icon.shape', 'Shape')}>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder={tt('dash.studio.icon.shape_search_ph', 'Search 1,990 shapes… "bell"')}
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
              <p className="text-[10.5px] text-[var(--text-muted)] mt-1.5">{tt('dash.studio.icon.shape_credit', 'Lucide · 1,990 shapes · licence-clean (ISC)')}</p>
            </Section>

            <Section title={tt('dash.studio.icon.material', 'Material — generated (Qwen-Image)')}>
              <div className="grid grid-cols-2 gap-2">
                {MATERIALS.map(m => {
                  const on = materialId === m.id;
                  return (
                    <button key={m.id} onClick={() => setMaterialId(m.id)} title={m.label}
                      className={`px-2.5 py-[7px] rounded-lg cursor-pointer text-[11.5px] text-center border ${
                        on ? 'border-[var(--accent)]/40 bg-[var(--accent)]/12 text-[var(--accent)]' : 'border-[var(--border-card)] bg-[var(--bg-input)] text-[var(--text-secondary)]'
                      }`}>{tt('dash.studio.material.' + m.id, m.label)}</button>
                  );
                })}
              </div>
              <p className="text-[10.5px] text-[var(--text-muted)] mt-1.5">{tt('dash.studio.icon.material_hint', 'The shape becomes a reference the model paints onto — then matted to a transparent icon. Uses credits.')}</p>
            </Section>

            <Section title={tt('dash.studio.colour_brand', 'Colour — from Brand Kit')}>
              <div className="flex items-center gap-2.5 py-1 text-[12px] text-[var(--text-secondary)]">
                <ColorField value={color} onChange={setColor} swatches={Object.values(kit.palette)} />
                {tt('dash.studio.icon.icon_colour', 'Icon colour')}
                <code className="ml-auto text-[10.5px] text-[var(--text-muted)]">{color.toUpperCase()}</code>
              </div>
              <p className="text-[10.5px] text-[var(--text-muted)] mt-1">{tt('dash.studio.icon.colour_hint', 'The material is rendered in this colour.')}</p>
            </Section>

            <Section title={tt('dash.studio.output', 'Output')}>
              <div className="flex items-center justify-between text-[12px] text-[var(--text-secondary)] py-[5px]">
                <span>{tt('dash.studio.icon.size', 'Icon size')}</span>
                <Select size="sm" className="w-[118px]" value={String(genSize)} onChange={v => setGenSize(Number(v))}
                  options={PNG_SIZES.map(s => ({ value: String(s), label: `${s} × ${s}` }))} />
              </div>
              <p className="text-[10.5px] text-[var(--text-muted)]">{tt('dash.studio.icon.output_hint', 'Generated at a 1024 master, exported at your chosen size. Save / export land next.')}</p>
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
            <Section title={tt('dash.studio.output', 'Output')}>
              <div className="flex items-center justify-between text-[12px] text-[var(--text-secondary)] py-[5px]">
                <span>{tt('dash.studio.video.duration', 'Duration')}</span>
                <Select size="sm" className="w-[118px]" value={videoDuration} onChange={v => setVideoDuration(v)}
                  options={[{ value: '5', label: '5s' }, { value: '10', label: '10s' }]} />
              </div>
              <div className="flex items-center justify-between text-[12px] text-[var(--text-secondary)] py-[5px]">
                <span>{tt('dash.studio.video.aspect', 'Aspect ratio')}</span>
                <Select size="sm" className="w-[118px]" value={videoAspect} onChange={v => setVideoAspect(v)}
                  options={[{ value: '16:9', label: '16:9' }, { value: '9:16', label: '9:16' }, { value: '1:1', label: '1:1' }]} />
              </div>
              <div className="flex items-center justify-between text-[12px] text-[var(--text-secondary)] py-[5px]">
                <span>{tt('dash.studio.video.resolution', 'Resolution')}</span>
                <Select size="sm" className="w-[118px]" value={videoResolution} onChange={v => setVideoResolution(v)}
                  options={[{ value: '720p', label: '720p' }, { value: '1080p', label: '1080p' }]} />
              </div>
            </Section>

            <p className="text-[10.5px] text-[var(--text-muted)] m-0">{tt('dash.studio.video.hint', 'Talk to Ava — she directs the shot and generates it.')}</p>
          </div>
        </aside>
      )}

      {/* RIGHT RAIL — the inspector (voice lane) */}
      {view === 'voice' && (
        <aside className="w-[320px] shrink-0 border-l border-[var(--border-card)] flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-[18px]">
            <Section title={tt('dash.studio.voice.voice', 'Voice')}>
              <div className="flex items-center justify-between text-[12px] text-[var(--text-secondary)] py-[5px]">
                <span>{tt('dash.studio.voice.voice', 'Voice')}</span>
                <Select size="sm" className="w-[150px]" value={voiceName} onChange={v => setVoiceName(v)}
                  options={VOICES.map(v => ({ value: v, label: v }))} />
              </div>
              <div className="flex items-center justify-between text-[12px] text-[var(--text-secondary)] py-[5px]">
                <span>{tt('dash.studio.voice.language', 'Language')}</span>
                <Select size="sm" className="w-[150px]" value={voiceLanguage} onChange={v => setVoiceLanguage(v)}
                  options={VOICE_LANGUAGES.map(l => ({ value: l, label: l }))} />
              </div>
              <p className="text-[10.5px] text-[var(--text-muted)] mt-2">{tt('dash.studio.voice.hint', 'Qwen3-TTS voices. Pace and emotion are directed in words — Ava has no speed knob.')}</p>
            </Section>

            <p className="text-[10.5px] text-[var(--text-muted)] m-0">{tt('dash.studio.voice.foot', 'Talk to Ava — she writes the read, directs the delivery, and voices it.')}</p>
          </div>
        </aside>
      )}

      {/* RIGHT RAIL — the inspector (image lane) */}
      {view === 'image' && (
        <aside className="w-[320px] shrink-0 border-l border-[var(--border-card)] flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-[18px]">
            <Section title={tt('dash.studio.output', 'Output')}>
              <div className="flex items-center justify-between text-[12px] text-[var(--text-secondary)] py-[5px]">
                <span>{tt('dash.studio.image.size', 'Size')}</span>
                <Select size="sm" className="w-[130px]" value={imageSize} onChange={v => setImageSize(v)}
                  options={[{ value: '1024*1024', label: tt('dash.studio.image.square', '1:1 square') }, { value: '1280*720', label: '16:9' }, { value: '720*1280', label: '9:16' }]} />
              </div>
            </Section>

            <p className="text-[10.5px] text-[var(--text-muted)] m-0">{tt('dash.studio.image.hint', 'Talk to Ava — she composes the image and renders it.')}</p>
          </div>
        </aside>
      )}

      {/* RIGHT RAIL — the inspector (logo lane). Options + finish ONLY. You
          design by talking to Ava in the dock — she gauges and proposes; this
          panel just tunes and exports (no prompt box, like every other lane). */}
      {view === 'logo' && (
        <aside className="w-[320px] shrink-0 border-l border-[var(--border-card)] flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-[18px]">
            <Section title={tt('dash.studio.logo.form', 'Form')}>
              <div className="grid grid-cols-2 gap-2">
                {([['combination', tt('dash.studio.logo.form.combination', 'Mark + name')], ['emblem', tt('dash.studio.logo.form.emblem', 'Emblem')]] as const).map(([id, label]) => {
                  const on = logoForm === id;
                  return (
                    <button key={id} onClick={() => setLogoForm(id as 'combination' | 'emblem')}
                      className={`px-2.5 py-[7px] rounded-lg cursor-pointer text-[11.5px] text-center border ${on ? 'border-[var(--accent)]/40 bg-[var(--accent)]/12 text-[var(--accent)]' : 'border-[var(--border-card)] bg-[var(--bg-input)] text-[var(--text-secondary)]'}`}>{label}</button>
                  );
                })}
              </div>
              <p className="text-[10.5px] text-[var(--text-muted)] mt-1.5">
                {logoForm === 'emblem' ? tt('dash.studio.logo.form.emblem_desc', 'A badge — name curved over the top, mark centred, tagline under the bottom.') : tt('dash.studio.logo.form.combination_desc', 'The mark beside or above the name.')}
              </p>
              {logoForm === 'emblem' && (
                <input value={logoTagline} onChange={e => setLogoTagline(e.target.value)} placeholder={tt('dash.studio.logo.tagline_ph', 'Tagline / date — "EST 2026", "ROASTERS"')}
                  className="w-full mt-2 px-3 py-2 rounded-lg text-[12px] outline-none bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-card)] box-border" />
              )}
            </Section>

            <Section title={tt('dash.studio.logo.mark_type', 'Mark type')}>
              <div className="grid grid-cols-3 gap-2">
                {MARK_TYPES.map(mt => {
                  const on = logoMarkType === mt.id;
                  return (
                    <button key={mt.id} onClick={() => setLogoMarkType(mt.id)}
                      className={`px-2.5 py-[7px] rounded-lg cursor-pointer text-[11.5px] text-center border ${on ? 'border-[var(--accent)]/40 bg-[var(--accent)]/12 text-[var(--accent)]' : 'border-[var(--border-card)] bg-[var(--bg-input)] text-[var(--text-secondary)]'}`}>{tt('dash.studio.marktype.' + mt.id, mt.label)}</button>
                  );
                })}
              </div>
              <p className="text-[10.5px] text-[var(--text-muted)] mt-1.5">
                {logoMarkType === 'letter'
                  ? tt('dash.studio.marktype.letter_desc', 'Your initial, built from the wordmark font — clean and distinctively yours.')
                  : logoMarkType === 'icon'
                  ? tt('dash.studio.marktype.icon_desc', 'A shape from the icon library, for when a literal object fits.')
                  : tt('dash.studio.marktype.geometry_desc', 'Ava draws the mark herself, as exact vector geometry. Where the good ones come from.')}
              </p>
            </Section>

            {logoMarkType === 'letter' ? (
              <Section title={tt('dash.studio.logo.emblem_ring', 'Emblem')}>
                <div className="grid grid-cols-2 gap-2">
                  {(['none', 'ring'] as const).map(c => {
                    const on = logoContainer === c;
                    return (
                      <button key={c} onClick={() => setLogoContainer(c)}
                        className={`px-2.5 py-[7px] rounded-lg cursor-pointer text-[11.5px] text-center border ${on ? 'border-[var(--accent)]/40 bg-[var(--accent)]/12 text-[var(--accent)]' : 'border-[var(--border-card)] bg-[var(--bg-input)] text-[var(--text-secondary)]'}`}>{c === 'none' ? tt('dash.studio.logo.container.none', 'Letter') : tt('dash.studio.logo.container.ring', 'In a ring')}</button>
                    );
                  })}
                </div>
              </Section>
            ) : logoMarkType === 'icon' ? (
              <Section title={tt('dash.studio.logo.mark_shape', 'Mark shape')}>
                <input value={logoQuery} onChange={e => setLogoQuery(e.target.value)} placeholder={tt('dash.studio.logo.shape_search_ph', 'Search 1,990 shapes… "star"')}
                  className="w-full px-3 py-2 rounded-lg text-[12px] outline-none bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-card)] box-border" />
                <div className="grid grid-cols-4 gap-[7px] mt-2.5">
                  {logoHits.map((h: ShapeHit) => {
                    const on = h.id === logoMark;
                    return (
                      <button key={h.id} onClick={() => setLogoMark(h.id)} title={h.label} aria-label={h.label}
                        className="aspect-square rounded-lg cursor-pointer p-[9px]" style={{ background: on ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--bg-input)', border: `1px solid ${on ? 'var(--accent)' : 'var(--border-card)'}` }}
                        dangerouslySetInnerHTML={{ __html: buildShapeSvg(h.elements, 'line', [on ? '#c9a2ff' : '#8b93b8']) }} />
                    );
                  })}
                </div>
                <p className="text-[10.5px] text-[var(--text-muted)] mt-1.5">{tt('dash.studio.logo.shape_hint', 'The shape Ava builds the mark from — set one to lock it.')}</p>
              </Section>
            ) : (
              <Section title={tt('dash.studio.logo.construction', 'Construction')}>
                <p className="text-[11.5px] text-[var(--text-secondary)] leading-[1.5]">
                  {logoSpec ? logoSpec.concept : tt('dash.studio.logo.construction_hint', 'Ask Ava for a direction — she composes the geometry herself, and it lands here.')}
                </p>
              </Section>
            )}

            <Section title={tt('dash.studio.logo.style', 'Style')}>
              <div className="grid grid-cols-2 gap-2">
                {LOGO_STYLES.map(s => {
                  const on = logoStyle === s.id;
                  return (
                    <button key={s.id} onClick={() => setLogoStyle(s.id)} title={tt('dash.studio.style.' + s.id, s.label)}
                      className={`px-2.5 py-[7px] rounded-lg cursor-pointer text-[11.5px] text-center border ${on ? 'border-[var(--accent)]/40 bg-[var(--accent)]/12 text-[var(--accent)]' : 'border-[var(--border-card)] bg-[var(--bg-input)] text-[var(--text-secondary)]'}`}>{tt('dash.studio.style.' + s.id, s.label)}</button>
                  );
                })}
              </div>
              <p className="text-[10.5px] text-[var(--text-muted)] mt-1.5">{tt('dash.studio.logo.style_hint', 'True vector, every one — a gradient logo stays infinitely scalable.')}</p>
            </Section>

            <Section title={tt('dash.studio.colour_brand', 'Colour — from Brand Kit')}>
              <div className="flex items-center gap-2.5 py-1 text-[12px] text-[var(--text-secondary)]">
                <ColorField value={logoColour} onChange={setLogoColour} swatches={Object.values(kit.palette)} />
                {tt('dash.studio.logo.mark_colour', 'Mark colour')}
                <code className="ml-auto text-[10.5px] text-[var(--text-muted)]">{logoColour.toUpperCase()}</code>
              </div>
              {TWO_TONE(logoStyle) && (
                <div className="flex items-center gap-2.5 py-1 text-[12px] text-[var(--text-secondary)]">
                  <ColorField value={logoSecondary} onChange={setLogoSecondary} swatches={Object.values(kit.palette)} />
                  {tt('dash.studio.logo.second_colour', 'Second colour')}
                  <code className="ml-auto text-[10.5px] text-[var(--text-muted)]">{logoSecondary.toUpperCase()}</code>
                </div>
              )}
            </Section>

            <Section title={tt('dash.studio.logo.wordmark', 'Wordmark')}>
              <div className="flex items-center justify-between text-[12px] text-[var(--text-secondary)] py-[5px]">
                <span>{tt('dash.studio.logo.font', 'Font')}</span>
                <Select size="sm" className="w-[150px]" value={logoFontId || suggestFont(kit.styleTags).id} onChange={v => setLogoFontId(v)}
                  options={WORDMARK_FONTS.map(f => ({ value: f.id, label: f.label, fontFamily: f.id }))} />
              </div>
              <div className="grid grid-cols-3 gap-2 mt-1.5">
                {([['ink', tt('dash.studio.logo.wc.ink', 'Ink')], ['brand', tt('dash.studio.logo.wc.brand', 'Brand')], ['custom', tt('dash.studio.logo.wc.custom', 'Custom')]] as const).map(([id, label]) => {
                  const isCustom = logoWordColour !== 'ink' && logoWordColour !== 'brand';
                  const on = id === 'custom' ? isCustom : logoWordColour === id;
                  return (
                    <button key={id} onClick={() => setLogoWordColour(id === 'custom' ? (isCustom ? logoWordColour : brandInk(logoColour)) : id)}
                      className={`px-2.5 py-[7px] rounded-lg cursor-pointer text-[11.5px] text-center border ${on ? 'border-[var(--accent)]/40 bg-[var(--accent)]/12 text-[var(--accent)]' : 'border-[var(--border-card)] bg-[var(--bg-input)] text-[var(--text-secondary)]'}`}>{label}</button>
                  );
                })}
              </div>
              {logoWordColour !== 'ink' && logoWordColour !== 'brand' && (
                <div className="flex items-center gap-2.5 py-1 mt-1 text-[12px] text-[var(--text-secondary)]">
                  <ColorField value={logoWordColour} onChange={setLogoWordColour} swatches={Object.values(kit.palette)} />
                  {tt('dash.studio.logo.wordmark_colour', 'Wordmark colour')}
                  <code className="ml-auto text-[10.5px] text-[var(--text-muted)]">{logoWordColour.toUpperCase()}</code>
                </div>
              )}
              <p className="text-[10.5px] text-[var(--text-muted)] mt-1">
                {logoWordColour === 'ink' ? tt('dash.studio.logo.wc.ink_desc', 'A deep tint of your brand colour — reads as ink, stays on-palette.') : logoWordColour === 'brand' ? tt('dash.studio.logo.wc.brand_desc', 'The wordmark in the brand colour itself.') : tt('dash.studio.logo.wc.custom_desc', 'A colour of your choosing.')}
              </p>
            </Section>

            {logoSystem && !logoBusy && (
              <Section title={tt('dash.studio.finish', 'Finish')}>
                <button onClick={setLogoAsBrand} className={`${KIT_BTN_GHOST} w-full`}>{tt('dash.studio.logo.set_as_logo', 'Set as {name}’s logo').replace('{name}', kit.name)}</button>
                <button onClick={() => { saveLogoSystemToLibrary(logoSystem); }} className={`${KIT_BTN_GHOST} w-full mt-1.5`}>
                  {tt('dash.studio.logo.save_all', 'Save all forms to Library')}
                </button>
                <button
                  onClick={() => { const a = logoSystem.assets.find(x => x.variant === logoVariant) ?? logoSystem.assets[0]; saveAssetCopy('data:image/svg+xml,' + encodeURIComponent(a.svg), `${logoSystem.brandName}-${a.variant}.svg`); }}
                  className={`${KIT_BTN_GHOST} w-full mt-1.5`}
                >
                  {tt('dash.studio.logo.download', 'Download {label} (SVG)').replace('{label}', logoSystem.assets.find(x => x.variant === logoVariant)?.label ?? 'SVG')}
                </button>
              </Section>
            )}

            <p className="text-[10.5px] text-[var(--text-muted)] m-0">{tt('ext.studio.icon_lane_intro','Talk to Ava — she gauges the brand, proposes the mark, designs it and tells you why.')}</p>
          </div>
        </aside>
      )}

      {/* Logo results modal — only when triggered from OUTSIDE the Logo view
          (e.g. Ava from chat while on another view). The Logo view renders its
          own inline results. */}
      {logoShowModal && view !== 'logo' && (logoBusy || logoSystem) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(3px)' }} onClick={() => { if (!logoBusy) setLogoShowModal(false); }}>
          <style>{`.logo-tile svg{max-height:80px;max-width:100%;width:auto;height:auto;display:block}`}</style>
          <div className="relative w-full max-w-3xl max-h-[88vh] overflow-y-auto rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card)] shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <button onClick={() => setLogoShowModal(false)} disabled={logoBusy} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 text-white flex items-center justify-center border-none cursor-pointer disabled:opacity-40">×</button>
            <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">{logoSystem ? `Logo — ${logoSystem.brandName}` : 'Designing your logo…'}</h3>
            <p className="text-xs text-[var(--text-muted)] mb-4">{logoBusy ? 'Symbol → trace → wordmark → variants.' : 'The full system — lockups, symbol, wordmark, mono, favicon.'}</p>
            {logoBusy && (
              <div className="flex flex-col items-center justify-center gap-3 py-16">
                <div className="w-7 h-7 rounded-full border-2 border-[var(--border-card)] border-t-[var(--accent)] animate-spin" />
                <span className="text-xs text-[var(--text-secondary)]">Composing…</span>
              </div>
            )}
            {logoSystem && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {logoSystem.assets.map(a => (
                  <div key={a.variant} className="rounded-xl border border-[var(--border-card)] overflow-hidden">
                    <div className="logo-tile flex items-center justify-center p-4 h-28" style={{ background: a.variant === 'mono-light' ? '#1b1b22' : '#ffffff' }}
                      dangerouslySetInnerHTML={{ __html: a.svg.replace(/\s(width|height)="[^"]*"/g, '') }} />
                    <div className="px-2.5 py-1.5 text-[10px] text-[var(--text-muted)] border-t border-[var(--border-card)]">{a.label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
