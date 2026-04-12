/**
 * Knowledge Pack Manager — Domain expertise loader.
 *
 * Manages knowledge packs that give Ava domain-specific context.
 * Packs are stored as JSON files in ~/.ava/knowledge-packs/.
 * Built-in packs ship with core, user packs are created on demand.
 */

import { readFile, writeFile, readdir, mkdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '../core/logger.js';
import type { KnowledgePack, KnowledgePackMeta } from './types.js';
import { BUILTIN_PACKS } from './builtin-packs.js';

const PACKS_DIR = 'knowledge-packs';
const ENABLED_FILE = 'knowledge-enabled.json';

export class KnowledgePackManager {
  private readonly packsDir: string;
  private readonly globalDir: string;
  private enabledIds: Set<string> | null = null;

  constructor(opts: { globalDir: string }) {
    this.globalDir = opts.globalDir;
    this.packsDir = join(opts.globalDir, PACKS_DIR);
  }

  // ── Public API — Read ───────────────────────────────────────────────────────

  /** List all available packs (built-in + user) with enabled status. Internal packs are hidden. */
  async listPacks(): Promise<KnowledgePackMeta[]> {
    const enabled = await this.loadEnabled();
    const userPacks = await this.loadUserPacks();
    // Hide internal packs (e.g. self-knowledge) — always active, not user-facing
    const allPacks = [...BUILTIN_PACKS.filter(p => p.domain !== 'internal'), ...userPacks];

    return allPacks.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      domain: p.domain,
      version: p.version,
      author: p.author,
      builtIn: p.builtIn,
      enabled: enabled.has(p.id),
    }));
  }

  /** Get a single pack by ID (full content). */
  async getPack(id: string): Promise<KnowledgePack | null> {
    // Check built-in first
    const builtin = BUILTIN_PACKS.find(p => p.id === id);
    if (builtin) return builtin;

    // Check user packs
    const filePath = join(this.packsDir, `${id}.json`);
    if (!existsSync(filePath)) return null;

    try {
      const raw = await readFile(filePath, 'utf-8');
      return JSON.parse(raw) as KnowledgePack;
    } catch {
      return null;
    }
  }

  /** Load all enabled packs, optionally filtered by mode and persona. */
  async loadActive(mode?: string, persona?: string): Promise<KnowledgePack[]> {
    const enabled = await this.loadEnabled();
    const packs: KnowledgePack[] = [];

    // Add user-enabled packs
    for (const id of enabled) {
      const pack = await this.getPack(id);
      if (!pack) continue;
      if (pack.domain === 'internal') continue; // Already added above

      // Filter by mode
      if (mode && pack.modes && pack.modes.length > 0 && !pack.modes.includes(mode)) continue;

      // Filter by persona
      if (persona && pack.personas && pack.personas.length > 0 && !pack.personas.includes(persona as any)) continue;

      packs.push(pack);
    }

    return packs;
  }

  /** Build a combined context string from all active packs (for system prompt). */
  async buildContext(mode?: string, persona?: string): Promise<string | null> {
    const packs = await this.loadActive(mode, persona);
    if (packs.length === 0) return null;

    const sections = packs.map(p =>
      `### ${p.name} (${p.domain})\n${p.context}`
    );

    return `## Domain Knowledge\n\nThe following domain expertise is loaded. Use it to inform your responses.\n\n${sections.join('\n\n')}`;
  }

  // ── Public API — Write ──────────────────────────────────────────────────────

  /** Enable a knowledge pack. */
  async enable(id: string): Promise<boolean> {
    const pack = await this.getPack(id);
    if (!pack) return false;

    const enabled = await this.loadEnabled();
    enabled.add(id);
    await this.saveEnabled(enabled);
    logger.info(`[knowledge] Enabled pack: ${pack.name}`);
    return true;
  }

  /** Disable a knowledge pack. */
  async disable(id: string): Promise<boolean> {
    const enabled = await this.loadEnabled();
    if (!enabled.has(id)) return false;

    enabled.delete(id);
    await this.saveEnabled(enabled);
    logger.info(`[knowledge] Disabled pack: ${id}`);
    return true;
  }

  /** Create a custom knowledge pack. */
  async create(pack: Omit<KnowledgePack, 'builtIn'>): Promise<KnowledgePack> {
    const fullPack: KnowledgePack = { ...pack, builtIn: false };

    await mkdir(this.packsDir, { recursive: true });
    const filePath = join(this.packsDir, `${pack.id}.json`);
    await writeFile(filePath, JSON.stringify(fullPack, null, 2), 'utf-8');

    logger.info(`[knowledge] Created pack: ${pack.name}`);
    return fullPack;
  }

  /** Delete a user-created knowledge pack. */
  async delete(id: string): Promise<boolean> {
    // Can't delete built-in packs
    if (BUILTIN_PACKS.some(p => p.id === id)) return false;

    const filePath = join(this.packsDir, `${id}.json`);
    if (!existsSync(filePath)) return false;

    await unlink(filePath);
    await this.disable(id);
    logger.info(`[knowledge] Deleted pack: ${id}`);
    return true;
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private async loadEnabled(): Promise<Set<string>> {
    if (this.enabledIds) return this.enabledIds;

    const filePath = join(this.globalDir, ENABLED_FILE);
    if (!existsSync(filePath)) {
      this.enabledIds = new Set();
      return this.enabledIds;
    }

    try {
      const raw = await readFile(filePath, 'utf-8');
      const data = JSON.parse(raw) as string[];
      this.enabledIds = new Set(Array.isArray(data) ? data : []);
    } catch {
      this.enabledIds = new Set();
    }

    return this.enabledIds;
  }

  private async saveEnabled(enabled: Set<string>): Promise<void> {
    this.enabledIds = enabled;
    await mkdir(this.globalDir, { recursive: true });
    const filePath = join(this.globalDir, ENABLED_FILE);
    await writeFile(filePath, JSON.stringify([...enabled], null, 2), 'utf-8');
  }

  private async loadUserPacks(): Promise<KnowledgePack[]> {
    if (!existsSync(this.packsDir)) return [];

    try {
      const files = await readdir(this.packsDir);
      const packs: KnowledgePack[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const raw = await readFile(join(this.packsDir, file), 'utf-8');
          packs.push(JSON.parse(raw) as KnowledgePack);
        } catch {
          // Skip malformed packs
        }
      }

      return packs;
    } catch {
      return [];
    }
  }
}
