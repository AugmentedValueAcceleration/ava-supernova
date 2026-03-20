// ─── Shared type definitions ─────────────────────────────────────────────────
// IMPORTANT: Keep in sync with dashboard-ui/src/types/messages.ts

export interface AccountInfo {
  id: string;
  email: string;
  name: string | null;
  tier: 'free' | 'pro' | 'ultra' | 'admin';
  usage: {
    tokens_used: number;
    tokens_limit: number | null;
    requests_count: number;
    period_start: string | null;
    period_end: string | null;
    free_tokens_used: number;
    free_tokens_limit: number;
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
}

export interface ConnectionStatus {
  github: boolean;
  email: boolean;
  slack: boolean;
  discord: boolean;
}

export interface DashboardSettings {
  language: string;
  permissionMode: 'strict' | 'balanced' | 'autonomous';
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

// ─── Task Management ─────────────────────────────────────────────────────────

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

// ─── Release Notes ──────────────────────────────────────────────────────────

export interface ReleaseNote {
  id: string;
  version: string;
  title: string;
  body: string;
  highlights: string[];
  tool_count: number;
  published_at: string;
}

// ─── Sync Types ─────────────────────────────────────────────────────────────

export interface SyncDataStatus {
  available: boolean;
  lastSynced: string | null;
  localCount: number;
  syncedCount: number;
  newCount: number;
}

export type SyncStatus = Record<string, SyncDataStatus>;

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

export type Page = 'overview' | 'keys' | 'usage' | 'memory' | 'tasks' | 'journal' | 'learning' | 'library' | 'personality' | 'sync' | 'releases' | 'connections' | 'history' | 'support' | 'billing' | 'settings' | 'admin_support' | 'admin_proposals';

// Library (project files — images, documents, spreadsheets, presentations)
export type LibraryFileType = 'image' | 'document' | 'spreadsheet' | 'presentation';

export interface LibraryImage {
  path: string;
  name: string;
  folder: string;
  size: number;
  modified: string;
  dimensions?: string;
  fileType?: LibraryFileType;
  dataUri?: string;
}

// ─── Extension Host → Dashboard Webview ──────────────────────────────────────

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
  | { type: 'provider_keys_updated'; providerKeys: ProviderKeyStatus }
  | { type: 'memories_loaded'; memories: MemoryEntry[] }
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
  // Session tasks (Ava's progress)
  | { type: 'session_tasks_updated'; tasks: Array<{ id: string; title: string; status: 'pending' | 'in_progress' | 'completed' }> }
  // Learning messages
  | { type: 'learning_loaded'; curriculums: DashboardLearningCurriculum[] }
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
  // Personality
  | { type: 'personality_loaded'; personality: PersonalityData }
  | { type: 'personality_saved' }
  | { type: 'personality_reset'; personality: PersonalityData }
  // Overview widget data
  | { type: 'weather_loaded'; data: { location: string; temp_c: number; condition: string; emoji: string; humidity: number; wind_kmph: number; forecast: Array<{ date: string; day: string; max_c: number; min_c: number; condition: string; emoji: string }> } | null }
  | { type: 'news_loaded'; articles: Array<{ title: string; category: string; reading_time: number; slug: string; date: string }> }
  | { type: 'latest_release_loaded'; release: { version: string; title: string; published_at: string } | null }
  | { type: 'error'; message: string };

// ─── Dashboard Webview → Extension Host ──────────────────────────────────────

export type DashboardToExtMessage =
  | { type: 'webview_ready' }
  | { type: 'connect_account'; key: string }
  | { type: 'disconnect_account' }
  | { type: 'skip_account' }
  | { type: 'save_provider_key'; provider: string; apiKey: string }
  | { type: 'remove_provider_key'; provider: string }
  | { type: 'load_memories' }
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
  | { type: 'open_portal' }
  | { type: 'save_settings'; settings: DashboardSettings }
  | { type: 'open_chat' }
  | { type: 'open_url'; url: string }
  | { type: 'update_name'; name: string }
  | { type: 'refresh_account' }
  | { type: 'load_conversations' }
  | { type: 'delete_conversation'; id: string }
  | { type: 'toggle_pin_conversation'; id: string }
  | { type: 'load_tickets' }
  | { type: 'create_support_ticket'; subject: string; message: string; category?: string }
  | { type: 'reply_support_ticket'; ticketId: string; message: string }
  // Admin messages
  | { type: 'load_admin_tickets'; status?: string }
  | { type: 'admin_reply_ticket'; ticketId: string; message: string }
  | { type: 'admin_update_ticket'; ticketId: string; status: string }
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
  // Session tasks (Ava's progress)
  | { type: 'load_session_tasks' }
  // Learning messages
  | { type: 'load_learning' }
  // Sync messages
  | { type: 'load_sync_status' }
  | { type: 'push_to_cloud'; dataType: 'memory' | 'tasks' | 'journal' | 'learning' | 'history' | 'settings' | 'personality' }
  // Release notes
  | { type: 'load_releases' }
  // Library
  | { type: 'load_library' }
  | { type: 'delete_library_image'; path: string }
  | { type: 'open_library_image'; path: string }
  | { type: 'open_external'; path: string }
  // Personality
  | { type: 'load_personality' }
  | { type: 'save_personality'; personality: PersonalityData }
  | { type: 'reset_personality' }
  // Overview widgets (routed through extension host)
  | { type: 'load_weather' }
  | { type: 'load_news'; category?: string }
  | { type: 'load_latest_release' };
