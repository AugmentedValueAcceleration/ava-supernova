// ─── Mark primitives — Ava's drawing instruments ─────────────────────────────
//
// A brand mark is CONSTRUCTED, not generated. Ava emits a small declarative spec
// (`MarkSpec`) and this compiles it to the `ShapeElement[]` that buildShapeSvg
// already renders — so a mark is exact vector from birth: no image model, no
// matte, no trace, no speckles, no credits, no round-trip.
//
// Why primitives instead of letting her write path data: an LLM authoring raw
// coordinates cannot SEE what it drew. In the Phase-1 gate, hand-authored `d`
// strings produced lopsided star arms and rays that floated off their core —
// craft errors invisible to the author. Here symmetry is arithmetic. She chooses
// the concept; the maths guarantees the execution.
//
// Everything lives in the engine's 24×24 viewBox, centred on (12, 12).

import { buildShapeSvg, type ShapeElement } from '../icon-svg';

const C = 12; // centre of the 24×24 box
const r2 = (n: number) => Math.round(n * 1000) / 1000;
const rad = (deg: number) => ((deg - 90) * Math.PI) / 180; // 0° = up
const px = (cx: number, cy: number, r: number, deg: number) => [r2(cx + r * Math.cos(rad(deg))), r2(cy + r * Math.sin(rad(deg)))] as const;

// ─── geometry → path data ────────────────────────────────────────────────────

/** A full circle as two arcs (so it can be concatenated into an even-odd cut). */
function discPath(cx: number, cy: number, r: number): string {
  return `M${r2(cx - r)} ${r2(cy)} A${r2(r)} ${r2(r)} 0 1 0 ${r2(cx + r)} ${r2(cy)} A${r2(r)} ${r2(r)} 0 1 0 ${r2(cx - r)} ${r2(cy)} Z`;
}

function polygonPath(cx: number, cy: number, r: number, sides: number, rotate = 0): string {
  const pts = Array.from({ length: Math.max(3, sides) }, (_, i) => px(cx, cy, r, rotate + (360 * i) / Math.max(3, sides)));
  return `M${pts[0][0]} ${pts[0][1]} ` + pts.slice(1).map((p) => `L${p[0]} ${p[1]}`).join(' ') + ' Z';
}

/**
 * A star. `curve` bends the flanks inward: 0 = straight-sided classic star,
 * 1 = the concave needle-spark. `inner` is the waist radius — small + curved
 * gives a sharp burst, large + straight gives a compass rose.
 */
function starPath(cx: number, cy: number, outer: number, inner: number, points: number, rotate = 0, curve = 0): string {
  const n = Math.max(3, points);
  const step = 360 / n;
  const out = (i: number) => px(cx, cy, outer, rotate + i * step);
  const mid = (i: number) => px(cx, cy, inner, rotate + i * step + step / 2);
  const [sx, sy] = out(0);
  let d = `M${sx} ${sy}`;
  for (let i = 0; i < n; i++) {
    const [mx, my] = mid(i);
    const [ox, oy] = out((i + 1) % n);
    d += curve > 0 ? ` Q${mx} ${my} ${ox} ${oy}` : ` L${mx} ${my} L${ox} ${oy}`;
  }
  return d + ' Z';
}

/** A filled arc band (a slice of a ring) from `from`° to `to`°, clockwise. */
function arcBandPath(cx: number, cy: number, r: number, thickness: number, from: number, to: number): string {
  const ro = r;
  const ri = Math.max(0.5, r - thickness);
  const sweep = Math.abs(to - from) > 180 ? 1 : 0;
  const [ox1, oy1] = px(cx, cy, ro, from);
  const [ox2, oy2] = px(cx, cy, ro, to);
  const [ix2, iy2] = px(cx, cy, ri, to);
  const [ix1, iy1] = px(cx, cy, ri, from);
  return `M${ox1} ${oy1} A${r2(ro)} ${r2(ro)} 0 ${sweep} 1 ${ox2} ${oy2} L${ix2} ${iy2} A${r2(ri)} ${r2(ri)} 0 ${sweep} 0 ${ix1} ${iy1} Z`;
}

/** A pointed leaf — two mirrored cubics meeting at tip and base.
 *  A cubic only reaches ~3/4 of the way to its control points, so the controls
 *  are pushed out by 4/3: `width` then means the leaf's ACTUAL width, which is
 *  what the caller asked for and has no way to measure. */
function leafPath(cx: number, cy: number, w: number, h: number): string {
  const top = r2(cy - h / 2);
  const bot = r2(cy + h / 2);
  const ctrl = (w / 2) * (4 / 3);
  const k = h * 0.36; // shoulder height — where the curve is widest
  return (
    `M${r2(cx)} ${bot} C${r2(cx - ctrl)} ${r2(cy + k)} ${r2(cx - ctrl)} ${r2(cy - k)} ${r2(cx)} ${top}` +
    ` C${r2(cx + ctrl)} ${r2(cy - k)} ${r2(cx + ctrl)} ${r2(cy + k)} ${r2(cx)} ${bot} Z`
  );
}

/** A thick chevron pointing up — arms of even `thickness`, mitred exactly. The
 *  inner apex is offset along the bisector by t·len/(w/2), which is the distance
 *  that keeps the perpendicular arm width equal to `thickness` at every point. */
function chevronPath(cx: number, cy: number, w: number, h: number, t: number): string {
  const half = w / 2;
  const top = cy - h / 2;
  const bot = cy + h / 2;
  const len = Math.hypot(half, h);
  const dApex = (t * len) / half;   // vertical drop of the inner apex
  const dFoot = (t * len) / h;      // horizontal inset of the inner feet
  return (
    `M${r2(cx - half)} ${r2(bot)} L${r2(cx)} ${r2(top)} L${r2(cx + half)} ${r2(bot)}` +
    ` L${r2(cx + half - dFoot)} ${r2(bot)} L${r2(cx)} ${r2(top + dApex)} L${r2(cx - half + dFoot)} ${r2(bot)} Z`
  );
}

/** A rounded bar. */
function barPath(x: number, y: number, w: number, h: number, round: number): string {
  const rr = Math.min(round, w / 2, h / 2);
  return (
    `M${r2(x + rr)} ${r2(y)} H${r2(x + w - rr)} A${r2(rr)} ${r2(rr)} 0 0 1 ${r2(x + w)} ${r2(y + rr)}` +
    ` V${r2(y + h - rr)} A${r2(rr)} ${r2(rr)} 0 0 1 ${r2(x + w - rr)} ${r2(y + h)}` +
    ` H${r2(x + rr)} A${r2(rr)} ${r2(rr)} 0 0 1 ${r2(x)} ${r2(y + h - rr)}` +
    ` V${r2(y + rr)} A${r2(rr)} ${r2(rr)} 0 0 1 ${r2(x + rr)} ${r2(y)} Z`
  );
}

/** A teardrop — a circle with a point drawn out at `rotate`°. The flanks are the
 *  TRUE tangents from the tip to the circle, so the point meets the body without
 *  a kink at any radius or distance. */
function dropPath(cx: number, cy: number, r: number, rotate = 0): string {
  const L = r * 2.4;                                    // tip distance from centre
  const phi = (Math.acos(Math.min(1, r / L)) * 180) / Math.PI; // half-angle to tangency
  const [tx, ty] = px(cx, cy, L, rotate);
  const [ax, ay] = px(cx, cy, r, rotate + phi);
  const [bx, by] = px(cx, cy, r, rotate - phi);
  // Tip → tangent A → major arc the long way round → tangent B → close.
  return `M${tx} ${ty} L${ax} ${ay} A${r2(r)} ${r2(r)} 0 1 1 ${bx} ${by} Z`;
}

/** A crescent moon — bounded by the major arc of an outer circle and the minor
 *  arc of an equal circle offset toward `rotate`° (the direction the horns point).
 *  `thickness` is the belly width. Built as ONE closed two-arc path so there's no
 *  stray second lune (an even-odd disc-cut leaves one). Flags fixed by rendering. */
function crescentPath(cx: number, cy: number, r: number, thickness: number, rotate: number): string {
  const d = Math.min(Math.max(thickness, 1), r * 1.9);
  const u = { x: Math.cos(rad(rotate)), y: Math.sin(rad(rotate)) };
  const p = { x: Math.cos(rad(rotate + 90)), y: Math.sin(rad(rotate + 90)) };
  const mx = cx + (d / 2) * u.x, my = cy + (d / 2) * u.y;      // midpoint of the two centres
  const h = Math.sqrt(Math.max(0, r * r - (d / 2) * (d / 2))); // half the chord between intersections
  const p1x = mx + h * p.x, p1y = my + h * p.y;
  const p2x = mx - h * p.x, p2y = my - h * p.y;
  return `M${r2(p2x)} ${r2(p2y)} A${r2(r)} ${r2(r)} 0 1 0 ${r2(p1x)} ${r2(p1y)} A${r2(r)} ${r2(r)} 0 0 1 ${r2(p2x)} ${r2(p2y)} Z`;
}

/** A filled wavy band — a sine ribbon `width` wide and `thickness` tall, with
 *  `cycles` humps. Sampled finely enough to read smooth at logo scale. */
function wavePath(cx: number, cy: number, width: number, amplitude: number, thickness: number, cycles: number): string {
  const N = Math.max(24, Math.round(cycles * 16));
  const x0 = cx - width / 2;
  const w = (2 * Math.PI * cycles) / width;
  const yTop = (x: number) => cy - thickness / 2 + amplitude * Math.sin((x - x0) * w);
  const yBot = (x: number) => cy + thickness / 2 + amplitude * Math.sin((x - x0) * w);
  const top: string[] = [];
  const bot: string[] = [];
  for (let i = 0; i <= N; i++) {
    const x = x0 + (width * i) / N;
    top.push(`${r2(x)} ${r2(yTop(x))}`);
    bot.unshift(`${r2(x)} ${r2(yBot(x))}`);
  }
  return `M${top[0]} ` + top.slice(1).map((p) => `L${p}`).join(' ') + ' ' + bot.map((p) => `L${p}`).join(' ') + ' Z';
}

// ─── the spec Ava writes ─────────────────────────────────────────────────────

/** One instrument. `cut` is the important one — it subtracts `hole` from `shape`
 *  via even-odd, which is how a mark gets negative space (the single thing that
 *  separated the strong mark from the forgettable ones in the gate). */
export type MarkElement =
  | { kind: 'disc'; r: number; x?: number; y?: number }
  | { kind: 'ring'; r: number; thickness: number; x?: number; y?: number }
  | { kind: 'polygon'; r: number; sides: number; rotate?: number; x?: number; y?: number }
  | { kind: 'star'; outer: number; inner: number; points: number; rotate?: number; curve?: number; x?: number; y?: number }
  | { kind: 'arc'; r: number; thickness: number; from: number; to: number; x?: number; y?: number }
  | { kind: 'leaf'; width: number; height: number; rotate?: number; x?: number; y?: number }
  | { kind: 'bar'; x: number; y: number; width: number; height: number; round?: number; rotate?: number }
  | { kind: 'chevron'; width: number; height: number; thickness: number; rotate?: number; x?: number; y?: number }
  | { kind: 'drop'; r: number; rotate?: number; x?: number; y?: number }
  | { kind: 'crescent'; r: number; thickness: number; rotate?: number; x?: number; y?: number }
  | { kind: 'wave'; width: number; amplitude: number; thickness: number; cycles: number; rotate?: number; x?: number; y?: number }
  /** Subtract `hole` from `shape` — negative space, one path, even-odd. */
  | { kind: 'cut'; shape: MarkElement; hole: MarkElement }
  /** Repeat `of` n times around the centre. Symmetry, guaranteed. */
  | { kind: 'radial'; of: MarkElement; count: number; rotate?: number }
  /** Reflect `of` across the centre axis — pairs, wings, hearts. */
  | { kind: 'mirror'; of: MarkElement; axis?: 'vertical' | 'horizontal' }
  /** Escape hatch — raw path data, when nothing above fits. Use sparingly. */
  | { kind: 'path'; d: string; fillable?: boolean };

/** What Ava returns for a mark: the concept in words, and how it's built. */
export interface MarkSpec {
  /** One line: what the mark means. Shown to the user as the rationale. */
  concept: string;
  elements: MarkElement[];
}

// ─── compile ─────────────────────────────────────────────────────────────────

/** Path data for any element that reduces to a single closed outline. Returns
 *  null for the composite kinds (`radial`), which expand to several elements. */
function toPath(el: MarkElement): string | null {
  const x = 'x' in el && typeof el.x === 'number' ? el.x : C;
  const y = 'y' in el && typeof el.y === 'number' ? el.y : C;
  switch (el.kind) {
    case 'disc': return discPath(x, y, el.r);
    case 'ring': return `${discPath(x, y, el.r)} ${discPath(x, y, Math.max(0.5, el.r - el.thickness))}`;
    case 'polygon': return polygonPath(x, y, el.r, el.sides, el.rotate ?? 0);
    case 'star': return starPath(x, y, el.outer, el.inner, el.points, el.rotate ?? 0, el.curve ?? 0);
    case 'arc': return arcBandPath(x, y, el.r, el.thickness, el.from, el.to);
    case 'leaf': return leafPath(x, y, el.width, el.height);
    case 'bar': return barPath(el.x, el.y, el.width, el.height, el.round ?? 0);
    case 'chevron': return chevronPath(x, y, el.width, el.height, el.thickness);
    case 'drop': return dropPath(x, y, el.r, el.rotate ?? 0);
    case 'crescent': return crescentPath(x, y, el.r, el.thickness, el.rotate ?? 0);
    case 'wave': return wavePath(x, y, el.width, el.amplitude, el.thickness, el.cycles);
    case 'cut': {
      const a = toPath(el.shape);
      const b = toPath(el.hole);
      return a && b ? `${a} ${b}` : a;
    }
    case 'path': return el.d;
    case 'radial': return null;
    case 'mirror': return null;
  }
}

/** True when the element's paint must use even-odd so its holes read as holes. */
function needsEvenOdd(el: MarkElement): boolean {
  return el.kind === 'cut' || el.kind === 'ring';
}

/** A rotation transform about the box centre — used by `radial` and by any
 *  element carrying its own `rotate` that the path maths doesn't already apply. */
const spin = (deg: number) => `rotate(${r2(deg)} ${C} ${C})`;

/** Prepend a transform to a compiled element (composing, not clobbering). */
const withTransform = (c: ShapeElement, t: string): ShapeElement =>
  ({ ...c, attrs: { ...c.attrs, transform: `${t}${c.attrs.transform ? ` ${c.attrs.transform}` : ''}` } });

/** Compile one element into renderable ShapeElements. */
function compileElement(el: MarkElement): ShapeElement[] {
  if (el.kind === 'radial') {
    const n = Math.max(1, Math.round(el.count));
    const base = el.rotate ?? 0;
    return Array.from({ length: n }, (_, i) =>
      compileElement(el.of).map((c) => withTransform(c, spin(base + (360 * i) / n))),
    ).flat();
  }
  if (el.kind === 'mirror') {
    const child = compileElement(el.of);
    const reflect = el.axis === 'horizontal' ? `translate(0 ${2 * C}) scale(1 -1)` : `translate(${2 * C} 0) scale(-1 1)`;
    return [...child, ...child.map((c) => withTransform(c, reflect))];
  }
  const d = toPath(el);
  if (!d) return [];
  const attrs: Record<string, string | number> = { d };
  if (needsEvenOdd(el)) attrs['fill-rule'] = 'evenodd';
  // star/polygon/arc/drop/crescent bake their rotation into the maths. The
  // upright forms spin about the box centre — their own centre when centred.
  const spins = el.kind === 'leaf' || el.kind === 'bar' || el.kind === 'chevron' || el.kind === 'wave';
  if (spins && el.rotate) attrs.transform = spin(el.rotate);
  return [{ tag: 'path', attrs, fillable: el.kind === 'path' ? el.fillable !== false : true }];
}

/** Ava's spec → the ShapeElement[] buildShapeSvg renders. */
export function compileMark(spec: MarkSpec): ShapeElement[] {
  return spec.elements.flatMap(compileElement);
}

/** The vector styles a mark can wear. All true SVG — a gradient logo never goes
 *  near an image model. */
export type MarkStyle = 'flat' | 'gradient' | 'line' | 'duotone';

/**
 * Render a mark to SVG.
 *
 * The filled styles render with NO stroke. buildShapeSvg's default paints a
 * round-joined outline on top of the fill, which for an icon reads as weight but
 * for a mark bloats the form, blunts every sharp tip, and — because the outline
 * follows a `cut`'s inner subpath too — paints straight into the negative space
 * and closes it up. Only the stroke-based styles get a weight.
 */
export function renderElements(elements: ShapeElement[], style: MarkStyle, colors: string[]): string {
  const weight = style === 'line' || style === 'duotone' ? 2 : 0;
  return buildShapeSvg(elements, style, colors, weight);
}

export function renderMark(spec: MarkSpec, style: MarkStyle, colors: string[]): string {
  return renderElements(compileMark(spec), style, colors);
}
