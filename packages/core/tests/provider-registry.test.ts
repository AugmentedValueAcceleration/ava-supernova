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

    it('includes built-in free models even with no custom providers', () => {
      const models = registry.listAllModels();
      // Registry comes with free tier models pre-registered
      expect(models.length).toBeGreaterThan(0);
    });
  });
});
