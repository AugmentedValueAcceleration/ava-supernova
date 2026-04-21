// Mirror of src/webview/dashboard-message-types.ts — kept in sync manually.
// The dashboard React app is a browser bundle and cannot import from the extension host.

export interface AccountInfo {
  id: string;
  email: string;
  name: string | null;
  tier: 'free' | 'pro' | 'ultra' | 'enterprise' | 'admin';
  usage: {
    tokens_used: number;
    tokens_limit: number | null;
    requests_count: number;
    period_start: string | null;
    period_end: string | null;
    free_tokens_used: number;
    free_tokens_limit: number;
  } | null;
  storage?: {
    used_gb: number;
    base_gb: number;
    addon_gb: number;
    total_gb: number;
    percent_used: number;
  };
  /**
   * Active subscription, if any. Drives the "Renews <date>" line on the
   * billing card — usage.period_end tracks the usage-tracking window
   * (calendar month for free, sub cycle for paid) and is NOT the
   * renewal date. Null for free / admin / cancelled accounts.
   */
  subscription?: {
    status: string;
    current_period_start: string | null;
    current_period_end: string | null;
  } | null;
}

export type MemoryCategory = 'pattern' | 'preference' | 'architecture' | 'bug-fix' | 'convention' | 'tool-config' | 'decision' | 'person' | 'general';

export interface MemoryEntry {
  id: string;
  scope: 'global' | 'project';
  project_id: string | null;
  key: string;
  content: string;
  category: MemoryCategory | string | null;
  created_at: string;
  updated_at: string;
  last_recalled_at?: string | null;
  recall_count?: number;
  tags?: string[];
  archived?: boolean;
  archived_at?: string | null;
  branch?: string | null;
  directory_scope?: string | null;
  // v3 graph fields
  confidence?: number;
  confidence_source?: string;
  source?: string;
  archived_reason?: string | null;
  reinforcement_count?: number;
}

/** v3 graph stats for the dashboard memory health display. */
export interface GraphStats {
  activeNodes: number;
  archivedNodes: number;
  edges: number;
  avgConfidence: number;
  categories: Record<string, number>;
  contradictions: number;
  proceduralPatterns: number;
  crystallisedPatterns: number;
}

/** v3 contradiction pair for resolution UI. */
export interface ContradictionPair {
  nodeA: MemoryEntry;
  nodeB: MemoryEntry;
  similarity: number;
  edgeId: string;
}

/** v3 procedural pattern for the learned patterns display. */
export interface ProceduralPatternUI {
  id: string;
  taskType: string;
  toolSequence: string[];
  observationCount: number;
  confidence: number;
  crystallised: boolean;
  lastObservedAt: string;
}

export interface ConnectionStatus {
  github: boolean;
  email: boolean;
  slack: boolean;
  discord: boolean;
}

export interface DashboardSettings {
  language: string;
  permissionMode: 'strict' | 'balanced' | 'autonomous' | 'custom';
  categoryPermissions?: Record<string, string>;
  temperature: number;
  maxTokens: number;
  activeModel: string;
  autoMemory: boolean;
  memoryLocalOnly: boolean;
  contributeSharedLearning: boolean;
  streamResponses: boolean;
}

export interface ProviderKeyStatus {
  anthropic: boolean;
  deepseek: boolean;
  kimi: boolean;
  glm: boolean;
  qwen: boolean;
  mistral: boolean;
  [key: string]: boolean;
}

export interface UsageLogEntry {
  id: string;
  model: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  timestamp: string;
}

export interface ConversationEntry {
  id: string;
  title: string | null;
  project_id: string | null;
  pinned: boolean;
  messages: { role: string; content: string }[];
  created_at: string;
  updated_at: string;
}

export interface SupportTicket {
  id: string;
  email: string;
  name: string | null;
  subject: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  category: 'bug' | 'feature' | 'question' | 'account' | 'feedback' | 'teach' | 'other';
  source: 'tool' | 'dashboard' | 'website';
  created_at: string;
  updated_at: string;
  support_messages: {
    id: string;
    sender_type: 'user' | 'admin';
    sender_name: string;
    body: string;
    created_at: string;
  }[];
}

// ── Live Support Conversation (new system) ────────────────────────────────
export interface SupportConversation {
  id: string;
  user_id: string;
  platform: string;
  status: 'active' | 'resolved' | 'closed';
  unread_user: number;
  unread_admin: number;
  needs_human: boolean;
  summary: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  user: { email: string; name: string | null; tier: string } | null;
  messageCount: number;
  lastMessage: {
    preview: string;
    senderType: 'user' | 'admin' | 'ava';
    isAva: boolean;
    timestamp: string;
  } | null;
}

export interface SupportConversationMessage {
  id: string;
  sender_type: 'user' | 'admin' | 'ava';
  sender_name: string;
  body: string;
  is_ava: boolean;
  read_at: string | null;
  created_at: string;
}

export interface SessionStats {
  messages: number;
  tool_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  model_breakdown: Array<{
    model: string;
    provider: string;
    requests: number;
    input_tokens: number;
    output_tokens: number;
  }>;
  session_start: string;
}

export interface AdminToolProposal {
  id: string;
  user_email: string;
  user_name: string | null;
  tool_name: string;
  description: string;
  proposed_schema: Record<string, unknown>;
  risk_level: 'safe' | 'write' | 'dangerous';
  justification: string;
  task_context: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'implemented';
  reviewer_notes: string | null;
  vote_count: number;
  reward_granted: boolean;
  reward_tokens: number;
  created_at: string;
}

export interface DashboardTaskEntry {
  id: string;
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'todo' | 'in-progress' | 'done' | 'archived';
  due_date?: string;
  category: 'coding' | 'personal' | 'admin' | 'meeting' | 'custom';
  source: 'user' | 'ava';
  project: string;
  recurrence: 'none' | 'daily' | 'weekly';
  subtasks: { id: string; title: string; done: boolean }[];
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

// ─── Learning Types ─────────────────────────────────────────────────────────

export interface DashboardLearningLesson {
  id: string;
  title: string;
  type: string;
  status: string;
  score: number | null;
}

export interface DashboardLearningModule {
  id: string;
  title: string;
  description: string | null;
  status: string;
  progress_percent: number;
  lessons: DashboardLearningLesson[];
}

export interface DashboardLearningCurriculum {
  id: string;
  title: string;
  description: string | null;
  subject: string;
  level: string;
  goal: string | null;
  estimated_hours: number | null;
  status: string;
  progress_percent: number;
  modules: DashboardLearningModule[];
  created_at: string;
  updated_at: string;
}

// ─── Learning Library Types ─────────────────────────────────────────────────

export interface LibraryPath {
  id: string;
  title: string;
  description: string | null;
  subject: string;
  level: string;
  tags: string[];
  goal: string | null;
  prerequisites: string | null;
  estimated_hours: number | null;
  learning_objectives: string[];
  target_audience: string | null;
  source: 'curated' | 'community';
  author_name: string | null;
  fork_count: number;
  completion_count: number;
  rating_sum: number;
  rating_count: number;
  average_rating: number | null;
  created_at: string;
  published_at: string | null;
}

export interface LibraryPathDetail extends LibraryPath {
  content: {
    modules: Array<{
      title: string;
      description?: string;
      lessons: Array<{
        title: string;
        type: string;
        difficulty?: string;
        content?: string;
      }>;
    }>;
  };
}

// ─── Journal Types ───────────────────────────────────────────────────────────

export interface DashboardJournalEntry {
  content: string;
  mood?: number;
  tags?: string[];
  created_at: string;
  updated_at: string;
}

export interface DashboardJournalDay {
  date: string;
  user_entry: DashboardJournalEntry | null;
  ava_entry: DashboardJournalEntry | null;
}

export interface DashboardJournalDaySummary {
  date: string;
  has_user_entry: boolean;
  has_ava_entry: boolean;
  mood?: number;
}

export interface PersonalityData {
  name: string;
  pronouns: string;
  tone: string;
  energy: string;
  style: string;
  description: string;
}

// ─── Usage Analytics Types ───────────────────────────────────────────────────

export interface UsageHistoryData {
  balance: { used: number; limit: number; tier: string } | null;
  daily: Array<{ date: string; tokens: number }>;
  sessions: Array<{ date: string; duration: string; messages: number; tokens: number; model: string; cost: number }>;
  monthTotal: number;
  lastMonthTotal: number;
  topModels: Array<{ model: string; tokens: number }>;
  avgPerSession: number;
  totalSessions: number;
}

export type Page = 'overview' | 'chat' | 'keys' | 'usage' | 'memory' | 'tasks' | 'journal' | 'learning' | 'learning-library' | 'creative-studio' | 'library' | 'personality' | 'sync' | 'releases' | 'roadmap' | 'connections' | 'history' | 'support' | 'billing' | 'settings' | 'admin_support' | 'admin_proposals' | 'planner' | 'account' | 'help' | 'documentation';

// ─── Chat UI Types ──────────────────────────────────────────────────────────

export type ProviderSource = 'platform' | 'byok';
export type AvaMode = 'code' | 'plan' | 'chat' | 'teach' | 'security' | 'brainstorm';

export interface ChatPlatformStatus {
  connected: boolean;
  tier: string | null;
  freeTokensUsed: number;
  freeTokensLimit: number;
  subTokensUsed: number;
  subTokensLimit: number | null;
}

export interface ToolCallDisplay {
  id: string;
  name: string;
  arguments: string;
  status: 'pending_confirmation' | 'running' | 'success' | 'failed';
  result?: string;
  /** Live output chunks streamed via tool_call_partial (bash stdout, file edit diff previews, etc). */
  partialOutput?: string;
  confirmationId?: string;
  summary?: string;
  isAskUser?: boolean;
}

/**
 * A single event in an assistant message's chronological timeline.
 * See webview-ui types for full docs — same model, mirrored here because
 * dashboard-ui is a separate React app with its own type copy.
 */
export type MessageEvent =
  | { kind: 'thinking'; content: string }
  | { kind: 'text'; content: string }
  | { kind: 'tool_call'; toolCall: ToolCallDisplay };

export interface UIMessage {
  id: string;
  role: 'user' | 'assistant' | 'error' | 'system';
  content: string;
  thinking?: string;
  images?: string[];
  toolCalls: ToolCallDisplay[];
  /**
   * Canonical chronological timeline for assistant messages.
   * When present, MessageBubble renders this instead of the legacy
   * content/thinking/toolCalls fields. One assistant UIMessage per user
   * turn; events accumulate as the agent streams through think → tool →
   * text → think → ... within a single turn.
   */
  events?: MessageEvent[];
  isStreaming: boolean;
  errorCode?: string;
  errorSuggestion?: string;
  timestamp?: number;
  rating?: 'up' | 'down';
  ratingReason?: string;
}

/** Helper: get all visible text from an assistant message (for copy, rating, etc). */
export function getMessageText(msg: UIMessage): string {
  if (msg.events) {
    return msg.events
      .filter((e): e is Extract<MessageEvent, { kind: 'text' }> => e.kind === 'text')
      .map((e) => e.content)
      .join('');
  }
  return msg.content || '';
}

export interface MemoryEntryUI {
  id: string;
  category: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  lastRecalledAt: string | null;
  recallCount: number;
  tags?: string[];
  archived?: boolean;
  archivedAt?: string | null;
  branch?: string | null;
}

export interface TodayTaskUI {
  id: string;
  title: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'todo' | 'in-progress' | 'done';
  dueDate?: string;
  category: string;
}

export interface SessionTaskUI {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface AvaCompletedTaskUI {
  id: string;
  title: string;
  completedAt: string;
}

export interface ChatModel {
  id: string;
  name: string;
  provider: string;
  supportsVision?: boolean;
  available: boolean;
}

export interface ChatState {
  messages: UIMessage[];
  /** ID of the assistant bubble currently being built in the active turn. Cleared on done/error/user_message_ack. */
  currentAssistantId: string | null;
  models: ChatModel[];
  activeModel: string | null;
  isStreaming: boolean;
  isThinking: boolean;
  needsSetup: boolean;
  initialized: boolean;
  lastUsage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost?: number;
    contextWindow?: number;
  } | null;
  contextUsage: { used: number; limit: number; percent: number } | null;
  isCompressing: boolean;
  historyOpen: boolean;
  historyList: Array<{ id: string; title: string; updatedAt: string; pinned?: boolean }>;
  currentConversationId: string | null;
  providerSource: ProviderSource;
  platformStatus: {
    connected: boolean;
    tier: string | null;
    freeTokensUsed: number;
    freeTokensLimit: number;
    subTokensUsed: number;
    subTokensLimit: number | null;
  } | null;
  memoryOpen: boolean;
  memoryGlobal: MemoryEntryUI[];
  memoryProject: MemoryEntryUI[];
  tasksOpen: boolean;
  todayTasks: TodayTaskUI[];
  allTasks: TodayTaskUI[];
  sessionTasks: SessionTaskUI[];
  avaCompletedTasks: AvaCompletedTaskUI[];
  tasksPanelWidth: number;
  sessionTokens: number;
  conductorActive: boolean;
  conductorMode?: string;
  activePersonas: Array<{
    id: string;
    phase: 'active' | 'complete' | 'error';
    description?: string;
    output?: string;
    tools?: Array<{ name: string; done: boolean; success?: boolean }>;
  }>;
}

// Library (project files — images, documents, spreadsheets)
export type LibraryFileType = 'image' | 'document' | 'spreadsheet' | 'audio' | 'video';

export interface LibraryImage {
  path: string;         // Relative path from project root (e.g. "images/icons/settings.png")
  name: string;         // Filename
  folder: string;       // Parent folder (e.g. "images/icons")
  size: number;         // File size in bytes
  modified: string;     // ISO date string
  dimensions?: string;  // "1024x1024" if detectable
  dataUri?: string;     // Base64 data URI for display in webview
  fileType?: LibraryFileType;  // File category (defaults to 'image' for backwards compat)
}

/** Cloud-synced creative asset row returned by /api/creative-assets GET.
 *  Shape matches the select in packages/web/src/app/api/creative-assets/route.ts. */
export interface CreativeAsset {
  id: string;
  type?: string;            // legacy column, historical values ('image' | 'post' | etc.)
  asset_type?: string;      // newer column, matches ALLOWED_ASSET_TYPES on the server
  title?: string | null;
  prompt?: string | null;
  url?: string | null;         // public storage URL
  thumbnail_url?: string | null;
  source?: string | null;      // e.g. "Creative Studio", "Chat"
  created_at: string;
}

export interface ReleaseNote {
  id: string;
  version: string;
  title: string;
  body: string;
  highlights: string[];
  tool_count: number;
  published_at: string;
}

// Sync types
export interface SyncDataStatus {
  available: boolean;
  lastSynced: string | null;
  localCount: number;
  syncedCount: number;
  newCount: number;
}

export type SyncStatus = Record<string, SyncDataStatus>;

// Extension Host → Dashboard
export type ExtToDashboardMessage =
  | {
      type: 'init';
      account: AccountInfo | null;
      connections: ConnectionStatus;
      settings: DashboardSettings;
      providerKeys: ProviderKeyStatus;
      locale: string;
    }
  | { type: 'account_updated'; account: AccountInfo | null }
  | { type: 'dataset:config'; config: {
      enabled: boolean;
      capture_modes: string[];
      capture_datasets: string[];
      redact_patterns: string[];
      min_trajectory_length: number;
    } }
  | { type: 'provider_keys_updated'; providerKeys: ProviderKeyStatus }
  | { type: 'sync_prefs_loaded'; prefs: Record<string, boolean> }
  | { type: 'memories_loaded'; memories: MemoryEntry[]; total?: number; hasMore?: boolean }
  | { type: 'memories_more_loaded'; memories: MemoryEntry[]; total?: number; hasMore?: boolean }
  | { type: 'memory_deleted'; id: string }
  | { type: 'memory_upserted'; memory: MemoryEntry }
  | { type: 'connection_tested'; service: string; success: boolean; message: string }
  | { type: 'connection_saved'; service: string }
  | { type: 'connection_removed'; service: string }
  | { type: 'usage_logs_loaded'; logs: UsageLogEntry[] }
  | { type: 'conversations_loaded'; conversations: ConversationEntry[] }
  | { type: 'conversation_deleted'; id: string }
  | { type: 'conversation_pinned'; id: string; pinned: boolean }
  | { type: 'tickets_loaded'; tickets: SupportTicket[] }
  | { type: 'ticket_created'; ticket: SupportTicket }
  | { type: 'ticket_reply_sent'; ticketId: string }
  // Admin messages
  | { type: 'admin_tickets_loaded'; tickets: SupportTicket[]; total: number }
  | { type: 'admin_conversations_loaded'; conversations: SupportConversation[] }
  | { type: 'admin_conversation_messages_loaded'; conversationId: string; messages: SupportConversationMessage[] }
  | { type: 'admin_conversation_updated'; conversationId: string }
  | { type: 'admin_proposals_loaded'; proposals: AdminToolProposal[]; total: number }
  | { type: 'admin_proposal_updated' }
  // BYOK messages
  | { type: 'local_memories_loaded'; memories: MemoryEntry[] }
  | { type: 'local_memory_deleted'; id: string }
  | { type: 'local_memory_upserted'; memory: MemoryEntry }
  | { type: 'session_stats_loaded'; stats: SessionStats }
  | { type: 'usage_history_loaded'; data: UsageHistoryData | null }
  | { type: 'byok_support_sent'; success: boolean; message: string }
  // Task messages
  | { type: 'tasks_loaded'; tasks: DashboardTaskEntry[] }
  | { type: 'task_upserted'; task: DashboardTaskEntry }
  | { type: 'task_deleted'; id: string }
  // Journal messages
  | { type: 'journal_day_loaded'; day: DashboardJournalDay }
  | { type: 'journal_summaries_loaded'; summaries: DashboardJournalDaySummary[] }
  | { type: 'journal_day_updated'; day: DashboardJournalDay }
  | { type: 'session_tasks_updated'; tasks: Array<{ id: string; title: string; status: 'pending' | 'in_progress' | 'completed' }> }
  // Learning messages
  | { type: 'learning_loaded'; curriculums: DashboardLearningCurriculum[] }
  | { type: 'curriculum_deleted'; id: string }
  // Learning Library messages
  | { type: 'library_paths_loaded'; paths: LibraryPath[]; total: number }
  | { type: 'library_path_detail_loaded'; path: LibraryPathDetail }
  | { type: 'library_path_forked'; curriculumId: string; title: string }
  | { type: 'library_path_published'; pathId: string; status: string; message: string }
  | { type: 'library_path_rated'; pathId: string; rating: number }
  | { type: 'task_dates_loaded'; dates: string[] }
  // Avatar messages
  | { type: 'avatar_loaded'; dataUrl: string }
  | { type: 'avatar_saved'; dataUrl: string }
  | { type: 'avatar_removed' }
  // Sync messages
  | { type: 'sync_status'; data: SyncStatus }
  | { type: 'sync_started'; dataType: string }
  | { type: 'sync_completed'; dataType: string; count: number }
  | { type: 'sync_error'; dataType: string; message: string }
  // Release notes
  | { type: 'releases_loaded'; releases: ReleaseNote[] }
  // Library
  | { type: 'library_loaded'; images: LibraryImage[]; projectRoot: string; hasFolder?: boolean }
  | { type: 'library_image_deleted'; path: string }
  | { type: 'cloud_assets_loaded'; assets: CreativeAsset[] }
  | { type: 'cloud_assets_error'; message: string }
  | { type: 'cloud_asset_deleted'; id: string }
  // Personality
  | { type: 'personality_loaded'; personality: PersonalityData }
  | { type: 'personality_saved' }
  | { type: 'personality_reset'; personality: PersonalityData }
  // Overview widget data
  | { type: 'weather_loaded'; data: { location: string; temp_c: number; condition: string; emoji: string; humidity: number; wind_kmph: number; forecast: Array<{ date: string; day: string; max_c: number; min_c: number; condition: string; emoji: string }> } | null }
  | { type: 'news_loaded'; articles: Array<{ title: string; category: string; reading_time: number; slug: string; date: string }> }
  | { type: 'news_article_loaded'; post: Record<string, unknown> | null; related: Array<Record<string, unknown>>; loading?: boolean }
  | { type: 'latest_release_loaded'; release: { version: string; title: string; published_at: string } | null }
  | { type: 'error'; message: string }
  | { type: 'info'; message: string }
  // ── Chat messages (Extension → Chat page) ───────────────────────────────
  | { type: 'chat_init'; models: ChatModel[]; activeModel: string | null; needsSetup: boolean; locale?: string; localeStrings?: Record<string, string>; providerSource?: ProviderSource; platformStatus?: ChatPlatformStatus }
  | ({ type: 'chat_platform_status' } & ChatPlatformStatus)
  | { type: 'user_message_ack'; text: string; images?: string[] }
  | { type: 'stream_start' }
  | { type: 'thinking_delta'; content: string }
  | { type: 'stream_delta'; content: string }
  | { type: 'stream_end' }
  | { type: 'tool_call_start'; toolCall: { id: string; name: string; arguments: string } }
  | { type: 'tool_call_end'; toolCallId: string; result: string; success: boolean }
  | { type: 'tool_confirmation_request'; confirmationId: string; toolCallId?: string; toolName: string; toolCategory?: string; args: Record<string, unknown>; summary: string; isAskUser?: boolean }
  | { type: 'category_permissions'; permissions: Record<string, string>; mode: string }
  | { type: 'audit_log'; entries: Array<{ timestamp: string; toolName: string; category: string; riskLevel: string; approvalMethod: string; status: string; argsSummary: string; fullArgs?: Record<string, unknown>; result?: string }> }
  | { type: 'usage'; usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }; cost?: number; contextWindow?: number }
  | { type: 'done' }
  | { type: 'model_switched'; modelId: string; modelName: string }
  | { type: 'history_list'; conversations: Array<{ id: string; title: string; updatedAt: string; pinned?: boolean }> }
  | { type: 'history_search_results'; conversations: Array<{ id: string; title: string; updatedAt: string; pinned?: boolean }> }
  | { type: 'conversation_loaded'; conversationId: string; title: string; messages: Array<{ role: 'user' | 'assistant'; content: string }> }
  | { type: 'chat_cleared' }
  | { type: 'context_usage'; used: number; limit: number; percent: number }
  | { type: 'compression_start' }
  | { type: 'compression_end'; originalTokens: number; compressedTokens: number }
  | { type: 'memory_content'; global: MemoryEntryUI[]; project: MemoryEntryUI[] }
  | { type: 'system_message'; content: string }
  | { type: 'ping' }
  | { type: 'focus_input' }
  | { type: 'interjection_ack'; content: string }
  | { type: 'today_tasks'; tasks: TodayTaskUI[] }
  | { type: 'all_tasks'; tasks: TodayTaskUI[] }
  | { type: 'session_tasks'; tasks: SessionTaskUI[] }
  | { type: 'ava_completed_tasks'; tasks: AvaCompletedTaskUI[] }
  | { type: 'conductor_status'; active: boolean; mode?: string }
  | { type: 'persona_status'; persona: string; phase: 'active' | 'complete' | 'error'; description?: string; output?: string }
  | { type: 'persona_tool_call'; persona: string; tool: string }
  | { type: 'persona_tool_result'; persona: string; tool: string; success: boolean }
  | { type: 'briefing'; text: string; todayTasks: number; overdueTasks: number; totalActive: number }
  | { type: 'data_exported'; dataType: string; content: string; filename: string }
  | { type: 'data_imported'; dataType: string; count: number };

// Dashboard → Extension Host
export type DashboardToExtMessage =
  | { type: 'webview_ready' }
  | { type: 'connect_account'; key: string }
  | { type: 'disconnect_account' }
  | { type: 'skip_account' }
  | { type: 'save_provider_key'; provider: string; apiKey: string }
  | { type: 'remove_provider_key'; provider: string }
  | { type: 'load_memories' }
  | { type: 'load_more_memories' }
  | { type: 'delete_memory'; id: string }
  | { type: 'upsert_memory'; id?: string; scope?: 'global' | 'project'; key?: string; content: string; category?: string | null }
  | { type: 'archive_memory'; id: string }
  | { type: 'restore_memory'; id: string }
  | { type: 'save_connection'; service: 'github' | 'email' | 'slack' | 'discord'; credentials: Record<string, string> }
  | { type: 'remove_connection'; service: string }
  | { type: 'test_connection'; service: string }
  | { type: 'load_usage_logs'; period: '7d' | '30d' | 'all' }
  | { type: 'open_checkout'; plan: 'pro' | 'ultra' }
  | { type: 'open_topup'; package: 'starter' | 'standard' | 'pro_pack' }
  | { type: 'open_storage_addon'; size: '50gb' | '250gb' | '1tb' }
  | { type: 'open_portal' }
  | { type: 'save_settings'; settings: DashboardSettings }
  | { type: 'open_chat' }
  // Dataset capture (Ava action capture for the future own-model training run).
  // Lives outside DashboardSettings because it has its own granular schema
  // and writes to ~/.ava/datasets/config.json directly via core.
  | { type: 'dataset:get_config' }
  | { type: 'dataset:set_config'; config: {
      enabled: boolean;
      capture_modes: string[];
      capture_datasets: string[];
      redact_patterns: string[];
      min_trajectory_length: number;
    } }
  | { type: 'open_url'; url: string }
  | { type: 'update_name'; name: string }
  | { type: 'refresh_account' }
  | { type: 'refresh_storage' }
  | { type: 'set_data_mode'; mode: 'local' | 'cloud' | 'both' }
  | { type: 'delete_all_cloud_conversations' }
  | { type: 'delete_all_cloud_tasks' }
  | { type: 'delete_all_cloud_journal' }
  | { type: 'delete_all_cloud_creative' }
  | { type: 'load_conversations' }
  | { type: 'delete_conversation'; id: string }
  | { type: 'toggle_pin_conversation'; id: string }
  | { type: 'load_tickets' }
  | { type: 'create_support_ticket'; subject: string; message: string }
  | { type: 'reply_support_ticket'; ticketId: string; message: string }
  // Admin messages
  | { type: 'load_admin_tickets'; status?: string }
  | { type: 'admin_reply_ticket'; ticketId: string; message: string }
  | { type: 'admin_update_ticket'; ticketId: string; status: string }
  | { type: 'load_admin_conversations'; status?: string; needsHuman?: boolean }
  | { type: 'load_admin_conversation_messages'; conversationId: string }
  | { type: 'admin_reply_conversation'; conversationId: string; message: string }
  | { type: 'admin_update_conversation'; conversationId: string; status?: string; needs_human?: boolean }
  | { type: 'load_admin_proposals'; status?: string }
  | { type: 'admin_update_proposal'; id: string; status: string; reviewer_notes?: string; reward_tokens?: number }
  // BYOK messages
  | { type: 'load_local_memories' }
  | { type: 'delete_local_memory'; id: string }
  | { type: 'upsert_local_memory'; id?: string; content: string; category?: string | null }
  | { type: 'archive_local_memory'; id: string }
  | { type: 'restore_local_memory'; id: string }
  | { type: 'load_session_stats' }
  | { type: 'load_usage_history' }
  | { type: 'send_byok_support'; email: string; subject: string; message: string }
  // Task messages
  | { type: 'load_tasks' }
  | { type: 'create_task'; title: string; description?: string; priority?: string; category?: string; due_date?: string; recurrence?: string }
  | { type: 'update_task'; id: string; title?: string; description?: string; priority?: string; status?: string; category?: string; due_date?: string; recurrence?: string; subtasks?: { id: string; title: string; done: boolean }[] }
  | { type: 'delete_task'; id: string }
  | { type: 'complete_task'; id: string }
  | { type: 'archive_task'; id: string }
  | { type: 'restore_task'; id: string }
  // Journal messages
  | { type: 'load_journal_day'; date: string }
  | { type: 'load_journal_summaries'; from: string; to: string }
  | { type: 'save_journal_user_entry'; date: string; content: string; mood?: number; tags?: string[] }
  | { type: 'delete_journal_user_entry'; date: string }
  | { type: 'delete_journal_ava_entry'; date: string }
  | { type: 'load_session_tasks' }
  // Learning messages
  | { type: 'load_learning' }
  | { type: 'delete_curriculum'; id: string }
  // Learning Library messages
  | { type: 'load_library_paths'; search?: string; subject?: string; level?: string; sort?: string }
  | { type: 'load_library_path_detail'; id: string }
  | { type: 'fork_library_path'; id: string }
  | { type: 'publish_to_library'; curriculumId: string }
  | { type: 'rate_library_path'; id: string; rating: number }
  | { type: 'load_task_dates' }
  // Sync messages
  | { type: 'load_sync_status' }
  | { type: 'load_sync_prefs' }
  | { type: 'set_sync_pref'; dataType: 'memory' | 'tasks' | 'journal' | 'learning' | 'history' | 'settings' | 'personality' | 'learnings'; enabled: boolean }
  | { type: 'push_to_cloud'; dataType: 'memory' | 'tasks' | 'journal' | 'learning' | 'history' | 'settings' | 'personality' | 'learnings' }
  | { type: 'save_avatar'; data: string; mimeType: string }
  | { type: 'remove_avatar' }
  | { type: 'load_avatar' }
  // Release notes
  | { type: 'load_releases' }
  // Library
  | { type: 'load_library' }
  | { type: 'load_cloud_assets' }
  | { type: 'download_cloud_asset'; url: string; filename: string }
  | { type: 'delete_cloud_asset'; id: string }
  | { type: 'delete_library_image'; path: string }
  | { type: 'open_library_image'; path: string }
  | { type: 'open_external'; path: string }
  | { type: 'reveal_in_explorer'; path: string }
  // Creative Studio — Documents tab (host prompts for filename via showInputBox
  // because webviews can't use window.prompt)
  | { type: 'create_blank_document'; format: 'docx' | 'xlsx' | 'csv' | 'md' | 'pdf' }
  | { type: 'create_from_template'; template: 'proposal' | 'report' | 'invoice' | 'letter' | 'meeting_notes' | 'resume' }
  // Personality
  | { type: 'load_personality' }
  | { type: 'save_personality'; personality: PersonalityData }
  | { type: 'reset_personality' }
  // Overview widgets (routed through extension host)
  | { type: 'load_weather' }
  | { type: 'load_news'; category?: string }
  | { type: 'load_news_article'; slug: string }
  | { type: 'load_latest_release' }
  // ── Chat messages (Chat page → Extension) ───────────────────────────────
  | { type: 'send_message'; text: string; mode: AvaMode; attachments?: Array<{ type: 'image'; data: string; name: string }> }
  | { type: 'tool_confirmation_response'; confirmationId: string; approved: boolean; alwaysAllowCategory?: boolean; planSelection?: string; userResponse?: string }
  | { type: 'set_category_permission'; category: string; permission: string }
  | { type: 'request_audit_log' }
  | { type: 'creative_generate'; endpoint: string; body: Record<string, unknown> }
  | { type: 'switch_model'; modelId: string }
  | { type: 'clear_chat' }
  | { type: 'cancel' }
  | { type: 'interrupt' }
  | { type: 'request_history' }
  | { type: 'load_chat_conversation'; conversationId: string }
  | { type: 'delete_chat_conversation'; conversationId: string }
  | { type: 'search_history'; query: string }
  | { type: 'rename_conversation'; conversationId: string; newTitle: string }
  | { type: 'pin_conversation'; conversationId: string; pinned: boolean }
  | { type: 'export_conversation'; conversationId: string; format: 'markdown' | 'json' }
  | { type: 'new_chat' }
  | { type: 'compress_context' }
  | { type: 'set_provider_source'; source: ProviderSource }
  | { type: 'request_memory' }
  | { type: 'save_chat_memory'; scope: 'global' | 'project'; content: string }
  | { type: 'clear_chat_memory'; scope: 'global' | 'project' }
  | { type: 'archive_chat_memory'; scope: 'global' | 'project'; id: string }
  | { type: 'restore_chat_memory'; scope: 'global' | 'project'; id: string }
  | { type: 'delete_chat_memory_entry'; scope: 'global' | 'project'; id: string }
  | { type: 'pong' }
  | { type: 'request_today_tasks' }
  | { type: 'request_all_tasks' }
  | { type: 'toggle_task'; taskId: string }
  | { type: 'rate_message'; messageId: string; rating: 'up' | 'down'; reason?: string; model?: string; mode?: string }
  | { type: 'save_secrets'; secrets: Array<{ id: string; label: string; value: string }> }
  | { type: 'export_data'; dataType: string }
  | { type: 'import_data'; dataType: string; content: string };
