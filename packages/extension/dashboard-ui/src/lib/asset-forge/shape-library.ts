/**
 * Shape library — the professional icon shapes behind the Forge's search box.
 *
 * Source: Lucide (ISC licence — verified 2026-07-05; 1,990 icons), the
 * industry-standard stroke-based 24×24 set. Their node format ([tag, attrs][])
 * converts 1:1 into the SVG engine's element model, so every Lucide shape gets
 * all our styles (line/flat/gradient/duotone/neon) and exact colours for free.
 */
import { icons } from 'lucide';
import type { ShapeElement } from './icon-svg';

export interface ShapeHit {
  /** Lucide export name, e.g. "BellRing" — stable id. */
  id: string;
  /** Human label, e.g. "Bell Ring". */
  label: string;
  elements: ShapeElement[];
}

type LucideNode = [string, Record<string, string | number>];

/** Tags that read as closed shapes → participate in fill for filled styles.
 *  Open strokes (a check mark, an unclosed path) just stroke bolder — same
 *  behaviour as the hand-built set. */
function isFillable(tag: string, attrs: Record<string, string | number>): boolean {
  if (tag === 'circle' || tag === 'ellipse' || tag === 'rect' || tag === 'polygon') return true;
  if (tag === 'path' && typeof attrs.d === 'string' && /z\s*$/i.test(attrs.d)) return true;
  return false;
}

function toElements(nodes: LucideNode[]): ShapeElement[] {
  return nodes.map(([tag, attrs]) => ({ tag, attrs, fillable: isFillable(tag, attrs) }));
}

const humanize = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1 $2');

const ALL: { id: string; label: string; lower: string; nodes: LucideNode[] }[] =
  Object.entries(icons as Record<string, LucideNode[]>).map(([id, nodes]) => ({
    id, label: humanize(id), lower: humanize(id).toLowerCase(), nodes,
  }));

/** Search shapes by name. Prefix matches rank above substring matches. */
export function searchShapes(query: string, limit = 24): ShapeHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return DEFAULT_SHAPES.map(get).filter((s): s is ShapeHit => s !== null);
  const starts: ShapeHit[] = [];
  const contains: ShapeHit[] = [];
  for (const s of ALL) {
    if (s.lower.startsWith(q)) starts.push({ id: s.id, label: s.label, elements: toElements(s.nodes) });
    else if (s.lower.includes(q)) contains.push({ id: s.id, label: s.label, elements: toElements(s.nodes) });
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

/** Resolve one shape by its Lucide id. */
export function getShape(id: string): ShapeHit | null {
  return get(id);
}

function get(id: string): ShapeHit | null {
  const nodes = (icons as Record<string, LucideNode[]>)[id];
  return nodes ? { id, label: humanize(id), elements: toElements(nodes) } : null;
}

/** The starter grid shown before any search — the shapes every app reaches for. */
export const DEFAULT_SHAPES = [
  'Star', 'Heart', 'House', 'User', 'Bell', 'Settings', 'Search', 'ShoppingCart',
  'Mail', 'MessageCircle', 'Camera', 'Calendar', 'Lock', 'Play', 'Cloud', 'Check',
];
