import type { DocPage } from '../types.js';

// Section 2 — Core concepts. Useful to everyone.

export const CONCEPT_PAGES: DocPage[] = [
  {
    id: 'concepts.modes',
    title: 'The six modes',
    audience: ['both'],
    surfaces: ['web', 'ext', 'ide'],
    order: 10,
    section: 'concepts',
    body: [
      { type: 'paragraph', text: 'Modes change how Ava thinks, not what she can do. The same agent, the same memory, but a different mindset and a different team of specialists behind her. Type a two-character prefix to switch, or pick from the mode selector.' },
      { type: 'facts', kind: 'modes' },
      { type: 'heading', level: 3, text: 'When to use which' },
      { type: 'list', ordered: false, items: [
        'Work (>>) — you know what you want and you want it built. Full tool access. For complex multi-file work the persona team runs automatically.',
        'Plan (::) — you want a considered approach before any code changes. Read-only. You get a plan you can approve, edit, or discard.',
        'Chat (..) — you want to talk. About life, about an idea, about nothing in particular. She has memory, news, weather, and journal — and no personas.',
        'Teach (??) — you want to learn. Curriculum, lessons, quizzes, spaced repetition. Free on every plan forever.',
        'Security (!!) — you want the whole project audited. Five specialists systematically check OWASP categories and CVEs, then produce a severity-sorted report.',
        'Brainstorm (**) — you want ideas. Grounded in your context, challenged before they leave the room, refined into next steps.',
      ]},
      { type: 'callout', variant: 'tip', text: 'You can switch modes mid-conversation. Memory carries across. The specialists do not.' },
    ],
  },
  {
    id: 'concepts.memory',
    title: 'Memory — how Ava remembers you',
    audience: ['both'],
    surfaces: ['web', 'ext', 'ide'],
    order: 20,
    section: 'concepts',
    body: [
      { type: 'paragraph', text: 'Ava has a persistent memory that survives across conversations, across projects, and across machines if you enable sync. It is not a chat log. It is a structured, searchable understanding of who you are, what you like, and what you have decided.' },
      { type: 'heading', level: 3, text: 'Five layers' },
      { type: 'list', ordered: true, items: [
        'Extract — key facts captured from every message in real time.',
        'Reflect — deeper analysis runs at the end of meaningful sessions. Patterns, themes, contradictions.',
        'Accumulate — corrections and preferences compound over weeks and months.',
        'Analyse — the graph engine links related memories and flags contradictions when new information conflicts with old.',
        'Consolidate — similar memories merge; stale ones prune. Memory gets sharper over time, not noisier.',
      ]},
      { type: 'heading', level: 3, text: 'Recall' },
      { type: 'paragraph', text: 'When you ask a question, Ava searches memory by meaning (semantic search), not keywords. Mode-specific filters run alongside — Chat mode pulls personal context, Work mode pulls project decisions and code patterns.' },
      { type: 'callout', variant: 'note', text: 'Memory is scoped per-user and per-project. Secrets and credentials are blocked at the save boundary — they can never land in memory.' },
    ],
  },
  {
    id: 'concepts.tasks-journal',
    title: 'Tasks and journal',
    audience: ['both'],
    surfaces: ['web', 'ext', 'ide'],
    order: 30,
    section: 'concepts',
    body: [
      { type: 'paragraph', text: 'Three things that sound similar and are not: memory, tasks, and journal. Here is when to use which.' },
      { type: 'list', ordered: false, items: [
        'Memory — persistent facts. Preferences, decisions, patterns. Asked about repeatedly, rarely created manually.',
        'Tasks — things to do. Action items with due dates and status. You tick them off when done.',
        'Journal — reflection. Daily log, dual entries (yours and Ava observations about the session). Useful for mood tracking, session reviews, context for tomorrow.',
      ]},
      { type: 'paragraph', text: 'Ava writes to all three when it makes sense. You can write to any of them directly from the dashboard. Nothing is locked to a surface — tasks created in the CLI appear in the IDE.' },
    ],
  },
  {
    id: 'concepts.permissions',
    title: 'Permissions — three modes, ten categories',
    audience: ['both'],
    surfaces: ['web', 'ext', 'ide'],
    order: 40,
    section: 'concepts',
    body: [
      { type: 'paragraph', text: 'Ava has 62 tools. Every tool belongs to a category (file operations, shell, git, web, media, database, system, documents, memory, learning). Every tool call passes through the permission gate before it executes. You control what gets auto-approved, what asks once, and what always asks.' },
      { type: 'facts', kind: 'permissions' },
      { type: 'paragraph', text: 'Balanced is the default. Strict for when you are auditing her behaviour. Autonomous for when you want her to just go.' },
      { type: 'callout', variant: 'warning', text: 'Autonomous does not mean unchecked. Plans, clarifying questions, and explicit ask-user prompts still pause for your input. Irreversible operations (git force-push, database drops) always confirm regardless of mode.' },
    ],
  },
  {
    id: 'concepts.interjection',
    title: 'Interjection and hard-stop',
    audience: ['both'],
    surfaces: ['web', 'ext', 'ide'],
    order: 50,
    section: 'concepts',
    body: [
      { type: 'paragraph', text: 'Ava runs until her plan completes or you stop her. You have two ways to intervene while she is running.' },
      { type: 'heading', level: 3, text: 'Interject — steer without cancelling' },
      { type: 'paragraph', text: 'Type a new message while Ava is working. She finishes her current tool call, reads your message, and adjusts her plan. No context is lost. Use this when you want to redirect, add information, or change priorities mid-run.' },
      { type: 'heading', level: 3, text: 'Hard-stop — cancel and clear' },
      { type: 'paragraph', text: 'Press Escape (CLI), click Stop (extension, IDE), or type a stop command. The current run cancels, pending tool calls drop, and the conversation is ready for a fresh turn.' },
      { type: 'callout', variant: 'tip', text: 'Interject first. Hard-stop is for when something is genuinely wrong. Interjecting keeps the thread alive.' },
    ],
  },
];
