// Host-side Data Mode state — single source of truth for "should this save
// write locally, to the cloud, or both?". Previously every save path
// either ignored the mode or made its own decision based on "is the
// platform key set?", which meant cloud-sync leaked even when the user
// had explicitly chosen Local.
//
// The toggle UI still lives in the chat header (localStorage) because
// that's what users see and touch. When it changes, the dashboard webview
// posts `set_data_mode` and the host persists the value into VS Code
// globalState via setDataMode(). Every save handler then calls
// includesLocal(ctx) / includesCloud(ctx) before writing.
//
// Keep this file dependency-free beyond vscode — it's imported by both
// AvaViewProvider and DashboardPanel.

import * as vscode from 'vscode';

export type DataMode = 'local' | 'cloud' | 'both';

const KEY = 'ava.dataMode';

/** Read the persisted data mode. Defaults to 'local' on first-run so we
 *  don't silently upload anything before the user has expressed intent. */
export function getDataMode(ctx: vscode.ExtensionContext): DataMode {
  const raw = ctx.globalState.get<string>(KEY);
  if (raw === 'cloud' || raw === 'both' || raw === 'local') return raw;
  return 'local';
}

/** Persist the data mode. Called by the `set_data_mode` message handler
 *  whenever the user flips the chat-header toggle. */
export async function setDataMode(ctx: vscode.ExtensionContext, mode: DataMode): Promise<void> {
  await ctx.globalState.update(KEY, mode);
}

/** True when writes should include the local store. */
export function includesLocal(ctx: vscode.ExtensionContext): boolean {
  const m = getDataMode(ctx);
  return m === 'local' || m === 'both';
}

/** True when writes should include cloud sync. */
export function includesCloud(ctx: vscode.ExtensionContext): boolean {
  const m = getDataMode(ctx);
  return m === 'cloud' || m === 'both';
}
