import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AccountInfo } from '../types/messages';
import { PenNib } from '@phosphor-icons/react';
import { post } from '../App';
import { Select } from '../components/Select';
import { buildShapeSvg, svgToPngDataUrl } from '../lib/asset-forge/icon-svg';
import { searchShapes, getShape, type ShapeHit } from '../lib/asset-forge/shape-library';
import { activeKit } from '../lib/asset-forge/brand-kit';
import { MATERIALS, armatureSvg, composeIconPrompt, ICON_NEGATIVE } from '../lib/asset-forge/generate';

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

type ViewId = 'icon' | 'iconset' | 'logo' | 'badge' | 'banner' | 'gamekit' | 'gamepiece' | 'canvas' | 'brandkit';

// Left-nav group accent colours mirror the hub (Web/App purple, Game orange,
// Open Canvas blue).
const GROUPS: { label: string; accent: string; items: { id: ViewId; label: string; badge?: string }[] }[] = [
  { label: 'Web / App', accent: 'var(--accent)', items: [
    { id: 'icon', label: 'Icon' }, { id: 'iconset', label: 'Icon Set' },
    { id: 'logo', label: 'Logo', badge: 'NEXT' }, { id: 'badge', label: 'Badge / Mark', badge: 'SOON' },
    { id: 'banner', label: 'Banner / Hero', badge: 'SOON' },
  ] },
  { label: 'Game', accent: '#f0a24b', items: [
    { id: 'gamekit', label: 'UI Kit', badge: 'SOON' }, { id: 'gamepiece', label: 'Single Piece', badge: 'SOON' },
  ] },
  { label: 'Open Canvas', accent: '#6aa9ff', items: [{ id: 'canvas', label: 'Image', badge: 'SOON' }] },
];

export function DesignStudio({ account: _account }: { account?: AccountInfo | null }) {
  const kit = useMemo(() => activeKit(), []);
  const [view, setView] = useState<ViewId>('icon');

  const [query, setQuery] = useState('');
  const [shapeId, setShapeId] = useState('Bell');
  const [color, setColor] = useState<string>(kit.palette.primary);
  const [boardBg, setBoardBg] = useState(CHECKER);

  // Design Studio is a GENERATION surface — the free deterministic vector-icon
  // styling moves to the Library tab (all the free icon packs, usable in any
  // project). Here: pick a shape → a material → your colour → generate.
  const [materialId, setMaterialId] = useState('glass');
  const [genResult, setGenResult] = useState<string | null>(null);
  const [genStatus, setGenStatus] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [genSize, setGenSize] = useState(512);
  const [dockOpen, setDockOpen] = useState(false);
  const material = MATERIALS.find(m => m.id === materialId) ?? MATERIALS[0];
  // The real Ava avatar — the host injects it as a webview URI on #root, the
  // same one the chat bubbles use (relative paths don't load in a webview).
  const avaAvatarUri = typeof document !== 'undefined' ? document.getElementById('root')?.dataset.avaAvatarUri : '';

  const hits = useMemo(() => searchShapes(query, 24), [query]);
  const shape = useMemo(() => getShape(shapeId), [shapeId]);

  // A generated result belongs to one (shape × material × colour); invalidate.
  useEffect(() => { setGenResult(null); setGenError(null); }, [shapeId, materialId, color]);

  // The host runs the pipeline and posts the matted PNG back here.
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const m = e.data as { type?: string; success?: boolean; dataUrl?: string; error?: string };
      if (!m || m.type !== 'asset_forge_result') return;
      if (m.success && m.dataUrl) setGenResult(m.dataUrl);
      else setGenError(m.error || 'Generation failed');
      setGenStatus(null);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Shape-as-dial: render the shape to a white-silhouette armature, hand it to
  // the host with an art-director prompt → Qwen-Image-edit-max → server matte.
  const generate = async () => {
    if (!shape || genStatus) return;
    setGenError(null); setGenResult(null);
    try {
      setGenStatus('Preparing…');
      const armature = await svgToPngDataUrl(armatureSvg(shape), 1024, 1024);
      const prompt = composeIconPrompt(shape.label, material, color);
      setGenStatus('Generating with Qwen-Image…');
      post({ type: 'asset_forge_generate', body: { prompt, referenceImage: armature, size: '1024*1024', negativePrompt: ICON_NEGATIVE } });
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Generation failed');
      setGenStatus(null);
    }
  };

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
              return (
                <button key={it.id} onClick={() => setView(it.id)}
                  className={`flex items-center gap-2 w-full px-2.5 py-[7px] rounded-lg text-[12.5px] text-left cursor-pointer border ${
                    on ? 'border-[var(--accent)]/40 bg-[var(--accent)]/12 text-[var(--accent)] font-normal'
                       : 'border-transparent bg-transparent text-[var(--text-secondary)] font-light hover:text-[var(--text-primary)]'
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

      {/* CENTRE — the stage */}
      <div className="flex-1 flex flex-col min-w-0 relative">
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

        {/* DESIGNER DOCK — the Ava design lane (Phase C). Honest shell for now:
            it expands to an overlay, collapses to a bar, never pushes the stage. */}
        {dockOpen && (
          <div className="absolute left-0 right-0 bottom-[49px] max-h-[30%] overflow-y-auto z-30 border-t border-[var(--accent)]/40 px-5 py-3.5" style={{ background: 'rgba(13,9,22,0.96)' }}>
            <p className="text-[12.5px] text-[var(--text-secondary)] max-w-[560px] leading-relaxed">
              <b className="text-[var(--accent)] font-medium">The Design Architect arrives next.</b> She'll live here — same Ava, your selected model, her own design conversation kept per Brand Kit. Until then this dock is honest scaffolding, not a fake chatbot.
            </p>
          </div>
        )}
        <div className="flex items-center gap-2.5 px-4 py-2.5 border-t border-[var(--border-card)] shrink-0" style={{ background: 'rgba(10,7,20,0.5)' }}>
          <div className="w-[26px] h-[26px] rounded-full shrink-0 flex items-center justify-center overflow-hidden text-[11px] font-semibold text-white" style={{ background: 'linear-gradient(135deg, var(--accent), #6366f1)' }}>
            {avaAvatarUri
              ? <img src={avaAvatarUri} alt="Ava" className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              : 'A'}
          </div>
          <div className="flex-1 border border-[var(--border-card)] rounded-full px-4 py-1.5 text-[12px] text-[var(--text-muted)]" style={{ background: 'var(--bg-input)' }}>
            The Design Architect joins here — "a calmer bell", "make me the whole set", "logo ideas"
          </div>
          <button onClick={() => setDockOpen(v => !v)} className="text-[11px] text-[var(--text-muted)] px-2.5 py-1 rounded-lg border border-[var(--border-card)] cursor-pointer hover:text-[var(--text-secondary)]">
            {dockOpen ? 'Collapse' : 'Expand'}
          </button>
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

          {/* Generate — pinned to the bottom, unified button style, always visible */}
          <div className="shrink-0 border-t border-[var(--border-card)] p-3.5">
            <button onClick={generate} disabled={!!genStatus || !shape}
              className={`w-full py-2.5 rounded-lg text-[13px] font-medium border transition cursor-pointer ${
                !genStatus && shape
                  ? 'bg-[var(--accent)]/15 border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent)]/25'
                  : 'bg-[var(--bg-input)] border-[var(--border-card)] text-[var(--text-muted)] cursor-default'
              }`}>
              {genStatus ? genStatus : genResult ? `Regenerate ${material.label} icon` : `Generate ${material.label} icon`}
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
