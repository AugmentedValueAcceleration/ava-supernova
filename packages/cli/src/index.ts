#!/usr/bin/env node

import { platform } from 'node:os';
import {
  ConfigManager,
  ProviderRegistry,
  ToolRegistry,
  Agent,
  Conversation,
  buildSystemPrompt,
  HistoryManager,
  MemoryManager,
  createEmbeddingServiceFromConfig,
  TaskManager,
  JournalManager,
  ProviderHealthTracker,
  ResilientProvider,
  Conductor,
  BriefingEngine,
  AutoCoordinator,
  MemoryAgent,
  AVA_HOME,
  detectProjectRoot,
  loadProjectInstructions,
  loadDecisionsState,
  setLocale,
  resolveLocale,
  installDatasetConsumer,
  resolveVisionDescriber,
  mergeAccountFolders,
  GenericProvider,
  loadPersonality,
} from '@ava/core';
// Deep import, not from the index — keeping desktop tools out of the main
// module graph is what stops them reaching the VS Code extension's bundle.
import { registerDesktopTools } from '@ava/core/desktop-tools';
import { runSetupWizard } from './setup-wizard.js';
import {
  loadProviderKeys, loadLocalModel, sharedSetting, setSharedSetting, sharedUserName, clearPlatformKey,
} from './shared.js';
import { Repl } from './cli/repl.js';
import { CommandHandler, type RoutingMode } from './cli/commands.js';

async function main(): Promise<void> {
  // Install the dataset capture consumer once at boot. It's a no-op for
  // any user who hasn't opted in via ~/.ava/datasets/config.json — the
  // config defaults are all-off, so this just opens the subscription
  // and waits. When the user later flips the toggle, capture starts
  // working without a restart.
  installDatasetConsumer();

  const cwd = process.cwd();
  const projectRoot = detectProjectRoot(cwd) ?? undefined;
  const projectInstructions = projectRoot
    ? await loadProjectInstructions(projectRoot)
    : null;
  const decisionsState = projectRoot
    ? await loadDecisionsState(projectRoot)
    : undefined;

  // There are no accounts (1 Nov 2026): everything lives in ~/.ava. Bring any
  // account-era folder (~/.ava/users/<id>) home once — the same helper the
  // extension and the IDE run, copy-only, marker-guarded — and drop the dead
  // platform key so nothing routes on it.
  clearPlatformKey();
  try { await mergeAccountFolders(AVA_HOME); } catch { /* the old folder stays; nothing lost */ }
  const globalDir = AVA_HOME;

  const config = new ConfigManager();
  const providerRegistry = new ProviderRegistry();
  const historyManager = new HistoryManager(projectRoot);

  await historyManager.init();

  // Keys are shared with the extension and the IDE through the OS keychain:
  // a key added in either is already here. First run only when there is no
  // way to chat at all — no key (Brave is search) and no local model.
  const hasChat = () => Object.keys(loadProviderKeys()).some((id) => id !== 'brave') || !!loadLocalModel();
  if (!hasChat()) {
    await runSetupWizard(config);
  }

  const appConfig = await config.load();
  const keys = loadProviderKeys();
  const embeddingService = createEmbeddingServiceFromConfig(appConfig.preferences);
  const memoryManager = new MemoryManager({ globalDir, projectRoot, embeddingService });
  const configToRegistry: Record<string, string> = { glm: 'zhipu' };
  for (const [id, apiKey] of Object.entries(keys)) {
    if (id === 'brave') continue; // search, not a chat provider — read via getProviderKey
    try {
      providerRegistry.register(configToRegistry[id] || id, { apiKey });
    } catch {
      // Provider not yet implemented, skip
    }
  }
  // A local model server set up in any Ava app (Ollama, LM Studio…). The
  // wizard used to save it in a shape config.json's loader dropped, and the
  // provider loop skipped 'generic' anyway — a CLI local model never ran.
  const local = loadLocalModel();
  if (local) {
    const ids = local.models.length ? local.models : local.modelName ? [local.modelName] : [];
    if (ids.length) {
      const label = local.label && ids.length === 1 ? local.label : undefined;
      providerRegistry.registerCustom('generic', new GenericProvider({
        apiKey: local.apiKey || 'local',
        baseUrl: local.baseUrl,
        models: ids.map((id) => ({
          id, name: label ?? id, provider: 'generic',
          contextWindow: 32000, maxOutputTokens: 4096, supportsToolCalls: true, supportsStreaming: true,
        })),
      }));
    }
  }

  // Language and model follow the other apps: what was last chosen in any of
  // them (~/.ava/settings.json) wins over the CLI's own older choice.
  const language = resolveLocale(sharedSetting<string>('language') ?? appConfig.preferences?.language ?? 'auto');
  await setLocale(language);
  const autoMemory = sharedSetting<{ autoMemory?: boolean }>('preferences')?.autoMemory
    ?? appConfig.preferences.autoMemory ?? true;

  // The model: the shared pick if this machine can run it, else the CLI's
  // own, else the first model a key unlocks.
  const candidates = [sharedSetting<string>('chat_model'), appConfig.activeModel, ...providerRegistry.listAllModels().map((m) => `${m.provider}:${m.id}`)];
  let resolved: ReturnType<typeof providerRegistry.resolveModel> = undefined;
  let activeModelId = '';
  for (const c of candidates) {
    if (!c) continue;
    resolved = providerRegistry.resolveModel(c);
    if (resolved) { activeModelId = c; break; }
  }
  if (!resolved) {
    console.error('No model available — add a provider key with /provider add <name>, or set up a local model in the extension or the IDE.');
    process.exit(1);
  }

  // Set up tool registry
  const toolRegistry = new ToolRegistry();
  toolRegistry.registerBuiltins();
  // Desktop automation + browser control are split out of registerBuiltins so
  // the VS Code extension never bundles them (MS required their removal to
  // reinstate it). The CLI is distributed outside the marketplace and gets the
  // full toolkit, so it opts in. See core/src/tools/desktop-tools.ts.
  registerDesktopTools(toolRegistry);

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
      autoMemory,
      language,
      // Ava's style and your name, as set in any Ava app (~/.ava). The CLI
      // passed neither, so it always ran on the default personality.
      personality: await loadPersonality(AVA_HOME),
      userName: sharedUserName(),
      decisionsContext: decisionsState?.context ?? undefined,
      decisionsFolderExists: decisionsState?.hasFolder ?? false,
      decisionsOptInStatus: decisionsState?.optInStatus ?? 'not-asked',
      projectBrainBrief: memoryManager.getProjectBrain?.()?.brief,
    }),
  );

  // Sealed key getter — API keys accessed via function, not stored as plain
  // strings. Every key, Brave's included (web search reads it here).
  const getProviderKey = (provider: string): string | undefined =>
    keys[provider === 'zhipu' ? 'glm' : provider] || undefined;

  const sharedState: Record<string, unknown> = {
    memoryManager,
    getProviderKey,
    activeModelId: resolved.model.id,
    // Active provider + model + tool registry — needed by specialist tools
    // like curator that spawn fresh-context agents internally.
    activeProvider: resolved.provider,
    activeModel: resolved.model,
    toolRegistry,
  };

  // Memory Agent — curates briefs instead of raw memory dumps
  const qwenFlash = providerRegistry.resolveModel('qwen:qwen3.5-flash');
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
  const fallbackChain = providerRegistry.buildFallbackChain(activeModelId);
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

  // Describes images when the chosen model can't see them. The CLI passed
  // nothing here, so a terminal user on a text-only model was told to switch
  // models however many vision-capable keys they held.
  const visionResolved = resolveVisionDescriber(providerRegistry);

  const agent = new Agent({
    provider,
    model: resolved.model,
    visionProvider: visionResolved?.provider,
    visionModel: visionResolved?.model,
    toolRegistry,
    cwd,
    sharedState,
  });

  const conductor = new Conductor({
    provider,
    model: resolved.model,
    visionProvider: visionResolved?.provider,
    visionModel: visionResolved?.model,
    toolRegistry,
    cwd,
    sharedState,
  });

  // Auto Mode — determine available providers for routing
  const availableProviders = new Set<string>();
  if (keys.qwen || process.env.QWEN_API_KEY) availableProviders.add('qwen');
  if (keys.minimax || process.env.MINIMAX_API_KEY) availableProviders.add('minimax');
  if (keys.kimi || process.env.KIMI_API_KEY) availableProviders.add('kimi');
  if (keys.deepseek || process.env.DEEPSEEK_API_KEY) availableProviders.add('deepseek');
  if (keys.mistral || process.env.MISTRAL_API_KEY) availableProviders.add('mistral');

  // Routing mode — persisted in config, defaults to 'auto' (Maestro / Qwen-only).
  // Changed at runtime via /route maestro|supernova|aurora|longxiang —
  // onRouteSwitch below rebuilds the AutoCoordinator with the new mode.
  let routingMode: RoutingMode = appConfig.routingMode ?? 'auto';

  // Auto Mode — picks the right coordinator for the routing mode.
  const autoCoordinator = (availableProviders.size > 1
    ? AutoCoordinator.create({
        providerRegistry,
        toolRegistry,
        cwd,
        sharedState,
        availableProviders,
        mode: routingMode,
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
    onSessionEnd: () => {
      const ma = sharedState.memoryAgent as MemoryAgent | undefined;
      if (ma) void ma.reflectOnSession(conversation.getMessages(), conversation.id).catch(() => {});
    },
    onModelSwitch: (provider, model) => {
      sharedState.activeModelId = model.id;
      // The other apps follow a model picked here.
      try { setSharedSetting('chat_model', `${provider.name}:${model.id}`); } catch { /* shared file unwritable */ }
      repl.setAgent(
        new Agent({ provider, model, toolRegistry, cwd, sharedState }),
      );
      repl.setConductor(
        new Conductor({ provider, model, toolRegistry, cwd, sharedState }),
      );
      // Update AutoCoordinator — uses correct coordinator model (not user's selection)
      if (availableProviders.size > 1) {
        repl.setAutoCoordinator(AutoCoordinator.create({
          providerRegistry,
          toolRegistry,
          cwd,
          sharedState,
          availableProviders,
          mode: routingMode,
        }) ?? undefined);
      }
      repl.setModelLabel(`${provider.name}:${model.id}`);
    },
    onRouteSwitch: async (next) => {
      routingMode = next;
      await config.set('routingMode', next);
      if (availableProviders.size > 1) {
        repl.setAutoCoordinator(AutoCoordinator.create({
          providerRegistry,
          toolRegistry,
          cwd,
          sharedState,
          availableProviders,
          mode: routingMode,
        }) ?? undefined);
      }
    },
    getRoute: () => routingMode,
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
    const taskManager = new TaskManager({ globalDir, projectRoot });
    const journalManager = new JournalManager({ globalDir, projectRoot });
    const briefingEngine = new BriefingEngine({ globalDir });

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

  // End-of-session reflection over the full conversation before we exit —
  // distils durable user/project facts the per-turn capture may have missed.
  // The user left deliberately (/exit), so a brief pause to persist is fine;
  // it's bounded by the reflection's own Flash call. (SIGINT is too abrupt to
  // block, so it's skipped there.)
  const exitMemoryAgent = sharedState.memoryAgent as MemoryAgent | undefined;
  if (exitMemoryAgent) {
    await exitMemoryAgent.reflectOnSession(conversation.getMessages(), conversation.id).catch(() => {});
  }

  await historyManager.saveConversation(conversation);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
