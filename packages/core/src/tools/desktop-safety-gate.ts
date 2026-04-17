import type { ToolExecutionContext, ToolResult } from './types.js';
import {
  classifyAction,
  decideApproval,
  type ActionClassificationInput,
  type ClassificationResult,
  type PermissionLevel,
} from '../desktop/safety.js';
import type { BudgetTracker } from '../desktop/budget.js';

/**
 * Host-side approval handler for desktop automation. Populated on
 * sharedState.desktopApprovalHandler by the IDE. Receives the classification
 * so the UI can show the risk class + reasons alongside the raw tool call.
 *
 * Must NEVER cache approvals for irreversible or privileged actions — the
 * spec requires fresh confirmation every call for those classes.
 */
export type DesktopApprovalHandler = (
  toolName: string,
  args: Record<string, unknown>,
  classification: ClassificationResult,
) => Promise<boolean>;

export interface DesktopSafetyState {
  /** 'watch' | 'ask' | 'drive'. Default 'ask' if absent. */
  desktopPermissionLevel?: PermissionLevel;
  /** User has explicitly opted in to allowing privileged/elevated actions this session. */
  desktopPrivilegedOptIn?: boolean;
  /** Host-provided approval prompt. When absent, any action requiring approval is denied. */
  desktopApprovalHandler?: DesktopApprovalHandler;
  /** Budget tracker for the current desktop session. When absent, ticking is skipped. */
  desktopBudget?: BudgetTracker;
}

export interface GateOutcome {
  allowed: boolean;
  classification: ClassificationResult;
  /** Present when blocked — use as the tool's error output. */
  blockedOutput?: string;
}

/**
 * Gate a proposed desktop/browser action against the safety ontology and
 * optional per-session budget. Call this as the first step of `execute()`
 * in any mutative tool. Observational tools (list_elements, snapshot,
 * focus_window, close) do not need to gate.
 *
 * Returns `{ allowed: false, blockedOutput }` when the action should
 * short-circuit. The tool returns that verbatim as its ToolResult output.
 */
export async function gateDesktopAction(
  input: ActionClassificationInput,
  toolName: string,
  args: Record<string, unknown>,
  context: ToolExecutionContext,
): Promise<GateOutcome> {
  const state = (context.sharedState || {}) as Record<string, unknown> & DesktopSafetyState;
  const classification = classifyAction(input);
  const permissionLevel = state.desktopPermissionLevel ?? 'ask';
  const privilegedOptIn = state.desktopPrivilegedOptIn ?? false;
  const decision = decideApproval(classification.riskClass, permissionLevel, privilegedOptIn);

  // Budget check comes before approval — no point asking for confirmation
  // if we're already over budget.
  if (state.desktopBudget) {
    const snap = state.desktopBudget.snapshot();
    if (snap.breached) {
      return {
        allowed: false,
        classification,
        blockedOutput:
          `Session budget breached (${snap.breachReason}) — ` +
          `${snap.step} steps · ${Math.round(snap.tokensUsed / 1000)}K tokens · ` +
          `${Math.round(snap.elapsedMs / 1000)}s. Ask the user to extend the budget or start a fresh session.`,
      };
    }
  }

  if (decision.forbidden) {
    return {
      allowed: false,
      classification,
      blockedOutput:
        `Action forbidden (${classification.riskClass}): ${decision.reason}. ` +
        (classification.reasons.length
          ? `Signals: ${classification.reasons.join('; ')}.`
          : '') +
        ' Privileged actions require explicit opt-in — ask the user before retrying.',
    };
  }

  if (decision.requiresApproval) {
    const handler = state.desktopApprovalHandler;
    if (!handler) {
      // Fail closed — if the host can't prompt, we don't assume consent.
      return {
        allowed: false,
        classification,
        blockedOutput:
          `Approval required (${classification.riskClass}) but no desktop approval handler is available in this host. ` +
          'Desktop mode requires the Ava IDE for irreversible / sensitive actions.',
      };
    }
    let approved = false;
    try {
      approved = await handler(toolName, args, classification);
    } catch (err) {
      return {
        allowed: false,
        classification,
        blockedOutput: `Approval handler failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    if (!approved) {
      return {
        allowed: false,
        classification,
        blockedOutput:
          `User declined (${classification.riskClass}): ${decision.reason}. ` +
          (classification.reasons.length ? `Signals: ${classification.reasons.join('; ')}.` : ''),
      };
    }
  }

  return { allowed: true, classification };
}

/**
 * Record a successful action step against the session budget.
 * Rough token accounting — we don't have per-persona splits in the tool
 * path, so we bucket everything under `actor`. Call this AFTER a
 * successful execute(), not before.
 */
export function tickBudget(context: ToolExecutionContext, approxTokens: number = 1000): void {
  const state = (context.sharedState || {}) as Record<string, unknown> & DesktopSafetyState;
  if (!state.desktopBudget) return;
  state.desktopBudget.recordStep({
    scout: 0,
    planner: 0,
    actor: approxTokens,
    verifier: 0,
    narrator: 0,
    omniParser: 0,
  });
}

/** Convenience: turn a blocked GateOutcome into a ToolResult. */
export function blockedResult(outcome: GateOutcome): ToolResult {
  return {
    success: false,
    output: outcome.blockedOutput || 'Action blocked by safety gate.',
    metadata: { blocked: true, classification: outcome.classification },
  };
}
