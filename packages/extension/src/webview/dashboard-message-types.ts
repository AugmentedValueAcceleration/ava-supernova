// ─── Shared type definitions ─────────────────────────────────────────────────

export interface AccountInfo {
  id: string;
  email: string;
  name: string | null;
  tier: 'free' | 'pro' | 'ultra';
  usage: {
    tokens_used: number;
    tokens_limit: number | null;
    requests_count: number;
    period_start: string | null;
    period_end: string | null;
  } | null;
}

export interface MemoryEntry {
  id: string;
  scope: 'global' | 'project';
  project_id: string | null;
  key: string;
  content: string;
  category: string | null;
  created_at: string;
  updated_at: string;
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

// ─── Extension Host → Dashboard Webview ──────────────────────────────────────

export type ExtToDashboardMessage =
  | {
      type: 'init';
      account: AccountInfo | null;
      connections: ConnectionStatus;
      settings: DashboardSettings;
      locale: string;
    }
  | { type: 'account_updated'; account: AccountInfo | null }
  | { type: 'memories_loaded'; memories: MemoryEntry[] }
  | { type: 'memory_deleted'; id: string }
  | { type: 'memory_upserted'; memory: MemoryEntry }
  | { type: 'connection_tested'; service: string; success: boolean; message: string }
  | { type: 'connection_saved'; service: string }
  | { type: 'connection_removed'; service: string }
  | { type: 'error'; message: string };

// ─── Dashboard Webview → Extension Host ──────────────────────────────────────

export type DashboardToExtMessage =
  | { type: 'webview_ready' }
  | { type: 'connect_account'; key: string }
  | { type: 'disconnect_account' }
  | { type: 'load_memories' }
  | { type: 'delete_memory'; id: string }
  | { type: 'upsert_memory'; id?: string; scope?: 'global' | 'project'; key?: string; content: string; category?: string | null }
  | { type: 'save_connection'; service: 'github' | 'email' | 'slack' | 'discord'; credentials: Record<string, string> }
  | { type: 'remove_connection'; service: string }
  | { type: 'test_connection'; service: string }
  | { type: 'open_checkout'; plan: 'pro' | 'ultra' }
  | { type: 'open_topup'; package: 'starter' | 'standard' | 'pro_pack' }
  | { type: 'open_portal' }
  | { type: 'save_settings'; settings: DashboardSettings }
  | { type: 'open_chat' };
