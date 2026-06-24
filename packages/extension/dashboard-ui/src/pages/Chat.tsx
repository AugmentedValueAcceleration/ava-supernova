import { useReducer, useEffect, useRef, useCallback, useState } from 'react';
import type {
  ExtToDashboardMessage,
  ChatState,
  UIMessage,
  MessageEvent,
  Page,
  AvaMode,
} from '../types/messages';
import { ChatContainer } from '../chat/components/ChatContainer';
import { ContextBar } from '../chat/components/ContextBar';
import { InputArea } from '../chat/components/InputArea';
import type { ImageAttachment } from '../chat/components/InputArea';
import type { PaletteTool } from '../chat/components/CommandPalette';
import { Header } from '../chat/components/Header';
import { MemoryPanel } from '../chat/components/MemoryPanel';
import { TasksPanel, DEFAULT_WIDTH, type UpdateTaskInput } from '../chat/components/TasksPanel';
import { TasksSpine } from '../chat/components/TasksSpine';
import { SecretsProvider } from '../chat/hooks/useSecrets';
import { t, setLocale, loadStrings } from '../i18n';
import { post } from '../vscode';

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function stripModePrefix(content: string): string {
  if (typeof content !== 'string') return content;
  const prefixes = ['[Chat Mode]', '[Teach Mode]', '[Plan Mode]', '[Security Mode]', '[Brainstorm Mode]', '[Work Mode]'];
  for (const p of prefixes) {
    if (content.startsWith(p)) {
      const lastBlankIdx = content.lastIndexOf('\n\n');
      if (lastBlankIdx > 0) return content.slice(lastBlankIdx + 2).trim();
      return content;
    }
  }
  return content;
}

/* ── Chat action type ─────────────────────────────────────────────────────── */

type ChatAction =
  | ExtToDashboardMessage
  | { type: 'close_history' }
  | { type: 'close_memory' }
  | { type: 'toggle_tasks' }
  | { type: 'close_tasks' }
  | { type: 'set_tasks_width'; width: number }
  | { type: 'rate_message'; messageId: string; rating: 'up' | 'down'; reason?: string }
  | { type: 'confirmation_responded'; confirmationId: string; approved: boolean }
  | { type: 'remove_last_error' };

let messageIdCounter = 0;
function nextId(): string {
  return `msg-${++messageIdCounter}`;
}

/* ── Event timeline helpers ───────────────────────────────────────────────── */

/** Append content to the last event if it's the same kind, else start a new event. */
function appendToLastEventOfKind(
  events: MessageEvent[],
  kind: 'thinking' | 'text',
  chunk: string,
): MessageEvent[] {
  const last = events[events.length - 1];
  if (last && last.kind === kind) {
    return [
      ...events.slice(0, -1),
      { kind, content: last.content + chunk },
    ];
  }
  return [...events, { kind, content: chunk }];
}

/** Find the tool_call event whose toolCall.id matches, return its index or -1. */
function findToolCallEventIndex(events: MessageEvent[], toolCallId: string): number {
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.kind === 'tool_call' && e.toolCall.id === toolCallId) return i;
  }
  return -1;
}

/**
 * Update the events array of the message with the given ID. Returns a new
 * messages array.
 *
 * Defensive re-attach: if messageId is null (current bubble was closed by
 * a premature done), attach to the most recent assistant message instead
 * of silently dropping events. Prevents the "Ava is working but UI is
 * frozen" failure mode where post-done events hit a silent drop.
 */
function updateMessageEvents(
  messages: UIMessage[],
  messageId: string | null,
  updater: (events: MessageEvent[]) => MessageEvent[],
): UIMessage[] {
  if (messageId) {
    return messages.map((m) =>
      m.id === messageId
        ? { ...m, events: updater(m.events || []) }
        : m,
    );
  }
  // Fallback: find the most recent assistant message and attach to it
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      const idx = i;
      return messages.map((m, j) =>
        j === idx
          ? { ...m, events: updater(m.events || []) }
          : m,
      );
    }
  }
  return messages;
}

/* ── Reducer ──────────────────────────────────────────────────────────────── */

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'chat_init': {
      if (action.locale && action.locale !== 'en') {
        setLocale(action.locale);
        if (action.localeStrings) loadStrings(action.locale, action.localeStrings);
      }
      // BYOK-only sessions (no platform key) have nothing to fetch —
      // drop both gates immediately. Sessions with a platform key drop
      // accountLoading the moment chat_init carries platformStatus
      // (the host fetched it before sending init).
      const initProviderSource = action.providerSource ?? state.providerSource;
      const isByokOnly = initProviderSource === 'byok';
      const platformStatusIncluded = !!action.platformStatus;
      return {
        ...state,
        initialized: true,
        models: action.models,
        activeModel: action.activeModel,
        needsSetup: action.needsSetup,
        providerSource: initProviderSource,
        accountLoading: isByokOnly ? false : (platformStatusIncluded ? false : state.accountLoading),
        // Drop the history gate on init unconditionally. The chat surface
        // doesn't need the conversation list to render — that data only
        // populates the History sidebar. Previously this stayed true
        // until history_list arrived, which left the spinner hanging
        // for users with empty history if the local-list message
        // happened to race the init message. The host fires sendHistoryList
        // right after init, and the sidebar gates its own open state
        // separately on historyList being non-null.
        historyLoading: false,
        platformStatus: action.platformStatus
          ? {
              connected: action.platformStatus.connected,
              tier: action.platformStatus.tier,
              freeTokensUsed: action.platformStatus.freeTokensUsed,
              freeTokensLimit: action.platformStatus.freeTokensLimit,
              subTokensUsed: action.platformStatus.subTokensUsed,
              subTokensLimit: action.platformStatus.subTokensLimit,
            }
          : state.platformStatus,
      };
    }

    case 'user_message_ack': {
      const msg: UIMessage = {
        id: nextId(),
        role: 'user',
        content: action.text,
        ...(action.images?.length ? { images: action.images } : {}),
        toolCalls: [],
        isStreaming: false,
        timestamp: Date.now(),
      };
      // New user message = new turn. Clear currentAssistantId so the next
      // stream_start creates a fresh assistant bubble.
      return {
        ...state,
        messages: [...state.messages, msg],
        currentAssistantId: null,
        isStreaming: true,
      };
    }

    case 'stream_start': {
      // One assistant bubble per user turn. If a bubble already exists for
      // this turn (second+ LLM iteration), keep using it. If currentAssistantId
      // is null but the last message is already an assistant bubble, re-attach
      // to it (defensive — recovers from premature done events). Only create a
      // new bubble as a last resort.
      if (state.currentAssistantId) {
        return { ...state, isStreaming: true, isThinking: true };
      }
      const lastMsg = state.messages[state.messages.length - 1];
      if (lastMsg && lastMsg.role === 'assistant') {
        return {
          ...state,
          currentAssistantId: lastMsg.id,
          isStreaming: true,
          isThinking: true,
        };
      }
      const newId = nextId();
      const msg: UIMessage = {
        id: newId,
        role: 'assistant',
        content: '',
        toolCalls: [],
        events: [],
        isStreaming: true,
        timestamp: Date.now(),
      };
      return {
        ...state,
        messages: [...state.messages, msg],
        currentAssistantId: newId,
        isStreaming: true,
        isThinking: true,
      };
    }

    case 'thinking_delta': {
      // Defensive: restore streaming state if premature done cleared it.
      const messages = updateMessageEvents(state.messages, state.currentAssistantId, (events) =>
        appendToLastEventOfKind(events, 'thinking', action.content),
      );
      return { ...state, messages, isThinking: true, isStreaming: true };
    }

    case 'stream_delta': {
      // Defensive: restore streaming state if premature done cleared it.
      const messages = updateMessageEvents(state.messages, state.currentAssistantId, (events) =>
        appendToLastEventOfKind(events, 'text', action.content),
      );
      return { ...state, messages, isThinking: false, isStreaming: true };
    }

    case 'stream_end': {
      // Don't close the bubble — the agent loop may continue with more
      // tool calls and streaming rounds. Only 'done' ends the response.
      return { ...state, isThinking: false };
    }

    case 'tool_call_start': {
      // Insert or update a tool_call event in the current bubble's events.
      // Handles the synthetic-placeholder dedupe where tool_confirmation_request
      // arrived before tool_call_start.
      const messages = updateMessageEvents(state.messages, state.currentAssistantId, (events) => {
        const idx = findToolCallEventIndex(events, action.toolCall.id);
        if (idx >= 0) {
          const existing = (events[idx] as Extract<MessageEvent, { kind: 'tool_call' }>).toolCall;
          const next = [...events];
          next[idx] = {
            kind: 'tool_call',
            toolCall: {
              ...existing,
              arguments: action.toolCall.arguments,
              name: action.toolCall.name,
              status: existing.status === 'pending_confirmation' ? existing.status : 'running',
            },
          };
          return next;
        }
        return [
          ...events,
          {
            kind: 'tool_call',
            toolCall: {
              id: action.toolCall.id,
              name: action.toolCall.name,
              arguments: action.toolCall.arguments,
              status: 'running',
            },
          },
        ];
      });
      // Defensive: tool call starting means the agent is active.
      return { ...state, messages, isStreaming: true, isThinking: false };
    }

    case 'tool_call_partial': {
      // Live stream chunks — append to partialOutput of the matching tool.
      const messages = updateMessageEvents(state.messages, state.currentAssistantId, (events) => {
        const idx = findToolCallEventIndex(events, action.toolCallId);
        if (idx < 0) return events;
        const existing = (events[idx] as Extract<MessageEvent, { kind: 'tool_call' }>).toolCall;
        const next = [...events];
        next[idx] = {
          kind: 'tool_call',
          toolCall: {
            ...existing,
            partialOutput: (existing.partialOutput || '') + action.data,
          },
        };
        return next;
      });
      return { ...state, messages };
    }

    case 'tool_confirmation_request': {
      // Update the matching tool_call event or synthesise a pending
      // placeholder if tool_call_start hasn't landed yet (race safety).
      const messages = updateMessageEvents(state.messages, state.currentAssistantId, (events) => {
        let matchIdx = action.toolCallId ? findToolCallEventIndex(events, action.toolCallId) : -1;
        if (matchIdx < 0) {
          for (let i = events.length - 1; i >= 0; i--) {
            const e = events[i];
            if (e.kind === 'tool_call' && e.toolCall.status === 'running' && e.toolCall.name === action.toolName) {
              matchIdx = i;
              break;
            }
          }
        }
        if (matchIdx >= 0) {
          const existing = (events[matchIdx] as Extract<MessageEvent, { kind: 'tool_call' }>).toolCall;
          const next = [...events];
          next[matchIdx] = {
            kind: 'tool_call',
            toolCall: {
              ...existing,
              status: 'pending_confirmation',
              confirmationId: action.confirmationId,
              summary: action.summary,
              ...(action.isAskUser ? { isAskUser: true } : {}),
              ...(action.profileField ? { profileField: action.profileField } : {}),
            },
          };
          return next;
        }
        return [
          ...events,
          {
            kind: 'tool_call',
            toolCall: {
              id: action.toolCallId || `synthetic-${action.confirmationId}`,
              name: action.toolName,
              arguments: JSON.stringify(action.args || {}),
              status: 'pending_confirmation',
              confirmationId: action.confirmationId,
              summary: action.summary,
              ...(action.isAskUser ? { isAskUser: true } : {}),
              ...(action.profileField ? { profileField: action.profileField } : {}),
            },
          },
        ];
      });
      return { ...state, messages };
    }

    case 'tool_call_end': {
      // Mark the matching tool_call event success/failed — may be in ANY
      // message (not just currentAssistantId) so we search all messages.
      const messages = state.messages.map((msg) => {
        if (!msg.events) return msg;
        const idx = findToolCallEventIndex(msg.events, action.toolCallId);
        if (idx < 0) return msg;
        const existing = (msg.events[idx] as Extract<MessageEvent, { kind: 'tool_call' }>).toolCall;
        const next = [...msg.events];
        next[idx] = {
          kind: 'tool_call',
          toolCall: {
            ...existing,
            status: action.success ? 'success' : 'failed',
            result: action.result,
          },
        };
        return { ...msg, events: next };
      });
      return { ...state, messages };
    }

    case 'confirmation_responded': {
      // Optimistic UI — transition the matching tool_call event out of
      // pending_confirmation immediately on click so the user sees feedback.
      const messages = state.messages.map((msg) => {
        if (!msg.events) return msg;
        let changed = false;
        const next = msg.events.map((e) => {
          if (e.kind !== 'tool_call') return e;
          if (e.toolCall.confirmationId !== action.confirmationId) return e;
          changed = true;
          return {
            kind: 'tool_call' as const,
            toolCall: action.approved
              ? { ...e.toolCall, status: 'running' as const, confirmationId: undefined }
              : {
                  ...e.toolCall,
                  status: 'failed' as const,
                  confirmationId: undefined,
                  result: 'Denied by user.',
                },
          };
        });
        return changed ? { ...msg, events: next } : msg;
      });
      return { ...state, messages };
    }

    case 'usage':
      // Accumulate credits charged per turn (server-authoritative math
      // mirrored on the host side; sent on the usage message). Old
      // behaviour summed raw provider tokens which didn't match what
      // the user was actually billed post-credits.
      return {
        ...state,
        lastUsage: { ...action.usage, cost: action.cost, contextWindow: action.contextWindow },
        sessionCredits: state.sessionCredits + (action.credits ?? 0),
      };

    case 'chat_platform_status':
      return {
        ...state,
        // Account fetch resolved — drop the gate.
        accountLoading: false,
        platformStatus: {
          connected: action.connected,
          tier: action.tier,
          freeTokensUsed: action.freeTokensUsed,
          freeTokensLimit: action.freeTokensLimit,
          subTokensUsed: action.subTokensUsed,
          subTokensLimit: action.subTokensLimit,
        },
      };

    case 'error': {
      // Close the current assistant bubble (if any) and end the turn.
      const withStoppedBubble = state.currentAssistantId
        ? state.messages.map((m) =>
            m.id === state.currentAssistantId ? { ...m, isStreaming: false } : m,
          )
        : state.messages;
      const msg: UIMessage = {
        id: nextId(),
        role: 'error',
        content: action.message,
        toolCalls: [],
        isStreaming: false,
      };
      return {
        ...state,
        messages: [...withStoppedBubble, msg],
        currentAssistantId: null,
        isStreaming: false,
        isThinking: false,
        conductorActive: false,
        activePersonas: [],
      };
    }

    case 'done': {
      // Close the current assistant bubble and clear currentAssistantId so
      // the next user message starts a fresh turn.
      const messages = state.currentAssistantId
        ? state.messages.map((m) =>
            m.id === state.currentAssistantId ? { ...m, isStreaming: false } : m,
          )
        : state.messages;
      return {
        ...state,
        messages,
        currentAssistantId: null,
        isStreaming: false,
        isThinking: false,
        conductorActive: false,
        activePersonas: [],
      };
    }

    case 'remove_last_error': {
      const filtered = state.messages.filter((m, i) => !(m.role === 'error' && i === state.messages.length - 1));
      return { ...state, messages: filtered };
    }

    case 'conductor_status': {
      if (action.active) {
        // Create an assistant bubble for the conductor to render persona status in
        const last = state.messages[state.messages.length - 1];
        if (!last || last.role !== 'assistant') {
          const msg: UIMessage = {
            id: nextId(),
            role: 'assistant',
            content: '',
            toolCalls: [],
            isStreaming: true,
            timestamp: Date.now(),
          };
          return { ...state, messages: [...state.messages, msg], conductorActive: true, conductorMode: action.mode, isStreaming: true };
        }
      }
      return {
        ...state,
        conductorActive: action.active,
        conductorMode: action.mode,
        ...(!action.active ? { activePersonas: state.activePersonas } : {}),
      };
    }

    case 'persona_status': {
      const existing = state.activePersonas.filter(p => p.id !== action.persona);
      const prev = state.activePersonas.find(p => p.id === action.persona);
      return {
        ...state,
        activePersonas: [...existing, {
          id: action.persona,
          phase: action.phase,
          description: action.description || prev?.description,
          output: action.output || prev?.output,
          tools: prev?.tools || [],
        }],
      };
    }

    case 'persona_tool_call': {
      const persona = state.activePersonas.find(p => p.id === action.persona);
      if (!persona) return state;
      const others = state.activePersonas.filter(p => p.id !== action.persona);
      return {
        ...state,
        activePersonas: [...others, { ...persona, tools: [...(persona.tools || []), { name: action.tool, done: false }] }],
      };
    }

    case 'persona_tool_result': {
      const persona = state.activePersonas.find(p => p.id === action.persona);
      if (!persona) return state;
      const others = state.activePersonas.filter(p => p.id !== action.persona);
      const updatedTools = (persona.tools || []).map(t =>
        t.name === action.tool && !t.done ? { ...t, done: true, success: action.success } : t
      );
      return { ...state, activePersonas: [...others, { ...persona, tools: updatedTools }] };
    }

    case 'model_switched': {
      const switchMsg: UIMessage = {
        id: nextId(),
        role: 'system',
        content: t('app.model_switched', { model: action.modelName }),
        toolCalls: [],
        isStreaming: false,
      };
      return { ...state, activeModel: action.modelId, messages: [...state.messages, switchMsg] };
    }

    case 'history_list':
      // History fetch resolved — drop the gate. Subsequent manual
      // sidebar opens re-fire history_list with the latest data;
      // setting an already-false flag false is a no-op.
      return { ...state, historyLoading: false, historyList: action.conversations, historyOpen: true };

    case 'history_search_results':
      return { ...state, historyList: action.conversations };

    case 'conversation_loaded': {
      const restoredMessages: UIMessage[] = action.messages.map((m) => ({
        id: nextId(),
        role: m.role,
        content: m.role === 'user' ? stripModePrefix(m.content) : m.content,
        toolCalls: [],
        isStreaming: false,
      }));
      return {
        ...state,
        messages: restoredMessages,
        currentConversationId: action.conversationId,
        conversationTitle: action.title || null,
        historyOpen: false,
      };
    }

    case 'chat_cleared':
      return {
        ...state,
        messages: [],
        currentConversationId: null,
        conversationTitle: null,
        historyOpen: false,
      };

    case 'close_history':
      return { ...state, historyOpen: false };

    case 'memory_content':
      return { ...state, memoryOpen: true, memoryGlobal: action.global, memoryProject: action.project };

    case 'close_memory':
      return { ...state, memoryOpen: false };

    case 'today_tasks':
      return { ...state, todayTasks: action.tasks };

    case 'all_tasks':
      return { ...state, allTasks: action.tasks };

    case 'session_tasks':
      return { ...state, sessionTasks: action.tasks };

    case 'ava_completed_tasks':
      return { ...state, avaCompletedTasks: action.tasks };

    case 'toggle_tasks':
      return { ...state, tasksOpen: !state.tasksOpen };

    case 'close_tasks':
      return { ...state, tasksOpen: false };

    case 'set_tasks_width':
      return { ...state, tasksPanelWidth: action.width };

    case 'rate_message':
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.messageId ? { ...m, rating: action.rating, ratingReason: action.reason } : m
        ),
      };

    case 'system_message': {
      const sysMsg: UIMessage = {
        id: nextId(),
        role: 'system',
        content: action.content,
        toolCalls: [],
        isStreaming: false,
      };
      return { ...state, messages: [...state.messages, sysMsg] };
    }

    case 'briefing': {
      const briefMsg: UIMessage = {
        id: nextId(),
        role: 'assistant',
        content: action.text,
        toolCalls: [],
        isStreaming: false,
      };
      return { ...state, messages: [briefMsg, ...state.messages] };
    }

    case 'context_usage':
      return { ...state, contextUsage: { used: action.used, limit: action.limit, percent: action.percent } };

    case 'compression_start':
      return { ...state, isCompressing: true };

    case 'compression_end': {
      if (action.originalTokens > 0) {
        const sysMsg: UIMessage = {
          id: nextId(),
          role: 'system',
          content: t('app.context_compressed', { original: action.originalTokens.toLocaleString(), compressed: action.compressedTokens.toLocaleString() }),
          toolCalls: [],
          isStreaming: false,
        };
        return { ...state, isCompressing: false, messages: [...state.messages, sysMsg] };
      }
      return { ...state, isCompressing: false };
    }

    default:
      return state;
  }
}

/* ── Initial state ────────────────────────────────────────────────────────── */

/**
 * Persistence for the HEALTH room's conversation. The Health page (and the room
 * inside it) unmounts when the user navigates away, AND a full webview reload
 * wipes JS memory — both would otherwise clear the room. Two layers keep it:
 *   1. A module-level state cache → instant restore across in-session navigation.
 *   2. sessionStorage of the messages → survives a webview reload (refresh).
 * sessionStorage clears when the webview truly closes, which lines up with the
 * host starting a fresh healthConversation, so there's no stale desync. The main
 * chat needs neither — it's always-mounted at the App level. Cleared by the
 * room's Clear-chat button.
 */
let healthRoomStateCache: ChatState | null = null;
const HEALTH_ROOM_MSGS_KEY = 'ava-health-room-messages';
function readHealthRoomMessages(): UIMessage[] | null {
  try { const raw = sessionStorage.getItem(HEALTH_ROOM_MSGS_KEY); const v = raw ? JSON.parse(raw) : null; return Array.isArray(v) && v.length ? v : null; } catch { return null; }
}
function writeHealthRoomMessages(messages: UIMessage[]): void {
  try { sessionStorage.setItem(HEALTH_ROOM_MSGS_KEY, JSON.stringify(messages)); } catch { /* quota / unavailable */ }
}
function clearHealthRoomMessages(): void {
  try { sessionStorage.removeItem(HEALTH_ROOM_MSGS_KEY); } catch { /* ignore */ }
}

const initialState: ChatState = {
  messages: [],
  currentAssistantId: null,
  models: [],
  activeModel: null,
  isStreaming: false,
  isThinking: false,
  needsSetup: true,
  initialized: false,
  // Default true — flipped false when chat_init delivers a platform
  // status (account fetched) and when history_list arrives. Spinner
  // overlay holds the chat surface while either is in flight.
  accountLoading: true,
  historyLoading: true,
  lastUsage: null,
  contextUsage: null,
  isCompressing: false,
  historyOpen: false,
  historyList: [],
  currentConversationId: null,
  conversationTitle: null,
  providerSource: 'byok',
  platformStatus: null,
  memoryOpen: false,
  memoryGlobal: [],
  memoryProject: [],
  tasksOpen: false,
  todayTasks: [],
  allTasks: [],
  sessionTasks: [],
  avaCompletedTasks: [],
  tasksPanelWidth: DEFAULT_WIDTH,
  sessionCredits: 0,
  conductorActive: false,
  conductorMode: null,
  activePersonas: [],
};

/* ── Chat message types we handle ─────────────────────────────────────────── */

const CHAT_MESSAGE_TYPES = new Set([
  'chat_init', 'chat_platform_status',
  'user_message_ack', 'stream_start', 'thinking_delta', 'stream_delta', 'stream_end',
  'tool_call_start', 'tool_call_end', 'tool_confirmation_request',
  'usage', 'done', 'model_switched',
  'history_list', 'history_search_results', 'conversation_loaded', 'chat_cleared',
  'context_usage', 'compression_start', 'compression_end',
  'memory_content', 'system_message', 'ping', 'focus_input', 'interjection_ack',
  'today_tasks', 'all_tasks', 'session_tasks', 'ava_completed_tasks',
  'conductor_status', 'persona_status', 'persona_tool_call', 'persona_tool_result',
  'briefing', 'error',
]);

/* ── Delta flush config ───────────────────────────────────────────────────── */

const DELTA_FLUSH_INTERVAL_MS = 30;

/* ── Component ────────────────────────────────────────────────────────────── */

export interface ChatPageProps {
  /** The parent App.tsx forwards relevant messages here */
  onRegisterDispatch: (dispatch: (msg: ExtToDashboardMessage) => void) => void;
  /** Whether this page is currently visible */
  isActive: boolean;
  /** Toggle the nav sidebar */
  onToggleSidebar?: () => void;
  /** Whether the sidebar is collapsed */
  sidebarCollapsed?: boolean;
  /** Flip sidebar between left and right */
  onFlipSidebar?: () => void;
  /** Which side the sidebar is on */
  sidebarSide?: 'left' | 'right';
  /** Navigate to a dashboard page */
  onNavigate?: (page: Page) => void;
  /** Operator's first name — used to personalise the seeded Ava welcome
   *  on a fresh chat. Null when the account hasn't loaded yet (or BYOK
   *  with no account); the welcome falls back to a name-less greeting. */
  userName?: string | null;
  /** User's auth-provider avatar URL (Supabase users.avatar_url). Threaded
   *  to MessageBubble so user-message bubbles render the operator's photo
   *  instead of the generic gradient + person SVG. */
  userAvatarUrl?: string | null;
  /** Conversation lane this surface drives. 'main' (default) is the normal
   *  chat. 'health' is the focused Ava Health & Fitness room — every send is
   *  tagged surface:'health' so the host runs it on the separate health thread,
   *  and forced into health mode so the room's briefing always applies. */
  lane?: 'main' | 'health';
}

// Sidebar-toggle / flip / collapsed / side props are still in ChatPageProps
// for caller compatibility but are no longer consumed — the chat header
// dropped its sidebar-toggle button to match the IDE chat header.
export function Chat({ onRegisterDispatch, isActive, onNavigate, userName, userAvatarUrl, lane = 'main' }: ChatPageProps) {
  // Health room rehydrates so its conversation survives both navigation (module
  // cache) and a webview reload (sessionStorage messages). The main chat always
  // starts fresh (it's never unmounted).
  const [state, dispatch] = useReducer(
    chatReducer,
    initialState,
    (init) => {
      if (lane !== 'health') return init;
      if (healthRoomStateCache) return healthRoomStateCache;
      const saved = readHealthRoomMessages();
      return saved ? { ...init, messages: saved } : init;
    },
  );

  // Snapshot the health room's state on every change (cheap module cache for
  // navigation); persist the messages to sessionStorage once a turn settles
  // (gated on !isStreaming to avoid a serialize-per-token storm) so a refresh
  // restores them.
  useEffect(() => {
    if (lane !== 'health') return;
    healthRoomStateCache = state;
    if (!state.isStreaming) writeHealthRoomMessages(state.messages);
  }, [state, lane]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const justLoadedRef = useRef(false);

  // Delta buffer for smooth typing animation
  type BufferedDelta = { type: 'stream_delta' | 'thinking_delta'; content: string };
  const deltaBuffer = useRef<BufferedDelta[]>([]);
  const flushTimerRef = useRef<number | null>(null);

  const flushAllDeltas = useCallback(() => {
    if (deltaBuffer.current.length > 0) {
      const grouped = new Map<string, string>();
      for (const d of deltaBuffer.current) {
        grouped.set(d.type, (grouped.get(d.type) || '') + d.content);
      }
      deltaBuffer.current = [];
      for (const [type, content] of grouped) {
        dispatch({ type: type as 'stream_delta' | 'thinking_delta', content });
      }
    }
    if (flushTimerRef.current !== null) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, []);

  const startFlushLoop = useCallback(() => {
    if (flushTimerRef.current !== null) return;
    flushTimerRef.current = window.setInterval(() => {
      if (deltaBuffer.current.length > 0) {
        const next = deltaBuffer.current.shift()!;
        dispatch({ type: next.type, content: next.content });
      } else {
        clearInterval(flushTimerRef.current!);
        flushTimerRef.current = null;
      }
    }, DELTA_FLUSH_INTERVAL_MS);
  }, []);

  // Register dispatch handler with parent App.tsx
  useEffect(() => {
    onRegisterDispatch((msg: ExtToDashboardMessage) => {
      if (!CHAT_MESSAGE_TYPES.has(msg.type)) return;

      // Handle ping/pong
      if (msg.type === 'ping') {
        post({ type: 'pong' });
        return;
      }

      // Buffer stream + thinking deltas
      if (msg.type === 'stream_delta' || msg.type === 'thinking_delta') {
        deltaBuffer.current.push({ type: msg.type, content: msg.content });
        startFlushLoop();
        return;
      }

      // Flush before ending stream
      if (msg.type === 'stream_end' || msg.type === 'done' || msg.type === 'error') {
        flushAllDeltas();
      }

      if (msg.type === 'conversation_loaded') {
        justLoadedRef.current = true;
      }

      if (msg.type === 'focus_input') {
        setTimeout(() => document.getElementById('chat-input')?.focus(), 100);
        return;
      }

      dispatch(msg);
    });

    return () => {
      if (flushTimerRef.current !== null) {
        clearInterval(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    };
  }, [onRegisterDispatch, startFlushLoop, flushAllDeltas]);

  // Safety watchdog: if isStreaming stays true for 30s without any events, force-clear it.
  // This catches edge cases where 'done' is lost between extension host and webview.
  useEffect(() => {
    if (!state.isStreaming) return;
    const watchdog = setTimeout(() => {
      dispatch({ type: 'done' } as any);
    }, 30_000);
    return () => clearTimeout(watchdog);
  }, [state.isStreaming, state.messages]);

  // Auto-focus chat input when page becomes active
  useEffect(() => {
    if (isActive) {
      setTimeout(() => {
        const input = document.getElementById('chat-input');
        if (input) input.focus();
      }, 100);
    }
  }, [isActive]);

  // Preload tasks on mount — the collapsed spine shows a live active-count, so
  // the data must be there even before the panel is first opened.
  useEffect(() => {
    post({ type: 'request_today_tasks' });
    post({ type: 'request_all_tasks' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (!isActive || state.messages.length === 0) return;
    if (justLoadedRef.current) {
      justLoadedRef.current = false;
      const scrollToBottom = () => chatEndRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(() => { scrollToBottom(); setTimeout(scrollToBottom, 200); }, 100);
        });
      });
    } else {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 300);
    }
  }, [state.messages, state.isThinking, isActive]);

  // ── Callbacks ──────────────────────────────────────────────────────────────

  const handleSend = useCallback((text: string, mode: AvaMode, attachments?: ImageAttachment[]) => {
    // In the health room every turn is health-scoped — force the mode so the
    // briefing always applies, and tag the lane so the host runs it on the
    // separate health thread.
    post({ type: 'send_message', text, mode: lane === 'health' ? 'health' : mode, attachments, surface: lane });
  }, [lane]);

  const handlePaletteAction = useCallback((tool: PaletteTool, action: string, mode: AvaMode) => {
    post({ type: 'palette_intent', tool, action, mode: lane === 'health' ? 'health' : mode, surface: lane });
  }, [lane]);

  const handleModelSwitch = useCallback((modelId: string) => {
    post({ type: 'switch_model', modelId });
  }, []);

  const handleConfirmation = useCallback((confirmationId: string, approved: boolean, alwaysAllowCategory?: boolean, planSelection?: string, userResponse?: string) => {
    post({ type: 'tool_confirmation_response', confirmationId, approved, alwaysAllowCategory, planSelection, userResponse });
    // Optimistic UI update — transition the card out of pending_confirmation
    // immediately so the buttons disappear and the user sees their click
    // landed. Otherwise the card sits in pending state until tool_call_end
    // arrives, which can be never if the tool hangs (e.g. broken bash env).
    dispatch({ type: 'confirmation_responded', confirmationId, approved });
  }, []);

  const handleCancel = useCallback(() => { post({ type: 'cancel' }); }, []);

  const handleOpenHistory = useCallback(() => { post({ type: 'request_history' }); }, []);
  const handleNewChat = useCallback(() => {
    // Clear the view immediately so the button always responds, then tell
    // the host to reset the underlying conversation/agent. Previously this
    // relied solely on the round-trip `chat_cleared` coming back — if that
    // dropped anywhere, the button looked dead.
    dispatch({ type: 'chat_cleared' } as ChatAction);
    post({ type: 'new_chat' });
  }, []);

  /** Clear ONLY this room's conversation — the health thread. Resets the view +
   *  the module cache, and tells the host to drop its healthConversation. The
   *  main chat is untouched (separate lane). The room uses this in place of
   *  New Chat. */
  const handleClearChat = useCallback(() => {
    dispatch({ type: 'chat_cleared' } as ChatAction);
    healthRoomStateCache = null;
    clearHealthRoomMessages();
    post({ type: 'clear_chat', surface: 'health' });
  }, []);

  // History panel handlers (handleLoadConversation / handleDeleteConversation
  // / handleSearchHistory / handleRenameConversation / handlePinConversation
  // / handleExportConversation) lived here when the chat surfaced a slide-
  // over. The slide-over is gone — History is a top-level sidebar nav
  // page now. The History page owns its own handlers; nothing to do here.
  void justLoadedRef.current;

  const handleContinue = useCallback(() => {
    // Find the last user message and resend it
    const lastUserMsg = [...state.messages].reverse().find(m => m.role === 'user');
    if (lastUserMsg?.content) {
      // Remove the error message first so it doesn't accumulate
      dispatch({ type: 'remove_last_error' });
      post({ type: 'send_message', text: lastUserMsg.content, mode: lane === 'health' ? 'health' : 'code', surface: lane });
    } else {
      post({ type: 'send_message', text: t('app.continue'), mode: lane === 'health' ? 'health' : 'code', surface: lane });
    }
  }, [state.messages, lane]);

  // Repurposed as a prefill hook for empty-state starter chips. Was
  // previously wired to immediately send. Prefilling lets the operator
  // edit before firing — safer default for a brand-new chat.
  const [pendingPrefill, setPendingPrefill] = useState<{ value: string; nonce: number } | null>(null);
  const handleSuggestion = useCallback((prompt: string) => {
    setPendingPrefill({ value: prompt, nonce: Date.now() });
  }, []);

  // "Ask Ava" from the docs page drops the question in localStorage and
  // navigates here; pick it up on mount and prefill the input (don't auto-send,
  // so the user can tweak before firing).
  useEffect(() => {
    try {
      const ask = localStorage.getItem('ava-pending-ask');
      if (ask) { localStorage.removeItem('ava-pending-ask'); setPendingPrefill({ value: ask, nonce: Date.now() }); }
    } catch { /* no storage */ }
  }, []);

  const handleCompress = useCallback(() => { post({ type: 'compress_context' }); }, []);

  const handleRate = useCallback((messageId: string, rating: 'up' | 'down', reason?: string) => {
    dispatch({ type: 'rate_message', messageId, rating, reason });
    post({ type: 'rate_message', messageId, rating, reason });
  }, []);

  const handleProviderSourceChange = useCallback((source: 'platform' | 'byok') => {
    post({ type: 'set_provider_source', source });
  }, []);

  // handleCloseHistory removed — slide-over is gone; close_history reducer
  // case kept in case ambient code paths still dispatch it.

  const handleCloseMemory = useCallback(() => { dispatch({ type: 'close_memory' }); }, []);

  const handleToggleTasks = useCallback(() => {
    if (!state.tasksOpen) post({ type: 'request_today_tasks' });
    dispatch({ type: 'toggle_tasks' });
  }, [state.tasksOpen]);

  const handleCloseTasks = useCallback(() => { dispatch({ type: 'close_tasks' }); }, []);

  const handleToggleTask = useCallback((taskId: string) => {
    post({ type: 'toggle_task', taskId });
  }, []);

  const handleCreateTask = useCallback((task: { title: string; priority?: string; category?: string; due_date?: string; due_time?: string; recurrence?: string; reminder_lead?: number; subtasks?: string[] }) => {
    post({ type: 'panel_create_task', ...task });
  }, []);

  const handleToggleSubtask = useCallback((taskId: string, subtaskId: string) => {
    post({ type: 'toggle_subtask', taskId, subtaskId });
  }, []);

  const handleUpdateTask = useCallback((taskId: string, updates: UpdateTaskInput) => {
    post({ type: 'panel_update_task', taskId, updates });
  }, []);

  const handleOpenTasksFolder = useCallback(() => {
    post({ type: 'open_tasks_folder' });
  }, []);

  const handleTasksWidthChange = useCallback((width: number) => {
    dispatch({ type: 'set_tasks_width', width });
  }, []);

  const handleSaveMemory = useCallback((scope: 'global' | 'project', content: string) => {
    post({ type: 'save_chat_memory', scope, content });
  }, []);

  const handleClearMemory = useCallback((scope: 'global' | 'project') => {
    post({ type: 'clear_chat_memory', scope });
  }, []);

  const handleArchiveMemory = useCallback((scope: 'global' | 'project', id: string) => {
    post({ type: 'archive_chat_memory', scope, id });
  }, []);

  const handleRestoreMemory = useCallback((scope: 'global' | 'project', id: string) => {
    post({ type: 'restore_chat_memory', scope, id });
  }, []);

  const handleDeleteMemoryEntry = useCallback((scope: 'global' | 'project', id: string) => {
    post({ type: 'delete_chat_memory_entry', scope, id });
  }, []);

  const lastError = state.messages.filter(m => m.role === 'error').at(-1);

  return (
    <SecretsProvider>
      <div className="relative flex flex-row h-full">
        {/* Main chat column */}
        <div className="relative flex flex-col flex-1 min-w-0 h-full">
          {/* Skip navigation */}
          <a
            href="#chat-input"
            className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-1 focus:left-1 focus:px-3 focus:py-1.5 focus:rounded-lg focus:text-xs focus:font-medium focus:text-white focus:no-underline"
            style={{ background: '#A855F7' }}
          >
            Skip to chat input
          </a>

          {/* ARIA live region */}
          <div aria-live="assertive" aria-atomic="true" className="sr-only">
            {lastError?.content ?? ''}
          </div>

          <Header
            models={state.models}
            activeModel={state.activeModel}
            needsSetup={state.needsSetup}
            onSwitch={handleModelSwitch}
            onOpenDashboard={() => onNavigate?.('settings')}
            onOpenHistory={handleOpenHistory}
            onNewChat={handleNewChat}
            onToggleTasks={handleToggleTasks}
            tasksOpen={state.tasksOpen}
            sessionTaskCount={state.sessionTasks?.length ?? 0}
            conversationTitle={state.conversationTitle}
            sessionCredits={state.sessionCredits}
            platformStatus={state.platformStatus}
            showNewChat={lane !== 'health'}
            showClearChat={lane === 'health'}
            onClearChat={handleClearChat}
          />

          {(state.accountLoading || (lane !== 'health' && state.historyLoading)) ? (
            <div
              role="status"
              aria-live="polite"
              className="flex-1 flex flex-col items-center justify-center gap-3"
              style={{ color: '#cdd6f4' }}
            >
              <div className="ava-chat-spinner" aria-hidden />
              <div className="text-[12px]" style={{ color: '#a6adc8' }}>
                {state.accountLoading && state.historyLoading
                  ? 'Loading your account and chat history…'
                  : state.accountLoading
                    ? 'Loading your account…'
                    : 'Loading your chat history…'}
              </div>
              <style>{`
                .ava-chat-spinner {
                  width: 32px; height: 32px; border-radius: 50%;
                  border: 2.5px solid rgba(168, 85, 247, 0.18);
                  border-top-color: #a855f7;
                  animation: avaSpin 0.9s linear infinite;
                }
                @keyframes avaSpin { to { transform: rotate(360deg); } }
              `}</style>
            </div>
          ) : (
          <ChatContainer
            messages={state.messages}
            isThinking={state.isThinking}
            onConfirmation={handleConfirmation}
            onContinue={handleContinue}
            onSuggestion={handleSuggestion}
            onRate={handleRate}
            chatEndRef={chatEndRef}
            needsSetup={state.needsSetup}
            initialized={state.initialized}
            onOpenDashboard={() => onNavigate?.('settings')}
            activeModel={state.activeModel}
            models={state.models}
            conductorActive={state.conductorActive}
            conductorMode={state.conductorMode}
            activePersonas={state.activePersonas}
            contextUsage={state.contextUsage}
            isCompressing={state.isCompressing}
            isStreaming={state.isStreaming}
            onCompress={handleCompress}
            userName={userName}
            userAvatarUrl={userAvatarUrl}
            lane={lane}
          />
          )}

          {/* Compression indicator */}
          {state.isCompressing && (
            <div className="flex items-center gap-2 px-4 py-2 text-xs" style={{ background: 'rgba(168, 85, 247, 0.06)', borderTop: '1px solid rgba(168, 85, 247, 0.12)' }}>
              <svg width="14" height="14" viewBox="0 0 16 16" className="animate-spin" style={{ color: '#a855f7' }}>
                <path fill="currentColor" d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z" opacity="0.2"/>
                <path fill="currentColor" d="M8 1v1.5A5.5 5.5 0 0 1 13.5 8H15A7 7 0 0 0 8 1z"/>
              </svg>
              <span style={{ color: '#a855f7' }}>{t('input.compressing') || 'Compressing context...'}</span>
              <span className="opacity-40">Ava is summarising older messages to free up space</span>
            </div>
          )}

          {/* Context usage — sits flush above the composer so the bar lives
              right where the next turn is being written. Click-to-compress
              when pct ≥ 25%. */}
          <ContextBar
            contextUsage={state.contextUsage}
            isCompressing={state.isCompressing}
            isStreaming={state.isStreaming}
            onCompress={handleCompress}
          />

          <InputArea
            onSend={handleSend}
            onPaletteAction={handlePaletteAction}
            onCancel={handleCancel}
            isStreaming={state.isStreaming}
            disabled={state.needsSetup}
            usage={state.lastUsage}
            isCompressing={state.isCompressing}
            onCompress={handleCompress}
            providerSource={state.providerSource}
            platformStatus={state.platformStatus}
            onProviderSourceChange={handleProviderSourceChange}
            contextUsage={state.contextUsage}
            modelSupportsVision={
              state.models.find((m) => m.id === state.activeModel)?.supportsVision
            }
            prefill={pendingPrefill}
            lockedModeLabel={lane === 'health' ? t('health.room.mode_label') : undefined}
          />

          {/* HistoryPanel slide-over removed — dashboard chat routes
              users to the dedicated /history page (sidebar nav entry)
              instead, matching the IDE chat where History is a top-level
              destination, not a transient slide-over. */}

          {state.memoryOpen && (
            <MemoryPanel
              globalEntries={state.memoryGlobal}
              projectEntries={state.memoryProject}
              onClose={handleCloseMemory}
              onSave={handleSaveMemory}
              onClear={handleClearMemory}
              onArchive={handleArchiveMemory}
              onRestore={handleRestoreMemory}
              onDelete={handleDeleteMemoryEntry}
            />
          )}
        </div>

        {/* Tasks — always present: full panel when open, thin self-advertising
            spine when collapsed. The Ava Health room is focused on plans, not
            tasks, so the rail is omitted there entirely. */}
        {lane !== 'health' && (state.tasksOpen ? (
          <TasksPanel
            todayTasks={state.todayTasks}
            allTasks={state.allTasks}
            sessionTasks={state.sessionTasks}
            avaCompletedTasks={state.avaCompletedTasks}
            onClose={handleCloseTasks}
            onToggleTask={handleToggleTask}
            onCreateTask={handleCreateTask}
            onToggleSubtask={handleToggleSubtask}
            onUpdateTask={handleUpdateTask}
            onOpenFolder={handleOpenTasksFolder}
            width={state.tasksPanelWidth}
            onWidthChange={handleTasksWidthChange}
          />
        ) : (
          <TasksSpine
            activeCount={state.allTasks.filter(t => t.status !== 'done').length}
            sessionTasks={state.sessionTasks}
            onExpand={handleToggleTasks}
          />
        ))}
      </div>
    </SecretsProvider>
  );
}
