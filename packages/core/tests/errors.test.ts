import { describe, it, expect } from 'vitest';
import { AvaError, ProviderError, ToolExecutionError, ConfigError } from '../src/core/errors.js';

describe('AvaError', () => {
  it('stores code and message', () => {
    const err = new AvaError('Something broke', 'TEST_CODE');
    expect(err.message).toBe('Something broke');
    expect(err.code).toBe('TEST_CODE');
    expect(err.name).toBe('AvaError');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('ProviderError', () => {
  it('provides human-readable messages for common HTTP status codes', () => {
    const cases: Array<[number, string]> = [
      [400, 'Bad request'],
      [401, 'Invalid API key'],
      [402, 'Insufficient credits'],
      [403, 'Access denied'],
      [404, 'Model not found'],
      [429, 'Rate limited'],
      [500, 'experiencing issues'],
      [502, 'experiencing issues'],
      [503, 'experiencing issues'],
    ];

    for (const [status, expected] of cases) {
      const err = new ProviderError(`HTTP ${status}`, 'DeepSeek', status);
      expect(err.humanMessage).toContain(expected);
    }
  });

  it('falls back to raw message for unknown status codes', () => {
    const err = new ProviderError('Something weird', 'Kimi', 418);
    expect(err.humanMessage).toBe('Something weird');
  });

  it('includes provider name in human messages', () => {
    const err = new ProviderError('error', 'Zhipu', 401);
    expect(err.humanMessage).toContain('Zhipu');
  });

  it('stores provider, statusCode, and responseBody', () => {
    const err = new ProviderError('msg', 'Mistral', 500, { error: 'details' });
    expect(err.provider).toBe('Mistral');
    expect(err.statusCode).toBe(500);
    expect(err.responseBody).toEqual({ error: 'details' });
  });
});

describe('ToolExecutionError', () => {
  it('stores tool name', () => {
    const err = new ToolExecutionError('Failed to read', 'file_read');
    expect(err.toolName).toBe('file_read');
    expect(err.code).toBe('TOOL_EXECUTION_ERROR');
  });
});

describe('ConfigError', () => {
  it('has CONFIG_ERROR code', () => {
    const err = new ConfigError('Bad config');
    expect(err.code).toBe('CONFIG_ERROR');
    expect(err.name).toBe('ConfigError');
  });
});
