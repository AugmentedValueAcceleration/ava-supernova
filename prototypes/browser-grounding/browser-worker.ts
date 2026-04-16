// Browser worker — the Node subprocess that drives Playwright.
//
// Reads newline-delimited `Command` JSON from stdin, writes `Response`
// JSON to stdout. Stays alive until it receives `close` or stdin ends.
//
// Deliberately small and boring: this is the contract the Rust sidecar
// will invoke later. No app logic lives here — just translate NDJSON
// commands into Playwright calls and report results.
//
// Any uncaught error from Playwright is returned as `ok: false` with the
// message in `error`. We never crash the process on a failed action —
// the harness decides whether to retry, abort, or continue.

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { createInterface } from 'node:readline/promises';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Command, Response } from './types.ts';

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;

function send(response: Response): void {
  process.stdout.write(JSON.stringify(response) + '\n');
}

function err(id: string, error: unknown, elapsedMs: number): Response {
  return {
    id,
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    elapsedMs,
  };
}

async function handle(cmd: Command): Promise<Response> {
  const started = Date.now();
  const elapsed = () => Date.now() - started;

  try {
    switch (cmd.action) {
      case 'ping':
        return { id: cmd.id, ok: true, result: { pong: true }, elapsedMs: elapsed() };

      case 'launch': {
        if (browser) throw new Error('browser already launched');
        browser = await chromium.launch({
          headless: false,
          // Viewport sized for a predictable demo screenshot; real use will
          // match the user's Ava window.
          args: ['--window-size=1280,800', '--no-first-run', '--no-default-browser-check'],
        });
        context = await browser.newContext({
          viewport: { width: 1280, height: 800 },
        });
        page = await context.newPage();
        return {
          id: cmd.id,
          ok: true,
          result: {
            pid: browser.contexts()[0] ? process.pid : null,
            version: browser.version(),
          },
          elapsedMs: elapsed(),
        };
      }

      case 'navigate': {
        if (!page) throw new Error('launch first');
        const url = String(cmd.params?.url ?? '');
        if (!url) throw new Error('params.url required');
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
        return {
          id: cmd.id,
          ok: true,
          result: { url: page.url(), title: await page.title() },
          elapsedMs: elapsed(),
        };
      }

      case 'snapshot': {
        if (!page) throw new Error('launch first');
        // Lightweight grounding blob — mirrors what Scout persona will
        // receive from the browser tier. Not a full DOM dump; just the
        // elements Planner can actually target.
        const snapshot = await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll('a'))
            .slice(0, 20)
            .map((a) => ({ text: a.textContent?.trim() ?? '', href: a.getAttribute('href') ?? '' }));
          const buttons = Array.from(document.querySelectorAll('button'))
            .slice(0, 20)
            .map((b) => ({ text: b.textContent?.trim() ?? '', id: b.id, name: b.getAttribute('name') ?? '' }));
          const inputs = Array.from(document.querySelectorAll('input'))
            .slice(0, 20)
            .map((i) => ({
              type: i.getAttribute('type') ?? 'text',
              name: i.getAttribute('name') ?? '',
              placeholder: i.getAttribute('placeholder') ?? '',
            }));
          return {
            title: document.title,
            url: window.location.href,
            headingCount: document.querySelectorAll('h1,h2,h3').length,
            links, buttons, inputs,
          };
        });
        return { id: cmd.id, ok: true, result: snapshot, elapsedMs: elapsed() };
      }

      case 'screenshot': {
        if (!page) throw new Error('launch first');
        const outDir = String(cmd.params?.outDir ?? './screenshots');
        await mkdir(outDir, { recursive: true });
        const path = join(outDir, `shot-${Date.now()}.png`);
        const buf = await page.screenshot({ path, fullPage: false });
        return {
          id: cmd.id,
          ok: true,
          result: { path, bytes: buf.length },
          elapsedMs: elapsed(),
        };
      }

      case 'click': {
        if (!page) throw new Error('launch first');
        const selector = String(cmd.params?.selector ?? '');
        if (!selector) throw new Error('params.selector required');
        await page.click(selector, { timeout: 5_000 });
        return { id: cmd.id, ok: true, result: { selector }, elapsedMs: elapsed() };
      }

      case 'close': {
        // Close in reverse order. We capture process count inside the worker
        // but the harness is the source of truth for orphan detection.
        if (page) { await page.close().catch(() => {}); page = null; }
        if (context) { await context.close().catch(() => {}); context = null; }
        if (browser) { await browser.close().catch(() => {}); browser = null; }
        return { id: cmd.id, ok: true, result: { closed: true }, elapsedMs: elapsed() };
      }

      default:
        return err(cmd.id, `unknown action: ${(cmd as { action: string }).action}`, elapsed());
    }
  } catch (e) {
    return err(cmd.id, e, elapsed());
  }
}

async function main(): Promise<void> {
  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let cmd: Command;
    try {
      cmd = JSON.parse(line) as Command;
    } catch (e) {
      send({ id: 'parse-error', ok: false, error: `invalid JSON: ${String(e)}`, elapsedMs: 0 });
      continue;
    }
    const response = await handle(cmd);
    send(response);
    if (cmd.action === 'close') break;
  }
  // Belt and braces — if stdin closed without an explicit close, still tear down.
  if (browser) await browser.close().catch(() => {});
  process.exit(0);
}

main().catch((e) => {
  process.stderr.write(`[worker] fatal: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
