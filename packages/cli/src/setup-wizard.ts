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
    description: 'Best price/performance, strong reasoning',
    keyUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    key: 'kimi',
    displayName: 'Kimi (Moonshot AI)',
    description: 'Best multi-step tool calling, 76.8% SWE-Bench',
    keyUrl: 'https://platform.moonshot.ai/console/api-keys',
  },
  {
    key: 'qwen',
    displayName: 'Qwen (Alibaba Cloud)',
    description: 'Strong all-round, 1M context window',
    keyUrl: 'https://bailian.console.alibabacloud.com/#/model-market/detail/qwen3.5-plus',
  },
  {
    key: 'zhipu',
    displayName: 'GLM (Zhipu AI)',
    description: '77.8% SWE-Bench, best tool-call reliability',
    keyUrl: 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys',
  },
  {
    key: 'mistral',
    displayName: 'Mistral AI',
    description: 'European provider, 256K context, Codestral',
    keyUrl: 'https://console.mistral.ai/api-keys',
  },
];

export async function runSetupWizard(
  config: ConfigManager,
  registry: ProviderRegistry,
): Promise<void> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const accent = chalk.hex(THEME.accent);
  const dim = chalk.dim;

  console.log('');
  console.log(accent.bold('  ' + t('setup.welcome')));
  console.log(dim('  ' + t('setup.intro')));
  console.log('');

  // Show providers with descriptions
  console.log(accent('  Available providers:'));
  console.log('');
  for (let i = 0; i < PROVIDERS.length; i++) {
    const p = PROVIDERS[i];
    console.log(
      accent(`  ${i + 1}.`) +
      chalk.bold(` ${p.displayName}`) +
      dim(` — ${p.description}`),
    );
  }
  console.log(dim(`  ${PROVIDERS.length + 1}. Skip for now`));
  console.log('');

  const choice = await rl.question(accent('  > ') + t('setup.choose'));
  const choiceIdx = parseInt(choice, 10) - 1;

  // Skip option
  if (choiceIdx === PROVIDERS.length) {
    console.log(dim('\n  Skipped. Run /provider add <name> later to configure.\n'));
    rl.close();
    return;
  }

  if (choiceIdx < 0 || choiceIdx >= PROVIDERS.length) {
    console.log(chalk.hex(THEME.error)('  ' + t('setup.invalid_choice')));
    rl.close();
    return;
  }

  const selected = PROVIDERS[choiceIdx];

  console.log('');
  console.log(dim('  ' + t('setup.key_url', { url: selected.keyUrl })));
  console.log('');
  const apiKey = await rl.question(accent('  > ') + t('setup.enter_key', { provider: selected.displayName }));

  if (!apiKey.trim()) {
    console.log(chalk.hex(THEME.error)('  ' + t('setup.no_key')));
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
    console.log('');
    console.log(chalk.hex(THEME.success)('  \u2713 ' + t('setup.complete', { model: models[0].name })));
    console.log(dim('  Use /model to see all available models.'));
  }

  console.log('');
  rl.close();
}
