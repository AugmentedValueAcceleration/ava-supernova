// Blender Live (Phase 2) against a stand-in for Blender Lab's MCP server with
// the real tool names. Plan: Decisions/plans/2026-11-16-blender-mcp.md.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpConnection } from '../src/mcp/connection.js';
import { BlenderLive, installedServer, versionAtLeast } from '../src/tools/blender/live.js';
import { blenderLiveTools, DesignLiveStepTool, DesignLiveOpenModelTool } from '../src/tools/blender/live-tools.js';

const FAKE = join(__dirname, 'fixtures', 'fake-blender-mcp.mjs');
let dir: string;

function useFake(version = '5.3.0') {
  const live = BlenderLive.current();
  live.launch = (env) => McpConnection.open({
    id: 'blender_live', name: 'Blender',
    transport: { kind: 'program', command: process.execPath, args: [FAKE], env: { ...env, FAKE_BLENDER_VERSION: version } },
  });
  return live;
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ava-live-'));
  process.env.AVA_CREATIVE_DIR = join(dir, 'creative');
  process.env.AVA_BLENDER_MCP_DIR = join(dir, 'mcp', 'blender');
});
afterEach(async () => {
  const live = BlenderLive.current();
  await live.disconnect();
  live.launch = undefined;
  delete process.env.AVA_CREATIVE_DIR;
  delete process.env.AVA_BLENDER_MCP_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe('versions', () => {
  it('compares Blender versions', () => {
    expect(versionAtLeast('5.3.0', '5.1.0')).toBe(true);
    expect(versionAtLeast('5.1.0', '5.1.0')).toBe(true);
    expect(versionAtLeast('5.0.4', '5.1.0')).toBe(false);
    expect(versionAtLeast('10.0', '5.1.0')).toBe(true);
  });
});

describe('finding the server bundle', () => {
  it('picks the newest unpacked bundle with Blender\'s manifest', async () => {
    for (const v of ['1.0.2', '1.0.3']) {
      await mkdir(join(dir, 'mcp', 'blender', v), { recursive: true });
      await writeFile(join(dir, 'mcp', 'blender', v, 'manifest.json'), JSON.stringify({ version: v, server: { type: 'uv' } }));
    }
    await mkdir(join(dir, 'mcp', 'blender', 'junk'), { recursive: true });
    expect((await installedServer())?.version).toBe('1.0.3');
  });

  it('is none when nothing is installed', async () => {
    expect(await installedServer()).toBeNull();
  });
});

describe('the connection', () => {
  it('connects and reports the open Blender', async () => {
    const live = useFake();
    const seen: string[] = [];
    live.onChange((s) => seen.push(s.state));
    const s = await live.connect();
    expect(s.state).toBe('ready');
    expect(s.blenderVersion).toBe('5.3.0');
    expect(s.message).toBe('Connected to Blender 5.3.0 · ready');
    expect(seen).toContain('ready');
  }, 20_000);

  it('says plainly when the open Blender is too old for Live', async () => {
    const s = await useFake('5.0.1').connect();
    expect(s.state).toBe('error');
    expect(s.message).toMatch(/needs 5\.1\.0 or newer/);
  }, 20_000);

  it('switching off goes back to headless', async () => {
    const live = useFake();
    await live.connect();
    expect((await live.disconnect()).state).toBe('off');
    expect(live.connection).toBeNull();
    expect(blenderLiveTools()).toEqual([]);
  }, 20_000);
});

describe('what Ava gets while Live is on', () => {
  it('our four tools plus Blender\'s — no background ones, raw code, image screenshots or render-to-path', async () => {
    await useFake().connect();
    const names = blenderLiveTools().map((t) => t.name);
    expect(names.slice(0, 4)).toEqual(['design_live_open_model', 'design_live_step', 'design_live_look', 'design_live_save']);
    expect(names).toContain('blender_live_get_objects_summary');
    expect(names.some((n) => n.endsWith('_for_cli'))).toBe(false);
    expect(names).not.toContain('blender_live_execute_blender_code');
    expect(names).not.toContain('blender_live_get_screenshot_of_area_as_image');
    expect(names.some((n) => n.startsWith('blender_live_render_'))).toBe(false);
  }, 20_000);

  it('reading and moving the view are free; a step asks', async () => {
    await useFake().connect();
    const byName = Object.fromEntries(blenderLiveTools().map((t) => [t.name, t]));
    expect(byName.blender_live_get_objects_summary.requiresConfirmation).toBe(false);
    expect(byName.blender_live_jump_to_view3d_object_by_name.requiresConfirmation).toBe(false);
    expect(byName.design_live_look.requiresConfirmation).toBe(false);
    expect(byName.design_live_step.requiresConfirmation).toBe(true);
  }, 20_000);
});

describe('the rules carry over from Headless', () => {
  it('no step without an open model', async () => {
    await useFake().connect();
    const r = await new DesignLiveStepTool().execute({ script: 'import bpy' }, { cwd: '.' });
    expect(r.output).toMatch(/Open one with design_live_open_model/);
  }, 20_000);

  it('no model opened without an agreed brief', async () => {
    await useFake().connect();
    const r = await new DesignLiveOpenModelTool().execute({ name: 'Worn Crate' }, { cwd: '.' });
    expect(r.success).toBe(false);
    expect(r.output).toMatch(/no brief yet/);
  }, 20_000);

  it('Live uses the same script check as Headless', async () => {
    const { checkBlenderScript } = await import('../src/tools/blender/build-model.js');
    expect(checkBlenderScript('import subprocess')).toMatch(/starts other programs/);
    expect(checkBlenderScript('import bpy\nbpy.ops.mesh.primitive_cube_add()')).toBeNull();
  });

  it('when Live is off, the tools say so instead of failing', async () => {
    const r = await new DesignLiveOpenModelTool().execute({ name: 'Worn Crate' }, { cwd: '.' });
    expect(r.success).toBe(false);
  });
});
