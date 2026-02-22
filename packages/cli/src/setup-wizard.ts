import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import chalk from 'chalk';
import type { ConfigManager, ProviderRegistry, ProviderSettings } from '@ava/core';
import { THEME } from './cli/theme.js';

const PROVIDERS = [
  {
    key: 'deepseek',
    displayName: 'DeepSeek',
    keyUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    key: 'kimi',
    displayName: 'Kimi (Moonshot AI)',
    keyUrl: 'https://platform.moonshot.ai/console/api-keys',
  },
  {
    key: 'zhipu',
    displayName: 'Zhipu AI (GLM)',
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
  },
  {
    key: 'mistral',
    displayName: 'Mistral AI',
    keyUrl: 'https://console.mistral.ai/api-keys/',
  },
];

export async function runSetupWizard(
  config: ConfigManager,
  registry: ProviderRegistry,
): Promise<void> {
  const rl = readline.createInterface({ input: stdin, output: stdout });

  console.log('');
  console.log(chalk.hex(THEME.accent).bold('  Welcome to Ava | Supernova'));
  console.log(chalk.dim("  Let's set up your LLM provider.\n"));

  for (let i = 0; i < PROVIDERS.length; i++) {
    console.log(`  ${i + 1}. ${PROVIDERS[i].displayName}`);
  }

  const choice = await rl.question('\n  Choose a provider (number): ');
  const choiceIdx = parseInt(choice, 10) - 1;

  if (choiceIdx < 0 || choiceIdx >= PROVIDERS.length) {
    console.log(chalk.red('  Invalid choice. Please restart and try again.'));
    rl.close();
    return;
  }

  const selected = PROVIDERS[choiceIdx];

  console.log(chalk.dim(`\n  Get your API key at: ${selected.keyUrl}`));
  const apiKey = await rl.question(`  ${selected.displayName} API Key: `);

  if (!apiKey.trim()) {
    console.log(chalk.red('  No API key provided. Please restart and try again.'));
    rl.close();
    return;
  }

  const providers = await config.get('providers');
  (providers as Record<string, ProviderSettings>)[selected.key] = { apiKey: apiKey.trim() };
  await config.set('providers', providers);

  registry.register(selected.key, { apiKey: apiKey.trim() });
  const models = registry.get(selected.key)!.listModels();

  if (models.length > 0) {
    await config.set('activeModel', `${selected.key}:${models[0].id}`);
    console.log(chalk.green(`\n  Setup complete! Active model: ${models[0].name}`));
  }

  rl.close();
}
