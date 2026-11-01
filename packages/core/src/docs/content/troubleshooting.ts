import type { DocPage } from '../types.js';

// Section 5 — Troubleshooting & support. New content — no surface has this today.

export const TROUBLESHOOTING_PAGES: DocPage[] = [
  {
    id: 'troubleshooting.common-errors',
    title: 'Common errors',
    audience: ['both'],
    surfaces: ['web', 'ext', 'ide'],
    order: 10,
    section: 'troubleshooting',
    body: [
      { type: 'paragraph', text: 'Most errors have a short, specific cause. Here are the common ones and how to fix them. Do not worry if the wording sounds technical — each one below tells you what you are actually seeing and exactly what to do.' },

      { type: 'heading', level: 3, text: 'Model not responding' },
      { type: 'paragraph', text: 'What you see: Ava goes quiet and does not reply.' },
      { type: 'paragraph', text: 'Check the status indicator in the chat header. If it says "connecting", your provider (the AI service Ava is talking to) is reachable but slow — give it thirty seconds. If it says "unavailable", Ava auto-fell-back to the next model in the chain (she automatically switched to a backup model). If nothing at all, verify your API key in Settings and test the connection. (An API key is the private password that lets Ava use a paid AI service.)' },

      { type: 'heading', level: 3, text: 'Tool call failed' },
      { type: 'paragraph', text: 'What you see: one of Ava\'s steps (a "tool call" — her reading a file, running a command, and so on) shows a red error instead of finishing.' },
      { type: 'paragraph', text: 'Click the failed tool call to see the error. Common causes: she tried to touch a file outside your project folder, which is blocked on purpose for your safety (this guard is called "path traversal" protection — it stops her wandering outside the folder you are working in); a command that needs to run in a different folder; or a file that got moved since Ava last looked at it. Tell her what went wrong — she will retry with corrections.' },

      { type: 'heading', level: 3, text: 'Memory not recalling' },
      { type: 'paragraph', text: 'What you see: Ava cannot find something you are sure she should remember.' },
      { type: 'paragraph', text: 'Memory works by meaning, not exact words (this is what "semantic" means). So "What did I decide about auth?" works better than "find my auth decision". If the memory is definitely there but not surfacing, open the memory browser and search — if it is not there, it was never saved in the first place.' },

      { type: 'heading', level: 3, text: 'Ava says she needs a key' },
      { type: 'paragraph', text: 'What you see: the chat will not start, or Ava says a key is missing for images, voice or video.' },
      { type: 'paragraph', text: 'Ava runs on your own API key — there is no account to fall back on. Add a Qwen key in Settings (see "Getting your Qwen key"). If you already added one and it is refused, check it was made in the Singapore region: a key only works in the region it came from. New Qwen keys start with sk-ws.' },

      { type: 'heading', level: 3, text: 'The provider says you are out of quota' },
      { type: 'paragraph', text: "What you see: an error from the AI provider about quota, billing or payment — from Alibaba it often says \"Arrearage\", which means the account has an unpaid bill." },
      { type: 'paragraph', text: "That message comes from your provider, not from Ava — Ava has no allowance or credits of her own. Open the provider's console (Model Studio for Qwen), check the billing page and settle or top up there. Everything works again as soon as the provider does." },
    ],
  },
  {
    id: 'troubleshooting.logs',
    title: 'Where logs live',
    audience: ['power'],
    surfaces: ['web', 'ext', 'ide'],
    order: 20,
    section: 'troubleshooting',
    body: [
      { type: 'paragraph', text: 'A "log" is just a diary your computer keeps of what happened — useful when something breaks and you (or support) need to see the details.' },
      { type: 'paragraph', text: 'When you need the raw picture — what tool was called, what information it got, what the AI service returned — the logs are plain text files in a folder on your computer at ~/.ava/logs/ (a folder named .ava in your home directory, with a logs folder inside it).' },
      { type: 'list', ordered: false, items: [
        '~/.ava/logs/session-<date>.log — per-session transcripts including tool calls, streamed responses, and errors.',
        '~/.ava/logs/extension.log — VS Code extension host log. Activation failures, panel errors.',
        '~/.ava/logs/ide.log — desktop IDE log. Sidecar process messages, Rust panics.',
        '~/.ava/logs/cli.log — CLI REPL log.',
      ]},
      { type: 'paragraph', text: 'In the extension, "Ava: Show Logs" in the command palette opens the relevant log in an editor tab. In the IDE, Settings → Diagnostics has a "Open Logs" button. The CLI can tail its own log with  ava logs --follow.' },
      { type: 'callout', variant: 'warning', text: 'Logs may contain snippets of the project files Ava read during a session. Review before sharing.' },
    ],
  },
  {
    id: 'troubleshooting.support-request',
    title: 'Filing a support request',
    audience: ['both'],
    surfaces: ['web', 'ext', 'ide'],
    order: 30,
    section: 'troubleshooting',
    body: [
      { type: 'paragraph', text: 'In plain terms: if something is wrong and the fixes above did not help, tell us. A person on the Ava team answers — and the easiest way to start is to ask Ava to help you write it.' },
      { type: 'heading', level: 3, text: 'Questions, bugs and ideas: the Discord' },
      { type: 'paragraph', text: 'Join the Ava Supernova Discord at discord.gg/bbtnKMW4rf and post in #help, #bug-reports or #feature-requests. Answers stay searchable, so they help the next person too. "Ava, help me write this up for the Discord" gets you a post ready to paste.' },
      { type: 'heading', level: 3, text: 'Anything private: email' },
      { type: 'paragraph', text: 'For your data, a security issue or a donation question, email support@avasupernova.com. Ask Ava and she drafts the email and opens it in your own mail app — you check it and press send. Nothing is sent without you.' },
      { type: 'heading', level: 3, text: 'What to include' },
      { type: 'list', ordered: false, items: [
        'What you were trying to do.',
        'What actually happened.',
        'Which surface (extension, IDE, CLI) and which version.',
        'Any error message or log excerpt. Redact credentials first.',
      ]},
    ],
  },
  {
    id: 'troubleshooting.security-disclosure',
    title: 'Reporting security issues',
    audience: ['both'],
    surfaces: ['web', 'ext', 'ide'],
    order: 40,
    section: 'troubleshooting',
    body: [
      { type: 'paragraph', text: 'In plain terms: if you have spotted a way Ava could be broken into or misused (a "vulnerability" — a security weakness), please tell us privately first so we can fix it before anyone can take advantage. This page is how.' },
      { type: 'paragraph', text: 'Found a vulnerability? Thank you. We take every report seriously and work with you on the fix before any public disclosure (before the problem is announced publicly).' },
      { type: 'heading', level: 3, text: 'How to report' },
      { type: 'list', ordered: true, items: [
        'Email support@avasupernova.com with "Security" in the subject, a description, reproduction steps, and your preferred disclosure window. Please do not post it on the Discord.',
        'We acknowledge within 24 hours.',
      ]},
      { type: 'heading', level: 3, text: 'Our commitments' },
      { type: 'list', ordered: false, items: [
        'Coordinated disclosure — we agree a timeline with you before anything is public. Default is 90 days.',
        'Credit — you are credited in the fix notes unless you prefer anonymity.',
        'No legal retaliation — good-faith research is welcome. We will not send lawyers after you.',
      ]},
      { type: 'callout', variant: 'note', text: 'The security page at avasupernova.com/security has the full posture — architecture guarantees, redactor, permission gates.' },
    ],
  },
];
