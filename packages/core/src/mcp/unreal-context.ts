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
  const open = editors.some((e) => e.open);
  return `\n## Unreal Editor\n${lines.join('\n')}\n${open ? UNREAL_KNOWLEDGE : ''}`;
}

/**
 * How work in Unreal goes — knowledge, not rules (plan 2026-11-18-unreal,
 * Phase 3). Read from his live 5.9 editor on 19 Nov (114 toolsets, 1,919
 * tools): Unreal's own Python read_me, GetProjectContext, the Agent Skills it
 * ships, and the tools' own descriptions — so she leans on what THIS editor
 * says, not on memory of older engines. Names are `Toolset.Tool` as call_tool
 * takes them. Only sent while an editor is open.
 */
const UNREAL_KNOWLEDGE = `
### Working in Unreal
- **This editor tells you how it works.** AIAssistantEditor.AIAssistantToolset.GetProjectContext gives Unreal's conventions (100 units is 1 metre, folder paths end in /, screen coordinates run 0–1 from the top left); GetDockedContext shows what they have open. When a request is unclear, look at what they have selected (EditorToolset.EditorAppToolset.GetSelectedActors / GetSelectedAssets).
- **Epic ships Agent Skills** for this build — guides written for assistants: scene capture and diagnosing how things look, PCG, cloth, Dataflow, widgets and more. ToolsetRegistry.AgentSkillToolset.ListSkills, then GetSkills for the one that fits, before that kind of work. Creating or changing a skill is theirs to ask for.
- **Tool names and arguments change between preview builds.** Describe a toolset or tool (describe_toolsets / describe_tools) before calling one you haven't used in this chat, rather than writing a call from memory.
- **Python** (editor_toolset.toolsets.python_scripting.PythonScriptingTools): call read_me once per chat before execute_python. Look an API up with search_symbols / get_symbol before calling it — an API they don't find doesn't exist in this editor — and prefer a registered tool over Python. A script returns its last expression; print goes to the Output Log under LogPython (read it with ConsoleToolset.LogsToolset.GetLogEntries). Keep each script short. RunConsoleCommand refuses Python.
- **Bringing files in** (a model from Blender, a texture): there is no import tool — import with Python (AssetTools.import_asset_tasks with an AssetImportTask; Interchange reads .glb and .fbx), looking it up with get_symbol first. From the Design Studio's Blender room (~/.ava/creative/blender/<model>/): **props come in as the .glb** — on this editor it imports cleaner than the .fbx (packed metallic-roughness, its own Materials / Textures folders, no warnings); **rigged or animated models (characters) as the .fbx**, Unreal's long-standing route for skeletons and animation. An import saves the new assets; placing them in the level doesn't save the level.
- **C++**: you write it with your own file tools in the project's Source folder. Compile with LiveCodingToolset (IsLiveCodingReady, EnableLiveCoding if it's off, then CompileLiveCoding). Live Coding is for changing function bodies; new classes and new or changed reflected members (UPROPERTY, UFUNCTION, USTRUCT) need the editor closed and a full build — say so rather than forcing it.
- **See your work, don't assume it.** Make the change → compile if it was code → StartPIE (it times out after 30 seconds) → look → read the log for errors and warnings (GetLogEntries) → StopPIE → fix. Looking: SceneCaptureToolset.CaptureGameViewport shows play as the player sees it, game UI included; CaptureActiveEditorView renders the 3D scene from the editor camera, offscreen, without the editor's UI; EditorToolset.EditorAppToolset.CaptureEditorImage shows the whole editor window as they see it. You see the image; they don't. For lighting and material problems, the scene-capture skill explains the diagnostic modes.
- **Nothing is saved until it's saved.** A new level lives in /Temp until they save it; edits to an asset are unsaved until AssetToolset.SaveAsset. Say what's unsaved; every editor change is also in Undo history (Ctrl+Z).
- One Unreal call runs at a time, and compiling or starting play can take a while: tell them what you're waiting on.
`;
