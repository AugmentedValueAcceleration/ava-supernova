/**
 * A web MCP server going away, and coming back (his report, 19 Nov: Unreal
 * closed, the card still said Connected). The pretend Unreal over HTTP is
 * stopped and started again on the same address.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { McpServers, setMcpKeychain } from '../src/mcp/index.js';

const FAKE = resolve(__dirname, 'fixtures/fake-unreal-mcp.mjs');
let dir: string;
let unreal: ChildProcess | null = null;

function freePort(): Promise<number> {
  return new Promise((r) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => r(p)); }); });
}
function startUnreal(port: number): Promise<void> {
  unreal = spawn(process.execPath, [FAKE, '--http', String(port)], { cwd: resolve(__dirname, '..') });
  return new Promise((r) => createInterface({ input: unreal!.stdout! }).on('line', (l) => { if (l.startsWith('listening')) r(); }));
}
async function until(check: () => boolean, ms = 15_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (check()) return; await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('timed out: ' + JSON.stringify(McpServers.current().status()));
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ava-heartbeat-'));
  process.env.AVA_MCP_CONFIG = join(dir, 'mcp.json');
  process.env.AVA_TEST_MCP_TICK_MS = '300';
  let blob: string | null = null;
  setMcpKeychain({ read: async () => blob, write: async (v) => { blob = v; } });
  McpServers.reset();
});
afterEach(async () => {
  unreal?.kill(); unreal = null;
  await McpServers.current().stopAll();
  McpServers.reset();
  delete process.env.AVA_TEST_MCP_TICK_MS;
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows */ }
});

describe('a web server closing and opening again', () => {
  it('Unreal closed shows as not open within seconds, and reconnects by itself when it is back', async () => {
    const port = await freePort();
    const url = `http://127.0.0.1:${port}/mcp`;
    await startUnreal(port);
    writeFileSync(process.env.AVA_MCP_CONFIG!, JSON.stringify({ mcpServers: { unreal: { type: 'http', url } } }));
    const m = McpServers.current();
    await m.start(null);
    await until(() => m.status()[0]?.state === 'ready');

    unreal!.kill();
    await until(() => m.status()[0]?.reason === 'unreal-closed');
    expect(m.status()[0].state).toBe('error');

    await startUnreal(port);
    await until(() => m.status()[0]?.state === 'ready');
    expect(m.status()[0].unreal?.tools).toBeGreaterThan(0);
  }, 40_000);
});
