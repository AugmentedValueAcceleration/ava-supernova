// Structured data flowing between personas. Each persona consumes an upstream
// schema and emits the next one. Kept narrow and typed so parse failures are
// obvious and fixable rather than silent drift.

export type RiskClass =
  | 'observational'
  | 'navigational'
  | 'mutative-reversible'
  | 'mutative-irreversible'
  | 'privileged';

/** Grounding source — tells Planner where the data came from so it can weigh reliability. */
export type GroundingSource = 'uia' | 'playwright' | 'omni' | 'mock';

/** One interactable or informative element on screen. */
export interface ScreenElement {
  id: string;              // stable within this ScreenState
  kind: string;            // 'button', 'textbox', 'link', 'menu', …
  name: string;            // AutomationName / accessible name / OmniParser caption
  role?: string;           // ARIA / UIA role where available
  bbox?: { x: number; y: number; w: number; h: number }; // pixel coords if vision-sourced
  selector?: string;       // Playwright selector if browser-sourced
  sensitive?: boolean;     // masked input, password field, etc.
  source: GroundingSource;
}

/** Scout's output: everything visible on screen right now. */
export interface ScreenState {
  step: number;
  app: string;             // active app / window title / browser URL
  url?: string;            // set when app is a browser
  elements: ScreenElement[];
  viewport: { w: number; h: number };
  groundingSource: GroundingSource; // primary source for this state
  confidence: 'high' | 'medium' | 'low'; // Scout's own read on reliability
  notes?: string;          // anything Scout wants to flag (sensitive region, partial tree, …)
}

/** Planner's output: one proposed next action. */
export interface ProposedAction {
  kind:
    | 'click'
    | 'double_click'
    | 'right_click'
    | 'type'
    | 'key'
    | 'scroll'
    | 'navigate'
    | 'wait'
    | 'observe_more'
    | 'stuck'
    | 'done';
  target?: string;         // element id from ScreenState, or a selector
  params?: Record<string, unknown>;
  riskClass: RiskClass;
  reasoning: string;
  expectedPostState: string; // natural-language prediction Verifier will check
}

/** Actor's output: what happened when the action was attempted. */
export interface ExecutionResult {
  ok: boolean;
  error?: string;
  latencyMs: number;
  side_effects?: string[]; // logged observations, not authoritative
}

/** Verifier's output: was the expected post-state observed? */
export interface VerificationResult {
  status: 'verified' | 'deviated' | 'rollback_needed';
  detail: string;
  deviation?: string;      // populated when status is 'deviated'
}

/** Narrator's output: user-facing line + structured audit entry. */
export interface UserUpdate {
  line: string;            // one-liner shown in the chat
  audit: {
    step: number;
    action: ProposedAction;
    result: ExecutionResult;
    verification: VerificationResult;
    timestamp: string;
  };
}

/** Everything we care about for a single step. */
export interface StepRecord {
  step: number;
  screenState: ScreenState;
  proposedAction: ProposedAction;
  executionResult: ExecutionResult;
  verificationResult: VerificationResult;
  userUpdate: UserUpdate;
  tokenUsage: Record<PersonaName, TokenUsage>;
  wallTimeMs: number;
}

/** Token usage for a single persona call. */
export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

/**
 * Minimal provider interface — the harness implements this against whatever
 * @ava/core provider the user configured. Keeps orchestrator independent of
 * the concrete provider API so we can swap in mocks for unit tests.
 */
export interface PersonaProvider {
  chat(args: {
    systemPrompt: string;
    userContent: string;
    responseFormat: 'json' | 'text';
  }): Promise<{ content: string; usage: TokenUsage; latencyMs: number }>;
}

export type PersonaName = 'scout' | 'planner' | 'actor' | 'verifier' | 'narrator';

export const PERSONA_NAMES: PersonaName[] = ['scout', 'planner', 'actor', 'verifier', 'narrator'];
