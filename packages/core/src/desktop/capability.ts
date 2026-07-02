// Vision capability probe — a pure, structured decision about whether Ava can
// "see" a window the accessibility tree + browser can't read this turn, WHICH
// lane would serve it, and — crucially — whether that lane is a KNOWN-GOOD one.
//
// Honesty is the point. The local Holo lane runs entirely on-device (private)
// but stays `verified: false` until H Company confirms the small-model mmproj /
// llama.cpp path + real latency — so Scout can advertise it truthfully ("local
// vision, unverified") rather than promising quality we haven't proven. The
// shippable, verified lane today is cloud-BYOK (the user's own H Company key).
//
// Pure data in / data out — no fs, no Node, safe for the sidecar to call.

export type VisionLane = 'off' | 'local' | 'cloud-byok' | 'cloud-platform';

export interface VisionCapability {
  /** Can Scout offer descriptive targeting this turn (the Actor can localize)? */
  available: boolean;
  /** Which lane a localize() call would take. */
  lane: VisionLane;
  /** Is this a confirmed-good path? Local Holo + platform-hosted vision are
   *  false until verified with H Company; cloud-BYOK (own key) is true. */
  verified: boolean;
  /** One-line, user-facing explanation of the current state. */
  reason: string;
}

export interface VisionProbeInput {
  /** The user's perception setting. */
  visionMode: 'off' | 'local' | 'cloud';
  /** The on-device model server is live (local lane ready). */
  localModelInstalled: boolean;
  /** The user's own H Company key is present (BYOK cloud lane). */
  hasHCompanyKey: boolean;
  /** A platform/account key is present (platform-hosted cloud lane). */
  hasPlatformKey: boolean;
  /** Optional GPU signal — future local 4B-vs-0.8B selection; does not affect
   *  the shippable path while the local lane is unverified. */
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

  if (i.visionMode === 'local') {
    if (!i.localModelInstalled) {
      return { available: false, lane: 'local', verified: false, reason: 'Local vision is selected but the on-device model is not installed yet.' };
    }
    // On-device + private, but UNVERIFIED until H Company confirms the small
    // model path + latency. Surface it honestly rather than promising quality.
    return { available: true, lane: 'local', verified: false, reason: 'Local vision (on-device, private) — unverified: quality/latency not yet confirmed.' };
  }

  // cloud
  if (i.hasHCompanyKey) {
    return { available: true, lane: 'cloud-byok', verified: true, reason: 'Vision via your own H Company key — a screenshot is sent only when a window can’t be read.' };
  }
  if (i.hasPlatformKey) {
    // Platform-hosted vision is in preview until confirmed with H Company.
    // (BYOK-only hosts pass hasPlatformKey: false — operator decision
    // 2026-07-02 — so this lane is currently unreachable in the IDE.)
    return { available: true, lane: 'cloud-platform', verified: false, reason: 'Vision via your Ava account (preview — for verified vision, add your own H Company key).' };
  }
  return { available: false, lane: 'off', verified: false, reason: 'Cloud vision needs your own H Company key (BYOK) — add it in Settings to enable it.' };
}
