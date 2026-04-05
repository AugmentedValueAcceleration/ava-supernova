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
    live: true,
  },
  {
    key: 'kimi',
    displayName: 'Kimi (Moonshot AI)',
    description: 'Best multi-step tool calling, 76.8% SWE-Bench',
    keyUrl: 'https://platform.moonshot.ai/console/api-keys',
    live: true,
  },
  {
    key: 'qwen',
    displayName: 'Qwen (Alibaba Cloud)',
    description: 'Strong all-round, 1M context window',
    keyUrl: 'https://bailian.console.alibabacloud.com/#/model-market/detail/qwen3.5-plus',
    live: true,
  },
  {
    key: 'zhipu',
    displayName: 'GLM (Zhipu AI)',
    description: 'Free tier available, 77.8% SWE-Bench',
    keyUrl: 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys',
    live: true,
  },
  {
    key: 'mistral',
    displayName: 'Mistral AI',
    description: 'European provider, 256K context, Codestral',
    keyUrl: 'https://console.mistral.ai/api-keys',
    live: true,
  },
  {
    key: 'anthropic',
    displayName: 'Anthropic (Claude)',
    description: 'Claude Opus 4.6, Sonnet 4.6, Haiku 4.5',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    live: true,
  },
  {
    key: 'generic',
    displayName: 'Custom / Local (Ollama, LMStudio, etc.)',
    description: 'Any standard API format endpoint',
    keyUrl: '',
    live: true,
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

  // Split into live and coming soon
  const liveProviders = PROVIDERS.filter(p => p.live);
  const comingSoon = PROVIDERS.filter(p => !p.live);

  // Show live providers
  console.log(accent('  Available providers:'));
  console.log('');
  for (let i = 0; i < liveProviders.length; i++) {
    const p = liveProviders[i];
    console.log(
      accent(`  ${i + 1}.`) +
      chalk.bold(` ${p.displayName}`) +
      dim(` — ${p.description}`),
    );
  }
  console.log(dim(`  ${liveProviders.length + 1}. Skip for now`));

  // Show coming soon providers
  if (comingSoon.length > 0) {
    console.log('');
    console.log(dim('  Coming soon: ' + comingSoon.map(p => p.displayName).join(', ')));
  }
  console.log('');

  const choice = await rl.question(accent('  > ') + t('setup.choose'));
  const choiceIdx = parseInt(choice, 10) - 1;

  // Validate input is a number
  if (isNaN(choiceIdx)) {
    console.log(chalk.hex(THEME.error)('  ' + t('setup.invalid_choice')));
    rl.close();
    return;
  }

  // Skip option
  if (choiceIdx === liveProviders.length) {
    console.log(dim('\n  Skipped. Run /provider add <name> later to configure.\n'));
    rl.close();
    return;
  }

  if (choiceIdx < 0 || choiceIdx >= liveProviders.length) {
    console.log(chalk.hex(THEME.error)('  ' + t('setup.invalid_choice')));
    rl.close();
    return;
  }

  const selected = liveProviders[choiceIdx];

  // Generic provider needs base URL + model name, others need API key
  if (selected.key === 'generic') {
    console.log('');
    console.log(dim('  Enter the base URL of your API endpoint (e.g. http://localhost:11434/v1)'));
    const baseUrl = await rl.question(accent('  > ') + 'Base URL: ');
    if (!baseUrl.trim()) {
      console.log(chalk.hex(THEME.error)('  No URL provided.'));
      rl.close();
      return;
    }
    // Validate URL scheme — only HTTP(S) allowed
    try {
      const parsed = new URL(baseUrl.trim());
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('unsupported protocol');
      }
    } catch {
      console.log(chalk.hex(THEME.error)('  Invalid URL. Must start with http:// or https://'));
      rl.close();
      return;
    }

    const apiKey = await rl.question(accent('  > ') + 'API Key (leave empty if not required): ');
    const modelId = await rl.question(accent('  > ') + 'Model name (e.g. llama3, codellama): ');
    if (!modelId.trim()) {
      console.log(chalk.hex(THEME.error)('  No model name provided.'));
      rl.close();
      return;
    }

    const settings: ProviderSettings = {
      apiKey: apiKey.trim() || 'none',
      baseUrl: baseUrl.trim(),
    };

    const providers = await config.get('providers');
    (providers as Record<string, ProviderSettings>)[selected.key] = settings;
    await config.set('providers', providers);
    await config.set('activeModel', `generic:${modelId.trim()}`);

    console.log('');
    console.log(chalk.hex(THEME.success)(`  \u2713 Configured ${modelId.trim()} at ${baseUrl.trim()}`));
    console.log(dim('  Use /model to switch models.'));
    console.log('');
    rl.close();
    return;
  }

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
