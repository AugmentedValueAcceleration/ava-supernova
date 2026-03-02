import { readFile, writeFile, rename, mkdir, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { AVA_HOME, CONFIG_PATH } from '../core/constants.js';
import type { AvaConfig, ProviderSettings } from './schema.js';
import { DEFAULT_CONFIG } from './schema.js';
import { ConfigError } from '../core/errors.js';

/**
 * Atomic write — writes to a temp file then renames.
 * Rename is atomic on most filesystems, so a crash mid-write
 * won't corrupt the real file.
 */
async function atomicWriteFile(filePath: string, data: string): Promise<void> {
  const tmpPath = join(dirname(filePath), `.${Date.now()}.tmp`);
  await writeFile(tmpPath, data, 'utf-8');
  try {
    await rename(tmpPath, filePath);
  } catch (err) {
    // Clean up temp file if rename fails (disk full, permissions, etc.)
    await unlink(tmpPath).catch(() => {});
    throw err;
  }
}

/** Remove orphaned .tmp files left behind by interrupted atomic writes. */
async function cleanOrphanedTempFiles(dir: string): Promise<void> {
  try {
    const files = await readdir(dir);
    for (const file of files) {
      if (file.endsWith('.tmp')) {
        await unlink(join(dir, file)).catch(() => {});
      }
    }
  } catch { /* directory might not exist */ }
}

/** Validate and sanitize a loaded config, fixing any structural issues. */
function validateConfig(raw: unknown): AvaConfig {
  if (typeof raw !== 'object' || raw === null) {
    throw new ConfigError('Config file is not a valid JSON object');
  }

  const obj = raw as Record<string, unknown>;
  const config = structuredClone(DEFAULT_CONFIG);

  // activeModel
  if (typeof obj.activeModel === 'string') {
    config.activeModel = obj.activeModel;
  }

  // platformKey — Ava platform account key
  if (typeof obj.platformKey === 'string' && obj.platformKey) {
    config.platformKey = obj.platformKey;
  }

  // providers — validate structure, skip malformed entries
  if (typeof obj.providers === 'object' && obj.providers !== null) {
    const providers = obj.providers as Record<string, unknown>;
    const validProviders = ['deepseek', 'kimi', 'qwen'];

    for (const name of validProviders) {
      const entry = providers[name];
      if (entry && typeof entry === 'object' && typeof (entry as ProviderSettings).apiKey === 'string') {
        (config.providers as Record<string, ProviderSettings>)[name] = {
          apiKey: (entry as ProviderSettings).apiKey,
          ...(typeof (entry as ProviderSettings).baseUrl === 'string'
            ? { baseUrl: (entry as ProviderSettings).baseUrl }
            : {}),
        };
      }
    }

    // generic providers array
    if (Array.isArray(providers.generic)) {
      config.providers.generic = providers.generic.filter(
        (g: unknown) =>
          typeof g === 'object' &&
          g !== null &&
          typeof (g as Record<string, unknown>).name === 'string' &&
          typeof (g as Record<string, unknown>).baseUrl === 'string' &&
          Array.isArray((g as Record<string, unknown>).models),
      );
    }
  }

  // preferences — merge with defaults
  if (typeof obj.preferences === 'object' && obj.preferences !== null) {
    const prefs = obj.preferences as Record<string, unknown>;
    if (typeof prefs.temperature === 'number') config.preferences.temperature = prefs.temperature;
    if (typeof prefs.maxTokens === 'number') config.preferences.maxTokens = prefs.maxTokens;
    if (typeof prefs.markdownRendering === 'boolean') config.preferences.markdownRendering = prefs.markdownRendering;
  }

  return config;
}

export class ConfigManager {
  private config: AvaConfig | null = null;

  async load(): Promise<AvaConfig> {
    if (this.config) return this.config;

    // Clean up orphaned temp files from interrupted writes
    cleanOrphanedTempFiles(AVA_HOME).catch(() => {});

    if (!existsSync(CONFIG_PATH)) {
      this.config = structuredClone(DEFAULT_CONFIG);
      return this.config;
    }

    try {
      const raw = await readFile(CONFIG_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      this.config = validateConfig(parsed);
      return this.config;
    } catch (error) {
      if (error instanceof ConfigError) throw error;
      throw new ConfigError(`Failed to read config: ${error}`);
    }
  }

  async save(): Promise<void> {
    if (!this.config) throw new ConfigError('No config loaded');

    await mkdir(AVA_HOME, { recursive: true });
    await atomicWriteFile(CONFIG_PATH, JSON.stringify(this.config, null, 2));
  }

  async get<K extends keyof AvaConfig>(key: K): Promise<AvaConfig[K]> {
    const config = await this.load();
    return config[key];
  }

  async set<K extends keyof AvaConfig>(key: K, value: AvaConfig[K]): Promise<void> {
    const config = await this.load();
    config[key] = value;
    await this.save();
  }

  async needsSetup(): Promise<boolean> {
    const config = await this.load();
    const hasProvider = Object.values(config.providers).some(
      v => v && typeof v === 'object' && 'apiKey' in v,
    );
    return !config.activeModel || (!hasProvider && !config.platformKey);
  }
}
