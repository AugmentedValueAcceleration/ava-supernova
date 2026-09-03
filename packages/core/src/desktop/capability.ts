// Vision capability probe — a pure, structured decision about whether Ava can
// "see" a window the accessibility tree + browser can't read this turn, and
// whether that path is a KNOWN-GOOD one.
//
// ON-DEVICE OR OFF. There is no cloud lane and no key to add. Two used to
// exist — the user's own H Company key, and a platform-hosted lane that had
// been unreachable since the BYOK-only decision of 2026-07-02 — and both were
// removed on 2026-09-03. The reason is the product claim rather than the cost:
// every serious desktop automation tool ships your screen to somebody's
// cloud, and "your screen never leaves this machine" is checkable, needs no
// explaining, and is stronger as an absence than as a default. A default
// invites "so it CAN send my screen somewhere"; a missing capability does not.
//
// Honesty is still the point. The local lane runs entirely on-device but stays
// `verified: false` until someone actually measures it — hit rate on a dense
// UI, seconds per localize, on a normal machine. Removing the cloud option
// from beside it did not verify it; only running it will.
//
// Pure data in / data out — no fs, no Node, safe for the sidecar to call.

export type VisionLane = 'off' | 'local';

export interface VisionCapability {
  /** Can Scout offer descriptive targeting this turn (the Actor can localize)? */
  available: boolean;
  /** Which lane a localize() call would take. */
  lane: VisionLane;
  /** Is this a confirmed-good path? False until the on-device model's quality
   *  and latency have been measured and written down. */
  verified: boolean;
  /** One-line, user-facing explanation of the current state. */
  reason: string;
}

export interface VisionProbeInput {
  /** The user's perception setting. On-device or off — nothing else. */
  visionMode: 'off' | 'local';
  /** The on-device model server is live (local lane ready). */
  localModelInstalled: boolean;
  /** Optional GPU signal — future 4B-vs-0.8B selection. Does not affect the
   *  decision today; the hardware floor is a separate open question. */
  hasGpu?: boolean;
  vramMB?: number;
}

export function probeVisionCapability(i: VisionProbeInput): VisionCapability {
  if (i.visionMode === 'off') {
    return {
      available: false, lane: 'off', verified: false,
      reason: 'Vision is off — Ava reads windows via the accessibility tree + browser only, and says so when a window is unreadable.',
    };
  }

  if (!i.localModelInstalled) {
    return {
      available: false, lane: 'local', verified: false,
      reason: 'On-device vision is selected but the model is not installed yet — Ava will offer to download it.',
    };
  }

  // On-device and private. UNVERIFIED until measured; surface that honestly
  // rather than promising quality nobody has checked.
  return {
    available: true, lane: 'local', verified: false,
    reason: 'On-device vision — the screenshot never leaves this machine. Unverified: quality and latency not yet measured.',
  };
}
