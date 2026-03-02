export interface ProviderSettings {
  apiKey: string;
  baseUrl?: string;
}

export interface AvaConfig {
  activeModel: string;
  platformKey?: string;
  providers: {
    deepseek?: ProviderSettings;
    kimi?: ProviderSettings;
    qwen?: ProviderSettings;
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
  };
}

export const DEFAULT_CONFIG: AvaConfig = {
  activeModel: '',
  providers: {},
  preferences: {
    temperature: 0.7,
    maxTokens: 8192,
    markdownRendering: true,
  },
};
