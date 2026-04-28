import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

/**
 * Self-inspect tool — Ava reads her own source code.
 *
 * Priority order:
 * 1. Platform API (synced file bases — always available, no rate limits)
 * 2. Local filesystem (dev environment only)
 * 3. GitHub API (fallback, rate-limited)
 *
 * The self-knowledge pack already gives Ava the project index.
 * This tool is only needed to read actual file contents.
 */

const PLATFORM_SOURCE_URL = 'https://ava-supernova.com/api/source';

const REPO_DESCRIPTIONS: Record<string, string> = {
  core: 'Main monorepo — packages/core (agent engine, providers, 54 tools, memory), packages/cli (REPL), packages/extension (VS Code)',
  extension: 'VS Code extension — host, webview UI, dashboard UI',
  ide: 'Desktop IDE (Tauri) + Node.js sidecar',
  mobile: 'Companion web app (Next.js) — mobile-first chat, tasks, memory, journal',
};

export class SelfInspectTool implements Tool {
  readonly name = 'self_inspect';
  readonly description = 'Read your own source code when you need to quote or examine the actual implementation. You already have a full project index in your self-knowledge pack — use that to know WHERE files are. Only call this when you need to READ the actual code content.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'self_inspect',
    description:
      'Read your own source code or your own deploy state. ' +
      'For source code: you already know the file structure from your self-knowledge pack — ' +
      'only call read_file/list_directory/search to read actual file contents you need to quote or examine. ' +
      'For deploy state: call deploy_state to answer questions about what versions are live, ' +
      'where commits sit, what migrations are applied, whether anything has drifted between local + published.\n\n' +
      'File bases: core (agent engine, CLI), extension (VS Code), ide (desktop), mobile (companion)',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['read_file', 'list_directory', 'search', 'overview', 'deploy_state'],
          description: 'read_file = read a specific file, list_directory = list contents of a path, search = search code, overview = list all file bases, deploy_state = read the operator hub\'s aggregated deploy state (versions live + drift + sync log)',
        },
        base: {
          type: 'string',
          enum: ['core', 'extension', 'ide', 'mobile'],
          description: 'Which file base. core = agent engine + CLI, extension = VS Code, ide = desktop IDE, mobile = companion app',
        },
        path: {
          type: 'string',
          description: 'File or directory path within the base (e.g. "agent/agent.ts", "src/components")',
        },
        query: {
          type: 'string',
          description: 'For search: text to find in source files',
        },
        surface: {
          type: 'string',
          enum: ['extension', 'ide', 'web', 'companion', 'core', 'all'],
          description: 'For deploy_state: which surface to report on. Defaults to all. Use a single surface when the question is targeted (e.g. "what version of yourself is on the marketplace?" → surface=extension).',
        },
      },
      required: ['action'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const action = args.action as string;
    const base = (args.base as string) || 'core';
    const path = (args.path as string) || '';
    const query = (args.query as string) || '';
    const surface = (args.surface as string) || 'all';

    // deploy_state is a separate read path — operator hub writes the JSON
    // to ~/.ava/deploy-state.json. Doesn't touch source code at all.
    if (action === 'deploy_state') {
      return this.readDeployState(surface);
    }

    if (!REPO_DESCRIPTIONS[base]) {
      return { success: false, output: `Unknown base: ${base}. Use: core, extension, ide, mobile` };
    }

    // Try platform API first (synced file bases — always available)
    const platformKey = (context.sharedState as Record<string, unknown> | undefined)?.platformKey as string | undefined;
    if (platformKey) {
      const result = await this.readFromPlatform(platformKey, action, base, path, query);
      if (result) return result;
    }

    // Fallback: local filesystem (dev environment)
    const monorepoRoot = this.findMonorepoRoot(context.cwd);
    if (monorepoRoot) {
      const localRoot = this.getLocalPath(monorepoRoot, base);
      if (localRoot) {
        return this.readLocal(action, base, localRoot, path, query);
      }
    }

    return { success: false, output: `Could not read ${base}/${path || ''}. Platform sync not available and local files not found. Ask the admin to sync the GitHub file bases in the company hub.` };
  }

  // ── Deploy state (operator hub aggregator output) ──────────────────────

  /** Read the operator hub's aggregated deploy state from
   *  `~/.ava/deploy-state.json`. The hub aggregator writes the file by
   *  pulling from GitHub / Marketplace / Vercel / Supabase migrations.
   *  Both the extension and IDE call this same code path; both share the
   *  same `~/.ava/` directory on the operator's machine.
   *
   *  When the file is missing (fresh install on a non-operator machine,
   *  hub never run, etc.) the answer is graceful — explains what the
   *  state would tell Ava if available, instead of erroring. */
  private async readDeployState(surface: string): Promise<ToolResult> {
    const path = join(homedir(), '.ava', 'deploy-state.json');
    if (!existsSync(path)) {
      return {
        success: true,
        output:
          'Deploy state is not available on this machine. The operator hub aggregates deploy state ' +
          '(GitHub commits, Marketplace versions, IDE releases, Vercel deploys, Supabase migrations) ' +
          'and writes it to `~/.ava/deploy-state.json`. If you are running on the operator\'s machine, ' +
          'the hub needs to run its Refresh once before this tool can answer.',
      };
    }

    try {
      const raw = await readFile(path, 'utf-8');
      const state = JSON.parse(raw) as {
        lastSync: string;
        surfaces: Record<string, {
          name: string;
          repo: string;
          branch: string;
          latestCommit: { sha: string; message: string; pushedAt: string } | null;
          published: { version?: string; url?: string; publishedAt?: string } | null;
          drift: 'synced' | 'local_ahead' | 'published_ahead' | null;
        }>;
        syncLog: Array<{ date: string; surface: string; event: string; detail: string; status: string }>;
      };

      const lines: string[] = [];
      lines.push(`# Deploy State (last refreshed ${state.lastSync.slice(0, 16).replace('T', ' ')} UTC)`);
      lines.push('');

      const ids = surface === 'all' ? Object.keys(state.surfaces) : [surface];
      for (const id of ids) {
        const s = state.surfaces[id];
        if (!s) continue;
        lines.push(`## ${s.name} (${s.repo} @ ${s.branch})`);
        if (s.latestCommit) {
          lines.push(`- Latest commit: \`${s.latestCommit.sha}\` — "${s.latestCommit.message}" (${s.latestCommit.pushedAt.slice(0, 10)})`);
        } else {
          lines.push('- Latest commit: unknown (GitHub fetch failed)');
        }
        if (s.published?.version) {
          const when = s.published.publishedAt ? ` (${s.published.publishedAt.slice(0, 10)})` : '';
          const where = s.published.url ? ` — ${s.published.url}` : '';
          lines.push(`- Published: ${s.published.version}${when}${where}`);
        } else {
          lines.push('- Published: nothing yet (or not applicable)');
        }
        const driftLabel = s.drift === 'synced' ? '✓ synced'
          : s.drift === 'local_ahead' ? '⚠ local ahead — commits not yet published'
          : s.drift === 'published_ahead' ? '⚠ published ahead of local — pull needed'
          : '— (no drift signal)';
        lines.push(`- Drift: ${driftLabel}`);
        lines.push('');
      }

      // Recent sync log — last 10 entries when reporting all surfaces, or
      // entries for the chosen surface when targeted.
      const filteredLog = surface === 'all'
        ? state.syncLog.slice(0, 10)
        : state.syncLog.filter((e) => e.surface === surface).slice(0, 10);
      if (filteredLog.length > 0) {
        lines.push('## Recent activity');
        for (const e of filteredLog) {
          lines.push(`- ${e.date} · ${e.surface} · ${e.event}${e.detail ? ` — ${e.detail}` : ''}`);
        }
      }

      return { success: true, output: lines.join('\n') };
    } catch (err) {
      return {
        success: false,
        output: `Failed to read deploy state: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // ── Platform API ────────────────────────────────────────────────────────

  private async readFromPlatform(platformKey: string, action: string, base: string, path: string, query: string): Promise<ToolResult | null> {
    try {
      const params = new URLSearchParams({ base, action });
      if (path) params.set('path', path);
      if (query) params.set('query', query);

      const res = await fetch(`${PLATFORM_SOURCE_URL}?${params}`, {
        headers: { 'Authorization': `Bearer ${platformKey}` },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        if (res.status === 404) return null; // Not synced — fall through to local
        return null;
      }

      const data = await res.json() as Record<string, unknown>;

      if (action === 'overview') {
        const bases = data.bases as Array<{ base_id: string; last_synced: string; file_count: number }>;
        if (!bases || bases.length === 0) return null; // Not synced yet

        const lines = Object.entries(REPO_DESCRIPTIONS).map(([key, desc]) => {
          const b = bases.find(x => x.base_id === key);
          const status = b?.last_synced ? `${b.file_count} files, synced ${new Date(b.last_synced).toLocaleDateString()}` : 'not synced';
          return `**${key}** — ${desc}\n  (${status})`;
        });
        return { success: true, output: `# Ava Source Code\n\n${lines.join('\n\n')}` };
      }

      if (action === 'list_directory') {
        const files = data.files as Array<{ path: string; type: string; size: number }>;
        if (!files || files.length === 0) return null;
        const items = files.map(f => `${f.type === 'dir' ? '📁' : '📄'} ${f.path.split('/').pop()}`).join('\n');
        return { success: true, output: `**${base}/${path || '/'}**\n\n${items}` };
      }

      if (action === 'read_file') {
        const content = data.content as string;
        if (!content) return null;
        const lines = content.split('\n').length;
        const MAX = 15000;
        if (content.length > MAX) {
          return { success: true, output: `**${base}/${path}** (${lines} lines, truncated)\n\n\`\`\`\n${content.slice(0, MAX)}\n\`\`\`\n\n*Truncated at ${MAX} chars*` };
        }
        return { success: true, output: `**${base}/${path}** (${lines} lines)\n\n\`\`\`\n${content}\n\`\`\`` };
      }

      if (action === 'search') {
        const matches = data.matches as string[];
        if (!matches || matches.length === 0) return { success: true, output: `No results for "${query}" in ${base}` };
        return { success: true, output: `**Search "${query}" in ${base}** (${matches.length} matches)\n\n${matches.map(m => `- **${m}**`).join('\n')}\n\nUse read_file to see the content.` };
      }

      return null;
    } catch {
      return null; // Platform unavailable — fall through
    }
  }

  // ── Local filesystem ────────────────────────────────────────────────────

  private async readLocal(action: string, base: string, localRoot: string, path: string, query: string): Promise<ToolResult> {
    switch (action) {
      case 'overview': {
        const lines = Object.entries(REPO_DESCRIPTIONS).map(([key, desc]) => `**${key}** — ${desc}`);
        let out = `# Ava Source Code (local)\n\n${lines.join('\n\n')}`;
        try {
          const entries = await readdir(localRoot);
          out += `\n\n## ${base} root:\n`;
          for (const name of entries.sort()) {
            if (name.startsWith('.') || name === 'node_modules' || name === 'dist') continue;
            const s = await stat(join(localRoot, name)).catch(() => null);
            out += `${s?.isDirectory() ? '📁' : '📄'} ${name}\n`;
          }
        } catch { /* ignore */ }
        return { success: true, output: out };
      }

      case 'read_file': {
        const cleanPath = path.replace(/^\//, '');
        if (!cleanPath) return { success: false, output: 'path is required' };
        try {
          const content = await readFile(join(localRoot, cleanPath), 'utf-8');
          const MAX = 15000;
          const lines = content.split('\n').length;
          if (content.length > MAX) {
            return { success: true, output: `**${base}/${cleanPath}** (${lines} lines, truncated)\n\n\`\`\`\n${content.slice(0, MAX)}\n\`\`\`\n\n*Truncated at ${MAX} chars*` };
          }
          return { success: true, output: `**${base}/${cleanPath}** (${lines} lines)\n\n\`\`\`\n${content}\n\`\`\`` };
        } catch {
          return { success: false, output: `Could not read ${base}/${cleanPath}` };
        }
      }

      case 'list_directory': {
        const cleanPath = path.replace(/^\//, '');
        const fullPath = cleanPath ? join(localRoot, cleanPath) : localRoot;
        try {
          const entries = await readdir(fullPath);
          const items: string[] = [];
          for (const name of entries.sort()) {
            if (name.startsWith('.') || name === 'node_modules' || name === 'dist') continue;
            const s = await stat(join(fullPath, name)).catch(() => null);
            items.push(`${s?.isDirectory() ? '📁' : '📄'} ${name}`);
          }
          return { success: true, output: `**${base}/${cleanPath || '/'}**\n\n${items.join('\n')}` };
        } catch {
          return { success: false, output: `Could not list ${base}/${cleanPath || '/'}` };
        }
      }

      case 'search': {
        if (!query) return { success: false, output: 'query is required' };
        const matches = await this.localSearch(localRoot, query, base);
        if (matches.length === 0) return { success: true, output: `No results for "${query}" in ${base}` };
        return { success: true, output: `**Search "${query}" in ${base}** (${matches.length} matches)\n\n${matches.join('\n')}\n\nUse read_file to see the content.` };
      }

      default:
        return { success: false, output: `Unknown action: ${action}` };
    }
  }

  private async localSearch(rootDir: string, query: string, base: string, maxResults = 15): Promise<string[]> {
    const matches: string[] = [];
    const skipDirs = new Set(['node_modules', 'dist', '.git', '.next', 'build', 'coverage']);
    const extensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.md', '.sql']);

    const walk = async (dir: string, relative: string) => {
      if (matches.length >= maxResults) return;
      let entries: string[];
      try { entries = await readdir(dir); } catch { return; }
      for (const name of entries) {
        if (matches.length >= maxResults) return;
        if (skipDirs.has(name) || name.startsWith('.')) continue;
        const fullPath = join(dir, name);
        const relPath = relative ? `${relative}/${name}` : name;
        let s;
        try { s = await stat(fullPath); } catch { continue; }
        if (s.isDirectory()) {
          await walk(fullPath, relPath);
        } else if (s.isFile() && extensions.has(extname(name))) {
          try {
            const content = await readFile(fullPath, 'utf-8');
            if (content.includes(query)) matches.push(`- **${base}/${relPath}**`);
          } catch { /* skip */ }
        }
      }
    };

    await walk(rootDir, '');
    return matches;
  }

  private findMonorepoRoot(startDir: string): string | null {
    let dir = resolve(startDir);
    for (let i = 0; i < 10; i++) {
      if (existsSync(join(dir, 'pnpm-workspace.yaml')) || existsSync(join(dir, 'packages', 'core'))) return dir;
      const parent = resolve(dir, '..');
      if (parent === dir) break;
      dir = parent;
    }
    return null;
  }

  private getLocalPath(monorepoRoot: string, base: string): string | null {
    const paths: Record<string, string> = {
      core: join(monorepoRoot, 'packages', 'core', 'src'),
      extension: join(monorepoRoot, 'packages', 'extension', 'src'),
      ide: join(monorepoRoot, 'packages', 'ide', 'src'),
      mobile: join(monorepoRoot, 'packages', 'mobile', 'src'),
    };
    const p = paths[base];
    return p && existsSync(p) ? p : null;
  }
}
