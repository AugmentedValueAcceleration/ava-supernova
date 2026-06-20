import { describe, it, expect, beforeEach } from 'vitest';
import { ProviderRegistry } from '../src/providers/provider-registry.js';
import type { Provider } from '../src/providers/types.js';
import type { ModelDefinition } from '../src/core/types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function createMockProvider(name: string, models: ModelDefinition[]): Provider {
  return {
    name,
    displayName: name,
    async *createStreamingCompletion() {
      /* noop */
    },
    listModels: () => models,
  };
}

function makeModel(id: string, provider: string): ModelDefinition {
  return {
    id,
    name: id,
    provider,
    contextWindow: 128000,
    maxOutputTokens: 4096,
    supportsToolCalls: true,
    supportsStreaming: true,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  describe('register / get', () => {
    it('throws for unknown built-in provider name', () => {
      expect(() => registry.register('nonexistent', { apiKey: 'key' }))
        .toThrow('Unknown provider');
    });

    it('registerCustom stores and retrieves a provider', () => {
      const provider = createMockProvider('custom', []);
      registry.registerCustom('custom', provider);
      expect(registry.get('custom')).toBe(provider);
    });

    it('get returns undefined for unregistered provider', () => {
      expect(registry.get('nothing')).toBeUndefined();
    });
  });

  describe('resolveModel', () => {
    it('resolves "provider:modelId" qualified format', () => {
      const model = makeModel('test-model', 'alpha');
      registry.registerCustom('alpha', createMockProvider('alpha', [model]));

      const result = registry.resolveModel('alpha:test-model');
      expect(result).toBeDefined();
      expect(result!.model.id).toBe('test-model');
      expect(result!.provider.name).toBe('alpha');
    });

    it('resolves unqualified modelId by searching all providers', () => {
      const model = makeModel('chat-v1', 'beta');
      registry.registerCustom('beta', createMockProvider('beta', [model]));

      const result = registry.resolveModel('chat-v1');
      expect(result).toBeDefined();
      expect(result!.model.id).toBe('chat-v1');
    });

    it('returns undefined for unknown provider in qualified format', () => {
      expect(registry.resolveModel('unknown:model')).toBeUndefined();
    });

    it('returns undefined for unknown modelId', () => {
      registry.registerCustom('alpha', createMockProvider('alpha', [makeModel('m1', 'alpha')]));
      expect(registry.resolveModel('alpha:nonexistent')).toBeUndefined();
    });

    it('returns undefined when unqualified modelId not in any provider', () => {
      registry.registerCustom('alpha', createMockProvider('alpha', [makeModel('m1', 'alpha')]));
      expect(registry.resolveModel('nonexistent')).toBeUndefined();
    });

    it('resolves first match when modelId exists in multiple providers', () => {
      registry.registerCustom('first', createMockProvider('first', [makeModel('shared-id', 'first')]));
      registry.registerCustom('second', createMockProvider('second', [makeModel('shared-id', 'second')]));

      const result = registry.resolveModel('shared-id');
      expect(result).toBeDefined();
      expect(result!.provider.name).toBe('first');
    });
  });

  describe('listAllModels', () => {
    it('aggregates models from all registered providers including built-ins', () => {
      const baseCount = registry.listAllModels().length;
      registry.registerCustom('a', createMockProvider('a', [makeModel('m1', 'a')]));
      registry.registerCustom('b', createMockProvider('b', [makeModel('m2', 'b'), makeModel('m3', 'b')]));

      const all = registry.listAllModels();
      expect(all).toHaveLength(baseCount + 3);
      const ids = all.map((m) => m.id);
      expect(ids).toContain('m1');
      expect(ids).toContain('m2');
      expect(ids).toContain('m3');
    });

    it('starts empty and surfaces models once a provider is registered', () => {
      // There is no built-in free provider any more — free users get Qwen via
      // the platform provider registered at runtime (see provider-registry.ts
      // constructor). So a fresh registry has no models until one is registered.
      expect(registry.listAllModels().length).toBe(0);
      registry.registerCustom('platform', createMockProvider('platform', [makeModel('qwen3.5-flash', 'platform')]));
      expect(registry.listAllModels().length).toBeGreaterThan(0);
    });
  });

  describe('buildFallbackChain', () => {
    it('returns undefined for unknown model', () => {
      expect(registry.buildFallbackChain('unknown:nope')).toBeUndefined();
    });

    it('returns primary as first entry', () => {
      const model = makeModel('m1', 'alpha');
      registry.registerCustom('alpha', createMockProvider('alpha', [model]));

      const chain = registry.buildFallbackChain('alpha:m1');
      expect(chain).toBeDefined();
      expect(chain![0].model.id).toBe('m1');
      expect(chain![0].provider.name).toBe('alpha');
    });

    it('includes compatible fallbacks from other providers', () => {
      registry.registerCustom('alpha', createMockProvider('alpha', [makeModel('m1', 'alpha')]));
      registry.registerCustom('beta', createMockProvider('beta', [makeModel('m2', 'beta')]));

      const chain = registry.buildFallbackChain('alpha:m1');
      expect(chain!.length).toBeGreaterThan(1);
      // Second entry should be from beta
      const fallbackProviders = chain!.slice(1).map(e => e.provider.name);
      expect(fallbackProviders).toContain('beta');
    });

    it('excludes models that lack required capabilities', () => {
      const primary = makeModel('m1', 'alpha');
      primary.supportsToolCalls = true;

      const noTools: ModelDefinition = {
        ...makeModel('m2', 'beta'),
        supportsToolCalls: false,
      };

      registry.registerCustom('alpha', createMockProvider('alpha', [primary]));
      registry.registerCustom('beta', createMockProvider('beta', [noTools]));

      const chain = registry.buildFallbackChain('alpha:m1');
      // beta's model should be excluded (no tool calls)
      const ids = chain!.map(e => e.model.id);
      expect(ids).not.toContain('m2');
    });

    it('caps fallbacks at 3', () => {
      registry.registerCustom('primary', createMockProvider('primary', [makeModel('m0', 'primary')]));
      for (let i = 1; i <= 5; i++) {
        registry.registerCustom(`fb${i}`, createMockProvider(`fb${i}`, [makeModel(`m${i}`, `fb${i}`)]));
      }

      const chain = registry.buildFallbackChain('primary:m0');
      // 1 primary + max 3 fallbacks = 4
      expect(chain!.length).toBeLessThanOrEqual(4);
    });

    it('prefers models with larger context windows', () => {
      registry.registerCustom('primary', createMockProvider('primary', [makeModel('m0', 'primary')]));

      const small: ModelDefinition = { ...makeModel('small', 'a'), contextWindow: 4096 };
      const large: ModelDefinition = { ...makeModel('large', 'b'), contextWindow: 256000 };
      registry.registerCustom('a', createMockProvider('a', [small]));
      registry.registerCustom('b', createMockProvider('b', [large]));

      const chain = registry.buildFallbackChain('primary:m0');
      const fallbackIds = chain!.slice(1).map(e => e.model.id);
      // Large context model should appear before small (if small is present at all)
      expect(fallbackIds).toContain('large');
      if (fallbackIds.includes('small')) {
        expect(fallbackIds.indexOf('large')).toBeLessThan(fallbackIds.indexOf('small'));
      }
    });
  });
});
