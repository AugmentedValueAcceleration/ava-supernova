/**
 * Deterministic SVG icon engine — Lane 1 of the icon pivot (2026-07-04).
 *
 * Research verdict: the industry never mattes icons — it generates vectors.
 * This engine goes one further for the common case: no generation AT ALL.
 * Curated shape paths + styles applied in code = exact colours, transparency
 * by construction, any size, zero credits, instant, offline. Wan stays for
 * full-bleed art; Recraft V3 is the future premium lane for AI-designed icons.
 *
 * Shapes are Lucide/Feather-style stroke-first paths in a 24×24 viewBox.
 * Elements marked `fillable` participate in fill for the filled styles
 * (flat / gradient / duotone); pure-line glyphs (check) simply stroke bolder.
 */

export interface IconElement {
  /** SVG path data (24×24 viewBox) — or use `circle`. */
  d?: string;
  circle?: { cx: number; cy: number; r: number };
  /** Closed shape — filled by flat/gradient/duotone styles. */
  fillable?: boolean;
}

/** Generalized shape element — any SVG primitive with its attributes. This is
 *  the contract the shape library (Lucide adapter) speaks; the legacy
 *  IconElement shapes convert into it. */
export interface ShapeElement {
  tag: string; // path | circle | rect | line | polyline | polygon | ellipse
  attrs: Record<string, string | number>;
  /** Closed shape — participates in fill for flat/gradient/duotone. */
  fillable?: boolean;
}

export const ICON_SVG_SHAPES: Record<string, IconElement[]> = {
  star: [{ d: 'M12 2.6l2.6 6.3 6.8.5-5.2 4.4 1.7 6.6L12 16.9 6.3 20.4 8 13.8 2.8 9.4l6.8-.5z', fillable: true }],
  heart: [{ d: 'M12 20.5S3.5 15 3.5 8.9C3.5 6 5.6 4 8.2 4c1.9 0 3.2 1.1 3.8 2.2C12.6 5.1 13.9 4 15.8 4c2.6 0 4.7 2 4.7 4.9C20.5 15 12 20.5 12 20.5z', fillable: true }],
  home: [{ d: 'M12 3.5L21 11.8h-2.8v8.7H5.8v-8.7H3z', fillable: true }],
  user: [
    { circle: { cx: 12, cy: 8.2, r: 3.4 }, fillable: true },
    { d: 'M5.5 19.5c0-3.5 3-5.2 6.5-5.2s6.5 1.7 6.5 5.2z', fillable: true },
  ],
  bell: [
    { d: 'M6 17c1.2-1 1.6-3 1.6-5V10a4.4 4.4 0 018.8 0v2c0 2 .4 4 1.6 5z', fillable: true },
    { d: 'M9.2 19a2.8 2.8 0 005.6 0' },
  ],
  gear: [
    { circle: { cx: 12, cy: 12, r: 3.1 }, fillable: true },
    { d: 'M12 4.6v2.6M12 16.8v2.6M4.6 12h2.6M16.8 12h2.6M6.8 6.8l1.85 1.85M15.35 15.35l1.85 1.85M17.2 6.8l-1.85 1.85M8.65 15.35L6.8 17.2' },
  ],
  search: [
    { circle: { cx: 10.5, cy: 10.5, r: 6 }, fillable: true },
    { d: 'M15 15l5 5' },
  ],
  cart: [
    { d: 'M3 4h2l1.8 10.5h10.6L19.5 7.5H6.3', fillable: true },
    { circle: { cx: 9, cy: 19, r: 1.4 }, fillable: true },
    { circle: { cx: 17, cy: 19, r: 1.4 }, fillable: true },
  ],
  mail: [
    { d: 'M3 6.8h18v11.4H3z', fillable: true },
    { d: 'M3.5 7.3L12 13.3l8.5-6' },
  ],
  chat: [{ d: 'M4 5.5h16V15H9l-4 4z', fillable: true }],
  camera: [
    { d: 'M4 8h3l1.4-2h7.2L17 8h3v10H4z', fillable: true },
    { circle: { cx: 12, cy: 13, r: 3 } },
  ],
  calendar: [
    { d: 'M4 6.5h16v13.5H4z', fillable: true },
    { d: 'M4 10.5h16M8 4v3.5M16 4v3.5' },
  ],
  lock: [
    { d: 'M6 11h12v9H6z', fillable: true },
    { d: 'M8.5 11V8a3.5 3.5 0 017 0v3' },
  ],
  play: [{ d: 'M8 5.5l11 6.5-11 6.5z', fillable: true }],
  cloud: [{ d: 'M7 18h10a3.6 3.6 0 000-7.2 5 5 0 00-9.6-1.3A3.5 3.5 0 007 18z', fillable: true }],
  check: [{ d: 'M5 12.5l4.5 4.5L19 7' }],
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** Legacy IconElement → generalized ShapeElement. */
function toShapeElement(e: IconElement): ShapeElement {
  return e.circle
    ? { tag: 'circle', attrs: { cx: e.circle.cx, cy: e.circle.cy, r: e.circle.r }, fillable: e.fillable }
    : { tag: 'path', attrs: { d: e.d! }, fillable: e.fillable };
}

function shapeEl(e: ShapeElement, styleAttrs: string): string {
  const geo = Object.entries(e.attrs)
    .map(([k, v]) => `${k}="${esc(String(v))}"`)
    .join(' ');
  return `<${e.tag} ${geo} ${styleAttrs}/>`;
}

/**
 * Build an icon SVG from generalized shape elements × style × colours.
 * Deterministic; no model. This is the engine every shape source drives —
 * the Lucide library, the legacy built-ins, and later the designer persona's
 * structured specs.
 *  - flat      colours[0] — filled silhouette + matching bold stroke
 *  - gradient  colours[0→1] — same geometry, gradient paint
 *  - line      colours[0] — 2px monoline stroke, no fill
 *  - duotone   colours[0] base fill (30%) + colours[1] accent stroke
 *  - neon      colours[0] glow — layered blurred strokes + bright core
 */
export function buildShapeSvg(shape: ShapeElement[], styleId: string, colors: string[], weight = 2): string {
  const c0 = colors[0] ?? '#7c5cff';
  const c1 = colors[1] ?? c0;
  const w = weight; // base stroke width in the 24-unit viewBox; other weights scale off it
  const stroke = (sw: number, color: string, extra = '') =>
    `fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" ${extra}`;
  const fillStroke = (sw: number, paint: string, e: ShapeElement) =>
    `fill="${e.fillable ? paint : 'none'}" stroke="${paint}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"`;

  let defs = '';
  let body = '';
  switch (styleId) {
    case 'gradient': {
      defs = `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c0}"/><stop offset="1" stop-color="${c1}"/></linearGradient>`;
      body = shape.map(e => shapeEl(e, fillStroke(w * 1.1, 'url(#g)', e))).join('');
      break;
    }
    case 'line':
      body = shape.map(e => shapeEl(e, stroke(w, c0))).join('');
      break;
    case 'duotone':
      body =
        shape.filter(e => e.fillable).map(e => shapeEl(e, `fill="${c0}" fill-opacity="0.3" stroke="none"`)).join('') +
        shape.map(e => shapeEl(e, stroke(w, c1))).join('');
      break;
    case 'neon': {
      defs = `<filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="1.6"/></filter>` +
             `<filter id="glow2" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="3.2"/></filter>`;
      body =
        shape.map(e => shapeEl(e, stroke(w * 1.6, c0, 'filter="url(#glow2)" opacity="0.55"'))).join('') +
        shape.map(e => shapeEl(e, stroke(w * 1.2, c0, 'filter="url(#glow)"'))).join('') +
        shape.map(e => shapeEl(e, stroke(w * 0.55, '#ffffff', 'opacity="0.92"'))).join('');
      break;
    }
    case 'flat':
    default:
      body = shape.map(e => shapeEl(e, fillStroke(w * 1.1, c0, e))).join('');
      break;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`;
}

/** Legacy builder — the original 16 built-in shapes. Kept for the classic
 *  forge path until the new frame fully replaces it; delegates to the
 *  generalized engine. */
export function buildIconSvg(shapeId: string, styleId: string, colors: string[]): string {
  const shape = ICON_SVG_SHAPES[shapeId] ?? ICON_SVG_SHAPES.star;
  return buildShapeSvg(shape.map(toShapeElement), styleId, colors);
}

/** Rasterize the SVG to a transparent PNG data URL at the given pixel size. */
export function svgToPngDataUrl(svg: string, w: number, h: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) { reject(new Error('no 2d context')); return; }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('svg rasterize failed'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}
