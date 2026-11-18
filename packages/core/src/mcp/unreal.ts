/**
 * Unreal Engine's own MCP server (UE 5.9+) — what Ava needs to know about it
 * beyond plain MCP. Plan: Decisions/plans/2026-11-18-unreal.md (private), Phase 1.
 *
 * Unreal puts its ~1,900 tools behind four meta-tools: list_toolsets,
 * describe_toolsets, describe_tools and call_tool. So "which tool is this?" is
 * never the MCP tool's name — it is call_tool's `toolset_name` + `tool_name`.
 * Every inner tool carries Unreal's own label, `annotations.accessMode`:
 * read / write / execute (read live from his editor, 18 Nov 2026: 802 / 1,042 /
 * 75, every tool labelled).
 *
 * His decision (18 Nov, "i agree"): Unreal's READ tools run without asking;
 * WRITE and EXECUTE ask, with "always allow" per tool. That trusts this one
 * server's labels — Epic's, local, and the reason the decision was asked — and
 * no other server's (plan 2026-11-17-mcp-servers, decision 2, still holds).
 *
 * Known by the name it reports ("unreal-mcp"), not by its address: the port
 * and path can be changed in the editor.
 */

import type { McpConnection } from './connection.js';

export type UnrealAccess = 'read' | 'write' | 'execute';

/** The name Unreal's server reports in its serverInfo. */
export const UNREAL_SERVER_NAME = 'unreal-mcp';

/** Its default address (Editor Preferences > Agentic Workflows > Model Context Protocol). */
export const UNREAL_DEFAULT_URL = 'http://127.0.0.1:8000/mcp';

/** Unreal runs tools one at a time on the editor's game thread; a compile can take minutes. */
export const UNREAL_CALL_TIMEOUT_MS = 600_000;

/** The meta-tool that runs every inner tool. */
export const UNREAL_CALL_TOOL = 'call_tool';

/** "Always allow" for one inner tool is kept in the server's allow list as `call_tool:<Toolset.Tool>`. */
export const unrealAllowKey = (inner: string) => `${UNREAL_CALL_TOOL}:${inner}`;

/** Toolsets whose absence means the project's toolset plugins are off (Epic issue UE-412135). */
const CORE_TOOLSETS = ['EditorToolset.ActorToolset', 'EditorToolset.LevelToolset', 'EditorToolset.AssetToolset'];

export function isUnrealServer(info: { name?: string } | undefined | null): boolean {
  return info?.name === UNREAL_SERVER_NAME;
}

/**
 * What the editor says about itself when Ava connects: Unreal puts the open
 * project in the initialize answer's _meta (read live 18 Nov:
 * "com.epicgames.unrealengine/instance" with projectName, projectDirectory,
 * engineVersion). Lets Ava say WHICH project she's working in, and notice when
 * it isn't the folder open in her app.
 */
export interface UnrealEditorInfo {
  project?: string;
  projectDir?: string;
  engineVersion?: string;
}

export function unrealEditorInfo(initResult: unknown): UnrealEditorInfo | undefined {
  const meta = (initResult as { _meta?: Record<string, unknown> } | undefined)?._meta;
  const inst = meta?.['com.epicgames.unrealengine/instance'] as Record<string, unknown> | undefined;
  if (!inst) return undefined;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  return { project: str(inst.projectName), projectDir: str(inst.projectDirectory), engineVersion: str(inst.engineVersion) };
}

/** The oldest Unreal Ava works with (his call, 18 Nov: "5.9 and onwards… that's a must"). */
export const UNREAL_MIN_VERSION = [5, 9] as const;

/**
 * Is this Unreal new enough? Its server reports e.g. "5.9.0-60351404". 5.9 and
 * later (5.10, 6.x) pass; anything older doesn't. A version it can't read
 * passes: the name already says it's Unreal's server, and a future format
 * shouldn't lock out a newer editor.
 */
export function unrealVersionOk(version: string | undefined | null): boolean {
  const m = /^(\d+)\.(\d+)/.exec(String(version ?? '').trim());
  if (!m) return true;
  const [major, minor] = [Number(m[1]), Number(m[2])];
  return major > UNREAL_MIN_VERSION[0] || (major === UNREAL_MIN_VERSION[0] && minor >= UNREAL_MIN_VERSION[1]);
}

/**
 * The inner tool a call_tool call names, as Unreal writes it: `Toolset.Tool`
 * for a toolset tool, the bare name for a top-level one. Undefined when the
 * arguments don't name one.
 */
export function unrealInnerTool(args: Record<string, unknown> | undefined | null): string | undefined {
  if (!args) return undefined;
  const tool = typeof args.tool_name === 'string' ? args.tool_name.trim() : '';
  if (!tool) return undefined;
  const set = typeof args.toolset_name === 'string' ? args.toolset_name.trim() : '';
  return set ? `${set}.${tool}` : tool;
}

/** Toolset names from list_toolsets' text ("- Name: description", descriptions may run over several lines). */
export function parseToolsetNames(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/^- ([A-Za-z_][\w]*(?:\.[\w]+)+):/gm)) out.add(m[1]);
  return [...out];
}

export class UnrealCatalog {
  private constructor(
    private readonly access: Map<string, UnrealAccess>,
    readonly toolsets: ReadonlySet<string>,
  ) {}

  /** An empty catalog: every inner tool unknown, so every call asks. */
  static empty(): UnrealCatalog {
    return new UnrealCatalog(new Map(), new Set());
  }

  /**
   * Read every toolset's tools and their labels (two calls; under a second on
   * his editor for 1,919 tools). Never throws: a catalog it couldn't read is
   * empty, and an empty catalog only means Ava asks more.
   */
  static async load(conn: Pick<McpConnection, 'call'>): Promise<UnrealCatalog> {
    try {
      const listed = await conn.call('list_toolsets', {});
      const names = parseToolsetNames(listed.text);
      if (!names.length) return UnrealCatalog.empty();
      const described = await conn.call('describe_toolsets', { toolset_names: names });
      const parsed = JSON.parse(described.text) as {
        toolsets?: Record<string, { tools?: Array<{ name?: string; annotations?: { accessMode?: string } }> }>;
      };
      const access = new Map<string, UnrealAccess>();
      const toolsets = new Set<string>();
      for (const [setName, s] of Object.entries(parsed.toolsets ?? {})) {
        toolsets.add(setName);
        for (const t of s.tools ?? []) {
          const mode = t.annotations?.accessMode;
          if (t.name && (mode === 'read' || mode === 'write' || mode === 'execute')) access.set(t.name, mode);
        }
      }
      return new UnrealCatalog(access, toolsets);
    } catch {
      return UnrealCatalog.empty();
    }
  }

  get size(): number {
    return this.access.size;
  }

  /** Unreal's label for an inner tool, or undefined when it isn't known (then it asks). */
  accessOf(inner: string | undefined): UnrealAccess | undefined {
    if (!inner) return undefined;
    // Unreal's own discovery tools, reached through call_tool, only look.
    if (inner === 'list_toolsets' || inner === 'describe_toolsets' || inner === 'describe_tools') return 'read';
    return this.access.get(inner);
  }

  /** The project's toolset plugins are off: none of actors, levels or assets is there. */
  get toolsetsOff(): boolean {
    return this.toolsets.size > 0 ? !CORE_TOOLSETS.some((n) => this.toolsets.has(n)) : false;
  }
}

/** Ava's guidance for Unreal's tools, added to their descriptions. */
export function unrealToolGuidance(toolName: string, catalog: UnrealCatalog): string | undefined {
  const off = catalog.toolsetsOff
    ? ' Most of Unreal\'s tools are switched off in this project (no actor, level or asset toolsets): tell them to enable All Toolsets under Edit > Plugins in Unreal and restart the editor, instead of working around it.'
    : '';
  if (toolName === 'list_toolsets') return `Unreal Engine's tools are grouped in toolsets: list them, describe the ones you need, then call a tool through call_tool.${off}`;
  if (toolName === UNREAL_CALL_TOOL) {
    return 'Unreal runs one call at a time, so call its tools one after another, never several at once. Tools that only look run straight away; anything that changes the project or runs something asks them first.' + off;
  }
  return undefined;
}
