// Canonical fact table for keyboard shortcuts across all three surfaces.
// Extension: Ctrl+Shift+A (open) / Ctrl+Escape (focus) from package.json contributes.keybindings.
// Extension and IDE: Ctrl/Cmd+Shift+number picks a mode, in the picker's order
// (Code, Write, Plan, Chat, Security; the IDE adds Desktop).
// CLI: runtime keybindings for cancel/interject during agent runs.

export interface ShortcutFact {
  action: string;
  keysWin: string;
  keysMac: string;
  surfaces: Array<'extension' | 'ide' | 'cli'>;
  description: string;
}

export const SHORTCUTS: ShortcutFact[] = [
  { action: 'Open Chat', keysWin: 'Ctrl+Shift+A', keysMac: 'Cmd+Shift+A', surfaces: ['extension'], description: 'Open or focus the Ava chat panel.' },
  { action: 'Focus Input', keysWin: 'Ctrl+Escape', keysMac: 'Ctrl+Escape', surfaces: ['extension'], description: 'Jump cursor into the chat input field.' },

  { action: 'Switch to Code', keysWin: 'Ctrl+Shift+1', keysMac: 'Cmd+Shift+1', surfaces: ['extension', 'ide'], description: 'Activate Code mode (>>).' },
  { action: 'Switch to Write', keysWin: 'Ctrl+Shift+2', keysMac: 'Cmd+Shift+2', surfaces: ['extension', 'ide'], description: 'Activate Write mode (<<).' },
  { action: 'Switch to Plan', keysWin: 'Ctrl+Shift+3', keysMac: 'Cmd+Shift+3', surfaces: ['extension', 'ide'], description: 'Activate Plan mode (::).' },
  { action: 'Switch to Chat', keysWin: 'Ctrl+Shift+4', keysMac: 'Cmd+Shift+4', surfaces: ['extension', 'ide'], description: 'Activate Chat mode (..).' },
  { action: 'Switch to Security', keysWin: 'Ctrl+Shift+5', keysMac: 'Cmd+Shift+5', surfaces: ['extension', 'ide'], description: 'Activate Security mode (!!).' },
  { action: 'Switch to Desktop', keysWin: 'Ctrl+Shift+6', keysMac: 'Cmd+Shift+6', surfaces: ['ide'], description: 'Activate Desktop mode (@@).' },

  { action: 'Cancel Run', keysWin: 'Escape', keysMac: 'Escape', surfaces: ['cli'], description: 'Cancel an in-progress agent execution.' },
  { action: 'Cancel Run (hard)', keysWin: 'Ctrl+C', keysMac: 'Ctrl+C', surfaces: ['cli'], description: 'Interrupt an in-progress agent execution.' },
  { action: 'Interject', keysWin: 'Enter', keysMac: 'Enter', surfaces: ['cli'], description: 'Send a mid-run message to the agent without cancelling.' },
];
