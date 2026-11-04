/**
 * Ava's sources of truth for Blender and GIMP (his ask, 4 Nov 2026).
 *
 * She had web search snippets and her memory, which is how a whole logo run
 * went to GIMP 2 calls. Two tools, because they answer different questions:
 *
 *  - design_api_lookup asks the INSTALLED program. It cannot be out of date: it
 *    is the exact version on this machine. Free, offline, needs no brief and
 *    touches no work. For exact calls, arguments and settings.
 *  - design_read_docs opens the OFFICIAL docs, and only those. For how a
 *    feature is meant to be used: techniques and concepts.
 *
 * The query is DATA here, never code. It is handed to a fixed script that only
 * walks names with getattr, so this is not a way to run anything.
 */

import { spawn } from 'node:child_process';
import { writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel, ToolOutputTrust } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { findBlender, BLENDER_DOWNLOAD_URL } from './blender/find-blender.js';
import { findGimp, GIMP_DOWNLOAD_URL } from './gimp/find-gimp.js';

const MAX_LOOKUP = 8_000;
const MAX_PAGE = 14_000;
const START = '@@AVA_LOOKUP_START@@';
const END = '@@AVA_LOOKUP_END@@';

// prettier-ignore
const BLENDER_LOOKUP_PY = String.raw`
import sys, json
import bpy
q = json.loads(sys.argv[sys.argv.index('--') + 1])
out = []
def props(rna, limit=70):
    n = 0
    for p in rna.properties:
        if p.identifier in ('rna_type',) or n >= limit:
            continue
        n += 1
        line = f'  {p.identifier} ({p.type.lower()})'
        if p.type == 'ENUM':
            line += ' one of ' + ', '.join(i.identifier for i in p.enum_items)[:240]
        elif getattr(p, 'default', None) not in (None, ''):
            line += f' default {p.default}'
        if p.description:
            line += ' — ' + p.description[:90]
        out.append(line)
def node(name):
    m = bpy.data.materials.new('AvaLookup'); m.use_nodes = True
    n = m.node_tree.nodes.new(name)
    out.append(f'{name}: {n.bl_label}')
    out.append('Inputs: ' + ', '.join(f'[{i}] {s.name} ({s.type.lower()})' for i, s in enumerate(n.inputs)))
    out.append('Outputs: ' + ', '.join(f'[{i}] {s.name} ({s.type.lower()})' for i, s in enumerate(n.outputs)))
    out.append('Settings:'); props(n.bl_rna, 30)
def run():
    if q.startswith('bpy.ops.'):
        parts = q.split('.')
        mod = getattr(bpy.ops, parts[2], None)
        if mod is None:
            return False
        if len(parts) == 3:
            out.append(f'{q}: ' + ', '.join(n for n in dir(mod) if not n.startswith('_')))
            return True
        op = getattr(mod, parts[3], None)
        if op is None:
            return False
        rna = op.get_rna_type()
        out.append(f'{q}: {rna.description}')
        props(rna)
        return True
    bare = q.split('.')[-1]
    if bare.startswith(('ShaderNode', 'GeometryNode')) or (bare.endswith('Node') and hasattr(bpy.types, bare)):
        if hasattr(bpy.types, bare):
            try:
                node(bare)
                return True
            except Exception:
                pass
    if hasattr(bpy.types, bare):
        c = getattr(bpy.types, bare)
        out.append(f'bpy.types.{bare}: {(c.__doc__ or "").strip()[:200]}')
        if hasattr(c, 'bl_rna'):
            props(c.bl_rna)
        return True
    o = bpy
    parts = q.split('.')
    if parts[0] != 'bpy':
        return False
    for p in parts[1:]:
        if not hasattr(o, p):
            return False
        o = getattr(o, p)
    out.append(f'{q}: {(getattr(o, "__doc__", "") or "").strip()[:400]}')
    out.append(', '.join(n for n in dir(o) if not n.startswith('_'))[:1500])
    return True
found = False
try:
    found = run()
except Exception as e:
    out.append(f'Lookup failed: {e}')
    found = True
if not found:
    low = q.lower()
    hits = [f'bpy.types.{n}' for n in dir(bpy.types) if low in n.lower()][:30]
    for m in dir(bpy.ops):
        if m.startswith('_'):
            continue
        try:
            hits += [f'bpy.ops.{m}.{n}' for n in dir(getattr(bpy.ops, m)) if low in n.lower()]
        except Exception:
            pass
    out.append(f'Nothing exact for "{q}". Names containing it: ' + (', '.join(hits[:60]) or 'none'))
print('@@AVA_LOOKUP_START@@\n' + '\n'.join(out) + '\n@@AVA_LOOKUP_END@@')
`;

// prettier-ignore
const GIMP_LOOKUP_PY = String.raw`
import os, json
import gi
gi.require_version('Gimp', '3.0'); gi.require_version('Gegl', '0.4')
from gi.repository import Gimp, Gegl, Gio
q = json.loads(os.environ['AVA_GIMP_QUERY'])
out = []
def doc(f):
    d = getattr(f, '__doc__', '') or ''
    return d.strip().splitlines()[0][:170] if d.strip() else ''
CLASSES = [('Gimp.Image', Gimp.Image), ('Gimp.Layer', Gimp.Layer), ('Gimp.Drawable', Gimp.Drawable), ('Gimp.Item', Gimp.Item),
           ('Gimp.TextLayer', Gimp.TextLayer), ('Gimp.Selection', Gimp.Selection), ('Gimp.Path', Gimp.Path), ('Gimp', Gimp)]
# GObject signatures give types only: set_opacity(opacity:float) cannot tell you
# the scale is 0-100, and that one fact cost her 15 runs. GIMP's procedure
# database has the description and the real range of every argument.
def pdb_info(query):
    parts = query.split('.')
    name = parts[-1].replace('_', '-')
    owner = parts[-2].lower().replace('textlayer', 'text-layer') if len(parts) > 2 else ''
    tries = [f'gimp-{owner}-{name}'] if owner else []
    tries += [f'gimp-{name}'] + [f'gimp-{p}-{name}' for p in ('layer', 'drawable', 'item', 'image', 'selection', 'text-layer', 'context', 'drawable-edit')]
    pdb = Gimp.get_pdb()
    for t in tries:
        if not pdb.procedure_exists(t):
            continue
        p = pdb.lookup_procedure(t)
        out.append(f'GIMP says ({t}): {p.get_blurb()}')
        h = (p.get_help() or '').strip()
        if h:
            out.append(h[:320])
        for a in p.get_arguments():
            lo, hi = getattr(a, 'minimum', None), getattr(a, 'maximum', None)
            rng = f' range {lo:g} to {hi:g}' if lo is not None and hi is not None and abs(lo) < 1e9 and abs(hi) < 1e9 else ''
            out.append(f'  {a.name}{rng}: {a.get_blurb()}'[:200])
        return True
    return False
def op_props(name):
    img = Gimp.Image.new(8, 8, Gimp.ImageBaseType.RGB)
    lay = Gimp.Layer.new(img, 'x', 8, 8, Gimp.ImageType.RGBA_IMAGE, 100, Gimp.LayerMode.NORMAL)
    img.insert_layer(lay, None, 0)
    f = Gimp.DrawableFilter.new(lay, name, '')
    cfg = f.get_config()
    out.append(f'{name} settings (dashes become underscores in ava_filter):')
    for p in cfg.list_properties():
        try:
            d = p.get_default_value()
        except Exception:
            d = ''
        lo, hi = getattr(p, 'minimum', None), getattr(p, 'maximum', None)
        rng = f' range {lo:g} to {hi:g}' if lo is not None and hi is not None and abs(lo) < 1e9 and abs(hi) < 1e9 else ''
        out.append(f'  {p.get_name()} ({p.value_type.name}) default {d}{rng} — {p.get_blurb() or ""}'[:180])
    img.delete()
def run():
    if q.startswith(('gegl:', 'gimp:', 'svg:')):
        op_props(q)
        return True
    parts = q.split('.')
    if parts[0] == 'Gimp' and len(parts) > 1:
        o = Gimp
        for p in parts[1:]:
            if not hasattr(o, p):
                return False
            o = getattr(o, p)
        if callable(o) and not isinstance(o, type):
            out.append(doc(o) or q)
            try:
                pdb_info(q)
            except Exception:
                pass
        else:
            out.append(f'{q}: {doc(o)}')
            names = [n for n in dir(o) if not n.startswith('_')]
            caps = [n for n in names if n.isupper()]
            if caps:
                out.append('Values: ' + ', '.join(caps))
            else:
                out.append('Members: ' + ', '.join(n for n in names if n.islower())[:1500])
        return True
    return False
found = False
try:
    found = run()
except Exception as e:
    out.append(f'Lookup failed: {e}')
    found = True
if not found:
    low = q.lower().split('.')[-1]
    hits = []
    seen = set()
    for label, c in CLASSES:
        for n in dir(c):
            if low in n.lower() and not n.startswith('_') and n not in seen:
                seen.add(n)
                hits.append(f'{label}.{n}: {doc(getattr(c, n))}')
    out.append(f'Names containing "{low}":' if hits else f'Nothing found for "{q}".')
    out += hits[:30]
    try:
        pdb_info(q)
    except Exception:
        pass
print('@@AVA_LOOKUP_START@@\n' + '\n'.join(out) + '\n@@AVA_LOOKUP_END@@')
`;

function runLookup(exe: string, args: string[], env: NodeJS.ProcessEnv, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(exe, args, { env, windowsHide: true });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const timer = setTimeout(() => child.kill(), 90_000);
    signal?.addEventListener('abort', () => child.kill(), { once: true });
    const done = () => { clearTimeout(timer); resolve(out); };
    child.on('close', done);
    child.on('error', done);
  });
}

export class DesignApiLookupTool implements Tool {
  readonly name = 'design_api_lookup';
  readonly description = 'Ask the installed Blender or GIMP exactly how a call, node or filter works. It is the real version on this computer, so it cannot be out of date. Free, instant, and it touches no work.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'design_api_lookup',
    description:
      'Look up the REAL API in the installed Blender or GIMP before you write a script: no guessing from memory. Needs no brief and changes nothing. ' +
      'Blender: "bpy.ops.object.bake" (an operator and its options), "bpy.ops.uv" (a module\'s operators), "ShaderNodeMix" (a node\'s exact inputs and outputs), "bpy.types.Material" (properties). ' +
      'GIMP: "Gimp.Image.select_ellipse" (the exact signature), "Gimp.ChannelOps" (values), "Gimp.TextLayer" (members), "gegl:dropshadow" (a filter\'s settings). ' +
      'Any plain word searches the names, e.g. "bake" or "gradient". Use it BEFORE writing a call you are not certain of; use design_read_docs for how a technique is done.',
    parameters: {
      type: 'object',
      properties: {
        tool: { type: 'string', enum: ['blender', 'gimp'], description: 'Which program to ask.' },
        query: { type: 'string', description: 'The name to look up, or a word to search for.' },
      },
      required: ['tool', 'query'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const tool = args.tool === 'gimp' ? 'gimp' : 'blender';
    const query = String(args.query ?? '').trim();
    if (!/^[\w.:-]{1,120}$/.test(query)) {
      return { success: false, output: 'Give one name or word to look up, e.g. "bpy.ops.object.bake", "gegl:dropshadow" or "bake".' };
    }
    const id = randomUUID();
    const scriptPath = join(tmpdir(), `ava-lookup-${id}.py`);
    let out = '';
    let version = '';
    try {
      if (tool === 'blender') {
        const b = await findBlender();
        if (!b) return { success: false, output: `Blender isn't installed here, or I can't find it. It's free from ${BLENDER_DOWNLOAD_URL}.` };
        version = `Blender ${b.version}`;
        await writeFile(scriptPath, BLENDER_LOOKUP_PY, 'utf-8');
        out = await runLookup(b.path, ['-b', '--factory-startup', '--disable-autoexec', '--python', scriptPath, '--', JSON.stringify(query)], process.env, context.signal);
      } else {
        const g = await findGimp();
        if (!g) return { success: false, output: `GIMP 3 isn't installed here, or I can't find it. It's free from ${GIMP_DOWNLOAD_URL}.` };
        version = `GIMP ${g.version}`;
        await writeFile(scriptPath, GIMP_LOOKUP_PY, 'utf-8');
        out = await runLookup(g.path, ['-n', '-i', '--batch-interpreter', 'python-fu-eval', '-b', `exec(open(${JSON.stringify(scriptPath)}, encoding='utf-8').read())`, '--quit'], { ...process.env, AVA_GIMP_QUERY: JSON.stringify(query) }, context.signal);
      }
    } finally {
      await rm(scriptPath, { force: true }).catch(() => {});
    }
    const a = out.indexOf(START);
    const b = out.indexOf(END);
    if (a < 0 || b < 0) return { success: false, output: `The lookup did not finish in ${version}. Its last output:\n${out.split(/\r?\n/).slice(-10).join('\n')}` };
    return { success: true, output: `From the installed ${version}:\n${out.slice(a + START.length, b).trim().slice(0, MAX_LOOKUP)}` };
  }
}

// ── design_read_docs ─────────────────────────────────────────────────────────

/** Official documentation only. Anything else is refused, redirects included. */
const OFFICIAL_HOSTS = ['docs.blender.org', 'developer.gimp.org', 'docs.gimp.org', 'gegl.org', 'www.gegl.org'];

export function isOfficialDocsUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && OFFICIAL_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

export function docsHtmlToText(html: string): string {
  // The page's own content when it marks it: otherwise the site menu fills the
  // first screenful and she reads navigation instead of the docs.
  const main = /<(article|main)\b[\s\S]*<\/\1>/i.exec(html);
  return (main ? main[0] : html)
    .replace(/<(script|style|nav|header|footer|aside|svg)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/pre|\/dd|\/dt)\b[^>]*>/gi, '\n')
    .replace(/<a\b[^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi, '$2')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export class DesignReadDocsTool implements Tool {
  readonly name = 'design_read_docs';
  readonly description = 'Read a page of the official Blender, GIMP or GEGL documentation. Official sites only.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;
  readonly outputTrust: ToolOutputTrust = 'untrusted';

  readonly schema: FunctionSchema = {
    name: 'design_read_docs',
    description:
      'Open a page of the OFFICIAL documentation and read it: for how a feature is meant to be used, a technique, or what a setting really does. Only these sites work: ' +
      'docs.blender.org (manual: /manual/en/latest/ ; Python API: /api/current/ , e.g. /api/current/bpy.ops.object.html), ' +
      'docs.gimp.org (manual: /3.2/en/), developer.gimp.org (plug-in writing: /resource/about-plugins/ ; API: /api/3.0/libgimp/), ' +
      'gegl.org (every filter: /operations/ , e.g. /operations/gegl-dropshadow.html). ' +
      'Find the page with web_search restricted by naming the site, or go straight to a URL you know. For exact arguments use design_api_lookup, which asks the installed version.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The https:// address of the page, on one of the official sites.' },
        offset: { type: 'number', description: 'Character to start from, to read further into a long page. Default 0.' },
      },
      required: ['url'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    let url = String(args.url ?? '').trim();
    if (!isOfficialDocsUrl(url)) {
      return { success: false, output: `That isn't one of the official docs sites. Only ${OFFICIAL_HOSTS.join(', ')} (https) can be read here.` };
    }
    try {
      // Follow redirects by hand, so one cannot walk off the official sites.
      let res: Response | undefined;
      for (let hop = 0; hop < 5; hop++) {
        res = await fetch(url, { redirect: 'manual', signal: context.signal ?? AbortSignal.timeout(20_000), headers: { 'user-agent': 'AvaSupernova-Docs' } });
        const next = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
        if (!next) break;
        url = new URL(next, url).toString();
        if (!isOfficialDocsUrl(url)) return { success: false, output: 'That page redirects away from the official docs, so it was not opened.' };
      }
      if (!res || !res.ok) return { success: false, output: `The docs site answered ${res?.status ?? 'nothing'} for ${url}. Check the address, or find the page with web_search.` };
      const text = docsHtmlToText(await res.text());
      const offset = Math.max(0, Number(args.offset) || 0);
      const slice = text.slice(offset, offset + MAX_PAGE);
      const more = offset + MAX_PAGE < text.length;
      return {
        success: true,
        output: `${url}\n\n${slice}${more ? `\n\n[The page goes on: ${text.length} characters in all. Read on with offset ${offset + MAX_PAGE}.]` : ''}`,
      };
    } catch (err) {
      return { success: false, output: `Could not open that page: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}
