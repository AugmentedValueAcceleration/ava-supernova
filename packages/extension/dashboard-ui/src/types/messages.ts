// Mirror of src/webview/dashboard-message-types.ts — kept in sync manually.
// The dashboard React app is a browser bundle and cannot import from the extension host.

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

export type Page = 'overview' | 'usage' | 'memory' | 'connections' | 'billing' | 'settings';

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
  | { type: 'provider_keys_updated'; providerKeys: ProviderKeyStatus }
  | { type: 'memories_loaded'; memories: MemoryEntry[] }
  | { type: 'memory_deleted'; id: string }
  | { type: 'memory_upserted'; memory: MemoryEntry }
  | { type: 'connection_tested'; service: string; success: boolean; message: string }
  | { type: 'connection_saved'; service: string }
  | { type: 'connection_removed'; service: string }
  | { type: 'usage_logs_loaded'; logs: UsageLogEntry[] }
  | { type: 'error'; message: string };

// Dashboard → Extension Host
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
  | { type: 'refresh_account' };
