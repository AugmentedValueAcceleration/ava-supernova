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

export interface ActivePlanStep {
  description: string;
}

export interface ActivePlan {
  id: string;
  summary: string;
  steps: ActivePlanStep[];
  /** Epoch ms. Used by the gate to enforce a TTL so a forgotten plan can't
   *  blanket-approve actions indefinitely. */
  approvedAt: number;
  /** ms — typically 5 minutes. Gate rejects a plan older than this. */
  ttlMs: number;
}

export interface DesktopSafetyState {
  /** 'watch' | 'ask' | 'drive'. Default 'ask' if absent. */
  desktopPermissionLevel?: PermissionLevel;
  /** User has explicitly opted in to allowing privileged/elevated actions this session. */
  desktopPrivilegedOptIn?: boolean;
  /** Host-provided approval prompt. When absent, any action requiring approval is denied. */
  desktopApprovalHandler?: DesktopApprovalHandler;
  /** Budget tracker for the current desktop session. When absent, ticking is skipped. */
  desktopBudget?: BudgetTracker;
  /** Currently-approved trajectory plan. While set and un-expired, the gate
   *  auto-approves mutative-reversible actions — the user already approved
   *  the whole sequence up front. Irreversible actions still prompt fresh,
   *  per spec. Set by desktop_plan_approve, cleared on new user turn,
   *  irreversible hit, or TTL expiry. */
  desktopActivePlan?: ActivePlan | null;
  /** Number of mutative actions that have already been approved in the
   *  current turn. The gate uses this to enforce the plan-first rule: if
   *  Ava ignored the system prompt and is about to take action #2 with no
   *  active plan, we return an educational error so she corrects on the
   *  next loop. Reset to 0 on every new user message in the sidecar. */
  desktopMutativeActionsThisTurn?: number;
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

  // Secret-handle guard — runs BEFORE approval logic because no amount
  // of user approval should let raw credentials flow through a text arg.
  // When the classifier flags a sensitive field (password, secret, token,
  // API key, 2FA code — either by `isMaskedField` or by field-name
  // pattern match), the `text` value must be a `{{secret:<id>}}` handle
  // returned by `secret_request`. The host substitutes the real value at
  // execution time, so the actual credential never enters the model's
  // tool args or reasoning history.
  //
  // If Ava tries to pass raw text into a sensitive field, block with an
  // educational error. She'll see it in her next loop and call
  // secret_request for a handle, then retry the tool.
  if (classification.requiresSecretHandle) {
    const text = typeof args.text === 'string' ? args.text : '';
    const hasSecretHandle = /\{\{secret:[^}\s]+\}\}/.test(text);
    if (!hasSecretHandle) {
      return {
        allowed: false,
        classification,
        blockedOutput:
          `This field is sensitive (${classification.reasons.join('; ') || 'password / secret / token'}). ` +
          `Do NOT type raw credentials into it. Choose ONE of:\n\n` +
          `(A) Vault flow — preferred when available:\n` +
          `  1. Call secret_request({ label: "<what this is>", reason: "<why you need it>" }).\n` +
          `  2. The user picks a vault entry; you receive an opaque handle like {{secret:abc123}}.\n` +
          `  3. Call this tool again with text: "{{secret:abc123}}" (just the handle — nothing else).\n` +
          `  4. The host substitutes the real value at execution time. The credential never appears in your tool args, thinking, or chat history.\n\n` +
          `(B) User-types-it themselves — use this if secret_request returns "vault not available":\n` +
          `  1. Stop trying to type into the field.\n` +
          `  2. Tell the user plainly: "I'll let you type that one — it's a sensitive field and I shouldn't handle raw credentials."\n` +
          `  3. Wait for them to continue the task or give you the next step.\n` +
          `  DO NOT ask the user to paste the credential into chat — that puts it in conversation history, same problem.`,
      };
    }
  }

  if (decision.requiresApproval) {
    // Trajectory-plan short-circuit: if the user already approved a plan
    // that covers reversible actions, auto-approve here. Irreversible
    // actions NEVER short-circuit on a plan — spec rule, they always
    // prompt fresh. An irreversible hit ALSO invalidates the plan so
    // subsequent reversible steps have to re-approve too (prevents a
    // dangerous action mid-plan from silently continuing).
    if (
      classification.riskClass === 'mutative-reversible' &&
      state.desktopActivePlan &&
      Date.now() - state.desktopActivePlan.approvedAt < state.desktopActivePlan.ttlMs
    ) {
      return { allowed: true, classification };
    }
    if (classification.riskClass === 'mutative-irreversible' && state.desktopActivePlan) {
      // Invalidate the plan — an irreversible action ends the batch
      state.desktopActivePlan = null;
    }

    // Plan-first enforcement: EVERY mutative-reversible action requires
    // an active plan. No exceptions for the first action, no "ceremony"
    // exemption for single-step plans. This gives the user exactly one
    // approval per task (the plan card) and all the reversible follow-ups
    // run silently under it. Irreversible actions are exempt from the
    // plan requirement — they always prompt individually per spec, and
    // forcing a plan for an irreversible-only task would just add an
    // extra prompt without helping.
    if (classification.riskClass === 'mutative-reversible' && !state.desktopActivePlan) {
      return {
        allowed: false,
        classification,
        blockedOutput:
          `This is a mutative action and there's no approved plan yet. ` +
          `Call desktop_plan_approve({ summary, steps }) FIRST with every action you intend to take (including this one). ` +
          `The user will see one approval card for the whole task; after they approve, reversible actions run silently. ` +
          `Irreversible actions still prompt individually.`,
      };
    }

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
