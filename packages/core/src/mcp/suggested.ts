/**
 * Suggested servers — a short, free, checked list on the Connections page and
 * known to Ava (plan 2026-11-17-mcp-servers; his call 17 Nov: "a selection of
 * free helpful mcp's along with the ability for the user to add their own").
 *
 * Suggested, never installed: each one goes through the same card (exact
 * address, warnings, his yes) as anything else. All are ONLINE servers from the
 * company itself, so nothing is downloaded or run on his computer. Only gaps:
 * Ava already reads files, runs git, fetches pages and browses, so servers that
 * repeat those aren't here.
 *
 * Checked 17 Nov 2026, each against its live address (open / wants a sign-in /
 * lets an app register itself) and the official MCP Registry, plus its own
 * docs for "free". RE-CHECK EVERY RELEASE: run the probe in the plan, and
 * drop anything that stops being free or official.
 *
 * Words for him (what it does, Ava's view) live in the locale files under
 * mcp.suggest.<id>.*, so the page says them in his language.
 */

export type McpSuggestionKind =
  | 'open'     // free, no account
  | 'signin'   // free account, he signs in (Ava's sign-in works: the server lets apps register)
  | 'key';     // free account, he pastes a key on the page

export interface McpSuggestion {
  id: string;
  /** What to call it on the page. */
  name: string;
  /** Who runs it. */
  publisher: string;
  /** Its name in the official MCP Registry (publisher verified there), if listed. */
  registry?: string;
  kind: McpSuggestionKind;
  url: string;
  /** Its own page about the server (checked 17 Nov: each answers and is about this server). */
  docs: string;
  /** 'key' servers: the header his key goes in (value set on the page). */
  keyHeader?: string;
  /** Sign-in permissions to ask for, when the server offers far more than its tools need. */
  scopes?: string[];
  /** In English, for Ava (the page uses mcp.suggest.<id>.what). */
  what: string;
  /** Ava's view, in English (the page uses mcp.suggest.<id>.view). */
  view: string;
}

export const MCP_SUGGESTIONS: McpSuggestion[] = [
  {
    id: 'context7', name: 'Context7', publisher: 'Upstash', registry: 'io.github.upstash/context7', kind: 'open',
    url: 'https://mcp.context7.com/mcp', docs: 'https://github.com/upstash/context7',
    what: 'Up-to-date documentation for code libraries and frameworks.',
    view: "Run by Upstash and verified in the MCP Registry. It helps me write code for the library version you actually use instead of an old one. It's free without an account at a lower hourly limit; a free Context7 key raises it. It only reads public docs.",
  },
  {
    id: 'deepwiki', name: 'DeepWiki', publisher: 'Cognition', kind: 'open',
    url: 'https://mcp.deepwiki.com/mcp', docs: 'https://docs.devin.ai/work-with-devin/deepwiki-mcp',
    what: 'Explanations of, and answers about, any public GitHub repository.',
    view: "Run by Cognition (the makers of Devin), free with no account. It isn't listed in the MCP Registry, so I've gone on Cognition's own announcement. It only sees public repositories, and the questions I ask it are sent to Cognition.",
  },
  {
    id: 'microsoft-learn', name: 'Microsoft Learn', publisher: 'Microsoft', registry: 'com.microsoft/microsoft-learn-mcp', kind: 'open',
    url: 'https://learn.microsoft.com/api/mcp', docs: 'https://learn.microsoft.com/training/support/mcp',
    what: "Microsoft's official documentation: Windows, .NET, Azure, PowerShell and more.",
    view: "Microsoft's own server, verified in the MCP Registry. Free, no account, and read-only: it searches and reads Microsoft's public docs. Useful whenever you work with Windows, .NET or Azure.",
  },
  {
    id: 'cloudflare-docs', name: 'Cloudflare Docs', publisher: 'Cloudflare', registry: 'com.cloudflare.mcp/mcp', kind: 'open',
    url: 'https://docs.mcp.cloudflare.com/mcp', docs: 'https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/',
    what: "Cloudflare's official documentation.",
    view: "Cloudflare's own server, verified in the MCP Registry. Free, no account, read-only: it searches Cloudflare's public docs. Only worth adding if you use Cloudflare.",
  },
  {
    id: 'huggingface', name: 'Hugging Face', publisher: 'Hugging Face', registry: 'co.huggingface/hf-mcp-server', kind: 'open',
    url: 'https://huggingface.co/mcp', docs: 'https://huggingface.co/docs/hub/en/hf-mcp-server',
    what: 'Search AI models, datasets, papers and Spaces on Hugging Face.',
    view: "Hugging Face's own server, verified in the MCP Registry. Free with no account for its basic search tools; a free Hugging Face account unlocks more. It reads public information only.",
  },
  {
    id: 'notion', name: 'Notion', publisher: 'Notion', registry: 'com.notion/mcp', kind: 'signin',
    url: 'https://mcp.notion.com/mcp', docs: 'https://developers.notion.com/docs/mcp',
    what: 'Your Notion pages and databases: search, read, create and update.',
    view: "Notion's own server, verified in the MCP Registry. It works on Notion's free plan (a few tools need a paid one). You sign in with Notion and choose which pages I can reach; it can change pages, so each of its tools asks you first.",
  },
  {
    id: 'linear', name: 'Linear', publisher: 'Linear', registry: 'app.linear/linear', kind: 'signin',
    url: 'https://mcp.linear.app/mcp', docs: 'https://linear.app/docs/mcp',
    what: 'Your Linear issues, projects and comments.',
    view: "Linear's own server, verified in the MCP Registry, and included on Linear's free plan. You sign in with Linear. It can create and change issues, so each of its tools asks you first.",
  },
  {
    id: 'atlassian', name: 'Atlassian (Jira & Confluence)', publisher: 'Atlassian', registry: 'com.atlassian/atlassian-mcp-server', kind: 'signin',
    url: 'https://mcp.atlassian.com/v2/mcp', docs: 'https://www.atlassian.com/platform/remote-mcp-server',
    scopes: [
      'read:me', 'read:account', 'offline_access',
      'read:jira:agent-interface', 'write:jira:agent-interface', 'search:jira:agent-interface',
      'read:confluence:agent-interface', 'write:confluence:agent-interface', 'search:confluence:agent-interface',
    ],
    what: 'Your Jira issues and Confluence pages.',
    view: "Atlassian's own server, verified in the MCP Registry, free on Atlassian's free plan (500 calls an hour). It offers about 40 permissions, including deleting; I ask only for reading, searching and writing Jira and Confluence, so it can't delete anything.",
  },
  {
    id: 'github', name: 'GitHub', publisher: 'GitHub', registry: 'io.github.github/github-mcp-server', kind: 'key',
    url: 'https://api.githubcopilot.com/mcp/', docs: 'https://github.com/github/github-mcp-server', keyHeader: 'Authorization',
    what: 'Your repositories, issues and pull requests.',
    view: "GitHub's own server, verified in the MCP Registry. GitHub's sign-in doesn't let apps register themselves, so it takes a personal access token: make a fine-grained one at github.com/settings/personal-access-tokens with only the repositories and rights you want me to have. GitHub lists Copilot access as a requirement; Copilot's free plan counts.",
  },
];

/** A suggested server, matched by its address. */
export function suggestionFor(url: string | undefined): McpSuggestion | undefined {
  return url ? MCP_SUGGESTIONS.find((s) => s.url === url) : undefined;
}

/** The permissions a suggested server should ask for, matched by address. */
export function suggestedScopes(url: string | undefined): string[] | undefined {
  if (!url) return undefined;
  return MCP_SUGGESTIONS.find((s) => s.url === url)?.scopes;
}
