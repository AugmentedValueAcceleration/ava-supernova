/**
 * Ava's sources of truth: the installed program, and the official docs only.
 * The lookups run where Blender and GIMP are installed; they change nothing.
 */

import { describe, it, expect } from 'vitest';
import { DesignApiLookupTool, DesignReadDocsTool, isOfficialDocsUrl, docsHtmlToText } from '../src/tools/design-docs.js';
import { findBlender } from '../src/tools/blender/find-blender.js';
import { findGimp } from '../src/tools/gimp/find-gimp.js';

const lookup = new DesignApiLookupTool();
const ask = (tool: string, query: string) => lookup.execute({ tool, query }, { cwd: '.' });

describe('official docs only', () => {
  it.each([
    ['https://docs.blender.org/api/current/', true],
    ['https://docs.gimp.org/3.2/en/', true],
    ['https://developer.gimp.org/resource/', true],
    ['https://gegl.org/operations/', true],
    ['http://docs.blender.org/api/current/', false],
    ['https://docs.blender.org.evil.example/', false],
    ['https://evil.example/docs.blender.org', false],
    ['https://example.com/', false],
    ['not a url', false],
  ])('%s → %s', (url, ok) => {
    expect(isOfficialDocsUrl(url)).toBe(ok);
  });

  it('refuses anything else without fetching', async () => {
    const res = await new DesignReadDocsTool().execute({ url: 'https://example.com/' }, { cwd: '.' });
    expect(res.success).toBe(false);
    expect(res.output).toContain('official docs');
  });

  it('reads the article, not the site menu around it', () => {
    const text = docsHtmlToText('<div>site menu</div><article><h1>Bake</h1><aside>toc</aside><p>The real text</p></article><div>footer</div>');
    expect(text).toContain('The real text');
    expect(text).not.toContain('site menu');
    expect(text).not.toContain('toc');
  });

  it('turns a page into readable text', () => {
    const text = docsHtmlToText('<nav>menu</nav><script>x()</script><h1>Title</h1><p>One &amp; two</p><p><a href="/a">link</a></p>');
    expect(text).toContain('Title');
    expect(text).toContain('One & two');
    expect(text).toContain('link');
    expect(text).not.toContain('menu');
    expect(text).not.toContain('x()');
  });
});

describe('the lookup query is data, never code', () => {
  it.each(['import os', 'a; b', 'open("x")', '__import__("os")', ''])('refuses %s', async (q) => {
    expect((await ask('gimp', q)).output).toContain('Give one name or word');
  });
});

const blender = await findBlender();
describe.skipIf(!blender)('asking the installed Blender', () => {
  it('an operator and its options', async () => {
    const res = await ask('blender', 'bpy.ops.object.bake');
    expect(res.success, res.output).toBe(true);
    expect(res.output).toContain('From the installed Blender');
    expect(res.output).toContain('normal_space');
  }, 60_000);
  it('a node\'s exact inputs and outputs', async () => {
    const res = await ask('blender', 'ShaderNodeBsdfPrincipled');
    expect(res.output).toContain('Base Color');
    expect(res.output).toContain('Outputs:');
  }, 60_000);
  it('a plain word searches the names', async () => {
    expect((await ask('blender', 'smart_project')).output).toContain('bpy.ops.uv.smart_project');
  }, 60_000);
});

const gimp = await findGimp();
describe.skipIf(!gimp)('asking the installed GIMP', () => {
  it('an exact signature', async () => {
    const res = await ask('gimp', 'Gimp.Image.select_ellipse');
    expect(res.success, res.output).toBe(true);
    expect(res.output).toContain('x:float');
  }, 60_000);
  it('the values of an enum', async () => {
    const res = await ask('gimp', 'Gimp.ChannelOps');
    expect(res.output).toContain('SUBTRACT');
    expect(res.output).not.toContain('ADD_EXCLUDE');
  }, 60_000);
  it('a filter\'s settings', async () => {
    const res = await ask('gimp', 'gegl:dropshadow');
    expect(res.output).toContain('radius');
  }, 60_000);
  it('a plain word searches the names', async () => {
    expect((await ask('gimp', 'select_round')).output).toContain('select_round_rectangle');
  }, 60_000);
});
