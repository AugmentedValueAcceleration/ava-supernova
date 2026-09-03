// Agent
export { Agent } from './agent/agent.js';
// The desktop/browser tools MS requires the extension not to ship. Exported so
// the extension host can exclude them at registerBuiltins from the same single
// definition the mode gate uses — two copies of this list is how it drifts.
export { DESKTOP_TOOL_NAMES } from './agent/agent.js';
export type { AgentEvent, AgentEventHandler, ContextUsage } from './agent/agent.js';
export { Conversation } from './agent/conversation.js';
export { isStopCommand, haltIntent } from './agent/stop-command.js';
export type { HaltIntent } from './agent/stop-command.js';

// Auto Mode
export { AutoCoordinator, ModelRouter, classifyTask, ContextTracker, resolveCoordinatorModel, LONGXIANG_ENABLED } from './auto/index.js';
export type { RoutingMode } from './auto/index.js';
export { ROUTING_MODES, isRoutingMode } from './auto/index.js';
export type { TaskCategory as AutoTaskCategory, ClassificationResult, RouteResult, UserRoutePreferences, TaskBrief, AutoEvent, CoordinatorModelResult } from './auto/index.js';

// Memory Agent
export { MemoryAgent } from './memory/memory-agent.js';
export type { MemoryBrief, MemoryAgentOptions } from './memory/memory-agent.js';

// Intent Classifier (Qwen Flash tool-use gate)
export { IntentClassifier } from './agent/intent-classifier.js';
export type { UserIntent, IntentClassifierOptions } from './agent/intent-classifier.js';

export type { SystemPromptOptions } from './agent/system-prompt.js';
export * from './exercises/index.js';
export { buildSystemPrompt, buildContextualInjection, getChatModePrefix, getTeachModePrefix, getSecurityModePrefix, getPlanModePrefix, getBrainstormModePrefix, getWriteModePrefix, getWorkModePrefix, getDesktopModePrefix, getHealthRoomPrefix, getDesignStudioPrefix, getSocialStudioPrefix, SOCIAL_STUDIO_PERSONA, getNewsroomPrefix, getPantryPrefix, getGymPrefix } from './agent/system-prompt.js';

// Newsroom contracts — the surface-injected news index + article store the
// Correspondent's tools write through, plus the syndication clusterer that
// keeps "47 outlets" from being mistaken for corroboration.
export type {
  NewsHit, NewsSearchFn, NewsFeedFn,
  ArticleInput, ArticleStore,
  StorySuggestion, StoryStore,
  FetchedCorpus,
} from './news/index.js';
export { clusterCoverage, summariseCoverage, verifyQuote } from './news/index.js';

// Pantry contracts — the recipe-desk store the tools write through, plus the
// pure shopping-list check that makes a recipe cookable-from-its-own-list.
export type {
  SkillLevel, RecipeIngredientInput, RecipeStepInput, RecipeVersionInput,
  RecipeInput, SeedSuggestion, RecipeCheckFinding, RecipeCheckResult, RecipeStore, RecipeSnapshot, RecipeMatch,
} from './recipes/index.js';
export { findPhantomIngredients, checkRecipeShoppingList } from './recipes/index.js';

// Social Studio contracts — the surface-injected stores the Posts-floor tools
// (write_post, propose_hooks) write through, plus the shared char-limit map.
export type {
  SocialPostInput, SocialPostWritten, PostStore,
  VideoPostInput, VideoPostWritten, VideoPostStore,
  VoiceoverInput, VoiceoverWritten, VoiceoverStore,
  PostImageInput, PostImageWritten, PostImageStore,
  HookOption, HookProposal, HookStore,
  WebSearchResult, WebSearchFn,
  PostMetric, PostMetricsReader,
  Beat, BeatStore,
  // The day plan the Posts floor and Ava share.
  DayPlanRow, NewDayPlanItem, DayPlanStore,
} from './social/index.js';
export { POST_HARD_LIMITS, REDDIT_TITLE_LIMIT, PLATFORM_TAG_POLICY, VIDEO_CAPTION_LIMITS, PLATFORM_IMAGE_SPECS, imageSizeFor } from './social/index.js';

// Health profile-fill registry (the "Ava fills your profile" flow)
export {
  HEALTH_PROFILE_FIELDS,
  HEALTH_PROFILE_FIELD_IDS,
  humaniseSlug,
  summariseCookingTime,
} from './health/profile-fields.js';
export { summariseTrainingLog } from './health/session-summary.js';
export type { ProfileFieldDef, ProfileFieldOption, ProfileFieldControl, CookingTime } from './health/profile-fields.js';

// Personality
export type { Personality } from './config/personality.js';
export { DEFAULT_PERSONALITY, loadPersonality, savePersonality, resetPersonality, buildPersonalityPrefix } from './config/personality.js';

// Core types
export type {
  Message,
  MessageRole,
  SystemMessage,
  UserMessage,
  AssistantMessage,
  ToolMessage,
  ToolCall,
  ToolCallFunction,
  ContentPart,
  TextContentPart,
  ImageContentPart,
  ModelDefinition,
  TokenUsage,
  StreamChunk,
  StreamDelta,
  CompletionResponse,
} from './core/types.js';
export { getTextContent } from './core/types.js';
// Calendar days in the user's terms. Exported because the extension and IDE
// have the same bug in their own code — a day someone lives in should never be
// derived from toISOString, and there should be one implementation of that.
export { localYmd, todayLocal, addDaysLocal } from './core/dates.js';

// Provider types
export type {
  Provider,
  ProviderConfig,
  ChatCompletionRequest,
  ToolSchema,
  FunctionSchema,
} from './providers/types.js';
export { BaseProvider } from './providers/base-provider.js';
export { ProviderRegistry } from './providers/provider-registry.js';
export { PlatformProvider } from './providers/platform/index.js';
export { GenericProvider, listOpenAICompatibleModels } from './providers/generic/index.js';
export type { GenericProviderConfig } from './providers/generic/index.js';
export { ProviderHealthTracker } from './providers/health-tracker.js';
export type { ProviderHealthSnapshot } from './providers/health-tracker.js';
export { ResilientProvider } from './providers/resilient-provider.js';
export type { FallbackEntry, ResilientProviderOptions } from './providers/resilient-provider.js';

// Shared request-shaping — the single source of truth for upstream model-id
// translation, message massaging, and per-provider param quirks. Imported by
// BOTH the platform routes (packages/web) and the BYOK providers below, so the
// two paths can't drift (the cause of the Aurora ghost-id + reasoning_content
// bugs). Transport-free: callers supply their own fetch/auth.
export {
  MODEL_API_NAMES,
  VISION_REROUTE,
  resolveApiModel,
  messagesHaveImages,
  stripReasoningContent,
  reorderSystemForQwen,
  shapeMessages,
  isZhipuFlashModel,
  shapeParams,
  shapeOpenAICompatBody,
} from './providers/request-shaping/index.js';
export type { ShapeableParams, ShapeOpenAICompatInput } from './providers/request-shaping/index.js';

// Tools
export { ToolRegistry } from './tools/tool-registry.js';
export { killBackgroundProcesses } from './tools/bash.js';
export { BrowserTool } from './tools/browser.js';
export { SecretRequestTool } from './tools/secret-request.js';
export { EnvWriteTool, pickEnvFile, isGitignored, upsertEnvLine } from './tools/env-write.js';
// Both surfaces format the plan-approval result with this, so they cannot drift.
export { formatPlanDecision } from './tools/present-plan.js';
// Brainstorm sessions — local only, never in the repo.
export { BrainstormStore, projectHash } from './brainstorm/brainstorm-store.js';
export type { BrainstormSession, BrainstormIdea, BrainstormKind, BrainstormSessionSummary } from './brainstorm/types.js';
export type { PlanDecision } from './tools/present-plan.js';

// Billing — canonical plan data + website redirect URL builders
export {
  PLANS,
  TOKEN_TOPUPS,
  AVA_SITE_BASE,
  pricingUrl,
  dashboardBillingUrl,
  upgradeUrl,
  tokenTopupUrl,
} from './billing/plans.js';
export type {
  PlanTier,
  PlanDefinition,
  TokenTopupDefinition,
} from './billing/plans.js';
// Canonical per-action credit costs — single source of truth for what
// the platform charges. Surfaces (Creative Studio cost preview, etc.)
// import this so previews track the server. Bumping a constant here
// updates the preview everywhere automatically.
export { CREDIT_COST, TOKENS_PER_BRACKET } from './billing/credits.js';
export type { CreditAction } from './billing/credits.js';

// Memory
export { MemoryManager } from './memory/memory-manager.js';
export { EmbeddingService, createEmbeddingServiceFromConfig } from './memory/embedding-service.js';
export { PlatformMemorySync } from './memory/platform-sync.js';
export type { PlatformMemory, SemanticMatch } from './memory/platform-sync.js';
export type {
  MemoryEntry,
  MemoryCategory,
  MemoryLayer,
  MemoryStore,
  MemorySaveOptions,
  MemoryRecallOptions,
  MemoryRecallResult,
  MemoryStoreSummary,
  MemoryConsolidationGroup,
  // v3 graph types
  MemoryNode,
  MemoryEdge,
  EdgeType,
  MemoryGraphStore,
  GraphRecallOptions,
  ScoredNode,
  ProceduralPattern,
  ProjectBrain,
  CaptureCandidate,
  CandidateScore,
  Contradiction,
  AvaMode as MemoryAvaMode,
} from './memory/types.js';
export { MEMORY_CATEGORIES, MEMORY_LAYERS, LAYER_CATEGORY_MAP, inferLayer, createEmptyStore, createEmptyGraphStore, EDGE_TYPES, CONFIDENCE_INITIAL } from './memory/types.js';
export { TfIdfIndex, tokenize, cosineSimilarity } from './memory/tfidf.js';
// v3 graph engine + subsystems
export { MemoryGraph } from './memory/graph-engine.js';
export { ProceduralObserver } from './memory/procedural.js';
export { AmbientCaptureManager, heuristicScore, buildScoringPrompt, parseScoringResponse } from './memory/ambient-capture.js';
export { synthesiseProjectBrain, loadProjectBrain, saveProjectBrain } from './memory/project-brain.js';
export { needsMigration, migrateV2ToV3 } from './memory/migration-v3.js';

// Data portability — encrypted local backup + transfer bundle (the foundation
// of "we never store your data": one sealed bundle, delivered as a file or a
// device-to-device transfer).
export {
  seal, open, isSealedEnvelope,
  gatherBundle, restoreBundle, exportEncryptedBackup, importEncryptedBackup,
  USER_DATA_PATHS, ACCOUNT_DATA_PATHS, GLOBAL_DATA_PATHS, BUNDLE_VERSION,
  exportDataType, importDataType, isCoreDataType, NotImportableError, CORE_DATA_TYPES,
  type SealedEnvelope, type DataBundle, type RestoreResult,
  type CoreDataType, type ExportedFile, type DataRoots,
} from './portability/index.js';

export { exportTrainingData, toJsonlSft, toJsonlWithReasoning } from './memory/training-export.js';
export type { TrainingExample } from './memory/training-export.js';
export { MODE_CATEGORY_WEIGHTS } from './memory/mode-recall.js';
export { detectPatterns, trackAndLearn, PatternAccumulatorManager } from './memory/patterns.js';
export type { DetectedPattern, PatternState } from './memory/patterns.js';
export { generateInsights, analyseAndSave } from './memory/insights.js';
export type { MemoryInsight } from './memory/insights.js';
export { runConsolidation } from './memory/consolidation.js';
export type { ConsolidationReport } from './memory/consolidation.js';
export { loadStore as loadSelfImprovementStore, saveStore as saveSelfImprovementStore, addLearning, getRelevantLearnings, buildSelfImprovementPrompt } from './memory/self-improvement.js';
export type { SelfImprovement, SelfImprovementStore } from './memory/self-improvement.js';

// Tasks
export { TaskManager, migrateGlobalTasksToSubfolder, reminderFireTimeMs } from './tasks/task-manager.js';
export type { PlatformTaskSync, TaskCreateOptions, TaskUpdateOptions } from './tasks/task-manager.js';
export type {
  TaskEntry,
  TaskStore,
  TaskStatus,
  TaskPriority,
  TaskCategory,
  TaskRecurrence,
  TaskSource,
  TaskSubtask,
  TaskReminderLead,
  TaskContext,
  TaskListOptions,
} from './tasks/types.js';
export { TASK_PRIORITIES, TASK_CATEGORIES, createEmptyTaskStore } from './tasks/types.js';
export { PlatformTaskSyncImpl } from './tasks/platform-sync.js';

// Journal
export { JournalManager } from './journal/journal-manager.js';
export type {
  PlatformJournalSync,
  NewEntryInput,
  EntryPatch,
  SearchFilters,
  SearchHit,
} from './journal/journal-manager.js';
export type {
  JournalEntry,
  JournalDay,
  JournalMonthEntry,
  JournalDaySummary,
  JournalKind,
  JournalMood,
  JournalAuthor,
} from './journal/types.js';
export {
  createEmptyJournalDay,
  migrateDay,
  newEntryId,
  kindById,
  BUILTIN_KINDS,
  DEFAULT_USER_KIND,
  DEFAULT_AVA_KIND,
} from './journal/types.js';
export { PlatformJournalSyncImpl } from './journal/platform-sync.js';

// Briefing
export { BriefingEngine } from './briefing/index.js';
export type { Briefing, BriefingData, BriefingState, TimeOfDay } from './briefing/index.js';

// Events
export { EventDetector } from './events/index.js';
export type { AvaEvent, AvaEventHandler, AvaEventType, EventDetectorState } from './events/index.js';
export { TickEngine } from './awareness/tick-engine.js';
export type { TickContext, TickEvent, TickResult } from './awareness/tick-engine.js';

// Workflows
export { WorkflowManager } from './workflows/index.js';
export type { WorkflowPlan, Workflow, WorkflowStep, WorkflowEvent, WorkflowEventHandler } from './workflows/index.js';

// Checkpoint
export { CheckpointManager } from './checkpoint/checkpoint-manager.js';

// Indexer
export { ProjectIndexer } from './indexer/project-indexer.js';
export type { ProjectIndex, FrameworkInfo, LanguageStats, DirectoryNode, TestInfo } from './indexer/project-indexer.js';
export { SymbolIndexer } from './indexer/symbol-indexer.js';
export type { SymbolIndex, SymbolEntry, SymbolKind, SymbolReference } from './indexer/symbol-indexer.js';
export type {
  Tool,
  ToolResult,
  ToolExecutionContext,
  ToolConfirmationHandler,
  ToolConfirmationDecision,
  ToolRiskLevel,
  PermissionMode,
  ToolCategory,
  CategoryPermission,
  AuditApprovalMethod,
  AuditLogEntry,
  AuditCallback,
} from './tools/types.js';
export { TOOL_CATEGORY_MAP, PRESET_CATEGORY_DEFAULTS } from './tools/tool-registry.js';

// Config
export { ConfigManager } from './config/config.js';
export type { AvaConfig, ProviderSettings } from './config/schema.js';
export { DEFAULT_CONFIG } from './config/schema.js';

// Project detection
export {
  detectProjectRoot,
  loadProjectInstructions,
  scaffoldProjectInstructions,
  getInstructionsPath,
  // Decisions folder — durable project-scoped context layer
  DECISIONS_DIR_NAME,
  getDecisionsRoot,
  hasDecisionsFolder,
  loadDecisionsContext,
  loadDecisionsState,
  scaffoldDecisionsFolder,
  // An accepted plan becomes an ADR in Decisions/records/ — the first thing
  // Ava writes into a folder she has only ever read.
  writePlanRecord,
  // …and read back, so a project's plans load with the project.
  listPlanRecords,
  readPlanRecord,
  type DecisionsState,
  type PlanRecordInput,
  type PlanRecordDecision,
  type PlanRecordSummary,
  // Machine-global decisions (standing rules for desktop automation)
  getGlobalDecisionsRoot,
  appendMachineRule,
  loadMachineRules,
} from './config/project.js';

// Per-project config (decisionsOptIn etc.)
export {
  loadProjectConfig,
  saveProjectConfig,
  getProjectConfigPath,
  type ProjectConfig,
  type DecisionsOptInStatus,
} from './config/project-config.js';

// History
export { HistoryManager } from './history/history-manager.js';
export type { ConversationRecord } from './history/storage.js';
// Which room a conversation belongs to, derived from the scaffold tag its
// messages already carry. Exported so the surfaces can restore a thread into
// the room it came from rather than always into the main chat.
// The mode tags, in one place. A leaf: it imports nothing, so browser
// bundles and the IDE sidecar can read the same list the agent does
// instead of each keeping a copy that drifts.
export {
  MODE_TAGS, ALL_SCAFFOLD_TAGS, SCAFFOLD_ONLY_TAGS,
  tagForMode, modeForTaggedText,
} from './agent/mode-tags.js';
export type { ModeTag, AvaModeId } from './agent/mode-tags.js';
export { deriveConversationSurface } from './history/conversation-title.js';
export type { ConversationSurface } from './history/conversation-title.js';

// i18n
export { t, setLocale, setLocaleSync, loadLocaleStrings, getLocale, getSupportedLocales, getLanguageName, resolveLocale } from './i18n/index.js';
export type { SupportedLocale } from './i18n/types.js';
export { SUPPORTED_LOCALES, LANGUAGE_NAMES } from './i18n/types.js';

// Personas
// Which model describes images for a text-only coordinator. Exported
// because the IDE sidecar resolves its own, and used to do it with a
// hardcoded Qwen pair that ignored every other key the user held.
export { resolveVisionDescriber } from './agent/vision-bridge.js';

export { Conductor } from './personas/index.js';
export type {
  PersonaId,
  PersonaPhase,
  PersonaDefinition,
  PersonaState,
  ContextPool,
  ConductorEvent,
  ConductorEventHandler,
  ConductorConfig,
} from './personas/index.js';
export {
  SCOUT, ARCHITECT, VERIFIER, SEQUENCER, CHALLENGER, BUILDER,
  RESEARCHER, CONTENT_WRITER, QUIZ_MASTER, TUTOR,
  EXPLORER, IDEATOR, REFINER,
  WORK_PERSONAS, PLAN_PERSONAS, TEACH_PERSONAS, SECURITY_PERSONAS, BRAINSTORM_PERSONAS,
  MODE_PERSONAS,
} from './personas/index.js';

// Security
export { scanDependencies, scanSecrets, scanCodeVulns, runFullScan } from './security/index.js';
export type { DependencyVuln, SecretFinding, CodeVuln, ScanReport } from './security/index.js';

// Desktop automation — safety ontology + budget tracking are retained as
// shared primitives for the safety middleware layer we'll build on top of
// the sidecar's agent loop. The custom Conductor / Grounding / Executor
// layers were removed once desktop mode folded into the chat mode system.
export {
  classifyAction, decideApproval, isWhitelisted, IRREVERSIBLE_VERBS,
  BudgetTracker, estimateCost, DEFAULT_BUDGET,
  DESKTOP_SCOUT, DESKTOP_PLANNER, DESKTOP_ACTOR, DESKTOP_VERIFIER, DESKTOP_NARRATOR,
  DESKTOP_PERSONAS, DESKTOP_WAVE_ORDER, ESTIMATED_TOKENS_PER_STEP,
} from './desktop/index.js';
export type {
  RiskClass, PermissionLevel, ActionClassificationInput, ClassificationResult as SafetyClassificationResult, ApprovalDecision,
  BudgetConfig, BudgetSnapshot, BudgetBreachReason, StepTokens, CostEstimate,
  DesktopPersonaName, DesktopPersonaDefinition,
  GroundingSource, ConfidenceLevel, ScreenElement, ScreenState,
  ActionKind, ProposedAction, ExecutionResult,
  VerificationStatus, VerificationResult, UserUpdate,
  TrajectoryStep as DesktopTrajectoryStep, Trajectory,
} from './desktop/index.js';

// Desktop-automation host-side provider contracts.
// The Ava IDE (Tauri) fulfils these on ToolExecutionContext.sharedState —
// the desktop_* and browser_* tools consume them via duck-typed lookups.
export type {
  UIAElement, UIAProvider,
  InputProvider,
  BrowserSnapshotElement, BrowserSnapshot, BrowserProvider,
  AppLauncherProvider,
} from './tools/desktop-providers.js';

// Desktop-automation safety gate — hosts populate desktopApprovalHandler
// and (optionally) desktopBudget / desktopPermissionLevel on sharedState
// to drive per-action classification + approval + budget enforcement.
export type {
  DesktopApprovalHandler, DesktopSafetyState, GateOutcome,
} from './tools/desktop-safety-gate.js';

// Dataset (legacy — kept for compat, currently unused in hot path)
export { captureInteraction } from './dataset/capture.js';

// Dataset capture v2 — typed event bus + opt-in consumer.
// Surfaces install the consumer once at startup; the consumer's per-event
// gate (driven by ~/.ava/datasets/config.json) decides whether to write.
// Defaults are all-off — capture is fully inert until a user opts in.
export {
  installDatasetConsumer,
  drainPendingWrites,
  type ConsumerOptions,
} from './dataset/consumer.js';
export {
  loadDatasetConfig,
  saveDatasetConfig,
  configPathFor,
  invalidateConfigCache,
  DEFAULT_CONFIG as DEFAULT_DATASET_CONFIG,
  type DatasetConfig,
} from './dataset/config.js';
export { ALL_DATASETS, type DatasetName } from './dataset/routing.js';
export type { AvaMode } from './dataset/events.js';
// Creative Studio generation tracking — UI-originated generations + user actions
// (kept/retried/discarded/edited) run outside an agent trajectory, so these
// wrap a synthetic one. Surfaces call them from the host/sidecar.
export {
  trackUiGeneration,
  emitGenerationUserAction,
  type GenerationUserAction,
} from './dataset/generation-emit.js';

// Generation
export { GenerationManager } from './tools/generation-manager.js';
export type { GenerationJob, GenerationType, GenerationStatus, GenerationEventHandler } from './tools/generation-manager.js';

// Remote pairing protocol
export {
  channelName, HEARTBEAT_INTERVAL_MS, SESSION_TIMEOUT_MS,
  APPROVAL_FALLBACK_TIMEOUT_MS, RECONNECT_SHORT_MS,
  RemoteClient, makeMessage, dispatch,
} from './remote/index.js';
export type {
  DesktopCapability, SessionRegister, SessionHeartbeat, SessionEnd,
  PairRequest, PairGrant, PairDeny, PairTakeback,
  TrajStep, TrajIntent, ApprovalRequest, ApprovalResponse,
  KillMessage, NotifyMessage, RemoteMessage, RemoteMessageType,
  ChannelTransport, RemoteClientOptions, MessageHandlers,
} from './remote/index.js';

// Constants & Errors
export {
  APP_NAME,
  APP_DISPLAY_NAME,
  APP_VERSION,
  AVA_HOME,
  CONFIG_PATH,
  HISTORY_DIR,
  MEMORY_DIR,
  INDEX_DIR,
  MAX_TOOL_CALL_ITERATIONS,
  ITERATION_WARNING_THRESHOLD,
  DEFAULT_TEMPERATURE,
  DEFAULT_MAX_TOKENS,
} from './core/constants.js';
export { acquireLock, withLock } from './core/file-lock.js';
export { AvaError, ProviderError, StreamError, ToolExecutionError, ConfigError } from './core/errors.js';
export { logger, setLogLevel } from './core/logger.js';
export type { LogLevel } from './core/logger.js';

// Library — Scientific Papers
export {
  fetchPaper,
  parseIdentifier,
  fetchPaperByArxivId,
  searchArxiv,
  arxivPdfUrl,
  searchOpenAlex,
  fetchPaperByOpenAlexId,
  fetchPaperByDoi,
  arxivCategoryToDiscipline,
  openalexFieldToDiscipline,
  inferDisciplineFromText,
  ALL_DISCIPLINES,
  DISCIPLINE_LABELS,
} from './papers/index.js';
export type {
  Paper,
  PaperAuthor,
  PaperSource,
  PaperDiscipline,
  PaperSearchQuery,
  PaperSearchResult,
  PaperSignal,
  ArxivSearchOptions,
  FetchPaperInput,
} from './papers/index.js';
