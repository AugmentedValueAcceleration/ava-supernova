/**
 * Ava in Unreal Editor's Assistant panel (plan 2026-11-18-unreal, Phase 2):
 * the parts of the panel program (packages/cli/src/acp) that belong in core —
 * making sure Unreal is in his Connections, and telling Ava where she is.
 *
 * What the panel is, from Phase 0 (his editor, 18 Nov): Unreal starts the
 * program, speaks ACP to it, and hands it the editor's own MCP server in
 * session/new. It shows Markdown and tool calls, and a permission prompt with
 * only Deny / Allow Once. It does NOT show plans, images or any card.
 */

import { McpServers, type McpServerStatus } from './manager.js';
import { readMcpFile } from './servers-config.js';
import { addMcpServers, settleMcpServers } from './setup.js';
import { ALL_MCP_SUGGESTIONS } from './suggested.js';

const sameUrl = (a: string | undefined, b: string) =>
  !!a && a.trim().replace(/\/+$/, '').toLowerCase() === b.trim().replace(/\/+$/, '').toLowerCase();

export interface UnrealServerInPanel {
  /** His server's id in ~/.ava/mcp.json. */
  id: string;
  /** Ava added it just now (it wasn't in his Connections). */
  added: boolean;
  /** He has it switched off in Connections. */
  off: boolean;
}

/**
 * Unreal's server, as Unreal handed it over, in his Connections.
 *
 * His decision 4 (18 Nov, "agreed with you"): when it isn't there, Ava adds
 * it — the same entry as Suggested → Add — because the panel's prompt has no
 * "always" button, so "always allow" lives on the Connections page, and the
 * IDE and VS Code reach the editor too. One he has switched off stays off.
 */
export async function ensureUnrealServer(url: string): Promise<UnrealServerInPanel> {
  const { file } = await readMcpFile();
  for (const [id, e] of Object.entries(file.mcpServers)) {
    if (sameUrl(e.url, url)) return { id, added: false, off: e.enabled === false };
  }
  let id = 'unreal';
  for (let n = 2; file.mcpServers[id]; n++) id = `unreal-${n}`;
  const view = ALL_MCP_SUGGESTIONS.find((s) => s.id === 'unreal')?.view;
  await addMcpServers([{ id, entry: { type: 'http', url, ...(view ? { ava: { view, at: new Date().toISOString() } } : {}) } }]);
  return { id, added: true, off: false };
}

/** Wait for his Unreal server to finish connecting, and say where it got to. */
export async function settleUnrealServer(id: string, ms = 30_000): Promise<McpServerStatus | undefined> {
  return (await settleMcpServers([id], ms))[0] ?? McpServers.current().status().find((s) => s.scope === 'user' && s.id === id);
}

/**
 * The part of her system prompt that says she is in Unreal's panel. `fromUnreal`
 * is the text Unreal adds to a chat's first message (how to link assets, to
 * use its tools, to switch on All Toolsets) — kept for the whole chat, as
 * later messages don't repeat it.
 */
export function unrealPanelPrompt(fromUnreal?: string): string {
  const notes = fromUnreal?.trim();
  return `
## Where you are: inside Unreal Editor
You are in Unreal Editor's Assistant panel, beside their project — the same Ava, with the same memory, as in VS Code and the Ava IDE.
- The panel shows text: Markdown and your tool calls. It shows no cards, no pictures and no plan view. Write a plan as a short numbered list. Screenshots you take you can see, but they can't: link the saved file instead.
- There are no question cards here. When you need their answer, ask it in your reply and stop.
- Before a change in the editor, the panel asks them: Allow once, Allow for this session (that tool — for Unreal, that one Unreal tool — stops asking until this chat ends), or Deny. It has no "always" button. A picture from Unreal (a capture of the level or the editor) asks every time: only Allow once or Deny. Each Unreal tool they allow is listed under "Asked recently in Unreal" on the Unreal card in Connections (VS Code or the Ava IDE), where "Always allow" stops it asking. Never tell them you can grant that yourself.
- Their mode menu here has Code, Code · Talk and Plan. "The Build switch" means choosing Code in that menu.
- The Brainstorm, Learning, Health and Creative Studio rooms and the dashboard are in VS Code and the Ava IDE, not here: say so if they ask for one.
${notes ? `\n### Unreal's own notes for assistants in this panel\n${notes}\n` : ''}`;
}
