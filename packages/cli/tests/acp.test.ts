/**
 * Ava in Unreal's Assistant panel (plan 2026-11-18-unreal, Phase 2): the real
 * program, driven the way Unreal drives it (Phase 0's recorded messages),
 * against a pretend editor and a pretend model. Nothing reaches his keys: the
 * keychain is off (AVA_TEST_NO_KEYCHAIN), Ava's home is a temp folder, and
 * the only model is the fake one below — checked before any message is sent.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

const CLI = resolve(__dirname, '..');
const FAKE_UNREAL = resolve(CLI, '../core/tests/fixtures/fake-unreal-mcp.mjs');
const UNREAL_NOTES = 'You are running inside the assistant panel of the Unreal Editor. The user reads your replies in that panel.';

// ── The pretend model ───────────────────────────────────────────────────────
// It answers by the last message: a tool result → "Done."; "spawn" → Unreal's
// SpawnActor (write); "list" → ListActors (read). Every request is kept.
const requests: Array<{ messages: Array<{ role: string; content: unknown }>; tools?: Array<{ function: { name: string } }> }> = [];
const textOf = (c: unknown) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((p) => (p as { text?: string }).text ?? '').join(' ') : '');

function sse(res: import('node:http').ServerResponse, chunks: unknown[]) {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const c of chunks) res.write(`data: ${JSON.stringify(c)}\n\n`);
  res.end('data: [DONE]\n\n');
}
const delta = (d: unknown, finish: string | null = null) => ({ id: 'x', object: 'chat.completion.chunk', choices: [{ index: 0, delta: d, finish_reason: finish }] });

function fakeModel(): Server {
  let n = 0;
  return createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    if (req.url?.endsWith('/models')) { res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ data: [{ id: 'fake' }] })); return; }
    const r = JSON.parse(body || '{}');
    requests.push(r);
    const last = r.messages?.[r.messages.length - 1];
    if (!r.stream) {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }] }));
      return;
    }
    if (last?.role === 'tool') { sse(res, [delta({ role: 'assistant', content: 'Done.' }), delta({}, 'stop')]); return; }
    const said = textOf(last?.content).toLowerCase();
    const tool = said.includes('spawn') ? 'SpawnActor' : said.includes('list') ? 'ListActors' : null;
    if (!tool) { sse(res, [delta({ role: 'assistant', content: 'Hello.' }), delta({}, 'stop')]); return; }
    const args = JSON.stringify({ toolset_name: 'EditorToolset.ActorToolset', tool_name: tool, arguments: {} });
    sse(res, [
      delta({ role: 'assistant', tool_calls: [{ index: 0, id: `call_${++n}`, type: 'function', function: { name: 'mcp_unreal_call_tool', arguments: args } }] }),
      delta({}, 'tool_calls'),
    ]);
  });
}

// ── Playing Unreal's side ───────────────────────────────────────────────────

let home: string;
let model: Server;
let unreal: ChildProcess;
let unrealUrl: string;
let ava: ChildProcess;
let nextId = 1;
const answers = new Map<number, (m: Record<string, unknown>) => void>();
const updates: Array<Record<string, unknown>> = [];
const permissionAsks: Array<Record<string, unknown>> = [];
const notJson: string[] = [];
let permissionAnswer = 'allow';

function send(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const id = nextId++;
  ava.stdin!.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  return new Promise((r) => answers.set(id, r));
}

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'ava-panel-'));
  mkdirSync(join(home, '.ava'), { recursive: true });
  mkdirSync(join(home, 'UnrealTestProject'), { recursive: true });

  model = fakeModel();
  await new Promise<void>((r) => model.listen(0, '127.0.0.1', () => r()));
  const modelUrl = `http://127.0.0.1:${(model.address() as { port: number }).port}/v1`;
  writeFileSync(join(home, '.ava', 'settings.json'), JSON.stringify({
    schema_version: 1, chat_model: 'generic:fake',
    local_model: { baseUrl: modelUrl, modelName: 'fake', label: 'Fake', models: ['fake'] },
  }));

  unreal = spawn(process.execPath, [FAKE_UNREAL, '--http', '0'], { cwd: resolve(CLI, '../core') });
  unrealUrl = await new Promise<string>((r) => {
    createInterface({ input: unreal.stdout! }).on('line', (l) => { const m = /^listening (\S+)/.exec(l); if (m) r(m[1]); });
  });

  ava = spawn(process.execPath, ['--import', 'tsx', 'src/acp/main.ts'], {
    cwd: CLI,
    env: { ...process.env, USERPROFILE: home, HOME: home, AVA_MCP_CONFIG: join(home, '.ava', 'mcp.json'), AVA_TEST_NO_KEYCHAIN: '1' },
  });
  createInterface({ input: ava.stdout! }).on('line', (line) => {
    let m: Record<string, unknown>;
    try { m = JSON.parse(line); } catch { notJson.push(line); return; }
    if (m.method === 'session/update') { updates.push((m.params as { update: Record<string, unknown> }).update); return; }
    if (m.method === 'session/request_permission') {
      permissionAsks.push(m.params as Record<string, unknown>);
      ava.stdin!.write(`${JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { outcome: { outcome: 'selected', optionId: permissionAnswer } } })}\n`);
      return;
    }
    if (typeof m.id === 'number') answers.get(m.id)?.(m);
  });
}, 60_000);

afterAll(() => {
  ava?.kill('SIGKILL'); // never close(): that runs the memory tidy-up
  unreal?.kill();
  model?.close();
  try { rmSync(home, { recursive: true, force: true }); } catch { /* Windows may hold a file a moment */ }
});

const textSaid = () => updates.filter((u) => u.sessionUpdate === 'agent_message_chunk').map((u) => (u.content as { text: string }).text).join('');

describe('Ava in Unreal\'s panel', () => {
  let sessionId = '';

  it('introduces herself as Ava, on the protocol Unreal speaks', async () => {
    const r = await send('initialize', { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false } } });
    const result = r.result as Record<string, any>;
    expect(result.protocolVersion).toBe(1);
    expect(result.agentInfo.name).toBe('ava');
    expect(result.agentCapabilities.promptCapabilities.image).toBe(true);
  }, 60_000);

  it('opens a chat on the project, with Unreal added to his Connections and the model he picked', async () => {
    const r = await send('session/new', {
      cwd: `${join(home, 'UnrealTestProject').replace(/\\/g, '/')}/`,
      mcpServers: [{ name: 'unreal-mcp', type: 'http', url: unrealUrl, headers: [] }],
    });
    const result = r.result as Record<string, any>;
    sessionId = result.sessionId;
    expect(sessionId).toBeTruthy();
    expect(result.modes.currentModeId).toBe('code');
    expect(result.modes.availableModes.map((m: { id: string }) => m.id)).toEqual(['code', 'talk', 'plan']);
    const modelOption = result.configOptions.find((o: { id: string }) => o.id === 'model');
    // The guard: only the fake model, or nothing below runs.
    expect(modelOption.currentValue).toBe('generic:fake');
    expect(modelOption.options.map((o: { value: string }) => o.value)).toEqual(['generic:fake']); // no keys: no fleets, only the local model
    const mcp = JSON.parse(readFileSync(join(home, '.ava', 'mcp.json'), 'utf8'));
    expect(mcp.mcpServers.unreal.url).toBe(unrealUrl);
  }, 60_000);

  it('a change in the editor asks first (Allow Once), runs, and her words reach the panel', async () => {
    const r = await send('session/prompt', { sessionId, prompt: [{ type: 'text', text: 'spawn a cube' }, { type: 'text', text: UNREAL_NOTES }] });
    expect((r.result as { stopReason: string }).stopReason).toBe('end_turn');
    expect(permissionAsks).toHaveLength(1);
    expect(String((permissionAsks[0].toolCall as { title: string }).title)).toContain('Spawn Actor');
    const call = updates.find((u) => u.sessionUpdate === 'tool_call');
    expect(call?.title).toBe('Unreal · ActorToolset · SpawnActor');
    expect(updates.find((u) => u.sessionUpdate === 'tool_call_update')?.status).toBe('completed');
    expect(textSaid()).toContain('added Unreal Engine to your Connections');
    expect(textSaid()).toContain('Done.');
    // She was told where she is, with Unreal's own notes, and the message was Code mode's.
    const first = requests.find((q) => q.stream)!;
    expect(textOf(first.messages[0].content)).toContain('inside Unreal Editor');
    expect(textOf(first.messages[0].content)).toContain(UNREAL_NOTES);
    expect(textOf(first.messages[first.messages.length - 1].content)).toContain('[Work Mode]');
    expect(textOf(first.messages[first.messages.length - 1].content)).not.toContain(UNREAL_NOTES);
  }, 60_000);

  it('Deny means it does not run', async () => {
    permissionAnswer = 'deny';
    updates.length = 0;
    await send('session/prompt', { sessionId, prompt: [{ type: 'text', text: 'spawn another' }] });
    permissionAnswer = 'allow';
    expect(permissionAsks).toHaveLength(2);
    expect(updates.find((u) => u.sessionUpdate === 'tool_call_update')?.status).toBe('failed');
  }, 60_000);

  it('looking runs straight away, without asking', async () => {
    updates.length = 0;
    await send('session/prompt', { sessionId, prompt: [{ type: 'text', text: 'list the actors' }] });
    expect(permissionAsks).toHaveLength(2);
    expect(updates.find((u) => u.sessionUpdate === 'tool_call_update')?.status).toBe('completed');
  }, 60_000);

  it('Code · Talk looks but changes nothing: a change is refused, without asking', async () => {
    const r = await send('session/set_config_option', { sessionId, configId: 'mode', value: 'talk' });
    expect((r.result as Record<string, any>).configOptions.find((o: { id: string }) => o.id === 'mode').currentValue).toBe('talk');
    updates.length = 0;
    await send('session/prompt', { sessionId, prompt: [{ type: 'text', text: 'spawn one more' }] });
    const told = requests.filter((q) => q.stream).flatMap((q) => q.messages).filter((m) => m.role === 'tool').map((m) => textOf(m.content)).pop();
    // Refused before it runs (core sends no tool line for a refused call): no prompt, nothing done.
    expect(permissionAsks).toHaveLength(2);
    expect(updates.some((u) => u.sessionUpdate === 'tool_call_update' && u.status === 'completed')).toBe(false);
    expect(told).toContain('the Talk switch is on');
    const last = requests.filter((q) => q.stream).pop()!;
    expect(JSON.stringify(last.messages)).toContain('[Work Mode: Talk]');
  }, 60_000);

  it('never writes anything but protocol on standard output', () => {
    expect(notJson).toEqual([]);
  });
});
