// Agent
export { Agent } from './agent/agent.js';
export type { AgentEvent, AgentEventHandler, ContextUsage } from './agent/agent.js';
export { Conversation } from './agent/conversation.js';
export { buildSystemPrompt, getSecurityModePrefix } from './agent/system-prompt.js';

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

// Tools
export { ToolRegistry } from './tools/tool-registry.js';
export { killBackgroundProcesses } from './tools/bash.js';
export { BrowserTool } from './tools/browser.js';

// Memory
export { MemoryManager } from './memory/memory-manager.js';
export { PlatformMemorySync } from './memory/platform-sync.js';
export type { PlatformMemory } from './memory/platform-sync.js';

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
  ToolRiskLevel,
  PermissionMode,
} from './tools/types.js';

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
} from './config/project.js';

// History
export { HistoryManager } from './history/history-manager.js';
export type { ConversationRecord } from './history/storage.js';

// i18n
export { t, setLocale, setLocaleSync, loadLocaleStrings, getLocale, getSupportedLocales, getLanguageName, resolveLocale } from './i18n/index.js';
export type { SupportedLocale } from './i18n/types.js';
export { SUPPORTED_LOCALES, LANGUAGE_NAMES } from './i18n/types.js';

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
export { AvaError, ProviderError, StreamError, ToolExecutionError, ConfigError } from './core/errors.js';
export { logger, setLogLevel } from './core/logger.js';
export type { LogLevel } from './core/logger.js';
