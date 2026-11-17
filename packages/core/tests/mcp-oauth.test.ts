// Signing in to online MCP servers (plan 2026-11-17-mcp-servers, Phase 3).
// One local fake plays both parts: an MCP server that refuses without a token,
// and its own sign-in server (metadata, registering an app, authorize with
// PKCE, tokens). The "browser" is a fetch that follows the sign-in page's
// redirect back to Ava's listener. Nothing leaves this computer.

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { createServer, type Server, type IncomingMessage } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import {
  McpServers, mcpPage, setMcpKeychain, setMcpBrowserOpener, setMcpSignInPort, checkSignInUrl, addressZone,
  fencedFetch, AvaOAuthProvider, setMcpAuth, syncMcpTools,
} from '../src/mcp/index.js';
import { ToolRegistry } from '../src/tools/tool-registry.js';

// ── The fake server ─────────────────────────────────────────────────────────

let fake: Server;
let base = '';
const issued = new Set<string>();
const clients = new Map<string, string[]>(); // client_id → redirect_uris
const challenges = new Map<string, string>(); // code → code_challenge
let refuseAuthorize = false;
let registrations = 0;

const body = (req: IncomingMessage) => new Promise<string>((resolve) => {
  let s = '';
  req.on('data', (c) => { s += c; });
  req.on('end', () => resolve(s));
});

beforeAll(async () => {
  fake = createServer(async (req, res) => {
    const u = new URL(req.url ?? '/', base);
    const json = (code: number, o: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(code, { 'Content-Type': 'application/json', ...headers });
      res.end(JSON.stringify(o));
    };
    if (u.pathname.startsWith('/.well-known/oauth-protected-resource')) {
      return json(200, { resource: `${base}/mcp`, authorization_servers: [base], scopes_supported: ['notes:read'] });
    }
    if (u.pathname.startsWith('/.well-known/oauth-authorization-server')) {
      return json(200, {
        issuer: base, authorization_endpoint: `${base}/authorize`, token_endpoint: `${base}/token`,
        registration_endpoint: `${base}/register`, response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'], code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
      });
    }
    if (u.pathname === '/register' && req.method === 'POST') {
      const meta = JSON.parse(await body(req));
      registrations++;
      const id = `client-${registrations}`;
      clients.set(id, meta.redirect_uris);
      return json(201, { ...meta, client_id: id });
    }
    if (u.pathname === '/authorize') {
      const redirect = u.searchParams.get('redirect_uri')!;
      const back = new URL(redirect);
      back.searchParams.set('state', u.searchParams.get('state') ?? '');
      if (!clients.get(u.searchParams.get('client_id') ?? '')?.includes(redirect)) return json(400, { error: 'bad redirect' });
      if (refuseAuthorize) {
        back.searchParams.set('error', 'access_denied');
      } else {
        const code = `code-${challenges.size + 1}`;
        challenges.set(code, u.searchParams.get('code_challenge')!);
        back.searchParams.set('code', code);
      }
      res.writeHead(302, { Location: back.href });
      return res.end();
    }
    if (u.pathname === '/token' && req.method === 'POST') {
      const p = new URLSearchParams(await body(req));
      if (p.get('grant_type') === 'authorization_code') {
        const want = challenges.get(p.get('code') ?? '');
        const got = createHash('sha256').update(p.get('code_verifier') ?? '').digest('base64url');
        if (!want || want !== got) return json(400, { error: 'invalid_grant' });
        const tok = `tok-${issued.size + 1}`;
        issued.add(tok);
        return json(200, { access_token: tok, token_type: 'Bearer', expires_in: 3600, refresh_token: `ref-${tok}` });
      }
      return json(400, { error: 'unsupported_grant_type' });
    }
    if (u.pathname === '/mcp') {
      const auth = req.headers.authorization ?? '';
      if (!issued.has(auth.replace(/^Bearer /, ''))) {
        res.writeHead(401, { 'WWW-Authenticate': `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"` });
        return res.end();
      }
      const server = new McpServer({ name: 'notes-test', version: '1.0.0' });
      server.registerTool('echo', { description: 'Echo text', inputSchema: { text: z.string() } }, async ({ text }) => ({ content: [{ type: 'text', text: `echo: ${text}` }] }));
      const t = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => { void t.close(); void server.close(); });
      await server.connect(t);
      const raw = req.method === 'POST' ? await body(req) : '';
      return t.handleRequest(req, res, raw ? JSON.parse(raw) : undefined);
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => fake.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(fake.address() as { port: number }).port}`;
});

afterAll(async () => {
  fake.closeAllConnections();
  await new Promise((r) => fake.close(r));
});

// ── Ava's side ──────────────────────────────────────────────────────────────

let dir: string;
let blob: string | null = null;
const opened: string[] = [];
/** The "browser": opens the sign-in page and follows it back, unless told to just sit there. */
let browserFollows = true;

const authRecords = () => (blob ? JSON.parse(blob).auth : {}) as Record<string, { url: string; tokens?: { access_token: string } }>;

async function until<T>(f: () => T | undefined | false, what: string): Promise<T> {
  for (let i = 0; i < 200; i++) {
    const v = f();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`never happened: ${what} — ${JSON.stringify(McpServers.current().status())}`);
}

const notes = () => McpServers.current().status().find((s) => s.id === 'notes')!;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ava-mcp-oauth-'));
  process.env.AVA_MCP_CONFIG = join(dir, 'mcp.json');
  writeFileSync(process.env.AVA_MCP_CONFIG, JSON.stringify({ mcpServers: { notes: { type: 'http', url: `${base}/mcp` } } }));
  blob = null;
  issued.clear();
  refuseAuthorize = false;
  opened.length = 0;
  browserFollows = true;
  setMcpKeychain({ read: async () => blob, write: async (v) => { blob = v; } });
  setMcpSignInPort(0);
  setMcpBrowserOpener(async (url) => {
    opened.push(url);
    if (!browserFollows) return;
    void (async () => {
      const r = await fetch(url, { redirect: 'manual' });
      const back = r.headers.get('location');
      if (back) await fetch(back);
    })();
  });
  McpServers.reset();
  await McpServers.current().start(null);
  await until(() => notes()?.state !== 'connecting' && notes(), 'first start');
});

afterEach(async () => {
  await McpServers.current().stopAll();
  McpServers.reset();
  setMcpBrowserOpener(null);
  delete process.env.AVA_MCP_CONFIG;
  rmSync(dir, { recursive: true, force: true });
});

describe('signing in to an online server', () => {
  it('wants a sign-in, signs in through the browser, then runs — and the token stays in the keychain', async () => {
    expect(notes()).toMatchObject({ state: 'needs-signin', signedIn: false, signingIn: false });
    const before = registrations;
    // Without his click, Ava never registers with the server.
    expect(registrations).toBe(before);

    const r = await mcpPage('sign_in', { scope: 'user', id: 'notes', words: { done: 'Done!' } }) as { ok: boolean; problem?: string };
    expect(r.problem).toBeUndefined();
    expect(opened).toHaveLength(1);
    const page = new URL(opened[0]);
    expect(page.pathname).toBe('/authorize');
    expect(page.searchParams.get('code_challenge_method')).toBe('S256');
    expect(page.searchParams.get('scope')).toBe('notes:read');
    expect(page.searchParams.get('redirect_uri')).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);

    const s = await until(() => notes().state === 'ready' && notes(), 'ready after sign-in');
    expect(s).toMatchObject({ signedIn: true, signingIn: false, online: true });
    expect(s.tools.map((t) => t.name)).toEqual(['echo']);
    expect(registrations).toBe(before + 1);

    // Kept in the keychain under his server, for this exact address; never in the file.
    const rec = authRecords()['user:notes'];
    expect(rec.url).toBe(`${base}/mcp`);
    expect(rec.tokens?.access_token).toMatch(/^tok-/);
    const { readFileSync } = await import('node:fs');
    expect(readFileSync(process.env.AVA_MCP_CONFIG!, 'utf8')).not.toMatch(/tok-|ref-/);

    // Its tool works for Ava.
    const reg = new ToolRegistry();
    syncMcpTools(reg);
    const out = await reg.getTool('mcp_notes_echo')!.execute({ text: 'hi' }, { workingDirectory: dir } as never);
    expect(out.output).toContain('echo: hi');

    // A fresh start (the other app, or tomorrow) uses the kept sign-in: no browser.
    McpServers.reset();
    await McpServers.current().start(null);
    await until(() => notes()?.state === 'ready', 'ready on a fresh start');
    expect(opened).toHaveLength(1);

    // Sign out: forgotten, and it wants a sign-in again.
    await mcpPage('sign_out', { scope: 'user', id: 'notes' });
    expect(authRecords()['user:notes']).toBeUndefined();
    await until(() => notes().state === 'needs-signin', 'needs-signin after sign out');
    expect(notes().signedIn).toBe(false);
  });

  it('can be cancelled while the browser is open, and says nothing went wrong', async () => {
    browserFollows = false;
    await mcpPage('sign_in', { scope: 'user', id: 'notes' });
    expect(notes().signingIn).toBe(true);
    await mcpPage('cancel_signin', { scope: 'user', id: 'notes' });
    await until(() => notes().signingIn === false, 'cancelled');
    expect(notes().message).not.toMatch(/didn't finish/);
    expect(authRecords()['user:notes']?.tokens).toBeUndefined();
  });

  it('says so when he (or the server) says no on the sign-in page', async () => {
    refuseAuthorize = true;
    await mcpPage('sign_in', { scope: 'user', id: 'notes' });
    await until(() => notes().signingIn === false, 'refused');
    expect(notes()).toMatchObject({ state: 'needs-signin', signedIn: false });
    expect(notes().message).toMatch(/Sign-in didn't finish: The server said no: access_denied/);
  });

  it('never opens a sign-in page that isn\'t https (or this computer)', async () => {
    expect(checkSignInUrl('https://auth.example.com/authorize?x=1')).toBeNull();
    expect(checkSignInUrl('http://127.0.0.1:5000/authorize')).toBeNull();
    for (const bad of ['http://auth.example.com/a', 'javascript:alert(1)', 'file:///C:/Windows/notepad.exe', 'data:text/html,hi', 'https://me:pw@auth.example.com/']) {
      expect(checkSignInUrl(bad), bad).not.toBeNull();
    }
  });

  it('uses a kept sign-in only for the address it was given for', async () => {
    await setMcpAuth('user:notes', { url: 'https://other.example.com/mcp', tokens: { access_token: 'secret', token_type: 'Bearer' } });
    const p = await AvaOAuthProvider.create('user:notes', `${base}/mcp`);
    expect(p.hasTokens).toBe(false);
    expect(p.tokens()).toBeUndefined();
  });
});

describe('the fence while signing in', () => {
  it('knows how far inside a network an address is', () => {
    expect(addressZone('8.8.8.8')).toBe('public');
    expect(addressZone('10.1.2.3')).toBe('private');
    expect(addressZone('192.168.0.1')).toBe('private');
    expect(addressZone('172.20.0.1')).toBe('private');
    expect(addressZone('127.0.0.1')).toBe('loopback');
    expect(addressZone('169.254.169.254')).toBe('link-local');
    expect(addressZone('::ffff:169.254.169.254')).toBe('link-local');
    expect(addressZone('::1')).toBe('loopback');
    expect(addressZone('fe80::1')).toBe('link-local');
    expect(addressZone('fd00::1')).toBe('private');
  });

  it('lets the server itself through, and refuses anything deeper inside or not https', async () => {
    const seen: string[] = [];
    const f = fencedFetch('https://93.184.215.14/mcp', async (u) => { seen.push(String(u)); return new Response('ok'); });
    await f('https://93.184.215.14/mcp');
    await f('https://8.8.8.8/.well-known/oauth-authorization-server');
    await expect(f('https://169.254.169.254/latest/meta-data')).rejects.toThrow(/inside your network/);
    await expect(f('https://192.168.1.1/token')).rejects.toThrow(/inside your network/);
    await expect(f('https://127.0.0.1/token')).rejects.toThrow(/inside your network/);
    await expect(f('http://8.8.8.8/token')).rejects.toThrow(/isn't https/);
    expect(seen).toEqual(['https://93.184.215.14/mcp', 'https://8.8.8.8/.well-known/oauth-authorization-server']);
  });

  it('a server on this computer may sign in on this computer, but never reach link-local', async () => {
    const f = fencedFetch('http://127.0.0.1:9000/mcp', async () => new Response('ok'));
    await f('http://127.0.0.1:9001/token');
    await expect(f('https://169.254.169.254/x')).rejects.toThrow(/inside your network/);
  });
});
