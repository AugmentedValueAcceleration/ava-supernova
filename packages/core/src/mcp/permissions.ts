/**
 * The rules for tools from servers the person added (named `mcp_<server>_<tool>`),
 * kept apart from the manager so the tool registry and the mode gate can ask
 * without pulling in the MCP client.
 *
 *  - Every one of these tools asks the first time, whatever the permission
 *    mode — a server's own "read-only" label isn't trusted (decision 2; the MCP
 *    spec: annotations are untrusted unless the server is) — until he says
 *    "always allow" for that tool, which is remembered in ~/.ava/mcp.json.
 *  - Modes: Code and Chat get them all; Plan and Code's Talk switch only the
 *    tools the server calls read-only (and they still ask); every room, none.
 *  - Unreal Engine's server is the one exception, by his decision (plan
 *    2026-11-18-unreal, 18 Nov): its tools all go through call_tool, so the
 *    check looks at the tool call_tool names and at Unreal's own label for it.
 *    READ runs without asking (and is what Plan may use); WRITE and EXECUTE
 *    ask, with "always allow" per Unreal tool. An unknown one asks.
 */

export const USER_MCP_PREFIX = 'mcp_';

export const isUserMcpTool = (name: string | undefined | null): boolean =>
  typeof name === 'string' && name.startsWith(USER_MCP_PREFIX);

/**
 * What the manager says about one call of one of these tools.
 *   ask      — the person must say yes first.
 *   planOk   — Plan mode may use it. Without arguments (offering the tool's
 *              schema): whether Plan may be offered it at all.
 */
export interface McpCallRule {
  ask: boolean;
  planOk: boolean;
}

type RuleCheck = (toolName: string, args?: Record<string, unknown>) => McpCallRule | undefined;

let ruleFor: RuleCheck = () => undefined;

/** Set by the manager: the rule for one call (undefined: a tool it doesn't know). */
export function setMcpRuleCheck(check: RuleCheck): void {
  ruleFor = check;
}

/** Must he say yes before this call runs? An unknown tool always asks. */
export function mcpToolNeedsAsking(toolName: string, args?: Record<string, unknown>): boolean {
  return ruleFor(toolName, args)?.ask ?? true;
}

/** Has he said "always allow" (so it no longer asks)? Kept for callers that only have a name. */
export const mcpToolAlwaysAllowed = (toolName: string, args?: Record<string, unknown>): boolean =>
  !mcpToolNeedsAsking(toolName, args);

/**
 * May a user server's tool be offered (no args) or run (with args) in this mode?
 */
export function mcpToolInMode(toolName: string, mode: string | null | undefined, args?: Record<string, unknown>): boolean {
  const [base, variant] = (mode ?? 'work').split(':');
  // Code with the Talk switch on (work:talking) is conversation only: like
  // Plan, the tools that only look and nothing that changes anything.
  if (base === 'work' && variant === 'talking') return ruleFor(toolName, args)?.planOk ?? false;
  if (base === 'work' || base === 'chat') return true;
  if (base === 'plan') return ruleFor(toolName, args)?.planOk ?? false;
  return false;
}
