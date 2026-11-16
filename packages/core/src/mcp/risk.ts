/**
 * What to point out before a server runs (the MCP spec's client rules: show the
 * exact command, say it runs code, and highlight what's risky — admin rights,
 * deleting, download-and-run, SSH keys, the whole home folder).
 *
 * Returns codes, not sentences: each app says them in the person's language.
 * A note is a heads-up for his decision, never a block — the choice is his.
 */

import { homedir } from 'node:os';
import type { McpServerEntry } from './servers-config.js';
import { isWebEntry } from './servers-config.js';
import { checkServerUrl, isLocalUrl } from './connection.js';

export type McpRiskCode =
  | 'admin'          // asks for administrator rights
  | 'deletes'        // deletes files or folders
  | 'download-run'   // downloads a script and runs it
  | 'hidden'         // runs encoded / hidden commands
  | 'keys-folder'    // reaches SSH or cloud keys
  | 'whole-home'     // can reach the whole home folder or a whole drive
  | 'plain-secret'   // a key or password written in plain text
  | 'latest'         // npx -y / uvx: fetches whatever version is newest each start
  | 'online'         // sends what Ava gives it to another computer
  | 'bad-url';       // an address that won't be used (http off this computer, not a web address)

export interface McpRiskNote {
  code: McpRiskCode;
  /** The part of the command it's about, as written. */
  detail?: string;
}

const SECRET_SHAPES = [
  /\bghp_[A-Za-z0-9]{20,}/, /\bgithub_pat_[A-Za-z0-9_]{20,}/, /\bsk-[A-Za-z0-9-_]{16,}/, /\bxox[abpr]-[A-Za-z0-9-]{10,}/,
  /\bAKIA[0-9A-Z]{16}\b/, /\bAIza[0-9A-Za-z_-]{30,}/, /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i,
];

function isWholeHomeOrDrive(arg: string): boolean {
  const a = arg.replace(/[\\/]+$/, '').trim();
  if (!a) return false;
  if (/^[a-zA-Z]:$/.test(a) || a === '' || arg.trim() === '/' || a === '~' || a === '$HOME' || a === '%USERPROFILE%' || a === '${userHome}') return true;
  const home = homedir().replace(/[\\/]+$/, '');
  return a.toLowerCase() === home.toLowerCase();
}

/** What to tell him about this server before it runs. */
export function riskNotes(e: McpServerEntry): McpRiskNote[] {
  const notes: McpRiskNote[] = [];
  const add = (code: McpRiskCode, detail?: string) => {
    if (!notes.some((n) => n.code === code && n.detail === detail)) notes.push({ code, ...(detail ? { detail } : {}) });
  };

  if (isWebEntry(e)) {
    const bad = checkServerUrl(e.url!);
    if (bad) add('bad-url', e.url);
    else if (!isLocalUrl(e.url!)) {
      try { add('online', new URL(e.url!).host); } catch { add('online'); }
    }
    for (const v of Object.values(e.headers ?? {})) {
      if (!v.includes('${') && (SECRET_SHAPES.some((r) => r.test(v)) || /^Bearer\s+[^\s$]{12,}$/i.test(v))) add('plain-secret', 'header');
    }
    return notes;
  }

  const parts = [e.command ?? '', ...(e.args ?? [])];
  const line = parts.join(' ');
  const lower = line.toLowerCase();
  const cmd = (e.command ?? '').toLowerCase().replace(/\.(exe|cmd|bat)$/, '').split(/[\\/]/).pop() ?? '';

  if (cmd === 'sudo' || cmd === 'runas' || cmd === 'doas' || /-verb\s+runas/.test(lower) || /\bsudo\b/.test(lower)) add('admin');
  if (/\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\b/.test(lower) || /\b(del|erase)\s+\/[sq]/.test(lower) || /\brmdir\s+\/s\b/.test(lower)
    || /remove-item\b[^|]*-recurse/.test(lower) || /\bformat(\.com)?\s+[a-z]:/.test(lower)) add('deletes');
  if (/\b(curl|wget|iwr|invoke-webrequest|irm|invoke-restmethod)\b[^|]*\|\s*(sh|bash|zsh|iex|invoke-expression|python3?|node)\b/.test(lower)) add('download-run');
  if (/\s-(e|en|enc|encodedcommand)\s+[a-z0-9+/=]{16,}/i.test(line)) add('hidden');
  for (const a of parts) {
    if (/[\\/]\.(ssh|aws|gnupg|azure|kube|docker)([\\/]|$)|\bid_(rsa|ed25519|ecdsa)\b/i.test(a)) add('keys-folder', a);
    if (isWholeHomeOrDrive(a) && a !== e.command) add('whole-home', a);
  }
  for (const v of [...parts, ...Object.values(e.env ?? {})]) {
    if (v.includes('${secret:')) continue;
    if (SECRET_SHAPES.some((r) => r.test(v))) add('plain-secret', v.length > 40 ? `${v.slice(0, 18)}…` : v);
  }
  if (/password|passwd|secret|token|api[_-]?key/i.test(Object.keys(e.env ?? {}).join(' '))) {
    for (const [k, v] of Object.entries(e.env ?? {})) {
      if (/password|passwd|secret|token|api[_-]?key/i.test(k) && v && !v.includes('${')) add('plain-secret', k);
    }
  }
  const firstPkg = (e.args ?? []).find((a) => !a.startsWith('-'));
  if ((cmd === 'npx' && (e.args ?? []).some((a) => a === '-y' || a === '--yes')) || cmd === 'uvx' || cmd === 'bunx') {
    if (firstPkg && !/@\d|==\d/.test(firstPkg.replace(/^@[^/]+\//, ''))) add('latest', firstPkg);
  }
  return notes;
}
