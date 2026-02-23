import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import chalk from 'chalk';
import { t } from '@ava/core';
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
    key: 'qwen',
    displayName: 'Qwen (Alibaba Cloud)',
    keyUrl: 'https://bailian.console.alibabacloud.com/#/model-market/detail/qwen3.5-plus',
  },
];

export async function runSetupWizard(
  config: ConfigManager,
  registry: ProviderRegistry,
): Promise<void> {
  const rl = readline.createInterface({ input: stdin, output: stdout });

  console.log('');
  console.log(chalk.hex(THEME.accent).bold('  ' + t('setup.welcome')));
  console.log(chalk.dim('  ' + t('setup.intro') + '\n'));

  for (let i = 0; i < PROVIDERS.length; i++) {
    console.log(`  ${i + 1}. ${PROVIDERS[i].displayName}`);
  }

  const choice = await rl.question('\n  ' + t('setup.choose'));
  const choiceIdx = parseInt(choice, 10) - 1;

  if (choiceIdx < 0 || choiceIdx >= PROVIDERS.length) {
    console.log(chalk.red('  ' + t('setup.invalid_choice')));
    rl.close();
    return;
  }

  const selected = PROVIDERS[choiceIdx];

  console.log(chalk.dim('\n  ' + t('setup.key_url', { url: selected.keyUrl })));
  const apiKey = await rl.question('  ' + t('setup.enter_key', { provider: selected.displayName }));

  if (!apiKey.trim()) {
    console.log(chalk.red('  ' + t('setup.no_key')));
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
    console.log(chalk.green('\n  ' + t('setup.complete', { model: models[0].name })));
  }

  rl.close();
}
