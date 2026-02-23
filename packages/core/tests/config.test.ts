import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigManager } from '../src/config/config.js';
import { ConfigError } from '../src/core/errors.js';
import { DEFAULT_CONFIG } from '../src/config/schema.js';

// ── Mock filesystem ─────────────────────────────────────────────────────────

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(async () => undefined),
  rename: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const mockReadFile = readFile as unknown as ReturnType<typeof vi.fn>;
const mockExistsSync = existsSync as unknown as ReturnType<typeof vi.fn>;
const mockWriteFile = writeFile as unknown as ReturnType<typeof vi.fn>;
const mockRename = rename as unknown as ReturnType<typeof vi.fn>;
const mockMkdir = mkdir as unknown as ReturnType<typeof vi.fn>;

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ConfigManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('load', () => {
    it('returns DEFAULT_CONFIG when config file does not exist', async () => {
      mockExistsSync.mockReturnValue(false);
      const config = new ConfigManager();
      const result = await config.load();
      expect(result.activeModel).toBe('');
      expect(result.preferences.temperature).toBe(0.7);
      expect(result.preferences.maxTokens).toBe(8192);
    });

    it('parses a valid config file and merges with defaults', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(JSON.stringify({
        activeModel: 'deepseek:deepseek-chat',
        providers: {
          deepseek: { apiKey: 'sk-test' },
        },
      }));

      const config = new ConfigManager();
      const result = await config.load();
      expect(result.activeModel).toBe('deepseek:deepseek-chat');
      expect(result.preferences.temperature).toBe(0.7); // merged default
    });

    it('caches config after first load (does not re-read)', async () => {
      mockExistsSync.mockReturnValue(false);
      const config = new ConfigManager();
      await config.load();
      await config.load();
      // existsSync called only once since load returns cached config on second call
      expect(mockExistsSync).toHaveBeenCalledTimes(1);
    });

    it('throws ConfigError for non-object JSON (e.g., a string)', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue('"just a string"');

      const config = new ConfigManager();
      await expect(config.load()).rejects.toThrow(ConfigError);
    });

    it('throws ConfigError for malformed JSON', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue('{broken');

      const config = new ConfigManager();
      await expect(config.load()).rejects.toThrow(ConfigError);
    });
  });

  describe('validateConfig - providers', () => {
    it('accepts valid provider with apiKey', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(JSON.stringify({
        providers: {
          kimi: { apiKey: 'sk-kimi' },
        },
      }));

      const config = new ConfigManager();
      const result = await config.load();
      expect((result.providers as Record<string, unknown>).kimi).toEqual({ apiKey: 'sk-kimi' });
    });

    it('accepts provider with apiKey and baseUrl', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(JSON.stringify({
        providers: {
          deepseek: { apiKey: 'sk-ds', baseUrl: 'https://custom.api.com' },
        },
      }));

      const config = new ConfigManager();
      const result = await config.load();
      expect((result.providers as Record<string, unknown>).deepseek).toEqual({
        apiKey: 'sk-ds',
        baseUrl: 'https://custom.api.com',
      });
    });

    it('skips malformed provider entries (missing apiKey)', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(JSON.stringify({
        providers: {
          deepseek: { baseUrl: 'https://api.example.com' }, // no apiKey
        },
      }));

      const config = new ConfigManager();
      const result = await config.load();
      expect((result.providers as Record<string, unknown>).deepseek).toBeUndefined();
    });

    it('ignores unknown provider names', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(JSON.stringify({
        providers: {
          openai: { apiKey: 'sk-test' },
        },
      }));

      const config = new ConfigManager();
      const result = await config.load();
      expect((result.providers as Record<string, unknown>).openai).toBeUndefined();
    });

    it('validates generic providers array', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(JSON.stringify({
        providers: {
          generic: [
            { name: 'Local', baseUrl: 'http://localhost:8080', models: [] },
            { invalid: true }, // should be dropped
          ],
        },
      }));

      const config = new ConfigManager();
      const result = await config.load();
      expect(result.providers.generic).toHaveLength(1);
      expect(result.providers.generic![0].name).toBe('Local');
    });
  });

  describe('validateConfig - preferences', () => {
    it('merges temperature and maxTokens when provided', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(JSON.stringify({
        preferences: { temperature: 0.3, maxTokens: 4096 },
      }));

      const config = new ConfigManager();
      const result = await config.load();
      expect(result.preferences.temperature).toBe(0.3);
      expect(result.preferences.maxTokens).toBe(4096);
    });

    it('ignores non-number temperature values', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(JSON.stringify({
        preferences: { temperature: 'hot' },
      }));

      const config = new ConfigManager();
      const result = await config.load();
      expect(result.preferences.temperature).toBe(0.7); // default
    });

    it('preserves defaults for missing preference fields', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(JSON.stringify({ preferences: {} }));

      const config = new ConfigManager();
      const result = await config.load();
      expect(result.preferences.temperature).toBe(0.7);
      expect(result.preferences.maxTokens).toBe(8192);
      expect(result.preferences.markdownRendering).toBe(true);
    });
  });

  describe('save', () => {
    it('throws ConfigError if no config loaded', async () => {
      const config = new ConfigManager();
      await expect(config.save()).rejects.toThrow(ConfigError);
    });

    it('calls mkdir and writes atomically', async () => {
      mockExistsSync.mockReturnValue(false);
      const config = new ConfigManager();
      await config.load(); // loads defaults
      await config.save();

      expect(mockMkdir).toHaveBeenCalled();
      expect(mockWriteFile).toHaveBeenCalled();
      expect(mockRename).toHaveBeenCalled();
    });
  });

  describe('get / set', () => {
    it('get returns value from loaded config', async () => {
      mockExistsSync.mockReturnValue(false);
      const config = new ConfigManager();
      const model = await config.get('activeModel');
      expect(model).toBe('');
    });

    it('set updates value and triggers save', async () => {
      mockExistsSync.mockReturnValue(false);
      const config = new ConfigManager();
      await config.load();
      await config.set('activeModel', 'kimi:kimi-k2.5');

      const model = await config.get('activeModel');
      expect(model).toBe('kimi:kimi-k2.5');
      // save was called (mkdir + writeFile + rename)
      expect(mockMkdir).toHaveBeenCalled();
    });
  });

  describe('needsSetup', () => {
    it('returns true when activeModel is empty string', async () => {
      mockExistsSync.mockReturnValue(false);
      const config = new ConfigManager();
      expect(await config.needsSetup()).toBe(true);
    });

    it('returns false when activeModel is set and providers exist', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(JSON.stringify({
        activeModel: 'deepseek:deepseek-chat',
        providers: { deepseek: { apiKey: 'sk-test' } },
      }));

      const config = new ConfigManager();
      expect(await config.needsSetup()).toBe(false);
    });
  });
});
