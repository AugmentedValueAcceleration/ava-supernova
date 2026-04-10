import { useReducer, useEffect, useRef, useCallback } from 'react';
import type { ExtToWebviewMessage, ChatState, UIMessage, ToolCallDisplay } from './types/messages';
import { useVSCodeApi } from './hooks/useVSCodeApi';
import { ChatContainer } from './components/ChatContainer';
import { InputArea } from './components/InputArea';
import { Header } from './components/Header';
import { HistoryPanel } from './components/HistoryPanel';
import { MemoryPanel } from './components/MemoryPanel';
import { TasksPanel, DEFAULT_WIDTH } from './components/TasksPanel';
// ContextBar removed — replaced by circular indicator in InputArea
import type { AvaMode, ImageAttachment } from './components/InputArea';
import { t, setLocale, loadStrings } from './i18n';
import { SecretsProvider } from './hooks/useSecrets';
import { ErrorBoundary } from './components/ErrorBoundary';

/** Strip mode prefix from user messages so internal prompts don't show in the UI */
function stripModePrefix(content: string): string {
  if (typeof content !== 'string') return content;
  const prefixes = ['[Chat Mode]', '[Teach Mode]', '[Plan Mode]', '[Security Mode]', '[Brainstorm Mode]', '[Work Mode]'];
  for (const p of prefixes) {
    if (content.startsWith(p)) {
      // The user's actual message is after the last line of the prefix
      // Find the user's text which was appended at the end
      const lines = content.split('\n');
      // The actual user text is the last non-empty line(s) after the prefix block
      // Mode prefixes end with a blank line before the user text
      const lastBlankIdx = content.lastIndexOf('\n\n');
      if (lastBlankIdx > 0) {
        return content.slice(lastBlankIdx + 2).trim();
      }
      return content;
    }
  }
  return content;
}

type ChatAction =
  | ExtToWebviewMessage
  | { type: 'close_history' }
  | { type: 'close_memory' }
  | { type: 'toggle_tasks' }
  | { type: 'close_tasks' }
  | { type: 'set_tasks_width'; width: number }
  | { type: 'rate_message'; messageId: string; rating: 'up' | 'down'; reason?: string }
  | { type: 'confirmation_responded'; confirmationId: string; approved: boolean };

let messageIdCounter = 0;
function nextId(): string {
  return `msg-${++messageIdCounter}`;
}

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'init':
      // Initialize locale if provided by extension host
      if (action.locale && action.locale !== 'en') {
        setLocale(action.locale);
        if (action.localeStrings) {
          loadStrings(action.locale, action.localeStrings);
        }
      }
      return {
        ...state,
        initialized: true,
        models: action.models,
        activeModel: action.activeModel,
        needsSetup: action.needsSetup,
        consentRequired: action.consentRequired ?? false,
        providerSource: action.providerSource ?? state.providerSource,
        platformStatus: action.platformStatus
          ? {
              connected: action.platformStatus.connected,
              tier: action.platformStatus.tier,
              freeTokensUsed: action.platformStatus.freeTokensUsed,
              freeTokensLimit: action.platformStatus.freeTokensLimit,
            }
          : state.platformStatus,
      };

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
      // Mark agent as running immediately so the Stop button appears
      return { ...state, messages: [...state.messages, msg], isStreaming: true };
    }

    case 'stream_start': {
      const msg: UIMessage = {
        id: nextId(),
        role: 'assistant',
        content: '',
        toolCalls: [],
        isStreaming: true,
        timestamp: Date.now(),
      };
      return {
        ...state,
        messages: [...state.messages, msg],
        isStreaming: true,
        isThinking: true,
      };
    }

    case 'thinking_delta': {
      const messages = [...state.messages];
      const last = messages[messages.length - 1];
      if (last && last.role === 'assistant') {
        messages[messages.length - 1] = {
          ...last,
          thinking: (last.thinking || '') + action.content,
        };
      }
      return { ...state, messages, isThinking: false };
    }

    case 'stream_delta': {
      const messages = [...state.messages];
      const last = messages[messages.length - 1];
      if (last && last.role === 'assistant') {
        // Timeline flow — if the last message already has tool calls AND text,
        // start a new assistant bubble for the continuation text.
        // This matches the IDE's timeline structure, producing separate bubbles
        // for text-before-tools, tool calls, and text-after-tools.
        if (last.toolCalls.length > 0 && last.content.length > 0) {
          const newMsg: UIMessage = {
            id: nextId(),
            role: 'assistant',
            content: action.content,
            toolCalls: [],
            isStreaming: true,
            timestamp: Date.now(),
          };
          messages.push(newMsg);
        } else {
          messages[messages.length - 1] = {
            ...last,
            content: last.content + action.content,
          };
        }
      }
      return { ...state, messages, isThinking: false };
    }

    case 'stream_end': {
      const messages = [...state.messages];
      const last = messages[messages.length - 1];
      if (last && last.role === 'assistant') {
        messages[messages.length - 1] = { ...last, isStreaming: false };
      }
      // Keep state.isStreaming TRUE — the agent loop may continue with tool calls
      // and more streaming rounds. Only 'done' and 'error' set isStreaming to false.
      return { ...state, messages, isThinking: false };
    }

    case 'tool_call_start': {
      const messages = [...state.messages];
      const last = messages[messages.length - 1];
      if (last && last.role === 'assistant') {
        // Dedupe by ID. If a synthetic placeholder was already created
        // by the tool_confirmation_request safety net (race fallback),
        // merge in the real arguments and preserve its pending state
        // instead of creating a duplicate row.
        const existingIdx = last.toolCalls.findIndex((tc) => tc.id === action.toolCall.id);
        let toolCalls: ToolCallDisplay[];
        if (existingIdx >= 0) {
          const existing = last.toolCalls[existingIdx];
          toolCalls = [...last.toolCalls];
          toolCalls[existingIdx] = {
            ...existing,
            // Update arguments from the real tool call (synthetic had a stub)
            arguments: action.toolCall.arguments,
            // Keep pending_confirmation if already set by the safety net,
            // otherwise this is a fresh tool call so mark it running.
            status: existing.status === 'pending_confirmation' ? existing.status : 'running',
          };
        } else {
          const tc: ToolCallDisplay = {
            id: action.toolCall.id,
            name: action.toolCall.name,
            arguments: action.toolCall.arguments,
            status: 'running',
          };
          toolCalls = [...last.toolCalls, tc];
        }
        messages[messages.length - 1] = { ...last, toolCalls };
      }
      return { ...state, messages };
    }

    case 'tool_confirmation_request': {
      const messages = [...state.messages];
      const last = messages[messages.length - 1];
      if (last && last.role === 'assistant') {
        // Match the tool call this confirmation belongs to. Priority order:
        //   1. Exact toolCallId match (reliable, set by extension v0.36.9+)
        //   2. Status === 'running' fallback (legacy, for older messages)
        // The OR-on-name match was removed because it overwrote unrelated
        // pending confirmations when the model called the same tool twice.
        let matched = false;
        let toolCalls = last.toolCalls.map((tc) => {
          const isMatch = action.toolCallId
            ? tc.id === action.toolCallId
            : tc.status === 'running' && tc.name === action.toolName;
          if (!isMatch) return tc;
          matched = true;
          return {
            ...tc,
            status: 'pending_confirmation' as const,
            confirmationId: action.confirmationId,
            summary: action.summary,
            ...(action.isAskUser ? { isAskUser: true } : {}),
          };
        });

        // Safety net: if no tool call was matched, the tool_call_start
        // event hasn't landed yet (race condition observed on first ask).
        // Create a synthetic pending tool call so the buttons render
        // immediately. The real tool_call_start, when it arrives, will
        // also try to add the same tool — the reducer for tool_call_start
        // dedupes by ID below.
        if (!matched) {
          toolCalls = [
            ...toolCalls,
            {
              id: action.toolCallId || `synthetic-${action.confirmationId}`,
              name: action.toolName,
              arguments: JSON.stringify(action.args || {}),
              status: 'pending_confirmation' as const,
              confirmationId: action.confirmationId,
              summary: action.summary,
              ...(action.isAskUser ? { isAskUser: true } : {}),
            },
          ];
        }

        messages[messages.length - 1] = { ...last, toolCalls };
      }
      return { ...state, messages };
    }

    case 'tool_call_end': {
      const messages = [...state.messages];
      const last = messages[messages.length - 1];
      if (last && last.role === 'assistant') {
        const toolCalls = last.toolCalls.map((tc) =>
          tc.id === action.toolCallId
            ? {
                ...tc,
                status: (action.success ? 'success' : 'failed') as 'success' | 'failed',
                result: action.result,
              }
            : tc,
        );
        messages[messages.length - 1] = { ...last, toolCalls };
      }
      return { ...state, messages };
    }

    case 'confirmation_responded': {
      // Optimistic UI update — when the user clicks Allow/Always Allow/Deny,
      // immediately transition the matching tool call out of
      // pending_confirmation so the buttons disappear and the user gets
      // visible feedback their click registered. Without this the card sits
      // in pending state forever if the tool execution hangs (e.g. broken
      // bash environment), so the user clicks repeatedly thinking nothing
      // happened.
      const messages = state.messages.map((msg) => {
        if (msg.role !== 'assistant') return msg;
        let changed = false;
        const toolCalls = msg.toolCalls.map((tc) => {
          if (tc.confirmationId !== action.confirmationId) return tc;
          changed = true;
          return action.approved
            // Approved → tool is now running. Spinner replaces buttons.
            ? { ...tc, status: 'running' as const, confirmationId: undefined }
            // Denied → tool is failed with a clear reason.
            : {
                ...tc,
                status: 'failed' as const,
                confirmationId: undefined,
                result: 'Denied by user.',
              };
        });
        return changed ? { ...msg, toolCalls } : msg;
      });
      return { ...state, messages };
    }

    case 'usage':
      return {
        ...state,
        lastUsage: { ...action.usage, cost: action.cost, contextWindow: action.contextWindow },
      };

    case 'platform_status':
      return {
        ...state,
        platformStatus: {
          connected: action.connected,
          tier: action.tier,
          freeTokensUsed: action.freeTokensUsed,
          freeTokensLimit: action.freeTokensLimit,
        },
      };

    case 'error': {
      const msg: UIMessage = {
        id: nextId(),
        role: 'error',
        content: action.message,
        toolCalls: [],
        isStreaming: false,
        errorCode: action.code,
        errorSuggestion: action.suggestion,
      };
      return {
        ...state,
        messages: [...state.messages, msg],
        isStreaming: false,
        isThinking: false,
      };
    }

    case 'done':
      return { ...state, isStreaming: false, isThinking: false, conductorActive: false, activePersonas: [] };

    case 'conductor_status':
      return {
        ...state,
        conductorActive: action.active,
        conductorMode: action.mode,
        ...(!action.active ? { activePersonas: state.activePersonas } : {}),
      };

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
        activePersonas: [...others, {
          ...persona,
          tools: [...(persona.tools || []), { name: action.tool, done: false }],
        }],
      };
    }

    case 'persona_tool_result': {
      const persona = state.activePersonas.find(p => p.id === action.persona);
      if (!persona) return state;
      const others = state.activePersonas.filter(p => p.id !== action.persona);
      const updatedTools = (persona.tools || []).map(t =>
        t.name === action.tool && !t.done ? { ...t, done: true, success: action.success } : t
      );
      return {
        ...state,
        activePersonas: [...others, { ...persona, tools: updatedTools }],
      };
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

    // ── History ────────────────────────────────────────────────────────────

    case 'history_list':
      return {
        ...state,
        historyList: action.conversations,
        historyOpen: true,
      };

    case 'history_search_results':
      return {
        ...state,
        historyList: action.conversations,
      };

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
        historyOpen: false,
      };
    }

    case 'chat_cleared':
      return {
        ...state,
        messages: [],
        currentConversationId: null,
        historyOpen: false,
      };

    case 'close_history':
      return { ...state, historyOpen: false };

    // ── Memory ──────────────────────────────────────────────────────────

    case 'memory_content':
      return {
        ...state,
        memoryOpen: true,
        memoryGlobal: action.global,
        memoryProject: action.project,
      };

    case 'close_memory':
      return { ...state, memoryOpen: false };

    // ── Tasks ─────────────────────────────────────────────────────────────

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

    // ── Feedback rating ──────────────────────────────────────────────────

    case 'rate_message':
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.messageId
            ? { ...m, rating: action.rating, ratingReason: action.reason }
            : m
        ),
      };

    // ── System messages ──────────────────────────────────────────────────

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

    // ── Context usage & compression ─────────────────────────────────────

    case 'context_usage':
      return {
        ...state,
        contextUsage: { used: action.used, limit: action.limit, percent: action.percent },
      };

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

const initialState: ChatState = {
  messages: [],
  models: [],
  activeModel: null,
  isStreaming: false,
  isThinking: false,
  needsSetup: true,
  consentRequired: false,
  initialized: false,
  lastUsage: null,
  contextUsage: null,
  isCompressing: false,
  historyOpen: false,
  historyList: [],
  currentConversationId: null,
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
  conductorActive: false,
  conductorMode: undefined as string | undefined,
  activePersonas: [] as Array<{ id: string; phase: 'active' | 'complete' | 'error'; description?: string; output?: string; tools?: Array<{ name: string; done: boolean; success?: boolean }> }>,
};

// ── Typing speed config ─────────────────────────────────────────────────────
const DELTA_FLUSH_INTERVAL_MS = 30; // ~33fps — smooth typing feel

export function App() {
  const { postMessage, getState, setState } = useVSCodeApi();

  // Restore persisted panel state from vscode
  const [state, dispatch] = useReducer(chatReducer, initialState, (init) => {
    const saved = getState() as { tasksOpen?: boolean; tasksPanelWidth?: number } | null;
    if (saved) {
      return {
        ...init,
        tasksOpen: saved.tasksOpen ?? init.tasksOpen,
        tasksPanelWidth: saved.tasksPanelWidth ?? init.tasksPanelWidth,
      };
    }
    return init;
  });

  // Persist tasks panel state to vscode when it changes
  useEffect(() => {
    const prev = getState() as Record<string, unknown> | null;
    setState({ ...prev, tasksOpen: state.tasksOpen, tasksPanelWidth: state.tasksPanelWidth });
  }, [state.tasksOpen, state.tasksPanelWidth, getState, setState]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const justLoadedRef = useRef(false);

  // Delta buffer for smooth typing animation
  type BufferedDelta = { type: 'stream_delta' | 'thinking_delta'; content: string };
  const deltaBuffer = useRef<BufferedDelta[]>([]);
  const flushTimerRef = useRef<number | null>(null);

  const flushAllDeltas = useCallback(() => {
    if (deltaBuffer.current.length > 0) {
      // Combine consecutive deltas of the same type
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
    if (flushTimerRef.current !== null) return; // already running
    flushTimerRef.current = window.setInterval(() => {
      if (deltaBuffer.current.length > 0) {
        // Flush one chunk at a time for smooth typing
        const next = deltaBuffer.current.shift()!;
        dispatch({ type: next.type, content: next.content });
      } else {
        clearInterval(flushTimerRef.current!);
        flushTimerRef.current = null;
      }
    }, DELTA_FLUSH_INTERVAL_MS);
  }, []);

  // Listen for messages from extension host
  useEffect(() => {
    const handler = (event: MessageEvent<ExtToWebviewMessage>) => {
      // Ignore messages from unexpected origins (e.g. browser extensions)
      // Accept vscode-webview:// and vscode-file:// (Electron/WebView2 on Windows)
      if (event.origin && !event.origin.startsWith('vscode-webview://') && !event.origin.startsWith('vscode-file://')) return;
      const msg = event.data;

      // Respond to heartbeat pings immediately
      if (msg.type === 'ping') {
        postMessage({ type: 'pong' });
        return;
      }

      // Buffer stream + thinking deltas for smooth typing
      if (msg.type === 'stream_delta' || msg.type === 'thinking_delta') {
        deltaBuffer.current.push({ type: msg.type, content: msg.content });
        startFlushLoop();
        return;
      }

      // Flush remaining deltas before ending stream
      if (msg.type === 'stream_end' || msg.type === 'done' || msg.type === 'error') {
        flushAllDeltas();
      }

      // Mark any conversation restore (including initial load) for scroll-to-bottom
      if (msg.type === 'conversation_loaded') {
        justLoadedRef.current = true;
      }

      // Focus input shortcut (Ctrl+Escape)
      if (msg.type === 'focus_input') {
        setTimeout(() => document.getElementById('chat-input')?.focus(), 100);
        return;
      }

      dispatch(msg);
    };
    window.addEventListener('message', handler);

    // Signal webview is ready
    postMessage({ type: 'webview_ready' });

    // If tasks panel was persisted as open, request today tasks
    const saved = getState() as { tasksOpen?: boolean } | null;
    if (saved?.tasksOpen) {
      postMessage({ type: 'request_today_tasks' });
    }

    return () => {
      window.removeEventListener('message', handler);
      // Cleanup flush timer
      if (flushTimerRef.current !== null) {
        clearInterval(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    };
  }, [postMessage, startFlushLoop, flushAllDeltas]);

  // Auto-scroll to bottom on new content
  useEffect(() => {
    if (state.messages.length === 0) return;
    if (justLoadedRef.current) {
      justLoadedRef.current = false;
      // Restored conversation: longer delay for initial load when DOM may not be ready
      const scrollToBottom = () => chatEndRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(() => {
            scrollToBottom();
            // Safety: re-scroll after content finishes loading
            setTimeout(scrollToBottom, 200);
          }, 100);
        });
      });
    } else {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      // Extra scroll after tool results render (present_plan, large outputs)
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 300);
    }
  }, [state.messages, state.isThinking]);

  const handleSend = useCallback(
    (text: string, mode: AvaMode, attachments?: ImageAttachment[]) => {
      postMessage({ type: 'send_message', text, mode, attachments });
    },
    [postMessage],
  );

  const handleModelSwitch = useCallback(
    (modelId: string) => {
      postMessage({ type: 'switch_model', modelId });
    },
    [postMessage],
  );

  const handleConfirmation = useCallback(
    (confirmationId: string, approved: boolean, alwaysAllowCategory?: boolean, planSelection?: string, userResponse?: string) => {
      postMessage({ type: 'tool_confirmation_response', confirmationId, approved, alwaysAllowCategory, planSelection, userResponse });
      // Optimistic UI update — transition the matching tool out of
      // pending_confirmation immediately so the user gets visible feedback
      // their click landed. Without this the card stays in pending state
      // until tool_call_end arrives, which can be never if the tool hangs
      // (e.g. broken bash environment), so the user clicks again and again.
      dispatch({ type: 'confirmation_responded', confirmationId, approved });
    },
    [postMessage],
  );

  const handleInterrupt = useCallback(() => {
    postMessage({ type: 'interrupt' });
  }, [postMessage]);

  const handleCancel = useCallback(() => {
    postMessage({ type: 'cancel' });
  }, [postMessage]);

  const handleOpenDashboard = useCallback(() => {
    postMessage({ type: 'open_dashboard' });
  }, [postMessage]);

  const handleOpenDocs = useCallback(() => {
    postMessage({ type: 'open_docs' });
  }, [postMessage]);

  const handleOpenHistory = useCallback(() => {
    postMessage({ type: 'request_history' });
  }, [postMessage]);

  const handleNewChat = useCallback(() => {
    postMessage({ type: 'new_chat' });
  }, [postMessage]);

  const handleAcceptConsent = useCallback(() => {
    postMessage({ type: 'accept_consent' });
    dispatch({ type: 'init', models: state.models, activeModel: state.activeModel, needsSetup: state.needsSetup, consentRequired: false } as any);
  }, [postMessage, state.models, state.activeModel, state.needsSetup]);

  const handleLoadConversation = useCallback(
    (conversationId: string) => {
      justLoadedRef.current = true;
      postMessage({ type: 'load_conversation', conversationId });
    },
    [postMessage],
  );

  const handleDeleteConversation = useCallback(
    (conversationId: string) => {
      postMessage({ type: 'delete_conversation', conversationId });
    },
    [postMessage],
  );

  const handleSearchHistory = useCallback(
    (query: string) => {
      if (query.trim()) {
        postMessage({ type: 'search_history', query });
      } else {
        postMessage({ type: 'request_history' });
      }
    },
    [postMessage],
  );

  const handleRenameConversation = useCallback(
    (conversationId: string, newTitle: string) => {
      postMessage({ type: 'rename_conversation', conversationId, newTitle });
    },
    [postMessage],
  );

  const handlePinConversation = useCallback(
    (conversationId: string, pinned: boolean) => {
      postMessage({ type: 'pin_conversation', conversationId, pinned });
    },
    [postMessage],
  );

  const handleExportConversation = useCallback(
    (conversationId: string, format: 'markdown' | 'json') => {
      postMessage({ type: 'export_conversation', conversationId, format });
    },
    [postMessage],
  );

  const handleContinue = useCallback(() => {
    postMessage({ type: 'send_message', text: t('app.continue'), mode: 'code' });
  }, [postMessage]);

  const handleSuggestion = useCallback(
    (prompt: string) => {
      postMessage({ type: 'send_message', text: prompt, mode: 'code' });
    },
    [postMessage],
  );

  const handleCompress = useCallback(() => {
    postMessage({ type: 'compress_context' });
  }, [postMessage]);

  const handleRate = useCallback(
    (messageId: string, rating: 'up' | 'down', reason?: string) => {
      dispatch({ type: 'rate_message', messageId, rating, reason });
      postMessage({ type: 'rate_message', messageId, rating, reason });
    },
    [postMessage],
  );

  const handleProviderSourceChange = useCallback(
    (source: 'platform' | 'byok') => {
      postMessage({ type: 'set_provider_source', source });
    },
    [postMessage],
  );

  const handleCloseHistory = useCallback(() => {
    dispatch({ type: 'close_history' });
  }, []);

  const handleOpenMemory = useCallback(() => {
    postMessage({ type: 'request_memory' });
  }, [postMessage]);

  const handleCloseMemory = useCallback(() => {
    dispatch({ type: 'close_memory' });
  }, []);

  const handleToggleTasks = useCallback(() => {
    if (!state.tasksOpen) {
      postMessage({ type: 'request_today_tasks' });
    }
    dispatch({ type: 'toggle_tasks' });
  }, [state.tasksOpen, postMessage]);

  const handleCloseTasks = useCallback(() => {
    dispatch({ type: 'close_tasks' });
  }, []);

  const handleToggleTask = useCallback(
    (taskId: string) => {
      postMessage({ type: 'toggle_task', taskId });
    },
    [postMessage],
  );

  const handleTasksWidthChange = useCallback(
    (width: number) => {
      dispatch({ type: 'set_tasks_width', width });
    },
    [],
  );

  const handleSaveMemory = useCallback(
    (scope: 'global' | 'project', content: string) => {
      postMessage({ type: 'save_memory', scope, content });
    },
    [postMessage],
  );

  const handleClearMemory = useCallback(
    (scope: 'global' | 'project') => {
      postMessage({ type: 'clear_memory', scope });
    },
    [postMessage],
  );

  const handleArchiveMemory = useCallback(
    (scope: 'global' | 'project', id: string) => {
      postMessage({ type: 'archive_memory', scope, id });
    },
    [postMessage],
  );

  const handleRestoreMemory = useCallback(
    (scope: 'global' | 'project', id: string) => {
      postMessage({ type: 'restore_memory', scope, id });
    },
    [postMessage],
  );

  const handleDeleteMemoryEntry = useCallback(
    (scope: 'global' | 'project', id: string) => {
      postMessage({ type: 'delete_memory_entry', scope, id });
    },
    [postMessage],
  );

  // Track last error for ARIA announcements
  const lastError = state.messages.filter(m => m.role === 'error').at(-1);

  return (
    <SecretsProvider>
    <div className="relative flex flex-row h-screen">
      {/* Main chat column */}
      <div className="relative flex flex-col flex-1 min-w-0 h-full">
        {/* Skip navigation link — visible on focus for keyboard users */}
        <a
          href="#chat-input"
          className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-1 focus:left-1
                     focus:px-3 focus:py-1.5 focus:rounded-lg focus:text-xs focus:font-medium
                     focus:text-white focus:no-underline"
          style={{ background: '#A855F7' }}
        >
          Skip to chat input
        </a>

        {/* ARIA live region for error announcements */}
        <div aria-live="assertive" aria-atomic="true" className="sr-only">
          {lastError?.content ?? ''}
        </div>

        <Header
          models={state.models}
          activeModel={state.activeModel}
          needsSetup={state.needsSetup}
          onSwitch={handleModelSwitch}
          onOpenDashboard={handleOpenDashboard}
          onOpenHistory={handleOpenHistory}
          onNewChat={handleNewChat}
          onToggleTasks={handleToggleTasks}
          tasksOpen={state.tasksOpen}
        />

        <ChatContainer
          messages={state.messages}
          isThinking={state.isThinking}
          onConfirmation={handleConfirmation}
          onContinue={handleContinue}
          onSuggestion={handleSuggestion}
          onRate={handleRate}
          chatEndRef={chatEndRef}
          needsSetup={state.needsSetup}
          consentRequired={state.consentRequired}
          onAcceptConsent={handleAcceptConsent}
          initialized={state.initialized}
          onOpenDashboard={handleOpenDashboard}
          activeModel={state.activeModel}
          models={state.models}
          conductorActive={state.conductorActive}
          conductorMode={state.conductorMode}
          activePersonas={state.activePersonas}
        />

        <InputArea
          onSend={handleSend}
          onCancel={handleCancel}
          onInterrupt={handleInterrupt}
          isStreaming={state.isStreaming}
          disabled={state.needsSetup}
          usage={state.lastUsage}
          isCompressing={state.isCompressing}
          onCompress={handleCompress}
          providerSource={state.providerSource}
          platformStatus={state.platformStatus}
          onProviderSourceChange={handleProviderSourceChange}
          contextUsage={state.contextUsage}
        />

        {state.historyOpen && (
          <ErrorBoundary>
            <HistoryPanel
              conversations={state.historyList}
              onClose={handleCloseHistory}
              onSelect={handleLoadConversation}
              onDelete={handleDeleteConversation}
              onNewChat={handleNewChat}
              onSearch={handleSearchHistory}
              onRename={handleRenameConversation}
              onPin={handlePinConversation}
              onExport={handleExportConversation}
            />
          </ErrorBoundary>
        )}

        {state.memoryOpen && (
          <ErrorBoundary>
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
          </ErrorBoundary>
        )}
      </div>

      {/* Tasks side panel — collapsible on the right */}
      {state.tasksOpen && (
        <ErrorBoundary>
          <TasksPanel
            todayTasks={state.todayTasks}
            allTasks={state.allTasks}
            sessionTasks={state.sessionTasks}
            avaCompletedTasks={state.avaCompletedTasks}
            onClose={handleCloseTasks}
            onToggleTask={handleToggleTask}
            width={state.tasksPanelWidth}
            onWidthChange={handleTasksWidthChange}
          />
        </ErrorBoundary>
      )}
    </div>
    </SecretsProvider>
  );
}
