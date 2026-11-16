/**
 * The rules for tools from servers the person added (named `mcp_<server>_<tool>`),
 * kept apart from the manager so the tool registry and the mode gate can ask
 * without pulling in the MCP client.
 *
 *  - Every one of these tools asks the first time, whatever the permission
 *    mode — a server's own "read-only" label isn't trusted (decision 2; the MCP
 *    spec: annotations are untrusted unless the server is) — until he says
 *    "always allow" for that tool, which is remembered in ~/.ava/mcp.json.
 *  - Modes: Code and Chat get them all; Plan only the tools the server calls
 *    read-only (and they still ask); every room, none.
 */

export const USER_MCP_PREFIX = 'mcp_';

export const isUserMcpTool = (name: string | undefined | null): boolean =>
  typeof name === 'string' && name.startsWith(USER_MCP_PREFIX);

let alwaysAllowed: (toolName: string) => boolean = () => false;
let readOnly: (toolName: string) => boolean = () => false;

/** Set by the manager: has he said "always allow" for this tool? */
export function setMcpAllowCheck(check: (toolName: string) => boolean): void {
  alwaysAllowed = check;
}

/** Set by the manager: does the server call this tool read-only? */
export function setMcpReadOnlyCheck(check: (toolName: string) => boolean): void {
  readOnly = check;
}

export const mcpToolAlwaysAllowed = (toolName: string): boolean => alwaysAllowed(toolName);

/** May a user server's tool be offered in this mode? */
export function mcpToolInMode(toolName: string, mode: string | null | undefined): boolean {
  const base = (mode ?? 'work').split(':')[0];
  if (base === 'work' || base === 'chat') return true;
  if (base === 'plan') return readOnly(toolName);
  return false;
}
