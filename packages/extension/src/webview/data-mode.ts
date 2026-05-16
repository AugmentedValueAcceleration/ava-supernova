// Cloud-sync state — single source of truth for "should a cloud copy be
// written?". Data is ALWAYS saved locally; that is the floor, not a
// setting. The only choice the operator makes is whether a copy also
// goes to the cloud.
//
// This replaces the old three-way local/cloud/both "Data Mode": in a
// local-first product "local" was never a mode, it was the foundation.
// A three-way toggle put it next to "cloud" as if they were equal
// choices, which was misleading.
//
// The toggle UI lives in the chat header. When it changes, the webview
// posts `set_cloud_sync` and the host persists the boolean here. Every
// cloud-write path calls cloudSyncEnabled(ctx) before pushing.
//
// Keep this file dependency-free beyond vscode — it's imported by both
// AvaViewProvider and DashboardPanel.

import * as vscode from 'vscode';

const KEY = 'ava.cloudSync';
const LEGACY_KEY = 'ava.dataMode';

/** True when a cloud copy should be written. Default OFF — nothing
 *  leaves the machine until the operator opts in.
 *
 *  Falls back to a read of the legacy three-value `ava.dataMode` so
 *  existing users keep their prior choice: `local` -> off,
 *  `cloud`/`both` -> on. The fallback is idempotent — once the toggle
 *  is touched the boolean key is authoritative and the legacy key is
 *  ignored. */
export function cloudSyncEnabled(ctx: vscode.ExtensionContext): boolean {
  const v = ctx.globalState.get<boolean>(KEY);
  if (typeof v === 'boolean') return v;
  const legacy = ctx.globalState.get<string>(LEGACY_KEY);
  return legacy === 'cloud' || legacy === 'both';
}

/** Persist the cloud-sync choice. Called by the `set_cloud_sync`
 *  message handler whenever the operator flips the chat-header toggle. */
export async function setCloudSync(ctx: vscode.ExtensionContext, enabled: boolean): Promise<void> {
  await ctx.globalState.update(KEY, enabled);
}

/** Value for the outgoing `X-Ava-Data-Mode` request header. The
 *  platform still speaks the legacy vocabulary (its `isLocalOnlyRequest`
 *  check looks for `local`), so map the boolean onto terms it already
 *  understands — no platform change needed. */
export function dataModeHeader(ctx: vscode.ExtensionContext): 'local' | 'both' {
  return cloudSyncEnabled(ctx) ? 'both' : 'local';
}
