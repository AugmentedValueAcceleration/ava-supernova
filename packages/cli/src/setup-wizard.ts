import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import chalk from 'chalk';
import { t, testProviderKey, ProviderRegistry } from '@ava/core';
import type { ConfigManager } from '@ava/core';
import { THEME } from './cli/theme.js';
import { CHAT_PROVIDERS, BRAVE, registryName, type KeyProvider } from './providers-list.js';
import { saveProviderKey, saveLocalModel } from './shared.js';

/**
 * First run, key-first — the same order as the extension's and the IDE's key
 * screens. Runs only when this machine has no way to chat at all: a key added
 * in the extension or the IDE is already in the shared keychain, so someone
 * with either app never sees this. Every key is tested before it is saved.
 */
export async function runSetupWizard(config: ConfigManager): Promise<void> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const accent = chalk.hex(THEME.accent);
  const dim = chalk.dim;
  const ok = chalk.hex(THEME.success);
  const bad = chalk.hex(THEME.error);

  console.log('');
  console.log(accent.bold('  ' + t('setup.welcome')));
  console.log(dim('  Ava runs on your own AI provider key. It is tested, then kept in your'));
  console.log(dim('  system keychain on this machine — it never comes to us. The extension'));
  console.log(dim('  and the IDE use the same keychain, so you only add a key once.'));
  console.log('');

  CHAT_PROVIDERS.forEach((p, i) => {
    console.log(accent(`  ${i + 1}.`) + chalk.bold(` ${p.name}`) + dim(` — ${p.note}`));
  });
  const localIdx = CHAT_PROVIDERS.length + 1;
  console.log(accent(`  ${localIdx}.`) + chalk.bold(' A local model') + dim(' — Ollama, LM Studio, or any server with the standard API format'));
  console.log(dim(`  ${localIdx + 1}. Skip for now`));
  console.log('');

  const choice = parseInt(await rl.question(accent('  > ') + t('setup.choose')), 10);
  if (isNaN(choice) || choice < 1 || choice > localIdx + 1) {
    console.log(bad('  ' + t('setup.invalid_choice')));
    rl.close();
    return;
  }
  if (choice === localIdx + 1) {
    console.log(dim('\n  Skipped. Run /provider add <name> later.\n'));
    rl.close();
    return;
  }

  if (choice === localIdx) {
    await setUpLocalModel(rl, config);
    rl.close();
    return;
  }

  const selected = CHAT_PROVIDERS[choice - 1];
  const key = await askForWorkingKey(rl, selected);
  if (!key) { rl.close(); return; }

  const registry = new ProviderRegistry();
  registry.register(registryName(selected.id), { apiKey: key });
  const models = registry.get(registryName(selected.id))?.listModels() ?? [];
  if (models.length > 0) {
    await config.set('activeModel', `${registryName(selected.id)}:${models[0].id}`);
    console.log(ok('  ✓ ' + t('setup.complete', { model: models[0].name })));
  }

  // Better web search is one more optional key.
  console.log('');
  console.log(dim(`  ${BRAVE.name}: ${BRAVE.note}`));
  console.log(dim('  ' + t('setup.key_url', { url: BRAVE.url })));
  const brave = (await rl.question(accent('  > ') + 'Brave Search key (Enter to skip): ')).trim();
  if (brave) {
    const r = await testProviderKey('brave', brave);
    if (r.status === 'invalid') console.log(bad(`  ${r.message} Not saved — add it later with /provider add brave.`));
    else { saveProviderKey('brave', brave); console.log(ok('  ✓ Brave Search key saved.')); }
  }

  console.log(dim('  Use /model to see every model your keys unlock.'));
  console.log('');
  rl.close();
}

/** Ask for a key until the provider accepts it (or the user gives up). */
export async function askForWorkingKey(rl: readline.Interface, p: KeyProvider): Promise<string | undefined> {
  const accent = chalk.hex(THEME.accent);
  console.log('');
  console.log(chalk.dim(`  ${p.note}`));
  console.log(chalk.dim('  ' + t('setup.key_url', { url: p.url })));
  for (;;) {
    const key = (await rl.question(accent('  > ') + t('setup.enter_key', { provider: p.name }))).trim();
    if (!key) {
      console.log(chalk.hex(THEME.error)('  ' + t('setup.no_key')));
      return undefined;
    }
    process.stdout.write(chalk.dim('  Testing the key…'));
    const r = await testProviderKey(p.id, key);
    process.stdout.write('\r\x1b[K');
    if (r.status === 'invalid') {
      console.log(chalk.hex(THEME.error)(`  ${r.message}`));
      console.log(chalk.dim('  Paste it again, or press Enter to stop.'));
      continue;
    }
    // 'unverified' is saved: a provider we could not reach is not a key we know is wrong.
    if (r.status === 'unverified') console.log(chalk.dim(`  ${r.message}`));
    saveProviderKey(p.id, key);
    console.log(chalk.hex(THEME.success)(`  ✓ ${p.name} key works and is saved.`));
    return key;
  }
}

async function setUpLocalModel(rl: readline.Interface, config: ConfigManager): Promise<void> {
  const accent = chalk.hex(THEME.accent);
  const bad = chalk.hex(THEME.error);
  console.log('');
  console.log(chalk.dim('  The base URL of your server (e.g. http://localhost:11434/v1 for Ollama)'));
  const baseUrl = (await rl.question(accent('  > ') + 'Base URL: ')).trim();
  try {
    const u = new URL(baseUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('protocol');
  } catch {
    console.log(bad('  Invalid URL. Must start with http:// or https://'));
    return;
  }
  const modelName = (await rl.question(accent('  > ') + 'Model name (e.g. qwen2.5-coder:7b): ')).trim();
  if (!modelName) { console.log(bad('  No model name provided.')); return; }
  const apiKey = (await rl.question(accent('  > ') + 'API key (Enter if your server needs none): ')).trim();
  // ~/.ava/settings.json + the shared keychain — the extension and the IDE
  // pick it up too.
  saveLocalModel({ baseUrl, modelName, label: '', models: [modelName], apiKey: apiKey || undefined });
  await config.set('activeModel', `generic:${modelName}`);
  console.log('');
  console.log(chalk.hex(THEME.success)(`  ✓ ${modelName} at ${baseUrl} is set up.`));
  console.log('');
}
