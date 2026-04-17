// ─── C4: Session Whitelist + Budget Enforcement Gates ─────────────────────
//
// Pre-execution gates that run between Planner output and Actor execution.
// Two independent checks, both must pass:
//   1. Whitelist gate — is the action targeting a whitelisted app/site?
//   2. Budget gate — has the trajectory exceeded any of the three caps?
//
// Plus the approval gate from the safety ontology (A1), which decides
// whether the user needs to confirm before Actor proceeds.

import { classifyAction, decideApproval, isWhitelisted } from './safety.js';
import type { RiskClass, PermissionLevel, ApprovalDecision, ActionClassificationInput } from './safety.js';
import type { BudgetSnapshot } from './budget.js';
import type { ProposedAction, ScreenState } from './types.js';

// ── Gate result ───────────────────────────────────────────────────────────

export type GateVerdict = 'proceed' | 'needs_approval' | 'blocked' | 'budget_exceeded';

export interface GateResult {
  verdict: GateVerdict;
  riskClass: RiskClass;
  approval: ApprovalDecision;
  reasons: string[];
  requiresSecretHandle: boolean;
}

// ── Gate runner ───────────────────────────────────────────────────────────

export interface GateConfig {
  whitelist: string[];
  permissionLevel: PermissionLevel;
  privilegedOptIn: boolean;
}

/**
 * Run all pre-execution gates on a ProposedAction.
 * Returns a verdict the conductor can act on:
 *   - proceed: Actor can execute immediately
 *   - needs_approval: show approval card, wait for user decision
 *   - blocked: action is forbidden (privileged without opt-in, or not whitelisted)
 *   - budget_exceeded: one of the three caps was hit
 */
export function runGates(
  action: ProposedAction,
  screenState: ScreenState,
  budget: BudgetSnapshot,
  config: GateConfig,
): GateResult {
  const reasons: string[] = [];

  // ── Budget gate ───────────────────────────────────────────────────
  if (budget.breached) {
    return {
      verdict: 'budget_exceeded',
      riskClass: action.riskClass,
      approval: { requiresApproval: false, forbidden: false, cacheable: false, reason: `Budget ${budget.breachReason}` },
      reasons: [`Budget cap hit: ${budget.breachReason}`],
      requiresSecretHandle: false,
    };
  }

  // ── Whitelist gate ────────────────────────────────────────────────
  // Only enforce for mutative actions — observational and navigational
  // are allowed everywhere (you need to see what's on screen to decide
  // whether to add an app to the whitelist).
  const targetApp = screenState.activeApp ?? '';
  if (action.riskClass !== 'observational' && action.riskClass !== 'navigational') {
    if (targetApp && !isWhitelisted(targetApp, config.whitelist)) {
      reasons.push(`App '${targetApp}' is not in the session whitelist`);
      return {
        verdict: 'blocked',
        riskClass: action.riskClass,
        approval: { requiresApproval: false, forbidden: true, cacheable: false, reason: `Not whitelisted: ${targetApp}` },
        reasons,
        requiresSecretHandle: false,
      };
    }
  }

  // ── Safety classification + approval gate ─────────────────────────
  // Re-classify from live screen data (Planner's riskClass is advisory;
  // the gate re-evaluates from the actual target metadata).
  const targetElement = action.target
    ? screenState.elements.find(e => e.id === action.target)
    : undefined;

  const classInput: ActionClassificationInput = {
    kind: action.kind,
    targetName: targetElement?.name,
    targetType: targetElement?.kind,
    isMaskedField: targetElement?.sensitive,
    appName: targetApp,
  };
  const classification = classifyAction(classInput);
  const approval = decideApproval(classification.riskClass, config.permissionLevel, config.privilegedOptIn);
  reasons.push(...classification.reasons);

  if (approval.forbidden) {
    return {
      verdict: 'blocked',
      riskClass: classification.riskClass,
      approval,
      reasons,
      requiresSecretHandle: classification.requiresSecretHandle,
    };
  }

  if (approval.requiresApproval) {
    return {
      verdict: 'needs_approval',
      riskClass: classification.riskClass,
      approval,
      reasons,
      requiresSecretHandle: classification.requiresSecretHandle,
    };
  }

  return {
    verdict: 'proceed',
    riskClass: classification.riskClass,
    approval,
    reasons,
    requiresSecretHandle: classification.requiresSecretHandle,
  };
}
