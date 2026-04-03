/**
 * Computer Use Knowledge Packs — Preloaded context for desktop automation.
 *
 * Feeds into both:
 * - Qwen 3.6 Plus (conductor) for step planning
 * - Holo3 system prompt for visual navigation
 *
 * Extensible: users can add app-specific packs (Blender, Unreal, Photoshop, etc.)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KnowledgePack {
  id: string;
  name: string;
  /** When this pack applies — 'always' or app name */
  scope: 'always' | string;
  /** Feeds into the conductor's planning prompt */
  planningContext: string;
  /** Feeds into Holo3's system prompt */
  visionContext: string;
  /** Common shortcuts for this context */
  shortcuts: Record<string, string>;
}

// ─── Windows 11 Core Pack (Always Active) ─────────────────────────────────────

export const WINDOWS_11_PACK: KnowledgePack = {
  id: 'windows-11',
  name: 'Windows 11',
  scope: 'always',
  planningContext: `
# Windows 11 Desktop Automation Knowledge

## Opening Apps (fastest methods)
- Win+R → type app name → Enter (Run dialog — fastest, works for all apps)
- Win key → type app name → Enter (Start search — works if app isn't in PATH)
- Click taskbar icon (if pinned)
- NEVER navigate Start menu visually — always search by typing

## Taskbar & System
- Taskbar is at the bottom of the screen
- Start button is at the centre (default) or left side
- System tray is bottom-right (clock, wifi, battery, notifications)
- Win+D = show desktop / minimise all
- Alt+Tab = switch between open windows
- Win+Tab = task view (all desktops)
- Alt+F4 = close current app
- Win+L = lock screen

## Window Management
- Win+Left/Right = snap window to half screen
- Win+Up = maximise
- Win+Down = minimise / restore
- Drag title bar to move window
- Double-click title bar = maximise/restore toggle

## File Operations
- Win+E = open File Explorer
- Ctrl+C / Ctrl+V / Ctrl+X = copy / paste / cut
- Ctrl+Z = undo, Ctrl+Y = redo
- Ctrl+A = select all
- Delete = delete selected, Shift+Delete = permanent delete
- F2 = rename selected file

## Common Dialogs
- Save As dialog: type full path in filename field, press Enter
- Open dialog: same — type path or filename, press Enter
- File dialogs have an address bar at the top — click it and type a path
- UAC prompt: click "Yes" to approve

## Text Editing (universal)
- Ctrl+A = select all text
- Ctrl+C = copy, Ctrl+V = paste, Ctrl+X = cut
- Ctrl+Z = undo, Ctrl+Y / Ctrl+Shift+Z = redo
- Home = start of line, End = end of line
- Ctrl+Home = start of document, Ctrl+End = end of document
- Ctrl+Backspace = delete word left, Ctrl+Delete = delete word right

## Timing
- Apps take 1-3 seconds to open after pressing Enter
- Dialogs appear within 0.5 seconds
- ALWAYS wait for the app/dialog to appear before taking the next action
- If the screen hasn't changed, the app is still loading — do NOT repeat the action
`.trim(),

  visionContext: `
Windows 11 visual patterns:
- Taskbar: dark bar at bottom with app icons. Start button is a Windows logo.
- Run dialog: small window centre-screen with "Open:" text field
- Notepad: white text area with "Untitled - Notepad" title bar
- File Explorer: left sidebar with folders, main area shows files
- UAC: dark overlay with Yes/No buttons
- If you see a loading spinner or hourglass cursor, wait for next screenshot
- Active window has a coloured title bar. Inactive windows are greyed out.
`.trim(),

  shortcuts: {
    'open_run': 'meta+r',
    'open_explorer': 'meta+e',
    'desktop': 'meta+d',
    'switch_app': 'alt+Tab',
    'close_app': 'alt+F4',
    'lock': 'meta+l',
    'screenshot': 'meta+shift+s',
    'select_all': 'ctrl+a',
    'copy': 'ctrl+c',
    'paste': 'ctrl+v',
    'cut': 'ctrl+x',
    'undo': 'ctrl+z',
    'redo': 'ctrl+y',
    'save': 'ctrl+s',
    'new': 'ctrl+n',
    'open': 'ctrl+o',
    'find': 'ctrl+f',
    'print': 'ctrl+p',
  },
};

// ─── App-Specific Packs ───────────────────────────────────────────────────────

export const NOTEPAD_PACK: KnowledgePack = {
  id: 'notepad',
  name: 'Notepad',
  scope: 'notepad',
  planningContext: `
# Notepad Knowledge
- Open via: Win+R → "notepad" → Enter
- Ctrl+N = new document (if existing content is open)
- Ctrl+S = save (opens Save As if untitled)
- Ctrl+Shift+S = save as
- Ctrl+A = select all, then Delete to clear
- Ctrl+F = find, Ctrl+H = find and replace
- Text area takes focus immediately when app opens — just start typing
- If Notepad has existing content, press Ctrl+A then Delete before typing new text
- Notepad supports tabs (Windows 11) — Ctrl+T for new tab
`.trim(),

  visionContext: `
Notepad visual: white text area, menu bar (File/Edit/View), tab bar at top if multiple docs.
The text cursor blinks in the text area — that's where typing goes.
`.trim(),

  shortcuts: {
    'new_doc': 'ctrl+n',
    'new_tab': 'ctrl+t',
    'save': 'ctrl+s',
    'save_as': 'ctrl+shift+s',
    'find': 'ctrl+f',
    'replace': 'ctrl+h',
    'select_all': 'ctrl+a',
    'close_tab': 'ctrl+w',
  },
};

export const BROWSER_PACK: KnowledgePack = {
  id: 'browser',
  name: 'Browser (Edge/Chrome)',
  scope: 'browser',
  planningContext: `
# Browser Knowledge (Edge / Chrome)
- Open via: Win+R → "msedge" or "chrome" → Enter
- Ctrl+T = new tab
- Ctrl+W = close tab
- Ctrl+L or F6 = focus address bar (type URL then Enter)
- Ctrl+Tab = next tab, Ctrl+Shift+Tab = previous tab
- Ctrl+F = find on page
- Alt+Left = back, Alt+Right = forward
- Ctrl+R or F5 = refresh
- Ctrl+Shift+N = new incognito/InPrivate window
- Ctrl+D = bookmark current page
- To navigate: Ctrl+L → type URL → Enter
`.trim(),

  visionContext: `
Browser visual: tab bar at top, address bar below tabs, webpage content in main area.
Address bar shows current URL. Click it or press Ctrl+L to type a new URL.
Tabs show page titles. Active tab is highlighted.
`.trim(),

  shortcuts: {
    'new_tab': 'ctrl+t',
    'close_tab': 'ctrl+w',
    'address_bar': 'ctrl+l',
    'find': 'ctrl+f',
    'refresh': 'ctrl+r',
    'back': 'alt+Left',
    'forward': 'alt+Right',
    'bookmark': 'ctrl+d',
    'incognito': 'ctrl+shift+n',
  },
};

export const FILE_EXPLORER_PACK: KnowledgePack = {
  id: 'file-explorer',
  name: 'File Explorer',
  scope: 'explorer',
  planningContext: `
# File Explorer Knowledge
- Open via: Win+E
- Ctrl+L or click address bar to type a path directly
- Navigate by: typing path in address bar → Enter
- Ctrl+N = new window
- Ctrl+F or F3 = search
- F2 = rename selected item
- Delete = move to recycle bin, Shift+Delete = permanent
- Ctrl+Shift+N = new folder
- Alt+Up = go up one folder
- Backspace or Alt+Left = go back
- Right-click for context menu
`.trim(),

  visionContext: `
Explorer visual: navigation pane (folders) on left, file list on right, address bar at top showing current path.
Quick access / frequent folders shown in left sidebar.
`.trim(),

  shortcuts: {
    'open': 'meta+e',
    'address_bar': 'ctrl+l',
    'search': 'ctrl+f',
    'new_folder': 'ctrl+shift+n',
    'rename': 'f2',
    'go_up': 'alt+Up',
    'go_back': 'alt+Left',
  },
};

export const VS_CODE_PACK: KnowledgePack = {
  id: 'vscode',
  name: 'VS Code',
  scope: 'code',
  planningContext: `
# VS Code Knowledge
- Open via: Win+R → "code" → Enter (or "code ." for current folder)
- Ctrl+Shift+P = command palette (search any command)
- Ctrl+P = quick open file
- Ctrl+\` = toggle terminal
- Ctrl+B = toggle sidebar
- Ctrl+Shift+E = explorer panel
- Ctrl+Shift+F = search across files
- Ctrl+Shift+G = source control
- Ctrl+, = settings
- Ctrl+K Ctrl+S = keyboard shortcuts
- Ctrl+Shift+X = extensions
- F5 = start debugging, Ctrl+F5 = run without debug
`.trim(),

  visionContext: `
VS Code visual: sidebar on left (explorer/search/git), editor tabs in centre, terminal at bottom (if open), activity bar (icons) on far left.
Status bar at bottom shows branch, language, line/column.
`.trim(),

  shortcuts: {
    'command_palette': 'ctrl+shift+p',
    'quick_open': 'ctrl+p',
    'terminal': 'ctrl+`',
    'sidebar': 'ctrl+b',
    'search_files': 'ctrl+shift+f',
    'settings': 'ctrl+,',
    'extensions': 'ctrl+shift+x',
    'debug': 'f5',
  },
};

export const BLENDER_PACK: KnowledgePack = {
  id: 'blender',
  name: 'Blender',
  scope: 'blender',
  planningContext: `
# Blender Knowledge
- Open via: Win+R → "blender" → Enter
- Splash screen appears on start — click anywhere or press Escape to dismiss
- Tab = toggle between Object Mode and Edit Mode
- Shift+A = add object menu (mesh, curve, light, camera, etc.)
- G = grab/move, R = rotate, S = scale (then X/Y/Z to constrain axis)
- X or Delete = delete selected object
- Numpad 0 = camera view, Numpad 5 = toggle perspective/orthographic
- Ctrl+Z = undo, Ctrl+Shift+Z = redo
- F12 = render image
- Ctrl+S = save, Ctrl+Shift+S = save as
- Middle mouse = orbit view, Shift+Middle = pan, Scroll = zoom
- Right-click = context menu (in default keymap)
- N = toggle properties panel, T = toggle toolbar
`.trim(),

  visionContext: `
Blender visual: 3D viewport in centre, properties panel on right, outliner (scene hierarchy) top-right, timeline at bottom.
Header bar at top with menus (File, Edit, etc.) and mode selector.
Active object has orange outline. Selected objects have darker orange outline.
`.trim(),

  shortcuts: {
    'add_object': 'shift+a',
    'grab': 'g',
    'rotate': 'r',
    'scale': 's',
    'delete': 'x',
    'toggle_mode': 'Tab',
    'render': 'f12',
    'camera_view': 'numpad0',
    'undo': 'ctrl+z',
    'redo': 'ctrl+shift+z',
  },
};

// ─── Pack Registry ────────────────────────────────────────────────────────────

const ALL_PACKS: KnowledgePack[] = [
  WINDOWS_11_PACK,
  NOTEPAD_PACK,
  BROWSER_PACK,
  FILE_EXPLORER_PACK,
  VS_CODE_PACK,
  BLENDER_PACK,
];

/**
 * Get relevant knowledge packs for a task.
 * Always includes the Windows 11 core pack.
 * Includes app-specific packs if the task mentions the app.
 */
export function getRelevantPacks(task: string, targetApp?: string): KnowledgePack[] {
  const packs: KnowledgePack[] = [WINDOWS_11_PACK]; // Always included

  const taskLower = task.toLowerCase();
  const appLower = (targetApp || '').toLowerCase();

  for (const pack of ALL_PACKS) {
    if (pack.scope === 'always') continue; // Already added

    // Check if task or target app mentions this pack's scope
    if (taskLower.includes(pack.scope) || appLower.includes(pack.scope) ||
        taskLower.includes(pack.name.toLowerCase()) || appLower.includes(pack.name.toLowerCase())) {
      packs.push(pack);
    }
  }

  return packs;
}

/**
 * Build the planning context from relevant knowledge packs.
 */
export function buildPlanningKnowledge(task: string, targetApp?: string): string {
  const packs = getRelevantPacks(task, targetApp);
  return packs.map(p => p.planningContext).join('\n\n');
}

/**
 * Build the vision context from relevant knowledge packs.
 */
export function buildVisionKnowledge(task: string, targetApp?: string): string {
  const packs = getRelevantPacks(task, targetApp);
  return packs.map(p => p.visionContext).join('\n\n');
}

/**
 * Get all shortcuts from relevant knowledge packs.
 */
export function getShortcuts(task: string, targetApp?: string): Record<string, string> {
  const packs = getRelevantPacks(task, targetApp);
  const shortcuts: Record<string, string> = {};
  for (const pack of packs) {
    Object.assign(shortcuts, pack.shortcuts);
  }
  return shortcuts;
}

/**
 * Register a custom knowledge pack (for user-added apps).
 */
export function registerPack(pack: KnowledgePack): void {
  ALL_PACKS.push(pack);
}
