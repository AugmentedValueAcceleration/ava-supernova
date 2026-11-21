/**
 * The usage ledger (usage/ledger.ts) — the Usage timeline's record, 21 Nov 2026.
 *
 * What must hold:
 *   - nothing is written until a program switches it on (the website's server
 *     imports core and must never write a ~/.ava);
 *   - each paid call is one line, priced at the moment of spend, filed under
 *     the user's own day;
 *   - the provider records, the agent only says which room — so a call made
 *     inside a Health turn is Health spend, and one made outside any turn is
 *     'background', never passed off as chat;
 *   - every total is summed from the same lines.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, readdirSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  configureUsageLedger, recordUsage, readUsage, summariseUsage, withUsageScope, localIso, usageCost,
} from '../src/usage/ledger.js';
import { usdRateFor } from '../src/audit/cost.js';
import { BaseProvider } from '../src/providers/base-provider.js';
import { Agent } from '../src/agent/agent.js';
import { ToolRegistry } from '../src/tools/tool-registry.js';
import type { ModelDefinition } from '../src/core/types.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ava-usage-'));
});
afterEach(() => {
  configureUsageLedger(null);
  rmSync(dir, { recursive: true, force: true });
});

const lines = () => readdirSync(dir).flatMap((f) =>
  readFileSync(join(dir, f), 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));

describe('usage ledger', () => {
  it('writes nothing until a program switches it on', () => {
    expect(recordUsage({ provider: 'deepseek', model: 'deepseek-v4.1-flash', usage: { prompt_tokens: 10, completion_tokens: 5 } })).toBeNull();
    configureUsageLedger({ surface: 'ext', dir });
    expect(recordUsage({ provider: 'deepseek', model: 'deepseek-v4.1-flash', usage: { prompt_tokens: 10, completion_tokens: 5 } })).not.toBeNull();
    expect(lines()).toHaveLength(1);
  });

  it('prices each line at the moment of spend, from the rate card', () => {
    configureUsageLedger({ surface: 'ide', dir });
    // A model the rate card knows — whichever is first, so the test never
    // pins a price that will be re-verified later.
    const e = recordUsage({ provider: 'qwen', model: 'qwen3.7-plus', usage: { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 } })!;
    const rate = usdRateFor('qwen3.7-plus', 'qwen');
    if (rate) expect(e.usd).toBeCloseTo(rate.inputPerMillion + rate.outputPerMillion, 6);
    else expect(e.usd).toBeUndefined();
    // Unknown model, no fallback: no price rather than a made-up one.
    const u = recordUsage({ provider: 'mine', model: 'no-such-model', usage: { prompt_tokens: 5, completion_tokens: 5 } })!;
    expect(u.usd).toBeUndefined();
    expect(usageCost('no-such-model', 'mine', 5, 5, 0.25)).toBe(0.25);
  });

  it("files the line under the user's own month and day, with their offset", () => {
    configureUsageLedger({ surface: 'cli', dir });
    const at = new Date(2026, 10, 21, 23, 30); // 21 Nov, local time
    const e = recordUsage({ provider: 'p', model: 'm', usage: { prompt_tokens: 1, completion_tokens: 1 }, at })!;
    expect(e.t.slice(0, 10)).toBe('2026-11-21');
    expect(e.t).toBe(localIso(at));
    expect(readdirSync(dir)).toEqual(['2026-11.jsonl']);
  });

  it('keeps the cache count only when the provider reported one', () => {
    configureUsageLedger({ surface: 'ext', dir });
    const a = recordUsage({ provider: 'p', model: 'm', usage: { prompt_tokens: 9, completion_tokens: 1, prompt_tokens_details: { cached_tokens: 4 } } })!;
    const b = recordUsage({ provider: 'p', model: 'm', usage: { prompt_tokens: 9, completion_tokens: 1 } })!;
    expect(a.cached).toBe(4);
    expect('cached' in b).toBe(false);
  });

  it('files spend under the room of the turn; an outer turn wins; outside any turn is background', () => {
    configureUsageLedger({ surface: 'ext', dir });
    const u = { prompt_tokens: 1, completion_tokens: 1 };
    withUsageScope({ room: 'health', mode: 'health' }, () => {
      recordUsage({ provider: 'p', model: 'm', usage: u });
      // A nested agent (the curator) opening its own scope stays Health spend.
      withUsageScope({ room: 'main', mode: 'work' }, () => recordUsage({ provider: 'p', model: 'm', usage: u }));
    });
    recordUsage({ provider: 'p', model: 'm', usage: u });
    expect(lines().map((l) => `${l.room}/${l.mode}`)).toEqual(['health/health', 'health/health', 'background/background']);
  });

  it('reads a range by local day, skips a broken line, and every total sums from the same lines', () => {
    configureUsageLedger({ surface: 'ext', dir });
    const rec = (day: number, model: string, room: string, inT: number) =>
      withUsageScope({ room, mode: room === 'main' ? 'work' : room }, () =>
        recordUsage({ provider: 'p', model, usage: { prompt_tokens: inT, completion_tokens: 10 }, at: new Date(2026, 10, day, 12) }));
    rec(19, 'm1', 'main', 100);
    rec(20, 'm1', 'health', 200);
    rec(20, 'm2', 'main', 300);
    rec(21, 'm2', 'main', 400);
    appendFileSync(join(dir, '2026-11.jsonl'), '{"t":"2026-11-20T1'); // a crash mid-write

    const range = readUsage('2026-11-20', '2026-11-20');
    expect(range).toHaveLength(2);
    const s = summariseUsage(range);
    expect(s.totals.in).toBe(500);
    expect(s.totals.replies).toBe(2);
    expect(s.totals.unpriced).toBe(2); // 'm1'/'m2' have no rate — counted, not hidden
    expect(s.byDay).toEqual([expect.objectContaining({ day: '2026-11-20', in: 500 })]);
    expect(s.byRoom.map((r) => r.room).sort()).toEqual(['health', 'main']);
    expect(s.byModel.reduce((n, m) => n + m.in, 0)).toBe(s.totals.in);
    expect(readUsage()).toHaveLength(4);
  });
});

// ─── The provider records; the agent says where it belongs ──────────────────

class FakeProvider extends BaseProvider {
  readonly name = 'deepseek';
  readonly displayName = 'DeepSeek';
  constructor() { super({ apiKey: 'k', baseUrl: 'http://fake.local' } as never); }
  getModels() { return []; }
  listModels() { return []; }
  protected getAuthHeaders() { return {}; }
  protected getCompletionUrl() { return 'http://fake.local/chat'; }
  protected async fetchWithRetry(_url: string, init: RequestInit): Promise<Response> {
    const body = JSON.parse(String(init.body));
    if (!body.stream) {
      return new Response(JSON.stringify({
        id: 'x', object: 'chat.completion', created: 0, model: body.model,
        choices: [{ index: 0, message: { role: 'assistant', content: 'summary' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 50, completion_tokens: 5, total_tokens: 55 },
      }), { status: 200 });
    }
    const sse = [
      { choices: [{ index: 0, delta: { content: 'hello' }, finish_reason: null }] },
      { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 } },
    ].map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n';
    return new Response(sse, { status: 200 });
  }
}

const MODEL: ModelDefinition = {
  id: 'deepseek-v4.1-flash', name: 'Flash', provider: 'deepseek',
  contextWindow: 128000, maxOutputTokens: 4096, supportsToolCalls: true, supportsStreaming: true,
} as ModelDefinition;

describe('recorded at the provider', () => {
  it('counts a one-off call (a summary, memory upkeep) as well as a streamed reply', async () => {
    configureUsageLedger({ surface: 'ide', dir });
    const p = new FakeProvider();
    await p.createCompletion({ model: 'deepseek-v4.1-flash', messages: [{ role: 'user', content: 'x' }] });
    for await (const _ of p.createStreamingCompletion({ model: 'deepseek-v4.1-flash', messages: [{ role: 'user', content: 'x' }] })) { /* drain */ }
    const l = lines();
    expect(l.map((x) => [x.in, x.out, x.provider, x.surface])).toEqual([[50, 5, 'deepseek', 'ide'], [120, 30, 'deepseek', 'ide']]);
  });

  it("a Health room turn is filed as Health spend, under the turn's own mode", async () => {
    configureUsageLedger({ surface: 'ext', dir });
    const agent = new Agent({ provider: new FakeProvider(), model: MODEL, toolRegistry: new ToolRegistry(), cwd: dir } as never);
    await agent.run([{ role: 'user', content: '[Health Room]\n\nPlan my week' }], () => {});
    const l = lines();
    expect(l.length).toBeGreaterThan(0);
    expect(l.every((x) => x.room === 'health' && x.mode === 'health')).toBe(true);
  });
});
