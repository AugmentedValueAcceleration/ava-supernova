import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { AVA_HOME, CONFIG_PATH } from '../core/constants.js';
import type { AvaConfig } from './schema.js';
import { DEFAULT_CONFIG } from './schema.js';
import { ConfigError } from '../core/errors.js';

export class ConfigManager {
  private config: AvaConfig | null = null;

  async load(): Promise<AvaConfig> {
    if (this.config) return this.config;

    if (!existsSync(CONFIG_PATH)) {
      this.config = structuredClone(DEFAULT_CONFIG);
      return this.config;
    }

    try {
      const raw = await readFile(CONFIG_PATH, 'utf-8');
      this.config = { ...structuredClone(DEFAULT_CONFIG), ...JSON.parse(raw) };
      return this.config!;
    } catch (error) {
      throw new ConfigError(`Failed to read config: ${error}`);
    }
  }

  async save(): Promise<void> {
    if (!this.config) throw new ConfigError('No config loaded');

    await mkdir(AVA_HOME, { recursive: true });
    await writeFile(CONFIG_PATH, JSON.stringify(this.config, null, 2), 'utf-8');
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
    return !config.activeModel || Object.keys(config.providers).length === 0;
  }
}
