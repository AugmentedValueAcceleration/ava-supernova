/**
 * Telling Ava that Unreal Editor is connected — the part of Code, Talk and Plan
 * mode's prompt that names it (plan 2026-11-18-unreal, Phase 1).
 *
 * Why it exists: 18 Nov, his first live test. Unreal was connected, he asked
 * "what level is open in Unreal?" with the Talk switch on, and Ava answered by
 * searching the files of a DIFFERENT project (Dawn Sets, the folder open in
 * VS Code), landing on a saved map. The editor had his test project open, on
 * an untitled level that had never been saved — something no file can show.
 * The tools were there; nothing told her they were the live editor, or that
 * the editor's project wasn't the folder she could read.
 *
 * Read fresh each turn: the editor opening, closing or switching project shows
 * up on the next message.
 */

import { McpServers } from './manager.js';

const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

/**
 * The open editors' tools, for the mode's own list of what she can use (",
 * mcp_unreal_list_toolsets, …"), or '' when no editor is open.
 *
 * Why: 18 Nov, the second live test. The Unreal tools were offered and the
 * section below was in the prompt, but it came AFTER Talk's closed list of
 * "What you can do" — and DeepSeek Flash followed the list, read the
 * .uproject from disk and said the editor's tools "aren't wired into my tool
 * set". A tool missing from the list a mode opens with reads as not there.
 */
export function unrealToolNames(): string {
  let editors: ReturnType<McpServers['unrealEditors']>;
  try {
    editors = McpServers.current().unrealEditors();
  } catch {
    return '';
  }
  const names = editors.filter((e) => e.open).flatMap((e) =>
    ['list_toolsets', 'describe_toolsets', 'describe_tools', 'call_tool'].map((t) => `${e.toolPrefix}${t}`));
  return names.length ? `, ${names.join(', ')}` : '';
}

/** The section for one mode, or '' when no Unreal server is set up. */
export function unrealPromptSection(mode: 'build' | 'talk' | 'plan'): string {
  let editors: ReturnType<McpServers['unrealEditors']>;
  try {
    editors = McpServers.current().unrealEditors();
  } catch {
    return '';
  }
  if (!editors.length) return '';
  const root = McpServers.current().projectFolder;
  const lines: string[] = [];
  for (const e of editors) {
    if (!e.open) {
      lines.push(`- Unreal Engine is set up in Connections ("${e.id}"), but the editor isn't open. If they ask about their Unreal project in the editor, say so: open the project in Unreal, then press Restart on Unreal's card in Connections. Don't answer from files as if it were the editor.`);
      continue;
    }
    const p = e.toolPrefix;
    lines.push(`- **Unreal Engine ${e.engineVersion ?? ''} is open on this computer**${e.project ? `, with the project "${e.project}"` : ''}${e.projectDir ? ` (${e.projectDir})` : ''}. Its tools reach the LIVE editor: ${p}list_toolsets, ${p}describe_toolsets, ${p}describe_tools and ${p}call_tool.`);
    lines.push(`- For anything about Unreal or what is in the editor — the open project and level, its actors, assets, how it looks, the log, what just happened — ask the editor FIRST: ${p}list_toolsets to see what it offers, then ${p}call_tool. Files come second. Never work it out from files: a level that was never saved, and every change since the last save, exist only in the editor.`);
    if (e.projectDir && root && norm(e.projectDir) !== norm(root)) {
      lines.push(`- The folder open here (${root}) is a different project from the one in the editor. Files you read are that folder's, not the editor's: say which project you mean, and ask if it's unclear which they do.`);
    }
    if (e.toolsetsOff) {
      lines.push(`- Most of Unreal's tools are switched off in this project: tell them to turn on All Toolsets (Edit → Plugins in Unreal) and restart the editor.`);
    }
    lines.push(mode === 'build'
      ? `- Tools that only look run straight away; anything that changes the project or runs something asks them first, so say what you're about to do.`
      : `- Here you may use its tools that only look. Anything that changes the project or runs something waits for ${mode === 'talk' ? 'the Build switch' : 'Code mode'}: describe it instead.`);
  }
  return `\n## Unreal Editor\n${lines.join('\n')}\n`;
}
