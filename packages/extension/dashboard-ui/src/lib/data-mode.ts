/**
 * Data mode helper — reads the user's storage preference and posts
 * messages to the correct targets (local, cloud, or both).
 */

import { post } from '../vscode';
import type { DashboardToExtMessage } from '../types/messages';

export type DataMode = 'local' | 'cloud' | 'both';

export function getDataMode(): DataMode {
  return (localStorage.getItem('ava-data-mode') as DataMode) || 'local';
}

/**
 * Post a data operation to the correct target(s) based on the user's data mode.
 *
 * @param localMsg  - message to post for local storage
 * @param cloudMsg  - message to post for cloud storage
 *
 * When mode is 'local'  → posts localMsg only
 * When mode is 'cloud'  → posts cloudMsg only
 * When mode is 'both'   → posts localMsg first, then cloudMsg
 */
export function postData(
  localMsg: DashboardToExtMessage,
  cloudMsg: DashboardToExtMessage,
): void {
  const mode = getDataMode();
  if (mode === 'local' || mode === 'both') post(localMsg);
  if (mode === 'cloud' || mode === 'both') post(cloudMsg);
}

/**
 * Post a load/read operation — reads from the appropriate source.
 * For 'both', loads from both so the UI gets a merged view.
 */
export function postLoad(
  localMsg: DashboardToExtMessage,
  cloudMsg: DashboardToExtMessage,
): void {
  const mode = getDataMode();
  if (mode === 'local') {
    post(localMsg);
  } else if (mode === 'cloud') {
    post(cloudMsg);
  } else {
    // Both — load from both, UI merges
    post(localMsg);
    post(cloudMsg);
  }
}

/**
 * Check if local operations should be included.
 */
export function includesLocal(): boolean {
  const mode = getDataMode();
  return mode === 'local' || mode === 'both';
}

/**
 * Check if cloud operations should be included.
 */
export function includesCloud(): boolean {
  const mode = getDataMode();
  return mode === 'cloud' || mode === 'both';
}
