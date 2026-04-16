// Wave orchestrator. For each step, runs the five personas in sequence,
// feeding structured outputs downstream. Collects token usage per persona
// so the harness can print cost measurements at the end.

import { PERSONAS } from './personas';
import { groundingForStep } from './mock-grounding';
import { executeAction } from './mock-executor';
import type {
  StepRecord,
  PersonaName,
  PersonaProvider,
  ScreenState,
  ProposedAction,
  ExecutionResult,
  VerificationResult,
  UserUpdate,
  TokenUsage,
} from './types';

/** Run a single step — all five personas, one after the other. */
export async function runStep(
  provider: PersonaProvider,
  userTask: string,
  trajectorySoFar: StepRecord[],
  stepNumber: number,
): Promise<StepRecord> {
  const stepStart = Date.now();
  const tokenUsage: Record<PersonaName, TokenUsage> = {
    scout: emptyUsage(),
    planner: emptyUsage(),
    actor: emptyUsage(),
    verifier: emptyUsage(),
    narrator: emptyUsage(),
  };

  // ── Scout ────────────────────────────────────────────────────────────
  const rawGrounding = groundingForStep(stepNumber);
  const scoutInput =
    `User task: ${userTask}\n\n` +
    `Trajectory so far (${trajectorySoFar.length} step(s)):\n${summariseTrajectory(trajectorySoFar)}\n\n` +
    `Raw grounding blob for this step:\n${JSON.stringify(rawGrounding, null, 2)}\n\n` +
    `Output a ScreenState JSON object. Do not repeat the grounding blob verbatim — summarise faithfully.`;

  const scoutResp = await provider.chat({
    systemPrompt: PERSONAS.scout.systemPrompt,
    userContent: scoutInput,
    responseFormat: 'json',
  });
  tokenUsage.scout = scoutResp.usage;
  const screenState = parseJson<ScreenState>(scoutResp.content, 'Scout');

  // ── Planner ──────────────────────────────────────────────────────────
  const plannerInput =
    `User task: ${userTask}\n\n` +
    `Trajectory so far (${trajectorySoFar.length} step(s)):\n${summariseTrajectory(trajectorySoFar)}\n\n` +
    `Current ScreenState:\n${JSON.stringify(screenState, null, 2)}\n\n` +
    `Output a ProposedAction JSON object.`;

  const plannerResp = await provider.chat({
    systemPrompt: PERSONAS.planner.systemPrompt,
    userContent: plannerInput,
    responseFormat: 'json',
  });
  tokenUsage.planner = plannerResp.usage;
  const proposedAction = parseJson<ProposedAction>(plannerResp.content, 'Planner');

  // ── Actor ────────────────────────────────────────────────────────────
  // Actor is tiny — in the real build it's deterministic code, not a model
  // call. For the prototype we still let it be a model call so we can
  // measure an upper bound. A later optimisation is to skip the model and
  // let a typed dispatcher do the work.
  const actorInput =
    `ProposedAction: ${JSON.stringify(proposedAction, null, 2)}\n\n` +
    `Current ScreenState (reference only, do not re-plan):\n${JSON.stringify(screenState, null, 2)}\n\n` +
    `Output an ExecutionResult JSON object. In this prototype the actual execution is mocked — populate latencyMs with 0 and describe the side effects you would expect.`;

  const actorResp = await provider.chat({
    systemPrompt: PERSONAS.actor.systemPrompt,
    userContent: actorInput,
    responseFormat: 'json',
  });
  tokenUsage.actor = actorResp.usage;

  // Even though Actor wrote an ExecutionResult, run the real mock executor
  // too — so we can compare the model's predicted side effects with the
  // deterministic mock's output later.
  const mockedExecution = executeAction(proposedAction, stepNumber);
  const executionResult: ExecutionResult = {
    ...parseJson<ExecutionResult>(actorResp.content, 'Actor'),
    latencyMs: mockedExecution.latencyMs,
  };

  // ── Verifier ─────────────────────────────────────────────────────────
  const nextState = groundingForStep(stepNumber + 1);
  const verifierInput =
    `ProposedAction: ${JSON.stringify(proposedAction, null, 2)}\n\n` +
    `ExecutionResult: ${JSON.stringify(executionResult, null, 2)}\n\n` +
    `Fresh ScreenState after the action ran:\n${JSON.stringify(nextState, null, 2)}\n\n` +
    `Output a VerificationResult JSON object.`;

  const verifierResp = await provider.chat({
    systemPrompt: PERSONAS.verifier.systemPrompt,
    userContent: verifierInput,
    responseFormat: 'json',
  });
  tokenUsage.verifier = verifierResp.usage;
  const verificationResult = parseJson<VerificationResult>(verifierResp.content, 'Verifier');

  // ── Narrator ─────────────────────────────────────────────────────────
  const narratorInput =
    `Step ${stepNumber}.\n\n` +
    `ScreenState before: ${JSON.stringify(screenState, null, 2)}\n\n` +
    `ProposedAction: ${JSON.stringify(proposedAction, null, 2)}\n\n` +
    `ExecutionResult: ${JSON.stringify(executionResult, null, 2)}\n\n` +
    `VerificationResult: ${JSON.stringify(verificationResult, null, 2)}\n\n` +
    `Output a UserUpdate JSON object. Set the audit timestamp to the current ISO time.`;

  const narratorResp = await provider.chat({
    systemPrompt: PERSONAS.narrator.systemPrompt,
    userContent: narratorInput,
    responseFormat: 'json',
  });
  tokenUsage.narrator = narratorResp.usage;
  const userUpdate = parseJson<UserUpdate>(narratorResp.content, 'Narrator');

  return {
    step: stepNumber,
    screenState,
    proposedAction,
    executionResult,
    verificationResult,
    userUpdate,
    tokenUsage,
    wallTimeMs: Date.now() - stepStart,
  };
}

/** Short human-readable digest of past steps — kept tight so we don't explode the prompt. */
function summariseTrajectory(records: StepRecord[]): string {
  if (records.length === 0) return '  (none — this is step 1)';
  return records
    .map(
      (r) =>
        `  [${r.step}] ${r.userUpdate.line}  ` +
        `(${r.proposedAction.kind}${r.proposedAction.target ? ' on ' + r.proposedAction.target : ''}, ` +
        `${r.verificationResult.status})`,
    )
    .join('\n');
}

function parseJson<T>(raw: string, who: string): T {
  // Strip fence markers the model sometimes wraps JSON in
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  }
  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    throw new Error(
      `${who} output did not parse as JSON.\n` +
        `Raw (first 400 chars): ${cleaned.slice(0, 400)}\n` +
        `Error: ${(err as Error).message}`,
    );
  }
}

function emptyUsage(): TokenUsage {
  return { input: 0, output: 0, total: 0 };
}
