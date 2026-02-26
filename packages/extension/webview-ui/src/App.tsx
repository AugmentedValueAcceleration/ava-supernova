import { useReducer, useEffect, useRef, useCallback } from 'react';
import type { ExtToWebviewMessage, ChatState, UIMessage, ToolCallDisplay } from './types/messages';
import { useVSCodeApi } from './hooks/useVSCodeApi';
import { ChatContainer } from './components/ChatContainer';
import { InputArea } from './components/InputArea';
import { Header } from './components/Header';
import { HistoryPanel } from './components/HistoryPanel';
import type { AvaMode, ImageAttachment } from './components/InputArea';
import { t, setLocale, loadStrings } from './i18n';

type ChatAction =
  | ExtToWebviewMessage
  | { type: 'close_history' };

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
        models: action.models,
        activeModel: action.activeModel,
        needsSetup: action.needsSetup,
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
        messages[messages.length - 1] = {
          ...last,
          content: last.content + action.content,
        };
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
        const tc: ToolCallDisplay = {
          id: action.toolCall.id,
          name: action.toolCall.name,
          arguments: action.toolCall.arguments,
          status: 'running',
        };
        messages[messages.length - 1] = {
          ...last,
          toolCalls: [...last.toolCalls, tc],
        };
      }
      return { ...state, messages };
    }

    case 'tool_confirmation_request': {
      const messages = [...state.messages];
      const last = messages[messages.length - 1];
      if (last && last.role === 'assistant') {
        const toolCalls = last.toolCalls.map((tc) =>
          tc.name === action.toolName || tc.status === 'running'
            ? {
                ...tc,
                status: 'pending_confirmation' as const,
                confirmationId: action.confirmationId,
                summary: action.summary,
                ...(action.isAskUser ? { isAskUser: true } : {}),
              }
            : tc,
        );
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
      return { ...state, isStreaming: false, isThinking: false };

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
        content: m.content,
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

    // ── Context compression ──────────────────────────────────────────────

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
  lastUsage: null,
  isCompressing: false,
  historyOpen: false,
  historyList: [],
  currentConversationId: null,
  providerSource: 'byok',
  platformStatus: null,
};

// ── Typing speed config ─────────────────────────────────────────────────────
const DELTA_FLUSH_INTERVAL_MS = 30; // ~33fps — smooth typing feel

export function App() {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const { postMessage } = useVSCodeApi();
  const chatEndRef = useRef<HTMLDivElement>(null);

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
      const msg = event.data;

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

      dispatch(msg);
    };
    window.addEventListener('message', handler);

    // Signal webview is ready
    postMessage({ type: 'webview_ready' });

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
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
    (confirmationId: string, approved: boolean, alwaysAllow?: boolean, allowAll?: boolean, planSelection?: string, userResponse?: string) => {
      postMessage({ type: 'tool_confirmation_response', confirmationId, approved, alwaysAllow, allowAll, planSelection, userResponse });
    },
    [postMessage],
  );

  const handleCancel = useCallback(() => {
    postMessage({ type: 'cancel' });
  }, [postMessage]);

  const handleOpenDashboard = useCallback(() => {
    postMessage({ type: 'open_dashboard' });
  }, [postMessage]);

  const handleOpenHistory = useCallback(() => {
    postMessage({ type: 'request_history' });
  }, [postMessage]);

  const handleNewChat = useCallback(() => {
    postMessage({ type: 'new_chat' });
  }, [postMessage]);

  const handleLoadConversation = useCallback(
    (conversationId: string) => {
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

  const handleProviderSourceChange = useCallback(
    (source: 'platform' | 'byok') => {
      postMessage({ type: 'set_provider_source', source });
    },
    [postMessage],
  );

  const handleCloseHistory = useCallback(() => {
    dispatch({ type: 'close_history' });
  }, []);

  return (
    <div className="relative flex flex-col h-screen">
      <Header
        models={state.models}
        activeModel={state.activeModel}
        needsSetup={state.needsSetup}
        onSwitch={handleModelSwitch}
        onOpenDashboard={handleOpenDashboard}
        onOpenHistory={handleOpenHistory}
        onNewChat={handleNewChat}
      />

      <ChatContainer
        messages={state.messages}
        isThinking={state.isThinking}
        onConfirmation={handleConfirmation}
        onContinue={handleContinue}
        onSuggestion={handleSuggestion}
        chatEndRef={chatEndRef}
      />

      <InputArea
        onSend={handleSend}
        onCancel={handleCancel}
        isStreaming={state.isStreaming}
        disabled={state.needsSetup}
        usage={state.lastUsage}
        isCompressing={state.isCompressing}
        onCompress={handleCompress}
        providerSource={state.providerSource}
        platformStatus={state.platformStatus}
        onProviderSourceChange={handleProviderSourceChange}
      />

      {state.historyOpen && (
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
      )}
    </div>
  );
}
