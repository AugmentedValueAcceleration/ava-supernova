#!/usr/bin/env node

import { platform } from 'node:os';
import { ConfigManager } from './config/config.js';
import { runSetupWizard } from './config/setup-wizard.js';
import { ProviderRegistry } from './providers/provider-registry.js';
import { ToolRegistry } from './tools/tool-registry.js';
import { Agent } from './agent/agent.js';
import { Conversation } from './agent/conversation.js';
import { buildSystemPrompt } from './agent/system-prompt.js';
import { Repl } from './cli/repl.js';
import { CommandHandler } from './cli/commands.js';
import { HistoryManager } from './history/history-manager.js';
import type { ProviderSettings } from './config/schema.js';

async function main(): Promise<void> {
  const config = new ConfigManager();
  const providerRegistry = new ProviderRegistry();
  const historyManager = new HistoryManager();

  await historyManager.init();

  // First-run setup if needed
  if (await config.needsSetup()) {
    await runSetupWizard(config, providerRegistry);
  }

  // Load config and register providers
  const appConfig = await config.load();
  for (const [name, providerConfig] of Object.entries(appConfig.providers)) {
    if (name === 'generic' || !providerConfig) continue;
    const settings = providerConfig as ProviderSettings;
    if (settings.apiKey) {
      try {
        providerRegistry.register(name, settings);
      } catch {
        // Provider not yet implemented, skip
      }
    }
  }

  // Resolve active model
  const resolved = providerRegistry.resolveModel(appConfig.activeModel);
  if (!resolved) {
    console.error(`Active model "${appConfig.activeModel}" not found. Run setup again.`);
    process.exit(1);
  }

  // Set up tool registry
  const toolRegistry = new ToolRegistry();
  toolRegistry.registerBuiltins();

  // Create conversation and agent
  const cwd = process.cwd();
  const conversation = new Conversation();
  conversation.setSystemPrompt(
    buildSystemPrompt({
      cwd,
      platform: platform(),
      shell: process.env.SHELL ?? (process.platform === 'win32' ? 'bash' : '/bin/bash'),
    }),
  );

  const agent = new Agent({
    provider: resolved.provider,
    model: resolved.model,
    toolRegistry,
    cwd,
  });

  // Set up REPL
  const modelLabel = `${resolved.provider.name}:${resolved.model.id}`;
  const repl = new Repl({ agent, conversation, toolRegistry, modelLabel });

  // Set up commands with live model switching
  const commands = new CommandHandler({
    providerRegistry,
    conversation,
    config,
    onModelSwitch: (provider, model) => {
      repl.setAgent(
        new Agent({ provider, model, toolRegistry, cwd }),
      );
      repl.setModelLabel(`${provider.name}:${model.id}`);
    },
  });

  repl.setCommands(commands);

  // Save conversation on exit
  process.on('SIGINT', () => {
    historyManager.saveConversation(conversation).then(() => process.exit(0));
  });

  await repl.start();

  await historyManager.saveConversation(conversation);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
