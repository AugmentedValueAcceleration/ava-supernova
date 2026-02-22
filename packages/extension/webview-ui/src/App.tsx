import { useReducer, useEffect, useRef, useCallback } from 'react';
import type { ExtToWebviewMessage, ChatState, UIMessage, ToolCallDisplay } from './types/messages';
import { useVSCodeApi } from './hooks/useVSCodeApi';
import { ChatContainer } from './components/ChatContainer';
import { InputArea } from './components/InputArea';
import { ModelSelector } from './components/ModelSelector';
import { StatusBar } from './components/StatusBar';

type ChatAction = ExtToWebviewMessage;

let messageIdCounter = 0;
function nextId(): string {
  return `msg-${++messageIdCounter}`;
}

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'init':
      return {
        ...state,
        models: action.models,
        activeModel: action.activeModel,
        needsSetup: action.needsSetup,
      };

    case 'user_message_ack': {
      const msg: UIMessage = {
        id: nextId(),
        role: 'user',
        content: action.text,
        toolCalls: [],
        isStreaming: false,
      };
      return { ...state, messages: [...state.messages, msg] };
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
      return { ...state, messages, isStreaming: false, isThinking: false };
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
          tc.id === action.toolName || tc.status === 'running'
            ? {
                ...tc,
                status: 'pending_confirmation' as const,
                confirmationId: action.confirmationId,
                summary: action.summary,
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
        lastUsage: { ...action.usage, cost: action.cost },
      };

    case 'error': {
      const msg: UIMessage = {
        id: nextId(),
        role: 'error',
        content: action.message,
        toolCalls: [],
        isStreaming: false,
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

    case 'model_switched':
      return { ...state, activeModel: action.modelId };

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
};

export function App() {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const { postMessage } = useVSCodeApi();
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Listen for messages from extension host
  useEffect(() => {
    const handler = (event: MessageEvent<ExtToWebviewMessage>) => {
      dispatch(event.data);
    };
    window.addEventListener('message', handler);

    // Signal webview is ready
    postMessage({ type: 'webview_ready' });

    return () => window.removeEventListener('message', handler);
  }, [postMessage]);

  // Auto-scroll to bottom on new content
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages, state.isThinking]);

  const handleSend = useCallback(
    (text: string) => {
      postMessage({ type: 'send_message', text });
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
    (confirmationId: string, approved: boolean) => {
      postMessage({ type: 'tool_confirmation_response', confirmationId, approved });
    },
    [postMessage],
  );

  const handleCancel = useCallback(() => {
    postMessage({ type: 'cancel' });
  }, [postMessage]);

  return (
    <div className="flex flex-col h-screen">
      <ModelSelector
        models={state.models}
        activeModel={state.activeModel}
        needsSetup={state.needsSetup}
        onSwitch={handleModelSwitch}
      />

      <ChatContainer
        messages={state.messages}
        isThinking={state.isThinking}
        onConfirmation={handleConfirmation}
        chatEndRef={chatEndRef}
      />

      {state.lastUsage && <StatusBar usage={state.lastUsage} />}

      <InputArea
        onSend={handleSend}
        onCancel={handleCancel}
        isStreaming={state.isStreaming}
        disabled={state.needsSetup}
      />
    </div>
  );
}
