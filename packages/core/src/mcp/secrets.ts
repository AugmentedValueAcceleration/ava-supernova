/**
 * MCP server keys (and, in Phase 3, sign-ins) — kept in the OS keychain the
 * extension and the IDE share, never in ~/.ava/mcp.json.
 *
 * Core can't reach the keychain itself: each app hands it one stored value,
 * `mcp.secrets`, kept in pieces like the secret vault (a Windows credential
 * holds only 1,280 characters). Inside is plain JSON:
 *
 *   { "v": 1, "secrets": { "github": "ghp_…" }, "auth": { "<server>": { … } } }
 *
 * Every change re-reads the stored value first, so a key added in the other app
 * a moment ago is kept.
 */

export interface McpKeychain {
  /** The stored value, or null when there is none. */
  read(): Promise<string | null>;
  /** Store it; null removes it. */
  write(value: string | null): Promise<void>;
}

export interface McpSecretsBlob {
  v: 1;
  secrets: Record<string, string>;
  auth: Record<string, unknown>;
}

let keychain: McpKeychain | null = null;

/** Each app calls this once at start. Without it, secrets can't be read or kept. */
export function setMcpKeychain(k: McpKeychain | null): void {
  keychain = k;
}

export const hasMcpKeychain = (): boolean => keychain !== null;

async function load(): Promise<McpSecretsBlob> {
  const empty: McpSecretsBlob = { v: 1, secrets: {}, auth: {} };
  if (!keychain) return empty;
  const raw = await keychain.read();
  if (!raw) return empty;
  try {
    const o = JSON.parse(raw) as Partial<McpSecretsBlob>;
    return { v: 1, secrets: { ...(o.secrets ?? {}) }, auth: { ...(o.auth ?? {}) } };
  } catch {
    return empty;
  }
}

async function save(change: (b: McpSecretsBlob) => void): Promise<void> {
  if (!keychain) throw new Error('The keychain isn\'t available, so the key wasn\'t kept.');
  const b = await load();
  change(b);
  const empty = !Object.keys(b.secrets).length && !Object.keys(b.auth).length;
  await keychain.write(empty ? null : JSON.stringify(b));
}

export async function getMcpSecret(name: string): Promise<string | undefined> {
  return (await load()).secrets[name];
}

/** Keep a key under a name; null forgets it. */
export async function setMcpSecret(name: string, value: string | null): Promise<void> {
  await save((b) => {
    if (value === null || value === '') delete b.secrets[name];
    else b.secrets[name] = value;
  });
}

/** The names of the keys kept (never the values). */
export async function mcpSecretNames(): Promise<string[]> {
  return Object.keys((await load()).secrets).sort();
}

/** A server's sign-in record (Phase 3). */
export async function getMcpAuth<T>(server: string): Promise<T | undefined> {
  return (await load()).auth[server] as T | undefined;
}

export async function setMcpAuth(server: string, value: unknown | null): Promise<void> {
  await save((b) => {
    if (value === null || value === undefined) delete b.auth[server];
    else b.auth[server] = value;
  });
}
