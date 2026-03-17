import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

/**
 * Self-inspect tool — Ava can read her own source code from GitHub.
 *
 * This makes Ava the only AI that can explain its own implementation.
 * Open source means full transparency — she can show users exactly
 * how she works, point contributors to the right files, and reference
 * her own architecture when planning.
 */

const GITHUB_ORG = 'AugmentedValueAcceleration';
const GITHUB_BRANCH = 'development';

const REPOS: Record<string, string> = {
  core: 'ava-supernova',
  platform: 'ava-supernova-platform',
  companion: 'ava-supernova-companion',
  ide: 'ava-supernova-ide',
};

const REPO_DESCRIPTIONS: Record<string, string> = {
  core: 'Main monorepo — packages/core (agent engine, providers, 52 tools, memory), packages/cli (REPL), packages/extension (VS Code), packages/plugins',
  platform: 'Web platform (Next.js) — admin panel, workspace, public site, dashboard, API routes, Supabase migrations',
  companion: 'Companion web app (Next.js) — mobile-first chat, tasks, memory, journal, learning, BYOK support',
  ide: 'Standalone desktop IDE (Electron/Theia) — deferred until revenue',
};

async function githubFetch(path: string): Promise<{ ok: boolean; data: unknown }> {
  try {
    const res = await fetch(`https://api.github.com${path}`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'ava-self-inspect',
      },
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: 'Request failed or timed out' };
  }
}

export class SelfInspectTool implements Tool {
  readonly name = 'self_inspect';
  readonly description = 'Read your own source code from GitHub — explain how you work, help contributors, reference your own architecture';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'self_inspect',
    description:
      'Read your own source code from the Ava | Supernova GitHub repositories. Use this when:\n' +
      '- A user asks how you work ("how does your memory work?", "what tools do you have?")\n' +
      '- A contributor wants to understand the codebase ("where do I add a new tool?")\n' +
      '- You need to reference your own architecture during planning\n' +
      '- You want to explain a feature with actual code, not just descriptions\n\n' +
      'Repos: core (monorepo — agent, tools, CLI, extension), platform (web + admin), companion (mobile app), ide (desktop)',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['read_file', 'list_directory', 'search', 'overview'],
          description: 'read_file = read a specific file, list_directory = list contents of a path, search = search code across repos, overview = get high-level project structure',
        },
        repo: {
          type: 'string',
          enum: ['core', 'platform', 'companion', 'ide'],
          description: 'Which repository. core = main monorepo (most things live here), platform = web/admin, companion = mobile app, ide = desktop IDE',
        },
        path: {
          type: 'string',
          description: 'For read_file/list_directory: file or directory path (e.g. "packages/core/src/tools" or "packages/core/src/memory/memory-manager.ts")',
        },
        query: {
          type: 'string',
          description: 'For search: code search query (e.g. "registerBuiltins", "class MemoryManager", "export function build")',
        },
      },
      required: ['action'],
    },
  };

  async execute(args: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> {
    const action = args.action as string;
    const repoKey = (args.repo as string) || 'core';
    const repoName = REPOS[repoKey];
    if (!repoName) {
      return { success: false, output: `Unknown repo: ${repoKey}. Use: core, platform, companion, ide` };
    }

    switch (action) {
      case 'overview': {
        const lines = Object.entries(REPO_DESCRIPTIONS).map(
          ([key, desc]) => `**${key}** (${REPOS[key]})\n  ${desc}`
        );
        let out = `# Ava | Supernova — Project Overview\n\n${lines.join('\n\n')}`;

        // Get root listing of requested repo
        const { ok, data } = await githubFetch(`/repos/${GITHUB_ORG}/${repoName}/contents?ref=${GITHUB_BRANCH}`);
        if (ok && Array.isArray(data)) {
          out += `\n\n## ${repoKey} repo root:\n`;
          out += (data as Array<{ name: string; type: string }>)
            .map(f => `${f.type === 'dir' ? '📁' : '📄'} ${f.name}`)
            .join('\n');
        }

        return { success: true, output: out };
      }

      case 'read_file': {
        const filePath = ((args.path as string) || '').replace(/^\//, '');
        if (!filePath) return { success: false, output: 'path is required for read_file' };

        const { ok, data } = await githubFetch(
          `/repos/${GITHUB_ORG}/${repoName}/contents/${filePath}?ref=${GITHUB_BRANCH}`
        );
        if (!ok) return { success: false, output: `Could not read ${repoKey}/${filePath}` };

        const file = data as { content?: string; type?: string; size?: number };
        if (file.type !== 'file') return { success: false, output: `${filePath} is a ${file.type}, not a file. Use list_directory.` };
        if (!file.content) return { success: false, output: 'File has no content (may be too large)' };

        const content = Buffer.from(file.content, 'base64').toString('utf-8');
        const MAX = 15000;
        if (content.length > MAX) {
          return {
            success: true,
            output: `**${repoKey}/${filePath}** (${content.split('\n').length} lines, truncated)\n\n\`\`\`\n${content.slice(0, MAX)}\n\`\`\`\n\n*Truncated at ${MAX} chars (${content.length} total)*`,
          };
        }

        return {
          success: true,
          output: `**${repoKey}/${filePath}** (${content.split('\n').length} lines)\n\n\`\`\`\n${content}\n\`\`\``,
        };
      }

      case 'list_directory': {
        const dirPath = ((args.path as string) || '').replace(/^\//, '');
        const apiPath = dirPath
          ? `/repos/${GITHUB_ORG}/${repoName}/contents/${dirPath}?ref=${GITHUB_BRANCH}`
          : `/repos/${GITHUB_ORG}/${repoName}/contents?ref=${GITHUB_BRANCH}`;

        const { ok, data } = await githubFetch(apiPath);
        if (!ok) return { success: false, output: `Could not list ${repoKey}/${dirPath || '/'}` };

        const items = (data as Array<{ name: string; type: string; size: number }>)
          .map(f => `${f.type === 'dir' ? '📁' : '📄'} ${f.name}${f.type !== 'dir' ? ` (${f.size}B)` : ''}`)
          .join('\n');

        return {
          success: true,
          output: `**${repoKey}/${dirPath || '/'}**\n\n${items}`,
        };
      }

      case 'search': {
        const query = args.query as string;
        if (!query) return { success: false, output: 'query is required for search' };

        const scope = `repo:${GITHUB_ORG}/${repoName}`;
        const { ok, data } = await githubFetch(
          `/search/code?q=${encodeURIComponent(`${query} ${scope}`)}&per_page=15`
        );
        if (!ok) return { success: false, output: 'Code search failed' };

        const results = data as { total_count: number; items: Array<{ path: string; name: string; repository: { name: string } }> };
        if (results.total_count === 0) {
          return { success: true, output: `No results for "${query}" in ${repoKey}` };
        }

        const matches = results.items
          .map(item => `- **${item.path}**`)
          .join('\n');

        return {
          success: true,
          output: `**Search "${query}" in ${repoKey}** (${results.total_count} matches)\n\n${matches}\n\nUse read_file to see the full content of any match.`,
        };
      }

      default:
        return { success: false, output: `Unknown action: ${action}. Use: read_file, list_directory, search, overview` };
    }
  }
}
