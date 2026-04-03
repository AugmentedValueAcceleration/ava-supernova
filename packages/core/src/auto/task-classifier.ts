import type { ContentPart } from '../core/types.js';
import type { ClassificationResult } from './types.js';

// ─── Model name patterns for user inline overrides ───────────────────────────

const MODEL_ALIASES: Record<string, string> = {
  // Kimi / Moonshot
  'kimi': 'kimi-k2.5',
  'k2.5': 'kimi-k2.5',
  'moonshot': 'kimi-k2.5',
  // MiniMax
  'm2.7': 'MiniMax-M2.7',
  'm2.5': 'MiniMax-M2.5',
  'minimax': 'MiniMax-M2.7',
  // Qwen
  'qwen': 'qwen3-omni-flash',
  'qwen flash': 'qwen-flash',
  'qwen plus': 'qwen3.5-plus',
  // DeepSeek
  'deepseek': 'deepseek-chat',
  // Claude
  'claude': 'claude-sonnet-4-6',
  'opus': 'claude-opus-4-6',
  'sonnet': 'claude-sonnet-4-6',
  'haiku': 'claude-haiku-4-5-20251001',
  // Mistral
  'mistral': 'mistral-large-latest',
  'codestral': 'codestral-latest',
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

const COMPUTER_USE_PATTERN = /\b(?:click|type\s+(?:in|into|on)|scroll|open\s+(?:the\s+)?(?:app|application|blender|unreal|photoshop|notepad|browser|chrome|firefox|excel|word|powerpoint|terminal)|control\s+(?:the\s+)?(?:screen|desktop|mouse|keyboard)|automate\s+(?:the\s+)?desktop|use\s+(?:the\s+)?(?:mouse|keyboard)|drag\s+(?:and\s+)?drop|interact\s+with|move\s+(?:the\s+)?(?:mouse|cursor)|press\s+(?:the\s+)?(?:button|key)|right[\s-]?click|double[\s-]?click)\b/i;

// ─── Planning patterns (mirrors conductor's needsOrchestration) ──────────────

const PLANNING_PATTERN = /\b(?:plan|design|architect|review|strategy|proposal|approach|roadmap|blueprint|outline the|break down|think through)\b/i;

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

  // 3b. Computer use — desktop interaction requested
  if (COMPUTER_USE_PATTERN.test(text)) {
    return { category: 'computer_use', reason: 'Desktop interaction / computer use detected' };
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

  // 6. Long context — conversation is getting large
  if (conversationTokenCount > 150_000) {
    return { category: 'long_context', reason: `Conversation at ${conversationTokenCount} tokens, routing to large context model` };
  }

  // 7. Planning — explicit planning language
  if (PLANNING_PATTERN.test(text)) {
    return { category: 'planning', reason: 'Planning language detected' };
  }

  // 8. Default — coding (work mode default)
  return { category: 'coding', reason: 'Default coding task in work mode' };
}
