/**
 * Unreal Engine's own MCP server (UE 5.8+) — what Ava needs to know about it
 * beyond plain MCP. Plan: Decisions/plans/2026-11-18-unreal.md (private), Phase 1.
 *
 * Unreal puts its tools behind meta-tools — in 5.9 four (list_toolsets,
 * describe_toolsets, describe_tools, call_tool; ~1,900 tools), in 5.8 three
 * (list_toolsets, describe_toolset — one at a time — and call_tool; 830 tools
 * in 52 toolsets, read from his 5.8 editor 20 Nov). So "which tool is this?" is
 * never the MCP tool's name — it is call_tool's `toolset_name` + `tool_name`.
 * Every inner tool carries Unreal's own label, `annotations.accessMode`:
 * read / write / execute (read live from his editor, 18 Nov 2026: 802 / 1,042 /
 * 75, every tool labelled). 5.8 labels none of them, so there every inner tool
 * asks until "always" — the labels are what the decision below trusts.
 *
 * His decision (18 Nov, "i agree"): Unreal's READ tools run without asking;
 * WRITE and EXECUTE ask, with "always allow" per tool. That trusts this one
 * server's labels — Epic's, local, and the reason the decision was asked — and
 * no other server's (plan 2026-11-17-mcp-servers, decision 2, still holds).
 *
 * Known by the name it reports ("unreal-mcp"), not by its address: the port
 * and path can be changed in the editor. 5.8 reports a BLANK name and version,
 * so there it is known by its meta-tools instead (isUnrealServer).
 */

import type { McpConnection } from './connection.js';

export type UnrealAccess = 'read' | 'write' | 'execute';

/** The name Unreal's server reports in its serverInfo. */
export const UNREAL_SERVER_NAME = 'unreal-mcp';

/** Its default address (5.9: Editor Preferences > Agentic Workflows > Model Context Protocol;
 *  5.8: Editor Preferences > General > Model Context Protocol, where Auto Start Server is OFF by default). */
export const UNREAL_DEFAULT_URL = 'http://127.0.0.1:8000/mcp';

/** Unreal runs tools one at a time on the editor's game thread; a compile can take minutes. */
export const UNREAL_CALL_TIMEOUT_MS = 600_000;

/** The meta-tool that runs every inner tool. */
export const UNREAL_CALL_TOOL = 'call_tool';

/**
 * Unreal's picture-taking tools (CaptureViewport, CaptureEditorImage,
 * CaptureAssetImage, SceneCaptureToolset.* …): anything whose toolset or name
 * says "capture". In the VS Code extension each one asks EVERY time, whatever
 * Unreal labels it and with no "always" (his call, 20 Nov 2026) — the
 * Marketplace stance on screen capture: no picture the person didn't approve.
 */
export function isUnrealCaptureTool(inner: string | undefined | null): boolean {
  return !!inner && /capture/i.test(inner);
}

/** Unreal's discovery meta-tools, 5.8's and 5.9's: they only look. */
export const UNREAL_DISCOVERY_TOOLS: readonly string[] = ['list_toolsets', 'describe_toolsets', 'describe_tools', 'describe_toolset'];

/** "Always allow" for one inner tool is kept in the server's allow list as `call_tool:<Toolset.Tool>`. */
export const unrealAllowKey = (inner: string) => `${UNREAL_CALL_TOOL}:${inner}`;

/** Toolsets whose absence means the project's toolset plugins are off (Epic issue UE-412135).
 *  5.9's names, then 5.8's (it names the same toolsets differently). */
const CORE_TOOLSETS = [
  'EditorToolset.ActorToolset', 'EditorToolset.LevelToolset', 'EditorToolset.AssetToolset',
  'editor_toolset.toolsets.actor.ActorTools', 'editor_toolset.toolsets.scene.SceneTools', 'editor_toolset.toolsets.asset.AssetTools',
];

/**
 * Is this Unreal's server? 5.9 says so by name. 5.8 reports a blank name (read
 * from his editor, 20 Nov), so a server with no name that offers Unreal's own
 * meta-tools — list_toolsets, call_tool and a describe — is Unreal too.
 */
export function isUnrealServer(info: { name?: string } | undefined | null, toolNames?: readonly string[]): boolean {
  if (info?.name === UNREAL_SERVER_NAME) return true;
  if (info?.name?.trim()) return false;
  const t = new Set(toolNames ?? []);
  return t.has('list_toolsets') && t.has(UNREAL_CALL_TOOL) && (t.has('describe_toolset') || t.has('describe_toolsets'));
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

/** The oldest Unreal Ava works with. Was 5.9 (his call, 18 Nov); opened to 5.8
 *  on 20 Nov for him to test on a 5.8 project — Epic's MCP plugin first shipped,
 *  Experimental, in 5.8 (June 2026). 5.9-only features (Kimodo's AnimGenOffline)
 *  are gated on the project, not the version, so a 5.8 project never gets them. */
export const UNREAL_MIN_VERSION = [5, 8] as const;

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
  // She sometimes passes the tool's FULL name as well as its toolset: joining
  // them doubled the name ("LevelToolset.EditorToolset.LevelToolset.GetCurrentLevel",
  // seen in his allow list 19 Nov), so it matched nothing and a look-only tool
  // asked. A name that already has dots is the tool's own full name.
  if (!set || tool.includes('.')) return tool;
  return `${set}.${tool}`;
}

/** A doubled name written before that fix ("A.B.A.B.Tool" → "A.B.Tool"). */
export function undoubleUnrealName(name: string): string {
  const m = /^(.+?)\.\1\.(.+)$/.exec(name);
  return m ? `${m[1]}.${m[2]}` : name;
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
    /** 5.8's shape: describe_toolset, one toolset at a time, and no read / write / execute labels. */
    readonly oneAtATime = false,
    /** Every inner tool's full name, labelled or not (5.8 labels none: its count was 0 on the page, 20 Nov). */
    private readonly names: ReadonlySet<string> = new Set(access.keys()),
  ) {}

  /** Does Unreal label its tools here (5.9)? 5.8 doesn't, so every inner tool asks until "always". */
  get labelled(): boolean {
    return this.access.size > 0;
  }

  /** An empty catalog: every inner tool unknown, so every call asks. */
  static empty(): UnrealCatalog {
    return new UnrealCatalog(new Map(), new Set());
  }

  /**
   * Read every toolset's tools and their labels (two calls; under a second on
   * his editor for 1,919 tools). 5.8 has no describe_toolsets: there each
   * toolset is described on its own (`oneAtATime`, 52 calls). Never throws: a
   * catalog it couldn't read is empty, and an empty catalog only means Ava
   * asks more.
   */
  static async load(conn: Pick<McpConnection, 'call'>, oneAtATime = false): Promise<UnrealCatalog> {
    try {
      const listed = await conn.call('list_toolsets', {});
      const names = parseToolsetNames(listed.text);
      if (!names.length) return UnrealCatalog.empty();
      if (oneAtATime) {
        const access = new Map<string, UnrealAccess>();
        const toolsets = new Set<string>();
        const all = new Set<string>();
        for (const n of names) {
          const one = await conn.call('describe_toolset', { toolset_name: n }).catch(() => undefined);
          if (!one) continue;
          let s: { name?: string; tools?: Array<{ name?: string; annotations?: { accessMode?: string } }> } | undefined;
          try { s = JSON.parse(one.text); } catch { continue; }
          toolsets.add(s?.name ?? n);
          for (const t of s?.tools ?? []) {
            if (t.name) all.add(t.name);
            const mode = t.annotations?.accessMode;
            if (t.name && (mode === 'read' || mode === 'write' || mode === 'execute')) access.set(t.name, mode);
          }
        }
        return new UnrealCatalog(access, toolsets, true, all);
      }
      const described = await conn.call('describe_toolsets', { toolset_names: names });
      const parsed = JSON.parse(described.text) as {
        toolsets?: Record<string, { tools?: Array<{ name?: string; annotations?: { accessMode?: string } }> }>;
      };
      const access = new Map<string, UnrealAccess>();
      const toolsets = new Set<string>();
      const all = new Set<string>();
      for (const [setName, s] of Object.entries(parsed.toolsets ?? {})) {
        toolsets.add(setName);
        for (const t of s.tools ?? []) {
          if (t.name) all.add(t.name);
          const mode = t.annotations?.accessMode;
          if (t.name && (mode === 'read' || mode === 'write' || mode === 'execute')) access.set(t.name, mode);
        }
      }
      return new UnrealCatalog(access, toolsets, false, all);
    } catch {
      return UnrealCatalog.empty();
    }
  }

  /** How many tools the editor has (labelled or not). */
  get size(): number {
    return this.names.size;
  }

  /** Unreal's label for an inner tool, or undefined when it isn't known (then it asks). */
  accessOf(inner: string | undefined): UnrealAccess | undefined {
    if (!inner) return undefined;
    // Unreal's own discovery tools, reached through call_tool, only look.
    if (UNREAL_DISCOVERY_TOOLS.includes(inner)) return 'read';
    return this.access.get(this.canonical(inner) ?? inner);
  }

  /**
   * Unreal's one full name for a tool however it was written: a doubled name
   * undoubled, and a bare name ("DescribeMode") resolved when exactly one
   * tool has it. So "always allow", the asking rule and the Connections list
   * agree on one name. Unknown names come back as given.
   */
  canonical(inner: string | undefined): string | undefined {
    if (!inner) return inner;
    const name = undoubleUnrealName(inner);
    if (this.names.has(name) || name.includes('.')) return name;
    const hits = [...this.names].filter((k) => k.endsWith(`.${name}`));
    return hits.length === 1 ? hits[0] : name;
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
