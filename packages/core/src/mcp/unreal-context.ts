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

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
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
  const open = editors.filter((e) => e.open);
  const kimodo = open.some((e) => !!e.projectDir && projectUsesKimodo(e.projectDir));
  return `\n## Unreal Editor\n${lines.join('\n')}\n${open.length ? UNREAL_KNOWLEDGE : ''}${kimodo ? KIMODO_KNOWLEDGE : ''}`;
}

const kimodoSeen = new Map<string, { mtime: number; on: boolean }>();

/**
 * Has the open project switched the Kimodo plugin on (its .uproject's
 * Plugins)? The Kimodo guide is ~300 words, so it goes only to projects that
 * use it. Cached by the .uproject's modified time, so it's read fresh each
 * turn, cheaply. Unreadable → no.
 */
export function projectUsesKimodo(projectDir: string): boolean {
  try {
    const file = readdirSync(projectDir).find((f) => f.toLowerCase().endsWith('.uproject'));
    if (!file) return false;
    const path = join(projectDir, file);
    const mtime = statSync(path).mtimeMs;
    const seen = kimodoSeen.get(path);
    if (seen && seen.mtime === mtime) return seen.on;
    const plugins = (JSON.parse(readFileSync(path, 'utf8')) as { Plugins?: Array<{ Name?: string; Enabled?: boolean }> }).Plugins ?? [];
    const on = plugins.some((p) => p.Name === 'Kimodo' && p.Enabled !== false);
    kimodoSeen.set(path, { mtime, on });
    return on;
  } catch {
    return false;
  }
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
- **Python** (editor_toolset.toolsets.python_scripting.PythonScriptingTools): call read_me once per chat before execute_python. Look an API up with search_symbols / get_symbol before calling it — an API they don't find doesn't exist in this editor — and prefer a registered tool over Python. A script returns its last expression; print goes to the Output Log under LogPython (read it with ConsoleToolset.LogsToolset.GetLogEntries). Keep each script short. RunConsoleCommand refuses Python. A class Python doesn't list (some plugins' classes) can still be read and changed through EditorToolset.ObjectToolset — ListProperties, GetProperties, SetProperties work on any object by its path — so "not in the Python API" doesn't mean out of reach.
- **Bringing files in** (a model from Blender, a texture): there is no import tool — import with Python (AssetTools.import_asset_tasks with an AssetImportTask; Interchange reads .glb and .fbx), looking it up with get_symbol first. From the Design Studio's Blender room (~/.ava/creative/blender/<model>/): **props come in as the .glb** — on this editor it imports cleaner than the .fbx (packed metallic-roughness, its own Materials / Textures folders, no warnings); **rigged or animated models (characters) as the .fbx**, Unreal's long-standing route for skeletons and animation. An import saves the new assets; placing them in the level doesn't save the level.
- **C++**: you write it with your own file tools in the project's Source folder. Compile with LiveCodingToolset (IsLiveCodingReady, EnableLiveCoding if it's off, then CompileLiveCoding). Live Coding is for changing function bodies; new classes and new or changed reflected members (UPROPERTY, UFUNCTION, USTRUCT) need the editor closed and a full build — say so rather than forcing it.
- **See your work, don't assume it.** Make the change → compile if it was code → StartPIE (it times out after 30 seconds) → look → read the log for errors and warnings (GetLogEntries) → StopPIE → fix. Looking: SceneCaptureToolset.CaptureGameViewport shows play as the player sees it, game UI included; CaptureActiveEditorView renders the 3D scene from the editor camera, offscreen, without the editor's UI; EditorToolset.EditorAppToolset.CaptureEditorImage shows the whole editor window as they see it. You see the image; they don't. For lighting and material problems, the scene-capture skill explains the diagnostic modes.
- **Nothing is saved until it's saved.** A new level lives in /Temp until they save it; edits to an asset are unsaved until AssetToolset.SaveAsset. Say what's unsaved; every editor change is also in Undo history (Ctrl+Z).
- One Unreal call runs at a time, and compiling or starting play can take a while: tell them what you're waiting on.
- **When a plugin gives the editor a button, menu or dialog for a job, that is the way it's meant to be done** — tell them which to press rather than rebuilding the job by hand from lower-level tools.
- **Stop and report rather than hunting.** When two different approaches to the same step have failed, stop: tell them what you tried, what you found, and what you'd suggest — then wait. Long hunts through tools and engine source drift, and they are worse than a clear "here's where I'm stuck".
`;

/**
 * Kimodo — Epic's text-to-animation plugin (with AnimGenOffline) in 5.9.
 * REWRITTEN 19 Nov from Epic's own sources, replacing a version I had patched
 * together guess by guess (his words: "papering over cracks"): the setup from
 * KimodoSettings.h / kimodo_generate.py; the way to MAKE animations from
 * Epic's Add Character flow and its automated tests (KimodoAddCharacterTest,
 * KimodoRetargetPoseTest, the AnimGenOffline toolbar menu). What it replaced:
 * Ava building characters by hand (bare mesh + section, no spline/rig),
 * "the shoulders aren't retargeted" (Epic tests SOMA→Manny shoulders to within
 * 2°), retargeter-building advice, and a debug view that can't show text-only
 * generations. His call (16 Nov): Ava GUIDES setup, he does each step; the
 * token never goes through chat. Sent only when the project has Kimodo on.
 */
const KIMODO_KNOWLEDGE = `
### Animation with Kimodo (this project has it on)
Kimodo turns a description into character animation, on their own computer, through Epic's AnimGenOffline plugin.

**Setting it up (once — theirs to do; guide a step at a time, let them say when each is done)**
1. A Hugging Face account (huggingface.co).
2. Llama 3 access FIRST — signed in, request it at huggingface.co/meta-llama/Meta-Llama-3-8B-Instruct. Meta approves it by hand, which can take a while. There is no separate "Llama key": it's a permission on their account.
3. A read token: huggingface.co/settings/tokens → a token of type Read.
4. In Unreal: Edit → Editor Preferences, type "Hugging Face" in the search box (searching "Kimodo" hides the field) → Plugins → Kimodo → Authentication → Hugging Face Token. It saves on its own. The token goes there and nowhere else — never into this chat; if one is pasted here, say it has been sent to their AI provider and they should delete it on Hugging Face and make a new one.
- An empty field can still work (Kimodo also reads HF_TOKEN or a token saved by "hf auth login"): if generating works, nothing needs adding.
- Performance (same page; explain, change only when asked): Model Placement GPU (CUDA), CPU fallback takes minutes; Text Encoder Precision 4 bit (~6 GB, default) or Full (~16 GB); Text Encoder Placement CPU by default; Unload Model When Idle after 15 minutes. The first Generate downloads the models, once.
- "No Hugging Face token is configured" (-100) → steps 3–4. "Your Hugging Face token does not have access to the gated text encoder repo" (-101) → wrong or expired token, or that account's Llama 3 request isn't approved yet.
- The worker failing to import numpy or torch means Kimodo's Python packages never installed (the editor installs them at startup into the project's Intermediate/PipInstall, hash-checked; in this preview an unpinned colorama made pip refuse the whole set — the log says "In --require-hashes mode…"). Explain; ask before installing anything (several GB).

**Making animations — Epic's way; don't improvise around it**
Everything lives in Sequencer's toolbar: the **AnimGenOffline** dropdown (Add Character, Generate Anims, Export Anims, Batch Import, Create Level Sequence, Delete Selected) and a **Generate** button. These are editor buttons, not tools you can call: tell them which to press, then do what you can around it.
- **A character comes from AnimGenOffline → Add Character**, with a Level Sequence open (Create Level Sequence in the same menu makes one). The dialog chooses the pose generator (Kimodo), the character from its grid — plugin defaults (Kimodo's SOMA, and the mannequins AnimGenOffline ships under /AnimGenOffline/Characters: UE5 Manny and Quinn, UEFN, UE4 Mannequin) and their saved favourites — and Features (Spline, Transform Track, Control Rig). Retargeting Setup left empty is "Generated automatically" — leave it so. Never assemble a character by hand (placing a mesh and adding a section misses the spline, transform track and rig the dialog sets up). Epic tests Kimodo's retargeting onto its shipped mannequins, so use those.
- **Describing the movement** on the section Add Character made — this part you can do:
  - Keyed: SequencerScripting.MovieSceneSectionExtensions.AddStringKey on the section's "AnimDescriptionChannel" at a frame; keys at different frames change the movement over time.
  - Or one description for the whole section: EditorToolset.ObjectToolset.SetProperties on the section's PoseGenerator (GetProperties on the section gives its path), AnimDescriptionOverride. With both empty Kimodo makes "Neutral Locomotion".
  - The same PoseGenerator holds NumVariations (1–8), RandomSeed (same seed and settings repeat a result), QualityLevel, and MovementSource: "Sequencer" (the default) follows the character's own movement — the spline Add Character made; "GeneratedAnimation" lets Kimodo move the character itself. Python's API list doesn't include Kimodo's class; ObjectToolset reaches it.
- **Generating**: they press Generate (toolbar) or AnimGenOffline → Generate Anims. It also runs when the sequence evaluates after a change; the log shows "[Kimodo] Sampling … frames".
- **Keeping it**: AnimGenOffline → Export Anims.
- **If a result looks wrong** (posture, feet, drifting): capture it, say plainly what you see, and check what you set (description, MovementSource, the character chosen). Don't build retargeters, rigs or work-arounds to compensate unless they ask — the setup Epic built and tests is the baseline, and a fault that remains with it is a preview issue worth reporting to Epic. Say which it looks like and let them decide.
`;
