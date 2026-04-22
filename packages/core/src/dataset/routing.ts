/**
 * Event → dataset routing.
 *
 * Each event type maps to exactly one dataset file. Cross-dataset queries
 * at training time reconstruct via `trajectory_id`, not via writing the
 * same event to multiple files (that way we never drift).
 */

import type { AvaEventType } from './events.js';

export type DatasetName =
  | 'tool-trajectories'
  | 'persona-handoffs'
  | 'verification-pairs'
  | 'auto-mode-classification'
  | 'error-recovery'
  | 'memory-operations'
  | 'continuation-recovery'
  | 'mode-transitions'
  | 'generation-effectiveness'
  | 'knowledge-pack-effectiveness'
  | 'billing-credits';

export const ALL_DATASETS: readonly DatasetName[] = [
  'tool-trajectories',
  'persona-handoffs',
  'verification-pairs',
  'auto-mode-classification',
  'error-recovery',
  'memory-operations',
  'continuation-recovery',
  'mode-transitions',
  'generation-effectiveness',
  'knowledge-pack-effectiveness',
  'billing-credits',
] as const;

/**
 * Exhaustive event → dataset mapping. TypeScript enforces that every
 * `AvaEventType` has a case — adding a new event to events.ts without
 * updating this function is a compile error.
 */
export function eventToDataset(eventType: AvaEventType): DatasetName {
  switch (eventType) {
    case 'tool_choice':
    case 'tool_result':
    case 'tool_chain_complete':
      return 'tool-trajectories';

    case 'persona_decision':
    case 'persona_handoff':
    case 'persona_complete':
      return 'persona-handoffs';

    case 'verification_decision':
    case 'correction_received':
      return 'verification-pairs';

    case 'task_classification':
    case 'routing_decision':
      return 'auto-mode-classification';

    case 'tool_error':
    case 'error_guidance_applied':
    case 'recovery_action':
      return 'error-recovery';

    case 'memory_save':
    case 'memory_recall':
    case 'memory_update':
    case 'memory_consolidation':
    case 'memory_forget':
      return 'memory-operations';

    case 'continuation_stall_detected':
    case 'continuation_nudge_fired':
      return 'continuation-recovery';

    case 'mode_switch':
      return 'mode-transitions';

    case 'generation_started':
    case 'generation_complete':
    case 'generation_user_action':
      return 'generation-effectiveness';

    case 'knowledge_pack_activated':
    case 'knowledge_pack_used':
      return 'knowledge-pack-effectiveness';

    case 'credits_charged':
      return 'billing-credits';
  }
}
