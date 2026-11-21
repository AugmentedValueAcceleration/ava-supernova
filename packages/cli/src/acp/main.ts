/**
 * Ava in Unreal Editor's Assistant panel — the program Unreal starts (plan
 * 2026-11-18-unreal, Phase 2). Unreal: Edit → Editor Preferences → Unreal
 * Assistant → External Agent → Custom; the command runs this file.
 *
 * Standard output carries the protocol and nothing else: one stray log line
 * there and the panel can't read Ava. So every console method goes to
 * standard error before anything else loads — core's logger writes info and
 * debug with console.info / console.debug, which Node sends to stdout.
 */

const toErr = (...a: unknown[]) => { process.stderr.write(`${a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')}\n`); };
console.log = toErr;
console.info = toErr;
console.debug = toErr;
console.warn = toErr;

// Installed (~/.ava/bin/ava-unreal): the PDF fonts sit beside the program, as in the IDE.
{
  const { existsSync } = await import('node:fs');
  const { dirname, join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const fonts = join(dirname(fileURLToPath(import.meta.url)), 'fonts');
  if (!process.env.AVA_FONTS_DIR && existsSync(join(fonts, 'NotoSans-Regular.ttf'))) process.env.AVA_FONTS_DIR = fonts;
}

// The usage ledger (~/.ava/usage): what the Assistant panel in Unreal spends
// shows on the Usage timeline in the extension and the IDE, filed as 'unreal'.
const { configureUsageLedger } = await import('@ava/core');
configureUsageLedger({ surface: 'unreal' });

const { JsonRpc } = await import('./rpc.js');
const { AcpServer } = await import('./server.js');

const log = (line: string) => process.stderr.write(`[ava] ${line}\n`);
const rpc = new JsonRpc(process.stdin, process.stdout, log);
const server = new AcpServer(rpc, log);

process.on('unhandledRejection', (e) => log(`Unhandled: ${e instanceof Error ? e.stack ?? e.message : String(e)}`));

await rpc.start();
// Unreal closed the chat: save it, let memory tidy up, then go.
await server.close().catch(() => {});
process.exit(0);
