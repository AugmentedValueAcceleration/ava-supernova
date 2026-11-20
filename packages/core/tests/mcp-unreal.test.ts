// Unreal Engine's MCP server (plan 2026-11-18-unreal, Phase 1), against a
// pretend Unreal (fixtures/fake-unreal-mcp.mjs) shaped like his 5.9 editor.
// His decision 18 Nov: Unreal's READ tools run without asking; WRITE and
// EXECUTE ask, with "always allow" per Unreal tool.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  McpServers, syncMcpTools, setMcpKeychain, parseToolsetNames, unrealInnerTool, unrealVersionOk, MCP_SUGGESTIONS, mcpToolNeedsAsking,
  ALL_MCP_SUGGESTIONS, UNREAL_RELEASED, suggestionFor,
} from '../src/mcp/index.js';
import { mcpPage } from '../src/mcp/page.js';
import { unrealPromptSection, unrealToolNames } from '../src/mcp/unreal-context.js';
import { unrealEditorInfo } from '../src/mcp/unreal.js';
import { uprojectFromCommandLine, engineVersionOf } from '../src/mcp/unreal-local.js';
import { getWorkTalkPrefix, getWorkModePrefix, getPlanModePrefix } from '../src/agent/system-prompt.js';
import { ToolRegistry } from '../src/tools/tool-registry.js';
import { toolPassesModeGate } from '../src/agent/agent.js';

const FAKE = join(__dirname, 'fixtures', 'fake-unreal-mcp.mjs');
const node = process.execPath;
const CALL = 'mcp_unreal_call_tool';

let dir: string;

function writeConfig(o: unknown) {
  writeFileSync(join(dir, 'mcp.json'), JSON.stringify(o, null, 2));
}

async function settled(m = McpServers.current()) {
  for (let i = 0; i < 200; i++) {
    if (!m.status().some((s) => s.state === 'connecting')) return m.status();
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('servers never settled: ' + JSON.stringify(m.status()));
}

async function startUnreal(extra: string[] = []) {
  writeConfig({ mcpServers: { unreal: { command: node, args: [FAKE, ...extra] } } });
  const m = McpServers.current();
  await m.start(null);
  const [s] = await settled();
  const reg = new ToolRegistry();
  syncMcpTools(reg);
  return { m, s, reg };
}

const call = (toolset: string, tool: string) => ({ toolset_name: toolset, tool_name: tool, arguments: {} });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ava-unreal-'));
  process.env.AVA_MCP_CONFIG = join(dir, 'mcp.json');
  let blob: string | null = null;
  setMcpKeychain({ read: async () => blob, write: async (v) => { blob = v; } });
  McpServers.reset();
});

afterEach(async () => {
  await McpServers.current().stopAll();
  McpServers.reset();
  delete process.env.AVA_MCP_CONFIG;
  rmSync(dir, { recursive: true, force: true });
});

describe('knowing it is Unreal', () => {
  it('reads every Unreal tool\'s label when it connects', async () => {
    const { s } = await startUnreal();
    expect(s.state).toBe('ready');
    expect(s.unreal).toEqual({ tools: 7, toolsetsOff: false, labelled: true, assistantPanel: true, allowed: [], asked: [] });
    expect(s.tools.map((t) => t.avaName).sort()).toEqual([CALL, 'mcp_unreal_describe_tools', 'mcp_unreal_describe_toolsets', 'mcp_unreal_list_toolsets']);
  });

  it('says when the project\'s toolsets are switched off, and Ava is told how to fix it', async () => {
    const { s, reg } = await startUnreal(['--off']);
    expect(s.unreal?.toolsetsOff).toBe(true);
    expect(reg.getTool('mcp_unreal_list_toolsets')!.description).toContain('All Toolsets');
  });

  it("only Unreal 5.8 and later: an older editor isn't connected, and says why", async () => {
    const { s } = await startUnreal(['--version', '5.7.4-12345']);
    expect(s).toMatchObject({ state: 'error', reason: 'unreal-old' });
    expect(s.message).toContain('older than 5.8');
    expect(McpServers.current().tools()).toEqual([]);
  });

  it("reads Unreal's version the way it reports it", () => {
    expect(unrealVersionOk('5.9.0-60351404')).toBe(true);
    expect(unrealVersionOk('5.10.1')).toBe(true);
    expect(unrealVersionOk('6.0.0')).toBe(true);
    expect(unrealVersionOk('5.8.2-123')).toBe(true);
    expect(unrealVersionOk('5.7.4-123')).toBe(false);
    expect(unrealVersionOk('4.27.2')).toBe(false);
    expect(unrealVersionOk('')).toBe(true); // can't read it: the name already says it's Unreal
  });

  it('is offered in Suggested since its 5.8 release, and pointed at our own setup guide', () => {
    expect(UNREAL_RELEASED).toBe(true);
    expect(MCP_SUGGESTIONS.find((x) => x.id === 'unreal')).toMatchObject({ name: 'Unreal MCP', docs: 'https://avasupernova.com/guides/unreal-mcp-setup' });
    expect(ALL_MCP_SUGGESTIONS.find((x) => x.id === 'unreal')).toMatchObject({ kind: 'local', url: 'http://127.0.0.1:8000/mcp', publisher: 'Epic Games' });
    expect(suggestionFor('http://127.0.0.1:8000/mcp')).toMatchObject({ id: 'unreal', kind: 'local' });
  });
});

// His 5.8 editor (20 Nov 2026): blank name and version, three meta-tools,
// describe_toolset one at a time, 5.8's toolset names, and no labels at all.
describe('Unreal 5.8', () => {
  it('is known as Unreal by its tools, though it gives no name', async () => {
    const { s } = await startUnreal(['--58']);
    expect(s.state).toBe('ready');
    // Every tool counted, though none is labelled (the page said "0 Unreal tools", 20 Nov).
    expect(s.unreal).toMatchObject({ tools: 5, toolsetsOff: false, labelled: false, assistantPanel: false });
    expect(s.tools.map((t) => t.avaName).sort()).toEqual([CALL, 'mcp_unreal_describe_toolset', 'mcp_unreal_list_toolsets']);
  });

  // 20 Nov: the page said connected, Ava said "Unknown tool". The extension and
  // the IDE read the tools when "ready" is announced, and the server wasn't
  // running yet at that moment. 5.9 hid it with a later "tools changed".
  for (const flag of [[], ['--58']]) {
    it(`its tools reach Ava when "ready" is announced${flag.length ? ' (5.8)' : ''}`, async () => {
      writeConfig({ mcpServers: { unreal: { command: node, args: [FAKE, ...flag] } } });
      const m = McpServers.current();
      const reg = new ToolRegistry();
      m.onChange(() => { syncMcpTools(reg); });
      await m.start(null);
      await settled();
      expect(reg.getTool('mcp_unreal_list_toolsets')).toBeDefined();
      expect(reg.getTool(CALL)).toBeDefined();
    });
  }

  it('its discovery tools only look; every Unreal tool asks, since 5.8 labels none', async () => {
    const { reg } = await startUnreal(['--58']);
    expect(reg.needsConfirmation(reg.getTool('mcp_unreal_list_toolsets')!, {})).toBe(false);
    expect(reg.needsConfirmation(reg.getTool('mcp_unreal_describe_toolset')!, { toolset_name: 'x' })).toBe(false);
    const t = reg.getTool(CALL)!;
    expect(reg.needsConfirmation(t, call('editor_toolset.toolsets.scene.SceneTools', 'get_current_level'))).toBe(true);
    expect(reg.needsConfirmation(t, call('editor_toolset.toolsets.scene.SceneTools', 'add_to_scene_from_asset'))).toBe(true);
  });

  it('Ava is given 5.8\'s own tools and guidance, and told every tool asks', async () => {
    await startUnreal(['--58']);
    const section = unrealPromptSection('build');
    expect(section).toContain('mcp_unreal_describe_toolset');
    expect(section).not.toContain('mcp_unreal_describe_toolsets');
    expect(section).toContain('Working in Unreal 5.8');
    expect(section).not.toContain('PythonScriptingTools');
    expect(section).toContain("doesn't mark which of its tools only look");
    expect(unrealToolNames()).toBe(', mcp_unreal_list_toolsets, mcp_unreal_describe_toolset, mcp_unreal_call_tool');
  });

  it('finds the project from the editor\'s command line, relative to the editor', () => {
    const exe = 'C:\\Program Files\\Epic Games\\UE_5.8\\Engine\\Binaries\\Win64\\UnrealEditor.exe';
    const p = uprojectFromCommandLine(`"${exe}" "../../../../../../Users/me/.ava/projects/DawnSets/DawnSets.uproject"`, exe)!;
    expect(p.replace(/\\/g, '/')).toMatch(/\/Users\/me\/\.ava\/projects\/DawnSets\/DawnSets\.uproject$/);
    expect(uprojectFromCommandLine('UnrealEditor /home/me/Game/Game.uproject -log')).toBe('/home/me/Game/Game.uproject');
    expect(uprojectFromCommandLine('UnrealEditor -log')).toBeUndefined();
    expect(engineVersionOf(undefined, exe)).toBe('5.8');
  });
});

// His call, 20 Nov: in the VS Code extension a picture from Unreal asks every
// time — even a capture Unreal calls read-only, and with no "always".
describe('capture tools in the extension', () => {
  it('ask every time, refuse "always", and stay out of Plan and the allowed list', async () => {
    const { m } = await startUnreal(['--capture']);
    m.setCaptureAlwaysAsks(true);
    const reg = new ToolRegistry();
    syncMcpTools(reg);
    const t = reg.getTool(CALL)!;
    const cap = call('EditorToolset.EditorAppToolset', 'CaptureEditorImage');
    expect(reg.needsConfirmation(t, cap)).toBe(true);
    // A plain read still runs straight away.
    expect(reg.needsConfirmation(t, call('EditorToolset.ActorToolset', 'ListActors'))).toBe(false);
    expect(await m.allowTool(CALL, true, cap)).toBe(false);
    expect(toolPassesModeGate(CALL, new Set(), 'plan', cap)).toBe(false);
    await m.noteAllowedOnce(CALL, cap);
    await settled();
    expect(m.status()[0].unreal?.asked ?? []).not.toContain('EditorToolset.EditorAppToolset.CaptureEditorImage');
    expect(unrealPromptSection('build')).toContain('every picture from Unreal');
  });

  it('in the IDE (the rule off) a read-only capture runs as its label says', async () => {
    const { reg } = await startUnreal(['--capture']);
    expect(reg.needsConfirmation(reg.getTool(CALL)!, call('EditorToolset.EditorAppToolset', 'CaptureEditorImage'))).toBe(false);
  });
});

describe('asking first, by Unreal\'s own labels', () => {
  it('read runs straight away; write and execute ask; a tool it doesn\'t know asks', async () => {
    const { reg } = await startUnreal();
    const t = reg.getTool(CALL)!;
    expect(reg.needsConfirmation(t, call('EditorToolset.ActorToolset', 'ListActors'))).toBe(false);
    expect(reg.needsConfirmation(t, call('EditorToolset.ActorToolset', 'SpawnActor'))).toBe(true);
    expect(reg.needsConfirmation(t, call('EditorToolset.EditorAppToolset', 'StartPIE'))).toBe(true);
    expect(reg.needsConfirmation(t, call('Made.Up', 'Thing'))).toBe(true);
    // No args at all (nothing named): asks.
    expect(reg.needsConfirmation(t)).toBe(true);
  });

  it('Unreal\'s discovery tools only look, so they don\'t ask', async () => {
    const { reg } = await startUnreal();
    expect(reg.needsConfirmation(reg.getTool('mcp_unreal_list_toolsets')!, {})).toBe(false);
    expect(reg.needsConfirmation(reg.getTool('mcp_unreal_describe_toolsets')!, { toolset_names: ['x'] })).toBe(false);
    // …and through call_tool too.
    expect(reg.needsConfirmation(reg.getTool(CALL)!, { tool_name: 'list_toolsets' })).toBe(false);
  });

  it('"always allow" is for the one Unreal tool, never for call_tool itself', async () => {
    const { m } = await startUnreal();
    expect(await m.allowTool(CALL, true)).toBe(false); // nothing named: refused
    expect(await m.allowTool(CALL, true, call('EditorToolset.ActorToolset', 'SpawnActor'))).toBe(true);
    await settled();
    const reg = new ToolRegistry();
    syncMcpTools(reg);
    const t = reg.getTool(CALL)!;
    expect(reg.needsConfirmation(t, call('EditorToolset.ActorToolset', 'SpawnActor'))).toBe(false);
    expect(reg.needsConfirmation(t, call('EditorToolset.ActorToolset', 'DeleteActor'))).toBe(true);
    const file = JSON.parse(readFileSync(join(dir, 'mcp.json'), 'utf8'));
    expect(file.mcpServers.unreal.allow).toEqual(['call_tool:EditorToolset.ActorToolset.SpawnActor']);
    expect(m.status()[0].unreal?.allowed).toEqual(['EditorToolset.ActorToolset.SpawnActor']);
  });

  it('an old "always" on call_tool itself doesn\'t open every Unreal tool', async () => {
    writeConfig({ mcpServers: { unreal: { command: node, args: [FAKE], allow: ['call_tool'] } } });
    await McpServers.current().start(null);
    await settled();
    const reg = new ToolRegistry();
    syncMcpTools(reg);
    expect(reg.needsConfirmation(reg.getTool(CALL)!, call('EditorToolset.ActorToolset', 'DeleteActor'))).toBe(true);
  });

  it('the Connections page can take "always" back for one Unreal tool', async () => {
    const { m } = await startUnreal();
    await m.allowTool(CALL, true, call('EditorToolset.ActorToolset', 'SpawnActor'));
    await settled();
    await mcpPage('allow', { avaName: CALL, on: false, inner: 'EditorToolset.ActorToolset.SpawnActor' });
    await settled();
    expect(m.status()[0].unreal?.allowed).toEqual([]);
  });

  // Unreal's panel has only Allow Once (Phase 0): what he allows there is
  // offered for "Always allow" on the Connections page (his call, 18 Nov).
  it("a tool allowed once in Unreal's panel is offered for always; a look-only tool never is", async () => {
    const { m } = await startUnreal();
    await m.noteAllowedOnce(CALL, call('EditorToolset.ActorToolset', 'SpawnActor'));
    await m.noteAllowedOnce(CALL, call('EditorToolset.ActorToolset', 'ListActors'));
    await m.noteAllowedOnce(CALL, call('EditorToolset.EditorAppToolset', 'StartPIE'));
    await settled();
    expect(m.status()[0].unreal?.asked).toEqual(['EditorToolset.EditorAppToolset.StartPIE', 'EditorToolset.ActorToolset.SpawnActor']);
    await mcpPage('allow', { avaName: CALL, on: true, inner: 'EditorToolset.ActorToolset.SpawnActor' });
    await settled();
    expect(m.status()[0].unreal?.allowed).toEqual(['EditorToolset.ActorToolset.SpawnActor']);
    expect(m.status()[0].unreal?.asked).toEqual(['EditorToolset.EditorAppToolset.StartPIE']);
  });
});

describe('modes', () => {
  it('Plan is offered call_tool, and only Unreal\'s read tools run there', async () => {
    await startUnreal();
    const none = new Set<string>();
    expect(toolPassesModeGate(CALL, none, 'plan')).toBe(true);
    expect(toolPassesModeGate(CALL, none, 'plan', call('EditorToolset.ActorToolset', 'ListActors'))).toBe(true);
    expect(toolPassesModeGate(CALL, none, 'plan', call('EditorToolset.ActorToolset', 'SpawnActor'))).toBe(false);
    expect(toolPassesModeGate(CALL, none, 'plan', call('Made.Up', 'Thing'))).toBe(false);
    expect(toolPassesModeGate('mcp_unreal_list_toolsets', none, 'plan')).toBe(true);
    // Code gets everything (each call still asks by its label); a room gets nothing.
    expect(toolPassesModeGate(CALL, none, 'work', call('EditorToolset.ActorToolset', 'SpawnActor'))).toBe(true);
    expect(toolPassesModeGate(CALL, none, 'health', call('EditorToolset.ActorToolset', 'ListActors'))).toBe(false);
  });
});

describe("Talk switch (Code mode's conversation-only state)", () => {
  it('looks at Unreal but changes nothing', async () => {
    await startUnreal();
    const none = new Set<string>();
    expect(toolPassesModeGate(CALL, none, 'work:talking')).toBe(true);
    expect(toolPassesModeGate(CALL, none, 'work:talking', call('EditorToolset.LevelToolset', 'GetCurrentLevel'))).toBe(true);
    expect(toolPassesModeGate(CALL, none, 'work:talking', call('EditorToolset.ActorToolset', 'SpawnActor'))).toBe(false);
  });
});

describe('Ava is told the editor is there', () => {
  it("Code, Talk and Plan name Unreal's live tools and say to ask the editor, not the files", async () => {
    await startUnreal();
    const build = unrealPromptSection('build');
    expect(build).toContain('## Unreal Editor');
    expect(build).toContain('mcp_unreal_call_tool');
    expect(build).toContain('Never work it out from files');
    expect(unrealPromptSection('talk')).toContain('waits for the Build switch');
    expect(unrealPromptSection('plan')).toContain('waits for Code mode');
    expect(getWorkTalkPrefix('hi')).toContain('mcp_unreal_list_toolsets');
  });

  // Phase 3: how work in Unreal goes, read from his 5.9 editor — only while an editor is open.
  it("tells her how this editor works: its own context, Epic's skills, Python's read_me, Live Coding, seeing her work", async () => {
    await startUnreal();
    const k = unrealPromptSection('build');
    for (const s of ['### Working in Unreal', 'GetProjectContext', 'AgentSkillToolset.ListSkills', 'read_me', 'CompileLiveCoding', 'CaptureGameViewport', 'GetLogEntries', '/Temp']) expect(k).toContain(s);
  });

  // 18 Nov, second live test: the section came after Talk's "What you can do"
  // list, the model followed the list and read the .uproject instead.
  it("Unreal's tools are IN each mode's own list, and the section comes before the how-to", async () => {
    await startUnreal();
    const talk = getWorkTalkPrefix('hi');
    const canDo = talk.slice(talk.indexOf('## What you can do'), talk.indexOf('Nothing that changes'));
    expect(canDo).toContain('look at the live Unreal Editor (mcp_unreal_list_toolsets');
    expect(talk.indexOf('## Unreal Editor')).toBeLessThan(talk.indexOf('## How to be useful here'));
    const build = getWorkModePrefix('hi');
    expect(build).toMatch(/switch_mode, mcp_unreal_list_toolsets, [^\n]*mcp_unreal_call_tool\./);
    expect(build.indexOf('## Unreal Editor')).toBeLessThan(build.indexOf('## Documents'));
    const plan = getPlanModePrefix('hi');
    expect(plan).toMatch(/switch_mode, mcp_unreal_list_toolsets, [^\n]*mcp_unreal_call_tool\./);
    expect(plan.indexOf('## Unreal Editor')).toBeLessThan(plan.indexOf('## Process'));
  });

  it('says nothing when no Unreal is set up — the mode lists are as they were', () => {
    expect(unrealPromptSection('build')).toBe('');
    expect(unrealToolNames()).toBe('');
    expect(getWorkTalkPrefix('hi')).toContain('(brainstorm_plan), and present a plan.');
    expect(getWorkModePrefix('hi')).toContain('switch_mode.\n\n## Documents');
    expect(getPlanModePrefix('hi')).toContain('switch_mode.\n\n## Process');
  });

  it("reads the open project from the editor's hello", () => {
    expect(unrealEditorInfo({ serverInfo: {}, _meta: { 'com.epicgames.unrealengine/instance': {
      projectName: 'UnrealTestProject59', projectDirectory: 'C:/Users/x/UnrealTestProject59/', engineVersion: '5.9.0-1' } } }))
      .toEqual({ project: 'UnrealTestProject59', projectDir: 'C:/Users/x/UnrealTestProject59/', engineVersion: '5.9.0-1' });
    expect(unrealEditorInfo({ serverInfo: {} })).toBeUndefined();
  });
});

describe('one call at a time', () => {
  it('calls sent together run one after another', async () => {
    const { reg } = await startUnreal();
    const t = reg.getTool(CALL)!;
    const ctx = { workingDirectory: dir } as never;
    const results = await Promise.all([1, 2, 3].map(() => t.execute(call('Test.SlowToolset', 'Wait'), ctx)));
    for (const r of results) expect(r.output).toContain('most at once: 1');
  });
});

describe('reading what Unreal says', () => {
  it('finds toolset names in list_toolsets\' text, not description lines', () => {
    const text = '- EditorToolset.ActorToolset: Actors.\n- Graph\n- Topology and Summary\n- state_tree_toolset.state_tree.StateTreeToolset: Trees.\n  - nested: no';
    expect(parseToolsetNames(text)).toEqual(['EditorToolset.ActorToolset', 'state_tree_toolset.state_tree.StateTreeToolset']);
  });

  it('names the inner tool the way Unreal does', () => {
    expect(unrealInnerTool({ toolset_name: 'EditorToolset.ActorToolset', tool_name: 'SpawnActor' })).toBe('EditorToolset.ActorToolset.SpawnActor');
    expect(unrealInnerTool({ tool_name: 'list_toolsets' })).toBe('list_toolsets');
    expect(unrealInnerTool({})).toBeUndefined();
    expect(unrealInnerTool(undefined)).toBeUndefined();
  });

  // 19 Nov: his allow list held "LevelToolset.EditorToolset.LevelToolset.GetCurrentLevel"
  // and a bare "DescribeMode" — matched nothing, and look-only tools asked.
  it("one name per Unreal tool: a full name with its toolset isn't doubled, a bare name is found", async () => {
    expect(unrealInnerTool({ toolset_name: 'EditorToolset.LevelToolset', tool_name: 'EditorToolset.LevelToolset.GetCurrentLevel' })).toBe('EditorToolset.LevelToolset.GetCurrentLevel');
    const { m } = await startUnreal();
    // A look-only tool named either way runs without asking.
    expect(mcpToolNeedsAsking(CALL, { toolset_name: 'EditorToolset.LevelToolset', tool_name: 'EditorToolset.LevelToolset.GetCurrentLevel', arguments: {} })).toBe(false);
    expect(mcpToolNeedsAsking(CALL, { tool_name: 'GetCurrentLevel', arguments: {} })).toBe(false);
    // "Always" given with a bare name is stored under the full name.
    await m.allowTool(CALL, true, { tool_name: 'SpawnActor', arguments: {} });
    await settled();
    expect(m.status()[0].unreal?.allowed).toEqual(['EditorToolset.ActorToolset.SpawnActor']);
  });

  it('a doubled name already in his list counts as the tool it meant, and "Ask me again" removes it', async () => {
    writeConfig({ mcpServers: { unreal: { command: node, args: [FAKE], allow: ['call_tool:EditorToolset.ActorToolset.EditorToolset.ActorToolset.SpawnActor'] } } });
    const m = McpServers.current();
    await m.start(null);
    await settled();
    expect(m.status()[0].unreal?.allowed).toEqual(['EditorToolset.ActorToolset.SpawnActor']);
    expect(mcpToolNeedsAsking(CALL, call('EditorToolset.ActorToolset', 'SpawnActor'))).toBe(false);
    await mcpPage('allow', { avaName: CALL, on: false, inner: 'EditorToolset.ActorToolset.SpawnActor' });
    await settled();
    expect(m.status()[0].unreal?.allowed).toEqual([]);
    expect(mcpToolNeedsAsking(CALL, call('EditorToolset.ActorToolset', 'SpawnActor'))).toBe(true);
  });
});
