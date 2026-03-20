// ─── Persona System Types ──────────────────────────────────────────────────
// Personas are specialized expressions of Ava's intelligence.
// Not separate agents — focused mindsets with scoped tool access.

export type PersonaId = 'researcher' | 'architect' | 'builder' | 'recon' | 'scout' | 'verifier' | 'sequencer' | 'challenger' | 'tutor' | 'quiz_master' | 'content_writer' | 'explorer' | 'ideator' | 'refiner' | 'curriculum_architect' | 'fact_checker' | 'scanner' | 'tester' | 'code-reviewer' | 'design-reviewer';

export type PersonaPhase = 'idle' | 'active' | 'complete' | 'error';

export interface PersonaDefinition {
  readonly id: PersonaId;
  readonly name: string;
  readonly description: string;
  /** System prompt fragment injected when this persona is active */
  readonly prompt: string;
  /** Tool names this persona is allowed to use */
  readonly allowedTools: string[];
  /** Tool names this persona is explicitly denied (overrides allowed) */
  readonly deniedTools?: string[];
  /** Priority order — lower runs first when multiple personas activate */
  readonly priority: number;
  /** Persona IDs that must complete before this one starts (for parallel execution). */
  readonly dependsOn?: PersonaId[];
}

export interface PersonaState {
  id: PersonaId;
  phase: PersonaPhase;
  /** What this persona found/decided during its turn */
  output: string | null;
  /** Tool calls this persona made */
  toolCalls: Array<{ tool: string; args: Record<string, unknown>; result: string }>;
  /** Timestamp when this persona started */
  startedAt: number | null;
  /** Timestamp when this persona completed */
  completedAt: number | null;
}

/** Shared context that all personas read from and write to */
export interface ContextPool {
  /** The original user request */
  userRequest: string;
  /** Codebase findings from Scout/Researcher */
  findings: string[];
  /** Architecture decisions from Architect */
  decisions: string[];
  /** Verification results from Verifier */
  verifications: string[];
  /** Task sequence from Sequencer */
  taskSequence: string[];
  /** Challenges raised by Challenger */
  challenges: string[];
  /** Memories recalled relevant to this task */
  memories: string[];
  /** Arbitrary key-value data shared between personas */
  shared: Record<string, unknown>;
}

/** Event emitted during persona orchestration */
export type ConductorEvent =
  | { type: 'persona_start'; persona: PersonaId; description: string }
  | { type: 'persona_thinking'; persona: PersonaId; content: string }
  | { type: 'persona_tool_call'; persona: PersonaId; tool: string; args: Record<string, unknown> }
  | { type: 'persona_tool_result'; persona: PersonaId; tool: string; result: string; success: boolean }
  | { type: 'persona_complete'; persona: PersonaId; output: string }
  | { type: 'persona_error'; persona: PersonaId; error: string }
  | { type: 'synthesis_start' }
  | { type: 'synthesis_complete'; output: string }
  | { type: 'conductor_done'; totalPersonas: number; totalTime: number };

export type ConductorEventHandler = (event: ConductorEvent) => void;

/** Configuration for how the Conductor orchestrates */
export interface ConductorConfig {
  /** Max personas to run per task (default 6) */
  maxPersonas?: number;
  /** Max time per persona in ms (default 30000) */
  personaTimeout?: number;
  /** Whether to allow parallel persona execution (default false — set true for wave-based parallel) */
  parallel?: boolean;
  /** Maximum concurrent personas when parallel=true (default 3) */
  maxParallel?: number;
  /** Whether the Challenger can veto the plan (default true) */
  challengerCanVeto?: boolean;
}
