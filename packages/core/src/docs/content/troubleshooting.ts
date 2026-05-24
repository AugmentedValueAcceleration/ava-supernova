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

      { type: 'heading', level: 3, text: 'Sign-in loops' },
      { type: 'paragraph', text: 'What you see: you sign in, but Ava keeps asking you to sign in again — a loop that never lets you through.' },
      { type: 'paragraph', text: 'The fix is to clear the saved sign-in details and start fresh: in the extension run "Ava: Sign Out" from the command palette, in the IDE use Settings → Account → Sign Out, in the CLI delete the file at ~/.ava/auth.json (a small sign-in file in a folder named .ava in your home directory). Then sign in again.' },

      { type: 'heading', level: 3, text: 'Token exhausted' },
      { type: 'paragraph', text: 'What you see: a message that you are out of free usage for the month. ("Tokens" are how AI usage is measured — "exhausted" just means you have used up this month\'s free allowance.)' },
      { type: 'paragraph', text: 'Free-tier monthly budget resets on the 1st of each month. Until then, switch to a BYOK provider (use your own API key) to keep working. Your account remains active — only the free platform-managed requests are paused.' },
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
      { type: 'paragraph', text: 'In plain terms: if something is wrong and the fixes above did not help, send us a message about it. The easiest way is to just ask Ava to do it for you.' },
      { type: 'paragraph', text: 'If a problem is not covered by common errors, file a support ticket (send the support team a request for help). You can do it inside Ava (no form to fill out) or on the web.' },
      { type: 'heading', level: 3, text: 'From inside Ava' },
      { type: 'paragraph', text: 'Ask her to file it. "Ava, can you file a support ticket about this?" She calls support_request, attaches the relevant session context (with credentials redacted), and sends it. Fastest path.' },
      { type: 'heading', level: 3, text: 'From the web' },
      { type: 'paragraph', text: 'Visit ava-supernova.com/support. Pick a category (bug, feature, account, security, general) and describe what happened. Response within one working day.' },
      { type: 'heading', level: 3, text: 'What to include' },
      { type: 'list', ordered: false, items: [
        'What you were trying to do.',
        'What actually happened.',
        'Which surface (extension, IDE, CLI, companion) and which version.',
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
        'Email security@ava-supernova.com with a description, reproduction steps, and your preferred disclosure window.',
        'Or file a support ticket with category "security" — same triage queue.',
        'We acknowledge within 24 hours.',
      ]},
      { type: 'heading', level: 3, text: 'Our commitments' },
      { type: 'list', ordered: false, items: [
        'Coordinated disclosure — we agree a timeline with you before anything is public. Default is 90 days.',
        'Credit — you are credited in the fix notes unless you prefer anonymity.',
        'No legal retaliation — good-faith research is welcome. We will not send lawyers after you.',
      ]},
      { type: 'callout', variant: 'note', text: 'The security page at ava-supernova.com/security has the full posture — architecture guarantees, redactor, permission gates.' },
    ],
  },
];
