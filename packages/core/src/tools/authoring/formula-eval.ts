/**
 * A small spreadsheet calculator (Documents 1.0 Part 3, 15 Nov 2026).
 *
 * exceljs writes a formula but never calculates it. Excel and LibreOffice do
 * that on opening, but Ava reading the file back, and the document viewer,
 * would see a blank where "=SUM(B2:B6)" should say 1,640. So the formulas
 * people actually use in a budget or a tracker are worked out here and saved
 * as the cell's result:
 *
 *   SUM AVERAGE MIN MAX COUNT ROUND ABS, + - * / ^, brackets, cell
 *   references (A1, $B$2) and ranges (A1:C9) on the same sheet.
 *
 * Anything else (another sheet, VLOOKUP, IF, text functions) returns
 * undefined: the result is left for the person's own app to calculate, and
 * the file is still correct — never a guessed number.
 */

export type CellGetter = (col: number, row: number) => { value?: number | string | null; formula?: string } | undefined;

type Token =
  | { t: 'num'; v: number }
  | { t: 'ref'; c: number; r: number }
  | { t: 'range'; c1: number; r1: number; c2: number; r2: number }
  | { t: 'fn'; name: string }
  | { t: 'op'; v: string }
  | { t: '(' } | { t: ')' } | { t: ',' };

class Unsupported extends Error {}

/** "B" → 2, "AA" → 27. */
export function colNumber(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/** "B7" → { c: 2, r: 7 }. */
export function parseRef(ref: string): { c: number; r: number } | null {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(ref.trim());
  return m ? { c: colNumber(m[1]), r: Number(m[2]) } : null;
}

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const s = src.trim().replace(/^=/, '');
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '(') { out.push({ t: '(' }); i++; continue; }
    if (ch === ')') { out.push({ t: ')' }); i++; continue; }
    if (ch === ',' || ch === ';') { out.push({ t: ',' }); i++; continue; }
    if ('+-*/^'.includes(ch)) { out.push({ t: 'op', v: ch }); i++; continue; }
    const num = /^\d+(\.\d+)?(e[+-]?\d+)?%?/i.exec(s.slice(i));
    if (num && !/^[A-Za-z]/.test(ch)) {
      const raw = num[0];
      out.push({ t: 'num', v: raw.endsWith('%') ? Number(raw.slice(0, -1)) / 100 : Number(raw) });
      i += raw.length;
      continue;
    }
    const range = /^\$?([A-Za-z]{1,3})\$?(\d+):\$?([A-Za-z]{1,3})\$?(\d+)/.exec(s.slice(i));
    if (range) {
      const c1 = colNumber(range[1]), r1 = Number(range[2]), c2 = colNumber(range[3]), r2 = Number(range[4]);
      out.push({ t: 'range', c1: Math.min(c1, c2), r1: Math.min(r1, r2), c2: Math.max(c1, c2), r2: Math.max(r1, r2) });
      i += range[0].length;
      continue;
    }
    const word = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(s.slice(i));
    if (word) {
      const w = word[0];
      const after = s.slice(i + w.length).trimStart();
      if (after.startsWith('(')) { out.push({ t: 'fn', name: w.toUpperCase() }); i += w.length; continue; }
      const ref = /^\$?([A-Za-z]{1,3})\$?(\d+)/.exec(s.slice(i));
      if (ref) { out.push({ t: 'ref', c: colNumber(ref[1]), r: Number(ref[2]) }); i += ref[0].length; continue; }
      throw new Unsupported(w); // a name, another sheet, a constant like TRUE
    }
    if (ch === '$') {
      const ref = /^\$?([A-Za-z]{1,3})\$?(\d+)/.exec(s.slice(i));
      if (ref) { out.push({ t: 'ref', c: colNumber(ref[1]), r: Number(ref[2]) }); i += ref[0].length; continue; }
    }
    throw new Unsupported(ch); // '!' (another sheet), '&', '<', quotes …
  }
  return out;
}

type Val = number | number[];

const FUNCS: Record<string, (args: Val[]) => number> = {
  SUM: (a) => flat(a).reduce((x, y) => x + y, 0),
  AVERAGE: (a) => { const f = flat(a); if (!f.length) throw new Unsupported('AVERAGE of nothing'); return f.reduce((x, y) => x + y, 0) / f.length; },
  MIN: (a) => { const f = flat(a); return f.length ? Math.min(...f) : 0; },
  MAX: (a) => { const f = flat(a); return f.length ? Math.max(...f) : 0; },
  COUNT: (a) => flat(a).length,
  ROUND: (a) => { const [x, d = 0] = a.map(scalar); const p = 10 ** d; return Math.round(x * p) / p; },
  ABS: (a) => Math.abs(scalar(a[0])),
};

function flat(a: Val[]): number[] { return a.flatMap((v) => (Array.isArray(v) ? v : [v])); }
function scalar(v: Val | undefined): number {
  if (v === undefined) throw new Unsupported('missing argument');
  if (Array.isArray(v)) throw new Unsupported('range used as a number');
  return v;
}

/**
 * The value of a formula, or undefined when it is outside what this
 * calculator does. `get` reads other cells; a cell that is itself a formula is
 * worked out on the way (`seen` stops a loop).
 */
export function evaluateFormula(formula: string, get: CellGetter, seen: Set<string> = new Set()): number | undefined {
  let tokens: Token[];
  try { tokens = tokenize(formula); } catch { return undefined; }
  let pos = 0;

  const cellNumber = (c: number, r: number, inRange: boolean): number | null => {
    const key = `${c}:${r}`;
    const cell = get(c, r);
    if (!cell) return inRange ? null : 0;
    if (cell.formula) {
      if (seen.has(key)) throw new Unsupported('loop');
      const next = new Set(seen); next.add(key);
      const v = evaluateFormula(cell.formula, get, next);
      if (v === undefined) throw new Unsupported('depends on an uncalculated cell');
      return v;
    }
    const v = cell.value;
    if (typeof v === 'number') return v;
    if (v == null || v === '') return inRange ? null : 0;
    if (inRange) return null; // text in a range is skipped, as in Excel
    throw new Unsupported('text used as a number');
  };

  const primary = (): Val => {
    const tk = tokens[pos++];
    if (!tk) throw new Unsupported('end');
    if (tk.t === 'num') return tk.v;
    if (tk.t === 'ref') return cellNumber(tk.c, tk.r, false) ?? 0;
    if (tk.t === 'range') {
      const out: number[] = [];
      for (let r = tk.r1; r <= tk.r2; r++) for (let c = tk.c1; c <= tk.c2; c++) {
        const v = cellNumber(c, r, true);
        if (v != null) out.push(v);
      }
      return out;
    }
    if (tk.t === 'op' && tk.v === '-') return -scalar(power());
    if (tk.t === 'op' && tk.v === '+') return scalar(power());
    if (tk.t === '(') { const v = expr(); if (tokens[pos++]?.t !== ')') throw new Unsupported(')'); return v; }
    if (tk.t === 'fn') {
      const fn = FUNCS[tk.name];
      if (!fn) throw new Unsupported(tk.name);
      if (tokens[pos++]?.t !== '(') throw new Unsupported('(');
      const args: Val[] = [];
      if (tokens[pos]?.t !== ')') {
        for (;;) {
          args.push(expr());
          if (tokens[pos]?.t === ',') { pos++; continue; }
          break;
        }
      }
      if (tokens[pos++]?.t !== ')') throw new Unsupported(')');
      return fn(args);
    }
    throw new Unsupported('token');
  };
  const power = (): Val => {
    let left = primary();
    while (tokens[pos]?.t === 'op' && (tokens[pos] as { v: string }).v === '^') { pos++; left = scalar(left) ** scalar(primary()); }
    return left;
  };
  const term = (): Val => {
    let left = power();
    while (tokens[pos]?.t === 'op' && '*/'.includes((tokens[pos] as { v: string }).v)) {
      const op = (tokens[pos++] as { v: string }).v;
      const right = scalar(power());
      if (op === '/' && right === 0) throw new Unsupported('divide by zero');
      left = op === '*' ? scalar(left) * right : scalar(left) / right;
    }
    return left;
  };
  const expr = (): Val => {
    let left = term();
    while (tokens[pos]?.t === 'op' && '+-'.includes((tokens[pos] as { v: string }).v)) {
      const op = (tokens[pos++] as { v: string }).v;
      const right = scalar(term());
      left = op === '+' ? scalar(left) + right : scalar(left) - right;
    }
    return left;
  };

  try {
    const v = expr();
    if (pos !== tokens.length) return undefined;
    const n = scalar(v);
    return Number.isFinite(n) ? Math.round(n * 1e10) / 1e10 : undefined;
  } catch {
    return undefined;
  }
}
