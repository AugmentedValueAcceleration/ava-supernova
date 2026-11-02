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
    const m = PROVIDER_SECRET.exec(key);
    const field = m ? FIELD[m[1]] : undefined;
    if (!field) return undefined;
    const kr = this.keyring();
    if (!kr) return undefined;
    try {
      return new kr.Entry(SERVICE, `byok.${field}`);
    } catch (err) {
      this.log(`Keychain entry for ${field} failed: ${err}`);
      return undefined;
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
  const wrapped = new Proxy(context, {
    get: (target, prop) => (prop === 'secrets' ? secrets : Reflect.get(target, prop, target)),
  });
  return { context: wrapped, secrets };
}
