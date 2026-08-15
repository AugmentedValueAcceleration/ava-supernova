import type { Provider } from '../providers/types.js';
import type { ModelDefinition } from '../core/types.js';
import type { ProviderRegistry } from '../providers/provider-registry.js';
import { logger } from '../core/logger.js';
import { avaEvents } from '../dataset/emitter.js';
import { chargeCredits, extractUsage } from '../billing/meter.js';

/**
 * Flash-based intent gate.
 *
 * Runs upstream of the persona spawn decision. Decides whether the
 * coordinator (Ava / Qwen 3.7 Plus) can handle the prompt directly with
 * its own tools, or whether the task genuinely warrants the specialist
 * team (Architect / Scout / Challenger / etc.).
 *
 * Most prompts do NOT need the team. "Write a function that does X",
 * "explain this file", "rename this variable", "what does this error
 * mean" — all handled directly by the coordinator at 1/10th the cost
 * of a full persona chain.
 *
 * Cost: ~200 input + ~30 output tokens on Qwen 3.5 Flash per call.
 * Cheap enough to run on every prompt, and saves 10K–20K tokens per
 * prompt when it correctly skips orchestration.
 *
 * Failure mode: if Flash is unavailable / errors / times out, the gate
 * returns null and the caller falls back to the regex-based
 * Conductor.needsOrchestration. Never blocks a user request on its own
 * failure.
 */

export interface IntentGateDecision {
  needsTeam: boolean;
  reasoning: string;
}

/**
 * Teach-mode depth classification. Returned by `classifyTeachDepth`.
 *
 * - `full` — the user is asking to create a new curriculum / start learning
 *   a topic from scratch. Run the full Curriculum Architect → Content
 *   Writer → Fact Checker → Quiz Master → Tutor pipeline.
 * - `light` — the user is continuing within an existing curriculum
 *   ("continue", "another example", "I'm stuck"). Tutor alone is enough;
 *   re-running the architectural team for delivery turns wastes ~5× tokens.
 */
export type TeachDepth = 'full' | 'light';

export interface TeachDepthDecision {
  depth: TeachDepth;
  reasoning: string;
}

/**
 * Resolve a cheap fast model for intent gating. Prefers Qwen 3.5 Flash;
 * falls back to anything cheap + fast if that's unavailable. Returns
 * null if nothing viable exists — callers then skip the gate entirely.
 */
export function resolveIntentGateModel(
  providerRegistry: ProviderRegistry,
  availableProviders: Set<string>,
  hasPlatform: boolean,
): { provider: Provider; model: ModelDefinition } | null {
  // Platform priority — Qwen Flash family first
  if (hasPlatform) {
    for (const id of ['qwen3.5-flash', 'qwen-flash']) {
      const resolved = providerRegistry.resolveModel(`platform:${id}`);
      if (resolved) return { provider: resolved.provider, model: resolved.model };
    }
  }

  // BYOK — any small/fast model will do the classification.
  // V4 Flash replaces `deepseek-chat` (retired upstream 2026-07-24) and is the
  // cheaper of the two V4 tiers, which is what this gate wants.
  const fallbacks = [
    'qwen3.5-flash',
    'deepseek-v4-flash',
  ];
  for (const id of fallbacks) {
    const direct = providerRegistry.resolveModel(id);
    if (direct) return { provider: direct.provider, model: direct.model };
    for (const provName of availableProviders) {
      if (provName === 'platform') continue;
      const qualified = providerRegistry.resolveModel(`${provName}:${id}`);
      if (qualified) return { provider: qualified.provider, model: qualified.model };
    }
  }

  return null;
}

const SYSTEM_PROMPT = `You are the routing classifier for Ava, an agentic coding assistant.

For every user prompt, decide whether Ava (the coordinator) can handle it directly with her own tools (file read/write, shell, search, git, etc.), or whether the task genuinely needs her specialist team (Architect, Scout, Challenger, Verifier, Researcher, etc.) to plan and verify before acting.

**DIRECT** (team NOT needed) — the vast majority of prompts:
- Questions: "what does this code do?", "explain this function", "why is this broken?"
- Single-file edits: "rename this variable", "fix this bug", "add a loading state"
- Quick tasks: "run the tests", "commit this", "check git status"
- Look-ups: "find all uses of X", "show me the schema", "what's in this folder?"
- Small features where the approach is obvious

**TEAM** (needed) — only when genuinely warranted:
- Multi-file architectural changes ("refactor auth across the whole app")
- Explicit review / audit requests ("full security audit", "architectural review")
- Non-trivial system design ("design the event bus", "plan the migration strategy")
- Complex debugging across unknown code ("trace why this happens in prod")
- Teach-mode curriculum requests (always team)

Bias HEAVILY toward DIRECT. The team is expensive and slow. Only engage it when the user has signalled depth or the task is genuinely large.

Respond with a single JSON object, no prose outside it:
{"needs_team": true|false, "reasoning": "<one short sentence>"}`;

/**
 * Classify a user prompt. Returns null on any failure — callers then
 * fall back to the regex-based Conductor gate.
 */
export async function classifyIntent(opts: {
  userMessage: string;
  mode: string;
  provider: Provider;
  model: ModelDefinition;
  signal?: AbortSignal;
}): Promise<IntentGateDecision | null> {
  const { userMessage, mode, provider, model, signal } = opts;

  // Hard rules that don't need Flash
  if (mode === 'chat') return { needsTeam: false, reasoning: 'Chat mode — no orchestration by design' };
  if (mode === 'teach') return { needsTeam: true, reasoning: 'Teach mode — curriculum always uses the team' };

  const promptForFlash = `Mode: ${mode}\nUser message: ${userMessage.slice(0, 2000)}`;

  try {
    const response = await provider.createCompletion(
      {
        model: model.id,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: promptForFlash },
        ],
        temperature: 0,
        max_tokens: 120,
        // No reasoning pass. This is a classifier: it returns a label, and the
        // thinking that precedes it is pure latency in front of the real work.
        // Measured on these exact parameters — 601 output tokens with it on,
        // 9 with it off, identical answer. max_tokens does NOT contain it;
        // the cap is 120 and the reasoning pass ignores it.
        enable_thinking: false,
      },
      signal,
    );

    // Meter the call — we burned Flash tokens regardless of whether the
    // response is parseable downstream. Fire-and-forget event.
    chargeCredits('light_call', {
      model: model.id,
      rawTokens: extractUsage((response as { usage?: unknown }).usage as Parameters<typeof extractUsage>[0]),
    });

    const assistantMsg = response.choices?.[0]?.message;
    if (!assistantMsg) {
      logger.warn('[intent-gate] Flash returned no choices');
      return null;
    }

    const content = assistantMsg.content as unknown;
    const text = typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content.map((p) => (p && typeof p === 'object' && 'text' in p ? (p as { text: string }).text : '')).join('')
        : '';

    // Extract the JSON object — Flash sometimes wraps in ```json fences
    const jsonMatch = text.match(/\{[\s\S]*?"needs_team"[\s\S]*?\}/);
    if (!jsonMatch) {
      logger.warn('[intent-gate] Flash response did not contain valid JSON: ' + text.slice(0, 200));
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as { needs_team?: boolean; reasoning?: string };
    if (typeof parsed.needs_team !== 'boolean') {
      logger.warn('[intent-gate] Flash response missing needs_team boolean');
      return null;
    }

    const decision: IntentGateDecision = {
      needsTeam: parsed.needs_team,
      reasoning: parsed.reasoning || '',
    };

    avaEvents.emit('routing_decision', {
      classification: 'intent_gate',
      chosen_model: decision.needsTeam ? 'team' : 'coordinator_direct',
      reason: decision.reasoning,
    });

    return decision;
  } catch (err) {
    logger.warn('[intent-gate] Flash classification failed: ' + (err instanceof Error ? err.message : String(err)));
    return null;
  }
}

const TEACH_DEPTH_SYSTEM_PROMPT = `You are classifying a user message in Ava's Teach mode.

Decide: does this message ask to CREATE a new learning curriculum, or is it CONTINUATION inside an existing one?

CREATION → "creation":
- "teach me X" / "show me how to learn Y" / "tutor me on Z"
- "I want / need / would like to learn / study / understand X"
- "I'd like to start learning X" / "I'm trying to pick up X" / "I want to get into X"
- "create / build / make / design / generate a curriculum / course / learning path / lesson plan / syllabus"
- "where do I start with X" / "help me understand X from scratch"
- Anything that asks for a structured learning path on a topic Ava hasn't already started

CONTINUATION → "continuation":
- "continue" / "next lesson" / "next" / "go on"
- "another example" / "show me more" / "explain again"
- "I'm stuck" / "I don't get it" / "what does this mean"
- "let's do the quiz" / "what was wrong with my answer" / "try a harder one"
- Follow-up questions inside an active lesson
- Short / ambiguous messages that look like in-flow chatter

Bias toward CONTINUATION for short or ambiguous messages — the Tutor can always ask the user to clarify, but spawning the full team for "another example" wastes ~5× the tokens.

Respond with a single JSON object, no prose outside it:
{"depth": "creation" | "continuation", "reasoning": "<one short sentence>"}`;

/**
 * Classify a Teach-mode user message as curriculum-creation vs delivery
 * continuation. Replaces the regex-based heuristic in
 * `detectConductorDepth` for Teach mode — natural phrasings like "I'd
 * like to learn Rust" or "help me understand React from scratch" don't
 * fit a fixed regex but a Flash classifier handles them cleanly.
 *
 * Returns null on failure — caller falls back to the regex-based
 * `detectConductorDepth` so a Flash outage never blocks Teach mode.
 *
 * Cost: same Flash call shape as `classifyIntent` — ~200 input + ~30
 * output tokens. For Teach mode this REPLACES the intent-gate's hard
 * early-return, so there's no net extra Flash call per turn.
 */
export async function classifyTeachDepth(opts: {
  userMessage: string;
  provider: Provider;
  model: ModelDefinition;
  signal?: AbortSignal;
}): Promise<TeachDepthDecision | null> {
  const { userMessage, provider, model, signal } = opts;

  try {
    const response = await provider.createCompletion(
      {
        model: model.id,
        messages: [
          { role: 'system', content: TEACH_DEPTH_SYSTEM_PROMPT },
          { role: 'user', content: userMessage.slice(0, 2000) },
        ],
        temperature: 0,
        max_tokens: 120,
        // No reasoning pass. This is a classifier: it returns a label, and the
        // thinking that precedes it is pure latency in front of the real work.
        // Measured on these exact parameters — 601 output tokens with it on,
        // 9 with it off, identical answer. max_tokens does NOT contain it;
        // the cap is 120 and the reasoning pass ignores it.
        enable_thinking: false,
      },
      signal,
    );

    chargeCredits('light_call', {
      model: model.id,
      rawTokens: extractUsage((response as { usage?: unknown }).usage as Parameters<typeof extractUsage>[0]),
    });

    const assistantMsg = response.choices?.[0]?.message;
    if (!assistantMsg) {
      logger.warn('[intent-gate] Teach depth Flash returned no choices');
      return null;
    }

    const content = assistantMsg.content as unknown;
    const text = typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content.map((p) => (p && typeof p === 'object' && 'text' in p ? (p as { text: string }).text : '')).join('')
        : '';

    const jsonMatch = text.match(/\{[\s\S]*?"depth"[\s\S]*?\}/);
    if (!jsonMatch) {
      logger.warn('[intent-gate] Teach depth Flash response did not contain valid JSON: ' + text.slice(0, 200));
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as { depth?: string; reasoning?: string };
    if (parsed.depth !== 'creation' && parsed.depth !== 'continuation') {
      logger.warn('[intent-gate] Teach depth Flash returned invalid depth: ' + String(parsed.depth));
      return null;
    }

    const decision: TeachDepthDecision = {
      depth: parsed.depth === 'creation' ? 'full' : 'light',
      reasoning: parsed.reasoning || '',
    };

    avaEvents.emit('routing_decision', {
      classification: 'teach_depth',
      chosen_model: decision.depth === 'full' ? 'teach_full_team' : 'teach_tutor_only',
      reason: decision.reasoning,
    });

    return decision;
  } catch (err) {
    logger.warn('[intent-gate] Teach depth Flash classification failed: ' + (err instanceof Error ? err.message : String(err)));
    return null;
  }
}
