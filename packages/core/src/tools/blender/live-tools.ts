/**
 * Blender Live — Ava's tools for working in the person's open Blender.
 * Plan: Decisions/plans/2026-11-16-blender-mcp.md (private), Phase 2.
 *
 * Live work lands exactly where headless work does — the model's own folder
 * (~/.ava/creative/blender/<slug>/): its .blend, .glb (+ .fbx), preview.png,
 * history steps, Library entry and making record — so the Library, versions,
 * Duplicate and Restore don't care which way a model was made.
 *
 *   design_live_open_model — open (or start) the model's .blend in their Blender
 *   design_live_step       — one small step of her Python, checked first, then a look
 *   design_live_save       — save, export, preview, record a step, update the Library
 *
 * Plus Blender's own tools from the server (scene summaries, screenshots,
 * jumping the view, API/manual search), minus the background "_for_cli" ones
 * (that's Headless) and raw code-running (which goes through design_live_step).
 *
 * Safety (his call, 17 Nov: "Ava is safe by design … dont need to be very
 * heavy"): the same script check as Headless before every step, running code
 * asks first through the normal approval, renders stay inside the model folder.
 * The brief comes first, as in Headless.
 */

import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Tool, ToolExecutionContext, ToolResult, ToolRiskLevel } from '../types.js';
import type { FunctionSchema } from '../../providers/types.js';
import { mcpToolsForAva } from '../../mcp/tools.js';
import type { McpConnection } from '../../mcp/connection.js';
import { BlenderLive } from './live.js';
import { BLENDER_HELPERS_PY } from './runner-py.js';
import { KIT_PY } from '../../brand/kit-py.js';
import { kitForScripts } from '../../brand/brand-kits.js';
import { modelsDir, modelSlug } from './paths.js';
import { readModelBrief } from './model-brief.js';
import { checkBlenderScript, upsertLibraryEntry } from './build-model.js';
import { recordModelStep } from './model-history.js';
import { appendMaking, avaContext, beforeChange, sourcesNow } from '../making-record.js';
import { fileLinkedWork } from '../../creative/library-folders.js';

/** The model open in their Blender right now (kept on BlenderLive, so Headless can see it). */
export const liveModelNow = () => BlenderLive.current().openModel;

const py = (s: string) => JSON.stringify(s); // a JSON string is a valid Python string literal

interface PyRun { ok: boolean; result?: Record<string, unknown>; message: string; stdout: string }

/** Run code in their Blender through the server; read Blender's {status, result | message, stdout}. */
async function runPy(conn: McpConnection, code: string, signal?: AbortSignal): Promise<PyRun> {
  const r = await conn.call('execute_blender_code', { code }, { signal, timeoutMs: 300_000 });
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(r.text); } catch { /* not JSON: report the text */ }
  const stdout = typeof body.stdout === 'string' ? body.stdout.trim() : '';
  if (r.isError || body.status === 'error' || (!('status' in body) && r.isError)) {
    return { ok: false, message: String(body.message ?? r.text ?? 'Blender reported an error.').trim(), stdout };
  }
  const result = (body.result && typeof body.result === 'object' ? body.result : {}) as Record<string, unknown>;
  return { ok: true, result, message: '', stdout };
}

async function readyConnection(): Promise<McpConnection | ToolResult> {
  const live = BlenderLive.current();
  if (!live.connection) {
    return { success: false, output: `MCP isn't connected (${live.lastStatus.message}). Work headless with design_build_model, or ask them to switch the room to MCP.` };
  }
  const s = await live.refresh();
  if (s.state !== 'ready') return { success: false, output: `${s.message} Tell them, and wait — or work headless.` };
  return live.connection!;
}

async function agreedBrief(name: string, slug: string): Promise<ToolResult | null> {
  const brief = await readModelBrief(slug);
  if (!brief) return { success: false, output: `"${name}" has no brief yet. Research it, then propose the brief with design_propose_model_brief — they agree it on the card first, Live or not.` };
  if (brief.status !== 'agreed') return { success: false, output: `The brief for "${name}" is still waiting for them to agree it on the card.` };
  return null;
}

function schema(name: string, description: string, properties: Record<string, unknown>, required: string[]): FunctionSchema {
  return { name, description, parameters: { type: 'object', properties, required } };
}

// ── Looking ──────────────────────────────────────────────────────────────────
// Tested on his Blender 5.2.2 (17 Nov): the server's screenshot tools came back
// pure black (window and area), while an OFF-SCREEN render of the 3D view gave
// exactly what he sees, in half a second. So Ava looks with that, falling back
// to Blender's thumbnail render (the camera view), then a screenshot.

const LOOK_PY = (out: string) => `import bpy, os
out = ${py(out)}
os.makedirs(os.path.dirname(out), exist_ok=True)
win = area = None
for w in bpy.context.window_manager.windows:
    for a in w.screen.areas:
        if a.type == "VIEW_3D":
            win, area = w, a
            break
    if area:
        break
if area is None:
    result = {"ok": False, "why": "no 3D viewport is open"}
else:
    region = next(r for r in area.regions if r.type == "WINDOW")
    with bpy.context.temp_override(window=win, area=area, region=region):
        bpy.ops.render.opengl(view_context=True)
    bpy.data.images["Render Result"].save_render(out)
    result = {"ok": os.path.exists(out)}
`;

/** Copy the file a render-to-path tool reports (the add-on writes in its own temp folder). */
async function copyReported(text: string, to: string): Promise<boolean> {
  try {
    const body = JSON.parse(text) as { result?: { filepath?: string; path?: string }; filepath?: string };
    const from = body.result?.filepath ?? body.result?.path ?? body.filepath;
    if (!from || !existsSync(from)) return false;
    await copyFile(from, to);
    return true;
  } catch {
    return false;
  }
}

/** A picture of the model as it is now, as base64 PNG — or null. */
export async function liveLook(conn: McpConnection, modelDir: string): Promise<string | null> {
  const out = join(modelDir, '.live', 'view.png');
  const view = await runPy(conn, LOOK_PY(out)).catch(() => null);
  if (view?.ok && view.result?.ok && existsSync(out)) return (await readFile(out)).toString('base64');
  const thumb = await conn.call('render_thumbnail_to_path', { output_path: out }, { timeoutMs: 120_000 }).catch(() => null);
  if (thumb && !thumb.isError && (await copyReported(thumb.text, out))) return (await readFile(out)).toString('base64');
  const shot = await conn.call('get_screenshot_of_area_as_image', { area_ui_type: 'VIEW_3D' }, { timeoutMs: 30_000 }).catch(() => null);
  return shot?.images[0]?.data ?? null;
}

// ── design_live_open_model ───────────────────────────────────────────────────

export class DesignLiveOpenModelTool implements Tool {
  readonly name = 'design_live_open_model';
  readonly description = 'Open a model in their open Blender (Live), or start it there if it is new.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;
  readonly schema = schema(this.name,
    'Open the model\'s own .blend in THEIR open Blender so you can work on it Live, or start it on an empty scene if it is new. ' +
    'Do this before design_live_step. If their Blender has unsaved work in another file, nothing is opened — ask them to save it first. Needs an agreed brief.',
    { name: { type: 'string', description: 'The model\'s name, e.g. "Worn Supply Crate".' } }, ['name']);

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const name = String(args.name ?? '').trim();
    const slug = modelSlug(name);
    if (!slug) return { success: false, output: 'Missing `name`.' };
    const brief = await agreedBrief(name, slug);
    if (brief) return brief;
    const conn = await readyConnection();
    if (!('call' in conn)) return conn;

    const dir = join(modelsDir(), slug);
    const blend = join(dir, `${slug}.blend`);
    await mkdir(dir, { recursive: true });
    await beforeChange(dir, 'blender');
    const isNew = !existsSync(blend);
    // Opening a file inside the add-on's own request is avoided: it is scheduled
    // for just after Blender answers, then checked.
    const check = await runPy(conn, `import bpy, os
target = ${py(blend)}
cur = bpy.data.filepath
same = bool(cur) and os.path.normcase(os.path.abspath(cur)) == os.path.normcase(os.path.abspath(target))
if same:
    result = {"state": "already"}
elif bpy.data.is_dirty:
    result = {"state": "unsaved", "file": cur or "a new file that was never saved"}
else:
    def _ava_open():
        if os.path.exists(target):
            bpy.ops.wm.open_mainfile(filepath=target)
        else:
            bpy.ops.wm.read_homefile(use_empty=True)
            bpy.ops.wm.save_as_mainfile(filepath=target)
        return None
    bpy.app.timers.register(_ava_open, first_interval=0.2)
    result = {"state": "opening"}
`, context.signal);
    if (!check.ok) return { success: false, output: `Blender couldn't open "${name}": ${check.message}` };
    if (check.result?.state === 'unsaved') {
      return { success: false, output: `Nothing was opened: their Blender has unsaved work in ${String(check.result.file)}. Ask them to save it (or close it without saving, their choice), then try again. Never discard it yourself.` };
    }
    if (check.result?.state === 'opening') {
      let opened = false;
      for (let i = 0; i < 20 && !opened; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const now = await runPy(conn, `import bpy, os\nresult = {"file": bpy.data.filepath}`).catch(() => null);
        const f = String(now?.result?.file ?? '');
        opened = !!f && resolve(f).toLowerCase() === resolve(blend).toLowerCase();
      }
      if (!opened) return { success: false, output: `Blender didn't open "${name}" in time. Ask them to look at Blender, then try again.` };
    }
    BlenderLive.current().openModel = { slug, name, dir, blend };
    return {
      success: true,
      output: `"${name}" is open in their Blender${isNew ? ' on an empty scene (no default cube, camera or light)' : ''}. ` +
        'Work in small steps with design_live_step, talk them through each one, and design_live_save when a step is worth keeping. They can take the mouse at any time.',
    };
  }
}

// ── design_live_step ─────────────────────────────────────────────────────────

export class DesignLiveStepTool implements Tool {
  readonly name = 'design_live_step';
  readonly description = 'Run one small step of Blender Python in their open Blender, then see the viewport.';
  readonly riskLevel: ToolRiskLevel = 'dangerous';
  readonly requiresConfirmation = true;
  readonly schema = schema(this.name,
    'Run ONE small step of your Blender Python (bpy) in THEIR open Blender, on the model opened with design_live_open_model, then get a picture of the 3D viewport so you SEE the result. ' +
    'They watch it happen and may have changed things by hand since your last step — read the scene first when unsure (blender_live_get_objects_summary). ' +
    'ASSET_DIR (the model\'s folder), KIT (the brand kit) and the helpers ava_unwrap() and ava_bake() are predefined, exactly as in Headless — bake here when the look is right; Blender is busy while it bakes, so tell them first. Write files only inside ASSET_DIR. Don\'t save, open or reset files yourself — design_live_save does that. ' +
    'To return values, set `result` to a JSON-serialisable dict. Units are metres, Z is up.',
    {
      script: { type: 'string', description: 'The Blender Python for this one step.' },
      description: { type: 'string', description: 'What this step does, in a few words (shown to them and kept with the script).' },
    }, ['script']);

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const script = String(args.script ?? '');
    if (!script.trim()) return { success: false, output: 'Missing `script`.' };
    const model = liveModelNow();
    if (!model) return { success: false, output: 'No model is open Live. Open one with design_live_open_model first.' };
    const refused = checkBlenderScript(script);
    if (refused) return { success: false, output: refused };
    const conn = await readyConnection();
    if (!('call' in conn)) return conn;

    // Keep every step's script beside the model, as Headless does.
    const scriptsDir = join(model.dir, 'scripts');
    await mkdir(scriptsDir, { recursive: true });
    await writeFile(join(scriptsDir, `${new Date().toISOString().replace(/[:.]/g, '-')}-live.py`), script, 'utf-8');

    // The same helpers and brand kit as Headless: KIT, ava_unwrap(), ava_bake().
    const kit = await kitForScripts((context.sharedState?.designProject as (() => string | null | undefined) | undefined)?.()).catch(() => null);
    const prelude = `import bpy, os, json, math
ASSET_DIR = ${py(model.dir)}
JOB = json.loads(${py(JSON.stringify({ kit: kit ?? null }))})
${KIT_PY}
${BLENDER_HELPERS_PY}
if os.path.normcase(os.path.abspath(bpy.data.filepath or "")) != os.path.normcase(os.path.abspath(${py(model.blend)})):
    raise RuntimeError("The file open in Blender isn't the model any more (they may have opened another). Open it again with design_live_open_model.")
`;
    const run = await runPy(conn, `${prelude}\n${script}`, context.signal);
    const picture = await liveLook(conn, model.dir);
    const image = picture ? { data: picture, mimeType: 'image/png' } : undefined;
    const said = [run.stdout && `What the script printed:\n${run.stdout.slice(-4000)}`].filter(Boolean).join('\n');
    if (!run.ok) {
      return {
        success: false,
        output: `The step stopped with an error in their Blender — anything it did before the error is still in the scene (Ctrl+Z in Blender undoes it). Nothing was saved.\n\n${run.message.slice(-4000)}${said ? `\n\n${said}` : ''}`,
        metadata: image ? { base64_image: image.data, mime_type: image.mimeType } : undefined,
      };
    }
    const result = run.result && Object.keys(run.result).length ? `\nresult: ${JSON.stringify(run.result).slice(0, 4000)}` : '';
    return {
      success: true,
      output: `Step done in their Blender${typeof args.description === 'string' ? ` (${args.description})` : ''}.${result}${said ? `\n${said}` : ''}\n` +
        (image ? 'Here is the 3D view now — check it against the brief before you say anything about it.' : 'No picture could be taken of the 3D view (is a 3D viewport open?). Read the scene with blender_live_get_objects_summary instead.'),
      metadata: image ? { base64_image: image.data, mime_type: image.mimeType } : undefined,
    };
  }
}

// ── design_live_save ─────────────────────────────────────────────────────────

export class DesignLiveSaveTool implements Tool {
  readonly name = 'design_live_save';
  readonly description = 'Save the Live model: its .blend, a .glb (and .fbx if asked), a preview, a history step and the Library entry.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;
  readonly schema = schema(this.name,
    'Save the model open Live in their Blender — the .blend, a .glb for the Library viewer (and an .fbx if asked), a preview picture — and keep it as a history step they can go back to. ' +
    'Do this when a step is worth keeping, and always before stopping. Their own changes in Blender are saved with it.',
    {
      description: { type: 'string', description: 'What this saved step is, in a few words.' },
      fbx: { type: 'boolean', description: 'Also export an .fbx (for Unreal and other engines).' },
    }, []);

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const model = liveModelNow();
    if (!model) return { success: false, output: 'No model is open Live.' };
    const conn = await readyConnection();
    if (!('call' in conn)) return conn;
    const live = BlenderLive.current();
    const glb = join(model.dir, `${model.slug}.glb`);
    const fbx = join(model.dir, `${model.slug}.fbx`);
    const saved = await runPy(conn, `import bpy, os
from mathutils import Vector
target = ${py(model.blend)}
if os.path.normcase(os.path.abspath(bpy.data.filepath or "")) != os.path.normcase(os.path.abspath(target)):
    raise RuntimeError("The file open in Blender isn't the model any more. Open it again with design_live_open_model.")
bpy.ops.wm.save_mainfile()
bpy.ops.export_scene.gltf(filepath=${py(glb)}, export_format="GLB", use_selection=False)
${args.fbx === true ? `bpy.ops.export_scene.fbx(filepath=${py(fbx)}, use_selection=False)` : 'pass'}
tris = 0
lo = [1e18] * 3
hi = [-1e18] * 3
dg = bpy.context.evaluated_depsgraph_get()
for ob in bpy.context.scene.objects:
    if ob.type != "MESH":
        continue
    me = ob.evaluated_get(dg).to_mesh()
    tris += sum(len(p.vertices) - 2 for p in me.polygons)
    for v in me.vertices:
        w = ob.matrix_world @ v.co
        for i in range(3):
            lo[i] = min(lo[i], w[i]); hi[i] = max(hi[i], w[i])
    ob.evaluated_get(dg).to_mesh_clear()
size = [round(hi[i] - lo[i], 3) for i in range(3)] if tris else [0, 0, 0]
result = {"triangles": tris, "size_m": size, "version": bpy.app.version_string}
`, context.signal);
    if (!saved.ok) return { success: false, output: `Saving didn't finish: ${saved.message.slice(-3000)}` };
    // The preview: Blender's own thumbnail render (the camera view). The add-on
    // writes it in its own temp folder and reports the path, so copy it in. No
    // camera, or no luck: the 3D view as it is.
    const previewPath = join(model.dir, 'preview.png');
    const thumb = await conn.call('render_thumbnail_to_path', { output_path: previewPath }, { timeoutMs: 120_000 }).catch(() => null);
    if (!(thumb && !thumb.isError && (await copyReported(thumb.text, previewPath)))) {
      const view = await liveLook(conn, model.dir);
      if (view) await writeFile(previewPath, Buffer.from(view, 'base64'));
    }

    const files = [`${model.slug}.blend`, `${model.slug}.glb`, ...(args.fbx === true ? [`${model.slug}.fbx`] : []), 'preview.png']
      .filter((f) => existsSync(join(model.dir, f)));
    const version = String(saved.result?.version ?? live.lastStatus.blenderVersion ?? '?');
    const description = typeof args.description === 'string' ? args.description : undefined;
    await upsertLibraryEntry({
      slug: model.slug, name: model.name, description, files, blenderVersion: version,
      triangles: Number(saved.result?.triangles) || undefined, sizeM: saved.result?.size_m as number[] | undefined,
    }).catch(() => {});
    const step = await recordModelStep(model.slug, description ?? '').catch(() => null);
    await fileLinkedWork('blender', model.slug).catch(() => {});
    const who = avaContext(context);
    await appendMaking(model.dir, {
      event: 'step', by: 'ava', ai: who.ai, ask: who.ask, tool: 'blender', app: `Blender ${version} (Live)`,
      description: description ?? null, live: true, historyStep: step?.number ?? null, files,
      sources: await sourcesNow(model.dir, 'blender'),
    }).catch(() => {});

    let preview: string | undefined;
    try { preview = (await readFile(join(model.dir, 'preview.png'))).toString('base64'); } catch { /* none */ }
    return {
      success: true,
      output: `Saved "${model.name}"${step ? ` as step ${step.number}` : ''}: ${files.join(', ')}. ` +
        `${saved.result?.triangles ?? 0} triangles, size ${(saved.result?.size_m as number[] | undefined)?.join(' × ') ?? '?'} m (X × Y × Z). It's in the Library.`,
      metadata: preview ? { base64_image: preview, mime_type: 'image/png' } : undefined,
    };
  }
}

// ── design_live_look ─────────────────────────────────────────────────────────

export class DesignLiveLookTool implements Tool {
  readonly name = 'design_live_look';
  readonly description = 'See the 3D view of their open Blender right now.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;
  readonly schema = schema(this.name,
    'Get a picture of the 3D view in THEIR open Blender, as they see it — after they change something by hand, or before you decide the next step.',
    {}, []);

  async execute(): Promise<ToolResult> {
    const conn = await readyConnection();
    if (!('call' in conn)) return conn;
    const dir = liveModelNow()?.dir ?? join(modelsDir(), '.live');
    const picture = await liveLook(conn, dir);
    if (!picture) return { success: false, output: 'No picture could be taken of the 3D view (is a 3D viewport open in Blender?).' };
    return { success: true, output: 'Here is their 3D view now.', metadata: { base64_image: picture, mime_type: 'image/png' } };
  }
}

// ── Blender's own tools, as Ava's ────────────────────────────────────────────

/**
 * Blender's server tools for Live, minus: the background "_for_cli" ones
 * (that's Headless), raw code-running (design_live_step), and the image
 * screenshots and render-to-path tools (black / written to the add-on's temp
 * folder on his machine — design_live_look and design_live_save cover them).
 */
export function blenderLiveServerTools(conn: McpConnection): Tool[] {
  const keep = conn.tools().map((t) => t.name).filter((n) =>
    !n.endsWith('_for_cli') && n !== 'execute_blender_code' && !n.startsWith('render_') && !/^get_screenshot_.*_as_image$/.test(n));
  return mcpToolsForAva(conn, {
    only: keep,
    // Moving the view or switching a tab changes nothing in their work.
    risk: (t) => (t.name.startsWith('jump_to_') ? 'safe' : undefined),
  });
}

/** Ava's Live tool names, and Blender's (for taking them away again). */
export const isBlenderLiveTool = (name: string) => name.startsWith('design_live_') || name.startsWith('blender_live_');

/**
 * Put Ava's Live tools in a registry, or take them away: call on start and on
 * every BlenderLive change. Live tools exist only while Blender is ready.
 */
export function syncBlenderLiveTools(registry: { register(t: Tool): void; unregisterWhere(m: (n: string) => boolean): number }): number {
  registry.unregisterWhere(isBlenderLiveTool);
  if (BlenderLive.current().lastStatus.state !== 'ready') return 0;
  const tools = blenderLiveTools();
  for (const t of tools) registry.register(t);
  return tools.length;
}

/** Everything Ava gets while Live is connected. */
export function blenderLiveTools(): Tool[] {
  const conn = BlenderLive.current().connection;
  if (!conn) return [];
  return [new DesignLiveOpenModelTool(), new DesignLiveStepTool(), new DesignLiveLookTool(), new DesignLiveSaveTool(), ...blenderLiveServerTools(conn)];
}
