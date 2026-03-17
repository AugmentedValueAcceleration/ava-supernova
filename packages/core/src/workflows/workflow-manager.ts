/**
 * Workflow Manager — Autonomous multi-step execution engine.
 *
 * Breaks complex requests into a dependency graph of steps,
 * executes them in order (respecting dependencies), and handles
 * retries and error recovery.
 *
 * Each step is a scoped agent run — the agent receives the step's
 * instruction plus context from completed dependencies.
 */

import { randomUUID } from 'node:crypto';
import type { Agent } from '../agent/agent.js';
import type { Conversation } from '../agent/conversation.js';
import { getTextContent } from '../core/types.js';
import { logger } from '../core/logger.js';
import type {
  Workflow,
  WorkflowStep,
  WorkflowEvent,
  WorkflowEventHandler,
} from './types.js';

/** Options for creating a workflow from a plan. */
export interface WorkflowPlan {
  title: string;
  originalRequest: string;
  steps: Array<{
    title: string;
    instruction: string;
    dependsOn?: string[];
  }>;
}

export class WorkflowManager {
  private workflows = new Map<string, Workflow>();
  private handlers: WorkflowEventHandler[] = [];

  /** Register an event handler. */
  on(handler: WorkflowEventHandler): void {
    this.handlers.push(handler);
  }

  /** Remove an event handler. */
  off(handler: WorkflowEventHandler): void {
    this.handlers = this.handlers.filter(h => h !== handler);
  }

  /** Create a workflow from a plan. Returns the workflow ID. */
  create(plan: WorkflowPlan): Workflow {
    const workflowId = randomUUID();

    const steps: WorkflowStep[] = plan.steps.map((s, i) => ({
      id: `step-${i + 1}`,
      title: s.title,
      instruction: s.instruction,
      dependsOn: s.dependsOn ?? (i > 0 ? [`step-${i}`] : []),
      status: 'pending',
      retries: 0,
      maxRetries: 2,
    }));

    const workflow: Workflow = {
      id: workflowId,
      title: plan.title,
      originalRequest: plan.originalRequest,
      steps,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    this.workflows.set(workflowId, workflow);
    return workflow;
  }

  /** Get a workflow by ID. */
  get(workflowId: string): Workflow | undefined {
    return this.workflows.get(workflowId);
  }

  /** List all workflows. */
  list(): Workflow[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Execute a workflow — runs steps in dependency order.
   *
   * Each step creates a fresh conversation with context from its
   * dependencies injected as system context.
   */
  async execute(
    workflowId: string,
    agent: Agent,
    conversationFactory: () => Conversation,
    signal?: AbortSignal,
  ): Promise<Workflow> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);

    workflow.status = 'running';
    this.emit({
      type: 'workflow_start',
      workflowId,
      title: workflow.title,
      totalSteps: workflow.steps.length,
    });

    try {
      // Execute steps respecting dependencies
      while (this.hasRunnableSteps(workflow)) {
        if (signal?.aborted) {
          workflow.status = 'paused';
          this.emit({
            type: 'workflow_paused',
            workflowId,
            title: workflow.title,
            reason: 'Cancelled by user',
          });
          return workflow;
        }

        const runnable = this.getRunnableSteps(workflow);

        // Execute runnable steps (could be parallel if no shared deps)
        // For safety, we run sequentially for now
        for (const step of runnable) {
          if (signal?.aborted) break;
          await this.executeStep(workflow, step, agent, conversationFactory);
        }
      }

      // Check final status
      const failedSteps = workflow.steps.filter(s => s.status === 'failed');
      if (failedSteps.length > 0) {
        workflow.status = 'failed';
        workflow.completedAt = new Date().toISOString();
        this.emit({
          type: 'workflow_failed',
          workflowId,
          title: workflow.title,
          failedStep: failedSteps[0].title,
          error: failedSteps[0].error || 'Unknown error',
        });
      } else {
        const completedSteps = workflow.steps.filter(s => s.status === 'completed').length;
        workflow.status = 'completed';
        workflow.completedAt = new Date().toISOString();
        this.emit({
          type: 'workflow_complete',
          workflowId,
          title: workflow.title,
          completedSteps,
          totalSteps: workflow.steps.length,
        });
      }
    } catch (err) {
      workflow.status = 'failed';
      workflow.completedAt = new Date().toISOString();
      logger.error(`[workflow] Workflow ${workflowId} failed: ${err}`);
    }

    return workflow;
  }

  /** Pause a running workflow. */
  pause(workflowId: string): void {
    const workflow = this.workflows.get(workflowId);
    if (workflow && workflow.status === 'running') {
      workflow.status = 'paused';
      this.emit({
        type: 'workflow_paused',
        workflowId,
        title: workflow.title,
        reason: 'Paused by user',
      });
    }
  }

  // ── Step Execution ──────────────────────────────────────────────────────────

  private async executeStep(
    workflow: Workflow,
    step: WorkflowStep,
    agent: Agent,
    conversationFactory: () => Conversation,
  ): Promise<void> {
    const stepIndex = workflow.steps.indexOf(step) + 1;
    step.status = 'running';
    step.startedAt = new Date().toISOString();

    this.emit({
      type: 'step_start',
      workflowId: workflow.id,
      stepId: step.id,
      title: step.title,
      stepNumber: stepIndex,
      totalSteps: workflow.steps.length,
    });

    // Build context from completed dependencies
    const depContext = this.buildDependencyContext(workflow, step);

    // Create scoped conversation for this step
    const conversation = conversationFactory();
    const instruction = depContext
      ? `${step.instruction}\n\n## Context from previous steps:\n${depContext}`
      : step.instruction;

    conversation.addUserMessage(instruction);

    try {
      // Run the agent for this step
      const messages = await agent.run(
        conversation.getMessages(),
        (event) => {
          // Forward stream content as step progress
          if (event.type === 'stream_delta') {
            this.emit({
              type: 'step_progress',
              workflowId: workflow.id,
              stepId: step.id,
              content: event.content,
            });
          }
        },
      );

      // Extract the final assistant response
      const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
      const output = lastAssistant ? getTextContent(lastAssistant.content) : '';

      step.status = 'completed';
      step.output = output;
      step.completedAt = new Date().toISOString();

      this.emit({
        type: 'step_complete',
        workflowId: workflow.id,
        stepId: step.id,
        title: step.title,
        output: output.slice(0, 500),
      });

      logger.debug(`[workflow] Step "${step.title}" completed`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      if (step.retries < step.maxRetries) {
        // Retry
        step.retries++;
        step.status = 'pending';
        logger.warn(`[workflow] Step "${step.title}" failed, retry ${step.retries}/${step.maxRetries}: ${errorMsg}`);

        this.emit({
          type: 'step_retry',
          workflowId: workflow.id,
          stepId: step.id,
          title: step.title,
          attempt: step.retries,
        });
      } else {
        // Exhausted retries — mark failed
        step.status = 'failed';
        step.error = errorMsg;
        step.completedAt = new Date().toISOString();

        // Skip dependent steps
        this.skipDependents(workflow, step.id);

        this.emit({
          type: 'step_failed',
          workflowId: workflow.id,
          stepId: step.id,
          title: step.title,
          error: errorMsg,
          willRetry: false,
        });

        logger.error(`[workflow] Step "${step.title}" failed after ${step.maxRetries} retries: ${errorMsg}`);
      }
    }
  }

  // ── Dependency Resolution ───────────────────────────────────────────────────

  private hasRunnableSteps(workflow: Workflow): boolean {
    return workflow.steps.some(s =>
      s.status === 'pending' && this.depsComplete(workflow, s)
    );
  }

  private getRunnableSteps(workflow: Workflow): WorkflowStep[] {
    return workflow.steps.filter(s =>
      s.status === 'pending' && this.depsComplete(workflow, s)
    );
  }

  private depsComplete(workflow: Workflow, step: WorkflowStep): boolean {
    return step.dependsOn.every(depId => {
      const dep = workflow.steps.find(s => s.id === depId);
      return dep && (dep.status === 'completed' || dep.status === 'skipped');
    });
  }

  private buildDependencyContext(workflow: Workflow, step: WorkflowStep): string {
    const parts: string[] = [];

    for (const depId of step.dependsOn) {
      const dep = workflow.steps.find(s => s.id === depId);
      if (dep?.output) {
        parts.push(`### ${dep.title}\n${dep.output.slice(0, 1000)}`);
      }
    }

    return parts.join('\n\n');
  }

  private skipDependents(workflow: Workflow, failedStepId: string): void {
    for (const step of workflow.steps) {
      if (step.dependsOn.includes(failedStepId) && step.status === 'pending') {
        step.status = 'skipped';
        step.error = `Skipped: dependency "${failedStepId}" failed`;
        // Recursively skip dependents of this step too
        this.skipDependents(workflow, step.id);
      }
    }
  }

  // ── Event Emission ──────────────────────────────────────────────────────────

  private emit(event: WorkflowEvent): void {
    for (const handler of this.handlers) {
      try { handler(event); } catch { /* non-fatal */ }
    }
  }
}
