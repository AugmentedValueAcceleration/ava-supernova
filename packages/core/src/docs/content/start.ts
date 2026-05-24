import type { DocPage } from '../types.js';

// Section 1 — Start here. Newcomer-focused. Read in order.

export const START_PAGES: DocPage[] = [
  {
    id: 'start.what',
    title: 'What is Ava Supernova?',
    audience: ['newcomer'],
    surfaces: ['web', 'ext', 'ide'],
    order: 10,
    section: 'start',
    body: [
      { type: 'paragraph', text: 'Ava Supernova is an open-source agentic coding assistant. She writes code with you, teaches you anything you want to learn, audits your projects for security issues, and can control your desktop when you need her to. She remembers what you told her last week, respects the conventions of your project, and runs on your machine by default.' },
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
    id: 'start.for-non-coders',
    title: "Never written code? Start here",
    audience: ['newcomer'],
    surfaces: ['web', 'ext', 'ide'],
    order: 15,
    section: 'start',
    body: [
      { type: 'paragraph', text: "If you have never written a line of code, you are exactly who Ava is for. You do not need to learn any jargon to start — you talk to her in plain English, the way you would ask a knowledgeable friend. This page is your whole on-ramp." },
      { type: 'heading', level: 3, text: 'What you can do today, with no experience' },
      { type: 'list', ordered: false, items: [
        'Ask her anything, in normal words — "what does this file do?", "why is my page blank?", "what even is a database?" She answers in plain language and remembers the conversation.',
        'Learn something from scratch — say "teach me Python from zero" and she builds you a proper course with lessons and quizzes. This is always free.',
        'Get something built — describe what you want ("a button that downloads my notes") and she writes it, showing you every change before it happens.',
      ]},
      { type: 'heading', level: 3, text: "You don't need to understand everything" },
      { type: 'paragraph', text: "Ava has a lot of machinery under the hood — modes, models, specialists, routing. You will see those words around the app and in these docs. Here is the secret: you can ignore almost all of it. Ava picks the right tools and the right helpers for you automatically. The technical pages are there for when you get curious, not because you need them to start." },
      { type: 'heading', level: 3, text: 'A gentle first path' },
      { type: 'list', ordered: true, items: [
        'Install Ava (next page) and open the chat.',
        'Type a real question you have. Anything. See how she answers.',
        'Try learning mode: type "teach me" and a topic. Follow along.',
        'When you want her to actually make or change something, just ask — she will always show you what she is about to do and wait for your "yes".',
      ]},
      { type: 'callout', variant: 'tip', text: 'Hit a word you do not recognise? The Plain-English glossary (further down this section) explains every term with no assumed knowledge.' },
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
      { type: 'paragraph', text: 'That is it. You have used 4 of 60 tools and 2 of 6 modes. The rest is progressive — you learn what exists when you need it.' },
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
    title: 'Choosing your routing mode',
    audience: ['newcomer'],
    surfaces: ['web', 'ext', 'ide'],
    order: 50,
    section: 'start',
    body: [
      { type: 'paragraph', text: 'You do not pick a model — you pick a routing strategy. Ava drives the right model for each subtask under the hood. Three strategies cover every workload, available on every plan.' },

      { type: 'heading', level: 3, text: 'Maestro — the default' },
      { type: 'paragraph', text: 'One conductor (Qwen 3.6 Plus) handles every persona, every step. Production-tuned, proven, predictable cost. Pick this if you want Ava to "just work" without thinking about routing. Live on every plan.' },

      { type: 'heading', level: 3, text: 'Supernova — the polyglot ensemble' },
      { type: 'paragraph', text: 'A frontier coordinator (DeepSeek V4 Pro, 1.6T parameters / 49B active, 1M context) hands off to specialists per subtask. V4 Flash for high-volume builds, Qwen 3.6 Plus as fallback, Qwen Omni when vision is in play. Best for heavy multi-step work where each step deserves its own specialist.' },

      { type: 'heading', level: 3, text: 'Aurora — the European stack' },
      { type: 'paragraph', text: 'Mistral-only routing in three tiers — Mistral Large 3 coordinator + heavy specialists, Mistral Medium 3.5 (the merged flagship released April 2026 — 128B dense, 256K context, vision encoder from scratch, modified-MIT open weights, 77.6% SWE-Bench Verified) for Builder + mid-tier specialists + vision + long-form, Mistral Small 4 at the intent gate. Open weights end to end, never leaves EU infrastructure. Built for GDPR-strict deployments, public-sector, healthcare, anyone with a sovereignty mandate.' },

      { type: 'callout', variant: 'tip', text: 'Switch routing mode any time from the model picker — top of the chat panel on every surface. Nothing is sticky.' },

      { type: 'heading', level: 3, text: 'Want to drive a specific model yourself?' },
      { type: 'paragraph', text: 'BYOK (bring your own key) gives you both — the three orchestration modes plus the ability to pick a single model and skip routing entirely. Useful when you have a strong preference, a strict budget, or you are testing a specific model. Paste your provider key in settings, pick the model from the picker, done. Full provider matrix lives in the Reference section.' },

      { type: 'facts', kind: 'providers', filter: { kind: 'managed' } },
    ],
  },
  {
    id: 'start.glossary',
    title: 'Plain-English glossary',
    audience: ['newcomer', 'both'],
    surfaces: ['web', 'ext', 'ide'],
    order: 60,
    section: 'start',
    body: [
      { type: 'paragraph', text: 'Every word you might bump into around Ava, explained with no assumed knowledge. You do not need to memorise any of this — flip back whenever a term trips you up.' },
      { type: 'table', headers: ['Word', 'What it actually means'], rows: [
        ['Agent', 'An AI that can take actions for you — read a file, run a command, search the web — not just chat. Ava is an agent: she does things, with your say-so.'],
        ['Model', 'The actual AI brain doing the thinking (Qwen, DeepSeek, Mistral, and others). Different models have different strengths. You normally never pick one — Ava does.'],
        ['Mode', 'The mindset Ava is in. Like a colleague switching hats: builder, teacher, planner, friend. You pick the mode; it changes how she behaves. There are six.'],
        ['Persona / specialist', 'Helper roles Ava runs behind the scenes for harder jobs — an explorer, a planner, a fact-checker. Think of a small expert team. You never talk to them directly; Ava coordinates them.'],
        ['Routing', "Ava deciding which model to use for each step so you get good answers without overpaying. It happens automatically — \"routing mode\" just picks the overall strategy."],
        ['Tool', 'A specific action Ava can take — read a file, run a search, send an email. A "tool call" is her using one. She asks permission before anything risky.'],
        ['Token', 'How AI measures text — roughly ¾ of a word. Models are priced per million tokens. Mostly something you can ignore.'],
        ['Credit', "Ava's simpler unit for what an action costs, so you are not doing token maths. Plans come with a monthly bundle."],
        ['API key', 'A private password that lets software use a paid service (like an AI model) on your account. You only need one if you want to bring your own.'],
        ['BYOK', "\"Bring Your Own Key.\" Using your own API key instead of Ava's managed access. Optional — for people who already pay a provider directly."],
        ['Local-first', "Your data lives on your own computer by default. Nothing is uploaded unless you switch on sync. \"Local is sacred.\""],
        ['Permission mode', 'How cautious Ava is before doing things — ask every time, ask for risky things only, or just go. You set the level.'],
        ['Context window', "How much text a model can hold in mind at once — its short-term memory. \"1M context\" means about a million words. Bigger = it can read more before forgetting."],
        ['Diff', 'A side-by-side view of exactly what will change in a file — old on one side, new on the other — shown before Ava changes anything so you can approve it.'],
        ['Repository (repo)', 'A project folder tracked for changes, usually with Git. If that means nothing to you yet, it is just "the folder my project lives in."'],
        ['Prompt', 'What you type to the AI — your question or instruction.'],
      ]},
      { type: 'callout', variant: 'note', text: 'Still stuck on a word? Ask Ava in Chat mode — "what does X mean?" — and she will explain it for your level.' },
    ],
  },
];
