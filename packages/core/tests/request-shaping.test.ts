import { describe, it, expect } from 'vitest';
import {
  resolveApiModel,
  messagesHaveImages,
  stripReasoningContent,
  reorderSystemForQwen,
  shapeMessages,
  isZhipuFlashModel,
  shapeParams,
  shapeOpenAICompatBody,
} from '../src/providers/request-shaping/index.js';

/**
 * Parity spec: these assertions encode the CURRENT platform-route behavior.
 * The shared shaper must reproduce it exactly so adopting it in the web routes
 * is a zero-regression change. If a test here changes, the platform output
 * changes — that must be a deliberate decision, not a drift.
 */

describe('resolveApiModel — model-id translation', () => {
  it('maps Mistral friendly ids to date-stamped snapshots (platform + bare)', () => {
    expect(resolveApiModel('mistral-large-3-platform')).toBe('mistral-large-2512');
    expect(resolveApiModel('mistral-large-3')).toBe('mistral-large-2512');
    expect(resolveApiModel('mistral-small-4-platform')).toBe('mistral-small-2603');
    expect(resolveApiModel('mistral-small-4')).toBe('mistral-small-2603');
    // The bug that started this: Medium 3.5 must resolve to the REAL snapshot,
    // not the ghost `mistral-medium-3-5` that 429'd.
    expect(resolveApiModel('mistral-medium-3.5-platform')).toBe('mistral-medium-2604');
    expect(resolveApiModel('mistral-medium-3.5')).toBe('mistral-medium-2604');
  });

  it('strips the -platform suffix for DeepSeek V4', () => {
    expect(resolveApiModel('deepseek-v4-pro-platform')).toBe('deepseek-v4-pro');
    expect(resolveApiModel('deepseek-v4-flash-platform')).toBe('deepseek-v4-flash');
  });

  it('rolls Qwen legacy aliases forward', () => {
    expect(resolveApiModel('qwen-flash')).toBe('qwen3.5-flash');
    expect(resolveApiModel('qwen-turbo')).toBe('qwen3.5-flash');
    expect(resolveApiModel('qwen3-omni-flash')).toBe('qwen3.5-omni-flash');
  });

  it('passes unknown ids through unchanged', () => {
    expect(resolveApiModel('qwen3.6-plus')).toBe('qwen3.6-plus');
    expect(resolveApiModel('some-future-model')).toBe('some-future-model');
  });

  it('reroutes text-only models to vision variants when images are present', () => {
    expect(resolveApiModel('qwen3.5-flash', true)).toBe('qwen3.5-omni-flash');
    // DeepSeek V4 is text-only at the API level -> Qwen Omni Plus
    expect(resolveApiModel('deepseek-v4-pro-platform', true)).toBe('qwen3.5-omni-plus');
    // Aurora's Large 3 coordinator -> Medium 3.5 (its own vision encoder),
    // applied AFTER the id translation (large-3 -> large-2512 -> medium-2604).
    expect(resolveApiModel('mistral-large-3-platform', true)).toBe('mistral-medium-2604');
  });

  it('does not reroute natively-multimodal models', () => {
    expect(resolveApiModel('qwen3.5-omni-plus', true)).toBe('qwen3.5-omni-plus');
    expect(resolveApiModel('mistral-medium-3.5', true)).toBe('mistral-medium-2604');
  });
});

describe('messagesHaveImages', () => {
  it('detects image_url content parts', () => {
    expect(
      messagesHaveImages([
        { role: 'user', content: [{ type: 'image_url', image_url: { url: 'x' } }] },
      ]),
    ).toBe(true);
  });
  it('is false for plain string content', () => {
    expect(messagesHaveImages([{ role: 'user', content: 'hi' }])).toBe(false);
  });
});

describe('stripReasoningContent', () => {
  it('removes reasoning_content from every message regardless of provider', () => {
    const out = stripReasoningContent([
      { role: 'assistant', content: 'hi', reasoning_content: 'thinking...' },
      { role: 'user', content: 'yo' },
    ]);
    expect(out[0]).not.toHaveProperty('reasoning_content');
    expect(out[0].content).toBe('hi');
    expect(out[1]).toEqual({ role: 'user', content: 'yo' });
  });
});

describe('reorderSystemForQwen', () => {
  it('merges multiple system messages into one leading block', () => {
    const out = reorderSystemForQwen([
      { role: 'system', content: 'A' },
      { role: 'user', content: 'q' },
      { role: 'system', content: 'B' },
    ]);
    expect(out[0]).toEqual({ role: 'system', content: 'A\n\nB' });
    expect(out.slice(1)).toEqual([{ role: 'user', content: 'q' }]);
  });

  it('moves a single non-leading system message to the front', () => {
    const out = reorderSystemForQwen([
      { role: 'user', content: 'q' },
      { role: 'system', content: 'S' },
    ]);
    expect(out[0]).toEqual({ role: 'system', content: 'S' });
  });

  it('is a no-op when already valid', () => {
    const input = [
      { role: 'system', content: 'S' },
      { role: 'user', content: 'q' },
    ];
    expect(reorderSystemForQwen(input)).toEqual(input);
  });
});

describe('shapeMessages — provider-aware', () => {
  it('strips reasoning_content but does NOT reorder for non-Qwen', () => {
    const out = shapeMessages('mistral', [
      { role: 'user', content: 'q' },
      { role: 'system', content: 'S', reasoning_content: 'x' },
    ]);
    expect(out[1]).not.toHaveProperty('reasoning_content');
    expect(out[0].role).toBe('user'); // not reordered
  });

  it('strips AND reorders for Qwen', () => {
    const out = shapeMessages('qwen', [
      { role: 'user', content: 'q' },
      { role: 'system', content: 'S', reasoning_content: 'x' },
    ]);
    expect(out[0].role).toBe('system');
    expect(out[0]).not.toHaveProperty('reasoning_content');
  });
});

describe('isZhipuFlashModel', () => {
  it('matches zhipu flash models only (union of substring + explicit set)', () => {
    expect(isZhipuFlashModel('zhipu', 'glm-5-flash')).toBe(true);
    expect(isZhipuFlashModel('zhipu', 'glm-4.5-air')).toBe(true); // core's explicit fast model
    expect(isZhipuFlashModel('zhipu', 'glm-5')).toBe(false);
    expect(isZhipuFlashModel('qwen', 'qwen3.5-flash')).toBe(false);
  });
});

describe('shapeParams — per-provider quirks', () => {
  it('MiniMax: max_tokens becomes max_completion_tokens', () => {
    const p = shapeParams('minimax', 'minimax-m2', { max_tokens: 100 });
    expect(p.max_completion_tokens).toBe(100);
    expect(p).not.toHaveProperty('max_tokens');
  });

  it('non-MiniMax keeps max_tokens', () => {
    const p = shapeParams('mistral', 'mistral-large-3', { max_tokens: 100 });
    expect(p.max_tokens).toBe(100);
    expect(p).not.toHaveProperty('max_completion_tokens');
  });

  it('Qwen: drops frequency_penalty', () => {
    const p = shapeParams('qwen', 'qwen3.6-plus', { frequency_penalty: 0.5 });
    expect(p).not.toHaveProperty('frequency_penalty');
  });

  it('non-Qwen keeps frequency_penalty', () => {
    const p = shapeParams('deepseek', 'deepseek-v4-pro', { frequency_penalty: 0.5 });
    expect(p.frequency_penalty).toBe(0.5);
  });

  it('Zhipu Flash: forces enable_thinking false', () => {
    expect(shapeParams('zhipu', 'glm-5-flash', {}).enable_thinking).toBe(false);
    expect(shapeParams('zhipu', 'glm-5', {})).not.toHaveProperty('enable_thinking');
  });

  it('streaming opts into usage accounting', () => {
    const p = shapeParams('mistral', 'mistral-large-3', { stream: true });
    expect(p.stream).toBe(true);
    expect(p.stream_options).toEqual({ include_usage: true });
  });

  it('defaults stream to false', () => {
    expect(shapeParams('mistral', 'mistral-large-3', {}).stream).toBe(false);
  });
});

describe('shapeOpenAICompatBody — end-to-end', () => {
  it('builds a complete, translated, shaped body', () => {
    const body = shapeOpenAICompatBody({
      provider: 'mistral',
      model: 'mistral-medium-3.5-platform',
      messages: [
        { role: 'system', content: 'S' },
        { role: 'assistant', content: 'a', reasoning_content: 'think' },
        { role: 'user', content: 'q' },
      ],
      temperature: 0.7,
      max_tokens: 500,
      stream: true,
    });
    expect(body.model).toBe('mistral-medium-2604');
    expect(body.temperature).toBe(0.7);
    expect(body.max_tokens).toBe(500);
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });
    const msgs = body.messages as Array<Record<string, unknown>>;
    expect(msgs[1]).not.toHaveProperty('reasoning_content');
  });

  it('applies vision reroute end-to-end when images are present', () => {
    const body = shapeOpenAICompatBody({
      provider: 'mistral',
      model: 'mistral-large-3-platform',
      messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'x' } }] }],
    });
    expect(body.model).toBe('mistral-medium-2604');
  });
});
