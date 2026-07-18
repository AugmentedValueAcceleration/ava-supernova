/**
 * Shared fleet picker copy — imported by BOTH extension UIs (webview-ui's
 * ModelSelector and dashboard-ui's ModelSelector), which are otherwise
 * near-identical files that have historically drifted.
 *
 * This lives under src/webview/ because that is the one directory both UI
 * tsconfigs already reach into (they each alias `@ava-extension/messages`
 * there), so no new build wiring is needed.
 *
 * Why a table rather than the nested ternaries this replaced: each fleet's
 * wording now sits together where it can be read and checked as a unit, and
 * adding a fleet is one entry instead of four scattered ternary arms per file.
 */

/** Orchestrated fleet ids — everything else in a picker is a raw model id. */
export const FLEET_IDS: readonly string[] = ['auto', 'supernova', 'aurora', 'longxiang'];

export function isFleetModelId(id: string | null | undefined): boolean {
  return !!id && FLEET_IDS.includes(id);
}

export interface FleetCopy {
  /** Display label including the ✦ glyph. */
  label: string;
  /** Subtitle when the user can run this fleet. */
  sub: string;
  /** Subtitle when locked — names the exact unlock path. Keep it SHORT: the
   *  picker's subtitle column is narrow (roughly the width of "EU stack —
   *  Mistral end-to-end"), so anything longer wraps or clips. Where the host
   *  can identify the single missing key it sends a `lockedReason` that wins
   *  over this; this is the fallback when it can't. */
  subLocked: string;
  /** Tooltip when available. */
  tip: string;
  /** Tooltip when locked. */
  tipLocked: string;
}

export const FLEET_COPY: Record<string, FleetCopy> = {
  auto: {
    label: '✦ Maestro',
    sub: 'Best model per task',
    subLocked: 'Add Qwen key',
    tip: 'One coordinator handles everything — proven, production-tuned',
    tipLocked: 'Maestro — Qwen fleet. Sign in for platform access, or add a Qwen API key for BYOK.',
  },
  supernova: {
    label: '✦ Supernova',
    sub: 'Polyglot ensemble',
    subLocked: 'Add DeepSeek + Qwen keys',
    tip: 'Multi-model orchestration — coordinator picks the best specialist for each task',
    tipLocked: 'Supernova — DeepSeek + Qwen polyglot ensemble. Sign in for platform access, or add DeepSeek + Qwen API keys for BYOK.',
  },
  aurora: {
    label: '✦ Aurora',
    sub: 'EU stack — Mistral end-to-end',
    subLocked: 'Add Mistral key',
    tip: 'Aurora — Mistral-only three-tier EU stack. Medium 3.5 leads (coordinator + Builder + vision + deep specialists), Small 4 carries the volume (chat, long-context, brainstorm, intent gate), Large 3 is the heavy reserve. Stays inside European infrastructure.',
    tipLocked: 'Aurora — EU-stack Mistral-only routing. Sign in for platform access, or add a Mistral API key for BYOK.',
  },
  longxiang: {
    // NOTE: the copy deliberately does NOT claim "open weights end to end" —
    // that is only true once Qwen 3.7 Plus weights are public. See
    // longxiang-router.ts before strengthening any of this wording.
    label: '✦ Longxiang',
    sub: 'Kimi K3 + Qwen + DeepSeek',
    // Fallback only — where the user holds SOME of the keys the host supplies
    // a `lockedReason` naming the single one missing, matching Aurora's
    // "Add Mistral key" pattern.
    subLocked: 'Connect or add 3 keys',
    tip: 'Longxiang — Kimi K3 leads as coordinator and Builder, Qwen 3.7 Plus takes mid-tier builds and vision, DeepSeek V4 Flash handles volume. K3 is the priciest model we serve, so expect more credits per turn than the other fleets.',
    tipLocked: 'Longxiang — Kimi K3 + Qwen + DeepSeek. Sign in for platform access, or add all three API keys for BYOK.',
  },
};
