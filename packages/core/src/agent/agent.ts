import type { Provider, ChatCompletionRequest, ToolSchema } from '../providers/types.js';
import { recoverWrittenToolCalls, WrittenCallStreamFilter } from './recover-written-calls.js';
import type {
  Message,
  AssistantMessage,
  ToolCall,
  ModelDefinition,
  TokenUsage,
  ContentPart,
} from '../core/types.js';
import { getTextContent } from '../core/types.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import type { ToolExecutionContext } from '../tools/types.js';
import { MAX_TOOL_CALL_ITERATIONS, ITERATION_WARNING_THRESHOLD } from '../core/constants.js';
import { t } from '../i18n/index.js';
import { logger } from '../core/logger.js';
import { modeForTaggedText } from './mode-tags.js';
import { buildToolPrompt, parseToolCalls, formatToolResult } from './text-tool-parser.js';
import { bridgeImagesForTextModel } from './vision-bridge.js';
import { auditClaims, type ClaimAuditResult } from './claims-auditor.js';
import { autoExtractAndSave } from '../memory/auto-extract.js';
import type { MemoryManager } from '../memory/memory-manager.js';
import { maybeBuildDesignReinjection, isUIFilePath as isUIFilePathLocal } from './design-reinjection.js';
import { isStopCommand } from './stop-command.js';
import {
  findOriginalUserTaskIndex,
  formatSessionTasksBlock,
  buildCompressionContinuationHeader,
  buildVerbatimUserTurnsBlock,
  extractStructuredFields,
  trimMessageBody,
  OLD_MESSAGE_BODY_MAX_CHARS,
  isMetaPrefix,
  type TaskEntrySnapshot,
} from './context-continuity.js';
import {
  classifyTaskComplexity,
  formatDirectnessHint,
  COMPLEXITY_BUDGETS,
  type TaskComplexity,
} from './task-classifier.js';
import { avaEvents, withTrajectory, withChildTrajectory, getTrajectory } from '../dataset/emitter.js';
import type { AvaSurface, AvaMode } from '../dataset/events.js';
import { chargeCredits, extractUsage } from '../billing/meter.js';
import { summarizeToolArgs, summarizeToolResult, summarizeChainOutcome, categorizeToolPurpose } from '../dataset/summarizers.js';
import { pickVerificationTools, categorizeCorrection, VERIFICATION_TOOLS } from '../dataset/verification.js';
import { matchToolError } from '../tools/error-guidance.js';
import {
  recordEditFromTool,
  pendingFilesAtClosure,
  runPendingVerify,
  buildVerifyFailureNudge,
} from './post-edit-verify.js';
import {
  signatureForFailure,
  recordFailure,
  shouldEscalateFreshEyes,
  markFreshEyesEscalated,
  describeFailureLoop,
} from './error-loop-detector.js';
import { runFreshEyesReview, buildFreshEyesContext } from './fresh-eyes.js';
import { randomUUID } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { AVA_HOME } from '../core/constants.js';
import type { IntentClassifier, UserIntent } from './intent-classifier.js';
import { PNG } from 'pngjs';

// ─── Image downsampling ────────────────────────────────────────────────────
// Screenshots at native resolution are the single biggest token sink in
// vision-heavy sessions. A 1920×1080 full-page PNG encodes to ~100KB base64
// = ~25K tokens. Re-sent across 10 turns = 250K tokens for one image.
// Downsampling to max 1024px preserves all semantic information the model
// needs (layout, hierarchy, colour, typography visibility) while cutting
// the byte cost by 60-80%. Nearest-neighbor sampling is fine — this is not
// photo restoration, it's context for reasoning.
const IMAGE_MAX_DIMENSION = 1024;

function downsampleScreenshotBase64(base64: string): string {
  try {
    const buffer = Buffer.from(base64, 'base64');
    const src = PNG.sync.read(buffer);
    const maxCurrent = Math.max(src.width, src.height);
    if (maxCurrent <= IMAGE_MAX_DIMENSION) return base64;

    const scale = IMAGE_MAX_DIMENSION / maxCurrent;
    const newW = Math.max(1, Math.round(src.width * scale));
    const newH = Math.max(1, Math.round(src.height * scale));
    const dst = new PNG({ width: newW, height: newH });

    for (let y = 0; y < newH; y++) {
      const srcY = Math.min(src.height - 1, Math.floor(y / scale));
      for (let x = 0; x < newW; x++) {
        const srcX = Math.min(src.width - 1, Math.floor(x / scale));
        const srcIdx = (src.width * srcY + srcX) << 2;
        const dstIdx = (newW * y + x) << 2;
        dst.data[dstIdx] = src.data[srcIdx];
        dst.data[dstIdx + 1] = src.data[srcIdx + 1];
        dst.data[dstIdx + 2] = src.data[srcIdx + 2];
        dst.data[dstIdx + 3] = src.data[srcIdx + 3];
      }
    }

    return PNG.sync.write(dst).toString('base64');
  } catch (err) {
    // If decode/resize fails for any reason, fall back to the original.
    // Never block the vision pipeline on a resize failure.
    logger.debug(`[agent] Image downsample failed, using original: ${err instanceof Error ? err.message : String(err)}`);
    return base64;
  }
}

// ─── Mode-aware tool filtering ──────────────────────────────────────────────
// When a non-work mode is active, restrict the tool schema sent to the model
// so it can only call tools listed in that mode's system prompt.
// Without this, the model sees all tools in the schema and ignores text restrictions.

// ─── Continuation-stall detection ──────────────────────────────────────────
// Identifies assistant responses that narrate intent ("Let me rewrite the
// sidebar...") but terminate without making any tool calls. These are worse
// than empty responses because the user sees a promise that never gets
// fulfilled. Detected via prefix matching on common narration patterns.
//
// False positives (real closures that look like stalls) are preferable to
// false negatives (stalls that slip through) because the cost of a redundant
// "continue" nudge is small while the cost of invisible stalled work is
// catastrophic for UX.

const STALL_PREFIX_PATTERNS = [
  'let me ',
  "i'll ",
  'i will ',
  "i'm going to ",
  'i am going to ',
  'first, let me ',
  'first, i',
  'now let me ',
  "now i'll ",
  'okay, let me ',
  'ok, let me ',
  'right, let me ',
  'alright, let me ',
  'starting the ',
  'starting with ',
  'beginning the ',
  "let's ",
];

function looksLikeContinuationStall(content: string): boolean {
  const trimmed = content.trim().toLowerCase();
  if (trimmed.length === 0) return false;
  // Long responses are probably genuine explanations, not stalls
  if (trimmed.length > 500) return false;
  // Check known continuation-narration prefixes
  for (const prefix of STALL_PREFIX_PATTERNS) {
    if (trimmed.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Detect context drift: the model produced a greeting or social response
 * after a turn with tool usage. This happens when attention on the original
 * task fades under the weight of many file reads / tool results and the
 * model defaults to a safe social response instead of summarising findings.
 *
 * Only fires when the turn had 3+ tool calls AND the response is short
 * and contains greeting patterns. A greeting in a zero-tool turn is fine
 * (that's just a Chat-mode response).
 */
const GREETING_PATTERNS = [
  /\bhey\b/i, /\bhello\b/i, /\bhi\b/i, /\bgood\s+(?:morning|afternoon|evening)\b/i,
  /\bhow(?:'s| is) your (?:day|morning|evening|afternoon)\b/i,
  /\bhow are you\b/i, /\bwhat(?:'s| is) up\b/i, /\bnice to (?:see|hear|meet)\b/i,
];

function looksLikePostToolDrift(content: string, toolCallCount: number): boolean {
  if (toolCallCount < 3) return false; // Only relevant after real tool usage
  const trimmed = content.trim();
  if (trimmed.length > 200) return false; // Short response after many tools = suspicious
  const lower = trimmed.toLowerCase();
  return GREETING_PATTERNS.some(p => p.test(lower));
}

/**
 * Desktop-automation + browser-control tools. Two separate jobs ride on this
 * one list, which is why it's exported rather than local:
 *
 * 1. MODE GATING (any surface) — they're only valid in desktop mode, so the
 *    no-prefix default path filters them out. Otherwise the model hallucinates
 *    desktop_click_by_name mid-coding-session and the safety gate eats the noise.
 *
 * 2. MARKETPLACE COMPLIANCE (extension only) — Microsoft blocked this extension
 *    over exactly these tools and required their removal to reinstate it
 *    (v0.48.1, 2026-04-21). The extension host passes this list to
 *    registerBuiltins({ exclude }) so they are NEVER CONSTRUCTED there.
 *
 * Until 2026-07-17 only job 1 existed, and job 2 was believed done but wasn't:
 * the tools were registered on every surface and the only thing standing
 * between a marketplace user and a desktop_* schema was mode detection, which
 * keys off a literal '[Desktop Automation Mode]' prefix in the user's own
 * message text and had no idea which surface it was running on. They couldn't
 * actually drive anything (the extension supplies no uiaProvider/inputProvider),
 * but "inert" is not the promise we made to MS.
 *
 * Keep this list as the ONE definition. If a desktop_* or browser_* tool is
 * added to the registry and not added here, it ships to the marketplace.
 */
export const DESKTOP_TOOL_NAMES = [
  'desktop_plan_approve',
  'desktop_launch_app',
  'desktop_list_elements',
  'desktop_click_by_name',
  'desktop_focus_window',
  'desktop_type',
  'desktop_key_press',
  'browser_navigate',
  'browser_snapshot',
  'browser_click',
  'browser_type',
  'browser_close',
] as const;

const DESKTOP_ONLY_TOOLS: Set<string> = new Set(DESKTOP_TOOL_NAMES);

/**
 * Tools every mode gets, unioned in on top of MODE_ALLOWED_TOOLS.
 *
 * `self_inspect` is read-only by construction — it reads Ava's own source and
 * her deploy state. It cannot write a file, run a command, or spend anything;
 * changing the code is a thing the operator does directly, never Ava. So there
 * is no mode where "don't let her read her own source" is the right answer.
 *
 * It was previously allowed in `work` and `plan` only, which meant that in the
 * other ten modes the schema filter removed it and she'd correctly say she
 * didn't have it — including in Chat, where "what can you do?" is exactly the
 * question you'd ask, and which the README promises she answers by reading her
 * own source.
 *
 * This is a union rather than twelve list edits on purpose: a new mode gets it
 * automatically, so it can't rot back out the way it did the first time.
 *
 * conversation_recall joins it for the same reason. The system prompt tells Ava
 * every turn to "call conversation_recall to read the real transcript instead
 * of guessing" — but it was in no mode's list, so the filter dropped it in every
 * mode that carries a prefix (which the dashboard always sends). The exact-recall
 * backstop was unreachable on the main surface. Read-only: it reads the current
 * run's transcript off sharedState, writes nothing.
 */
const ALWAYS_ALLOWED_TOOLS: Set<string> = new Set(['self_inspect', 'conversation_recall']);

/**
 * Stage gate for code mode's tool allowlist.
 *
 * `MODE_ALLOWED_TOOLS.work` has existed for months and has never once run:
 * code mode is the untagged default, so the filter's `detectedMode ? ... :
 * null` took its fallback branch every time. Switching it on removes 66 of
 * 118 schemas from the busiest surface in the product, and a list that has
 * never executed is a list nobody has checked.
 *
 * 'log'     — compute the filtered set, report what it WOULD withhold and
 *             what Ava actually reached for, withhold nothing.
 * 'enforce' — apply it.
 *
 * A module constant rather than an env var so flipping it is one visible
 * line in a diff, and so the two surfaces cannot end up disagreeing about
 * which stage they are in.
 */
// ENFORCING since 2026-09-01. The log-only stage did its job: a full
// real-world project built end to end in code mode produced no
// work-gate.log at all, meaning she never once reached for a tool the
// list withholds. The logger was verified to be live in that build
// first — an absent file only means something if the writer works.
const WORK_TOOL_GATE: 'log' | 'enforce' = 'enforce';

/**
 * Where the log-only stage records a reach, under AVA_HOME.
 *
 * One line per turn in which Ava called a tool the gate would have
 * withheld. If this file does not exist after a real session of coding,
 * the allowlist is complete and WORK_TOOL_GATE can move to 'enforce'. If
 * it does exist, every name in it belongs back on the list first.
 */
const WORK_GATE_LOG = 'work-gate.log';

const MODE_ALLOWED_TOOLS: Record<string, Set<string>> = {
  // Work mode — the bread-and-butter coding surface. Ships every turn
  // to users writing code, so the schema list is the single biggest
  // per-turn token line item. Keep what a coder actually reaches for;
  // push anything that belongs to a different state-of-thought out.
  // Cross-mode asks (image generation, email drafts, weather) still
  // work — Ava calls switch_mode. The friction of one switch is worth
  // the 2-3K tokens saved on every single coding turn.
  //
  // Deliberately OUT:
  // - journal_write / learning / weather / news — Chat / Teach.
  // - email_draft / report_generate / document_manage /
  //   document_templates — office work, rarely mixed with coding.
  // - memory_delete — destructive, never a normal-flow tool.
  work: new Set([
    // File operations
    'read', 'write', 'edit',
    // Creating a NEW project — the only write that reaches outside the open
    // project, and it makes exactly one empty folder in the projects home.
    // Without it, "start me a new project" can only be answered by building
    // inside whatever project is already open.
    'create_project',
    // Search
    'glob', 'grep', 'list_directory', 'find_symbol', 'project_index',
    // Shell
    'bash',
    // The build's own check. The pre-closure guard constructs this tool
    // directly rather than asking for it, so verify has always run — but a
    // mode that edits files should be able to ASK for it too, and a name
    // absent from the list it belongs on is how the next audit gets it wrong.
    'verify_change',
    // Git
    'git_status', 'git_diff', 'rollback', 'git_commit', 'git_create_pr',
    // Web
    'web_search', 'http_request', 'browser',
    // Creative Studio — making an asset happens in the Studio, not inline
    // here. This gate used to list 'generate_image' / 'generate_video' /
    // but the registry only ever builds the design_* tools,
    // so those three names resolved to nothing — dead entries. The handoff
    // (open_design_studio, further down) and browse_library are what work mode
    // actually needs: point at the Studio to make, read the library to reuse.
    'browse_library',
    'remove_background',
    // Data
    'database_query',
    // Memory — delete is out (rare, destructive)
    'memory_save', 'memory_recall', 'memory_update',
    // Planning / tasks
    'present_plan', 'todo_write', 'task_manage', 'task_suggest', 'apply_plan',
    // Testing
    'test_run', 'test_generate',
    // Architecture / docs gen
    'analyze_architecture', 'doc_generate',
    // Security audits
    'audit_dependencies',
    // Performance
    'benchmark',
    // Debug
    'debug_logs',
    // Interaction
    'ask_user', 'support_request',
    // Secret vault → project. The prompt tells Ava to call secret_request for a
    // {{secret:<id>}} handle, then env_write to put a granted key into the
    // project's gitignored .env — the host swaps the real value in at write
    // time so she never sees it. Both were missing from every build surface
    // (secret_request was desktop-only, env_write in no mode), so the flow the
    // prompt describes couldn't run. Confirmation-gated writes; env_write
    // refuses any non-gitignored target.
    'secret_request', 'env_write',
    // Self
    'docs_lookup', 'propose_tool', 'self_inspect', 'release_notes',
    // Taste specialist — fresh-context Curator for design/voice/microcopy
    // calls that would otherwise degrade under cognitive load.
    'curator',
    // Utility
    'get_datetime', 'detect_language',
    // Hand a fitness/meal plan request off to the focused Health room, a
    // learn-a-topic request off to the focused Learning room, or an icon /
    // on-brand asset request off to the focused Design Studio.
    'open_health_room', 'open_learning_room', 'open_design_studio',
    // Mode switch
    'switch_mode',
  ]),
  plan: new Set([
    // Read + nav
    'read', 'glob', 'grep', 'list_directory', 'find_symbol', 'project_index',
    // Research surface — http_request/browser/news added so the
    // coordinator-direct path (the most common Plan flow) has the same
    // research tools the Researcher persona gets in orchestrated mode.
    'web_search', 'http_request', 'browser', 'news',
    // Memory + planning + analysis
    'memory_save', 'memory_recall', 'present_plan', 'analyze_architecture',
    // Reference / introspection (already used; advertised below now too)
    'docs_lookup', 'self_inspect',
    // Taste specialist for design/voice/microcopy decisions
    'curator',
    // Interaction + utilities
    'ask_user', 'get_datetime', 'detect_language',
    'switch_mode',
  ]),
  chat: new Set([
    'web_search', 'memory_save', 'memory_recall', 'memory_update', 'journal_write',
    // Both were in the chat PROMPT and missing from this list, so following her
    // own instructions got the call refused. Found 2026-08-20 by the guard that
    // compares the two.
    //
    // The prompt devotes a paragraph to papers — use paper_fetch_full_text on
    // an arXiv ID or DOI, and explicitly do NOT reach for read/grep because the
    // Library is not on disk. And browse_library carries the rule about reusing
    // an asset the user already owns rather than regenerating it, "because that
    // costs them credits for a thing they have" — a rule she could not follow
    // without the tool.
    'paper_fetch_full_text', 'browse_library',
    // todo_write for Ava's own session steps. task_suggest is her DEFAULT for a
    // task-worthy thing she notices (a tap-to-add card); task_manage is for when
    // the user explicitly says "add X to my list" — create directly then.
    'todo_write', 'task_suggest', 'task_manage',
    'get_datetime', 'weather', 'news', 'ask_user',
    // Hand a fitness/meal plan request off to the focused Health room, a
    // learn-a-topic request off to the focused Learning room, or an icon /
    // on-brand asset request off to the focused Design Studio.
    'open_health_room', 'open_learning_room', 'open_design_studio',
    'switch_mode',
  ]),
  brainstorm: new Set([
    // Reading the project. Added 2026-08-20: the mode is for two people —
    // someone with nothing to build, and someone whose project needs to move.
    // The second was impossible, because ideation could not open a single file
    // and could not read the Decisions folder either. She was being asked to
    // suggest where a codebase should go next while forbidden from looking at
    // it. Read-only, and readOnlyModeToolCeiling now enforces that structurally,
    // so widening what she can READ cannot leak into being able to write.
    'read', 'glob', 'grep', 'list_directory', 'project_index',
    // Turning an idea into somewhere to put it. Brainstorm exists for someone
    // who does not know what to build, so stopping at "here is what you should
    // build" and leaving them to make the folder by hand is stopping one step
    // short of the point.
    //
    // This does not make the mode writable. modeCanEditFiles asks for 'write'
    // or 'edit' by name and neither is here, so the read-only ceiling still
    // holds — create_project makes ONE empty directory in the projects home
    // and cannot put a byte inside it. The work happens once that folder is
    // opened, in whichever mode you open it in.
    'create_project',
    // Research signals (web + news) so coordinator-direct ideation has the
    // same research surface the orchestrated team gets via IDEATION_TOOLS.
    'web_search', 'http_request', 'browser', 'news',
    // Memory — update is in for refining accumulated ideas across sessions.
    'memory_save', 'memory_recall', 'memory_update',
    // The session itself: ideas, the ones turned down, and why. Local only,
    // and distinct from memory — memory holds durable facts about the PERSON,
    // this holds the thinking.
    'brainstorm_session',
    // Output shape
    'present_plan', 'journal_write', 'todo_write',
    // Taste specialist for naming/voice/microcopy decisions
    'curator',
    'ask_user', 'get_datetime',
    'switch_mode',
  ]),
  teach: new Set([
    // Reading + project navigation
    'read', 'glob', 'grep', 'list_directory', 'find_symbol', 'project_index',
    // Writing — needed because the Tutor system prompt says "create sample
    // files" and runs live code examples. file_write/file_edit + bash only.
    // Git commit/PR tools intentionally OUT — wrong blast radius for a
    // teaching session.
    'write', 'edit', 'bash',
    // Web (verify facts, fetch docs, browse references)
    'web_search', 'http_request', 'browser',
    // Memory — update is in so the learner profile evolves across sessions
    'memory_save', 'memory_recall', 'memory_update',
    // Journal — Ava reflects on the learner + their progress in her own voice
    'journal_write',
    // Learning subsystem
    'learning_create', 'learning_teach', 'learning_progress',
    // Scientific Papers library — "Read with Ava" hands her an arXiv/DOI paper
    // to explain. The tool's own description says "use this in Teach mode", and
    // this was the one mode that didn't allow it, so the button pointed at a
    // tool she couldn't reach.
    'paper_fetch_full_text',
    // Interaction + utilities
    'ask_user', 'get_datetime', 'detect_language',
    'switch_mode',
  ]),
  security: new Set([
    'read', 'glob', 'grep', 'list_directory', 'find_symbol', 'project_index',
    'bash', 'git_status', 'git_diff', 'web_search', 'analyze_architecture',
    'audit_dependencies', 'debug_logs', 'memory_save', 'memory_recall',
    'test_run', 'ask_user',
    // get_datetime was missing here and nowhere else — eleven of the twelve
    // rooms had it. Security is the room where it matters most: whether an
    // advisory predates the version you run, whether a dependency is actually
    // behind, how old an unpatched CVE is. Without it she dates from her
    // training cutoff, which is not a vague answer but a confident wrong one,
    // and it gets more wrong every month the model ages.
    'get_datetime',
    // An audit that ends in prose ends nowhere. present_plan turns findings
    // into a decision with real alternatives — fix everything now, criticals
    // only, or accept this risk and write down why — and an accepted plan
    // becomes a record in Decisions/records/. That record is what stops the
    // NEXT audit re-reporting a risk you consciously took, which is the thing
    // that makes people stop running audits at all.
    //
    // todo_write is safe here despite feeding the Builder hand-off: the mode
    // gate refuses to dispatch for any mode that cannot edit files, and this
    // one cannot. Security proposes the fix; work mode makes it.
    'present_plan', 'todo_write',
    'switch_mode',
  ]),
  // Health Room — Ava focused entirely on the user's health & fitness. Same
  // Ava, health-scoped: the plan + catalogue tools are her kit, memory carries
  // the relationship, web_search backs facts. Coding / file / shell tools are
  // deliberately OUT — this room composes plans from the real catalogue, it
  // doesn't touch the codebase.
  health: new Set([
    // health_plan_list before create: activating archives another plan of the
    // same type, and she cannot warn about what she cannot see.
    // health_plan_update was missing from this set while the room prompt told
    // her to use it for "make that draft active" — so the only tool she could
    // reach was create, which is precisely how the library ended up with two
    // copies of the same week, one draft and one active on the wrong day.
    'health_plan_list', 'health_plan_create', 'health_plan_update',
    'health_plan_update_day', 'health_plan_delete', 'health_catalogue_search',
    'health_profile_ask',
    'memory_save', 'memory_recall', 'memory_update',
    // Journal — Ava reflects on the person + their health journey in her voice
    'journal_write',
    'web_search', 'ask_user', 'get_datetime',
    'switch_mode',
  ]),
  // Design Studio — Ava the Design Architect, focused entirely on making the
  // user on-brand icons. Same Ava, design-scoped: the shape/generate/brand/save
  // tools are her kit, memory carries their taste, journal her read on their eye.
  // Coding / file / shell tools are deliberately OUT — this room makes assets,
  // it doesn't touch the codebase. Scope is icons for now.
  design: new Set([
    'design_find_shape', 'design_generate_icon', 'design_generate_set',
    'design_generate_video', 'design_generate_image', 'design_generate_voice',
    'design_generate_logo', 'design_explore_logos', 'design_brand_kit', 'design_save',
    'memory_save', 'memory_recall', 'memory_update',
    // Journal — Ava reflects on the person + their taste in her own voice
    'journal_write',
    // Research — ground a look in current design references / trends before authoring it
    'web_search',
    'ask_user', 'get_datetime',
    'switch_mode',
  ]),
  // Social Studio — Ava as the social-media & marketing lead, driving the
  // Posts floor. Same Ava, marketing-scoped: research/hook/write/performance
  // tools are her kit, docs_lookup grounds every product claim, generate_image
  // makes visuals, memory carries the mission's voice, journal her read on the
  // brand's public presence. Coding / file / shell tools are deliberately OUT —
  // this room ships posts, it doesn't touch the codebase.
  social: new Set([
    'research_post', 'propose_hooks', 'write_post', 'post_performance', 'suggest_beats',
    // The day plan. She and the operator agree the day together, so she
    // needs to read it (items may already be carried from yesterday),
    // write what was agreed, and tick what she can verify. Registering
    // the tools was not enough on its own — see write_video_post below,
    // which sat unusable in exactly this way while she correctly reported
    // it was not in her toolset. This Set is the real gate.
    'day_plan_read', 'day_plan_write', 'day_plan_item_status',
    // Short-form video — the Video Posts room. Registering the tool in the
    // builtins was not enough: this Set is the real gate, and while it was
    // missing she reported "write_video_post isn't in my toolset" and pointed
    // people at the Design Studio instead. She was reading her list correctly.
    'write_video_post',
    // A post's picture is part of the post. Made here, not via a trip to the
    // Design Studio — she cannot finish a post she is not allowed to illustrate.
    'write_post_image',
    // Our own catalogue, read-only. A food or fitness post should be about a
    // dish or a movement we actually have, with the real name, ingredients and
    // method — and the video store already pulls OUR photography for the hero
    // image, so the copy has to match the picture it is paired with. Without
    // these she told users the recipe catalogue "lives in a different part of
    // the system that I can't query from this room", which was true and is the
    // same gap write_video_post had: registered in the builtins, missing here.
    //
    // Authoring stays out. Recipes are written at the Pantry desk and
    // exercises in the Gym; this room reads the shelf, it does not stock it.
    'find_recipe', 'read_recipe', 'find_exercise', 'read_exercise',
    // Industry radar — what AI leaders/labs actually said this week (sourced)
    'scan_industry',
    // Ground every product claim in the real docs, never training memory
    'docs_lookup', 'release_notes',
    // Visuals for posts are made in the Creative Studio, not inline. Point the
    // user there (open_design_studio) and reuse what they already have
    // (browse_library). 'generate_image' used to sit here — a name the registry
    // never builds — so a post's visual silently did nothing.
    'open_design_studio', 'browse_library',
    // A voiceover ON ITS OWN, not attached to a clip — audio is its own
    // deliverable (a read for footage they already have), and routing it
    // through a video they don't want burns a video generation.
    //
    // NOT design_generate_voice: that tool speaks through `designControl`, the
    // Design Studio's canvas channel, which this surface never mounts. Adding
    // it here would have registered a tool that answers "no canvas" every time.
    // write_voiceover carries its own store, the way write_video_post does.
    'write_voiceover',
    // Research to make the angle current
    'web_search',
    // Memory carries the mission voice; journal her read on the brand
    'memory_save', 'memory_recall', 'memory_update', 'journal_write',
    'ask_user', 'get_datetime',
    'switch_mode',
  ]),
  // Newsroom — Ava as Correspondent. She reads what outlets published, stands
  // the story up, and writes her OWN account with the receipts attached.
  //
  // The kit is small on purpose. web_search is deliberately OUT: an open web
  // search returns blogs, forums and SEO sludge, and once that is in the corpus
  // a quote "verifies" against a source that was never journalism. The news
  // index is the only door in, so the evidence write_article checks against is
  // evidence from a publisher. Coding / file / shell tools are out entirely.
  news: new Set([
    'discover_news', 'suggest_stories', 'research_story', 'fact_check', 'write_article',
    // Header images are authored in the Creative Studio, never a lifted press
    // photo — point the user there rather than generating inline. 'generate_image'
    // used to be here, but the registry never builds that name.
    'open_design_studio', 'browse_library',
    // Continuity: running stories, corrections owed, what she has already covered.
    'memory_save', 'memory_recall', 'memory_update', 'journal_write',
    'ask_user', 'get_datetime',
    'switch_mode',
  ]),
  // Write mode — the author's surface. Markdown is the editable source;
  // Word/PDF are exports. Ships the authoring tool + the supporting cast a
  // writer reaches for (research, images for covers, the file ops the .md
  // lives in, memory for house style/templates). Coding tools stay out — this
  // is writing, not building.
  write: new Set([
    // Authoring
    'document_author', 'document_manage', 'report_generate', 'email_draft',
    // The .md source lives on disk
    'read', 'write', 'edit', 'glob', 'grep', 'list_directory',
    // Research to ground the writing
    'web_search', 'http_request', 'browser',
    // Illustrations / covers are made in the Creative Studio — hand off there
    // and reuse existing assets. 'generate_image' used to sit here (a name the
    // registry never builds), which is why write mode's "cover image she
    // generates herself" never actually generated one. remove_background stays:
    // it's a one-shot edit utility, not creative generation.
    'open_design_studio', 'browse_library', 'remove_background',
    // Memory — house style, saved templates, continuity across a long piece
    'memory_save', 'memory_recall', 'memory_update',
    // Light planning for long documents
    'present_plan', 'todo_write',
    // Utility + interaction
    'get_datetime', 'detect_language', 'ask_user', 'support_request',
    'docs_lookup', 'curator',
    // Mode switch
    'switch_mode',
  ]),
  // Desktop Automation mode. Two layers of hands:
  //   - desktop_launch_app to open apps (denylist-scoped — no shell)
  //   - desktop_* for UIA-tree targeting of native windows
  //   - browser_* for driving the visible Ava Chromium via DOM
  // File-editing and coordinate-based native input are deliberately absent
  // here — file changes go through Work mode, and native UIA input is the
  // stable targeting layer. `bash` is intentionally OUT: it's too broad
  // for this surface and gives the model an escape hatch we don't want.
  desktop: new Set([
    // Trajectory-level plan approval (one card, many steps)
    'desktop_plan_approve',
    // Launch apps — scoped, no shell interpreter
    'desktop_launch_app',
    // Native desktop via UIA tree — stable selectors, not pixel coords.
    // No desktop_screenshot or desktop_click_xy: vision + coordinate
    // guessing is a failure mode. Ava must use tree/DOM-based targeting.
    'desktop_list_elements', 'desktop_click_by_name', 'desktop_focus_window',
    'desktop_type', 'desktop_key_press',
    // Persist a standing rule the user wants obeyed on this machine forever
    'record_machine_rule',
    // Browser automation via Playwright DOM — visible Chromium, stable.
    'browser_navigate', 'browser_snapshot', 'browser_click', 'browser_type', 'browser_close',
    // Light support
    'web_search', 'memory_recall', 'ask_user', 'get_datetime',
    'switch_mode',
    // Capability-style secret grant — required so Ava can fetch a
    // {{secret:<id>}} handle when the safety gate blocks typing into
    // a sensitive field. Without this in the allowlist the fix below
    // would be a dead end — Ava would be told to call secret_request
    // but the registry would reject the call for being out-of-mode.
    'secret_request',
  ]),
};

/**
 * The mode this turn is in, read from the tag the surfaces prepend.
 *
 * Exported because the AutoCoordinator had grown a second copy of this that
 * sniffed the SYSTEM prompt for the string `'Plan mode'`. The marker is
 * `[Plan Mode]`, on the user message, with a capital M — so the copy matched
 * nothing and answered `'work'` for all seven modes, every turn, since it was
 * written. One fact, two detectors, and the quiet one was wrong: the same
 * shape as the dead tool names in the mode allowlists.
 */
export function detectModeFromMessages(messages: Message[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'user') continue;
    const text = getTextContent(msg.content);
    if (text.startsWith('[Internal Planning')) continue;
    // One list, in agent/mode-tags.ts. This used to be eleven hand-written
    // startsWith calls, and the other eight copies of the same list around
    // the codebase each disagreed with it in a different way.
    return modeForTaggedText(text);
  }
  return null;
}

/**
 * Can this mode change files?
 *
 * Read from `MODE_ALLOWED_TOOLS` rather than a list of its own. A mode that is
 * not handed `write` or `edit` is read-only by design, and nothing downstream
 * should be able to grant it more than the mode itself has.
 *
 * Exists because the AutoCoordinator's Builder hand-off had no idea what mode
 * it was in. Seen live 2026-08-19: a Plan-mode turn produced a plan card, wrote
 * eleven todos, announced "Builder dispatched — executing 11 tasks", and started
 * editing an Unreal project. Plan mode is read-only — it cannot open a file to
 * write it — and the orchestrator went around that by spawning agents that
 * could. The operator's words were "why are you coding when did i say to do
 * anything but plan".
 *
 * An unknown mode returns true: work mode carries no prefix, so callers that
 * default to it must not be silently blocked.
 */
/**
 * The hard ceiling on what a persona may be handed in a READ-ONLY mode.
 *
 * The conductor scopes each persona by its own `allowedTools`, taken from the
 * full registry — the mode allowlist is not consulted at all. So a mode's
 * read-only guarantee held only for as long as nobody put a write-capable
 * persona on its team, which is a promise about a roster rather than about the
 * mode. Audited 2026-08-19: Plan's team happened to be clean, and the
 * guarantee was one persona away from being false.
 *
 * Returns null for a mode that can edit files, deliberately. Work's allowlist
 * is known to be stale and has never applied (it has no prefix, so the filter
 * never runs) — clamping the Builder to it here would enforce a list nobody
 * has checked, and would land as a breakage dressed as a tightening.
 */
export function readOnlyModeToolCeiling(mode: string | null | undefined): ReadonlySet<string> | null {
  if (!mode || modeCanEditFiles(mode)) return null;
  const allowed = MODE_ALLOWED_TOOLS[mode];
  if (!allowed) return null;
  return new Set([...allowed, ...ALWAYS_ALLOWED_TOOLS]);
}

export function modeCanEditFiles(mode: string | null | undefined): boolean {
  if (!mode) return true;
  const allowed = MODE_ALLOWED_TOOLS[mode];
  if (!allowed) return true;
  return allowed.has('write') || allowed.has('edit');
}

// ─── Event system ────────────────────────────────────────────────────────────

export interface ContextUsage {
  used: number;
  limit: number;
  percent: number;
}

export type AgentEvent =
  | { type: 'stream_start' }
  | { type: 'thinking_delta'; content: string }
  | { type: 'stream_delta'; content: string }
  | { type: 'stream_end'; message: AssistantMessage }
  // Human-readable prep/routing status for the thinking indicator. Emitted
  // during the silent pre-stream window (task classification, intent gate,
  // model routing) — especially the orchestration modes, where that window
  // can run ~10s with nothing else on screen. `labelKey` is an i18n key the
  // surface localizes; `model` fills the {model} placeholder where present.
  | { type: 'progress'; labelKey: string; model?: string }
  | { type: 'tool_call_start'; toolCall: ToolCall }
  | { type: 'tool_call_partial'; toolCallId: string; data: string }
  | { type: 'tool_call_end'; toolCall: ToolCall; result: string; success: boolean; metadata?: Record<string, unknown> }
  | { type: 'usage'; usage: TokenUsage; cost?: number }
  | { type: 'error'; error: Error }
  | { type: 'context_usage'; context: ContextUsage }
  | { type: 'context_compression_start' }
  | { type: 'context_compression_end'; originalTokens: number; compressedTokens: number }
  | { type: 'context_truncated'; droppedCount: number }
  | { type: 'interjection'; content: string }
  | { type: 'done'; finalMessage: AssistantMessage }
  // Auto Mode events — emitted by AutoCoordinator
  | { type: 'auto_routing'; category: string; model: string; reason: string }
  | { type: 'auto_agent_start'; model: string; category: string }
  | { type: 'auto_agent_end'; model: string; summary?: string }
  // Execution dispatch events — emitted by TaskExecutor when Builder runs
  // a task list created by present_plan + todo_write.
  | { type: 'execution_start'; total: number }
  | { type: 'task_start'; taskId: string; title: string; index: number; total: number }
  | { type: 'task_complete'; taskId: string; title: string; summary?: string }
  | { type: 'task_blocked'; taskId: string; title: string; reason: string }
  | { type: 'task_failed'; taskId: string; title: string; error: string }
  | { type: 'execution_complete'; completed: number; blocked: number; total: number }
  // Post-build verification events — emitted by AutoCoordinator after the
  // task agent finishes, when the agent's final message contains a
  // <changes-summary> block declaring files touched.
  | { type: 'verification_start'; files: string[] }
  | {
      type: 'verification_end';
      passed: boolean;
      report: string;
      stats: { total: number; passed: number; failed: number; skipped: number };
    }
  // Emitted when verification failed and AutoCoordinator is re-dispatching
  // the task agent once with the failure context injected. Host UIs show a
  // "Retrying after verification failure" banner until the next
  // verification_end (or stream_end) fires.
  | { type: 'verification_retry_start'; reason: string }
  // ── Loop-prevention telemetry ─────────────────────────────────────────
  // Emitted by the pre-closure verify guard in runInner. Surfaces the
  // verify-and-retry cycle so users see when an extra typecheck/test
  // pass ran, why it ran, and whether it passed. Without these events,
  // the verify guard runs silently and the user just sees the agent
  // "thinking" longer than expected.
  | { type: 'verify_started'; files: string[] }
  | { type: 'verify_passed'; files: string[] }
  | { type: 'verify_failed'; files: string[]; output: string }
  // Fresh-eyes is a single extra provider call (cold context, "second
  // opinion" prompt) that runs when the same verify failure has recurred
  // 3 times. These events make the extra spend visible — the UI can
  // surface "Loop guard fired — running an independent review" so it's
  // never silent. `signature` is a 60-char prefix of the failure
  // signature for log/telemetry correlation, never includes raw user
  // content.
  | { type: 'fresh_eyes_started'; signature: string }
  | { type: 'fresh_eyes_complete' }
  // ── Credit-fairness signal ────────────────────────────────────────────
  // Fires when the loop-prevention system has done all it can (verify
  // ran, retry happened, fresh-eyes review fired) and the same root-cause
  // signature is still failing. Tells the platform billing surface "this
  // turn is a fair-refund candidate" — the user paid for the recovery
  // attempts but the agent didn't get them out of the hole. Backend
  // policy decides whether the refund is automatic or operator-reviewed;
  // the agent's job is just to flag the turn unambiguously.
  //
  // `tokensInRecovery` is the agent's best estimate of tokens spent
  // post-escalation (verify + fresh-eyes call + the failed retry round).
  // `signature` is the same 60-char prefix used by fresh_eyes_started so
  // backend telemetry can correlate. Never includes raw user content.
  | { type: 'loop_refund_eligible'; signature: string; tokensInRecovery: number; reason: string };

export type AgentEventHandler = (event: AgentEvent) => void;

// ─── Agent ───────────────────────────────────────────────────────────────────

export class Agent {
  private readonly provider: Provider;
  private readonly model: ModelDefinition;
  // Vision bridge — a dedicated vision-capable provider+model (e.g. Qwen Omni)
  // used to DESCRIBE images when the main coordinator is text-only (DeepSeek,
  // Mistral Codestral, etc.), so it can "see" the image as text. Optional; when
  // absent, text-only models fall back to a "switch model" note.
  private readonly visionProvider?: Provider;
  private readonly visionModel?: ModelDefinition;
  // Image descriptions cached per session (keyed by the image data URL) so a
  // text-only coordinator doesn't re-run the vision model on every turn.
  private readonly visionDescriptionCache = new Map<string, string>();
  private readonly toolRegistry: ToolRegistry;
  private readonly toolContext: ToolExecutionContext;
  private readonly pendingInterjections: string[] = [];

  // Graceful-pause flag — set by requestPause(), checked at each loop
  // boundary. A "pause" finishes the current step then exits cleanly, unlike
  // the abort signal which is an immediate hard stop.
  private pauseRequested = false;
  // Verifying tools that ran this run() (name + success), for the soft
  // honesty gate (claims-auditor) at final-answer time. Reset per run.
  private runToolEvidence: Array<{ name: string; ok: boolean }> = [];
  /**
   * The id of the turn currently running — one per run(), shared by every
   * model call the turn makes, sent to our platform as X-Ava-Turn-Id.
   *
   * A tool-using turn calls the model repeatedly, and each call was landing in
   * usage_logs as its own row with nothing connecting them. So a turn where
   * the third call failed and the fourth succeeded was indistinguishable from
   * four separate turns: retries invisible, and no way to tell a price change
   * from a behaviour change. This is what makes cost-per-outcome answerable
   * rather than just cost-per-call.
   */
  private runTurnId: string | undefined;
  // Did the soft honesty gate flag an unbacked factual claim this run?
  // Set by the claims-auditor branch; read by the verification_evidence
  // dataset emit in run()'s finally. Reset per run.
  private runClaimFlagged = false;
  // Latest claims-auditor result this run (set at answer finalization).
  // Read by the verify-or-restate guard in runInner. Reset per run.
  private lastAudit: ClaimAuditResult | null = null;
  // Did the honesty gate already fire its one verify-or-restate re-prompt
  // this run? Caps the active loop at a single attempt. Reset per run.
  private honestyVerifyAttempted = false;

  /** Build the verify-or-restate re-prompt for the honesty gate. Maps the
   *  claim to the tool that would actually check it, and offers the honest
   *  alternative (restate without asserting). Internal — never shown as text. */
  private buildHonestyVerifyNudge(audit: ClaimAuditResult): string {
    const claim = audit.claims[0] ?? 'a completion/state claim';
    const how = audit.tier === 'critical'
      ? 'run a real check (audit_dependencies, a scan, or grep for the actual pattern)'
      : 'run the tool that checks it (test_run for tests, bash or git_diff for code changes, http_request or browser for an endpoint, file_read for a file)';
    return `[Honesty check — you stated "${claim}" but ran no tool that verifies it this turn. Do ONE of two things now, no exceptions: (a) ${how}, then report the actual result; or (b) restate without asserting it as done — e.g. "I changed X, but haven't verified it yet." Do not repeat the unbacked claim as fact.]`;
  }
  private _inThinkTag = false;

  // ─── Exploration budget tracking (token-cost discipline) ────────────────
  // Per-run state: the task classification and how many read-only tool calls
  // the agent has made before its first write-capable call. When the count
  // exceeds the budget for the current task complexity, a soft nudge is
  // injected into the next LLM call ("you're stalling — commit to a
  // direction"). Reset on each Agent.run() call.
  private currentTaskComplexity: TaskComplexity = 'moderate';
  private readCountBeforeFirstWrite = 0;
  private hasWrittenInThisRun = false;
  private explorationNudgeFired = false;

  // Design re-injection state — tracks last re-injection turn and file mtimes
  // so we don't re-read the same design files 20 times in a single session.
  private designReinjectionTurn = 0;
  private designReinjectionLastTurn = -Infinity;
  private designReinjectionLastMtimes = new Map<string, number>();

  /** Which surface this Agent is running in (cli/extension/ide/companion). */
  private readonly surface: AvaSurface;
  /** Stable session UUID — one per Agent instance unless caller overrides. */
  private readonly sessionId: string;
  /**
   * Loop-prevention master switch. When false, the pre-closure verify
   * guard skips the verify_change call and falls straight through to the
   * existing closure logic — the agent behaves exactly like it did before
   * post-edit-verify shipped. Used as an emergency off switch and a way
   * for power users who hate any extra LLM round-trips to opt out. The
   * `recordEditFromTool` post-tool hook still runs (it's free) so the
   * trajectory has the data if the flag flips on mid-session.
   *
   * Default true — the guard catches real bugs (build-broken closures,
   * stuck-loop credit burn) and the cost is bounded (one verify pass +
   * at most one fresh-eyes call per turn).
   */
  private readonly loopPreventionEnabled: boolean;
  /**
   * Recovery hook that returns the new messages accumulated during the
   * currently-running Agent.run() call. Set at the top of run(),
   * cleared (left as a stale closure) when run() exits — the next run
   * overwrites it. Lets the caller reach into a cancelled run and
   * persist Ava's partial work (completed tool calls, streamed
   * assistant text) before the AbortError throws her out, instead of
   * losing all of it because run() never reached its return statement.
   *
   * Without this, pressing Stop mid-task discarded every tool call and
   * file edit Ava had completed — the next user message saw a
   * conversation history with a gap where her work used to be, and
   * Ava had no memory of what she'd done. See cancelRun() in the host.
   */
  private currentRunRecoveryHook: (() => Message[]) | null = null;
  /**
   * Consecutive identical failures, per tool+arguments, within one run.
   *
   * A tool that fails the SAME WAY on the same arguments is not a retry
   * situation — nothing has changed, so the next attempt cannot go differently.
   * Observed in the wild: health_plan_create failed seven times running while
   * the model cheerfully called it again each time, spending credits per turn,
   * until the operator hit Stop. Nothing counted the repeats and nothing told
   * anyone.
   *
   * Keyed on tool + arguments so a genuine retry with DIFFERENT arguments is
   * untouched — changing the call is exactly the productive response to a
   * failure, and this must not punish it.
   */
  private repeatedToolFailures = new Map<string, number>();
  /**
   * Trajectory metadata from the previous Agent.run() in this session.
   * Used to attach `correction_received` events to the trajectory the
   * user is correcting, and to record whether that prior trajectory
   * had verified before answering. Reset across agent instances.
   */
  private lastTrajectoryMetadata: { trajectory_id: string; verified: boolean } | null = null;
  /**
   * The mode of the previous Agent.run() in this session. Used to fire
   * `mode_switch` dataset events when the user changes modes between
   * turns (e.g. switches from Work to Plan via the [Plan Mode] prefix).
   */
  private lastDetectedMode: AvaMode | null = null;

  constructor(opts: {
    provider: Provider;
    model: ModelDefinition;
    /** Vision bridge — provider + model used to describe images for a text-only
     *  coordinator (e.g. Qwen Omni Plus). When omitted, images get the legacy
     *  "switch to a vision model" note instead of being described. */
    visionProvider?: Provider;
    visionModel?: ModelDefinition;
    toolRegistry: ToolRegistry;
    cwd: string;
    sharedState?: Record<string, unknown>;
    /**
     * Surface this Agent runs in. Optional for backwards compatibility
     * with existing callers, defaults to 'cli'. Each surface package
     * (extension, ide, companion) should pass its own value so dataset
     * events get the correct attribution.
     */
    surface?: AvaSurface;
    /** Optional session UUID. Defaults to a fresh UUID per Agent. */
    sessionId?: string;
    /** Optional secret-grant callback for the secret_request tool. */
    secretGranter?: (label: string, reason?: string) => Promise<{ id: string; label: string } | null>;
    /**
     * Loop-prevention master switch. Defaults to true. Surfaces should
     * read their settings (e.g. `ava-supernova.loopPrevention.enabled`)
     * and pass through. Set false to disable the pre-closure verify
     * guard + fresh-eyes escalation entirely.
     */
    loopPreventionEnabled?: boolean;
  }) {
    this.provider = opts.provider;
    this.model = opts.model;
    this.visionProvider = opts.visionProvider;
    this.visionModel = opts.visionModel;
    this.toolRegistry = opts.toolRegistry;
    const sf: AvaSurface = opts.surface ?? 'cli';
    this.toolContext = {
      cwd: opts.cwd,
      sharedState: opts.sharedState,
      secretGranter: opts.secretGranter,
      // Map the host's AvaSurface to the docs Surface ('extension' -> 'ext') so
      // surface-aware tools (docs_lookup) know where Ava is running.
      surface: sf === 'extension' ? 'ext' : sf,
    };
    this.surface = sf;
    this.sessionId = opts.sessionId ?? randomUUID();
    this.loopPreventionEnabled = opts.loopPreventionEnabled ?? true;
  }

  /**
   * Return the new messages accumulated by the currently-running (or
   * just-aborted) Agent.run() call. Used by the host's cancellation
   * path to persist Ava's partial work — completed tool calls, streamed
   * assistant text — before the conversation history is updated with
   * the stop marker. Returns an empty array if no run has happened.
   *
   * Safe to call after run() has exited normally — the hook still
   * returns a snapshot of the run that just finished.
   */
  getCurrentRunPartialMessages(): Message[] {
    return this.currentRunRecoveryHook?.() ?? [];
  }

  /**
   * Update the working directory used by all tool executions.
   * Called when the user opens a different project folder mid-session.
   */
  setCwd(cwd: string): void {
    (this.toolContext as { cwd: string }).cwd = cwd;
  }

  /**
   * Run a one-shot completion — single prompt, no tools, no streaming,
   * timeout-bounded. Returns the assistant's trimmed text content, or
   * null on error / timeout / empty response.
   *
   * Intended for utility callers that need a quick model round-trip
   * without spinning up the full agent loop — e.g. the extension host's
   * auto-journal reflection that writes a 2–4 sentence session summary
   * after a completed turn. Cheap: one LLM call, no tool schemas, small
   * max_tokens.
   *
   * Errors (network, provider, parse, timeout) all collapse to null so
   * the caller can fall back gracefully without try/catch plumbing.
   */
  async completeOneShot(
    prompt: string,
    opts?: { maxTokens?: number; timeoutMs?: number },
  ): Promise<string | null> {
    const maxTokens = opts?.maxTokens ?? 200;
    const timeoutMs = opts?.timeoutMs ?? 10_000;
    try {
      const response = await Promise.race([
        this.provider.createCompletion({
          model: this.model.id,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens,
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
      ]);
      if (!response) return null;
      const choice = response.choices?.[0];
      const content = choice?.message?.content;
      if (typeof content !== 'string') return null;
      const trimmed = content.trim();
      return trimmed || null;
    } catch {
      return null;
    }
  }

  /**
   * Inject a user message mid-run. The message will be appended to the
   * conversation between the current and next agent iteration, allowing
   * the user to steer, add context, or redirect without cancelling.
   */
  inject(message: string): void {
    // Guard against empty or whitespace-only injections.
    //
    // Without this, any caller that accidentally passes an empty string
    // (missing translation key, race condition on a programmatic send,
    // stale callback, IPC edge case) ends up appending an empty user
    // message into the conversation mid-run — and the model reasonably
    // responds "did you send something?" to a blank turn. That's the
    // "blonde moment" failure mode: not attention drift, just an empty
    // turn being treated as a real one.
    //
    // Drop silently with a debug log so bugs upstream stay visible in
    // logs but don't manifest as weird agent behaviour to the user.
    if (typeof message !== 'string' || message.trim().length === 0) {
      logger.debug('[agent] inject() called with empty/invalid message — dropped');
      return;
    }
    this.pendingInterjections.push(message);
  }

  /**
   * Request a graceful pause. Unlike the abort signal (a hard, immediate
   * stop), this lets the current step finish and then exits the loop cleanly
   * at the next boundary — so a typed "wait"/"pause" never rips Ava out
   * mid-write. The conversation keeps everything completed; the user's next
   * message continues from there.
   */
  requestPause(): void {
    this.pauseRequested = true;
  }

  /**
   * Drop every queued interjection without processing it.
   *
   * Called from the extension's cancel/stop handler so user injections
   * queued during the aborted task don't silently replay as the first
   * message of the next run. Without this, "stop" + "new task" would
   * carry the last typed-but-not-yet-processed interjection into the
   * fresh turn and feel like the old task was still alive.
   */
  clearPendingInterjections(): void {
    if (this.pendingInterjections.length > 0) {
      logger.debug(`[agent] clearPendingInterjections — dropped ${this.pendingInterjections.length} queued message(s)`);
      this.pendingInterjections.length = 0;
    }
  }

  /**
   * True when at least one interjection is queued waiting to be consumed.
   * Used by Conductor orchestration (passed via the orchestrate options'
   * `hasPendingInjection` callback) to break out of the blocking persona
   * loop early when the user sends a message — without this poll, the
   * Conductor can hold the main Agent loop for 10–60 seconds on a full
   * team and silently drop the injection when control returns.
   */
  hasPendingInterjections(): boolean {
    return this.pendingInterjections.length > 0;
  }

  /**
   * Run one agent turn against the given conversation history.
   *
   * Contract: `messages` is the CALLER'S current conversation history
   * — system prompt + user turns + assistant turns + tool calls/results,
   * ending with the user's latest message to act on. The agent uses this
   * as read-only input to build its own working context (which may be
   * compressed, truncated, or trimmed internally for token economy);
   * none of those transforms leak back to the caller.
   *
   * Returns ONLY the new messages produced by this turn — assistant
   * replies, tool results, mid-turn user interjections. The caller is
   * responsible for appending them to its conversation
   * (`conversation.appendMessages(result)`).
   *
   * Before the Option 2 refactor (commit trail leading up to this) the
   * return value was the full history plus the new turn's messages, and
   * callers did `conversation.setMessages(result)` — which meant
   * compression's destructive transforms could leak across the
   * conversation boundary and silently clear user scrollback. Returning
   * only new messages makes that class of bug impossible by construction.
   */
  /**
   * Mode detection with the surface rule applied.
   *
   * `detectModeFromMessages` keys off a literal prefix in the USER's own
   * message text ('[Desktop Automation Mode]'), and knows nothing about which
   * surface it's running on. On the VS Code extension, desktop mode does not
   * exist: Microsoft blocked us over the desktop/browser tools and required
   * their removal to reinstate (v0.48.1). Without this, a marketplace user
   * could type the prefix by hand and pull desktop_* into the turn — schemas,
   * personas, mode-switch events, the lot.
   *
   * This is the second of two locks. The first is the extension host excluding
   * DESKTOP_TOOL_NAMES at registerBuiltins, so the tools are never constructed
   * there at all. Two locks, because we already broke this promise once by
   * assuming one implicit one was enough.
   */
  private detectModeForSurface(messages: Message[]): string | null {
    const mode = detectModeFromMessages(messages);
    if (mode === 'desktop' && this.toolContext.sharedState?.clientSurface === 'extension') {
      return null;
    }
    return mode;
  }

  async run(messages: Message[], onEvent: AgentEventHandler, signal?: AbortSignal): Promise<Message[]> {
    // Open a dataset trajectory for the entire run. Every avaEvents.emit()
    // inside (sync or async, in this method or any helper it calls) inherits
    // this envelope. trajectory_id is auto-generated; the consumer in
    // packages/core/src/dataset/consumer.ts only writes if a user has
    // explicitly opted in via ~/.ava/datasets/config.json — defaults are
    // all-off so this scope opens but emits nothing for unconsenting users.
    const detectedMode = (this.detectModeForSurface(messages) ?? 'work') as AvaMode;
    const previousMode = this.lastDetectedMode;
    this.lastDetectedMode = detectedMode;
    // One id for this whole turn, however many model calls it takes.
    // Generated here rather than server-side because only the agent knows
    // where a turn begins — to the platform route, each call is just another
    // HTTP request.
    this.runTurnId = randomUUID();
    // Reset per-run tool evidence for the honesty gate (claims-auditor).
    this.runToolEvidence = [];
    this.runClaimFlagged = false;
    this.lastAudit = null;
    this.honestyVerifyAttempted = false;

    // If we're nested inside an outer trajectory (e.g. AutoCoordinator
    // wrapped its own run), open a child trajectory so the chain is
    // preserved via parent_trajectory_id. Otherwise open a fresh root.
    const openTrajectory = getTrajectory()
      ? withChildTrajectory
      : withTrajectory;

    return openTrajectory(
      {
        session_id: this.sessionId,
        surface: this.surface,
        mode: detectedMode,
        model_id: this.model.id,
      },
      async () => {
        const traj = getTrajectory()!;
        let finalContent: string | null = null;

        // ── Dataset event: mode switched between turns ──────────────
        // Mode is detected per-run from message prefixes ([Plan Mode]
        // etc.). When this run's mode differs from the prior one, the
        // user explicitly switched modes — capture that as a distinct
        // event so we can train on the conditions under which mode
        // shifts happen.
        if (previousMode && previousMode !== detectedMode) {
          avaEvents.emit('mode_switch', {
            from_mode: previousMode,
            to_mode: detectedMode,
            trigger: 'user_prefix',
          });
        }

        // ── Dataset event: did the user just correct the prior turn? ──
        // Fires at the START of the new trajectory, references the
        // previous trajectory's id so training-time joins know which
        // response was the wrong one.
        const latestUser = this.findLatestNonMetaUserMessage(messages);
        if (latestUser && this.lastTrajectoryMetadata) {
          const correctionKind = categorizeCorrection(latestUser);
          if (correctionKind) {
            avaEvents.emit('correction_received', {
              corrected_trajectory_id: this.lastTrajectoryMetadata.trajectory_id,
              original_verification: this.lastTrajectoryMetadata.verified,
              correction_signature: correctionKind,
            });
          }
        }

        try {
          const result = await this.runInner(messages, onEvent, signal);
          // Best-effort: pull the final assistant text for the chain-complete
          // summary. This is shape-only (word count, not content).
          for (let i = result.length - 1; i >= 0; i--) {
            if (result[i].role === 'assistant') {
              finalContent = getTextContent(result[i].content);
              break;
            }
          }
          return result;
        } finally {
          // ── Dataset event: did Ava verify before answering? ──────
          const verifTools = pickVerificationTools(traj.toolsSoFar);
          const responseWords = finalContent
            ? finalContent.trim().split(/\s+/).filter(Boolean).length
            : 0;
          avaEvents.emit('verification_decision', {
            verified: verifTools.length > 0,
            verification_tools_used: verifTools,
            response_word_count: responseWords,
            // Question signature is mode + question-mark presence — never
            // raw text. The mode is already on the envelope so this is a
            // small additional categorisation.
            question_signature: latestUser && /\?/.test(latestUser) ? 'question' : 'imperative',
          });

          // ── Dataset event: did the evidence-gathering actually succeed? ──
          // Complements verification_decision (which only says verification
          // was *attempted*). This is the verifiability signal — whether the
          // verify tools came back ok and whether the honesty gate flagged
          // an unbacked claim. Shape-only counts/booleans from runToolEvidence.
          const verifyEvidence = this.runToolEvidence.filter((e) => VERIFICATION_TOOLS.has(e.name));
          avaEvents.emit('verification_evidence', {
            verify_tool_calls: verifyEvidence.length,
            verify_tool_successes: verifyEvidence.filter((e) => e.ok).length,
            distinct_verify_tools: new Set(verifyEvidence.map((e) => e.name)).size,
            verified_before_response: verifyEvidence.length > 0,
            claim_flagged: this.runClaimFlagged,
          });

          avaEvents.emit('tool_chain_complete', {
            tool_count: traj.toolsSoFar.length,
            total_duration_ms: Date.now() - traj.startedAt,
            outcome: traj.outcome ?? 'task_completed',
            outcome_summary: summarizeChainOutcome(finalContent),
          });

          // ── Dataset event: continuation nudge outcome ───────────────
          // If a stall was detected and a nudge fired during this run,
          // report whether the nudge actually got things back on track.
          // Optimistic default (recovered=true) is set at fire time and
          // flipped to false by the fallback-exhausted branch.
          if (traj.pendingStallEventId) {
            avaEvents.emit('continuation_nudge_fired', {
              stall_event_id: traj.pendingStallEventId,
              nudge_action: 'forcing-prompt',
              recovered: traj.nudgeRecovered ?? true,
            });
          }

          // Stash this trajectory's metadata so the NEXT run can attach
          // correction_received events to it if the user pushes back.
          this.lastTrajectoryMetadata = {
            trajectory_id: traj.trajectory_id,
            verified: verifTools.length > 0,
          };
        }
      },
    );
  }

  private async runInner(messages: Message[], onEvent: AgentEventHandler, signal?: AbortSignal): Promise<Message[]> {
    // ─── History preservation across destructive context transforms ────────
    //
    // This function treats `messages` as a working context — the array
    // that gets sent to the model each iteration. Several transforms in
    // the loop below mutate `messages` destructively: compressContext()
    // replaces older turns with a summary, truncateMessages() drops
    // messages from the start to stay under the context window. These
    // mutations are correct for model context (saving tokens) but
    // WRONG for user history — if the return value reflects the
    // compressed state, the caller persists a lossy transcript to disk
    // and the user's scrollback disappears on next load.
    //
    // Fix: track what the user's history actually is separately from
    // the model's working context. `realEvents` collects messages
    // genuinely added this turn — assistant replies, tool results,
    // interjections. Destructive transforms intercept first so anything
    // between the last snapshot point and the transform gets absorbed
    // into realEvents before the transform mutates messages out from
    // under us. `isMetaPrefix` filters synthetic user-role injections
    // (iteration warnings, compression continuation headers,
    // task-re-injection blocks) so only real events land here.
    //
    // Agent.run returns only realEvents — the caller appends them to
    // its canonical conversation. Compression and truncation are now
    // strictly internal to the working context and cannot cross the
    // conversation boundary.
    const realEvents: Message[] = [];
    let lastSnapshotOffset = messages.length;

    /** Pick up new non-meta messages since the last snapshot point. */
    const absorbSinceLastSnapshot = (): void => {
      if (messages.length > lastSnapshotOffset) {
        for (let i = lastSnapshotOffset; i < messages.length; i++) {
          const m = messages[i];
          const text = getTextContent(m.content);
          if (typeof text === 'string' && text.length > 0 && isMetaPrefix(text)) continue;
          realEvents.push(m);
        }
      }
    };

    /**
     * Return ONLY the new messages produced this turn. Caller appends
     * to their conversation. See the Agent.run() docstring for why this
     * is the return shape — compression's destructive transforms cannot
     * leak across the conversation boundary when the agent explicitly
     * returns "what was new" rather than "what the full context now
     * looks like after compression."
     */
    const finalHistory = (): Message[] => {
      absorbSinceLastSnapshot();
      return [...realEvents];
    };

    // Expose finalHistory as the recovery hook so cancelRun() in the host
    // can pull whatever Ava had accumulated when the user pressed Stop.
    // Reassigned every run; the previous run's reference becomes stale
    // (closes over a dead realEvents) but is never read again.
    this.currentRunRecoveryHook = finalHistory;
    this.repeatedToolFailures.clear();

    // ─── Recoverability backstop for compression ───────────────────────────
    // Stash the uncompressed transcript as it stands at the START of this turn
    // so the conversation_recall tool can read it. `messages` here is the full
    // canonical history the caller passed in; the compression/truncation
    // transforms below only ever REASSIGN the local `messages` variable (they
    // build new arrays, never mutate in place), so a shallow copy taken now
    // stays lossless for the whole turn even after the working context is
    // compressed. This is what makes "Ava lost context" structurally
    // impossible: the summary is the fast path, this is the source of truth.
    if (this.toolContext.sharedState) {
      (this.toolContext.sharedState as Record<string, unknown>).recallTranscript = [...messages];
    }

    // ─── Stop-command detection ────────────────────────────────────────────
    // If the user's latest message is an explicit stop command ("stop",
    // "halt", "leave it", "don't touch", "how dare you i said stop", etc.),
    // DO NOT start a new task. Acknowledge and return immediately. The
    // previous run was already aborted by the signal; this new turn should
    // not re-engage with the work the user told us to leave alone.
    //
    // This is the architectural enforcement of Rule 10. The prompt rule
    // tells the model to stop; this code ensures the agent loop doesn't
    // even give the model a chance to decide otherwise.
    const earlyUserMsg = this.findLatestNonMetaUserMessage(messages);
    if (earlyUserMsg) {
      // A typed stop/pause directive aimed at Ava ("stop", "leave it", "wait",
      // "hold on") halts here, so the model never gets a chance to re-engage
      // work the user told us to drop. Shared with the mid-run path via
      // isStopCommand so a typed halt behaves identically whenever it arrives.
      if (isStopCommand(earlyUserMsg)) {
        const stopResponse: AssistantMessage = {
          role: 'assistant',
          content: 'Stopped. Not touching anything else. Let me know when you want to continue.',
        };
        messages = [...messages, stopResponse];
        onEvent({ type: 'stream_start' });
        onEvent({ type: 'stream_delta', content: stopResponse.content! });
        onEvent({ type: 'stream_end', message: stopResponse });
        onEvent({ type: 'done', finalMessage: stopResponse });
        return finalHistory();
      }
    }

    // ─── Post-stop context restriction ─────────────────────────────────────
    // When the user pressed Stop and has now sent a new message, the full
    // prior conversation (could be 150K+ tokens) is still in `messages`.
    // Sending all of that back to the model means it draws on the prior
    // task context and continues the work the user asked us to stop.
    //
    // Fix: for the first turn after a stop marker, strip everything
    // between the system message and the marker. Keep:
    //   - system prompt (with marker content merged in as a directive)
    //   - the new user message (the only non-meta user message after the marker)
    //
    // After this turn, normal accumulation resumes. Subsequent turns see
    // the post-stop conversation as a fresh sub-thread — no leakage from
    // the terminated task.
    //
    // Pairs with the intent gate (Fix E): if the post-stop message is
    // short/conversational, the intent gate will disable tools too.
    // Combined effect: user presses Stop → types something → Ava responds
    // on the user's actual terms, not the prior task's terms.
    messages = this.maybeRestrictPostStopContext(messages);

    // ─── Classify this task for directness discipline ─────────────────────
    // Find the latest non-meta user message and run the lightweight
    // classifier. The result sets the exploration budget for this run and
    // is injected into the system prompt as a directness hint so Ava knows
    // up front how aggressively to scope her work.
    //
    // Reset exploration budget state on each run — it's per-task, not
    // per-session.
    this.readCountBeforeFirstWrite = 0;
    this.hasWrittenInThisRun = false;
    this.explorationNudgeFired = false;

    // Closure fallback state — if the agent exits the main loop with an
    // empty final assistant message, we try once more with a forcing
    // "one-sentence summary" nudge. Prevents the "she didn't say anything
    // to close out" failure where the model terminates cleanly but leaves
    // the user staring at a wall of tool calls with no visible confirmation.
    let closureFallbackAttempted = false;
    // Pre-closure verify guard — bounded to MAX_CLOSURE_VERIFY cycles per run.
    // One cycle isn't enough: when the first verify fails and the model fixes
    // it, that *recovery* edit must itself be re-verified — otherwise the fix
    // sails through unchecked. A small cap (not a single boolean) lets the fix
    // be checked while still guaranteeing exit so an unfixable verify can't
    // trap a turn. The fresh-eyes/signature escalation still fires on repeated
    // same-cause failures within these cycles.
    const MAX_CLOSURE_VERIFY = 3;
    let closureVerifyCount = 0;

    const latestUserMessage = this.findLatestNonMetaUserMessage(messages);
    if (latestUserMessage) {
      const classification = classifyTaskComplexity(latestUserMessage);
      this.currentTaskComplexity = classification.complexity;
      logger.debug(`[agent] Task classified as ${classification.complexity} (${classification.confidence} confidence) — ${classification.reasoning}`);

      // Merge directness hint into the first system message. This keeps the
      // hint anchored to the session identity rather than floating as a
      // separate message that could be compressed away.
      const hint = formatDirectnessHint(classification);
      messages = this.appendToSystemMessage(messages, `\n\n${hint}`);
    } else {
      // No user task — default to moderate budget just in case.
      this.currentTaskComplexity = 'moderate';
    }

    // Detect mode early — needed for tool filtering downstream.
    const detectedMode = this.detectModeForSurface(messages);

    // Knowledge-pack auto-activation removed in v0.59.2. The 12 builtin
    // domain packs (marketing, finance, devops, etc.) added ~750-1000
    // tokens of static framework guidance per matched keyword, which
    // frontier models like Qwen 3.7 Plus / DeepSeek V4 Pro / Mistral
    // Large 3 already cover from training. After the chat-tier
    // rebalance, that silent injection started bumping ~1-credit chat
    // turns into the next bracket without the user asking for it.
    // Net: small lift on rare turns, opaque cost on every match.
    // Removed wholesale; the desktop-automation knowledge under the
    // same module survives because it's genuine model-novel content.

    // ─── Intent nudge (Qwen Flash classifier) ─────────────────────────────
    // Soft preference, not a hard gate. Classifies the user's message as
    // task/conversational/ambiguous and injects a brief guidance nudge
    // into the system prompt. Tools remain available in all cases — the
    // nudge shapes the default response style, but the model retains
    // judgment to call tools when the request clearly warrants action.
    //
    // Why soft instead of hard: hard blocks fail catastrophically when
    // the classifier is wrong (model can't use tools on a real task,
    // users see "Tools are disabled this turn" leaking into output).
    // Soft nudges fail gracefully — false positives waste a few tokens,
    // false negatives still let the model do the right thing.
    //
    // The nudge wording is intentionally generic and non-recitable so
    // the model won't quote it back to users.
    let userIntent: UserIntent = 'task';
    const intentClassifier = this.toolContext.sharedState?.intentClassifier as IntentClassifier | undefined;
    if (intentClassifier && latestUserMessage) {
      try {
        userIntent = await intentClassifier.classify(latestUserMessage);
        logger.info(`[agent] Intent classified as '${userIntent}' for message: "${latestUserMessage.slice(0, 80)}"`);
      } catch {
        userIntent = 'task';
      }
    }

    const useNativeTools = this.model.supportsToolCalls !== false;
    const allSchemas = this.toolRegistry.getSchemas();

    // ── Mode-aware filtering ───────────────────────────────────────────
    // Every mode except code wraps the user's message in a literal tag, so
    // the ABSENCE of a tag is not missing information — it is code mode's
    // signal. run() has read it that way since it started opening
    // trajectories (`?? 'work'`); this filter read the same absence as "no
    // restrictions at all". One fact, two readings, and the cost was that
    // work's allowlist never applied: coding turns shipped all 118 schemas,
    // ~25K tokens of context spent describing recipe and health tools to
    // someone writing TypeScript. That is context not holding her actual
    // work — a capability cost, not a billing one.
    //
    // Desktop tools stay out on both branches. That was the one restriction
    // the old fallback did apply, and it is load-bearing.
    const effectiveMode = detectedMode ?? 'work';
    const modeAllowed: Set<string> | null = MODE_ALLOWED_TOOLS[effectiveMode] ?? null;
    // Keyed on the MODE, not on whether a tag was present. Keying it on tag
    // presence works today only because code mode is the untagged one — the
    // moment a `[Work Mode]` tag exists, that spelling would silently flip
    // the gate to enforce and the whole staged rollout would vanish.
    // Every other mode has been enforcing for months and continues to.
    const applyModeGate = modeAllowed !== null
      && (effectiveMode !== 'work' || WORK_TOOL_GATE === 'enforce');

    let filteredSchemas: ToolSchema[];
    if (modeAllowed && applyModeGate) {
      filteredSchemas = allSchemas.filter(s => modeAllowed.has(s.function.name) || ALWAYS_ALLOWED_TOOLS.has(s.function.name));
    } else {
      filteredSchemas = allSchemas.filter(s => !DESKTOP_ONLY_TOOLS.has(s.function.name));
    }

    if (modeAllowed && !applyModeGate) {
      const withheld = allSchemas.filter(s =>
        !modeAllowed.has(s.function.name)
        && !ALWAYS_ALLOWED_TOOLS.has(s.function.name)
        && !DESKTOP_ONLY_TOOLS.has(s.function.name)).length;
      logger.info(`[agent] work-gate(log-only): would withhold ${withheld} of ${allSchemas.length} schemas; shipping all`);
    }

    // Tools always available when the model supports them. Intent shapes
    // the response style via the nudge below, not via schema removal.
    const toolSchemas: ToolSchema[] = useNativeTools ? filteredSchemas : [];

    if (userIntent === 'conversational') {
      // Brief, generic guidance. Not framed as a command so the model
      // internalises it rather than quoting it back to the user.
      messages = this.appendToSystemMessage(
        messages,
        `\n\nStyle note: this turn's message reads conversational. Lead with a worded reply. Reach for tools only if the request clearly requires concrete action on files, commands, or the project.`,
      );
    } else if (userIntent === 'ambiguous') {
      messages = this.appendToSystemMessage(
        messages,
        `\n\nStyle note: this turn's message is ambiguous in intent. If you are not sure what action is wanted, ask a short clarifying question before acting. Tools remain available if action is clearly warranted.`,
      );
    }

    logger.info(`[agent] Starting run: model=${this.model.id} supportsToolCalls=${useNativeTools} toolSchemas=${toolSchemas.length} intent=${userIntent}${detectedMode ? ` mode=${detectedMode}` : ''}`);

    // For models without native tool_calls, inject tool descriptions into the system prompt
    if (!useNativeTools && filteredSchemas.length > 0) {
      const toolPrompt = buildToolPrompt(filteredSchemas);
      const firstMsg = messages[0];
      if (firstMsg?.role === 'system') {
        messages = [
          { ...firstMsg, content: firstMsg.content + '\n\n' + toolPrompt },
          ...messages.slice(1),
        ];
      } else {
        messages = [
          { role: 'system' as const, content: toolPrompt },
          ...messages,
        ];
      }
    }

    // Pass signal to tool execution context so tools (esp. bash) can be cancelled
    const runContext = { ...this.toolContext, signal };

    let iterations = 0;
    this.pauseRequested = false; // clear any stale pause from a prior run
    this._inThinkTag = false;
    let warningInjected = false;
    let lastToolName: string | null = null;
    let repeatCount = 0;
    const MAX_SAME_TOOL_REPEATS = 3;

    while (iterations < MAX_TOOL_CALL_ITERATIONS) {
      iterations++;
      logger.debug(`[agent] ── Iteration ${iterations}/${MAX_TOOL_CALL_ITERATIONS} ── messages=${messages.length}`);

      // ── Sliding Window — compress old messages when context is genuinely full ─
      //
      // Previously this fired whenever non-system message count exceeded
      // 30, regardless of token usage. A single task with tool-use can
      // produce 30+ messages in 3-5 user turns (each turn = user message +
      // assistant messages + tool results). That made compression fire at
      // ~2% token usage, destabilising the conversation every few turns
      // and causing Ava to lose context mid-task.
      //
      // New rule: the window compresses only when BOTH conditions are
      // true — message count is very high AND estimated tokens cross a
      // meaningful threshold. Pure message count is no longer a trigger.
      // Token-based thresholds compress when there's a real reason to,
      // not on a schedule. The absolute token check below (at 70% of
      // context) is the primary gate; this one is a secondary safety net
      // for pathological cases with tons of tiny messages.
      const WINDOW_MAX = 120; // Only extreme message counts hit this path
      const WINDOW_KEEP = 24; // Keep more recent context when it does
      const nonSystem = messages.filter(m => m.role !== 'system');
      const estimatedTokensForWindow = this.estimateTokenCount(messages);
      const windowTokenFloor = Math.floor(this.model.contextWindow * 0.5);
      if (nonSystem.length > WINDOW_MAX && estimatedTokensForWindow > windowTokenFloor) {
        const systemMsgs = messages.filter(m => m.role === 'system');
        const pinnedIdxFull = findOriginalUserTaskIndex(messages);
        const pinnedMsg = pinnedIdxFull !== -1 ? messages[pinnedIdxFull] : null;
        const toCompress = nonSystem.slice(0, nonSystem.length - WINDOW_KEEP);
        const toKeep = nonSystem.slice(nonSystem.length - WINDOW_KEEP);
        // Reference-equality check — cast to Message[] because toKeep's type
        // is narrowed by the system filter and doesn't accept Message directly.
        const pinnedInKeep = pinnedMsg ? (toKeep as Message[]).indexOf(pinnedMsg) !== -1 : false;

        // Memory policy: conversation content does NOT get saved to memory
        // here. Compression is a working-state operation — the summary
        // belongs in the conversation history (persisted per-conversation
        // in ~/.ava/history/*.json), not in user or project memory.
        //
        // Previously this block called autoExtractAndSave on the compressed
        // messages AND saved the raw summary as a "[Session context]"
        // project memory entry. Both were category errors: memory should
        // be distilled, durable facts about the user or project — not
        // conversation transcripts that get re-injected on later turns and
        // create a self-referential feedback loop.
        //
        // If something in the compressed context was worth remembering,
        // the model already had the chance to call memory_save during the
        // turn that produced it. Ambient extraction from compressed logs
        // is not the mechanism for durable memory.

        // Rebuild messages: system (with compression note merged in) + pinned
        // original task (if not already in the kept window) + recent messages.
        // Merging the compression note into the first system message avoids
        // Qwen's "system must be at beginning" error.
        const fixedKeep = this.fixToolPairing(toKeep);
        const compressionNote = [
          `[${toCompress.length} earlier messages compressed out of your working context. Your active task is still in flight — continue from where you left off. Do NOT treat this as a new conversation.]`,
          'The full transcript of those messages is still on record.',
          'If the user references something from earlier — or you need an exact detail, decision, path or value — call conversation_recall to read it from the real transcript instead of guessing.',
          'Do NOT say you don\'t have context — recall it first. Do NOT greet the user.',
        ].join(' ');

        // Session tasks re-injection — same pattern as compressContext()
        let slidingTaskBlock: Message | null = null;
        try {
          const tm = (this.toolContext.sharedState as Record<string, unknown> | undefined)?.taskManager as
            | { getSessionTasks: () => TaskEntrySnapshot[] }
            | undefined;
          if (tm && typeof tm.getSessionTasks === 'function') {
            const block = formatSessionTasksBlock(tm.getSessionTasks());
            if (block) slidingTaskBlock = { role: 'user', content: block };
          }
        } catch { /* non-critical */ }

        // Pinned original task: previously this re-injected the original
        // user message VERBATIM as a user-role message. The model saw
        // what looked like a freshly-sent user turn and responded to it
        // as if it were new input — the classic "acts on the initial
        // message again" bug after compression. Fix: fold the original
        // task text into the system prompt's compression note as a
        // reference ("the user's original ask was X"), never as a
        // replayed user turn. The model knows the task context without
        // interpreting the replay as a new request.
        let pinnedNote = '';
        if (pinnedMsg && !pinnedInKeep) {
          const pinnedText = getTextContent(pinnedMsg.content);
          if (pinnedText) {
            pinnedNote = `\n\n[Original request at session start] "${pinnedText.slice(0, 800)}" — this is context for what the user initially asked. You were already in the middle of working on this; continue from where you left off. Do NOT treat this as a new request.`;
          }
        }

        const tail: Message[] = slidingTaskBlock ? [slidingTaskBlock, ...fixedKeep] : fixedKeep;
        const mergedNote = compressionNote + pinnedNote;

        if (systemMsgs.length > 0) {
          const primary = systemMsgs[0];
          const mergedSystem = { ...primary, content: (typeof primary.content === 'string' ? primary.content : '') + '\n\n' + mergedNote };
          messages = [mergedSystem, ...tail];
        } else {
          messages = [
            { role: 'system' as const, content: mergedNote },
            ...tail,
          ];
        }

        // Notify UI about compression (uses 'info' event type)
        logger.debug(`[agent] Sliding window: compressed ${toCompress.length} messages, kept ${fixedKeep.length}`);
      }

      // Check for cancellation before each iteration
      if (signal?.aborted) {
        onEvent({ type: 'done', finalMessage: { role: 'assistant', content: null } });
        return finalHistory();
      }

      // Check for user interjections — messages the user sent mid-run.
      // Frame them neutrally: enough signal that this arrived WHILE Ava was
      // working (so she folds it into the current task instead of treating it
      // as a brand-new request) without the corrective tone of the old
      // "[User interjection]:" prefix, which primed her to read questions as
      // criticism and apologise instead of answering. The UI event still
      // carries the raw text — the frame is for the model only.
      while (this.pendingInterjections.length > 0) {
        const interjection = this.pendingInterjections.shift()!;
        messages = [
          ...messages,
          {
            role: 'user' as const,
            content: `[The user added this while you were working — take it into account and carry on]: ${interjection}`,
          },
        ];
        onEvent({ type: 'interjection', content: interjection });
      }

      // Graceful pause — the user typed "wait"/"pause" mid-run. We're at a
      // clean step boundary (the previous step's tools have finished), so end
      // the turn here rather than aborting mid-step. Everything completed
      // stays in the conversation; the user's next message continues from
      // here. Distinct from the hard stop (abort signal), which is immediate.
      if (this.pauseRequested) {
        this.pauseRequested = false;
        logger.info('[agent] Graceful pause requested — halting at step boundary');
        onEvent({ type: 'done', finalMessage: { role: 'assistant', content: null } });
        return finalHistory();
      }

      iterations++;

      // Warn the model when approaching the iteration limit
      // Injected as a user-role message to avoid Qwen's "system must be at beginning" error
      const remaining = MAX_TOOL_CALL_ITERATIONS - iterations;
      if (!warningInjected && remaining <= ITERATION_WARNING_THRESHOLD) {
        warningInjected = true;
        messages = [
          ...messages,
          {
            role: 'user' as const,
            content: `[System notice]: ${t('error.msg.iteration_warning', { remaining: String(remaining) })}`,
          },
        ];
      }

      // Trim old tool results to save tokens — but ONLY when context is
      // genuinely filling up. Trimming on raw message count (regardless of how
      // much window is free) crushed files the model still needed on multi-file
      // tasks: it would lose a file read a few turns ago, re-read it, lose
      // another, and loop forever without ever reaching an edit. Gate on the
      // token budget so we keep full tool results while there's plenty of room
      // (the common case) and only collapse them once we cross half the window.
      const trimThreshold = Math.floor(this.model.contextWindow * 0.5);
      if (this.estimateTokenCount(messages) > trimThreshold) {
        messages = this.trimOldToolResults(messages);
      }

      // Auto-compress at 70% of the model's context window, capped at
      // 400K tokens as an absolute ceiling.
      //
      // The 70% ratio is preserved for small-to-mid-sized context models
      // (128K → ~90K trigger, 256K → ~180K trigger) because the author
      // deliberately chose it to avoid compression thrash: each
      // compression pass is an LLM call that can destabilise a session
      // ("acts on the initial message again" regression). Firing too
      // eagerly is worse than firing late.
      //
      // The 400K ceiling fixes the 1M-context degenerate case — at 70%
      // of 1M every turn would send up to 700K tokens before anything
      // got summarised. On managed Qwen Plus ($0.20 / $1.20 per 1M),
      // that's ~$0.14 per turn of raw input cost, and 700K of context
      // slows every response substantially. Capping at 400K means one
      // earlier compression pass vs. carrying an extra 300K per turn
      // for 20+ turns.
      //
      // Math: trigger = min(contextWindow × 0.7, 400_000)
      const maxInputTokens = Math.min(
        Math.floor(this.model.contextWindow * 0.7),
        400_000,
      );
      const estimatedTotal = this.estimateTokenCount(messages);

      // Emit context usage so UIs can show a progress bar
      const contextPercent = Math.round((estimatedTotal / this.model.contextWindow) * 100);
      onEvent({
        type: 'context_usage',
        context: { used: estimatedTotal, limit: this.model.contextWindow, percent: contextPercent },
      });

      // Auto-compress only when we've crossed the 70% threshold AND the
      // conversation is long enough that compression has something to
      // work with (< 6 messages means there's nothing meaningful to
      // summarise — just skip).
      if (estimatedTotal > maxInputTokens && messages.length >= 6) {
        // Destructive transform — absorb any real events added since the
        // last snapshot point BEFORE the transform mutates messages, then
        // reset the offset so further additions are tracked from the new
        // post-compression length.
        absorbSinceLastSnapshot();
        const msgsBeforeCompress = messages.length;
        messages = await this.compressContext(messages, onEvent, signal);
        lastSnapshotOffset = messages.length;
        // ── Dataset event: context compression fired ────────────────────
        avaEvents.emit('context_compression', {
          operation: 'compress',
          messages_before: msgsBeforeCompress,
          messages_after: messages.length,
          tokens_before: estimatedTotal,
          token_budget: maxInputTokens,
        });
      }

      // Still over budget? Fall back to truncation.
      //
      // Previously this emitted a user-facing error telling them to
      // "Consider starting a new chat for best results" — which was both
      // misleading (compression is routine, not an error) and risky (if
      // the agent ever saw that wording in its own context, it could
      // interpret "start a new chat" as instruction and reset its
      // behaviour, which is exactly the "she acted like it was a new
      // chat" failure mode we're fixing).
      //
      // Now it emits a neutral info message that doesn't prompt the user
      // or the agent to abandon the session. The agent's active task
      // state is preserved via the pinned original user task, the
      // re-injected session tasks block, and the continuation-first
      // compression header elsewhere in this file.
      const preCount = messages.length;
      // Truncation is also destructive — same snapshot/reset pattern.
      absorbSinceLastSnapshot();
      messages = this.truncateMessages(messages, maxInputTokens);
      lastSnapshotOffset = messages.length;
      const dropped = preCount - messages.length;
      if (dropped > 0) {
        // ── Dataset event: fell back to truncation ──────────────────────
        avaEvents.emit('context_compression', {
          operation: 'truncate',
          messages_before: preCount,
          messages_after: messages.length,
          tokens_before: estimatedTotal,
          token_budget: maxInputTokens,
        });
        onEvent({
          type: 'error',
          error: Object.assign(
            new Error(`Context compressed: ${dropped} older messages summarised to memory. Continuing your current task.`),
            { code: 'context_compressed' },
          ),
        });
      }

      // ── Sanitize messages for model compatibility ──────────────────────────
      const filteredMessages = !useNativeTools
        ? messages.filter((m) => m.role !== 'tool')  // Drop any stray tool messages in text mode
        : messages;

      // Vision bridge — when the coordinator can't see images but a vision
      // provider is configured (e.g. Supernova/DeepSeek with Qwen Omni), describe
      // every image FIRST (async, cached per image) so the model gets the image
      // as text instead of a "switch model" nag. This is what lets DeepSeek "see".
      // No-op for vision-capable models. See agent/vision-bridge.ts.
      const bridgedMessages = await bridgeImagesForTextModel(
        filteredMessages,
        this.model,
        this.visionProvider,
        this.visionModel,
        this.visionDescriptionCache,
      );

      let sanitizedMessages = bridgedMessages.map((m) => {
        let msg = m;

        // Strip empty tool_calls arrays from assistant messages. Qwen
        // rejects `tool_calls: []` with a 400 error — the field must be
        // either omitted or non-empty. Upstream mutations (mode blocking,
        // budget enforcement, text-parser fallbacks) can leave an empty
        // array on the message; this is the architectural guard at the
        // API boundary so any future code path that reintroduces the bug
        // gets caught here before it reaches the provider.
        if (msg.role === 'assistant') {
          const asst = msg as AssistantMessage;
          if (Array.isArray(asst.tool_calls) && asst.tool_calls.length === 0) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { tool_calls: _empty, ...rest } = asst;
            msg = rest as Message;
          }
        }

        // Text-based tool mode: strip tool_calls from assistant messages
        // The model doesn't understand these fields — they're our internal bookkeeping
        if (!useNativeTools && msg.role === 'assistant' && (msg as AssistantMessage).tool_calls) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { tool_calls: _tc, ...rest } = msg as AssistantMessage;
          msg = rest as Message;
        }

        // Handle reasoning_content based on model capability:
        // - Thinking models (DeepSeek Reasoner, etc.): KEEP — required for multi-turn
        // - Non-thinking models: STRIP — providers reject it as input
        if (msg.role === 'assistant' && 'reasoning_content' in msg) {
          const aMsg = msg as AssistantMessage;
          if (this.model.supportsThinking) {
            if (aMsg.reasoning_content && !aMsg.content) {
              return { ...aMsg, content: '' } as Message;
            }
            return msg;
          }
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { reasoning_content: _rc, ...rest } = aMsg;
          return rest as Message;
        }

        return msg;
      });

      // Ensure all messages have string content and strip ANSI escape codes
      // Qwen rejects content: null and ANSI codes with 400 Bad Request
      sanitizedMessages = sanitizedMessages.map(m => {
        if (m.content === null || m.content === undefined) {
          return { ...m, content: '' };
        }
        if (typeof m.content === 'string') {
          // Strip all ANSI escape sequences and control characters that APIs reject.
          // no-control-regex is off for this block on purpose: matching control
          // characters IS the job here, and removing them from the pattern would
          // stop the sanitiser doing anything.
          /* eslint-disable no-control-regex */
          const cleaned = m.content
            .replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '')  // Standard ANSI escape codes
            .replace(/\u001b\][^\u0007]*\u0007/g, '')  // OSC sequences
            .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');  // Control chars (keep \n \r \t)
          /* eslint-enable no-control-regex */
          if (cleaned !== m.content) return { ...m, content: cleaned };
        }
        return m;
      });

      // Age out old content before sending — biggest token lever in the
      // agent loop. Without this, every screenshot and every verbose tool
      // result stays in full fidelity for the rest of the session, costing
      // 20-50K tokens per image × turns remaining and 1-5K tokens per
      // stale tool result × turns remaining. The model's prior reasoning
      // about these is preserved in the assistant messages; the raw
      // payload almost never adds value after 2-3 turns.
      sanitizedMessages = this.ageHistoryContent(sanitizedMessages);

      // Fix orphaned tool messages before sending — prevents 400 errors
      sanitizedMessages = this.fixToolPairing(sanitizedMessages);

      // Guard against 413: check estimated body size and truncate if too large
      // Most APIs reject bodies over 4MB. Target 3MB to leave headroom.
      const MAX_BODY_BYTES = 3 * 1024 * 1024;
      let finalMessages = sanitizedMessages;
      const estimatedSize = JSON.stringify(sanitizedMessages).length;
      if (estimatedSize > MAX_BODY_BYTES) {
        logger.warn(`[agent] Request body too large (${(estimatedSize / 1024 / 1024).toFixed(1)}MB). Truncating tool results and old messages.`);
        // First pass: truncate large tool results (keep first 500 chars)
        finalMessages = finalMessages.map(m => {
          if (m.role === 'tool' && typeof m.content === 'string' && m.content.length > 500) {
            return { ...m, content: m.content.slice(0, 500) + '\n\n[Output truncated — original was ' + m.content.length + ' chars]' };
          }
          return m;
        });
        // Second pass: if still too large, drop oldest messages (keep system + last 20)
        if (JSON.stringify(finalMessages).length > MAX_BODY_BYTES) {
          const systemMsg = finalMessages.find(m => m.role === 'system');
          const nonSystem = finalMessages.filter(m => m.role !== 'system');
          const dropped = nonSystem.slice(0, -20);
          const kept = nonSystem.slice(-20);
          // Fix orphaned tool messages after truncation
          const fixedKept = this.fixToolPairing(kept);
          finalMessages = systemMsg ? [systemMsg, ...fixedKept] : fixedKept;
          logger.warn(`[agent] Aggressive truncation: kept system + last ${fixedKept.length} messages, dropped ${dropped.length}`);

          // Memory policy: dropped conversation context does NOT get saved
          // to memory. It lives in the conversation history file on disk
          // (per-conversation, persistent) and that's where it belongs.
          // Previously this saved a concatenated transcript of dropped
          // messages to 'global' memory under a 'session' category —
          // exactly the conversation-into-memory leak we are cutting.
        }
      }

      const request: ChatCompletionRequest = {
        model: this.model.id,
        messages: finalMessages,
        tools: toolSchemas.length > 0 ? toolSchemas : undefined,
        tool_choice: toolSchemas.length > 0 ? 'auto' : undefined,
        stream: true,
        // Every iteration of this loop is another call serving the SAME user
        // turn. Tagging them all with one id is what lets a turn be costed as
        // an outcome rather than as N unrelated calls.
        turnId: this.runTurnId,
      };

      let assistantMessage: AssistantMessage;
      let promptTokens: number;
      let streamInterrupted;
      const estimatedInput = this.estimateTokenCount(messages);
      logger.debug(`[agent] Calling streamResponse (est. ${estimatedInput} input tokens, model context: ${this.model.contextWindow})`);
      try {
        const streamResult = await this.streamResponse(request, onEvent, signal);
        assistantMessage = streamResult.message;
        promptTokens = streamResult.promptTokens;
        streamInterrupted = streamResult.interrupted === true;
        logger.debug(`[agent] streamResponse returned: content=${assistantMessage.content?.length ?? 0} chars, tool_calls=${assistantMessage.tool_calls?.length ?? 0}, promptTokens=${promptTokens}${streamInterrupted ? ' (INTERRUPTED by injection)' : ''}`);
      } catch (error) {
        logger.error(`[agent] streamResponse THREW: ${error instanceof Error ? error.message : String(error)}`);
        // Surface the error through the event system so CLI/extension handle it consistently
        onEvent({ type: 'error', error: error instanceof Error ? error : new Error(String(error)) });
        // Always emit done so UI clears isStreaming/isThinking
        onEvent({ type: 'done', finalMessage: { role: 'assistant', content: '' } as any });
        return finalHistory();
      }
      // Mid-stream injection happened. We aborted the provider request
      // before tool_calls could start. Preserve any partial text in the
      // transcript (keeps UI/history honest — user saw it) but skip both
      // the text-based tool parser (partial <tool_call> blocks would
      // mis-parse) and the full tool-execution path. The outer loop will
      // drain pendingInterjections at the top of the next iteration and
      // send a fresh request to the model.
      if (streamInterrupted) {
        const hasText = typeof assistantMessage.content === 'string' && assistantMessage.content.trim().length > 0;
        if (hasText) {
          messages = [...messages, {
            role: 'assistant',
            content: assistantMessage.content,
            ...(assistantMessage.reasoning_content ? { reasoning_content: assistantMessage.reasoning_content } : {}),
          } as AssistantMessage];
        }
        continue;
      }

      // Text-based tool parsing: extract <tool_call> blocks from the model's text
      if (!useNativeTools && assistantMessage.content) {
        const { toolCalls: parsedCalls, cleanText } = parseToolCalls(assistantMessage.content);
        if (parsedCalls.length > 0) {
          logger.debug(`[agent] Parsed ${parsedCalls.length} tool calls from text output`);
          assistantMessage = {
            ...assistantMessage,
            content: cleanText || null,
            tool_calls: parsedCalls,
          };
        }
      }

      messages = [...messages, assistantMessage];

      // NOTE: Do NOT truncate here — tool results haven't been appended yet.
      // Truncation between assistant tool_calls and tool results breaks the
      // message ordering that models require. Truncation happens after tool
      // results are appended, at the top of the next loop iteration.
      //
      // The truncation call that used to sit here was disabled with
      // `if (false && ...)` rather than removed. Deleted now: the note above
      // is the part worth keeping, and dead code behind a constant false is
      // code that still has to compile, still gets read as if it might run,
      // and cannot be tested.

      // If cancelled during streaming, stop immediately
      if (signal?.aborted) {
        onEvent({ type: 'done', finalMessage: assistantMessage });
        return finalHistory();
      }

      // ─── A written tool call is still a tool call ──────────────────────
      // Some models emit <present_plan>{…}</present_plan> as TEXT instead of
      // calling the tool, even with native schemas offered. Left alone the user
      // gets raw JSON where a plan card belongs, and the turn closes cleanly
      // because the agent sees no tool_calls. Recovery is reliable where
      // instructing the model is not — the models that do this are the ones
      // least likely to follow an instruction about it.
      if (
        (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) &&
        typeof assistantMessage.content === 'string'
      ) {
        const offered = new Set(toolSchemas.map((t) => t.function.name));
        const recovered = recoverWrittenToolCalls(assistantMessage.content, offered);
        if (recovered.calls.length > 0) {
          logger.warn(
            `[agent] Recovered ${recovered.calls.length} written tool call(s) from text: ` +
            recovered.calls.map((c) => c.function.name).join(', '),
          );
          assistantMessage.tool_calls = recovered.calls;
          assistantMessage.content = recovered.text;
        }
      }

      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        logger.debug(`[agent] No tool_calls in response. content=${(assistantMessage.content ?? '').length} chars, reasoning=${(assistantMessage.reasoning_content ?? '').length} chars`);

        // ─── Pre-closure verify guard (universal) ─────────────────────
        // If the trajectory has unverified file edits, run verify_change
        // before allowing the turn to end. On pass, files move to
        // verifiedFiles and closure proceeds. On fail, inject the
        // failure report (or a fresh-eyes review if we've looped on
        // the same root cause) as user-role context and re-enter the
        // loop. Bounded to MAX_CLOSURE_VERIFY cycles per run via
        // closureVerifyCount — re-verifies recovery fixes, still guaranteed
        // to exit so an unfixable verify can't trap a turn.
        //
        // Lives in the universal agent loop, NOT AutoCoordinator, so
        // single-model BYOK chats get the same enforcement orchestrated
        // modes have always had.
        const trajForVerify = getTrajectory();
        const pendingFiles = trajForVerify ? pendingFilesAtClosure(trajForVerify) : null;
        if (
          this.loopPreventionEnabled &&
          pendingFiles &&
          pendingFiles.length > 0 &&
          closureVerifyCount < MAX_CLOSURE_VERIFY &&
          !signal?.aborted &&
          trajForVerify
        ) {
          closureVerifyCount++;
          logger.debug(`[agent] Pre-closure verify on ${pendingFiles.length} pending file(s)`);
          onEvent({ type: 'verify_started', files: pendingFiles });
          const verifyResult = await runPendingVerify(trajForVerify, this.toolContext);

          if (!verifyResult.passed) {
            onEvent({ type: 'verify_failed', files: verifyResult.files, output: verifyResult.output });
            // Record signature + check loop threshold; fall through to
            // a normal nudge or, if we've been spinning, a fresh-eyes
            // independent second opinion.
            const sig = signatureForFailure(verifyResult.output, verifyResult.files);
            recordFailure(trajForVerify, sig, 'verify');

            let nudgeContent: string;
            if (shouldEscalateFreshEyes(trajForVerify, sig)) {
              markFreshEyesEscalated(trajForVerify);
              logger.info(
                `[agent] Fresh-eyes escalation triggered — signature ${sig.slice(0, 60)}... has recurred`,
              );
              onEvent({ type: 'fresh_eyes_started', signature: sig.slice(0, 60) });
              const firstUserMsg = messages.find((m) => m.role === 'user');
              const originalTask =
                typeof firstUserMsg?.content === 'string' ? firstUserMsg.content : '';
              const review = await runFreshEyesReview({
                provider: this.provider,
                modelId: this.model.id,
                originalTask,
                files: verifyResult.files,
                cwd: this.toolContext.cwd,
                failureSummary: describeFailureLoop(trajForVerify),
                lastFailureReport: verifyResult.output,
                signal,
              });
              onEvent({ type: 'fresh_eyes_complete' });
              // Credit-fairness signal — by the time fresh-eyes has fired,
              // the user has paid for ≥3 same-signature failures + the
              // fresh-eyes call itself. Flag this turn as refund-eligible
              // so the backend can decide whether to credit the user
              // back. Token estimate: fresh-eyes max_tokens (800) plus
              // the prompt budget it builds (capped at ~10K input via
              // file/report/task budgets in fresh-eyes.ts). Conservative
              // 11_000 is the worst-case ceiling, not a measured spend —
              // backend should still cross-reference its own usage rows
              // for the authoritative number.
              onEvent({
                type: 'loop_refund_eligible',
                signature: sig.slice(0, 60),
                tokensInRecovery: 11_000,
                reason: 'fresh-eyes review fired — same-signature failure recurred 3+ times',
              });
              nudgeContent = buildFreshEyesContext(review);
            } else {
              nudgeContent = buildVerifyFailureNudge(verifyResult.output, verifyResult.files);
            }

            // Drop the closure attempt and re-prompt with the failure
            // context — gives the model real diagnostic info to act on
            // instead of letting it declare done with broken code.
            messages = messages.slice(0, -1);
            messages = [...messages, { role: 'user' as const, content: nudgeContent }];
            continue;
          }
          onEvent({ type: 'verify_passed', files: verifyResult.files });
          // Pass — fall through to existing closure logic.
        }

        // ─── Closure fallback ─────────────────────────────────────────
        // Detect two failure modes where the turn terminates without
        // actually doing visible work:
        //
        // 1. Empty close — the model finished cleanly but produced zero
        //    visible content. User sees silence after tool calls.
        //
        // 2. Continuation stall — the model produced text like "Let me
        //    rewrite the sidebar" but terminated with no tool_calls.
        //    It narrated intent but never acted. This is arguably worse
        //    than an empty close because the user sees a promise that
        //    never gets fulfilled.
        //
        // Both cases share the same fix: drop the stalled message, inject
        // a forcing nudge, re-enter the loop for one more iteration.
        // Guarded by closureFallbackAttempted so we never loop more than
        // once per run. If the nudged response is ALSO stalled, fall
        // through to the hardcoded "Done" substitution.
        const contentText = typeof assistantMessage.content === 'string'
          ? assistantMessage.content.trim()
          : '';
        const isEmptyClose = contentText.length === 0;
        const isContinuationStall = !isEmptyClose && looksLikeContinuationStall(contentText);
        // Count tool calls in this run so far (for drift detection)
        const runToolCallCount = messages.filter(m => m.role === 'assistant' && (m as any).tool_calls?.length > 0)
          .reduce((sum, m) => sum + ((m as any).tool_calls?.length ?? 0), 0);
        const isPostToolDrift = !isEmptyClose && !isContinuationStall && looksLikePostToolDrift(contentText, runToolCallCount);

        if ((isEmptyClose || isContinuationStall || isPostToolDrift) && !closureFallbackAttempted) {
          closureFallbackAttempted = true;
          const reason = isEmptyClose ? 'empty final message'
            : isContinuationStall ? 'continuation stall (narrated intent without acting)'
            : 'post-tool drift (greeting/social response after tool usage)';
          logger.debug(`[agent] Closure fallback: ${reason}, re-prompting`);

          // ── Dataset event: stall detected + nudge will fire ─────────
          // Stash the stall event_id on the trajectory so the run
          // wrapper's finally can emit continuation_nudge_fired with
          // an accurate `recovered` flag once we know whether the
          // nudge worked.
          const stallPattern = isEmptyClose ? 'empty-close'
            : isContinuationStall ? 'continuation-narration'
            : 'post-tool-drift';
          const stallEventId = avaEvents.emit('continuation_stall_detected', {
            response_summary: `${stallPattern}, ${contentText.length}ch`,
            stall_pattern: stallPattern,
          });
          const stallTraj = getTrajectory();
          if (stallTraj) {
            stallTraj.pendingStallEventId = stallEventId;
            // Optimistic default — the wrapper's finally flips this to
            // false if we hit the fallback-exhausted branch below.
            stallTraj.nudgeRecovered = true;
          }

          // Drop the stalled assistant message from history
          messages = messages.slice(0, -1);

          // Inject the appropriate forcing nudge
          const nudgeContent = isEmptyClose
            ? '[Closure check — your previous response was empty. The user needs visible confirmation that you finished. Write ONE short sentence summarising what you just did in this turn. Example: "Done — sidebar.tsx updated with the new palette." or "Fixed the missing habitId arg on line 71 of App.tsx." No tool calls. Just one sentence of text. This is the minimum required to close out a turn.]'
            : isPostToolDrift
            ? `[Context drift detected — you just used ${runToolCallCount} tools (reading files, searching, etc.) but then produced a greeting/social response instead of summarising your findings. You were in the middle of a task. The user did NOT change the subject — your attention drifted under the weight of all those tool results. Go back to the ORIGINAL task. Summarise what you found in the files you just read, present your plan, or continue working. Never produce a greeting after research.]`
            : `[Continuation check — you said "${contentText.slice(0, 120)}${contentText.length > 120 ? '…' : ''}" but then stopped without making any tool calls. You NARRATED intent but never acted on it. The user sees a promise that never got fulfilled — the worst possible UX. Do the work NOW in this response: make the actual tool calls to accomplish what you said you would. If the work genuinely can't be done, explain clearly why ("I can't X because Y"). Silence or another narration loop is not acceptable — either act or explain, no middle ground.]`;

          messages = [
            ...messages,
            { role: 'user' as const, content: nudgeContent },
          ];
          // Loop back for one more streaming call — the nudge will force
          // either tool calls or a clear explanation. Normal flow resumes
          // from there.
          continue;
        }

        // If we already tried the closure fallback and STILL got a stall,
        // substitute a hardcoded "Done." so the user sees something rather
        // than a blank turn or a broken promise. This is belt-and-braces —
        // the prompt rule should catch most cases, the fallback nudge
        // catches more, and this final substitution catches the remaining
        // edge cases where the model is genuinely broken on closure.
        if ((isEmptyClose || isContinuationStall) && closureFallbackAttempted) {
          logger.warn('[agent] Closure fallback exhausted — substituting hardcoded "Done."');
          // Mark the nudge as failed for the upcoming nudge_fired emit.
          const exhaustedTraj = getTrajectory();
          if (exhaustedTraj) exhaustedTraj.nudgeRecovered = false;
          const substitute = isContinuationStall
            ? contentText + ' [Agent stalled — closure fallback substituted this message.]'
            : 'Done.';
          assistantMessage = {
            ...assistantMessage,
            content: substitute,
          };
          messages = [...messages.slice(0, -1), assistantMessage];
        }

        // Surface empty responses — model returned nothing visible to the user
        // (kept for the edge case where both content AND reasoning are empty
        // even after the closure fallback — genuinely broken model output)
        if (!assistantMessage.content && !assistantMessage.reasoning_content) {
          onEvent({
            type: 'error',
            error: new Error(t('error.msg.empty_response')),
          });
        }
        // ─── Honesty gate: verify-or-restate (active, every-model) ─────
        // A high-stakes completion/security claim with no verifying tool
        // behind it doesn't get to close on a guess. Re-prompt once to
        // verify (call the right tool) or restate without the claim —
        // mirrors the pre-closure file-verify guard above. Bounded to one
        // attempt per run; if it still can't back it, the claims-auditor's
        // deterministic caveat floor has already annotated the reply.
        const honestyAudit = this.lastAudit;
        if (
          this.loopPreventionEnabled &&
          !this.honestyVerifyAttempted &&
          honestyAudit?.flagged &&
          (honestyAudit.tier === 'high' || honestyAudit.tier === 'critical') &&
          !signal?.aborted &&
          typeof assistantMessage.content === 'string' &&
          assistantMessage.content.trim().length > 0
        ) {
          this.honestyVerifyAttempted = true;
          logger.debug(
            `[agent] Honesty gate: unbacked ${honestyAudit.tier} claim — re-prompting to verify or restate`,
          );
          const nudge = this.buildHonestyVerifyNudge(honestyAudit);
          messages = messages.slice(0, -1);
          messages = [...messages, { role: 'user' as const, content: nudge }];
          continue;
        }

        // Memory extraction — runs post-turn, extracts genuinely durable
        // user/project facts (name, preferences, decisions, architecture).
        // Bounded by the Memory Agent's regex + single LLM call.
        this.extractMemoriesFromRun(messages, runContext);

        // Ambient hot-path writers DISABLED.
        // The following used to fire on every turn, each reading the
        // conversation and deriving persistent state from it:
        //   captureInteraction(messages)     — dataset capture
        //   this.feedProceduralObserver(...) — v3 procedural learning
        //   this.saveGraphState(runContext)  — v3 graph persistence
        //
        // Collectively they were saving conversation-shaped content into
        // memory, creating a feedback loop where earlier turns' text got
        // re-injected on later turns and re-saved. They also ran 3+
        // concurrent writers against the shared conversation state,
        // which is the likely source of the empty-tool-call corruption
        // we've been seeing in longer sessions.
        //
        // These capabilities are not deleted — they belong in a
        // session-end or scheduled background job that reads memory
        // (distilled facts only), not the live conversation. Wiring
        // that up is follow-up work; for now, the hot path stays clean.

        onEvent({ type: 'done', finalMessage: assistantMessage });
        return finalHistory();
      }
      logger.debug(`[agent] Got ${assistantMessage.tool_calls.length} tool_calls: ${assistantMessage.tool_calls.map((tc: ToolCall) => tc.function.name).join(', ')}`);

      // ── Repeated tool-call detection ───────────────────────────────────────
      // If the model calls the same tool with the same arguments 3+ times, break the loop.
      // Different arguments = different call = not a loop (e.g. list_directory on different paths).
      const currentToolSig = assistantMessage.tool_calls.map((tc: ToolCall) => `${tc.function.name}:${tc.function.arguments}`).sort().join(',');
      if (currentToolSig === lastToolName) {
        repeatCount++;
        if (repeatCount >= MAX_SAME_TOOL_REPEATS) {
          logger.warn(`[agent] HARD STOP: ${currentToolSig} called ${repeatCount + 1} times consecutively`);
          const stopMsg = `Stopped: ${currentToolSig} was called ${repeatCount + 1} times in a row and kept failing. Try a different approach or start a new chat.`;
          onEvent({
            type: 'error',
            error: Object.assign(new Error(stopMsg), { code: 'tool_loop_stopped' }),
          });
          onEvent({
            type: 'done',
            finalMessage: { role: 'assistant', content: stopMsg } as any,
          });
          const trajLoopStop = getTrajectory();
          if (trajLoopStop) trajLoopStop.outcome = 'hit_loop_limit';
          return finalHistory();
        }
      } else {
        lastToolName = currentToolSig;
        repeatCount = 0;
      }

      // ── Mode enforcement: block tools not allowed in the active mode ────
      // ALWAYS_ALLOWED_TOOLS is honoured here as well as in the schema filter
      // above. The two must agree: offering a schema and then blocking the call
      // gives the model a tool it can see and cannot use, which reads to the
      // user as Ava being broken rather than restricted.
      //
      // Gated on applyModeGate, NOT on modeAllowed. During code mode's
      // log-only stage the set is computed but the schemas all ship, and
      // blocking here would do precisely what the paragraph above forbids:
      // offer a tool and then refuse the call.
      if (modeAllowed) {
        const isAllowed = (name: string) => modeAllowed.has(name) || ALWAYS_ALLOWED_TOOLS.has(name);
        const blocked = assistantMessage.tool_calls.filter((tc: ToolCall) => !isAllowed(tc.function.name));
        if (blocked.length > 0 && !applyModeGate) {
          // The evidence worth having. The static count says what is in play;
          // this says what she actually reached for while coding — and
          // anything appearing here is a hole in the list, not a mistake by
          // her.
          //
          // Written to a FILE, not just the console. logger goes to
          // console.info, which in the VS Code extension host lands in the
          // Extension Host output and is kept nowhere — so the one signal this
          // whole staged rollout exists to collect would have been unreadable
          // by the time anyone went looking.
          //
          // The absence of this file after a real session is the result we
          // want: nothing reached for, safe to enforce.
          const names = blocked.map((tc: ToolCall) => tc.function.name).join(', ');
          logger.warn(`[agent] work-gate(log-only): REACHED ${names} — allowed through`);
          // Not from a test run. The suite drives this agent with fixture tools
          // (echo, noop, always_fails_port) that are naturally outside work's
          // allowlist, so every run appended to the REAL ~/.ava/work-gate.log
          // — 784 lines of it before anyone looked. That is both rude (library
          // code writing to a developer's home directory) and self-defeating:
          // the one signal this file exists to carry was buried in fixtures.
          if (!process.env.VITEST) try {
            appendFileSync(
              join(AVA_HOME, WORK_GATE_LOG),
              `${new Date().toISOString()}\t${this.model.id}\t${names}\n`,
              'utf8',
            );
          } catch {
            // Best effort. A diagnostic must never be the reason a turn fails.
          }
        }
        if (blocked.length > 0 && applyModeGate) {
          const blockedNames = blocked.map((tc: ToolCall) => tc.function.name).join(', ');
          logger.warn(`[agent] Mode ${effectiveMode} blocked tools: ${blockedNames}`);
          // assistantMessage is already in `messages` (pushed unconditionally
          // earlier in the loop). The original code pushed it again inside
          // the for-loop, producing duplicate assistant turns in history
          // (one extra copy per blocked tool). Just push the tool results.
          for (const tc of blocked) {
            messages.push({
              role: 'tool' as const,
              content: modeCanEditFiles(effectiveMode)
                ? `Tool "${tc.function.name}" belongs to a different mode. Call switch_mode to reach it, then carry on.`
                : `Tool "${tc.function.name}" is not available in ${effectiveMode} mode. This mode is read-only — use work mode (>>) to make changes.`,
              tool_call_id: tc.id,
            } as any);
          }
          // Remove blocked calls, keep allowed ones.
          assistantMessage.tool_calls = assistantMessage.tool_calls.filter((tc: ToolCall) => isAllowed(tc.function.name));
          if (assistantMessage.tool_calls.length === 0) {
            // Delete the field entirely — Qwen rejects `tool_calls: []`.
            // Since assistantMessage is a reference already in `messages`,
            // the deletion propagates to the history.
            delete (assistantMessage as Partial<AssistantMessage>).tool_calls;
            continue;
          }
        }
      }

      // ── Hard exploration budget enforcement ──────────────────────────────
      // Soft nudge (maybeExplorationBudgetNudge) fires once as guidance,
      // but the model can ignore it and keep reading. This block is the
      // architectural floor: if reads-before-first-write exceed 2× the
      // task-complexity budget, read-only calls are refused at the agent
      // loop BEFORE they execute. The model receives a tool result telling
      // it exactly why and what to do next. This prevents the "100 reads,
      // still no code" failure mode that burns hundreds of thousands of
      // tokens with nothing to show.
      if (!this.hasWrittenInThisRun) {
        const hardBudget = COMPLEXITY_BUDGETS[this.currentTaskComplexity];
        const hardCap = hardBudget.readCapBeforeFirstWrite * 2;
        const projectedReads = this.readCountBeforeFirstWrite
          + assistantMessage.tool_calls.filter((tc: ToolCall) => this.isReadOnlyToolCall(tc.function.name)).length;
        if (projectedReads > hardCap) {
          const blockedReads = assistantMessage.tool_calls.filter((tc: ToolCall) => this.isReadOnlyToolCall(tc.function.name));
          if (blockedReads.length > 0) {
            logger.warn(`[agent] HARD BUDGET BLOCK: ${this.readCountBeforeFirstWrite} reads already done, ${blockedReads.length} more would exceed ${hardCap} cap for ${this.currentTaskComplexity} task`);
            // Note: assistantMessage is already in `messages` (pushed
            // unconditionally earlier in the loop). Do not push it again
            // — that would produce a duplicate assistant turn.
            const refusalBody = [
              `Read budget hard-limit exceeded.`,
              ``,
              `You've made ${this.readCountBeforeFirstWrite} read-only tool calls without a single write on a ${this.currentTaskComplexity} task (hard cap: ${hardCap}).`,
              ``,
              `Further reads are blocked until you either:`,
              `  1. Commit to a write — pick the most likely correct change and make it. You have enough context.`,
              `  2. Explicitly re-scope — if this task is genuinely architectural, say so in your next response ("this is bigger than it looked because...") and the budget resets.`,
              ``,
              `Stalling on context-gathering is the failure mode. Act or explain.`,
            ].join('\n');
            for (const tc of blockedReads) {
              messages.push({
                role: 'tool' as const,
                content: refusalBody,
                tool_call_id: tc.id,
              } as any);
            }
            // Remove blocked reads, keep any non-read tool calls (writes, etc.)
            assistantMessage.tool_calls = assistantMessage.tool_calls.filter(
              (tc: ToolCall) => !blockedReads.some(b => b.id === tc.id)
            );
            if (assistantMessage.tool_calls.length === 0) {
              // Delete the field entirely — Qwen rejects `tool_calls: []`.
              delete (assistantMessage as Partial<AssistantMessage>).tool_calls;
              continue;
            }
          }
        }
      }

      // ── Parallel tool execution ──────────────────────────────────────────
      // Partition tool calls: confirmation-required run sequentially first,
      // auto-approved tools run in parallel after for speed.
      const confirmCalls: ToolCall[] = [];
      const autoCalls: ToolCall[] = [];

      for (const tc of assistantMessage.tool_calls) {
        const tool = this.toolRegistry.getTool(tc.function.name);
        if (tool && this.toolRegistry.needsConfirmation(tool)) {
          confirmCalls.push(tc);
        } else {
          autoCalls.push(tc);
        }
      }

      // Phase 1: Confirmation-required tools (sequential — user must approve each)
      for (const toolCall of confirmCalls) {
        if (signal?.aborted) {
          onEvent({ type: 'done', finalMessage: assistantMessage });
          return finalHistory();
        }

        // Auto-checkpoint before write/dangerous tools
        const toolDef = this.toolRegistry.getTool(toolCall.function.name);
        if (toolDef && (toolDef.riskLevel === 'write' || toolDef.riskLevel === 'dangerous')) {
          const cp = runContext.sharedState?.checkpointManager as { hasActiveCheckpoint(): boolean; createCheckpoint(): Promise<unknown> } | undefined;
          if (cp && !cp.hasActiveCheckpoint()) {
            try { await cp.createCheckpoint(); } catch { /* best-effort */ }
          }
        }

        messages = await this.executeToolCall(toolCall, runContext, onEvent, messages, useNativeTools);
      }

      // Phase 2: Auto-approved tools (parallel via Promise.allSettled)
      if (autoCalls.length > 0) {
        if (signal?.aborted) {
          onEvent({ type: 'done', finalMessage: assistantMessage });
          return finalHistory();
        }

        // Auto-checkpoint if any auto-approved tool is write/dangerous
        const hasRiskyAuto = autoCalls.some(tc => {
          const td = this.toolRegistry.getTool(tc.function.name);
          return td && (td.riskLevel === 'write' || td.riskLevel === 'dangerous');
        });
        if (hasRiskyAuto) {
          const cp = runContext.sharedState?.checkpointManager as { hasActiveCheckpoint(): boolean; createCheckpoint(): Promise<unknown> } | undefined;
          if (cp && !cp.hasActiveCheckpoint()) {
            try { await cp.createCheckpoint(); } catch { /* best-effort */ }
          }
        }

        // Fire all start events
        for (const tc of autoCalls) {
          onEvent({ type: 'tool_call_start', toolCall: tc });
        }

        // Execute all in parallel
        const results = await Promise.allSettled(
          autoCalls.map(async (tc) => {
            let parsedArgs: Record<string, unknown>;
            try { parsedArgs = JSON.parse(tc.function.arguments); } catch { parsedArgs = {}; }
            const ctx = {
              ...runContext,
              // Thread the model's tool_call ID so any confirmation handler
              // (auto tools should never trigger one, but this is defensive)
              // can match cards to the exact tool call.
              toolCallId: tc.id,
              onOutput: (data: string) => {
                onEvent({ type: 'tool_call_partial', toolCallId: tc.id, data });
              },
            };
            return this.executeToolWithCapture(tc.function.name, parsedArgs, ctx);
          })
        );

        // Append results in order (API requires tool messages match tool_call order)
        for (let i = 0; i < autoCalls.length; i++) {
          const toolCall = autoCalls[i];
          const settled = results[i];
          const result = settled.status === 'fulfilled'
            ? settled.value
            : { success: false, output: `Tool failed: ${settled.reason}`, metadata: undefined };

          onEvent({
            type: 'tool_call_end',
            toolCall,
            result: result.output,
            success: result.success,
            metadata: result.metadata,
          });

          if (useNativeTools) {
            messages = [
              ...messages,
              {
                role: 'tool' as const,
                tool_call_id: toolCall.id,
                content: result.output,
              },
            ];
          } else {
            // Text-based mode: send tool results as user messages
            messages = [
              ...messages,
              {
                role: 'user' as const,
                content: formatToolResult(toolCall.function.name, result.output, result.success),
              },
            ];
          }

          // Vision pipeline — downsample before embedding to cap per-image
          // token cost. Full-res screenshots burn 20-50K tokens each and
          // get re-sent on every subsequent turn.
          if (result.metadata?.base64_image) {
            const rawBase64 = result.metadata.base64_image as string;
            const resizedBase64 = downsampleScreenshotBase64(rawBase64);
            messages = [
              ...messages,
              {
                role: 'user' as const,
                content: [
                  { type: 'text' as const, text: `[Image captured by ${toolCall.function.name}]` },
                  { type: 'image_url' as const, image_url: {
                    url: `data:${(result.metadata.mime_type as string) || 'image/png'};base64,${resizedBase64}`,
                  }},
                ],
              },
            ];
          }
        }

        // ─── Dynamic design context re-injection ─────────────────────────
        // If any tool call in this batch wrote or edited a UI file, refresh
        // the Decisions/design context into the message history so it's in
        // attention for the NEXT turn — not buried behind whatever error
        // recovery or other noise has accumulated. One injection per batch,
        // even if multiple UI files were touched. Throttled by turn count
        // and file mtime cache so we don't re-read the same files 20 times.
        const uiBatchPath = this.findUIFilePathInBatch(autoCalls);
        if (uiBatchPath) {
          this.designReinjectionTurn++;
          const reinject = await maybeBuildDesignReinjection(
            runContext.cwd,
            uiBatchPath,
            {
              currentTurn: this.designReinjectionTurn,
              lastInjectedTurn: this.designReinjectionLastTurn,
              lastMtimes: this.designReinjectionLastMtimes,
            },
          );
          if (reinject) {
            messages = [
              ...messages,
              { role: 'user' as const, content: reinject.content },
            ];
            this.designReinjectionLastTurn = this.designReinjectionTurn;
            this.designReinjectionLastMtimes = reinject.updatedMtimes;
          }
        }

        // ─── Exploration budget nudge ──────────────────────────────────
        // Count read-only tool calls in this batch. If the agent has done
        // too much exploration without committing to a write, inject a
        // soft nudge telling her to commit or justify. Never hard-stops.
        const nudge = this.maybeExplorationBudgetNudge(autoCalls);
        if (nudge) {
          messages = [
            ...messages,
            { role: 'user' as const, content: nudge },
          ];
        }
      }
    }

    const iterError = new Error(
      t('error.msg.iteration_limit', { limit: String(MAX_TOOL_CALL_ITERATIONS) }),
    );
    (iterError as Error & { code?: string }).code = 'iterations_exceeded';
    onEvent({ type: 'error', error: iterError });
    // Always emit done so the UI clears isStreaming
    onEvent({ type: 'done', finalMessage: { role: 'assistant', content: 'Stopped: tool call iteration limit reached.' } as any });
    // Extract memories on iteration limit — bounded extraction only.
    // Dataset capture, procedural observer, graph state save: disabled
    // from the hot path (see the clean-exit branch above for the full
    // rationale).
    this.extractMemoriesFromRun(messages, runContext);
    return finalHistory();
  }

  /**
   * Extract and save memories from a completed run.
   * Fire-and-forget — never blocks the response.
   * Errors are logged at debug level so they don't spam the UI but are visible for debugging.
   */
  private extractMemoriesFromRun(messages: Message[], runContext: ToolExecutionContext): void {
    const ma = runContext.sharedState?.memoryAgent as { extractAndSave: (msgs: Message[], cid?: string) => Promise<number> } | undefined;
    const mm = runContext.sharedState?.memoryManager as MemoryManager | undefined;

    if (ma) {
      // Memory Agent: single extraction call (regex + LLM reflection)
      logger.debug('[memory] Running Memory Agent extraction');
      ma.extractAndSave(messages)
        .then(saved => {
          if (saved > 0) logger.info(`[memory] Memory Agent saved ${saved} ${saved === 1 ? 'memory' : 'memories'}`);
          else logger.debug('[memory] Memory Agent: 0 memories extracted from this turn');
        })
        .catch(err => logger.warn(`[memory] Memory Agent extraction failed: ${err instanceof Error ? err.message : String(err)}`));
    } else if (mm) {
      // Legacy fallback (Memory Agent unavailable): regex extraction only.
      // Previously this ran three additional passes — reflectAndSave
      // (LLM reflection), trackAndLearn (pattern tracking), and every
      // 6 user turns analyseAndSave (insights consolidation). Each was a
      // concurrent writer reading the conversation and deriving memory
      // from it. Together they (a) quadrupled the per-turn LLM spend on
      // ambient memory work and (b) produced conversation-shaped memory
      // entries that fed back into later turns.
      //
      // Keeping only autoExtractAndSave here: it's regex-based, bounded,
      // and the narrowest path. If its heuristics still save conversation
      // snippets rather than durable facts, that's a follow-up tightening.
      logger.debug('[memory] Running legacy memory extraction (regex only)');
      autoExtractAndSave(messages, mm)
        .then(saved => {
          if (saved > 0) logger.info(`[memory] Auto-extract saved ${saved} ${saved === 1 ? 'memory' : 'memories'}`);
          else logger.debug('[memory] Auto-extract: 0 memories from regex patterns');
        })
        .catch(err => logger.warn(`[memory] Auto-extract failed: ${err instanceof Error ? err.message : String(err)}`));
    } else {
      logger.debug('[memory] No memoryManager in sharedState — skipping extraction. Is memory wired correctly?');
    }
  }

  private async streamResponse(
    request: ChatCompletionRequest,
    onEvent: AgentEventHandler,
    signal?: AbortSignal,
  ): Promise<{ message: AssistantMessage; promptTokens: number; interrupted?: boolean }> {
    onEvent({ type: 'stream_start' });

    let content = '';
    let reasoningContent = '';
    let usage: TokenUsage | undefined;
    // Holds back a written tool call while it streams. Built from the tools
    // actually offered this turn, so it can only ever hide something that
    // recoverWrittenToolCalls would go on to lift out of the finished reply.
    const writtenCallFilter = new WrittenCallStreamFilter(
      new Set((request.tools ?? []).map((t) => t.function.name)),
    );
    const toolCallsAccumulator = new Map<
      number,
      {
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }
    >();

    // Local controller linked to the parent signal. Lets us abort the
    // streaming request from inside the loop (on mid-stream user
    // injection) without touching the outer agent signal — the outer
    // run isn't cancelled, just this single streamResponse call.
    const localController = new AbortController();
    const forwardAbort = () => localController.abort();
    if (signal?.aborted) {
      localController.abort();
    } else {
      signal?.addEventListener('abort', forwardAbort);
    }

    // Flag set when we abort due to a mid-stream injection so the
    // caller knows to loop without attempting tool execution on a
    // partial response.
    let interruptedByInjection = false;

    try {
      for await (const chunk of this.provider.createStreamingCompletion(request, localController.signal)) {
        if (chunk.usage) {
          usage = chunk.usage;
        }

        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        // Thinking/reasoning content (DeepSeek R1, GLM, Kimi, Mistral Magistral)
        const thinking = delta.reasoning_content ?? delta.reasoning;
        if (thinking) {
          // Some models leak literal <think>/</think> markers into the reasoning
          // field — strip them so they never render as raw text in the thought bubble.
          const cleaned = thinking.replace(/<\/?think>/g, '');
          if (cleaned) {
            reasoningContent += cleaned;
            onEvent({ type: 'thinking_delta', content: cleaned });
          }
        }

        if (delta.content) {
          // COERCE TO TEXT FIRST. delta.content was assumed to be a string and
          // concatenated straight onto the reply — so a provider that streams
          // it as a content-part object (or an array of them) produced one
          // "[object Object]" per chunk, and the user got a wall of them where
          // the answer should be. Seen live 2026-08-18 on a self_inspect turn.
          //
          // Nothing downstream can recover from it either: by the time it is
          // in `content` the real text is gone, so the transcript, the history
          // file and the next request all carry the same rubbish.
          //
          // getTextContent handles both string and ContentPart[]; the object
          // case is a single part, so it is wrapped before extraction.
          const rawDelta: unknown = delta.content;
          let visibleContent = typeof rawDelta === 'string'
            ? rawDelta
            : getTextContent(
                (Array.isArray(rawDelta) ? rawDelta : [rawDelta]) as unknown as ContentPart[],
              );
          if (!visibleContent) continue;
          if (visibleContent.includes('<think>') || visibleContent.includes('</think>') || this._inThinkTag) {
            // Track if we're inside a think tag across chunks
            const parts = visibleContent.split(/(<\/?think>)/);
            let visible = '';
            for (const part of parts) {
              if (part === '<think>') { this._inThinkTag = true; continue; }
              if (part === '</think>') { this._inThinkTag = false; continue; }
              if (this._inThinkTag) {
                reasoningContent += part;
                onEvent({ type: 'thinking_delta', content: part });
              } else {
                visible += part;
              }
            }
            visibleContent = visible;
          }
          if (visibleContent) {
            // Raw content accumulates in full — recoverWrittenToolCalls reads
            // it after the stream. Only the VIEW is filtered, so a written call
            // never reaches the screen on its way to becoming a real one.
            content += visibleContent;
            const showable = writtenCallFilter.push(visibleContent);
            if (showable) onEvent({ type: 'stream_delta', content: showable });
          }
        }

        if (delta.tool_calls) {
          if (toolCallsAccumulator.size === 0) {
            logger.debug('[agent] First tool_call delta received in stream');
          }
          for (const tcDelta of delta.tool_calls) {
            if (!toolCallsAccumulator.has(tcDelta.index)) {
              toolCallsAccumulator.set(tcDelta.index, {
                id: tcDelta.id ?? '',
                type: 'function',
                function: { name: '', arguments: '' },
              });
            }
            const acc = toolCallsAccumulator.get(tcDelta.index)!;
            if (tcDelta.id) acc.id = tcDelta.id;
            if (tcDelta.function?.name) acc.function.name += tcDelta.function.name;
            if (tcDelta.function?.arguments) acc.function.arguments += tcDelta.function.arguments;
          }
        }

        // Mid-stream injection check. If the user sent a message while the
        // model was streaming, abort this stream and let the outer loop
        // pick up the interjection on its next iteration (where
        // pendingInterjections gets drained at the top of the loop).
        //
        // Interrupting mid-tool-call would leave dangling tool_calls in
        // history with no matching tool results — most providers 400 on
        // that. Only interrupt while we're in the text/thinking phase,
        // before any tool_calls have started accumulating.
        if (this.pendingInterjections.length > 0 && toolCallsAccumulator.size === 0) {
          logger.debug('[agent] Mid-stream injection arrived — aborting stream, interjection will fire next iteration');
          interruptedByInjection = true;
          localController.abort();
          break;
        }
      }
    } catch (error) {
      // If we aborted locally because of an injection, fall through to the
      // normal return path with interruptedByInjection=true. The outer
      // loop handles the partial message without running tools.
      if (interruptedByInjection) {
        // intentional: swallow the abort error, continue to the return below
      } else if (content || reasoningContent || toolCallsAccumulator.size > 0) {
        // Preserve partial content AND accumulated tool calls if we collected any before the error
        const partialToolCalls: ToolCall[] = toolCallsAccumulator.size > 0
          ? Array.from(toolCallsAccumulator.values()).filter(tc => tc.id && tc.function.name)
          : [];
        const partialMessage: AssistantMessage = {
          role: 'assistant',
          content: content || null,
          ...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
          ...(partialToolCalls.length > 0 ? { tool_calls: partialToolCalls } : {}),
        };
        // The turn is failing, so nothing downstream will lift a written call
        // out of it. Release whatever the filter was holding rather than lose
        // it — a half-typed tag on screen beats a silently truncated reply.
        const pending = writtenCallFilter.flush();
        if (pending) onEvent({ type: 'stream_delta', content: pending });
        onEvent({ type: 'stream_end', message: partialMessage });
        throw error;
      } else {
        throw error;
      }
    } finally {
      signal?.removeEventListener('abort', forwardAbort);
    }

    // Anything still held that never became a call is ordinary text and is
    // owed to the reader. A confirmed call is dropped here on purpose: the
    // recovery lifts it from `content`, so re-emitting it would put back the
    // exact block this filter exists to withhold.
    const heldText = writtenCallFilter.flush();
    if (heldText) onEvent({ type: 'stream_delta', content: heldText });

    const toolCalls: ToolCall[] =
      toolCallsAccumulator.size > 0 ? Array.from(toolCallsAccumulator.values()) : [];

    // DeepSeek Reasoner rule: "If reasoning_content is set, content must not be empty."
    // When the model returns reasoning + tool_calls but no text, content would be null —
    // which causes a 400 on the next request if reasoning_content is also present.
    let finalContent = (!content && reasoningContent) ? '' : (content || null);

    // Honesty gate (soft): on the user-facing answer turn (no tool calls),
    // flag a state-claim ("done" / "it works" / "it's live") that ran no
    // verifying tool this run, and append a visible caveat so the unverified
    // claim doesn't stand as fact. Soft by design — annotates, never blocks.
    if (toolCalls.length === 0 && typeof finalContent === 'string' && finalContent.trim()) {
      const audit = auditClaims({ text: finalContent, toolsUsed: this.runToolEvidence });
      this.lastAudit = audit;
      if (audit.flagged) {
        // Record for the verification_evidence dataset event (shape-only:
        // a boolean, never the claim text). Captured even when there's no
        // caveat string, so the signal reflects every flagged claim.
        this.runClaimFlagged = true;
      }
      // Active honesty gate: a high/critical claim with no verifying tool is
      // about to get one verify-or-restate re-prompt in runInner — so DON'T
      // append the caveat yet in that case. Append it now for soft claims,
      // once the re-prompt is already spent, or when loop prevention is off:
      // that's the deterministic floor.
      const willReRun =
        this.loopPreventionEnabled &&
        !this.honestyVerifyAttempted &&
        (audit.tier === 'high' || audit.tier === 'critical');
      if (audit.flagged && audit.caveat && !willReRun) {
        const caveatText = `\n\n${audit.caveat}`;
        onEvent({ type: 'stream_delta', content: caveatText });
        finalContent = finalContent + caveatText;
      }
    }

    const message: AssistantMessage = {
      role: 'assistant',
      content: finalContent,
      ...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    };

    onEvent({ type: 'stream_end', message });

    if (usage) {
      let cost: number | undefined;
      if (this.model.pricing) {
        cost =
          (usage.prompt_tokens / 1_000_000) * this.model.pricing.inputPerMillion +
          (usage.completion_tokens / 1_000_000) * this.model.pricing.outputPerMillion;
      }
      onEvent({ type: 'usage', usage, cost });
    }

    // Meter the call — one chat_turn charge per agent iteration. A multi-
    // iteration agent (tool loop) emits one per loop, which is the intended
    // granularity. Cache-hit detection uses cached_tokens ratio: if >50% of
    // prompt was cached, treat as a cache hit for discount purposes.
    // No cast needed since TokenUsage declares the cache fields it always
    // carried at runtime. The `as unknown as` this replaced was the tell:
    // the shape was known to be wider than the type all along.
    const rawUsage = extractUsage(usage);
    const cacheHit = rawUsage?.cached != null && rawUsage.input > 0 && rawUsage.cached / rawUsage.input > 0.5;
    chargeCredits('chat_turn', {
      model: this.model.id,
      rawTokens: rawUsage,
      cacheHit,
    });

    return {
      message,
      promptTokens: usage?.prompt_tokens ?? 0,
      ...(interruptedByInjection ? { interrupted: true } : {}),
    };
  }

  // ── Single tool call execution (used by sequential confirmation phase) ──

  /**
   * Run a tool through the registry while emitting `tool_choice` /
   * `tool_result` dataset events around the call. Returns the same
   * shape `toolRegistry.execute` does — never throws (registry
   * exceptions are converted to a failure result, mirroring the
   * existing executeToolCall behaviour). Both the sequential and
   * parallel tool paths in `runInner` go through this helper so the
   * dataset trajectory captures every tool invocation in order.
   */
  private async executeToolWithCapture(
    toolName: string,
    args: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<{ output: string; success: boolean; metadata?: Record<string, unknown> }> {
    const traj = getTrajectory();
    const prevTools = traj?.toolsSoFar ? [...traj.toolsSoFar] : [];

    // ── Recovery-action emit ────────────────────────────────────────────
    // If the previous tool in this trajectory failed, the upcoming choice
    // is implicitly Ava's recovery move. Emit recovery_action linking
    // back to the specific tool_error before the new choice fires so the
    // ordering in the dataset reflects cause → response.
    const recoveringFromErrorId = traj?.pendingErrorEventId;
    if (recoveringFromErrorId) {
      const lastTool = prevTools[prevTools.length - 1];
      const recoveryKind: 'retry_same' | 'retry_with_change' | 'switch_tool' =
        lastTool === toolName ? 'retry_same' : 'switch_tool';
      avaEvents.emit('recovery_action', {
        tool_error_event_id: recoveringFromErrorId,
        recovery_kind: recoveryKind,
        next_tool: toolName,
      });
      if (traj) traj.pendingErrorEventId = undefined;
    }

    const choiceEventId = avaEvents.emit('tool_choice', {
      tool_name: toolName,
      args_summary: summarizeToolArgs(toolName, args),
      // Process category for WHY this tool was reached for — deterministic
      // from the tool + whether we're recovering from a prior failure.
      // A label, never the model's raw chain-of-thought.
      reasoning_summary: categorizeToolPurpose(toolName, { recovering: !!recoveringFromErrorId }),
      prev_tools_in_trajectory: prevTools,
    });

    if (traj?.toolsSoFar) traj.toolsSoFar.push(toolName);

    const start = Date.now();
    let result: { output: string; success: boolean; metadata?: Record<string, unknown> };
    try {
      result = await this.toolRegistry.execute(toolName, args, ctx);
    } catch (err) {
      result = {
        output: `Tool error: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      };
    }

    const resultEventId = avaEvents.emit('tool_result', {
      tool_name: toolName,
      tool_choice_event_id: choiceEventId,
      success: result.success,
      result_summary: summarizeToolResult(result.output, result.success),
      duration_ms: Date.now() - start,
      error_summary: result.success ? undefined : result.output.slice(0, 200),
    });

    // Record for the soft honesty gate: did a verifying tool succeed this run?
    this.runToolEvidence.push({ name: toolName, ok: result.success });

    // ── Tool-error + guidance emits ─────────────────────────────────────
    // On failure, emit tool_error with the matched pattern key (if any),
    // followed by error_guidance_applied if the pattern library produced
    // user-facing fix advice. Stash the tool_error event_id on the
    // trajectory so the next tool_choice can attach a recovery_action.
    if (!result.success) {
      const matched = matchToolError(result.output);
      const errorEventId = avaEvents.emit('tool_error', {
        tool_name: toolName,
        tool_result_event_id: resultEventId,
        error_pattern_match: matched?.pattern_key,
        error_summary: result.output.slice(0, 200),
      });
      if (matched) {
        avaEvents.emit('error_guidance_applied', {
          tool_error_event_id: errorEventId,
          pattern: matched.pattern_key,
          // Guidance text is bounded and contains no user data — it's
          // canonical advice strings from the pattern library — so
          // capturing a short summary is safe.
          guidance_summary: matched.guidance.slice(0, 200),
        });
      }
      if (traj) traj.pendingErrorEventId = errorEventId;
    }

    // ── Post-edit verify tracking ─────────────────────────────────────
    // Universal hook: every successful file_write / file_edit registers
    // its target on the trajectory's pendingVerifyFiles. Read by the
    // closure-time verify guard in runInner so unverified edits can't
    // sneak past a turn-end. Lives here (not in AutoCoordinator) so
    // every routing mode — Maestro / Supernova / Aurora / direct BYOK —
    // gets the same enforcement.
    if (traj) {
      recordEditFromTool(traj, toolName, args, result.success);
    }

    return result;
  }

  private async executeToolCall(
    toolCall: ToolCall,
    runContext: ToolExecutionContext,
    onEvent: AgentEventHandler,
    messages: Message[],
    useNativeTools = true,
  ): Promise<Message[]> {
    onEvent({ type: 'tool_call_start', toolCall });

    let parsedArgs: Record<string, unknown>;
    try {
      parsedArgs = JSON.parse(toolCall.function.arguments);
    } catch {
      parsedArgs = {};
    }

    const toolRunContext = {
      ...runContext,
      // Thread the model's tool_call ID through so the confirmation handler
      // can forward it to the UI for exact-match card attachment.
      toolCallId: toolCall.id,
      onOutput: (data: string) => {
        onEvent({ type: 'tool_call_partial', toolCallId: toolCall.id, data });
      },
    };

    const result = await this.executeToolWithCapture(
      toolCall.function.name,
      parsedArgs,
      toolRunContext,
    );

    onEvent({
      type: 'tool_call_end',
      toolCall,
      result: result.output,
      success: result.success,
      metadata: result.metadata,
    });

    // ── Same call, same failure, again ──────────────────────────────────
    //
    // Two identical failures is evidence. The third attempt is told to stop and
    // ask, because nothing about the call has changed and nothing about the
    // result will. The message replaces the tool output rather than joining it:
    // repeating the same error text a third time is what convinced the model to
    // try a fourth.
    const failKey = `${toolCall.function.name}:${toolCall.function.arguments}`;
    let output = result.output;
    if (!result.success) {
      const n = (this.repeatedToolFailures.get(failKey) ?? 0) + 1;
      this.repeatedToolFailures.set(failKey, n);
      if (n >= 3) {
        output = `${result.output}

[This is attempt ${n} of \`${toolCall.function.name}\` with identical arguments, and it has failed the same way every time. Do NOT call it again with these arguments — nothing has changed, so nothing will. Tell the user plainly what failed and what the error said, and either change the approach or ask them how they want to proceed.]`;
      }
    } else {
      this.repeatedToolFailures.delete(failKey);
    }

    if (useNativeTools) {
      messages = [
        ...messages,
        {
          role: 'tool' as const,
          tool_call_id: toolCall.id,
          content: output,
        },
      ];
    } else {
      // Text-based mode: send tool results as user messages
      messages = [
        ...messages,
        {
          role: 'user' as const,
          content: formatToolResult(toolCall.function.name, output, result.success),
        },
      ];
    }

    // Vision pipeline
    if (result.metadata?.base64_image) {
      messages = [
        ...messages,
        {
          role: 'user' as const,
          content: [
            { type: 'text' as const, text: `[Image captured by ${toolCall.function.name}]` },
            { type: 'image_url' as const, image_url: {
              url: `data:${(result.metadata.mime_type as string) || 'image/png'};base64,${result.metadata.base64_image}`,
            }},
          ],
        },
      ];
    }

    // Dynamic design context re-injection — same treatment as the parallel
    // batch path. Throttled by turn count and mtime cache.
    const uiPath = this.findUIFilePathInBatch([toolCall]);
    if (uiPath) {
      this.designReinjectionTurn++;
      const reinject = await maybeBuildDesignReinjection(
        runContext.cwd,
        uiPath,
        {
          currentTurn: this.designReinjectionTurn,
          lastInjectedTurn: this.designReinjectionLastTurn,
          lastMtimes: this.designReinjectionLastMtimes,
        },
      );
      if (reinject) {
        messages = [
          ...messages,
          { role: 'user' as const, content: reinject.content },
        ];
        this.designReinjectionLastTurn = this.designReinjectionTurn;
        this.designReinjectionLastMtimes = reinject.updatedMtimes;
      }
    }

    // Exploration budget nudge — same as parallel path
    const seqNudge = this.maybeExplorationBudgetNudge([toolCall]);
    if (seqNudge) {
      messages = [
        ...messages,
        { role: 'user' as const, content: seqNudge },
      ];
    }

    return messages;
  }

  /**
   * Scan a batch of tool calls for a UI file write/edit and return the first
   * matching file path. Returns undefined if no UI file was touched.
   * Used by the design context re-injection hook to decide whether to refresh
   * the Decisions/design/* content into the next LLM turn.
   */
  private findUIFilePathInBatch(toolCalls: ToolCall[]): string | undefined {
    for (const tc of toolCalls) {
      if (tc.function.name !== 'file_write' && tc.function.name !== 'file_edit') continue;
      try {
        const args = JSON.parse(tc.function.arguments);
        const filePath = (args.file_path ?? args.path) as string | undefined;
        if (filePath && isUIFilePathLocal(filePath)) return filePath;
      } catch { /* malformed args — skip */ }
    }
    return undefined;
  }

  // ─── Task classification + exploration budget helpers ──────────────────

  /**
   * Walk the message array backwards to find the most recent user-role
   * message that represents a real user request (not a meta injection like
   * a memory brief or compression summary). Returns the text content, or
   * null if nothing qualifies.
   */
  private findLatestNonMetaUserMessage(messages: Message[]): string | null {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== 'user') continue;
      const text = getTextContent(m.content);
      if (!text.trim()) continue;
      if (isMetaPrefix(text)) continue;
      return text;
    }
    return null;
  }

  /**
   * Append text to the first system-role message's content, or prepend a
   * new system message if none exists. Used to merge the directness hint
   * into the session prompt without creating a separate system message
   * (which would break Qwen's "system must be at beginning" rule).
   */
  private appendToSystemMessage(messages: Message[], text: string): Message[] {
    if (messages.length > 0 && messages[0].role === 'system') {
      const existing = typeof messages[0].content === 'string' ? messages[0].content : '';
      return [
        { ...messages[0], content: existing + text },
        ...messages.slice(1),
      ];
    }
    // No system message — prepend one
    return [
      { role: 'system' as const, content: text.trimStart() },
      ...messages,
    ];
  }

  /**
   * Classify a tool call as a read-only exploration call (file_read, glob,
   * grep, list_directory, find_symbol, project_index) vs a write/action
   * call (file_write, file_edit, bash, git_*, etc). Used by the exploration
   * budget tracker to count "reads before first write" for each run.
   */
  private isReadOnlyToolCall(name: string): boolean {
    return (
      name === 'file_read' ||
      name === 'glob' ||
      name === 'grep' ||
      name === 'list_directory' ||
      name === 'find_symbol' ||
      name === 'project_index' ||
      name === 'git_status' ||
      name === 'git_diff' ||
      name === 'docs_lookup'
    );
  }

  private isWriteCapableToolCall(name: string): boolean {
    return (
      name === 'file_write' ||
      name === 'file_edit' ||
      name === 'bash' ||
      name === 'git_commit' ||
      name === 'git_create_pr'
    );
  }

  /**
   * After each batch of tool calls, update the exploration budget state
   * and return a nudge message if the budget has been exceeded. The nudge
   * is a soft signal — it's injected into the next LLM call's context
   * telling the agent "you're stalling, commit to a direction." It never
   * hard-stops the run; graceful escalation is the design intent.
   *
   * Returns null if no nudge is needed, or the nudge message body if the
   * caller should inject it before the next turn.
   */
  private maybeExplorationBudgetNudge(toolCalls: ToolCall[]): string | null {
    // Count this batch's reads + detect any writes
    let batchReads = 0;
    let batchHadWrite = false;
    for (const tc of toolCalls) {
      if (this.isReadOnlyToolCall(tc.function.name)) batchReads++;
      if (this.isWriteCapableToolCall(tc.function.name)) batchHadWrite = true;
    }

    // If she wrote at all, mark the run as "past the exploration phase"
    // and stop counting. The budget is specifically about read-before-write.
    if (batchHadWrite || this.hasWrittenInThisRun) {
      this.hasWrittenInThisRun = true;
      return null;
    }

    this.readCountBeforeFirstWrite += batchReads;

    // Don't re-fire the nudge once it's fired — one soft signal per run
    if (this.explorationNudgeFired) return null;

    const budget = COMPLEXITY_BUDGETS[this.currentTaskComplexity];
    if (this.readCountBeforeFirstWrite < budget.readCapBeforeFirstWrite) return null;

    this.explorationNudgeFired = true;
    logger.debug(`[agent] Exploration budget nudge: ${this.readCountBeforeFirstWrite} reads before first write (cap ${budget.readCapBeforeFirstWrite}) for ${this.currentTaskComplexity} task`);

    return [
      `[Exploration budget check — ${this.readCountBeforeFirstWrite} read-only tool calls and zero writes so far on a ${this.currentTaskComplexity} task.]`,
      '',
      `You're past the comfortable exploration window for this task size. Two honest options:`,
      `  1. You have enough context now — commit to a direction and make the change. Pick the most likely correct path and execute. You can always iterate.`,
      `  2. The task is actually bigger than it looked at first — say so clearly in your next response ("this looked focused but it needs broader changes because..."), then continue exploring with justification.`,
      '',
      `What you MUST NOT do: keep reading files silently. Either commit, or explain why you need more context. Stalling is the one unacceptable outcome.`,
    ].join('\n');
  }

  // v3 graph integration (feedProceduralObserver / saveGraphState) was
  // removed from the hot path in the memory-cleanup sweep. Those features
  // read the live conversation and wrote derived state on every turn —
  // exactly the conversation→memory leak we are cutting. If procedural
  // learning and graph persistence come back, they belong in a scheduled
  // background job or an end-of-session hook, reading already-distilled
  // memory entries, not the live conversation.

  // ── Context usage ────────────────────────────────────────────────────────

  /** Get current context usage for a set of messages. */
  getContextUsage(messages: Message[]): ContextUsage {
    const used = this.estimateTokenCount(messages);
    const limit = this.model.contextWindow;
    return { used, limit, percent: Math.round((used / limit) * 100) };
  }

  /** Manually compress context — triggered by user clicking the context bar. */
  async manualCompress(
    messages: Message[],
    onEvent: AgentEventHandler,
    signal?: AbortSignal,
  ): Promise<Message[]> {
    return this.compressContext(messages, onEvent, signal);
  }

  // ── Context compression ──────────────────────────────────────────────────

  /**
   * Compress conversation context by summarizing older messages.
   * Keeps the system prompt and last 8 messages (4 user-assistant exchanges)
   * verbatim, summarizes everything in between using the model.
   * Falls back silently if the compression API call fails.
   */
  async compressContext(
    messages: Message[],
    onEvent: AgentEventHandler,
    signal?: AbortSignal,
  ): Promise<Message[]> {
    onEvent({ type: 'context_compression_start' });

    const systemMsg = messages[0]?.role === 'system' ? messages[0] : null;
    const rest = systemMsg ? messages.slice(1) : [...messages];

    // Keep last 8 messages verbatim (4 exchange pairs) for better continuity
    const KEEP_RECENT = 8;
    if (rest.length <= KEEP_RECENT) {
      onEvent({ type: 'context_compression_end', originalTokens: 0, compressedTokens: 0 });
      return messages;
    }

    // ── Preserve the pinned original user task ─────────────────────────
    // The first real user message (not a meta injection like a memory brief
    // or compression summary) is the root intent of the whole session. It
    // must survive every compression pass or the post-compression agent
    // loses its sense of "what am I doing here" and fresh-greets the user.
    //
    // We find it by walking the pre-slice messages, and if it falls in the
    // compress zone (not already in the recent window), we pin it to be
    // re-added after the summary.
    const pinnedIdxInMessages = findOriginalUserTaskIndex(messages);
    const pinnedMessage = pinnedIdxInMessages !== -1 ? messages[pinnedIdxInMessages] : null;
    const pinnedIsInRecentWindow = pinnedIdxInMessages !== -1
      && pinnedIdxInMessages >= messages.length - KEEP_RECENT;

    const toCompress = rest.slice(0, -KEEP_RECENT);
    const toKeep = rest.slice(-KEEP_RECENT);

    // Build the text to summarize. Tool-role bodies are already trimmed to
    // ~200 chars by trimOldToolResults before we get here (token economy), so
    // the summariser sees each tool result's head, not raw JSON. Full tool
    // outputs remain in the persisted transcript and are retrievable via
    // conversation_recall — the backstop, not the summary, is the place for
    // exact tool detail.
    const transcript = toCompress
      .map((m) => {
        const text = getTextContent(m.content);
        return `[${m.role}]: ${text || '(no text)'}`;
      })
      .join('\n');

    const compressionPrompt = `You are a conversation summarizer preparing a handoff for an AI agent that will continue the work. The agent will have zero memory of this transcript except for what you produce, so your summary must be structured and decision-focused, not narrative.

Produce your output in EXACTLY this format:

CURRENT_TASK: <one sentence describing what the agent was actively working on at the end of the transcript. This is the single most important field — the agent uses it to decide what to do next. If multiple tasks were interleaved, pick the one that was most recently in flight.>

LAST_STEP: <one sentence describing the most recent concrete action the agent completed. Example: "Wrote src/components/HabitTracker.tsx with Tauri invoke calls for get_habit_logs."</  >

NEXT_STEP: <one sentence describing what the agent should do next to continue the task. Example: "Fix the missing habitId argument being passed to get_habit_logs in App.tsx."  >

BLOCKERS: <any active blockers the agent needs to know about. Write "none" if there are none.>

SUMMARY:
<Free-form bullet-point summary of everything else worth preserving: key decisions, file paths, function names, tool results, errors and how they were resolved, technical context. Be thorough but concise. Do NOT repeat what you put in the structured fields above.>

Rules:
- Every field above is MANDATORY. If you can't extract a value for one, write "unclear" but never omit the field.
- No pleasantries, no meta-commentary, no "Here's the summary" preamble.
- Use plain text in the structured fields — no markdown, no bullet points, no multi-line values.
- Keep the CURRENT_TASK, LAST_STEP, NEXT_STEP fields to a single sentence each.

TRANSCRIPT:
${transcript}`;

    // Scale the summary budget to how much is being compressed. A flat cap
    // under-summarises a large zone — 1500 tokens for a 300K-token compress
    // zone loses real fidelity. Proportional (~8%) keeps detail where there's
    // a lot to keep, with a 1500 floor (the old default, fine for small zones)
    // and a 4000 ceiling so the summary can't itself bloat the context it's
    // meant to shrink.
    const compressedTokens = this.estimateTokenCount(toCompress);
    const summaryBudget = Math.min(4000, Math.max(1500, Math.floor(compressedTokens / 12)));

    try {
      const response = await this.provider.createCompletion(
        {
          model: this.model.id,
          messages: [
            { role: 'system', content: 'You are a precise conversation summarizer.' },
            { role: 'user', content: compressionPrompt },
          ],
          // Compression is a real cost the turn incurred, so it belongs to the
          // turn. Leaving it untagged would quietly understate what a long
          // conversation actually costs to answer.
          turnId: this.runTurnId,
          max_tokens: summaryBudget,
          temperature: 0.2,
        },
        signal,
      );

      // Meter the compression call. It's a heavy-model completion the same
      // shape as a chat turn, just summarising rather than answering a user.
      chargeCredits('chat_turn', {
        model: this.model.id,
        rawTokens: extractUsage((response as { usage?: unknown }).usage as Parameters<typeof extractUsage>[0]),
      });

      const summary = response.choices?.[0]?.message?.content || '';
      if (!summary) throw new Error('Empty compression response');

      // Memory policy: see notes at the earlier compression site. The
      // compression summary lives in the conversation history (persisted
      // per-conversation) — it does NOT get pushed into user or project
      // memory. Previously this block ran reflectAndSave on the compressed
      // messages and dumped the raw summary as a project memory entry.
      // Both paths created a conversation→memory feedback loop where
      // earlier turns' text got re-injected via memory on later turns,
      // shaping new responses, which then got saved again. Memory should
      // be durable user/project facts the model (or user) explicitly
      // chose to persist — not a rolling transcript of the conversation.

      // ── Build the continuation-first summary message ────────────────
      // Extract structured CURRENT_TASK / LAST_STEP / NEXT_STEP / BLOCKERS
      // fields from the summariser's output. The summariser prompt asks
      // for these explicitly but LLMs paraphrase — the parser is lenient.
      const structured = extractStructuredFields(summary);
      const continuationHeader = buildCompressionContinuationHeader(summary, structured);
      const summaryMessage: Message = {
        role: 'user',
        content: continuationHeader,
      };

      // ── Build the session-tasks re-injection block ──────────────────
      // If the TaskManager has active session tasks, format them as a
      // continuation-focused block for direct injection into the
      // post-compression context. This is the single biggest signal that
      // stops the agent from treating compression as a fresh chat.
      let sessionTasksMessage: Message | null = null;
      try {
        const tm = (this.toolContext.sharedState as Record<string, unknown> | undefined)?.taskManager as
          | { getSessionTasks: () => TaskEntrySnapshot[] }
          | undefined;
        if (tm && typeof tm.getSessionTasks === 'function') {
          const tasks = tm.getSessionTasks();
          const block = formatSessionTasksBlock(tasks);
          if (block) {
            sessionTasksMessage = { role: 'user', content: block };
          }
        }
      } catch {
        /* non-critical — proceed without the task block */
      }

      // ── Fold original task into the system prompt instead of replaying ──
      // Previously this prepended the original user message verbatim as
      // a user-role message — which the model then treated as a freshly
      // sent user turn ("acts on the initial message again" bug). Fix:
      // merge the original task text into the system message as a
      // reference note. The model sees what the task was without
      // interpreting its replay as a new request.
      let pinnedNote = '';
      if (pinnedMessage && !pinnedIsInRecentWindow) {
        const pinnedText = getTextContent(pinnedMessage.content);
        if (pinnedText) {
          pinnedNote = `\n\n[Original request at session start] "${pinnedText.slice(0, 800)}" — context for what the user initially asked. You were already in the middle of working on this; continue from where you left off. Do NOT treat this as a new request.`;
        }
      }

      const fixedTail = this.fixToolPairing(toKeep);

      // Assembly order — simplified to remove the replayed original user
      // message. The continuation header (summaryMessage) now carries
      // CURRENT_TASK / LAST_STEP / NEXT_STEP, and the system prompt
      // carries the original-request note. The model reads top to bottom
      // and gets the full context without seeing what looks like a new
      // user turn.
      const middle: Message[] = [summaryMessage];
      // Keep the user's own turns from the compress zone verbatim — the
      // summariser paraphrases them, and their exact words are the truest
      // record of intent. Framed as historical reference, not new requests.
      const verbatimUserTurns = buildVerbatimUserTurnsBlock(toCompress);
      if (verbatimUserTurns) middle.push(verbatimUserTurns);
      if (sessionTasksMessage) middle.push(sessionTasksMessage);

      const enrichedSystem: Message | null = systemMsg
        ? { ...systemMsg, content: (typeof systemMsg.content === 'string' ? systemMsg.content : '') + pinnedNote }
        : (pinnedNote ? { role: 'system' as const, content: pinnedNote.trimStart() } : null);

      const result = enrichedSystem
        ? [enrichedSystem, ...middle, ...fixedTail]
        : [...middle, ...fixedTail];

      const originalTokens = this.estimateTokenCount(messages);
      const compressedTokens = this.estimateTokenCount(result);
      onEvent({ type: 'context_compression_end', originalTokens, compressedTokens });

      // Emit updated context usage so UI bars refresh after compression
      const newPercent = Math.round((compressedTokens / this.model.contextWindow) * 100);
      onEvent({
        type: 'context_usage',
        context: { used: compressedTokens, limit: this.model.contextWindow, percent: newPercent },
      });

      return result;
    } catch {
      // Compression failed — fall back silently (caller will truncate if needed)
      onEvent({ type: 'context_compression_end', originalTokens: 0, compressedTokens: 0 });
      return messages;
    }
  }

  // ── Token estimation ──────────────────────────────────────────────────────

  private static estimateTextTokens(text: string): number {
    // Conservative: uses length/3 (not length/4) because code, JSON, and
    // tool results tokenize at ~2.5-3 chars per token.
    return Math.ceil(text.length / 3);
  }

  private estimateMessageTokens(msg: Message): number {
    let tokens = 4; // message overhead (role, separators)

    const { content } = msg;
    if (content === null) {
      // no content
    } else if (typeof content === 'string') {
      tokens += Agent.estimateTextTokens(content);
    } else {
      for (const part of content) {
        if (part.type === 'text') tokens += Agent.estimateTextTokens(part.text);
        else if (part.type === 'image_url') tokens += 85;
      }
    }

    // Count tool calls in assistant messages (function name + JSON arguments)
    const toolCalls = (msg as unknown as Record<string, unknown>).tool_calls as
      | Array<{ function: { name: string; arguments: string } }>
      | undefined;
    if (toolCalls) {
      for (const tc of toolCalls) {
        tokens += Agent.estimateTextTokens(tc.function.name) + Agent.estimateTextTokens(tc.function.arguments) + 8;
      }
    }

    return tokens;
  }

  /** Estimate total token count across an array of messages. */
  estimateTokenCount(messages: Message[]): number {
    return messages.reduce((sum, m) => sum + this.estimateMessageTokens(m), 0);
  }

  // ── Tool result trimming ────────────────────────────────────────────────

  /**
   * Collapse old tool results to save tokens. Tool outputs older than
   * KEEP_RECENT messages get trimmed to 200 chars + a note.
   * This prevents token bleed from accumulated file reads, grep results, etc.
   */
  /**
   * Trim older messages for token-cost control, preserving everything that
   * matters for continuity:
   *   - The system prompt is never touched.
   *   - The pinned original user task is preserved verbatim (it's the root
   *     intent of the whole session and must survive every trim pass).
   *   - The last 8 messages are kept verbatim for recent context.
   *   - `tool`-role messages older than the recent window are trimmed to
   *     MAX_OLD_TOOL_CHARS (very aggressive — 200 chars — because tool
   *     outputs rarely matter in full once the next turn has consumed them).
   *   - `user` and `assistant` message bodies older than the recent window
   *     get trimmed if they exceed OLD_MESSAGE_BODY_MAX_CHARS. The structural
   *     "who said what" stays intact but verbose inlined content gets cut.
   *   - `reasoning_content` on old plain-text assistant messages is stripped
   *     entirely. Reasoning is working memory for the turn that produced it
   *     and has zero value once the next turn has landed — but it can be
   *     10x larger than the actual response and was previously kept forever.
   *     Tool-calling assistant turns are an exception: DeepSeek V4 thinking
   *     mode requires reasoning_content to be re-sent on every subsequent
   *     request that follows a tool call, so it stays put on those.
   *
   * This is the primary lever for keeping per-turn token cost in check on
   * long sessions. Combined with the earlier compression trigger (40%
   * instead of 70%), it dramatically reduces the cost of running an agent
   * for 60+ minutes on a single conversation.
   */
  private trimOldToolResults(messages: Message[]): Message[] {
    const KEEP_RECENT = 8; // Keep last 8 messages at full size
    const MAX_OLD_TOOL_CHARS = 200;

    if (messages.length <= KEEP_RECENT + 1) return messages; // +1 for system

    const cutoff = messages.length - KEEP_RECENT;
    const pinnedIdx = findOriginalUserTaskIndex(messages);

    return messages.map((m, i) => {
      // Never touch the system prompt or messages in the recent window
      if (i === 0 || i >= cutoff) return m;
      // Never touch the pinned original user task — it's the root of the
      // whole session and must survive every trim pass
      if (i === pinnedIdx) return m;

      // ── Tool-role trimming (most aggressive) ─────────────────────────
      if (m.role === 'tool' && typeof m.content === 'string') {
        if (m.content.length <= MAX_OLD_TOOL_CHARS) return m;
        return {
          ...m,
          content: m.content.slice(0, MAX_OLD_TOOL_CHARS) + `\n\n[Trimmed — original ${m.content.length} chars]`,
        };
      }

      // ── Assistant-role: strip reasoning_content + trim body ───────────
      if (m.role === 'assistant') {
        const assistantMsg = m as AssistantMessage;
        const hasReasoning = assistantMsg.reasoning_content !== undefined && assistantMsg.reasoning_content !== null;
        const textContent = typeof assistantMsg.content === 'string' ? assistantMsg.content : null;
        const needsBodyTrim = textContent !== null && textContent.length > OLD_MESSAGE_BODY_MAX_CHARS;
        // DeepSeek V4 thinking-mode rule: assistant turns that produced
        // tool_calls MUST keep their reasoning_content in every subsequent
        // request, or the API rejects with 400 "reasoning_content in the
        // thinking mode must be passed back". Plain-text assistant turns
        // can still drop it (the field is ignored on those by DeepSeek and
        // by every other provider).
        const hasToolCalls = Array.isArray(assistantMsg.tool_calls) && assistantMsg.tool_calls.length > 0;
        const stripReasoning = hasReasoning && !hasToolCalls;

        if (!stripReasoning && !needsBodyTrim) return m;

        const trimmed: AssistantMessage = {
          ...assistantMsg,
          // Reasoning is stripped from old plain-text turns (zero value once
          // the next turn is live, and often the biggest single allocation
          // in a long conversation's token budget) but PRESERVED on
          // tool-calling turns for DeepSeek V4 multi-turn correctness.
          ...(stripReasoning ? { reasoning_content: null } : {}),
          // Body is trimmed only if it's over threshold
          content: needsBodyTrim && textContent !== null
            ? trimMessageBody(textContent)
            : assistantMsg.content,
        };
        return trimmed;
      }

      // ── User-role: trim long bodies (skip meta-prefixed messages) ─────
      if (m.role === 'user' && typeof m.content === 'string') {
        // Don't trim meta-prefixed messages (compression summaries, memory
        // briefs, system notices, task blocks) — their headers matter and
        // they're usually already short enough anyway.
        if (isMetaPrefix(m.content)) return m;
        if (m.content.length <= OLD_MESSAGE_BODY_MAX_CHARS) return m;
        return { ...m, content: trimMessageBody(m.content) };
      }

      return m;
    });
  }

  // ── Truncation ──────────────────────────────────────────────────────────

  private truncateMessages(messages: Message[], maxTokens: number): Message[] {
    const total = messages.reduce((sum, m) => sum + this.estimateMessageTokens(m), 0);
    if (total <= maxTokens) return messages;

    // Keep system prompt (first message) and trim from the beginning of the rest
    const systemMsg = messages[0]?.role === 'system' ? messages[0] : null;
    const rest = systemMsg ? messages.slice(1) : [...messages];
    const systemTokens = systemMsg ? this.estimateMessageTokens(systemMsg) : 0;

    // ── Preserve the pinned original user task ──────────────────────
    // Same reasoning as compression paths: the root intent of the session
    // must survive even emergency truncation. We reserve tokens for it
    // upfront and then fill the rest of the budget from the most recent
    // messages backwards.
    const pinnedIdx = findOriginalUserTaskIndex(messages);
    const pinnedMsg = pinnedIdx !== -1 ? messages[pinnedIdx] : null;
    const pinnedTokens = pinnedMsg ? this.estimateMessageTokens(pinnedMsg) : 0;

    const budget = maxTokens - systemTokens - pinnedTokens;

    const kept: Message[] = [];
    let used = 0;

    for (let i = rest.length - 1; i >= 0; i--) {
      // Skip the pinned message during the backward walk — it will be
      // re-inserted at the pinned slot at the end. Including it twice
      // would double-charge its tokens and confuse the final order.
      if (pinnedMsg && rest[i] === pinnedMsg) continue;
      const msgTokens = this.estimateMessageTokens(rest[i]);
      if (used + msgTokens > budget) break;
      kept.unshift(rest[i]);
      used += msgTokens;
    }

    // Fix orphaned tool messages — if truncation cut in the middle of a
    // tool call/result sequence, the kept list may start with `tool` messages
    // that reference a dropped assistant message. The API rejects these.
    // Also drop any assistant messages whose tool_calls lost their results.
    const fixed = this.fixToolPairing(kept);

    // Fold the original task into the system prompt as a reference note
    // instead of re-injecting it as a user message. Re-injection made the
    // model treat the replay as a fresh user turn ("acts on initial
    // message again"). A system-prompt note preserves the task context
    // without the new-input signal.
    let enrichedSystem: Message | null = systemMsg;
    if (pinnedMsg && systemMsg) {
      const pinnedText = getTextContent(pinnedMsg.content);
      if (pinnedText) {
        const pinnedNote = `\n\n[Original request at session start] "${pinnedText.slice(0, 800)}" — context for what the user initially asked. You were already in the middle of working on this; continue from where you left off. Do NOT treat this as a new request.`;
        enrichedSystem = { ...systemMsg, content: (typeof systemMsg.content === 'string' ? systemMsg.content : '') + pinnedNote };
      }
    }

    return enrichedSystem ? [enrichedSystem, ...fixed] : fixed;
  }

  /**
   * Detect the "first turn after Stop" pattern and strip prior conversation.
   *
   * When cancelRun() fires in the extension, a marker is pushed into the
   * conversation: `[User pressed Stop — previous task terminated...]`.
   * After the user's next real message, the conversation looks like:
   *
   *   [... prior task, maybe 150K tokens ...]
   *   [User pressed Stop — ...]   (meta user message)
   *   Actual new user message
   *
   * The prior 150K tokens are dead weight. Sending them back means the
   * model re-draws on the task the user told us to abandon. The fix is
   * to detect this pattern and return a restricted message array:
   *
   *   [system prompt + stop directive]
   *   [new user message]
   *
   * Detection: find the most recent stop marker. If it exists AND there
   * is exactly one non-meta user message after it (and the assistant
   * hasn't yet responded to that message), we're in the first post-stop
   * turn — restrict.
   *
   * If more messages exist after that point (assistant replies, tool
   * results), we've already handled the first post-stop turn normally;
   * further turns see full context and operate as normal.
   */
  private maybeRestrictPostStopContext(messages: Message[]): Message[] {
    // Find the most recent stop marker (a user-role message starting with the marker prefix).
    let markerIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== 'user') continue;
      const text = getTextContent(m.content);
      if (text.trimStart().startsWith('[User pressed Stop')) {
        markerIdx = i;
        break;
      }
    }
    if (markerIdx < 0) return messages;

    // Everything after the marker must be: exactly one non-meta user
    // message, nothing else. If there's a REAL assistant reply after the
    // marker, we're past the first post-stop turn — don't restrict.
    //
    // Critical edge case: if the abort fired mid-stream, an empty or
    // partial assistant message can sit in the transcript (assistant
    // started speaking, stop fired, no content). That half-message must
    // NOT count as a "real response" or the restriction bails and all
    // pre-stop context leaks into the next turn. An empty string, an
    // empty content parts array, or pure whitespace all count as "no
    // real response" for this purpose.
    const afterMarker = messages.slice(markerIdx + 1);
    const nonMetaUsers = afterMarker.filter(m =>
      m.role === 'user' && !isMetaPrefix(getTextContent(m.content))
    );
    const hasRealAssistantResponse = afterMarker.some(m => {
      if (m.role !== 'assistant') return false;
      const text = getTextContent(m.content);
      if (text.trim().length > 0) return true;
      const hasToolCalls = Array.isArray((m as AssistantMessage).tool_calls)
        && (m as AssistantMessage).tool_calls!.length > 0;
      return hasToolCalls;
    });
    if (nonMetaUsers.length !== 1 || hasRealAssistantResponse) {
      return messages;
    }

    const newUserMessage = nonMetaUsers[0];
    const systemMsg = messages.find(m => m.role === 'system');

    // Merge the stop directive into the system prompt so the model sees
    // it at the highest-authority layer, not as a floating user message
    // (which some providers reject when followed by another user msg).
    const stopDirective = `\n\n[Post-stop context] The previous task was terminated by the user. Do not resume it. Treat the user's message below as a fresh request on its own terms. If they reference prior work ambiguously (e.g. "fix that", "continue"), ask them to be specific — you do not have the prior context and should not assume.`;

    const restrictedSystem: Message | null = systemMsg
      ? { ...systemMsg, content: (typeof systemMsg.content === 'string' ? systemMsg.content : '') + stopDirective }
      : { role: 'system' as const, content: stopDirective.trimStart() };

    logger.debug(`[agent] Post-stop context restriction: dropped ${messages.length - 2} prior messages, keeping system + new user message`);

    return restrictedSystem ? [restrictedSystem, newUserMessage] : [newUserMessage];
  }

  /**
   * Age out old images and old tool results to cut per-turn token cost.
   *
   * Keeps the N most recent image-bearing user messages and the M most
   * recent tool results in full fidelity. Older ones become text-only
   * placeholders. The assistant's prior reasoning about the content
   * remains intact in the assistant messages — we're just dropping raw
   * payloads that the model no longer needs pixel-for-pixel.
   *
   * Why this exists: a single 25K-token screenshot re-sent across 10
   * turns burns 250K tokens for no informational gain after turn 2 or 3.
   * Same applies to verbose bash/file_read output: after the assistant
   * has reasoned about it, we don't need the full dump in context
   * anymore. This is the single biggest lever on token consumption in
   * the agent loop. Conservative keep counts (2 images, 5 tool results)
   * preserve enough active context for normal multi-step work while
   * eliminating the long tail of stale payloads.
   */
  private ageHistoryContent(messages: Message[]): Message[] {
    const KEEP_RECENT_IMAGES = 2;
    // DIAGNOSTIC: tool-result trimming disabled while we confirm it's
    // corrupting Qwen's function-calling expectations. Leaving trimmed
    // summaries in role:'tool' messages appears to make the model emit
    // malformed tool_calls (empty function.name) and fall back to
    // text-format tool calls. Image trimming stays on (biggest savings,
    // doesn't touch tool-pair structure). If disabling this resolves
    // the empty-name tool_call regression, the real fix is to collapse
    // old tool_call + tool_result pairs into a single assistant text
    // summary rather than leaving orphan-style summaries in tool slots.
    const KEEP_RECENT_TOOL_RESULTS = Number.POSITIVE_INFINITY;
    const TOOL_RESULT_TRIM_THRESHOLD = 300;

    // Walk backward to find indices of the N most recent image-bearing
    // user messages and tool results.
    const imageIndicesSeen: number[] = [];
    const toolIndicesSeen: number[] = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === 'user' && Array.isArray(m.content)) {
        const hasImage = (m.content as ContentPart[]).some(p => p.type === 'image_url');
        if (hasImage) imageIndicesSeen.push(i);
      }
      if (m.role === 'tool') toolIndicesSeen.push(i);
    }
    const imageIndicesToStrip = new Set(imageIndicesSeen.slice(KEEP_RECENT_IMAGES));
    const toolIndicesToTrim = new Set(toolIndicesSeen.slice(KEEP_RECENT_TOOL_RESULTS));

    if (imageIndicesToStrip.size === 0 && toolIndicesToTrim.size === 0) {
      return messages;
    }

    return messages.map((m, i) => {
      // Strip image payload from old image-bearing user messages.
      if (imageIndicesToStrip.has(i) && Array.isArray(m.content)) {
        const textParts = (m.content as ContentPart[])
          .filter(p => p.type === 'text')
          .map(p => ('text' in p ? p.text : ''))
          .filter(Boolean)
          .join(' ')
          .trim();
        const placeholder = textParts
          ? `${textParts} — image discarded from history to save context. Re-capture if you need to see it again.`
          : '[Image previously captured — discarded from history to save context. Re-capture if needed.]';
        return { ...m, content: placeholder };
      }

      // Trim old tool results to a short summary.
      if (toolIndicesToTrim.has(i) && typeof m.content === 'string' && m.content.length > TOOL_RESULT_TRIM_THRESHOLD) {
        const preview = m.content.slice(0, 160).replace(/\s+/g, ' ').trim();
        const toolName = (m as any).name || 'tool';
        return {
          ...m,
          content: `[${toolName} result from earlier turn — ${m.content.length} chars trimmed to save context. Preview: ${preview}...]`,
        };
      }

      return m;
    });
  }

  /**
   * Public wrapper around fixToolPairing for post-error recovery flows.
   * When a provider returns 400, the message history may have landed in
   * an invalid shape (orphan tool_calls, unmatched tool results). The
   * extension's Retry handler calls this on the live conversation before
   * issuing another request so the user isn't stuck in a loop of the
   * same broken payload bouncing off the provider.
   */
  repairMessages(messages: Message[]): Message[] {
    return this.fixToolPairing(messages);
  }

  /**
   * Ensure every `tool` message has a preceding `assistant` with a matching
   * `tool_calls` entry, and every `assistant` with `tool_calls` has all its
   * `tool` results following it. Drops orphans from the front.
   */
  private fixToolPairing(messages: Message[]): Message[] {
    // 1. Drop leading orphaned tool messages (their assistant parent was truncated)
    let start = 0;
    while (start < messages.length && messages[start].role === 'tool') {
      start++;
    }
    if (start === messages.length) return [];
    const trimmed = start > 0 ? messages.slice(start) : messages;

    // 2. Scan ALL messages — remove any tool message whose parent assistant
    //    (with matching tool_call_id) is not in the conversation
    const assistantToolCallIds = new Set<string>();
    for (const m of trimmed) {
      if (m.role === 'assistant') {
        const toolCalls = (m as AssistantMessage).tool_calls;
        if (toolCalls) {
          for (const tc of toolCalls) {
            assistantToolCallIds.add(tc.id);
          }
        }
      }
    }

    const fixed = trimmed.filter(m => {
      if (m.role === 'tool') {
        const toolMsg = m as { tool_call_id?: string };
        return assistantToolCallIds.has(toolMsg.tool_call_id ?? '');
      }
      return true;
    });

    // 3. Check for assistant messages with tool_calls but missing ALL tool results
    //    (incomplete pair) — remove them too
    const toolResultIds = new Set<string>();
    for (const m of fixed) {
      if (m.role === 'tool') {
        const toolMsg = m as { tool_call_id?: string };
        if (toolMsg.tool_call_id) toolResultIds.add(toolMsg.tool_call_id);
      }
    }

    return fixed.filter(m => {
      if (m.role === 'assistant') {
        const toolCalls = (m as AssistantMessage).tool_calls;
        if (toolCalls && toolCalls.length > 0) {
          // Keep only if at least one tool result exists
          return toolCalls.some(tc => toolResultIds.has(tc.id));
        }
      }
      return true;
    });
  }
}
