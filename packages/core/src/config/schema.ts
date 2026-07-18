import type { RoutingMode } from '../auto/model-router.js';

export interface ProviderSettings {
  apiKey: string;
  baseUrl?: string;
}

export interface AvaConfig {
  activeModel: string;
  /**
   * Routing mode for AutoCoordinator's model-router — picks which
   * preset routing table is used for per-category model selection.
   *  • 'auto'      = Maestro, Qwen-only tier-differentiated (default)
   *  • 'supernova' = DeepSeek polyglot with Qwen builder fallback
   *  • 'aurora'    = Mistral-only EU-sovereign three-tier
   *  • 'longxiang' = open-weights Kimi/Qwen/DeepSeek, BYOK-only
   * The CLI exposes this via the /route command; the extension and IDE
   * surface it in their Auto Mode settings.
   *
   * Typed off core's `RoutingMode` rather than re-declaring the union — it
   * had been hand-copied into five files and drifted when Longxiang landed.
   */
  routingMode?: RoutingMode;
  platformKey?: string;
  providers: {
    anthropic?: ProviderSettings;
    deepseek?: ProviderSettings;
    kimi?: ProviderSettings;
    glm?: ProviderSettings;
    qwen?: ProviderSettings;
    minimax?: ProviderSettings;
    mistral?: ProviderSettings;
    generic?: Array<{
      name: string;
      apiKey?: string;
      baseUrl: string;
      models: Array<{
        id: string;
        name: string;
        contextWindow?: number;
        maxOutputTokens?: number;
      }>;
    }>;
  };
  preferences: {
    temperature?: number;
    maxTokens?: number;
    markdownRendering?: boolean;
    language?: string;
    autoMemory?: boolean;
    /** Opt-in: use a local Ollama embedding model for SEMANTIC memory recall.
     *  Off by default — recall stays on TF-IDF, no external dependency. */
    useLocalEmbeddings?: boolean;
    /** Embedding model served locally. Default 'nomic-embed-text'. */
    embeddingModel?: string;
    /** OpenAI-compatible embeddings base URL. Default Ollama 'http://localhost:11434/v1'. */
    embeddingBaseUrl?: string;
  };
  knowledgePacks?: {
    enabled?: string[];
  };
}

export const DEFAULT_CONFIG: AvaConfig = {
  activeModel: '',
  providers: {},
  preferences: {
    temperature: 0.7,
    maxTokens: 8192,
    markdownRendering: true,
    autoMemory: true,
  },
};
