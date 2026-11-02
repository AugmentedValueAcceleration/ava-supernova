/**
 * What the CLI shares with the extension and the IDE.
 *
 * A user with more than one Ava app enters each key once and sets things up
 * once. Keys live in the OS keychain (Windows Credential Manager, macOS
 * Keychain, the Secret Service on Linux) in the entries the extension's
 * src/secrets/shared-keychain.ts and the IDE's src/lib/provider-keys.ts use:
 * service `com.augmentedvalueacceleration.ava`, account `byok.<Field>`, and
 * `local.apiKey` for a local model server. Everything else about the user is
 * in ~/.ava: settings.json (language, chat model, Ava's settings, the local
 * model), general.json (your name), personality.json (Ava's style).
 *
 * Keys used to sit in plaintext in ~/.ava/config.json. They are moved into
 * the keychain the first time the CLI runs — each one read back before the
 * plaintext copy is removed. With no keychain on the machine, config.json
 * stays the store, as before.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { AVA_HOME } from '@ava/core';

const SERVICE = 'com.augmentedvalueacceleration.ava';
const CONFIG = join(AVA_HOME, 'config.json');
const SETTINGS = join(AVA_HOME, 'settings.json');
const GENERAL = join(AVA_HOME, 'general.json');

/** Provider id (as core's key test and the CLI use it) → shared keychain field. */
export const FIELDS: Record<string, string> = {
  qwen: 'Qwen',
  deepseek: 'DeepSeek',
  kimi: 'Moonshot',
  glm: 'Zhipu',
  mistral: 'Mistral',
  minimax: 'MiniMax',
  xiaomi: 'Xiaomi',
  tencent: 'Tencent',
  nvidia: 'NVIDIA',
  brave: 'Brave',
};

/** config.json names some of these differently (zhipu for glm). */
const CONFIG_ALIASES: Record<string, string> = { zhipu: 'glm' };

interface Entry { setPassword(p: string): void; getPassword(): string | null; deletePassword(): boolean }
interface Keyring { Entry: new (service: string, user: string) => Entry }

let keyring: Keyring | null | undefined;
function kr(): Keyring | null {
  if (keyring !== undefined) return keyring;
  try {
    keyring = createRequire(import.meta.url)('@napi-rs/keyring') as Keyring;
  } catch {
    keyring = null; // no build for this machine — config.json stays the store
  }
  return keyring;
}

function entry(account: string): Entry | null {
  const k = kr();
  if (!k) return null;
  try { return new k.Entry(SERVICE, account); } catch { return null; }
}

function readJson(path: string): Record<string, unknown> {
  try {
    const d = JSON.parse(readFileSync(path, 'utf-8'));
    return d && typeof d === 'object' ? d as Record<string, unknown> : {};
  } catch { return {}; }
}

function writeJson(path: string, data: Record<string, unknown>): void {
  mkdirSync(AVA_HOME, { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
}

/** Write a secret and read it back. False when the keychain did not keep it. */
function keep(account: string, value: string): boolean {
  const e = entry(account);
  if (!e) return false;
  try {
    e.setPassword(value);
    return e.getPassword() === value;
  } catch { return false; }
}

/**
 * Every provider key, by provider id. Moves any plaintext key in config.json
 * into the keychain on the way (read back before the plaintext is removed).
 */
export function loadProviderKeys(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, field] of Object.entries(FIELDS)) {
    try {
      const v = entry(`byok.${field}`)?.getPassword();
      if (v) out[id] = v;
    } catch { /* unreadable — try config.json below */ }
  }
  const raw = readJson(CONFIG);
  const providers = (raw.providers ?? {}) as Record<string, { apiKey?: string; baseUrl?: string } | unknown>;
  let changed = false;
  for (const [name, settings] of Object.entries(providers)) {
    const id = CONFIG_ALIASES[name] ?? name;
    const field = FIELDS[id];
    const key = settings && typeof settings === 'object' ? (settings as { apiKey?: string }).apiKey : undefined;
    if (!field || !key) continue;
    // The keychain wins a clash: a key there was set more recently, in any app.
    if (!out[id]) out[id] = key;
    if (out[id] === key ? keep(`byok.${field}`, key) : true) {
      delete providers[name];
      changed = true;
    }
  }
  if (changed) {
    raw.providers = providers;
    writeJson(CONFIG, raw);
  }
  return out;
}

/** Save a key where every Ava app finds it; config.json only without a keychain. */
export function saveProviderKey(id: string, key: string): void {
  const field = FIELDS[id];
  if (field && keep(`byok.${field}`, key)) return;
  const raw = readJson(CONFIG);
  const providers = (raw.providers ?? {}) as Record<string, unknown>;
  providers[id] = { apiKey: key };
  raw.providers = providers;
  writeJson(CONFIG, raw);
}

export function removeProviderKey(id: string): void {
  const field = FIELDS[id];
  try { if (field) entry(`byok.${field}`)?.deletePassword(); } catch { /* gone */ }
  const raw = readJson(CONFIG);
  const providers = (raw.providers ?? {}) as Record<string, unknown>;
  for (const name of Object.keys(providers)) if ((CONFIG_ALIASES[name] ?? name) === id) delete providers[name];
  raw.providers = providers;
  writeJson(CONFIG, raw);
}

// ── The local model server (Ollama, LM Studio…) ─────────────────────────────

export interface LocalModel { baseUrl: string; modelName: string; label: string; models: string[]; apiKey?: string }

/** The local model set up in any Ava app, or undefined. */
export function loadLocalModel(): LocalModel | undefined {
  const m = readJson(SETTINGS).local_model as Partial<LocalModel> | undefined;
  if (!m?.baseUrl) return undefined;
  let apiKey: string | undefined;
  try { apiKey = entry('local.apiKey')?.getPassword() ?? undefined; } catch { /* none */ }
  return {
    baseUrl: m.baseUrl,
    modelName: m.modelName ?? '',
    label: m.label ?? '',
    models: Array.isArray(m.models) ? m.models.filter((x) => typeof x === 'string') : [],
    apiKey,
  };
}

export function saveLocalModel(m: LocalModel): void {
  const doc = readJson(SETTINGS);
  doc.schema_version = 1;
  doc.local_model = { baseUrl: m.baseUrl, modelName: m.modelName, label: m.label, models: m.models };
  writeJson(SETTINGS, doc);
  if (m.apiKey) keep('local.apiKey', m.apiKey);
  else try { entry('local.apiKey')?.deletePassword(); } catch { /* gone */ }
}

// ── Settings, name ─────────────────────────────────────────────────────────

/** A field of ~/.ava/settings.json, as the other apps last wrote it. */
export function sharedSetting<T>(id: string): T | undefined {
  const v = readJson(SETTINGS)[id];
  return v === undefined || v === null ? undefined : v as T;
}

/** Record a change made here, so the other apps follow it. */
export function setSharedSetting(id: string, value: unknown): void {
  const doc = readJson(SETTINGS);
  doc.schema_version = 1;
  if (value === undefined || value === null) delete doc[id]; else doc[id] = value;
  writeJson(SETTINGS, doc);
}

/** Your name, as you gave it in any Ava app. */
export function sharedUserName(): string | undefined {
  const n = readJson(GENERAL).display_name;
  return typeof n === 'string' && n.trim() ? n.trim() : undefined;
}

/** The account-era platform key is dead; clear it so nothing routes on it. */
export function clearPlatformKey(): void {
  const raw = readJson(CONFIG);
  if (!('platformKey' in raw)) return;
  delete raw.platformKey;
  writeJson(CONFIG, raw);
}
