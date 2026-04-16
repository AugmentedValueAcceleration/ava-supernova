import type { DocPage } from '../types.js';

// Section 1 — Start here. Newcomer-focused. Read in order.

export const START_PAGES: DocPage[] = [
  {
    id: 'start.what',
    title: 'What is Ava | Supernova?',
    audience: ['newcomer'],
    surfaces: ['web', 'ext', 'ide'],
    order: 10,
    section: 'start',
    body: [
      { type: 'paragraph', text: 'Ava | Supernova is an open-source agentic coding assistant. She writes code with you, teaches you anything you want to learn, audits your projects for security issues, and can control your desktop when you need her to. She remembers what you told her last week, respects the conventions of your project, and runs on your machine by default.' },
      { type: 'paragraph', text: 'Three surfaces, one agent. Use whichever fits your workflow — they share the same brain.' },
      { type: 'heading', level: 3, text: 'The three surfaces' },
      { type: 'list', ordered: false, items: [
        'VS Code extension — Ava lives next to your editor. Chat panel, unified dashboard, inline diffs.',
        'Desktop IDE — standalone native app for when you want the whole thing in one window. Built with Tauri.',
        'Companion — a mobile-friendly web app for when you are away from your desk. Tasks, journal, memory, quick chats.',
      ]},
      { type: 'heading', level: 3, text: 'What makes her different' },
      { type: 'list', ordered: false, items: [
        'Local-first. Your data stays on your machine unless you opt in to cloud sync. No telemetry. Ever.',
        'Open source. Every line is public — extension, IDE, companion, CLI. Fork it, audit it, verify our claims.',
        'Free for everyone. 3M tokens every month on the free tier. No credit card, no account required with your own keys.',
        'Teaching is free forever. Education should not have a price tag.',
      ]},
      { type: 'paragraph', text: 'If you are new to coding, start with Teach mode and ask her to explain something. If you are a seasoned engineer, drop her into Work mode and let the full persona team loose on your codebase. Same agent — different mindset.' },
    ],
  },
  {
    id: 'start.install',
    title: 'Install',
    audience: ['newcomer'],
    surfaces: ['web', 'ext', 'ide'],
    order: 20,
    section: 'start',
    body: [
      { type: 'paragraph', text: 'Pick the surface that matches how you work. You can use more than one — Ava syncs her memory across them when you sign in.' },

      { type: 'heading', level: 3, text: 'VS Code extension' },
      { type: 'list', ordered: true, items: [
        'Open the Extensions panel in VS Code (Ctrl+Shift+X / Cmd+Shift+X).',
        'Search for "Ava Supernova" and click Install.',
        'Press Ctrl+Shift+A (Cmd+Shift+A on macOS) to open the chat panel.',
        'Follow the setup wizard — pick a model, set your permission mode, done.',
      ]},

      { type: 'heading', level: 3, text: 'Desktop IDE' },
      { type: 'list', ordered: true, items: [
        'Download the installer for your platform from the releases page.',
        'Run it. The IDE launches with a welcome flow the first time.',
        'Sign in for the free platform tokens, or paste your own API key to run fully local.',
      ]},

      { type: 'heading', level: 3, text: 'CLI' },
      { type: 'list', ordered: true, items: [
        'npm install -g @ava/cli  (or pnpm / yarn — your choice).',
        'Run  ava  in any project directory.',
        'First run prompts you for a provider and a model. Pick and go.',
      ]},

      { type: 'callout', variant: 'tip', text: 'No account, no problem. With your own API key (BYOK) you never need to sign in. The free tier is for the platform-managed models.' },
    ],
  },
  {
    id: 'start.first-five',
    title: 'Your first five minutes',
    audience: ['newcomer'],
    surfaces: ['web', 'ext', 'ide'],
    order: 30,
    section: 'start',
    body: [
      { type: 'paragraph', text: 'Forget the documentation for a moment. The fastest way to learn Ava is to use her.' },
      { type: 'list', ordered: true, items: [
        'Open the chat. Whatever surface you are on.',
        'Type a question about a file in your project. Try: "Explain what this file does." — or pick a bug and say "Find what is wrong with this function."',
        'Ava will read the file (tool call #1). She will ask you to approve the first read. Say yes.',
        'Watch her stream an answer. If she wants to make a change, she will show you the diff and wait for you to approve.',
        'Switch modes. Type >> to enter Work mode, then ?? to try Teach mode with the same question. Feel the difference.',
      ]},
      { type: 'paragraph', text: 'That is it. You have used 4 of 62 tools and 2 of 6 modes. The rest is progressive — you learn what exists when you need it.' },
      { type: 'callout', variant: 'note', text: 'Prefer structure? Jump to Core concepts for a proper tour. Prefer learning by doing? Keep going — Ava will ask before she does anything risky.' },
    ],
  },
  {
    id: 'start.local-vs-cloud',
    title: 'Local vs cloud, in one paragraph',
    audience: ['newcomer', 'both'],
    surfaces: ['web', 'ext', 'ide'],
    order: 40,
    section: 'start',
    body: [
      { type: 'paragraph', text: 'Everything Ava does is local unless you explicitly opt in. Memory, tasks, journal, personality, settings — all stored on your machine in ~/.ava/ and .ava/ (per project). She talks to model providers over HTTPS to run your request, then returns home. She does not phone home. She does not collect telemetry. She does not train on your code.' },
      { type: 'paragraph', text: 'If you sign in, you get 3M free tokens per month on platform-managed models (Qwen, MiniMax) and optional cloud sync for memory and settings across machines. Sync is per-feature, revocable anytime. Bring your own API key and Ava works fully without an account.' },
      { type: 'callout', variant: 'tip', text: 'The rule: local is sacred. Cloud is additive.' },
    ],
  },
  {
    id: 'start.first-model',
    title: 'Choosing your first model',
    audience: ['newcomer'],
    surfaces: ['web', 'ext', 'ide'],
    order: 50,
    section: 'start',
    body: [
      { type: 'paragraph', text: 'You do not need to pick the perfect model. You need to pick a model that works for today and switch later when you notice limits. Here is the short version:' },
      { type: 'list', ordered: false, items: [
        'Just starting / free tier — Qwen Omni Flash is the default. Fast, cheap, good enough for most tasks. 3M tokens/month at no cost.',
        'Serious coding work — Qwen 3.6 Plus is the agentic coding champion. Coordinates Auto Mode and drives multi-file work.',
        'Best possible quality — bring your own Anthropic key and use Claude Opus 4.6. Higher cost, higher ceiling.',
        'Cheapest ceiling — bring your own DeepSeek key. Very capable, very low cost.',
      ]},
      { type: 'paragraph', text: 'The full matrix is in the Reference section. Changing model is one command — nothing is sticky.' },
      { type: 'facts', kind: 'providers', filter: { kind: 'managed' } },
    ],
  },
];
