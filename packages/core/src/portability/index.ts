/**
 * Data portability — the foundation of "we never store your data".
 *
 * One sealed bundle, two deliveries:
 *   • a `.ava-backup` file the user keeps wherever they trust (backup), and
 *   • a transfer between the user's own devices (companion hand-off).
 *
 * Both reuse exactly this: gather local data → seal with a passphrase →
 * (store | move) → open → restore. We only ever handle ciphertext.
 */

export { seal, open, isSealedEnvelope, type SealedEnvelope } from './crypto.js';
export {
  gatherBundle,
  restoreBundle,
  USER_DATA_PATHS,
  ACCOUNT_DATA_PATHS,
  GLOBAL_DATA_PATHS,
  BUNDLE_VERSION,
  type DataBundle,
  type RestoreResult,
} from './bundle.js';
// Per-type export/import, shared by every surface so they cannot drift.
export {
  exportDataType,
  importDataType,
  isCoreDataType,
  NotImportableError,
  CORE_DATA_TYPES,
  type CoreDataType,
  type ExportedFile,
  type DataRoots,
} from './data-types.js';

import { seal, open } from './crypto.js';
import { gatherBundle, restoreBundle, type DataBundle, type RestoreResult } from './bundle.js';

/**
 * Export everything under `avaHome` as an encrypted backup. Returns the sealed
 * envelope string — write it to a `.ava-backup` file.
 */
export async function exportEncryptedBackup(
  avaHome: string,
  passphrase: string,
  opts: { source: string; createdAt?: string; scopedDir?: string },
): Promise<string> {
  const bundle = await gatherBundle(avaHome, opts);
  return seal(JSON.stringify(bundle), passphrase);
}

/**
 * Import a sealed `.ava-backup` envelope into `avaHome`. Decrypts, validates,
 * and restores (safe-merge by default; pass `overwrite` to replace existing).
 */
export async function importEncryptedBackup(
  avaHome: string,
  envelopeJson: string,
  passphrase: string,
  opts?: { overwrite?: boolean; scopedDir?: string },
): Promise<{ bundle: DataBundle; result: RestoreResult }> {
  const json = open(envelopeJson, passphrase);
  let bundle: DataBundle;
  try {
    bundle = JSON.parse(json) as DataBundle;
  } catch {
    throw new Error('Backup decrypted but its contents are unreadable');
  }
  const result = await restoreBundle(avaHome, bundle, opts);
  return { bundle, result };
}
