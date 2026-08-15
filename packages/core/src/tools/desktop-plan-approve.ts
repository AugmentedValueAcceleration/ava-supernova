import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { DesktopApprovalHandler, ActivePlan, ActivePlanStep } from './desktop-safety-gate.js';
import type { ClassificationResult } from '../desktop/safety.js';
import { classifyPlanStep } from '../desktop/safety.js';

const PLAN_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Desktop trajectory approval tool.
 *
 * Ava calls this as her first tool for any task involving 2+ mutative
 * actions. The user sees one approval card listing every step of the
 * plan, clicks Allow once, and the subsequent reversible actions
 * (launch_app, focus_window, type, normal click, navigate) all
 * auto-approve — no repeated prompts for each step.
 *
 * Irreversible actions (Send, Pay, Delete, destructive combos) still
 * prompt fresh every time even inside an approved plan, and any such
 * hit invalidates the plan so subsequent reversible steps re-approve
 * too. This matches the spec: the batched approval is a *ceiling* on
 * what was consented to, never a blanket trust.
 *
 * Single-action tasks should skip the plan and go straight to the
 * per-action approval — one prompt either way, no ceremony.
 */
export class DesktopPlanApproveTool implements Tool {
  readonly name = 'desktop_plan_approve';
  readonly description = 'Present a desktop automation plan for one-shot approval. Call as the first action for any task with 2+ mutative steps. The user sees one card with the whole plan and approves once; reversible follow-up steps then auto-run.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;
  readonly usesDynamicConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'desktop_plan_approve',
    description:
      'Present a trajectory plan to the user for one-shot approval. Call this FIRST for any multi-step task (open an app + type, navigate + click, etc.). ' +
      'The user sees one card listing every step; clicking Allow approves the whole sequence at once. Reversible follow-up actions auto-run. ' +
      'Irreversible actions (Send, Submit, Pay, Delete, destructive key combos) still prompt individually — the plan never blankets those. ' +
      'For single-action tasks, skip this and go straight to the action.',
    parameters: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'One-sentence description of what the whole plan accomplishes (e.g. "Open Notepad and type the sentence").',
        },
        steps: {
          type: 'array',
          description: 'Ordered list of the atomic actions you intend to take. Each step should map to one tool call.',
          items: {
            type: 'object',
            properties: {
              description: {
                type: 'string',
                description: 'What this step will do (plain English, user-facing — e.g. "Launch Notepad", "Type the sentence", "Focus the window").',
              },
            },
            required: ['description'],
          },
        },
      },
      required: ['summary', 'steps'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const summary = (args.summary as string)?.trim();
    const rawSteps = args.steps as Array<{ description?: string }> | undefined;
    if (!summary) return { success: false, output: 'summary is required.' };
    if (!rawSteps || rawSteps.length === 0) return { success: false, output: 'steps is required and must be non-empty.' };

    // Drop empty descriptions, then classify each surviving step. The
    // classifier reads the description text the model just wrote, so a
    // step the model labelled as harmless but described as "Send the email"
    // is flagged as irreversible regardless — Ava can't lie her way past it.
    const steps: ActivePlanStep[] = rawSteps
      .map(s => String(s?.description ?? '').trim())
      .filter(description => description.length > 0)
      .map(description => {
        const classification = classifyPlanStep(description);
        const step: ActivePlanStep = { description, riskClass: classification.riskClass };
        if (classification.reasons.length > 0) step.reasons = classification.reasons;
        return step;
      });
    if (steps.length === 0) return { success: false, output: 'steps must contain at least one non-empty description.' };
    // Single-step plans are fine. They cost the user the same one click,
    // and the plan card is arguably more informative than a raw action
    // confirmation anyway. Consistency beats cleverness here.

    const state = (context.sharedState || {}) as Record<string, unknown>;
    const handler = state.desktopApprovalHandler as DesktopApprovalHandler | undefined;
    if (!handler) {
      return {
        success: false,
        output:
          'Plan approval requires the Ava IDE host. No desktopApprovalHandler on sharedState — cannot prompt the user.',
      };
    }

    // Synthetic classification so the host renders this as a plan card.
    // The classification payload carries the reasons list, which we use to
    // hint that this is a plan-level approval rather than a per-action one.
    const classification: ClassificationResult = {
      riskClass: 'mutative-reversible',
      reasons: [
        'Plan covers multiple reversible actions',
        ...steps.map((s, i) => `Step ${i + 1}: ${s.description}`),
      ],
      requiresSecretHandle: false,
    };

    let approved;
    try {
      approved = await handler(this.name, { summary, steps }, classification);
    } catch (err) {
      return { success: false, output: `Plan approval handler failed: ${err instanceof Error ? err.message : String(err)}` };
    }

    if (!approved) {
      return {
        success: false,
        output: `User declined the plan: "${summary}". Do not proceed with any of the steps.`,
      };
    }

    const plan: ActivePlan = {
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `plan-${Date.now()}`,
      summary,
      steps,
      approvedAt: Date.now(),
      ttlMs: PLAN_TTL_MS,
    };
    // Write back onto sharedState so the gate can read it on subsequent actions.
    (state as { desktopActivePlan?: ActivePlan | null }).desktopActivePlan = plan;

    return {
      success: true,
      output:
        `Plan approved — reversible follow-up actions will run without extra prompts. ` +
        `Steps:\n${steps.map((s, i) => `  ${i + 1}. ${s.description}`).join('\n')}\n\n` +
        `Irreversible actions (Send / Pay / Delete / destructive combos) will still ask for fresh approval. ` +
        `Plan expires in ${Math.round(PLAN_TTL_MS / 60000)} minutes.`,
      metadata: { planId: plan.id, stepCount: steps.length },
    };
  }
}
