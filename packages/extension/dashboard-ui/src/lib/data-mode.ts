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

const KEY = 'ava-cloud-sync';

/** True when a cloud copy should also be written. Default OFF — nothing
 *  leaves the machine until the operator opts in. Migrates the legacy
 *  three-value `ava-data-mode`: `cloud`/`both` -> on, `local` -> off. */
export function cloudSyncEnabled(): boolean {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'true') return true;
    if (v === 'false') return false;
    const legacy = localStorage.getItem('ava-data-mode');
    return legacy === 'cloud' || legacy === 'both';
  } catch {
    return false;
  }
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
