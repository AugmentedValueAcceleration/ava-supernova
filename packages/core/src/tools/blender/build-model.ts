/**
 * Design Studio 3D — Ava builds game assets in Blender with no window.
 *
 * design_build_model runs her Python inside Blender (`blender -b`), in the
 * model's own folder under ~/.ava/creative/blender/<model>/, then saves the
 * .blend, exports a .glb (always — the Library viewer reads it) and an .fbx
 * when asked, renders a preview, and hands that preview back as an image so
 * she SEES what she built before she says anything about it.
 *
 * How a model grows (his call, 3 Nov 2026): the first run starts from an empty
 * scene; every later run OPENS the saved .blend — including anything he changed
 * by hand in Blender — and works on top of it. A new canvas only after he says
 * yes. Every run keeps the previous five versions in versions/. A run that
 * fails saves nothing, so the model is exactly as it was.
 *
 * Safety (his call, 3 Nov 2026): a guard, not per-run approval. Two layers —
 * this file refuses the obvious escape hatches in the script text, and the
 * runner installs a Python audit hook inside Blender that refuses starting
 * programs, network access, native code and any write outside the model
 * folder. It is a guard, not a sandbox: Blender's own C code is not visible to
 * the hook, which is why absolute paths are refused in the script itself.
 *
 * Runs here, in core, on purpose: the extension host and the IDE sidecar both
 * run core in Node, so both surfaces get the same tool with no host wiring.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile, readdir, stat, rm, cp, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from '../types.js';
import type { FunctionSchema } from '../../providers/types.js';
import { creativeDir, modelsDir, metadataFile, modelSlug } from './paths.js';
import { readModelBrief, formatModelBrief } from './model-brief.js';

export { modelsDir, modelSlug } from './paths.js';
import { findBlender, BLENDER_DOWNLOAD_URL } from './find-blender.js';
import { BLENDER_RUNNER_PY } from './runner-py.js';

const DEFAULT_TIMEOUT_S = 300;
const MAX_TIMEOUT_S = 900;
const MAX_OUTPUT = 400_000;

// ── The script check (layer one of the guard) ────────────────────────────────
// Each rule names WHY in words she can act on, so a refusal leads to a fix
// rather than a retry of the same thing.
const SCRIPT_RULES: Array<{ re: RegExp; why: string }> = [
  { re: /\bsubprocess\b|\bos\.(system|popen|exec\w*|spawn\w*|startfile|kill)\b/, why: 'it starts other programs' },
  { re: /\b(socket|urllib|requests|http\.client|ftplib|smtplib|asyncio\.open_connection)\b/, why: 'it uses the network' },
  { re: /\b(ctypes|cffi|winreg|_winapi|msvcrt)\b/, why: 'it reaches native code or the registry' },
  { re: /bpy\.ops\.wm\.(save_as_mainfile|save_mainfile|read_homefile|read_factory_settings|quit_blender|url_open)\b/, why: 'it saves, resets or closes Blender itself — the tool saves the model for you after your script runs' },
  { re: /bpy\.ops\.(preferences|script)\.|addon_(install|enable|remove)|bpy\.utils\.execfile/, why: 'it changes Blender\'s own setup or runs another script' },
  { re: /\blibraries\.write\b|\bexpanduser\b|Path\.home\b|\bos\.environ\b|\bgetenv\b/, why: 'it builds a path outside the model folder' },
  { re: /["'](?:[A-Za-z]:[\\/]|\\\\|~[\\/]|\/(?:Users|home|etc|tmp|var|Applications|mnt|opt)\b)/, why: 'it contains an absolute path — build every path from ASSET_DIR, e.g. os.path.join(ASSET_DIR, "icon.png")' },
  { re: /\.\.[\\/]/, why: 'it climbs out of the model folder with ".." — build every path from ASSET_DIR' },
];

export function checkBlenderScript(script: string): string | null {
  for (const rule of SCRIPT_RULES) {
    const m = rule.re.exec(script);
    if (m) return `The script was not run: ${rule.why} (found "${m[0]}"). Scripts here only build the model and write inside its own folder.`;
  }
  return null;
}

// ── Library entry (one asset, one folder) ────────────────────────────────────
// The same metadata.json the extension and the IDE both read. `path` points at
// the preview so the Library shows the model's picture; `folder` is the whole
// asset; `bytes` is the whole folder, re-measured after every run.

async function folderBytes(dir: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) total += await folderBytes(p);
    else total += (await stat(p).catch(() => ({ size: 0 }))).size;
  }
  return total;
}

interface ModelEntry {
  slug: string; name: string; description?: string; files: string[];
  blenderVersion: string; triangles?: number; sizeM?: number[];
}

async function upsertLibraryEntry(m: ModelEntry): Promise<void> {
  let items: Array<Record<string, unknown>> = [];
  try {
    const parsed = JSON.parse(await readFile(metadataFile(), 'utf-8'));
    if (Array.isArray(parsed)) items = parsed;
  } catch { /* none yet */ }
  const id = `model_${m.slug}`;
  const existing = items.find((i) => i.id === id);
  const folder = join(modelsDir(), m.slug);
  const now = new Date().toISOString();
  const entry: Record<string, unknown> = {
    ...(existing ?? {}),
    id,
    kind: 'model',
    designType: 'model',
    path: `blender/${m.slug}/preview.png`,
    absolutePath: join(folder, 'preview.png'),
    folder: `blender/${m.slug}`,
    absoluteFolder: folder,
    glb: `blender/${m.slug}/${m.slug}.glb`,
    files: m.files,
    prompt: m.description ?? (existing?.prompt as string | undefined) ?? '',
    title: m.name,
    blenderVersion: m.blenderVersion,
    triangles: m.triangles,
    sizeM: m.sizeM,
    createdAt: (existing?.createdAt as string | undefined) ?? now,
    updatedAt: now,
    bytes: await folderBytes(folder),
  };
  await mkdir(creativeDir(), { recursive: true });
  await writeFile(metadataFile(), JSON.stringify([entry, ...items.filter((i) => i.id !== id)], null, 2), 'utf-8');
}

// ── Running Blender ──────────────────────────────────────────────────────────

interface RunnerResult {
  ok: boolean; files: string[]; warnings: string[]; error?: string;
  objects?: number; triangles?: number; size_m?: number[];
  preview?: 'hers' | 'auto'; preview_camera?: 'auto'; seconds?: number;
}

function runBlender(exe: string, args: string[], cwd: string, timeoutMs: number, signal?: AbortSignal):
  Promise<{ stdout: string; stderr: string; timedOut: boolean; aborted: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(exe, args, { cwd, windowsHide: true });
    let stdout = '', stderr = '', timedOut = false, aborted = false;
    child.stdout.on('data', (d) => { if (stdout.length < MAX_OUTPUT) stdout += d; });
    child.stderr.on('data', (d) => { if (stderr.length < MAX_OUTPUT) stderr += d; });
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    const onAbort = () => { aborted = true; child.kill(); };
    signal?.addEventListener('abort', onAbort, { once: true });
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve({ stdout, stderr, timedOut, aborted });
    };
    child.on('close', done);
    child.on('error', (err) => { stderr += String(err); done(); });
  });
}

/** Her own print() lines, without Blender's start-up and render chatter. */
function scriptOutput(stdout: string): string {
  const noise = /^(Blender \d|Read prefs|Read blend|Fra:|Saved: |Time: |Info: |Warning: Unable|Blender quit|Color management|\s*$|@@AVA_RESULT@@|\d\d:\d\d\.\d{3}\s)/;
  const lines = stdout.split(/\r?\n/).filter((l) => !noise.test(l));
  return lines.slice(-30).join('\n').slice(-3000);
}

const fmtSize = (s?: number[]) => (s && s.length === 3 ? `${s[0]} × ${s[1]} × ${s[2]} m` : 'unknown');

// ── design_build_model ───────────────────────────────────────────────────────

export class DesignBuildModelTool implements Tool {
  readonly name = 'design_build_model';
  readonly description =
    'Build or change a 3D model in Blender with no window: run your Blender Python on the model, save it, export it and see a preview. Free — Blender runs on their own computer.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'design_build_model',
    description:
      'Run YOUR Blender Python (bpy) on a 3D model and get back a preview image of the result. ' +
      'The FIRST run of a model starts from an EMPTY scene (no default cube, camera or light). EVERY LATER RUN OPENS THE SAVED MODEL — ' +
      'including anything the person changed by hand in Blender — so write ONLY the change for this step, never rebuild what is already there. ' +
      'Starting again on a new canvas (start_fresh) throws the current scene away for this run: ALWAYS ask the person first and only send it after they say yes. ' +
      'Never save, open or reset the file yourself: after your script runs, the tool saves the .blend, exports a .glb (and an .fbx if asked), and renders preview.png ' +
      '(your own camera if the scene has one, otherwise a three-quarter view). If YOU write preview.png yourself, yours is used. ' +
      'ASSET_DIR is predefined: the model\'s own folder. Write every file inside it (os.path.join(ASSET_DIR, "icon.png")) — absolute paths, "..", ' +
      'other programs, network and native code are refused. Units are metres, Z is up. If the script errors, nothing is saved and you get the traceback: fix it and run again. ' +
      'TEXTURING: live shader nodes (noise, math, ramps, bump) do NOT export — engines and the Library viewer show the model flat until it is baked. ' +
      'Two helpers are predefined for that: ava_unwrap() packs every object\'s UVs into one shared, non-overlapping square (your old layout is kept as "LiveUV" and your shader keeps reading it, so the look does not change), ' +
      'and ava_bake(size=2048) bakes colour, roughness, metal and normal into textures/ and puts an export-ready material on the objects (your live material is kept for re-baking — change it and call ava_bake() again). ' +
      'Use them rather than writing your own bake. Cycles IS available for baking even though Blender\'s engine list only shows EEVEE. ' +
      'The Blender Python API changes between versions — the result tells you the installed version; check its API docs when unsure.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The model\'s name, e.g. "Worn Supply Crate". The same name continues the same model; its folder is named from it.',
        },
        script: {
          type: 'string',
          description: 'Blender Python for THIS step only. `bpy` and `ASSET_DIR` are already defined. On a later run the saved model is already open — change it, don\'t rebuild it.',
        },
        description: {
          type: 'string',
          description: 'One line on what the model is, for the Library card (e.g. "Worn wooden supply crate, ruined London dock, ~2k tris").',
        },
        start_fresh: {
          type: 'boolean',
          description: 'Start this run from an EMPTY scene instead of the saved model. ONLY after the person has said yes to a new canvas — always ask first. The previous version is kept in versions/.',
        },
        fbx: {
          type: 'boolean',
          description: 'Also export an .fbx (Unreal / Unity). A .glb is always exported.',
        },
        timeout_seconds: {
          type: 'number',
          description: `How long Blender may run before it is stopped. Default ${DEFAULT_TIMEOUT_S}, most ${MAX_TIMEOUT_S}. Raise it only for heavy renders or bakes.`,
        },
      },
      required: ['name', 'script'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const name = String(args.name ?? '').trim();
    const script = String(args.script ?? '');
    const slug = modelSlug(name);
    if (!slug) return { success: false, output: 'Missing `name` — the model\'s name, e.g. "Worn Supply Crate".' };
    if (!script.trim()) return { success: false, output: 'Missing `script` — the Blender Python for this step.' };

    // The brief comes first — enforced here, not only asked for in her prompt.
    // Only the person agrees it (on the card), so this cannot be talked past.
    const brief = await readModelBrief(slug);
    if (!brief) {
      return {
        success: false,
        output: `Nothing was built: "${name}" has no brief yet. Research it, then propose the brief with design_propose_model_brief — the person agrees it on the card before the first build.`,
      };
    }
    if (brief.status !== 'agreed') {
      return {
        success: false,
        output: `Nothing was built: the brief for "${name}" is still waiting for the person to agree it on the card` +
          `${brief.editedByPerson ? ' (they edited it — read their changes in the room context and talk them through)' : ''}. Ask them to agree it, or change it with design_propose_model_brief if they want something different.`,
      };
    }

    const refused = checkBlenderScript(script);
    if (refused) return { success: false, output: refused };

    const blender = await findBlender();
    if (!blender) {
      return {
        success: false,
        output: `Blender isn't installed on this computer, or I can't find it. It's free from ${BLENDER_DOWNLOAD_URL} — ` +
          'once it is installed, try again. If it is installed somewhere unusual, its path can be set in Settings.',
      };
    }

    const assetDir = join(modelsDir(), slug);
    const blendPath = join(assetDir, `${slug}.blend`);
    const hadModel = existsSync(blendPath);
    const continuing = hadModel && args.start_fresh !== true;
    await mkdir(assetDir, { recursive: true });
    await writeFile(join(assetDir, 'script.py'), script, 'utf-8');

    // Keep every step's script beside the model, so what ran is always visible.
    const scriptsDir = join(assetDir, 'scripts');
    await mkdir(scriptsDir, { recursive: true });
    await writeFile(join(scriptsDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.py`), script, 'utf-8');

    const runId = randomUUID();
    const runnerPath = join(tmpdir(), `ava-blender-runner-${runId}.py`);
    const jobPath = join(tmpdir(), `ava-blender-job-${runId}.json`);
    await writeFile(runnerPath, BLENDER_RUNNER_PY, 'utf-8');
    await writeFile(jobPath, JSON.stringify({ assetDir, name: slug, continue: continuing, fbx: args.fbx === true }), 'utf-8');

    const timeoutS = Math.min(MAX_TIMEOUT_S, Math.max(30, Number(args.timeout_seconds) || DEFAULT_TIMEOUT_S));
    const blenderArgs = [
      '-b', ...(continuing ? [blendPath] : []),
      '--factory-startup', '--disable-autoexec',
      '--python', runnerPath, '--', jobPath,
    ];

    let run;
    try {
      run = await runBlender(blender.path, blenderArgs, assetDir, timeoutS * 1000, context.signal);
    } finally {
      await rm(runnerPath, { force: true }).catch(() => {});
      await rm(jobPath, { force: true }).catch(() => {});
    }

    if (run.aborted) return { success: false, output: 'Stopped before Blender finished. Nothing new was saved.' };
    if (run.timedOut) {
      return {
        success: false,
        output: `Blender was stopped after ${timeoutS}s and nothing new was saved. Make the step smaller, lower render samples, or raise timeout_seconds if it is a heavy bake.`,
      };
    }

    const marker = run.stdout.lastIndexOf('@@AVA_RESULT@@');
    if (marker < 0) {
      const tail = (run.stderr || run.stdout).split(/\r?\n/).slice(-25).join('\n');
      return { success: false, output: `Blender closed without finishing the run, so nothing new was saved. Its last output:\n${tail}` };
    }
    let result: RunnerResult;
    try {
      result = JSON.parse(run.stdout.slice(marker + '@@AVA_RESULT@@'.length).split(/\r?\n/)[0]);
    } catch {
      return { success: false, output: 'Blender finished, but its report could not be read. Nothing was changed by the tool.' };
    }

    const printed = scriptOutput(run.stdout);
    if (!result.ok) {
      return {
        success: false,
        output:
          `Your script stopped with an error in Blender ${blender.version}. Nothing was saved — "${name}" is exactly as it was before this run.\n\n` +
          `${(result.error ?? '').trim()}` +
          (printed ? `\n\nWhat the script printed:\n${printed}` : '') +
          '\n\nFix it and run the step again.',
      };
    }

    await upsertLibraryEntry({
      slug, name, description: typeof args.description === 'string' ? args.description : undefined,
      files: result.files, blenderVersion: blender.version, triangles: result.triangles, sizeM: result.size_m,
    }).catch(() => { /* the model is saved either way; the Library catches up on the next run */ });

    const how = continuing ? 'on top of the saved model' : hadModel ? 'on a new canvas (the previous version is in versions/)' : 'from an empty scene';
    const lines = [
      `Built "${name}" ${how} in ${result.seconds ?? '?'}s with Blender ${blender.version}.`,
      `${result.objects ?? 0} mesh objects, ${result.triangles ?? 0} triangles, overall size ${fmtSize(result.size_m)} (X × Y × Z, Z is up).`,
      `Files in ${assetDir}: ${result.files.join(', ')}.`,
    ];
    if (result.warnings?.length) lines.push(`Warnings: ${result.warnings.join(' ')}`);
    if (printed) lines.push(`What the script printed:\n${printed}`);

    let previewB64: string | undefined;
    if (result.files.includes('preview.png')) {
      try { previewB64 = (await readFile(join(assetDir, 'preview.png'))).toString('base64'); } catch { /* none */ }
    }
    lines.push(`The agreed brief:
${formatModelBrief(brief)}`);
    lines.push(previewB64
      ? 'LOOK at the preview now and check it against the brief — shape, proportions, true scale, detail, condition. Say plainly what is off and fix it in the next step; the next run opens this saved model, so write only the change.'
      : 'There is no preview image this time — say so rather than describing what you think it looks like.');

    return {
      success: true,
      output: lines.join('\n'),
      metadata: {
        model: slug, folder: assetDir, files: result.files, triangles: result.triangles, sizeM: result.size_m,
        blenderVersion: blender.version,
        ...(previewB64 ? { base64_image: previewB64, mime_type: 'image/png' } : {}),
      },
    };
  }
}

// ── design_duplicate_model ───────────────────────────────────────────────────

export class DesignDuplicateModelTool implements Tool {
  readonly name = 'design_duplicate_model';
  readonly description =
    'Copy a 3D model to a new name, so an idea can be tried on the copy while the original stays untouched.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'design_duplicate_model',
    description:
      'Duplicate a model made with design_build_model under a new name — for trying something without touching the original. ' +
      'Then build on the copy by calling design_build_model with the NEW name.',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'The existing model\'s name.' },
        to: { type: 'string', description: 'The new model\'s name, e.g. "Worn Supply Crate — burnt".' },
      },
      required: ['from', 'to'],
    },
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const fromName = String(args.from ?? '').trim();
    const toName = String(args.to ?? '').trim();
    const from = modelSlug(fromName);
    const to = modelSlug(toName);
    if (!from || !to) return { success: false, output: 'Give both names: `from` (the existing model) and `to` (the new one).' };
    if (from === to) return { success: false, output: 'The new name must be different from the original.' };
    const src = join(modelsDir(), from);
    const dst = join(modelsDir(), to);
    if (!existsSync(join(src, `${from}.blend`))) return { success: false, output: `There is no saved model called "${fromName}".` };
    if (existsSync(dst)) return { success: false, output: `A model called "${toName}" already exists. Pick another name.` };

    // The model as it stands now — not its history, which belongs to the original.
    await cp(src, dst, { recursive: true, filter: (p) => !/[\\/](versions|scripts)([\\/]|$)/.test(p.slice(src.length)) });
    for (const ext of ['blend', 'glb', 'fbx']) {
      if (existsSync(join(dst, `${from}.${ext}`))) await rename(join(dst, `${from}.${ext}`), join(dst, `${to}.${ext}`));
    }
    // The copy carries the original's brief (and its agreement) under its own name.
    const brief = await readModelBrief(to);
    if (brief) {
      brief.name = toName;
      await writeFile(join(dst, 'brief.json'), JSON.stringify(brief, null, 2), 'utf-8');
    }
    const files = (await readdir(dst, { withFileTypes: true })).filter((e) => e.isFile() && e.name !== 'brief.json').map((e) => e.name);

    let original: Record<string, unknown> | undefined;
    try {
      const items = JSON.parse(await readFile(metadataFile(), 'utf-8')) as Array<Record<string, unknown>>;
      original = items.find((i) => i.id === `model_${from}`);
    } catch { /* no library yet */ }
    await upsertLibraryEntry({
      slug: to, name: toName, description: original?.prompt as string | undefined, files,
      blenderVersion: (original?.blenderVersion as string | undefined) ?? '',
      triangles: original?.triangles as number | undefined, sizeM: original?.sizeM as number[] | undefined,
    }).catch(() => {});

    return {
      success: true,
      output: `Copied "${fromName}" to "${toName}". The original is untouched. Build on the copy with design_build_model, name "${toName}".`,
      metadata: { model: to, folder: dst },
    };
  }
}
