/**
 * Fonts on their computer. Ava can name any font, but GIMP can only use what is
 * installed, and she has no other way to tell: the Logo room loads its web fonts
 * itself, so a font can look present there and be missing here.
 *
 * design_fonts checks. design_install_font installs, for this user only and with
 * no admin rights, and always asks first: the registry prompts for it by name,
 * whatever their permission settings. Only Google Fonts: all free to use, but
 * NOT all one licence — about 1,900 families are OFL, 44 are Apache 2.0 and 5
 * are the Ubuntu Font Licence (google/fonts, 9 Nov 2026). That matters once a
 * font FILE ships in something sold: its licence text must go with it, and
 * Unity refuses Apache licences that require attribution. The making record
 * looks each font's licence up (making-record.ts, fontLicences).
 * GIMP sees a font in that folder on its next run, with no restart (tested on
 * GIMP 3.2.6 on Windows, 6 Nov 2026).
 */

import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, platform, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { AVA_HOME } from '../core/constants.js';
import type { FunctionSchema } from '../providers/types.js';
import type { Tool, ToolExecutionContext, ToolResult, ToolRiskLevel } from './types.js';
import { findGimp } from './gimp/find-gimp.js';

const GOOGLE_CSS = 'https://fonts.googleapis.com/css2';
const FONT_HOST = 'https://fonts.gstatic.com/';
const GOOGLE_METADATA = 'https://fonts.google.com/metadata/fonts';
const CATALOGUE_TIMEOUT_MS = 20_000;
const MAX_FONT_BYTES = 8 * 1024 * 1024;
const CHECK_TIMEOUT_MS = 60_000;

/** Their per-user font folder. No admin rights needed on any platform. */
export function userFontsFolder(): string {
  if (process.env.AVA_FONTS_DIR) return process.env.AVA_FONTS_DIR;
  const os = platform();
  if (os === 'win32') return join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Microsoft', 'Windows', 'Fonts');
  if (os === 'darwin') return join(homedir(), 'Library', 'Fonts');
  return join(homedir(), '.local', 'share', 'fonts');
}

/** Every font GIMP can use, or null when GIMP isn't here to ask. */
export async function installedFonts(): Promise<string[] | null> {
  const gimp = await findGimp();
  if (!gimp) return null;
  const dir = await mkdtemp(join(tmpdir(), 'ava-fonts-'));
  const script = join(dir, 'fonts.py');
  await writeFile(script, [
    'import gi, json',
    "gi.require_version('Gimp', '3.0')",
    'from gi.repository import Gimp',
    "print('AVA_FONTS' + json.dumps([f.get_name() for f in Gimp.fonts_get_list('')]), flush=True)",
  ].join('\n'), 'utf-8');
  try {
    return await new Promise<string[] | null>((resolve) => {
      const child = spawn(gimp.path, ['-n', '-i', '--batch-interpreter', 'python-fu-eval', '-b', `exec(open(${JSON.stringify(script)}).read())`, '--quit'], { windowsHide: true });
      let out = '';
      child.stdout.on('data', (d) => { out += d; });
      child.stderr.on('data', (d) => { out += d; });
      const timer = setTimeout(() => child.kill(), CHECK_TIMEOUT_MS);
      child.on('error', () => { clearTimeout(timer); resolve(null); });
      child.on('close', () => {
        clearTimeout(timer);
        const line = out.split(/\r?\n/).find((l) => l.startsWith('AVA_FONTS'));
        try { resolve(line ? JSON.parse(line.slice('AVA_FONTS'.length)) as string[] : null); } catch { resolve(null); }
      });
    });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** "Sora" is there if "Sora" or any "Sora Bold" is. */
export function fontIsIn(name: string, fonts: string[]): boolean {
  const wanted = name.trim().toLowerCase();
  return fonts.some((f) => { const have = f.toLowerCase(); return have === wanted || have.startsWith(`${wanted} `); });
}

/** Which of these aren't installed. Empty when GIMP can't be asked. */
export async function missingFonts(names: string[]): Promise<string[]> {
  const wanted = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (wanted.length === 0) return [];
  const fonts = await installedFonts();
  return fonts ? wanted.filter((n) => !fontIsIn(n, fonts)) : [];
}

/** The size-and-style sentence she adds to a proposal that names a missing font. */
export function missingFontsNote(missing: string[]): string {
  if (missing.length === 0) return '';
  return ` Not on their computer, so GIMP can't use ${missing.length === 1 ? 'it' : 'them'} yet: ${missing.join(', ')}. Tell them, and ask whether you may install ${missing.length === 1 ? 'it' : 'them'}; if they say no, choose an installed font.`;
}

// ── Installing ──────────────────────────────────────────────────────────────

function parseFontCss(css: string): Array<{ weight: number; url: string }> {
  const found: Array<{ weight: number; url: string }> = [];
  for (const block of css.split('@font-face').slice(1)) {
    if (/font-style:\s*italic/i.test(block)) continue;
    const weight = Number(/font-weight:\s*(\d+)/i.exec(block)?.[1] ?? 400);
    const url = /url\((https:[^)]+?\.ttf)\)/i.exec(block)?.[1];
    if (url?.startsWith(FONT_HOST)) found.push({ weight, url });
  }
  return found;
}

const isFontFile = (b: Buffer) => {
  if (b.length < 1024) return false;
  const tag = b.subarray(0, 4).toString('latin1');
  return tag === 'OTTO' || tag === 'true' || b.readUInt32BE(0) === 0x00010000;
};

/** Windows finds a user font through the registry; without this, other apps won't list it. */
function registerFont(family: string, weight: number, path: string): Promise<void> {
  if (process.env.AVA_FONTS_DIR) return Promise.resolve();
  const os = platform();
  if (os === 'win32') {
    return new Promise((resolve) => {
      execFile('reg', ['add', 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts', '/v', `${family} ${weight} (TrueType)`, '/t', 'REG_SZ', '/d', path, '/f'], { windowsHide: true }, () => resolve());
    });
  }
  if (os === 'darwin') return Promise.resolve();
  return new Promise((resolve) => { execFile('fc-cache', ['-f'], () => resolve()); });
}

/** Installs a Google Fonts family for this user. Asking first is the caller's job. */
async function installGoogleFont(family: string, wanted: number[], signal?: AbortSignal): Promise<{ ok: boolean; message: string; unseen?: boolean }> {
  if (!/^[A-Za-z0-9][A-Za-z0-9 ]{1,59}$/.test(family)) return { ok: false, message: 'Give a font family name, such as "Space Grotesk".' };
  const weights = [...new Set(wanted)].filter((w) => Number.isInteger(w) && w >= 100 && w <= 900 && w % 100 === 0).sort((a, b) => a - b);
  if (weights.length === 0) return { ok: false, message: 'Weights are hundreds from 100 to 900.' };

  const name = family.replace(/ /g, '+');
  let faces: Array<{ weight: number; url: string }> = [];
  try {
    // A family without one of these weights answers 400 to the whole request,
    // so fall back to what it has rather than call the font missing.
    for (const url of [`${GOOGLE_CSS}?family=${name}:wght@${weights.join(';')}`, `${GOOGLE_CSS}?family=${name}`]) {
      const res = await fetch(url, { headers: { 'User-Agent': 'Ava Supernova' }, signal });
      if (res.ok) { faces = parseFontCss(await res.text()); if (faces.length) break; }
    }
  } catch (err) {
    return { ok: false, message: `Couldn't reach Google Fonts: ${err instanceof Error ? err.message : String(err)}. Nothing was installed.` };
  }
  if (faces.length === 0) return { ok: false, message: `"${family}" isn't on Google Fonts, so I can't install it. Check the spelling, or choose another font. Nothing was installed.` };

  const folder = userFontsFolder();
  await mkdir(folder, { recursive: true });
  const stem = family.replace(/ /g, '');
  const added: number[] = [];
  const already: number[] = [];
  for (const face of faces) {
    const path = join(folder, `${stem}-${face.weight}.ttf`);
    if (existsSync(path)) { already.push(face.weight); continue; }
    let bytes: Buffer;
    try {
      const res = await fetch(face.url, { signal });
      if (!res.ok) throw new Error(`Google Fonts answered ${res.status}`);
      bytes = Buffer.from(await res.arrayBuffer());
    } catch (err) {
      return { ok: false, message: `Downloading ${family} failed: ${err instanceof Error ? err.message : String(err)}.${added.length ? ` Installed before that: ${added.join(', ')}.` : ' Nothing was installed.'}` };
    }
    if (bytes.length > MAX_FONT_BYTES || !isFontFile(bytes)) return { ok: false, message: `What came back for ${family} isn't a font file, so it wasn't installed.` };
    await writeFile(path, bytes);
    await registerFont(family, face.weight, path);
    added.push(face.weight);
  }

  const fonts = await installedFonts();
  const seen = fonts ? fontIsIn(family, fonts) : null;
  const done = added.length ? `Installed ${family}, weights ${added.join(', ')}.` : `${family} was already there.`;
  if (seen === false) return { ok: false, unseen: true, message: `${done} GIMP can't see it yet, so don't rely on it: tell them, and don't swap in another font without saying so.` };
  return { ok: true, message: `${done}${seen ? ' GIMP can see it.' : ' GIMP isn\'t here to confirm it.'}${already.length && added.length ? ` Already there: ${already.join(', ')}.` : ''}` };
}

// ── The list to choose from ─────────────────────────────────────────────────

const STYLE_WORD = /\s+(?:Regular|Normal|Roman|Bold|Italic|Oblique|Thin|Hairline|Light|Medium|Book|Black|Heavy|(?:Semi|Demi|Extra|Ultra)[- ]?(?:Bold|Light))$/i;
const GENERIC_FONTS = new Set(['monospace', 'sans-serif', 'serif', 'sans', 'system-ui']);

/** GIMP lists every style. A person chooses a family: "Arial Bold Italic" is Arial. */
export function fontFamilies(fonts: string[]): string[] {
  const families = new Set<string>();
  for (const font of fonts) {
    let name = font.trim();
    for (let next = name.replace(STYLE_WORD, ''); next !== name; next = name.replace(STYLE_WORD, '')) name = next;
    if (name && !GENERIC_FONTS.has(name.toLowerCase())) families.add(name);
  }
  return [...families].sort((a, b) => a.localeCompare(b));
}

interface GoogleFont { family: string; weights: number[] }
const CATALOGUE_DAYS = 30;
const catalogueFile = () => join(process.env.AVA_FONTS_DIR ?? AVA_HOME, 'google-fonts.json');

/** What Google Fonts has, most popular first. Kept for a month, and an old copy
 *  beats none: if Google's list can't be reached, the rest of the picker still works. */
async function googleCatalogue(): Promise<GoogleFont[]> {
  let kept: { fetchedAt: number; fonts: GoogleFont[] } | null = null;
  try { kept = JSON.parse(await readFile(catalogueFile(), 'utf-8')); } catch { /* none yet */ }
  if (kept?.fonts?.length && Date.now() - kept.fetchedAt < CATALOGUE_DAYS * 86_400_000) return kept.fonts;
  try {
    const res = await fetch(GOOGLE_METADATA, { headers: { 'User-Agent': 'Ava Supernova' }, signal: AbortSignal.timeout(CATALOGUE_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Google Fonts answered ${res.status}`);
    const list = (JSON.parse((await res.text()).replace(/^\)\]\}'\s*/, '')) as { familyMetadataList?: Array<{ family?: unknown; fonts?: unknown; popularity?: unknown }> }).familyMetadataList ?? [];
    const fonts = list
      .filter((f) => typeof f.family === 'string' && /^[A-Za-z0-9][A-Za-z0-9 ]{1,59}$/.test(f.family))
      .sort((a, b) => Number(a.popularity ?? 1e9) - Number(b.popularity ?? 1e9))
      .map((f) => ({
        family: f.family as string,
        weights: (Array.isArray(f.fonts) ? f.fonts : Object.keys((f.fonts ?? {}) as object)).map(String).filter((w) => /^[1-9]00$/.test(w)).map(Number),
      }));
    if (fonts.length) {
      await mkdir(dirname(catalogueFile()), { recursive: true });
      await writeFile(catalogueFile(), JSON.stringify({ fetchedAt: Date.now(), fonts }), 'utf-8');
      return fonts;
    }
  } catch { /* fall through to whatever is kept */ }
  return kept?.fonts ?? [];
}

/** For a font dropdown. `installed` is null when GIMP can't be asked. */
export async function fontChoices(): Promise<{ installed: string[] | null; google: string[] }> {
  const [fonts, google] = await Promise.all([installedFonts(), googleCatalogue()]);
  return { installed: fonts && fontFamilies(fonts), google: google.map((f) => f.family) };
}

/** They clicked Install, which is their yes. Every weight it has, so a thin or
 *  heavy design doesn't send them back here. */
export async function installFontTheyChose(family: string): Promise<{ ok: boolean; message: string }> {
  const name = family.trim();
  const weights = (await googleCatalogue()).find((f) => f.family === name)?.weights;
  const { ok, message, unseen } = await installGoogleFont(name, weights?.length ? weights : [400, 700]);
  if (unseen) return { ok: false, message: `${name} was downloaded, but GIMP can't see it yet, so it isn't ready to use.` };
  return { ok, message };
}

export class DesignFontsTool implements Tool {
  readonly name = 'design_fonts';
  readonly description = 'Check which fonts are really installed on their computer.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;
  readonly schema: FunctionSchema = {
    name: 'design_fonts',
    description:
      'Check which fonts are really on their computer, before you name one in a kit or a brief. ' +
      'Pass the names you want in `names`, or `match` to see what is installed containing a word. ' +
      'The Logo room loads web fonts itself, so a font that worked there may not be installed.',
    parameters: {
      type: 'object',
      properties: {
        names: { type: 'array', items: { type: 'string' }, description: 'Fonts to check, e.g. ["Sora", "Inter"].' },
        match: { type: 'string', description: 'List installed fonts containing this word.' },
      },
    },
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const fonts = await installedFonts();
    if (!fonts) return { success: false, output: 'Can\'t check: GIMP isn\'t installed here, or it didn\'t answer.' };
    const names = Array.isArray(args.names) ? args.names.map(String) : [];
    const match = typeof args.match === 'string' ? args.match.trim().toLowerCase() : '';
    const lines = [`${fonts.length} fonts are installed.`];
    if (names.length) {
      const have = names.filter((n) => fontIsIn(n, fonts));
      const missing = names.filter((n) => !fontIsIn(n, fonts));
      lines.push(`Installed: ${have.join(', ') || 'none of these'}.`, `Not installed: ${missing.join(', ') || 'none'}.`);
      if (missing.length) lines.push('Ask them before installing anything. design_install_font does it once they say yes.');
    }
    if (match) lines.push(`Matching "${match}": ${fonts.filter((f) => f.toLowerCase().includes(match)).slice(0, 40).join(', ') || 'none'}.`);
    return { success: true, output: lines.join('\n') };
  }
}

export class DesignInstallFontTool implements Tool {
  readonly name = 'design_install_font';
  readonly description = 'Install an openly licensed font from Google Fonts, for this user, after they approve it.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = true;
  readonly schema: FunctionSchema = {
    name: 'design_install_font',
    description:
      'Install a Google Fonts family for this user: no admin rights, and it works in their other apps too. ' +
      'Ask them in your reply first and call this once they say yes; they also approve the install itself. ' +
      'Only for fonts a kit or brief really needs.',
    parameters: {
      type: 'object',
      properties: {
        family: { type: 'string', description: 'The family name as on Google Fonts, e.g. "Space Grotesk".' },
        weights: { type: 'array', items: { type: 'number' }, description: 'Weights to install. Default 400 and 700.' },
      },
      required: ['family'],
    },
  };

  async execute(args: Record<string, unknown>, context?: ToolExecutionContext): Promise<ToolResult> {
    const family = typeof args.family === 'string' ? args.family.trim() : '';
    const weights = Array.isArray(args.weights) ? args.weights.map(Number) : [400, 700];
    const { ok, message } = await installGoogleFont(family, weights, context?.signal);
    return { success: ok, output: message };
  }
}
