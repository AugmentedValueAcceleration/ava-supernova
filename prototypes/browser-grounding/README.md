# Prototype B3 — Playwright subprocess lifecycle

**Goal:** de-risk the Playwright-from-Tauri path before any Rust sidecar
work begins. Validate the subprocess contract, measure cold-start, and
prove clean shutdown with zero orphan Chromium processes.

This is Session 2 of the desktop-automation build. See
[../../DESKTOP_AUTOMATION_SPEC.md](../../DESKTOP_AUTOMATION_SPEC.md) §5
(Playwright embedding) and the progress checklist for context.

## What it validates

1. **Subprocess contract** — NDJSON over stdio, one command per line,
   correlated by `id`. Same shape the Rust sidecar will implement.
2. **Cold-start cost** — time from `launch` command to first navigable page.
   Spec 5 claims ~500ms; this prototype measures it for real.
3. **Grounding blob shape** — the `snapshot` response is the browser-tier
   ScreenState that Scout will receive. Kept minimal (links, buttons,
   inputs) to confirm it fits the persona prompt budget.
4. **Clean shutdown** — count `chrome.exe` processes before and after. The
   delta must be zero. Historical Windows pain lives here — if the worker
   crashes or the harness orphans Chromium, this catches it.
5. **Force-kill path** — if the worker hangs, `taskkill /T /F` takes the
   whole tree down. Mirrors what Rust will do on trajectory abort.

## Running it

```bash
cd prototypes/browser-grounding
npm install
npx playwright install chromium   # ~130 MB, one-time
npm run run
```

A headed Chromium window will flash up briefly as the trajectory runs. The
summary prints to stderr and a full trajectory log lands in
`results/run-<timestamp>.json`.

## Pass criteria

- every step returns `ok: true`
- `cold start` under 2000ms (spec target: ~500ms, we'd accept double)
- `clean shutdown: yes`
- `orphan chromium processes: 0`

Any of these failing is a Session 2 blocker to address before Session 3.

## Windows matrices worth running

The spec risk register flags Playwright subprocess fragility on Windows
specifically. Run on:

- Windows 10, standard user
- Windows 10, admin user
- Windows 11, standard user
- Windows 11, admin user

Each run writes a separate results file so we can diff behaviour across
environments.
