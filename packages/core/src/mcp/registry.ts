/**
 * The official MCP Registry (registry.modelcontextprotocol.io) — one signal in
 * Ava's research before she gives her view of a server (plan
 * 2026-11-17-mcp-servers, Phase 4; his call 17 Nov: "how can she give her
 * opinion without it").
 *
 * What it proves: a server's name starts with its publisher's namespace, and
 * the registry checked that namespace when it was published — `io.github.<who>/`
 * by signing in to that GitHub account, `com.example/` by the domain's DNS or
 * a file on its website. So `io.github.github/github-mcp-server` really is
 * GitHub's. What it doesn't prove: that the code is safe, or that a server not
 * listed is bad.
 *
 * The registry asks apps not to query it on every request: Ava only looks
 * when he asks her to set something up, and answers are kept for 15 minutes.
 */

const BASE = 'https://registry.modelcontextprotocol.io/v0.1/servers';
const KEEP_MS = 15 * 60_000;
const cache = new Map<string, { at: number; value: McpRegistryServer[] }>();

export interface McpRegistryEnvVar {
  name: string;
  description?: string;
  required: boolean;
  secret: boolean;
}

export interface McpRegistryPackage {
  /** npm, pypi, oci (a container), nuget, mcpb… */
  registryType: string;
  identifier: string;
  version?: string;
  transport: string;
  env: McpRegistryEnvVar[];
  /** The command that runs it, pinned to this version, when Ava knows how (npm, pypi, oci). */
  command?: string[];
}

export interface McpRegistryRemote {
  type: string;
  url: string;
  headers: Array<{ name: string; description?: string; required: boolean; secret: boolean }>;
}

export interface McpRegistryServer {
  /** e.g. io.github.github/github-mcp-server */
  name: string;
  /** The verified part: io.github.github → "the GitHub account github". */
  publisher: string;
  verifiedBy: 'github-account' | 'domain';
  description: string;
  version: string;
  repository?: string;
  status: string;
  packages: McpRegistryPackage[];
  remotes: McpRegistryRemote[];
}

function publisherOf(name: string): { publisher: string; verifiedBy: McpRegistryServer['verifiedBy'] } {
  const ns = name.split('/')[0] ?? name;
  const gh = /^io\.github\.(.+)$/i.exec(ns);
  if (gh) return { publisher: `the GitHub account "${gh[1]}"`, verifiedBy: 'github-account' };
  // Reverse DNS: com.example → example.com
  return { publisher: `the domain ${ns.split('.').reverse().join('.')}`, verifiedBy: 'domain' };
}

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const arr = (v: unknown): Raw[] => (Array.isArray(v) ? v.filter((x): x is Raw => !!x && typeof x === 'object') : []);

/** The command that runs a package, pinned to its version. */
function commandFor(p: Raw): string[] | undefined {
  const id = str(p.identifier);
  if (!id) return undefined;
  const v = str(p.version);
  const extra = arr(p.packageArguments).map((a) => str(a.value) ?? (str(a.name) ?? '')).filter(Boolean);
  switch (str(p.registryType)) {
    case 'npm': return ['npx', '-y', v ? `${id}@${v}` : id, ...extra];
    case 'pypi': return ['uvx', v ? `${id}==${v}` : id, ...extra];
    case 'oci': {
      const env = arr(p.environmentVariables).flatMap((e) => (str(e.name) ? ['-e', str(e.name)!] : []));
      const image = v && !id.includes(':') ? `${id}:${v}` : id;
      return ['docker', 'run', '-i', '--rm', ...env, image, ...extra];
    }
    default: return undefined;
  }
}

function shape(raw: Raw): McpRegistryServer | null {
  const s = (raw.server ?? raw) as Raw;
  const name = str(s.name);
  if (!name) return null;
  const meta = ((raw._meta as Raw | undefined)?.['io.modelcontextprotocol.registry/official'] ?? {}) as Raw;
  const repo = s.repository as Raw | undefined;
  return {
    name,
    ...publisherOf(name),
    description: str(s.description) ?? '',
    version: str(s.version) ?? '',
    repository: str(repo?.url),
    status: str(meta.status) ?? 'unknown',
    packages: arr(s.packages).map((p) => ({
      registryType: str(p.registryType) ?? '?',
      identifier: str(p.identifier) ?? '?',
      version: str(p.version),
      transport: str((p.transport as Raw | undefined)?.type) ?? 'stdio',
      env: arr(p.environmentVariables).map((e) => ({
        name: str(e.name) ?? '?', description: str(e.description), required: e.isRequired === true, secret: e.isSecret === true,
      })),
      command: commandFor(p),
    })),
    remotes: arr(s.remotes).map((r) => ({
      type: str(r.type) ?? '?',
      url: str(r.url) ?? '',
      headers: arr(r.headers).map((h) => ({
        name: str(h.name) ?? '?', description: str(h.description), required: h.isRequired === true, secret: h.isSecret === true,
      })),
    })),
  };
}

/**
 * Servers whose registry name contains `query` (the registry matches names,
 * not descriptions: "github", "notion", "io.github.github/"). Latest versions only.
 */
export async function searchMcpRegistry(query: string, limit = 8, fetchFn: typeof fetch = fetch): Promise<McpRegistryServer[]> {
  const q = query.trim();
  if (!q) return [];
  const k = `${q.toLowerCase()}\n${limit}`;
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < KEEP_MS) return hit.value;
  const url = `${BASE}?search=${encodeURIComponent(q)}&version=latest&limit=${Math.min(Math.max(limit, 1), 30)}`;
  const res = await fetchFn(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`The MCP Registry answered ${res.status}.`);
  const body = await res.json() as { servers?: unknown[] };
  const value = (body.servers ?? []).map((r) => shape(r as Raw)).filter((x): x is McpRegistryServer => !!x);
  cache.set(k, { at: Date.now(), value });
  return value;
}

/** Tests: forget what was kept. */
export function clearMcpRegistryCache(): void {
  cache.clear();
}
