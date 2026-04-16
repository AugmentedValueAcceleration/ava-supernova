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
      { type: 'paragraph', text: 'Most errors have a short, specific cause. Here are the common ones and how to fix them.' },

      { type: 'heading', level: 3, text: 'Model not responding' },
      { type: 'paragraph', text: 'Check the status indicator in the chat header. If it says "connecting", your provider is reachable but slow — give it thirty seconds. If it says "unavailable", Ava auto-fell-back to the next model in the chain. If nothing at all, verify your API key in Settings and test the connection.' },

      { type: 'heading', level: 3, text: 'Tool call failed' },
      { type: 'paragraph', text: 'Click the failed tool call to see the error. Common causes: a path outside the project root (blocked by path traversal guard), a shell command that needs a directory change, or a file that got moved since Ava last read it. Tell her what went wrong — she will retry with corrections.' },

      { type: 'heading', level: 3, text: 'Memory not recalling' },
      { type: 'paragraph', text: 'Memory is semantic, not literal. "What did I decide about auth?" works better than "find my auth decision". If the memory is definitely there but not surfacing, open the memory browser and search — if it is not there, it was never saved.' },

      { type: 'heading', level: 3, text: 'Sign-in loops' },
      { type: 'paragraph', text: 'Clear cached credentials: in the extension run "Ava: Sign Out" from the command palette, in the IDE use Settings → Account → Sign Out, in the CLI delete ~/.ava/auth.json. Sign in again.' },

      { type: 'heading', level: 3, text: 'Token exhausted' },
      { type: 'paragraph', text: 'Free-tier monthly budget resets on the 1st of each month. Until then, switch to a BYOK provider to keep working. Your account remains active — only platform-managed requests are paused.' },
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
      { type: 'paragraph', text: 'When you need the raw picture — what tool was called, what arguments it got, what the provider returned — the logs are plain text files in ~/.ava/logs/.' },
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
      { type: 'paragraph', text: 'If a problem is not covered by common errors, file a support ticket. You can do it inside Ava (no form to fill out) or on the web.' },
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
      { type: 'paragraph', text: 'Found a vulnerability? Thank you. We take every report seriously and work with you on the fix before any public disclosure.' },
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
