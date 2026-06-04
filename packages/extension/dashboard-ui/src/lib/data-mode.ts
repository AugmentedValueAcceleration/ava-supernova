/**
 * Cloud-sync helper for the dashboard webview. Data is ALWAYS saved
 * locally — that is the floor, not a setting. This module only governs
 * whether a copy is also written to the cloud.
 *
 * Replaces the old three-way local/cloud/both "Data Mode": in a
 * local-first product "local" was never a mode, it was the foundation.
 */

import { post } from '../vscode';
import type { DashboardToExtMessage } from '../types/messages';

/** Ava is LOCAL-FIRST: nothing syncs to the cloud (storage sunsets 1 Jul
 *  2026). Hard-OFF now — the chat-header toggle and Sync tab that flipped it
 *  are gone, and the StorageBadge consistently reads "Local only". Kept as a
 *  function so callers (postData, StorageBadge) don't churn. */
export function cloudSyncEnabled(): boolean {
  return false;
}

/**
 * Write op — always saves locally, and also posts the cloud message
 * when cloud sync is on.
 *
 * @param localMsg - message that writes to the local store
 * @param cloudMsg - message that writes to the cloud
 */
export function postData(
  localMsg: DashboardToExtMessage,
  cloudMsg: DashboardToExtMessage,
): void {
  post(localMsg);
  if (cloudSyncEnabled()) post(cloudMsg);
}

/**
 * Read op — always loads from the local store. Display always shows
 * your local data; pulling the cloud copy down is a separate, explicit
 * action (the "refresh from cloud" button), never an implicit effect
 * of a toggle.
 *
 * @param localMsg - message that reads from the local store
 */
export function postLoad(localMsg: DashboardToExtMessage): void {
  post(localMsg);
}
