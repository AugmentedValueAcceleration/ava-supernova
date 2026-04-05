#!/usr/bin/env node

import { platform } from 'node:os';
import { createHash } from 'node:crypto';
import {
  ConfigManager,
  ProviderRegistry,
  ToolRegistry,
  Agent,
  Conversation,
  buildSystemPrompt,
  HistoryManager,
  MemoryManager,
  TaskManager,
  JournalManager,
  PlatformMemorySync,
  ProviderHealthTracker,
  ResilientProvider,
  Conductor,
  BriefingEngine,
  AutoCoordinator,
  MemoryAgent,
  AVA_HOME,
  detectProjectRoot,
  loadProjectInstructions,
  setLocale,
  resolveLocale,
} from '@ava/core';
import type { ProviderSettings } from '@ava/core';
import { runSetupWizard } from './setup-wizard.js';
import { Repl } from './cli/repl.js';
import { CommandHandler } from './cli/commands.js';

async function main(): Promise<void> {
  const cwd = process.cwd();
  const projectRoot = detectProjectRoot(cwd) ?? undefined;
  const projectInstructions = projectRoot
    ? await loadProjectInstructions(projectRoot)
    : null;

  const config = new ConfigManager();
  const providerRegistry = new ProviderRegistry();
  const historyManager = new HistoryManager(projectRoot);

  await historyManager.init();

  // First-run setup if needed
  if (await config.needsSetup()) {
    await runSetupWizard(config, providerRegistry);
  }

  // Load config and register providers
  const appConfig = await config.load();

  // Set up memory with optional platform sync
  let sync: PlatformMemorySync | undefined;
  if (appConfig.platformKey) {
    const projectId = projectRoot ? createHash('sha256').update(projectRoot).digest('hex').slice(0, 16) : undefined;
    sync = new PlatformMemorySync('https://ava-supernova.com/api', appConfig.platformKey, projectId);
  }
  const memoryManager = new MemoryManager({ globalDir: AVA_HOME, projectRoot, sync });
  const configToRegistry: Record<string, string> = { glm: 'zhipu' };
  for (const [name, providerConfig] of Object.entries(appConfig.providers)) {
    if (name === 'generic' || !providerConfig) continue;
    const settings = providerConfig as ProviderSettings;
    if (settings.apiKey) {
      try {
        const registryKey = configToRegistry[name] || name;
        providerRegistry.register(registryKey, settings);
      } catch {
        // Provider not yet implemented, skip
      }
    }
  }

  // Resolve locale from config
  const language = resolveLocale(appConfig.preferences?.language ?? 'auto');
  await setLocale(language);

  // Resolve active model
  const resolved = providerRegistry.resolveModel(appConfig.activeModel);
  if (!resolved) {
    console.error(`Active model "${appConfig.activeModel}" not found. Run setup again.`);
    process.exit(1);
  }

  // Set up tool registry
  const toolRegistry = new ToolRegistry();
  toolRegistry.registerBuiltins();

  // Load persistent memory (pass project instructions as context for episodic retrieval)
  const memory = await memoryManager.loadAll(projectInstructions ?? undefined);

  // Create conversation and agent
  const conversation = new Conversation();
  conversation.setSystemPrompt(
    buildSystemPrompt({
      cwd,
      platform: platform(),
      shell: process.env.SHELL ?? (process.platform === 'win32' ? 'bash' : '/bin/bash'),
      supportsVision: resolved.model.supportsVision,
      projectInstructions: projectInstructions ?? undefined,
      memory: memory || undefined,
      autoMemory: appConfig.preferences.autoMemory ?? true,
      language,
    }),
  );

  // Sealed key getter — API keys accessed via function, not stored as plain strings
  const qwenApiKey = appConfig.providers?.qwen?.apiKey || undefined;
  const minimaxApiKey = appConfig.providers?.minimax?.apiKey || undefined;
  const getProviderKey = (provider: string): string | undefined => {
    switch (provider) {
      case 'qwen': return qwenApiKey;
      case 'minimax': return minimaxApiKey;
      case 'platform': return appConfig.platformKey || undefined;
      default: return undefined;
    }
  };

  const sharedState: Record<string, unknown> = {
    memoryManager,
    platformKey: appConfig.platformKey,
    getProviderKey,
    activeModelId: resolved.model.id,
  };

  // Memory Agent — curates briefs instead of raw memory dumps
  const qwenFlash = providerRegistry.resolveModel('platform:qwen3-omni-flash')
    || providerRegistry.resolveModel('platform:qwen-flash')
    || providerRegistry.resolveModel('qwen:qwen3-omni-flash');
  if (qwenFlash && memoryManager) {
    const memoryAgent = new MemoryAgent({
      memoryManager,
      provider: qwenFlash.provider,
      model: qwenFlash.model,
    });
    sharedState.memoryAgent = memoryAgent;
  }

  // Build resilient provider with automatic failover
  const healthTracker = new ProviderHealthTracker();
  const fallbackChain = providerRegistry.buildFallbackChain(appConfig.activeModel);
  const provider = fallbackChain && fallbackChain.length > 1
    ? new ResilientProvider({
        primary: fallbackChain[0],
        fallbacks: fallbackChain.slice(1),
        healthTracker,
        onFallback: (from, to, err) => {
          console.warn(
            `\n⚡ Provider failover: ${from.provider.displayName} → ${to.provider.displayName} (${err.message})\n`,
          );
        },
      })
    : resolved.provider;

  const agent = new Agent({
    provider,
    model: resolved.model,
    toolRegistry,
    cwd,
    sharedState,
  });

  const conductor = new Conductor({
    provider,
    model: resolved.model,
    toolRegistry,
    cwd,
    sharedState,
  });

  // Auto Mode — determine available providers for routing
  const availableProviders = new Set<string>();
  if (appConfig.platformKey) availableProviders.add('platform');
  if (appConfig.providers?.qwen?.apiKey || process.env.QWEN_API_KEY) availableProviders.add('qwen');
  if (appConfig.providers?.minimax?.apiKey || process.env.MINIMAX_API_KEY) availableProviders.add('minimax');
  if (appConfig.providers?.kimi?.apiKey || process.env.KIMI_API_KEY) availableProviders.add('kimi');
  if (appConfig.providers?.deepseek?.apiKey || process.env.DEEPSEEK_API_KEY) availableProviders.add('deepseek');
  if (appConfig.providers?.anthropic?.apiKey || process.env.ANTHROPIC_API_KEY) availableProviders.add('anthropic');
  if (appConfig.providers?.mistral?.apiKey || process.env.MISTRAL_API_KEY) availableProviders.add('mistral');

  // Auto Mode — picks Kimi K2.5 for platform, best available for BYOK
  const autoCoordinator = (availableProviders.size > 1 || availableProviders.has('platform')
    ? AutoCoordinator.create({
        providerRegistry,
        toolRegistry,
        cwd,
        sharedState,
        availableProviders,
        platformKey: appConfig.platformKey,
      })
    : undefined) ?? undefined;

  // Set up REPL
  const modelLabel = `${resolved.provider.name}:${resolved.model.id}`;
  const repl = new Repl({ agent, conductor, autoCoordinator, conversation, toolRegistry, historyManager, modelLabel });

  // Set up commands with live model switching
  const commands = new CommandHandler({
    providerRegistry,
    conversation,
    config,
    toolRegistry,
    historyManager,
    onModelSwitch: (provider, model) => {
      sharedState.activeModelId = model.id;
      repl.setAgent(
        new Agent({ provider, model, toolRegistry, cwd, sharedState }),
      );
      repl.setConductor(
        new Conductor({ provider, model, toolRegistry, cwd, sharedState }),
      );
      // Update AutoCoordinator — uses correct coordinator model (not user's selection)
      if (availableProviders.size > 1 || availableProviders.has('platform')) {
        repl.setAutoCoordinator(AutoCoordinator.create({
          providerRegistry,
          toolRegistry,
          cwd,
          sharedState,
          availableProviders,
          platformKey: appConfig.platformKey,
        }) ?? undefined);
      }
      repl.setModelLabel(`${provider.name}:${model.id}`);
    },
    onRetry: () => {
      repl.retry();
    },
    onCompact: () => repl.compact(),
    onSecurity: (focus: string) => repl.securityScan(focus),
    onBrainstorm: (topic: string) => repl.brainstorm(topic),
  });

  repl.setCommands(commands);

  // Daily briefing — proactive greeting
  try {
    const taskManager = new TaskManager({ globalDir: AVA_HOME, projectRoot });
    const journalManager = new JournalManager({ globalDir: AVA_HOME, projectRoot });
    const briefingEngine = new BriefingEngine({ globalDir: AVA_HOME });

    if (await briefingEngine.shouldShowBriefing()) {
      const briefing = await briefingEngine.generateBriefing(taskManager, journalManager, memoryManager);
      repl.printBriefing(briefing.text);
    }
  } catch {
    // Briefing is non-critical — don't block startup
  }

  // Save conversation on exit — handle both SIGINT and SIGTERM
  const gracefulExit = () => {
    // Restore terminal state
    if (process.stdin.isTTY && process.stdin.isRaw) {
      process.stdin.setRawMode(false);
    }
    process.stdout.write('\x1b[?25h\x1b[0m'); // Show cursor, reset styles
    historyManager.saveConversation(conversation)
      .catch(() => {})
      .then(() => process.exit(0));
  };
  process.on('SIGINT', gracefulExit);
  process.on('SIGTERM', gracefulExit);

  await repl.start();

  await historyManager.saveConversation(conversation);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
