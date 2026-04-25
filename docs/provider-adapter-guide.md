# Provider Adapter Guide

How to add a new AI provider to Ava Supernova.

## Provider Interface

Every provider must implement the `Provider` interface from `packages/core/src/providers/types.ts`:

```typescript
interface Provider {
  readonly name: string;           // e.g., 'deepseek'
  readonly displayName: string;    // e.g., 'DeepSeek'
  listModels(): ModelDefinition[];
  createCompletion(request: ChatCompletionRequest, signal?: AbortSignal): Promise<CompletionResponse>;
  createStreamingCompletion(request: ChatCompletionRequest, signal?: AbortSignal): AsyncGenerator<StreamChunk>;
}
```

## Using BaseProvider

Most providers should extend `BaseProvider` (`packages/core/src/providers/base-provider.ts`), which provides:

- **Retry logic** with exponential backoff (3 retries for server errors, 5 for rate limits)
- **Timeout protection** (60s connection, 90s per-chunk for streaming)
- **SSE stream parsing** with `[DONE]` sentinel detection
- **Error classification** via `ProviderError` (retryable vs permanent)

### Required Overrides

| Method | Purpose | Example |
|--------|---------|---------|
| `name` | Provider identifier | `readonly name = 'deepseek'` |
| `displayName` | User-facing name | `readonly displayName = 'DeepSeek'` |
| `getDefaultBaseUrl()` | API base URL | `return 'https://api.deepseek.com'` |
| `listModels()` | Available models | `return DEEPSEEK_MODELS` |

### Optional Hook Overrides

| Hook | When to Override | Examples |
|------|-----------------|----------|
| `getCompletionUrl()` | API path differs from `/chat/completions` | Anthropic: `/v1/messages`, AvaFree: `/chat` |
| `getAuthHeaders()` | Auth scheme differs from Bearer token | Anthropic: `x-api-key` header, Generic: optional auth |
| `transformRequest()` | Need to modify the request body | Mistral: `tool_choice` remap, Qwen: strip fields, Zhipu: disable thinking |
| `normalizeResponse()` | Response has non-standard fields | Zhipu: tool args as objects instead of strings |
| `normalizeStreamChunk()` | Stream chunks have non-standard fields | Same as above for streaming |

### Minimal Example (Standard API)

```typescript
// packages/core/src/providers/example/index.ts
import { BaseProvider } from '../base-provider.js';
import type { ModelDefinition } from '../../core/types.js';
import { EXAMPLE_MODELS } from './models.js';

export class ExampleProvider extends BaseProvider {
  readonly name = 'example';
  readonly displayName = 'Example AI';

  protected getDefaultBaseUrl(): string {
    return 'https://api.example.com/v1';
  }

  listModels(): ModelDefinition[] {
    return EXAMPLE_MODELS;
  }
}
```

### Example with Request Transformation

```typescript
// Qwen strips frequency_penalty and reasoning_content
protected transformRequest(request: ChatCompletionRequest): Record<string, unknown> {
  const transformed = { ...request } as Record<string, unknown>;
  delete transformed.frequency_penalty;
  // ...
  return transformed;
}
```

### Full Override (Non-Standard API)

If the provider uses a completely different API format (like Anthropic's Messages API), override `createCompletion()` and `createStreamingCompletion()` directly. You can still use `fetchWithRetry()` for retry/timeout behavior.

See `packages/core/src/providers/anthropic/index.ts` for a complete example.

## Model Definitions

Define models in a separate `models.ts` file:

```typescript
// packages/core/src/providers/example/models.ts
import type { ModelDefinition } from '../../core/types.js';

export const EXAMPLE_MODELS: ModelDefinition[] = [
  {
    id: 'example-large',
    name: 'Example Large',
    provider: 'example',
    contextWindow: 128000,
    maxOutputTokens: 4096,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: false,   // optional
    supportsVision: false,     // optional
    pricing: {                 // optional
      inputPerMillion: 1.00,
      outputPerMillion: 3.00,
    },
  },
];
```

### Capability Flags

| Flag | Effect |
|------|--------|
| `supportsToolCalls` | Enables tool use (file ops, bash, git, etc.) |
| `supportsStreaming` | Enables real-time token streaming |
| `supportsThinking` | Agent may send thinking tokens / reasoning_content |
| `supportsVision` | Enables image/screenshot input |

## Registration

### 1. Add to Built-In Providers

In `packages/core/src/providers/provider-registry.ts`:

```typescript
// Import
import { ExampleProvider } from './example/index.js';
import { EXAMPLE_MODELS } from './example/models.js';

// Add to ALL_MODELS
const ALL_MODELS = {
  // ...existing...
  example: EXAMPLE_MODELS,
};

// Add to BUILT_IN_PROVIDERS
const BUILT_IN_PROVIDERS = {
  // ...existing...
  example: (config) => new ExampleProvider(config),
};
```

### 2. Export from Core

In `packages/core/src/index.ts`:

```typescript
export { ExampleProvider } from './providers/example/index.js';
```

## Testing

Follow the established pattern in `packages/core/tests/provider-contracts.test.ts`:

1. Mock `fetch` globally with `vi.stubGlobal('fetch', mockFetch)`
2. Test request shape: URL, headers, body transformations
3. Test response normalization: tool args, finish reasons, token usage
4. Test streaming: SSE parsing, chunk format
5. Test provider metadata: name, displayName, listModels

See existing provider tests for fixture helpers (`jsonResponse`, `sseStream`, `streamResponse`).

## Resilience

Providers automatically participate in the failover system. When a provider fails with a transient error (429, 500, 502, 503), the `ResilientProvider` wrapper tries compatible models from other registered providers. No extra code needed — just ensure `ModelDefinition` capability flags are accurate.
