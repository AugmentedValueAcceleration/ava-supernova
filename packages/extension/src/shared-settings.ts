/**
 * Everything about you follows you between the apps.
 *
 * A user with the extension AND the IDE sets things up once. What is about
 * THEM lives in ~/.ava, which both apps read; the IDE's src/lib/shared-settings.ts
 * keeps the same files from its side:
 *   - ~/.ava/settings.json    language, working hours, Ava's settings, the chat
 *                             model, the local model server, local embeddings,
 *                             tool permissions per category
 *   - ~/.ava/avatar.dat       your picture — already where the extension keeps it
 *   - ~/.ava/personality.json Ava's style — already where the extension keeps it
 * Secrets go to the shared keychain instead (secrets/shared-keychain.ts).
 *
 * The rest of the extension keeps reading VS Code settings, globalState and
 * SecretStorage, unchanged. This keeps those and settings.json matched: at
 * activation, when the window gains or loses focus, when an Ava setting
 * changes, and every few seconds. It remembers what it last synced, so it can
 * tell "the IDE changed this" (copy it here) from "you changed this here"
 * (copy it there). On first sync the shared copy wins.
 *
 * VS Code settings are read with inspect().globalValue — only what the user
 * actually set. Reading get() would return the defaults and push them onto
 * the IDE as though they were choices.
 */
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { AVA_HOME } from '@ava/core';

const FILE = join(AVA_HOME, 'settings.json');
const SNAPSHOT_KEY = 'ava.sharedSync';

type Doc = Record<string, unknown>;
type Val = string | null;

interface Item {
  id: string;
  local(): Promise<unknown>;
  setLocal(v: unknown): Promise<void>;
}

function canon(v: unknown): Val {
  if (v === undefined || v === null) return null;
  const sort = (x: unknown): unknown => Array.isArray(x)
    ? x.map(sort)
    : x && typeof x === 'object'
      ? Object.fromEntries(Object.keys(x as object).sort().map((k) => [k, sort((x as Record<string, unknown>)[k])]))
      : x;
  return JSON.stringify(sort(v));
}

const parse = (v: Val): unknown => { try { return v === null ? null : JSON.parse(v); } catch { return null; } };

function readDoc(): Doc {
  try {
    const d = JSON.parse(readFileSync(FILE, 'utf-8'));
    return d && typeof d === 'object' ? d as Doc : {};
  } catch { return {}; }
}

const G = vscode.ConfigurationTarget.Global;
const cfg = () => vscode.workspace.getConfiguration('ava-supernova');
/** Only a value the user set (not the default). */
const userValue = <T,>(key: string): T | undefined => cfg().inspect<T>(key)?.globalValue;

/** The fields of Ava's settings both apps have. Extension key → shared field. */
const PREFS: Record<string, string> = {
  temperature: 'preferences.temperature',
  maxTokens: 'preferences.maxTokens',
  permissionMode: 'preferences.permissionMode',
  autoMemory: 'preferences.autoMemory',
  streamResponses: 'preferences.streamResponses',
  contributeSharedLearning: 'contributeSharedLearning',
};

const LOCAL = {
  baseUrl: 'ava-supernova.provider.local.baseUrl',
  modelName: 'ava-supernova.provider.local.modelName',
  label: 'ava-supernova.provider.local.modelLabel',
  models: 'ava-supernova.provider.local.models',
};

export class SharedSettingsSync {
  private running: Promise<void> = Promise.resolve();
  private readonly items: Item[];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log: (msg: string) => void,
    /** A chat mode chosen in the IDE — the open chat panel switches to it. */
    private readonly onChatMode: (mode: string | undefined) => void = () => {},
  ) {
    const state = context.globalState;
    const secrets = context.secrets;
    this.items = [
      {
        id: 'language',
        local: async () => userValue<string>('preferences.language'),
        setLocal: async (v) => { await cfg().update('preferences.language', typeof v === 'string' ? v : undefined, G); },
      },
      {
        id: 'working_hours',
        local: async () => state.get('ava.workingHours') ?? null,
        setLocal: async (v) => { await state.update('ava.workingHours', v ?? undefined); },
      },
      {
        id: 'preferences',
        local: async () => {
          const out: Record<string, unknown> = {};
          for (const [field, key] of Object.entries(PREFS)) {
            const v = userValue(key);
            if (v !== undefined) out[field] = v;
          }
          return Object.keys(out).length ? out : null;
        },
        setLocal: async (v) => {
          const p = (v ?? {}) as Record<string, unknown>;
          for (const [field, key] of Object.entries(PREFS)) await cfg().update(key, p[field], G);
        },
      },
      {
        id: 'chat_model',
        local: async () => userValue<string>('activeModel') || null,
        setLocal: async (v) => { await cfg().update('activeModel', typeof v === 'string' ? v : undefined, G); },
      },
      {
        // Core's ids ('work', not the panel's 'code') — see AvaViewProvider.applyChatMode.
        id: 'chat_mode',
        local: async () => state.get<string>('ava.chatMode') ?? null,
        setLocal: async (v) => {
          await state.update('ava.chatMode', typeof v === 'string' ? v : undefined);
          this.onChatMode(typeof v === 'string' ? v : undefined);
        },
      },
      {
        id: 'local_model',
        local: async () => {
          const baseUrl = await secrets.get(LOCAL.baseUrl);
          if (!baseUrl) return null;
          let models: string[] = [];
          try { const m = JSON.parse((await secrets.get(LOCAL.models)) ?? '[]'); if (Array.isArray(m)) models = m; } catch { /* none */ }
          return { baseUrl, modelName: (await secrets.get(LOCAL.modelName)) ?? '', label: (await secrets.get(LOCAL.label)) ?? '', models };
        },
        setLocal: async (v) => {
          const m = v as { baseUrl?: string; modelName?: string; label?: string; models?: string[] } | null;
          const put = async (key: string, val: string | undefined) => { if (val) await secrets.store(key, val); else await secrets.delete(key); };
          await put(LOCAL.modelName, m?.modelName);
          await put(LOCAL.label, m?.label);
          await put(LOCAL.models, m?.models?.length ? JSON.stringify(m.models) : undefined);
          await put(LOCAL.baseUrl, m?.baseUrl); // last: it is what marks the local model as set up
        },
      },
      {
        id: 'embeddings',
        local: async () => {
          const enabled = userValue<boolean>('preferences.useLocalEmbeddings');
          const model = userValue<string>('preferences.embeddingModel');
          const baseUrl = userValue<string>('preferences.embeddingBaseUrl');
          return enabled !== undefined || model || baseUrl ? { enabled: !!enabled, model: model ?? '', baseUrl: baseUrl ?? '' } : null;
        },
        setLocal: async (v) => {
          const e = v as { enabled?: boolean; model?: string; baseUrl?: string } | null;
          await cfg().update('preferences.useLocalEmbeddings', e ? !!e.enabled : undefined, G);
          await cfg().update('preferences.embeddingModel', e?.model || undefined, G);
          await cfg().update('preferences.embeddingBaseUrl', e?.baseUrl || undefined, G);
        },
      },
      {
        id: 'category_permissions',
        local: async () => {
          const p = state.get<Record<string, string>>('ava.categoryPermissions');
          return p && Object.keys(p).length ? p : null;
        },
        setLocal: async (v) => { await state.update('ava.categoryPermissions', v ?? undefined); },
      },
    ];
  }

  /**
   * Match the extension's copy and ~/.ava/settings.json. `prefer` settles only a
   * true clash (the same thing changed in both apps since the last sync).
   */
  sync(prefer: 'shared' | 'local' = 'shared'): Promise<void> {
    const run = async () => {
      const doc = readDoc();
      let dirty = false;
      const snap = { ...(this.context.globalState.get<Record<string, Val>>(SNAPSHOT_KEY) ?? {}) };
      for (const item of this.items) {
        try {
          const L = canon(await item.local());
          const S = canon(doc[item.id]);
          const last = snap[item.id];
          if (L === S) { snap[item.id] = L; continue; }
          const take = last === undefined ? (S !== null ? 'shared' : 'local')
            : L === last ? 'shared'
              : S === last ? 'local'
                : prefer;
          if (take === 'shared') {
            await item.setLocal(parse(S));
            snap[item.id] = S;
            this.log(`took ${item.id} from ~/.ava (set in the IDE)`);
          } else {
            if (L === null) delete doc[item.id]; else doc[item.id] = parse(L);
            dirty = true;
            snap[item.id] = L;
          }
        } catch (err) {
          this.log(`${item.id} did not sync: ${err instanceof Error ? err.message : err}`);
        }
      }
      if (dirty) {
        doc.schema_version = 1;
        await mkdir(AVA_HOME, { recursive: true });
        await writeFile(FILE, JSON.stringify(doc, null, 2), 'utf-8');
      }
      await this.context.globalState.update(SNAPSHOT_KEY, snap);
    };
    this.running = this.running.then(run, run).catch(() => { /* never throws */ });
    return this.running;
  }

  /** Activation, focus, blur, Ava setting changes and a gentle interval. */
  watch(): vscode.Disposable {
    const timer = setInterval(() => { void this.sync('local'); }, 15_000);
    return vscode.Disposable.from(
      vscode.window.onDidChangeWindowState((s) => { void this.sync(s.focused ? 'shared' : 'local'); }),
      vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration('ava-supernova')) void this.sync('local'); }),
      { dispose: () => clearInterval(timer) },
    );
  }
}
