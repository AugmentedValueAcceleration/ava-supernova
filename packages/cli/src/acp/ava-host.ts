/**
 * Ava, set up for Unreal's panel — once per program (Unreal starts a new one
 * for every chat). The same keys, settings and memory as the CLI, the
 * extension and the IDE: keys from the shared keychain, everything else from
 * ~/.ava. Never interactive: there is no terminal, only the panel.
 *
 * Fleets (Maestro / Supernova / Aurora) are set up the way the IDE's sidecar
 * does it (sidecar/index.mjs fleetCoordinatorSeat / createFleetCoordinator),
 * so the panel opens on the fleet he last picked in any Ava app.
 */

import {
  AVA_HOME,
  Agent,
  AutoCoordinator,
  ConfigManager,
  DESKTOP_TOOL_NAMES,
  GenericProvider,
  ProviderHealthTracker,
  ProviderRegistry,
  ResilientProvider,
  ToolRegistry,
  VISIBLE_ROUTING_MODES,
  createEmbeddingServiceFromConfig,
  isRoutingMode,
  loadPersonality,
  resolveAuroraCoordinator,
  resolveLocale,
  resolveMaestroCoordinator,
  resolveVisionDescriber,
  setLocale,
  t,
} from '@ava/core';
import { loadLocalModel, loadProviderKeys, sharedSetting, sharedUserName } from '../shared.js';

type Resolved = NonNullable<ReturnType<ProviderRegistry['resolveModel']>>;
type Runner = Pick<Agent, 'run'>;

/**
 * Tools whose answer is a card the panel can't show (it shows text and tool
 * calls only): a question card, a task card, a room or a dashboard page. Ava
 * asks in words instead, and the rooms are in VS Code and the IDE.
 */
const CARD_ONLY_TOOLS = [
  'ask_user', 'task_suggest', 'health_profile_ask',
  'open_health_room', 'open_learning_room', 'open_design_studio', 'open_brainstorm_room', 'open_dashboard_page',
];

const FLEET_NAMES: Record<string, string> = { auto: 'Maestro', supernova: 'Supernova', aurora: 'Aurora', longxiang: 'Longxiang' };

export interface ModelChoice {
  value: string;
  name: string;
  description?: string;
}

export class AvaHost {
  private constructor(
    readonly providerRegistry: ProviderRegistry,
    readonly toolRegistry: ToolRegistry,
    readonly keys: Record<string, string>,
    readonly language: string,
    readonly autoMemory: boolean,
    readonly embeddingService: ReturnType<typeof createEmbeddingServiceFromConfig>,
    readonly personality: Awaited<ReturnType<typeof loadPersonality>>,
    readonly userName: string | undefined,
  ) {}

  static async boot(): Promise<AvaHost> {
    const config = new ConfigManager();
    const appConfig = await config.load();
    const keys = loadProviderKeys();
    const providerRegistry = new ProviderRegistry();
    const configToRegistry: Record<string, string> = { glm: 'zhipu' };
    for (const [id, apiKey] of Object.entries(keys)) {
      if (id === 'brave') continue; // search, read through getProviderKey
      try { providerRegistry.register(configToRegistry[id] || id, { apiKey }); } catch { /* not a chat provider */ }
    }
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
    const language = resolveLocale(sharedSetting<string>('language') ?? appConfig.preferences?.language ?? 'auto');
    await setLocale(language);
    const autoMemory = sharedSetting<{ autoMemory?: boolean }>('preferences')?.autoMemory
      ?? appConfig.preferences.autoMemory ?? true;

    const toolRegistry = new ToolRegistry();
    toolRegistry.registerBuiltins({ exclude: [...DESKTOP_TOOL_NAMES, ...CARD_ONLY_TOOLS], allowDesktopMode: false });
    // His permission choices, as he set them in the extension or the IDE
    // (~/.ava/settings.json): the mode, then each category he set — the
    // extension's order (AvaViewProvider). The panel used the registry's
    // default (strict, every category asking) whatever he had chosen; he
    // agreed it should follow his settings (19 Nov). Unreal's own tools keep
    // their rule (read runs, write/execute ask) — that is not a category.
    const prefs = sharedSetting<{ permissionMode?: string }>('preferences');
    const mode = prefs?.permissionMode;
    if (mode === 'strict' || mode === 'balanced' || mode === 'autonomous' || mode === 'custom') toolRegistry.setPermissionMode(mode);
    const categories = sharedSetting<Record<string, string>>('category_permissions');
    if (categories && Object.keys(categories).length) toolRegistry.setCategoryPermissions(categories as never);

    return new AvaHost(
      providerRegistry, toolRegistry, keys, language, autoMemory,
      createEmbeddingServiceFromConfig(appConfig.preferences),
      await loadPersonality(AVA_HOME),
      sharedUserName(),
    );
  }

  /** Can she talk at all? (a chat key, or a local model) */
  get canChat(): boolean {
    return this.providerRegistry.listAllModels().length > 0;
  }

  /** Keys as the agent and the fleets read them (sharedState), never as plain fields elsewhere. */
  baseSharedState(): Record<string, unknown> {
    const keys = this.keys;
    return {
      globalDir: AVA_HOME,
      getProviderKey: (p: string) => keys[p === 'zhipu' ? 'glm' : p] || undefined,
      qwenApiKey: keys.qwen, deepseekApiKey: keys.deepseek, kimiApiKey: keys.kimi,
      minimaxApiKey: keys.minimax, mistralApiKey: keys.mistral,
      toolRegistry: this.toolRegistry,
    };
  }

  /** The model a fleet coordinates on (the IDE's fleetCoordinatorSeat). */
  private fleetSeat(mode: string): Resolved | null {
    if (mode === 'auto') return resolveMaestroCoordinator(this.providerRegistry) as Resolved | null;
    if (mode === 'aurora') return resolveAuroraCoordinator(this.providerRegistry) as Resolved | null;
    const id = mode === 'supernova' ? 'deepseek:deepseek-flash' : 'kimi:kimi-k3';
    const r = this.providerRegistry.resolveModel(id);
    return r && r.provider.name === id.split(':')[0] ? r : null;
  }

  /**
   * What the panel's model menu offers — the extension's picker
   * (AvaViewProvider.getModelList), less what can't run: the fleets his keys
   * run (Aurora, Supernova, Maestro, in its order), then every model a key
   * unlocks. The extension also lists locked models greyed out; Unreal's menu
   * can't grey a row, so they're left out here. 18 Nov, his first panel test:
   * "it should also show the single models shouldnt it".
   */
  modelChoices(): ModelChoice[] {
    const out: ModelChoice[] = [];
    const order = ['aurora', 'supernova', 'auto', 'longxiang'].filter((m) => (VISIBLE_ROUTING_MODES as readonly string[]).includes(m));
    for (const m of order) {
      if (this.fleetSeat(m)) out.push({ value: m, name: FLEET_NAMES[m] ?? m, description: t('acp.fleet') });
    }
    const seen = new Set<string>();
    for (const m of this.providerRegistry.listAllPossibleModels()) {
      if (!m.available || m.hiddenFromPicker || seen.has(m.id)) continue;
      seen.add(m.id);
      const value = `${m.provider}:${m.id}`;
      const r = this.providerRegistry.resolveModel(value);
      if (!r) continue;
      out.push({ value, name: m.name ?? m.id, description: r.provider.displayName ?? m.provider });
    }
    // His pick from another app, if it's a model this machine runs but isn't listed (an older id).
    const picked = sharedSetting<string>('chat_model');
    if (picked && !isRoutingMode(picked) && !out.some((c) => c.value === picked)) {
      const r = this.providerRegistry.resolveModel(picked);
      if (r) out.push({ value: picked, name: r.model.name ?? r.model.id });
    }
    return out;
  }

  /** The panel opens on the fleet or model last picked in any Ava app, if this machine can run it. */
  defaultModel(): string | undefined {
    const choices = this.modelChoices();
    const picked = sharedSetting<string>('chat_model');
    return choices.find((c) => c.value === picked)?.value ?? choices[0]?.value;
  }

  /**
   * The runner for one chat: a fleet's coordinator (with the plain agent on
   * its seat beside it), or one model's agent with its failover chain.
   */
  runnerFor(choice: string, cwd: string, sharedState: Record<string, unknown>): { runner: Runner; resolved: Resolved; fleet: string | null } | null {
    const fleet = isRoutingMode(choice) ? choice : null;
    const resolved = fleet ? this.fleetSeat(fleet) : this.providerRegistry.resolveModel(choice) ?? null;
    if (!resolved) return null;
    sharedState.activeModelId = resolved.model.id;
    sharedState.activeProvider = resolved.provider;
    sharedState.activeModel = resolved.model;
    const vision = resolveVisionDescriber(this.providerRegistry);
    const chain = fleet ? null : this.providerRegistry.buildFallbackChain(choice);
    const provider = chain && chain.length > 1
      ? new ResilientProvider({ primary: chain[0], fallbacks: chain.slice(1), healthTracker: new ProviderHealthTracker() })
      : resolved.provider;
    const agent = new Agent({
      provider, model: resolved.model,
      visionProvider: vision?.provider, visionModel: vision?.model,
      toolRegistry: this.toolRegistry, cwd, sharedState, surface: 'cli',
    });
    if (!fleet) return { runner: agent, resolved, fleet: null };
    const available = new Set<string>();
    for (const p of ['qwen', 'minimax', 'kimi', 'deepseek', 'mistral']) if (this.keys[p]) available.add(p);
    const coordinator = AutoCoordinator.create({
      providerRegistry: this.providerRegistry, toolRegistry: this.toolRegistry, cwd, sharedState,
      availableProviders: available, mode: fleet,
    });
    return { runner: coordinator ?? agent, resolved, fleet };
  }

  /** Which key a fleet is missing, in his words. */
  static fleetMissing(choice: string): string {
    if (choice === 'supernova' || choice === 'aurora' || choice === 'auto') return t(`acp.fleet_missing.${choice}`);
    return t('acp.fleet_missing.model');
  }
}
