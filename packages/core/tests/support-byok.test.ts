// Support with no accounts (1 Nov 2026): Discord for public, a drafted email
// the user sends for private. Nothing is sent from Ava, and no account needed.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SupportRequestTool, SUPPORT_EMAIL } from '../src/tools/support-request.js';
import { ProposeToolTool } from '../src/tools/propose-tool.js';
import { LearningProgressTool } from '../src/tools/learning.js';

const ctx = { cwd: '.', sharedState: {} } as never;
afterEach(() => vi.unstubAllGlobals());

describe('support_request', () => {
  it('sends nothing itself and needs no confirmation', () => {
    const t = new SupportRequestTool();
    expect(t.requiresConfirmation).toBe(false);
    expect(t.riskLevel).toBe('safe');
  });

  it('points a public question to the right Discord channel', async () => {
    const fetchSpy = vi.fn(); vi.stubGlobal('fetch', fetchSpy);
    const r = await new SupportRequestTool().execute({ category: 'bug', subject: 'Voice fails', message: 'It errors.' }, ctx);
    expect(r.success).toBe(true);
    expect(r.metadata).toMatchObject({ channel: 'discord', discordChannel: '#bug-reports' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('drafts a private matter as an email with a link to open it', async () => {
    const r = await new SupportRequestTool().execute({ category: 'privacy', subject: 'Delete my data', message: 'Please remove what you hold.' }, ctx);
    expect(r.success).toBe(true);
    expect(r.metadata?.to).toBe(SUPPORT_EMAIL);
    expect(String(r.metadata?.mailto)).toBe(`mailto:${SUPPORT_EMAIL}?subject=Delete%20my%20data&body=Please%20remove%20what%20you%20hold.`);
  });

  it('still refuses to carry a key', async () => {
    const r = await new SupportRequestTool().execute({ category: 'security', subject: 'leak', message: 'my key is sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789' }, ctx);
    expect(r.success).toBe(false);
  });
});

describe('propose_tool', () => {
  it('drafts a #feature-requests post — no email asked, no tokens promised, nothing sent', async () => {
    const fetchSpy = vi.fn(); vi.stubGlobal('fetch', fetchSpy);
    const t = new ProposeToolTool();
    expect(JSON.stringify(t.schema)).not.toMatch(/email|bonus token/i);
    const r = await t.execute({ tool_name: 'export_svg_set', description: 'Export icons as one SVG sprite.', risk_level: 'safe', justification: 'Asked for twice today.' }, ctx);
    expect(r.success).toBe(true);
    expect(r.output).toMatch(/#feature-requests/);
    expect(r.output).toMatch(/export_svg_set/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('the Learning Library is public', () => {
  it('searches without an account', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ paths: [{ id: '1', title: 'Rust basics', subject: 'Rust', level: 'beginner', description: 'd', fork_count: 3, rating_sum: 0, rating_count: 0, estimated_hours: 4, source: 'curated' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    const r = await new LearningProgressTool().execute({ action: 'library_search', query: 'rust' }, ctx);
    expect(r.output).toMatch(/Rust basics/);
    const init = (fetchSpy.mock.calls[0] as unknown[])[1] as RequestInit | undefined;
    expect(init?.headers).toBeUndefined();
  });
});
