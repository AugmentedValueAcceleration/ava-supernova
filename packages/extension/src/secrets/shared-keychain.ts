/**
 * Provider keys, shared with the IDE through the OS keychain.
 *
 * A user who has both apps enters a key once. The IDE keeps provider keys in
 * the OS keychain (Windows Credential Manager, macOS Keychain, the Secret
 * Service on Linux) as service `com.augmentedvalueacceleration.ava`, account
 * `byok.<Field>`. This wrapper puts the extension's provider keys in the SAME
 * entries, so a key added, changed or removed in either app is the same key
 * in the other.
 *
 * VS Code's own SecretStorage cannot be shared: since VS Code moved off keytar
 * it encrypts secrets into its own database, readable only by VS Code.
 *
 * It wraps `context.secrets` rather than replacing every call site: anything
 * that is not a provider key (the secret vault, the local-model settings,
 * connection credentials) passes straight through to VS Code untouched.
 *
 * The keychain is reached through @napi-rs/keyring (keyring-rs, the crate the
 * IDE uses, so the entry format is identical — checked both ways on Windows).
 * Two more secrets follow the user the same way, in entries the IDE's
 * src/lib/keychain.ts reads: the local model server's key (`local.apiKey`)
 * and the secret vault (`vault.head` + numbered pieces — a Windows credential
 * holds only 1,280 characters, and a vault can hold a private key or two).
 *
 * Its native builds for every platform ship in dist/native/ (esbuild.config.mjs)
 * and the one for this machine is loaded at runtime. If none fits, or it fails
 * to load, provider keys stay in VS Code's SecretStorage as before: an
 * extension that keeps keys to itself beats one that cannot keep them at all.
 */
import * as path from 'node:path';
import * as vscode from 'vscode';

const SERVICE = 'com.augmentedvalueacceleration.ava';

/** Extension provider name → the IDE's keychain field. The fields are the
 *  IDE's (src/lib/provider-keys.ts PROVIDER_FIELDS) and must match exactly. */
const FIELD: Record<string, string> = {
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

const PROVIDER_SECRET = /^ava-supernova\.provider\.([a-z]+)\.apiKey$/;
const LOCAL_KEY_SECRET = 'ava-supernova.provider.local.apiKey';
const VAULT_SECRET = 'ava-supernova.secretVault';
// Characters per piece (the pattern in writeVault/writeBlob uses it literally).

/** The slice of @napi-rs/keyring used here. */
interface NativeEntry {
  setPassword(password: string): void;
  getPassword(): string | null;
  deletePassword(): boolean;
}
interface NativeKeyring {
  Entry: new (service: string, username: string) => NativeEntry;
}

function nativeTarget(): string | undefined {
  const { platform, arch } = process;
  if (arch !== 'x64' && arch !== 'arm64') return undefined;
  if (platform === 'win32') return `win32-${arch}-msvc`;
  if (platform === 'darwin') return `darwin-${arch}`;
  if (platform === 'linux') {
    let musl = false;
    try {
      const report = process.report?.getReport() as { header?: { glibcVersionRuntime?: string } } | undefined;
      musl = !report?.header?.glibcVersionRuntime;
    } catch { /* assume glibc */ }
    if (musl) return arch === 'x64' ? 'linux-x64-musl' : undefined;
    return `linux-${arch}-gnu`;
  }
  return undefined;
}

export class SharedSecretStorage implements vscode.SecretStorage {
  private native: NativeKeyring | null | undefined;
  private readonly emitter = new vscode.EventEmitter<vscode.SecretStorageChangeEvent>();
  /** Keys whose VS Code copy this wrapper is removing, so VS Code's change
   *  event for that removal is not passed on as a change to the key. */
  private readonly quiet = new Set<string>();
  /** What the keychain held at the last look — for spotting the IDE's edits. */
  private snapshot = new Map<string, string | null>();

  constructor(
    private readonly inner: vscode.SecretStorage,
    private readonly log: (msg: string) => void,
  ) {}

  readonly onDidChange: vscode.Event<vscode.SecretStorageChangeEvent> = (listener, thisArgs, disposables) => {
    const fromVsCode = this.inner.onDidChange((e) => {
      if (this.quiet.has(e.key)) return;
      listener.call(thisArgs, e);
    });
    const fromKeychain = this.emitter.event(listener, thisArgs);
    const d = vscode.Disposable.from(fromVsCode, fromKeychain);
    disposables?.push(d);
    return d;
  };

  private keyring(): NativeKeyring | null {
    if (this.native !== undefined) return this.native;
    try {
      const target = nativeTarget();
      if (!target) throw new Error(`no keychain build for ${process.platform}-${process.arch}`);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      this.native = require(path.join(__dirname, 'native', `keyring.${target}.node`)) as NativeKeyring;
    } catch (err) {
      this.log(`Shared keychain unavailable, provider keys stay in VS Code: ${err instanceof Error ? err.message : err}`);
      this.native = null;
    }
    return this.native;
  }

  /** The keychain entry for a provider-key secret, or undefined for any other
   *  secret (or when there is no keychain). */
  private entryFor(key: string): NativeEntry | undefined {
    let account: string | undefined;
    if (key === LOCAL_KEY_SECRET) account = 'local.apiKey';
    else {
      const m = PROVIDER_SECRET.exec(key);
      const field = m ? FIELD[m[1]] : undefined;
      if (field) account = `byok.${field}`;
    }
    return account ? this.entry(account) : undefined;
  }

  private entry(account: string): NativeEntry | undefined {
    const kr = this.keyring();
    if (!kr) return undefined;
    try {
      return new kr.Entry(SERVICE, account);
    } catch (err) {
      this.log(`Keychain entry ${account} failed: ${err}`);
      return undefined;
    }
  }

  // ── The vault, in pieces ────────────────────────────────────────────────
  // Same layout as the IDE's writeBlob/readBlob: pieces under a generation,
  // made current by `vault.head` only once every piece is written and read
  // back, so a failed save leaves the previous vault readable.

  private readHead(): { gen: number; count: number } | null {
    try {
      const raw = this.entry('vault.head')?.getPassword();
      const h = raw ? JSON.parse(raw) as { gen: number; count: number } : null;
      return h && Number.isInteger(h.gen) && Number.isInteger(h.count) ? h : null;
    } catch { return null; }
  }

  private readVault(): string | null {
    const head = this.readHead();
    if (!head) return null;
    let out = '';
    for (let i = 0; i < head.count; i++) {
      const piece = this.entry(`vault.${head.gen}.${i}`)?.getPassword();
      if (piece == null) return null;
      out += piece;
    }
    return out;
  }

  private writeVault(value: string | null): void {
    const old = this.readHead();
    const put = (account: string, v: string) => {
      const e = this.entry(account);
      if (!e) throw new Error('no keychain');
      e.setPassword(v);
      if (e.getPassword() !== v) throw new Error('the keychain did not keep the vault');
    };
    if (value !== null) {
      const gen = (old?.gen ?? 0) + 1;
      const pieces = value.match(/[\s\S]{1,1000}/g) ?? [];
      pieces.forEach((p, i) => put(`vault.${gen}.${i}`, p));
      put('vault.head', JSON.stringify({ gen, count: pieces.length }));
    } else {
      try { this.entry('vault.head')?.deletePassword(); } catch { /* gone */ }
    }
    if (old) for (let i = 0; i < old.count; i++) {
      try { this.entry(`vault.${old.gen}.${i}`)?.deletePassword(); } catch { /* gone */ }
    }
  }

  private async getVault(): Promise<string | undefined> {
    const local = await this.inner.get(VAULT_SECRET);
    let shared: string | null;
    try { shared = this.readVault(); } catch (err) {
      this.log(`Keychain vault read failed: ${err}`);
      return local;
    }
    if (!local) return shared ?? undefined;
    // An older version kept the vault in VS Code. Bring its entries in beside
    // anything the IDE already put in the shared vault, then drop the VS Code
    // copy once the keychain hands the merged vault back.
    try {
      const mine = JSON.parse(local) as { id: string }[];
      const theirs = shared ? JSON.parse(shared) as { id: string }[] : [];
      const ids = new Set(theirs.map((e) => e.id));
      const merged = JSON.stringify([...theirs, ...mine.filter((e) => !ids.has(e.id))]);
      this.writeVault(merged);
      if (this.readVault() === merged) {
        await this.dropVsCodeCopy(VAULT_SECRET);
        this.log('Moved the secret vault to the shared keychain');
      }
      return merged;
    } catch (err) {
      this.log(`Keychain vault move failed, kept in VS Code: ${err}`);
      return local;
    }
  }

  private async dropVsCodeCopy(key: string): Promise<void> {
    this.quiet.add(key);
    try { await this.inner.delete(key); } finally {
      // VS Code fires its change event after the delete resolves; give it a
      // turn to arrive before listening again.
      setTimeout(() => this.quiet.delete(key), 500);
    }
  }

  async get(key: string): Promise<string | undefined> {
    if (key === VAULT_SECRET && this.keyring()) return this.getVault();
    const e = this.entryFor(key);
    if (!e) return this.inner.get(key);
    let shared: string | null;
    try {
      shared = e.getPassword();
    } catch (err) {
      this.log(`Keychain read failed for ${key}: ${err}`);
      return this.inner.get(key);
    }
    if (shared) {
      this.snapshot.set(key, shared);
      return shared;
    }
    // Not in the keychain yet: a key saved by an older version lives in VS
    // Code. Move it — the VS Code copy is removed only once the keychain hands
    // back the same value, never on a write that merely did not throw.
    const local = await this.inner.get(key);
    if (!local) {
      this.snapshot.set(key, null);
      return undefined;
    }
    try {
      e.setPassword(local);
      if (e.getPassword() === local) {
        await this.dropVsCodeCopy(key);
        this.snapshot.set(key, local);
        this.log(`Moved ${key} to the shared keychain`);
      }
    } catch (err) {
      this.log(`Keychain move failed for ${key}, kept in VS Code: ${err}`);
    }
    return local;
  }

  async store(key: string, value: string): Promise<void> {
    if (key === VAULT_SECRET && this.keyring()) {
      try {
        this.writeVault(value);
        await this.dropVsCodeCopy(key);
        return;
      } catch (err) {
        this.log(`Keychain vault write failed, saving in VS Code instead: ${err}`);
      }
    }
    const e = this.entryFor(key);
    if (e) {
      try {
        e.setPassword(value);
        if (e.getPassword() !== value) throw new Error('the keychain did not keep the key');
        this.snapshot.set(key, value);
        await this.dropVsCodeCopy(key);
        this.emitter.fire({ key });
        return;
      } catch (err) {
        this.log(`Keychain write failed for ${key}, saving in VS Code instead: ${err}`);
      }
    }
    await this.inner.store(key, value);
  }

  async delete(key: string): Promise<void> {
    if (key === VAULT_SECRET && this.keyring()) {
      try { this.writeVault(null); } catch (err) { this.log(`Keychain vault delete failed: ${err}`); }
      await this.dropVsCodeCopy(key);
      return;
    }
    const e = this.entryFor(key);
    if (e) {
      try { e.deletePassword(); } catch (err) { this.log(`Keychain delete failed for ${key}: ${err}`); }
      this.snapshot.set(key, null);
      // Both copies go, or an old VS Code copy would be moved straight back.
      await this.dropVsCodeCopy(key);
      this.emitter.fire({ key });
      return;
    }
    await this.inner.delete(key);
  }

  async keys(): Promise<string[]> {
    const all = new Set(await this.inner.keys());
    for (const name of Object.keys(FIELD)) {
      const key = `ava-supernova.provider.${name}.apiKey`;
      if (await this.get(key)) all.add(key);
    }
    return [...all];
  }

  /**
   * Fire a change for every provider key the IDE added, changed or removed
   * since the last look. Called when the VS Code window regains focus — the
   * keychain sends no events of its own.
   */
  checkForOutsideChanges(): void {
    if (!this.keyring()) return;
    for (const name of Object.keys(FIELD)) {
      const key = `ava-supernova.provider.${name}.apiKey`;
      const e = this.entryFor(key);
      if (!e) continue;
      let now: string | null;
      try { now = e.getPassword(); } catch { continue; }
      const before = this.snapshot.get(key);
      this.snapshot.set(key, now);
      // First look at this key: record it, nothing to compare against.
      if (before === undefined) continue;
      if (before !== now) this.emitter.fire({ key });
    }
  }
}

/** `context` with its `secrets` swapped for the shared-keychain wrapper. */
export function withSharedProviderKeys(
  context: vscode.ExtensionContext,
  log: (msg: string) => void,
): { context: vscode.ExtensionContext; secrets: SharedSecretStorage } {
  const secrets = new SharedSecretStorage(context.secrets, log);
  // The proxy's target is a blank object, NOT the context: VS Code's context
  // makes `secrets` a read-only, non-configurable property, and a proxy may
  // not report a different value for one of those on its own target — so
  // proxying the context directly fails activation outright. Everything else
  // is read from the real context (methods bound to it).
  const wrapped = new Proxy({} as vscode.ExtensionContext, {
    get: (_blank, prop) => {
      if (prop === 'secrets') return secrets;
      const v = Reflect.get(context, prop, context);
      return typeof v === 'function' ? v.bind(context) : v;
    },
    has: (_blank, prop) => prop in context,
  });
  return { context: wrapped, secrets };
}
