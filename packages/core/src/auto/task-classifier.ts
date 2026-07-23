import type { ContentPart } from '../core/types.js';
import type { ClassificationResult } from './types.js';

// ─── Model name patterns for user inline overrides ───────────────────────────

const MODEL_ALIASES: Record<string, string> = {
  // Kimi / Moonshot — bare 'kimi' / 'moonshot' route to the current flagship
  // K3. 'k2' stays on the K2 line (K2.7 Code, the value agentic coder); the
  // 'k2.7'/'k2.6'/'k2.5' aliases pin the older models explicitly.
  'kimi': 'kimi-k3',
  'k3': 'kimi-k3',
  'k2': 'kimi-k2.7-code',
  'k2.7': 'kimi-k2.7-code',
  'k2.6': 'kimi-k2.6',
  'k2.5': 'kimi-k2.5',
  'moonshot': 'kimi-k3',
  // MiniMax (BYOK chat, M3 only) — bare 'minimax'/'m3' route to M3.
  'minimax': 'MiniMax-M3',
  'm3': 'MiniMax-M3',
  // Qwen
  'qwen': 'qwen3.7-plus',
  'qwen flash': 'qwen3.5-flash',
  'qwen omni flash': 'qwen3.5-omni-flash',
  // Bare 'qwen plus' = the current Plus flagship (3.5 Plus retired from
  // primary routes — operator, 2026-07-04).
  'qwen plus': 'qwen3.7-plus',
  // DeepSeek — bare 'deepseek' routes to the current frontier V4 Pro. The old
  // `deepseek-chat`/`deepseek-reasoner` ids retire upstream on 2026-07-24.
  'deepseek': 'deepseek-v4-pro',
  'deepseek pro': 'deepseek-v4-pro',
  'deepseek flash': 'deepseek-v4-flash',
  // Claude — bare 'opus' routes to current flagship 4.8. Latest-only: superseded
  // Opus versions are not offered, so no 4.7/4.6 aliases.
  'claude': 'claude-sonnet-5',
  'fable': 'claude-fable-5',
  'fable 5': 'claude-fable-5',
  'opus': 'claude-opus-4-8',
  'opus 4.8': 'claude-opus-4-8',
  'sonnet': 'claude-sonnet-5',
  'haiku': 'claude-haiku-4-5-20251001',
  // Mistral — "use mistral" should give the flagship: Medium 3.5 is the
  // current frontier model (Index 39), above Large 3 (23).
  'mistral': 'mistral-medium-3.5',
};

// Build regex pattern from all aliases: @kimi, use kimi, with kimi, etc.
const aliasKeys = Object.keys(MODEL_ALIASES).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const MODEL_OVERRIDE_PATTERN = new RegExp(
  `(?:@|\\buse\\s+|\\bwith\\s+|\\bask\\s+|\\bon\\s+)(${aliasKeys.join('|')})\\b`,
  'i',
);

// ─── Image generation patterns ───────────────────────────────────────────────

const IMAGE_GEN_PATTERN = /\b(?:generate|create|make|draw|design)\s+(?:an?\s+)?(?:image|picture|icon|logo|banner|illustration|avatar|thumbnail|graphic|artwork)\b/i;

// ─── Simple chat / greeting patterns ─────────────────────────────────────────

const GREETING_PATTERN = /^(?:hi|hello|hey|thanks|thank you|good morning|good evening|good night|good afternoon|how are you|what's up|whats up|sup|yo|gm|gn|cheers|ta|ok|okay|sure|got it|perfect|great|nice|cool|awesome|brilliant|👋|🙏)[\s!?.]*$/i;

const AVA_SELF_PATTERN = /\b(?:what can you do|who are you|what are you|what model|help me|your name)\b/i;

// ─── Computer use patterns ──────────────────────────────────────────────────

// COMPUTER_USE_PATTERN retired — Holo3 vision-action integration was
// pulled and the `computer_use` task category no longer exists. Desktop
// automation now goes through the explicit `desktop_*` tool family,
// which doesn't need a classifier-detected intent — the agent decides
// to call those tools directly.

// ─── Planning patterns (mirrors conductor's needsOrchestration) ──────────────

const PLANNING_PATTERN = /\b(?:plan|design|architect|strategy|proposal|approach|roadmap|blueprint|outline the|break down|think through)\b/i;

// Review/audit tasks read many files — need large context model, not planning model
const REVIEW_PATTERN = /\b(?:review|audit|scan|analyze|check|inspect|assess|evaluate)\s+(?:the\s+)?(?:project|code|codebase|files|repo|repository|folder|directory)\b/i;

/**
 * Classify a user message into a TaskCategory.
 *
 * Pure function — no async, no API calls. Runs in <1ms.
 * Checks in priority order: user override → vision → image_gen → mode → chat → long_context → planning → coding.
 */
export function classifyTask(
  userMessage: string | ContentPart[],
  mode: string,
  conversationTokenCount: number,
): ClassificationResult {
  const text = typeof userMessage === 'string'
    ? userMessage
    : userMessage.filter(p => p.type === 'text').map(p => (p as { text: string }).text).join(' ');

  const hasImages = typeof userMessage !== 'string'
    && userMessage.some(p => p.type === 'image_url');

  // 1. User model override — highest priority
  const overrideMatch = text.match(MODEL_OVERRIDE_PATTERN);
  if (overrideMatch) {
    const alias = overrideMatch[1].toLowerCase();
    const modelId = MODEL_ALIASES[alias];
    if (modelId) {
      return {
        category: hasImages ? 'vision' : 'coding',
        modelOverride: modelId,
        reason: `User requested ${alias} → ${modelId}`,
      };
    }
  }

  // 2. Vision — images attached
  if (hasImages) {
    return { category: 'vision', reason: 'Image content detected in message' };
  }

  // 3. Image generation — explicit request to create visual content
  if (IMAGE_GEN_PATTERN.test(text)) {
    return { category: 'image_gen', reason: 'Image generation request detected' };
  }

  // 4. Mode override — security, brainstorm, teach, plan modes force their category
  if (mode === 'security') return { category: 'security', reason: 'Security mode active' };
  if (mode === 'brainstorm') return { category: 'brainstorm', reason: 'Brainstorm mode active' };
  if (mode === 'teach') return { category: 'teach', reason: 'Teach mode active' };
  if (mode === 'plan') return { category: 'planning', reason: 'Plan mode active' };

  // 5. Simple chat — greetings, acknowledgments, questions about Ava
  if (mode === 'chat') {
    return { category: 'chat', reason: 'Chat mode active' };
  }
  if (GREETING_PATTERN.test(text)) {
    return { category: 'chat', reason: 'Greeting or acknowledgment detected' };
  }
  if (AVA_SELF_PATTERN.test(text) && text.length < 100) {
    return { category: 'chat', reason: 'Question about Ava detected' };
  }

  // 6. Review/audit tasks — read many files, need large context
  if (REVIEW_PATTERN.test(text)) {
    return { category: 'long_context', reason: 'Project review/audit — routing to large context model' };
  }

  // 7. Long context — conversation is getting large
  if (conversationTokenCount > 150_000) {
    return { category: 'long_context', reason: `Conversation at ${conversationTokenCount} tokens, routing to large context model` };
  }

  // 8. Planning — explicit planning language
  if (PLANNING_PATTERN.test(text)) {
    return { category: 'planning', reason: 'Planning language detected' };
  }

  // 9. Default — coding (work mode default)
  return { category: 'coding', reason: 'Default coding task in work mode' };
}
