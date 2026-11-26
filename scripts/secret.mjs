#!/usr/bin/env node
/**
 * Release and admin tokens, kept in the OS keychain (Windows Credential
 * Manager here) instead of plaintext .env files.
 *
 * Security review, 25 Nov 2026: the GitHub release token, the Marketplace
 * token and the Render / Supabase admin tokens sat in .env.local files that any
 * program on this machine could read. These are only ever used BY HAND (a
 * release, a migration, a deploy check), so nothing at runtime needs them in a
 * file.
 *
 *   node scripts/secret.mjs import NAME path/to/.env.local
 *       Moves NAME's value from that file into the keychain, then deletes the
 *       line. The value is never printed.
 *   <program> | node scripts/secret.mjs set NAME
 *       Stores the value piped in on stdin.
 *   node scripts/secret.mjs has NAME      "yes (N chars)" or "no"
 *   node scripts/secret.mjs get NAME      prints the value — only ever inside
 *                                         $(...), never on its own
 *   node scripts/secret.mjs delete NAME
 *
 * In code: `import { readSecret } from './secret.mjs'`.
 */
import { Entry } from '@napi-rs/keyring';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Separate from the service names Ava herself uses for users' keys. */
const SERVICE = 'ava-supernova-maintainer';

export function readSecret(name) {
  try { return new Entry(SERVICE, name).getPassword() || null; } catch { return null; }
}

function importFromEnv(name, file) {
  const text = readFileSync(file, 'utf-8');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const i = lines.findIndex((l) => l.startsWith(`${name}=`));
  if (i < 0) throw new Error(`${name} is not in ${file}`);
  const value = lines[i].slice(name.length + 1).trim().replace(/^["']|["']$/g, '');
  if (!value) throw new Error(`${name} is empty in ${file}`);
  new Entry(SERVICE, name).setPassword(value);
  if (readSecret(name) !== value) throw new Error(`${name} did not read back from the keychain; the file was left as it was`);
  lines.splice(i, 1);
  writeFileSync(file, lines.join(eol));
  console.log(`${name}: moved to the keychain (${value.length} chars) and removed from ${file}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd, name, file] = process.argv.slice(2);
  try {
    if (cmd === 'import' && name && file) importFromEnv(name, file);
    else if (cmd === 'set' && name) {
      // Value arrives on stdin (piped by another program), never as an argument.
      const value = readFileSync(0, 'utf-8').replace(/\r?\n$/, '');
      if (!value) throw new Error('nothing on stdin');
      new Entry(SERVICE, name).setPassword(value);
      if (readSecret(name) !== value) throw new Error(`${name} did not read back from the keychain`);
      console.log(`${name}: stored (${value.length} chars)`);
    }
    else if (cmd === 'has' && name) { const v = readSecret(name); console.log(v ? `yes (${v.length} chars)` : 'no'); }
    else if (cmd === 'get' && name) { const v = readSecret(name); if (!v) { console.error(`${name} is not in the keychain`); process.exit(1); } process.stdout.write(v); }
    else if (cmd === 'delete' && name) { new Entry(SERVICE, name).deletePassword(); console.log(`${name}: deleted`); }
    else { console.error('usage: secret.mjs import NAME FILE | set NAME (stdin) | has NAME | get NAME | delete NAME'); process.exit(2); }
  } catch (err) { console.error(err.message); process.exit(1); }
}
