import type { ToolExecutionContext } from './types.js';

/**
 * Cloud-sync a creative asset after the generator has written it locally.
 *
 * Local-first is sacred: the caller's writeFile always happens first. This
 * function fires a non-blocking POST to `/api/creative-assets` so the asset
 * shows up on the Library across the web dashboard and companion when the
 * user has Data Mode set to Cloud or Both. A failed sync never rolls back
 * the on-disk copy — disk is the source of truth.
 *
 * Gated on two pieces of sharedState wired by the extension host:
 *   - platformKey          — user is signed in
 *   - generationLocalOnly  — Data Mode resolved to local (or the user
 *                            turned off generation sync specifically)
 *
 * When either is missing or localOnly is truthy, the push is skipped.
 * Same pattern used by learning, memory, tasks, journal.
 *
 * This helper exists so every generator tool (generate_image / _music /
 * _video / _voice / remove_background) shares a single upload path — one
 * place to tune, one place to audit, no four-way drift.
 */
export type CreativeAssetKind = 'image' | 'music' | 'video' | 'voice' | 'document' | 'spreadsheet';

export interface PersistCreativeAssetOptions {
  assetType: CreativeAssetKind;
  filename: string;
  contentType: string;
  bytes: Uint8Array | Buffer;
  title?: string;
  prompt?: string;
}

export function persistCreativeAsset(
  context: ToolExecutionContext,
  opts: PersistCreativeAssetOptions,
): void {
  const shared = context.sharedState ?? {};
  const platformKey = shared.platformKey as string | undefined;
  const localOnly = shared.generationLocalOnly as boolean | undefined;
  if (!platformKey || localOnly) return;

  // Fire-and-forget. Any rejection here must not bubble — the tool has
  // already reported success to the caller via its own return value, and
  // the local file is on disk. Cloud is additive, not authoritative.
  void (async () => {
    try {
      // Supabase Storage hard-caps uploads at 25 MB via the endpoint.
      // Large videos above that stay local-only for now; a streaming
      // upload path is the follow-up for large media.
      const MAX_BYTES = 25 * 1024 * 1024;
      if (opts.bytes.length > MAX_BYTES) return;

      const contentBase64 = Buffer.from(opts.bytes).toString('base64');
      await fetch('https://ava-supernova.com/api/creative-assets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${platformKey}`,
          'X-Ava-Client': (shared.clientSurface as string | undefined) ?? 'extension',
        },
        body: JSON.stringify({
          filename: opts.filename,
          contentType: opts.contentType,
          contentBase64,
          assetType: opts.assetType,
          title: opts.title ?? opts.filename,
          prompt: opts.prompt ?? '',
        }),
      });
    } catch { /* non-critical — local copy is the source of truth */ }
  })();
}
