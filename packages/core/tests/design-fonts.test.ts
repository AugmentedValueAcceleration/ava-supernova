/**
 * Installing fonts. Always a scratch folder (AVA_FONTS_DIR) and a fake network,
 * so a test never touches their real fonts or Google.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DesignInstallFontTool, fontIsIn, missingFontsNote } from '../src/tools/design-fonts.js';
import { ToolRegistry } from '../src/tools/tool-registry.js';

vi.mock('../src/tools/gimp/find-gimp.js', () => ({ findGimp: async () => null }));

const TTF = Buffer.concat([Buffer.from([0, 1, 0, 0]), Buffer.alloc(4096)]);
const css = (...weights: number[]) => weights.map((w) =>
  `@font-face {\n  font-family: 'Sora';\n  font-style: normal;\n  font-weight: ${w};\n  src: url(https://fonts.gstatic.com/s/sora/v17/w${w}.ttf) format('truetype');\n}`).join('\n');
const answer = (body: string | Buffer, status = 200) => new Response(body, { status });

let dir: string;
const tool = new DesignInstallFontTool();
const install = (args: Record<string, unknown>) => tool.execute(args);
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ava-fonts-test-'));
  process.env.AVA_FONTS_DIR = dir;
});
afterEach(async () => {
  vi.unstubAllGlobals();
  delete process.env.AVA_FONTS_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe('design_install_font', () => {
  it('always asks, even with design tools set to run on their own', () => {
    const registry = new ToolRegistry();
    registry.setCategoryPermission('media', 'auto');
    expect(registry.needsConfirmation(tool, { family: 'Sora' })).toBe(true);
    expect(registry.needsConfirmation({ ...tool, name: 'design_save_to_kit', riskLevel: 'write' } as never)).toBe(false);
  });

  it('installs the weights asked for into their own folder', async () => {
    const seen: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      seen.push(url);
      return url.includes('googleapis') ? answer(css(400, 700)) : answer(TTF);
    }));
    const done = await install({ family: 'Sora' });
    expect(done.output).toContain('Installed Sora, weights 400, 700.');
    expect(readdirSync(dir).sort()).toEqual(['Sora-400.ttf', 'Sora-700.ttf']);
    expect(seen[0]).toContain('family=Sora:wght@400;700');
  });

  it('falls back when a family lacks one of the weights', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('wght@')) return answer('nope', 400);
      return url.includes('googleapis') ? answer(css(400)) : answer(TTF);
    }));
    expect((await install({ family: 'Sora', weights: [900] })).success).toBe(true);
    expect(readdirSync(dir)).toEqual(['Sora-400.ttf']);
  });

  it('says so when the font isn\'t on Google Fonts, and installs nothing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => answer('nope', 400)));
    const done = await install({ family: 'Not A Font' });
    expect(done.success).toBe(false);
    expect(done.output).toContain("isn't on Google Fonts");
    expect(readdirSync(dir)).toEqual([]);
  });

  it('only downloads from Google\'s font host', async () => {
    const other = css(400).replace('https://fonts.gstatic.com/', 'https://example.com/');
    const fetchMock = vi.fn(async () => answer(other));
    vi.stubGlobal('fetch', fetchMock);
    expect((await install({ family: 'Sora', weights: [400] })).success).toBe(false);
    expect(fetchMock.mock.calls.flat().join()).not.toContain('example.com/s/');
    expect(readdirSync(dir)).toEqual([]);
  });

  it('refuses anything that isn\'t a font file', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.includes('googleapis') ? answer(css(400)) : answer('<html>not a font</html>'.repeat(100)))));
    const done = await install({ family: 'Sora', weights: [400] });
    expect(done.output).toContain("isn't a font file");
    expect(readdirSync(dir)).toEqual([]);
  });

  it('never overwrites a font already there', async () => {
    writeFileSync(join(dir, 'Sora-400.ttf'), 'theirs');
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.includes('googleapis') ? answer(css(400)) : answer(TTF))));
    const done = await install({ family: 'Sora', weights: [400] });
    expect(done.output).toContain('already there');
    expect(existsSync(join(dir, 'Sora-400.ttf'))).toBe(true);
    expect((await import('node:fs')).readFileSync(join(dir, 'Sora-400.ttf'), 'utf-8')).toBe('theirs');
  });

  it('refuses a family name that could reach outside the request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    for (const family of ['../../evil', 'Sora&display=swap', '']) expect((await install({ family })).success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('checking a font', () => {
  it('counts a family as there when any of its styles is', () => {
    const fonts = ['Sora Bold', 'Inter', 'Space Mono Regular'];
    expect(fontIsIn('Sora', fonts)).toBe(true);
    expect(fontIsIn('inter', fonts)).toBe(true);
    expect(fontIsIn('Sora Light', fonts)).toBe(false);
    expect(fontIsIn('Space', ['Spacegrotesk'])).toBe(false);
  });

  it('a proposal naming a missing font says to ask them', () => {
    expect(missingFontsNote([])).toBe('');
    expect(missingFontsNote(['Sora'])).toContain('ask whether you may install it');
  });
});
