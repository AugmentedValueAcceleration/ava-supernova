// ─── Consent + finished welcome, shared with the IDE ─────────────────────────
//
// A user with both apps goes through the welcome once. ~/.ava/onboarding.json
// records consent and a finished welcome; the IDE's src/lib/shared-onboarding.ts
// reads and writes the same file. (The name is already shared: both apps keep
// it in ~/.ava/general.json.)
//
// The extension keeps reading its own globalState flags everywhere —
// syncSharedOnboarding() at activation copies the shared facts into them, and
// the extension's into the file (someone who finished the welcome in an older
// extension has nothing in the file yet).

import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type * as vscode from 'vscode';
import { AVA_HOME } from '@ava/core';

const FILE = join(AVA_HOME, 'onboarding.json');
const CONSENT = 'ava.consentAccepted';
const ONBOARDED = 'ava.onboardedV2';

interface SharedOnboarding {
  schema_version: 1;
  consent_accepted_at: string | null;
  onboarded_at: string | null;
}

function read(): SharedOnboarding {
  try {
    const parsed = JSON.parse(readFileSync(FILE, 'utf-8')) as Partial<SharedOnboarding>;
    return {
      schema_version: 1,
      consent_accepted_at: typeof parsed.consent_accepted_at === 'string' ? parsed.consent_accepted_at : null,
      onboarded_at: typeof parsed.onboarded_at === 'string' ? parsed.onboarded_at : null,
    };
  } catch {
    return { schema_version: 1, consent_accepted_at: null, onboarded_at: null };
  }
}

/** Record consent and/or a finished welcome. Keeps the first timestamp. */
export async function markShared(patch: { consent?: boolean; onboarded?: boolean }): Promise<void> {
  const cur = read();
  const now = new Date().toISOString();
  const next: SharedOnboarding = {
    schema_version: 1,
    consent_accepted_at: cur.consent_accepted_at ?? (patch.consent ? now : null),
    onboarded_at: cur.onboarded_at ?? (patch.onboarded ? now : null),
  };
  if (next.consent_accepted_at === cur.consent_accepted_at && next.onboarded_at === cur.onboarded_at) return;
  await mkdir(AVA_HOME, { recursive: true });
  await writeFile(FILE, JSON.stringify(next, null, 2), 'utf-8');
}

/** Both directions, at activation. Never throws. */
export async function syncSharedOnboarding(state: vscode.Memento): Promise<void> {
  try {
    const shared = read();
    if (shared.consent_accepted_at && !state.get(CONSENT)) await state.update(CONSENT, shared.consent_accepted_at);
    if (shared.onboarded_at && !state.get(ONBOARDED)) await state.update(ONBOARDED, true);
    const consent = !!state.get(CONSENT) && !shared.consent_accepted_at;
    const onboarded = !!state.get(ONBOARDED) && !shared.onboarded_at;
    if (consent || onboarded) await markShared({ consent, onboarded });
  } catch { /* the extension's own flags still work */ }
}
