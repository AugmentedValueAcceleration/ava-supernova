/**
 * The font dropdown. Always a scratch folder (AVA_FONTS_DIR) and a fake network,
 * so a test never touches their real fonts or Google.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DesignInstallFontTool, fontChoices, fontFamilies, installFontTheyChose } from '../src/tools/design-fonts.js';

vi.mock('../src/tools/gimp/find-gimp.js', () => ({ findGimp: async () => null }));

const META = {
  familyMetadataList: [
    { family: 'Rare Font', popularity: 900, fonts: ['400'] },
    { family: 'Sora', popularity: 88, fonts: ['100', '300', '400', '700', '700i'] },
    { family: '../bad', popularity: 1, fonts: ['400'] },
  ],
};
const TTF = Buffer.concat([Buffer.from([0, 1, 0, 0]), Buffer.alloc(4096)]);
const css = (...w: number[]) => w.map((n) => `@font-face {\n font-style: normal;\n font-weight: ${n};\n src: url(https://fonts.gstatic.com/s/sora/${n}.ttf) format('truetype');\n}`).join('\n');
let dir: string;
let calls: string[];
let fail = false;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ava-font-choices-'));
  process.env.AVA_FONTS_DIR = dir;
  calls = [];
  fail = false;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    calls.push(String(url));
    if (fail) throw new Error('offline');
    if (String(url).includes('/metadata/fonts')) return new Response(`)]}'\n${JSON.stringify(META)}`);
    if (String(url).includes('/css2')) return new Response(css(...(/wght@([\d;]+)/.exec(String(url))?.[1].split(';').map(Number) ?? [400])));
    return new Response(TTF);
  }));
});
afterEach(async () => {
  vi.unstubAllGlobals();
  delete process.env.AVA_FONTS_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe('the list', () => {
  it('turns GIMP\'s styles into families a person would choose', () => {
    expect(fontFamilies(['Arial Regular', 'Arial Bold', 'Arial Bold Italic', 'Sora Semi-Bold', 'Sora ExtraLight', 'Monospace Bold', 'Bahnschrift Condensed', 'Serif']))
      .toEqual(['Arial', 'Bahnschrift Condensed', 'Sora']);
  });

  it('has Google\'s fonts, most popular first, and only safe names', async () => {
    expect((await fontChoices()).google).toEqual(['Sora', 'Rare Font']);
  });

  it('says it can\'t tell what\'s installed when GIMP isn\'t here', async () => {
    expect((await fontChoices()).installed).toBeNull();
  });

  it('asks Google once a month, not every time', async () => {
    await fontChoices();
    await fontChoices();
    expect(calls.filter((u) => u.includes('/metadata/fonts'))).toHaveLength(1);
  });

  it('an old list beats none when Google can\'t be reached', async () => {
    writeFileSync(join(dir, 'google-fonts.json'), JSON.stringify({ fetchedAt: 1, fonts: [{ family: 'Kept', weights: [400] }] }));
    fail = true;
    expect((await fontChoices()).google).toEqual(['Kept']);
  });

  it('offline with no list still gives an empty one, not an error', async () => {
    fail = true;
    expect((await fontChoices()).google).toEqual([]);
  });
});

describe('Install', () => {
  it('fetches every upright weight the family has', async () => {
    const { ok } = await installFontTheyChose('Sora');
    expect(ok).toBe(true);
    expect(readdirSync(dir).filter((f) => f.endsWith('.ttf')).sort()).toEqual(['Sora-100.ttf', 'Sora-300.ttf', 'Sora-400.ttf', 'Sora-700.ttf']);
  });

  it('refuses a name that could reach outside the request', async () => {
    const { ok } = await installFontTheyChose('Sora&evil=1');
    expect(ok).toBe(false);
    expect(calls.filter((u) => u.includes('/css2'))).toHaveLength(0);
  });

  it('says so when Google can\'t be reached, and installs nothing', async () => {
    await fontChoices();
    fail = true;
    const { ok, message } = await installFontTheyChose('Sora');
    expect(ok).toBe(false);
    expect(message).toContain('Nothing was installed');
    expect(existsSync(join(dir, 'Sora-400.ttf'))).toBe(false);
  });

  it('Ava\'s tool still installs what she asks for', async () => {
    const result = await new DesignInstallFontTool().execute({ family: 'Sora', weights: [300] });
    expect(result.success).toBe(true);
    expect(readdirSync(dir).filter((f) => f.endsWith('.ttf'))).toEqual(['Sora-300.ttf']);
  });
});
