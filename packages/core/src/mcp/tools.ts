/**
 * A connected MCP server's tools, offered to Ava as her own tools.
 *
 *   - Named `<server id>_<tool>` so they can't collide with Ava's tools.
 *   - Through the normal approval: a tool the server marks read-only is safe;
 *     anything else asks first (with "always allow" available) — his call,
 *     16–17 Nov: safe by design, not heavy.
 *   - Their output is third-party content, so it is marked untrusted and the
 *     registry wraps it before it reaches the model.
 *   - Images come back the way Ava's own tools return them (base64_image), so
 *     she sees a viewport screenshot exactly as she sees a Blender preview.
 */

import type { Tool, ToolExecutionContext, ToolResult, ToolRiskLevel } from '../tools/types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { McpConnection, McpToolInfo } from './connection.js';

/** Tool names models accept: letters, digits, _ and -, up to 64. */
export function avaToolName(serverId: string, toolName: string): string {
  const clean = (s: string) => s.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return `${clean(serverId)}_${clean(toolName)}`.slice(0, 64);
}

export function riskFor(tool: McpToolInfo): ToolRiskLevel {
  if (tool.readOnly) return 'safe';
  if (tool.destructive) return 'dangerous';
  return 'write';
}

export interface McpToolOptions {
  /** Only these of the server's tools (by the server's own names). Default: all. */
  only?: string[];
  /** Override a tool's risk (e.g. a server that marks nothing read-only). */
  risk?: (tool: McpToolInfo) => ToolRiskLevel | undefined;
  /** Extra guidance appended to a tool's description for Ava. */
  describe?: (tool: McpToolInfo) => string | undefined;
  /** Runs before a call; return a message to refuse it (e.g. a script check). */
  check?: (tool: McpToolInfo, args: Record<string, unknown>) => string | undefined;
}

class McpTool implements Tool {
  readonly name: string;
  readonly description: string;
  readonly schema: FunctionSchema;
  readonly riskLevel: ToolRiskLevel;
  readonly requiresConfirmation: boolean;
  readonly outputTrust = 'untrusted' as const;

  constructor(private readonly conn: McpConnection, private readonly info: McpToolInfo, private readonly opts: McpToolOptions) {
    this.name = avaToolName(conn.config.id, info.name);
    const extra = opts.describe?.(info);
    this.description = `${info.description || info.name} (from ${conn.config.name})${extra ? ` ${extra}` : ''}`;
    this.riskLevel = opts.risk?.(info) ?? riskFor(info);
    this.requiresConfirmation = this.riskLevel !== 'safe';
    const s = info.inputSchema ?? { type: 'object' };
    this.schema = {
      name: this.name,
      description: this.description,
      parameters: { type: 'object', properties: (s.properties ?? {}) as Record<string, unknown>, ...(s.required?.length ? { required: s.required } : {}) },
    };
  }

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    if (!this.conn.isOpen) {
      return { success: false, output: `${this.conn.config.name} isn't connected any more. Tell them, and don't retry until it's back.` };
    }
    const refused = this.opts.check?.(this.info, args);
    if (refused) return { success: false, output: refused };
    try {
      const r = await this.conn.call(this.info.name, args, { signal: context.signal });
      const [first, ...rest] = r.images;
      return {
        success: !r.isError,
        output: r.text || (r.images.length ? `[${r.images.length} image${r.images.length === 1 ? '' : 's'}]` : '(no output)'),
        metadata: first
          ? {
              base64_image: first.data,
              mime_type: first.mimeType,
              ...(rest.length ? { more_images: rest.map((i) => i.data), more_mime_types: rest.map((i) => i.mimeType) } : {}),
            }
          : undefined,
      };
    } catch (err) {
      return { success: false, output: `${this.conn.config.name}: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}

/** The connected server's tools as Ava tools (read at connect time, never hard-coded). */
export function mcpToolsForAva(conn: McpConnection, opts: McpToolOptions = {}): Tool[] {
  const only = opts.only ? new Set(opts.only) : null;
  return conn.tools().filter((t) => !only || only.has(t.name)).map((t) => new McpTool(conn, t, opts));
}
