import { useReducer, useEffect, useRef, useCallback, useState } from 'react';
import type { ExtToWebviewMessage, ChatState, UIMessage, MessageEvent } from './types/messages';

// ── Event timeline helpers ────────────────────────────────────────────────
// Assistant messages store their chronological timeline in `message.events`.
// Every streaming update (thinking delta, text delta, tool call start / end /
// partial output / confirmation) maps to an event update on the current
// assistant bubble. These helpers keep the reducer cases short and consistent.

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

/** Update the events array of the message with the given ID. Returns a new messages array. */
function updateMessageEvents(
  messages: UIMessage[],
  messageId: string | null,
  updater: (events: MessageEvent[]) => MessageEvent[],
): UIMessage[] {
  // Primary path — attach to the tracked current bubble
  if (messageId) {
    return messages.map((m) =>
      m.id === messageId
        ? { ...m, events: updater(m.events || []) }
        : m,
    );
  }
  // Defensive fallback — if the current bubble was closed (done fired) but
  // more events are still arriving for the same turn (premature done,
  // closure-fallback retry, late tool result, agent still executing after
  // an early "finish" decision), attach the events to the most recent
  // assistant message instead of silently dropping them. The previous
  // behaviour returned messages unchanged, which meant users saw "Ava
  // stopped responding" while she was actually still working — an
  // invisible data loss that was indistinguishable from a hang.
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
import { useVSCodeApi } from './hooks/useVSCodeApi';
import { ChatContainer } from './components/ChatContainer';
import { InputArea } from './components/InputArea';
import { Header } from './components/Header';
import { HistoryPanel } from './components/HistoryPanel';
import { SecretGrantPrompt } from './components/SecretGrantPrompt';
import { MemoryPanel } from './components/MemoryPanel';
import { TasksPanel, DEFAULT_WIDTH } from './components/TasksPanel';
import { ContextBar } from './components/ContextBar';
import { WelcomeModal } from './components/WelcomeModal';
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
  | { type: 'confirmation_responded'; confirmationId: string; approved: boolean }
  | { type: 'clear_sign_in_error' }
  | { type: 'dismiss_welcome' }
  | { type: 'start_sign_in_local'; method: 'github' | 'email' };

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
      // Loading-gate logic on init:
      //   - If providerSource is 'byok' (no platform key), there's no
      //     account fetch or history fetch in flight. Flip both flags
      //     false immediately so the chat surface unlocks.
      //   - If there's a platform key, leave them true and let
      //     platform_status / history_list arrival drop them.
      //   - If init already includes platformStatus, the host fetched
      //     it before sending init — flip accountLoading false straight
      //     away to avoid a wasted skeleton flash.
      const initProviderSource = action.providerSource ?? state.providerSource;
      const isByokOnly = initProviderSource === 'byok';
      const platformStatusIncluded = !!action.platformStatus;
      return {
        ...state,
        initialized: true,
        models: action.models,
        activeModel: action.activeModel,
        needsSetup: action.needsSetup,
        consentRequired: action.consentRequired ?? false,
        providerSource: initProviderSource,
        accountLoading: isByokOnly ? false : (platformStatusIncluded ? false : state.accountLoading),
        historyLoading: isByokOnly ? false : state.historyLoading,
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
        // showWelcome is a one-shot from the host on first init after
        // setup. Once we've stored it once we latch and don't clear it
        // on later init messages (e.g. after a model switch) so the
        // modal doesn't reappear mid-session.
        showWelcome: state.showWelcome || !!(action as { showWelcome?: boolean }).showWelcome,
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
      // New user message = new turn. Clear currentAssistantId so the next
      // stream_start creates a fresh assistant bubble instead of appending
      // to the previous turn's bubble.
      return {
        ...state,
        messages: [...state.messages, msg],
        currentAssistantId: null,
        isStreaming: true,
      };
    }

    case 'stream_start': {
      // ── One assistant bubble per user turn ───────────────────────────
      // If a bubble already exists for this turn (second+ LLM iteration
      // within the same turn), keep using it — stream_start just means the
      // next LLM round is about to write. Do NOT create a new bubble.
      //
      // Only create a new bubble when currentAssistantId is null AND there
      // isn't already an assistant message we should continue. The second
      // condition is defensive: if done fired prematurely and then the
      // agent resumed work (continuation stall recovery, closure fallback
      // retry, etc.), we want to re-attach to the existing bubble rather
      // than create a duplicate. user_message_ack is the ONLY path that
      // should trigger a fresh bubble — it's what actually signals "new
      // user turn" — and that handler creates the user message cleanly
      // without touching currentAssistantId on the assistant side.
      if (state.currentAssistantId) {
        return { ...state, isStreaming: true, isThinking: true };
      }
      // Look for a recent assistant bubble to re-attach to. We only
      // re-attach if the LAST message is an assistant (meaning no user
      // message has arrived since — same turn, agent continuing).
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
      // Append to the last thinking event in the current bubble. If the
      // previous event was a different kind (text or tool call), start a
      // new thinking event so the chronology is preserved.
      //
      // Defensive: if isStreaming was cleared (e.g. by a premature done
      // event), flip it back. Activity is still happening — the UI
      // should show that, not lie about it.
      const messages = updateMessageEvents(state.messages, state.currentAssistantId, (events) =>
        appendToLastEventOfKind(events, 'thinking', action.content),
      );
      return { ...state, messages, isThinking: true, isStreaming: true };
    }

    case 'stream_delta': {
      // Append to the last text event in the current bubble. No more
      // bubble splitting on text-after-tools — the text becomes a new
      // text event inside the same timeline, appearing chronologically
      // after whatever tool events preceded it.
      //
      // Defensive: restore streaming state if it was prematurely cleared.
      const messages = updateMessageEvents(state.messages, state.currentAssistantId, (events) =>
        appendToLastEventOfKind(events, 'text', action.content),
      );
      return { ...state, messages, isThinking: false, isStreaming: true };
    }

    case 'stream_end': {
      // The current LLM round finished streaming. Do NOT close the bubble —
      // the agent loop may run more iterations within the same user turn
      // (e.g. text → tool_call → tool_result → more text). Only `done`
      // closes the bubble.
      return { ...state, isThinking: false };
    }

    case 'tool_call_start': {
      // Insert or update a tool_call event in the current bubble's events.
      // upsertToolCallEvent handles the synthetic-placeholder dedupe case
      // where tool_confirmation_request arrived before tool_call_start.
      const messages = updateMessageEvents(state.messages, state.currentAssistantId, (events) => {
        const idx = findToolCallEventIndex(events, action.toolCall.id);
        if (idx >= 0) {
          // Dedupe — merge real arguments but preserve pending_confirmation
          // if the safety net already set it
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
      // Defensive: a tool call starting means the agent is active. Restore
      // running state if a premature done had cleared it.
      return { ...state, messages, isStreaming: true, isThinking: false };
    }

    case 'tool_call_partial': {
      // Live stream chunks from the tool (bash stdout, file write preview,
      // file edit diff, etc.) — append to the partialOutput of the matching
      // tool_call event so the card shows live progress while running.
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
      // Update the matching tool_call event to pending_confirmation. If no
      // matching event exists yet (race condition where this message
      // arrived before tool_call_start), create a synthetic placeholder so
      // the approval buttons render immediately. The real tool_call_start,
      // when it arrives, will dedupe via upsertToolCallEvent.
      const messages = updateMessageEvents(state.messages, state.currentAssistantId, (events) => {
        // Priority: exact toolCallId match (reliable, v0.36.9+)
        //           then status==='running' AND name match (legacy fallback)
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
              toolDescription: action.toolDescription,
              ...(action.isAskUser ? { isAskUser: true } : {}),
            },
          };
          return next;
        }
        // Safety net — synthesise a pending tool_call event so buttons render
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
              toolDescription: action.toolDescription,
              ...(action.isAskUser ? { isAskUser: true } : {}),
            },
          },
        ];
      });
      return { ...state, messages };
    }

    case 'tool_call_end': {
      // Mark the matching tool_call event success/failed and attach the
      // final result. Preserves partialOutput (live stream) alongside
      // result (final) so the UI can show both if useful.
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
      // Optimistic UI update — transition the matching tool_call event out
      // of pending_confirmation immediately on click so the user sees their
      // click registered, even if the tool then hangs on its own execution.
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
      return {
        ...state,
        lastUsage: { ...action.usage, cost: action.cost, contextWindow: action.contextWindow },
      };

    case 'platform_status':
      return {
        ...state,
        // Account fetch resolved — drop the loading gate.
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

    case 'dismiss_welcome':
      // Local flag flip. The host was already notified via
      // mark_onboarded when the modal's close path fired.
      return { ...state, showWelcome: false };

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
      // Close the current assistant bubble (if any) and end the turn —
      // error means the turn failed, next user message starts fresh.
      const messages = [...state.messages, msg].map((m) =>
        m.id === state.currentAssistantId ? { ...m, isStreaming: false } : m,
      );
      return {
        ...state,
        messages,
        currentAssistantId: null,
        isStreaming: false,
        isThinking: false,
      };
    }

    case 'done': {
      // Close the current assistant bubble (mark it no longer streaming)
      // and clear currentAssistantId so the next user message starts a
      // fresh turn with a new bubble.
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
          error: action.error || prev?.error,
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

    // ── Loop-prevention surfacing ────────────────────────────────────────
    // Render verify / fresh-eyes / refund signals as system-style chat
    // entries so the user sees recovery attempts instead of paying for
    // them silently. verify_passed is INTENTIONALLY silent — passing is
    // the boring outcome and surfacing it would clutter the timeline.
    // Failed / fresh-eyes / refund are the moments worth seeing.
    case 'loop_status': {
      const messageContent = (() => {
        switch (action.kind) {
          case 'verify_started':
            return `🔍 Verifying ${action.files?.length ?? 0} file change${action.files?.length === 1 ? '' : 's'}…`;
          case 'verify_passed':
            return null; // silent success
          case 'verify_failed':
            return `⚠ Verification failed on ${action.files?.join(', ')} — retrying with failure context`;
          case 'fresh_eyes_started':
            return `🔁 Loop guard fired — running an independent second-opinion review (extra LLM call)`;
          case 'fresh_eyes_complete':
            return `✓ Independent review complete — feeding diagnosis back to the agent`;
          case 'refund_eligible':
            return `ℹ This turn is flagged for fairness review — ~${action.tokensInRecovery} tokens spent on recovery. Operator-side credit policy decides if a refund applies.`;
          default:
            return null;
        }
      })();
      if (messageContent === null) return state;
      const loopMsg: UIMessage = {
        id: nextId(),
        role: 'system',
        content: messageContent,
        toolCalls: [],
        isStreaming: false,
      };
      return { ...state, messages: [...state.messages, loopMsg] };
    }

    // ── History ────────────────────────────────────────────────────────────

    case 'history_list':
      return {
        ...state,
        // History fetch resolved — drop the loading gate. Note this also
        // arrives on every manual sidebar open later in the session, but
        // setting an already-false flag to false is a no-op.
        historyLoading: false,
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

    // ── Secret vault — grant flow ────────────────────────────────────────

    case 'secret_grant_request':
      return {
        ...state,
        pendingSecretGrant: {
          grantId: action.grantId,
          label: action.label,
          reason: action.reason,
          candidates: action.candidates,
        },
      };

    case 'clear_secret_grant':
      return { ...state, pendingSecretGrant: null };

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

    // ── OAuth sign-in flow (v0.37.0) ─────────────────────────────────────
    case 'start_sign_in_local':
      // User clicked a sign-in button. Set pending state before posting to
      // extension host so the UI updates immediately rather than waiting
      // for the round-trip sign_in_started event.
      return { ...state, signInPending: action.method, signInError: null };

    case 'sign_in_started':
      // Confirmation from the extension host that the browser was opened
      // and a pending attempt is tracked. No state change if we already
      // optimistically set pending on the button click.
      return state.signInPending ? state : { ...state, signInPending: 'github', signInError: null };

    case 'sign_in_complete':
      return {
        ...state,
        signInPending: null,
        signInError: null,
        signInAccount: action.account,
        // Clearing needsSetup here lets the UI flip straight into the main
        // chat view once sign-in succeeds. The extension host will send a
        // fresh init message shortly after with the new model/account data.
        needsSetup: false,
      };

    case 'sign_in_failed':
      return {
        ...state,
        signInPending: null,
        signInError: action.error,
      };

    case 'sign_in_cancelled':
      return {
        ...state,
        signInPending: null,
        signInError: null,
      };

    case 'clear_sign_in_error':
      return { ...state, signInError: null };

    default:
      return state;
  }
}

const initialState: ChatState = {
  messages: [],
  currentAssistantId: null,
  models: [],
  activeModel: null,
  isStreaming: false,
  isThinking: false,
  needsSetup: true,
  consentRequired: false,
  initialized: false,
  // Default to true — flipped false on init for BYOK-only paths or when the
  // platform_status / history_list events arrive (gating skeletons + the
  // loading banner). See ChatState comment in message-types.ts.
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
  showWelcome: false,
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
  activePersonas: [] as Array<{ id: string; phase: 'active' | 'complete' | 'error'; description?: string; output?: string; error?: string; tools?: Array<{ name: string; done: boolean; success?: boolean }> }>,
  // OAuth sign-in flow (v0.37.0)
  signInPending: null,
  signInError: null,
  signInAccount: null,
  // Vault grant prompt — populated when host posts secret_grant_request.
  pendingSecretGrant: null,
};

// ── Typing speed config ─────────────────────────────────────────────────────
const DELTA_FLUSH_INTERVAL_MS = 30; // ~33fps — smooth typing feel

export function App() {
  const { postMessage, getState, setState } = useVSCodeApi();

  // Restore persisted panel state from vscode
  const [state, dispatch] = useReducer(chatReducer, initialState, (init) => {
    const saved = getState() as {
      tasksOpen?: boolean;
      tasksPanelWidth?: number;
      messages?: UIMessage[];
      currentConversationId?: string | null;
    } | null;
    if (saved) {
      return {
        ...init,
        tasksOpen: saved.tasksOpen ?? init.tasksOpen,
        tasksPanelWidth: saved.tasksPanelWidth ?? init.tasksPanelWidth,
        messages: Array.isArray(saved.messages) ? saved.messages : init.messages,
        currentConversationId: saved.currentConversationId ?? init.currentConversationId,
      };
    }
    return init;
  });

  // Persist tasks panel state to vscode when it changes
  useEffect(() => {
    const prev = getState() as Record<string, unknown> | null;
    setState({ ...prev, tasksOpen: state.tasksOpen, tasksPanelWidth: state.tasksPanelWidth });
  }, [state.tasksOpen, state.tasksPanelWidth, getState, setState]);

  // Persist chat messages + current conversation id (skip while streaming to
  // avoid thrashing — the final state lands when streaming ends). Cap to the
  // last 200 messages so the vscode webview state stays well under its quota.
  useEffect(() => {
    if (state.isStreaming) return;
    const prev = getState() as Record<string, unknown> | null;
    const trimmed = state.messages.length > 200 ? state.messages.slice(-200) : state.messages;
    setState({ ...prev, messages: trimmed, currentConversationId: state.currentConversationId });
  }, [state.messages, state.currentConversationId, state.isStreaming, getState, setState]);

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
    const handler = (event: globalThis.MessageEvent<ExtToWebviewMessage>) => {
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

  const handleAcceptConsent = useCallback(() => {
    postMessage({ type: 'accept_consent' });
    dispatch({ type: 'init', models: state.models, activeModel: state.activeModel, needsSetup: state.needsSetup, consentRequired: false } as any);
  }, [postMessage, state.models, state.activeModel, state.needsSetup]);

  // OAuth sign-in handlers (v0.37.0)
  const handleStartSignIn = useCallback((method: 'github' | 'email') => {
    // Optimistically set pending state so the UI flips instantly,
    // then post to extension host which will open the browser and
    // confirm via sign_in_started event
    dispatch({ type: 'start_sign_in_local', method });
    postMessage({ type: 'start_sign_in', method });
  }, [postMessage]);

  const handleCancelSignIn = useCallback(() => {
    postMessage({ type: 'cancel_sign_in' });
  }, [postMessage]);

  const handleClearSignInError = useCallback(() => {
    dispatch({ type: 'clear_sign_in_error' });
  }, []);

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
    // Retry after an error — the extension will repair conversation
    // state (fix orphan tool_calls, prune null-content) before issuing
    // the next request. Without this path, pressing "Retry" on a
    // stuck 400 just re-sends the same broken payload.
    postMessage({ type: 'retry_after_error', mode: 'code' });
  }, [postMessage]);

  // Repurposed as the prefill hook for empty-state starter chips. Was
  // previously wired to immediately send the suggested prompt. Prefilling
  // the input lets the operator review/edit before sending — safer
  // default for a brand-new chat where the user is still orienting.
  const [pendingPrefill, setPendingPrefill] = useState<{ value: string; nonce: number } | null>(null);
  const handleSuggestion = useCallback(
    (prompt: string) => {
      setPendingPrefill({ value: prompt, nonce: Date.now() });
    },
    [],
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

  // First-run welcome modal — renders above everything when the host
  // signalled it on the initial init message and the user hasn't
  // dismissed it yet. The host owns the persisted "has onboarded"
  // flag; the webview just renders if told to.
  const activeModelName = state.models.find(m => m.id === state.activeModel)?.name ?? state.activeModel;

  return (
    <SecretsProvider>
    {state.showWelcome && !state.needsSetup && !state.consentRequired && (
      <WelcomeModal
        modelName={activeModelName}
        freeTokensLimit={state.platformStatus?.freeTokensLimit ?? null}
        freeTokensUsed={state.platformStatus?.freeTokensUsed ?? null}
        isConnected={!!state.platformStatus?.connected}
        onClose={() => {
          postMessage({ type: 'mark_onboarded' });
          dispatch({ type: 'dismiss_welcome' } as never);
        }}
        onOpenDashboardPage={(page) => postMessage({ type: 'open_dashboard_page', page })}
      />
    )}
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
          {t('chat.skip_link')}
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
          sessionTaskCount={state.sessionTasks?.length ?? 0}
          conversationTitle={state.conversationTitle}
        />

        {/* First-load takeover — full-area spinner instead of the thin
            banner that shipped in v0.21. Was too easy to miss; users
            opened chat, saw the empty conversation list, and read it
            as "no chats" before localStorage drained. The spinner
            takes the messages area entirely while data is in flight,
            disappears the moment both fetches resolve. */}
        {(state.accountLoading || state.historyLoading) ? (
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
                width: 32px;
                height: 32px;
                border-radius: 50%;
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
          consentRequired={state.consentRequired}
          onAcceptConsent={handleAcceptConsent}
          initialized={state.initialized}
          onOpenDashboard={handleOpenDashboard}
          activeModel={state.activeModel}
          models={state.models}
          conductorActive={state.conductorActive}
          conductorMode={state.conductorMode}
          activePersonas={state.activePersonas}
          signInPending={state.signInPending}
          signInError={state.signInError}
          onStartSignIn={handleStartSignIn}
          onCancelSignIn={handleCancelSignIn}
          onClearSignInError={handleClearSignInError}
          contextUsage={state.contextUsage}
          isCompressing={state.isCompressing}
          isStreaming={state.isStreaming}
          onCompress={handleCompress}
          userName={state.signInAccount?.name?.split(' ')[0] ?? null}
          userAvatarUrl={state.signInAccount?.avatar_url ?? null}
        />
        )}

        {/* Context usage — sits flush above the composer so the bar is
            right where the next turn is being written. Click-to-compress
            when pct ≥ 25%. */}
        <ContextBar
          contextUsage={state.contextUsage ?? null}
          isCompressing={state.isCompressing}
          isStreaming={state.isStreaming}
          onCompress={handleCompress}
        />

        <InputArea
          onSend={handleSend}
          onCancel={handleCancel}
          isStreaming={state.isStreaming}
          // Disabled while the first-load fetches are still running so the
          // user can't fire a turn before their account/tier is known
          // (which would otherwise route via stale platform_status).
          disabled={state.needsSetup || state.accountLoading || state.historyLoading}
          usage={state.lastUsage}
          isCompressing={state.isCompressing}
          onCompress={handleCompress}
          providerSource={state.providerSource}
          platformStatus={state.platformStatus}
          onProviderSourceChange={handleProviderSourceChange}
          contextUsage={state.contextUsage}
          prefill={pendingPrefill}
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

        {state.pendingSecretGrant && (
          <ErrorBoundary>
            <SecretGrantPrompt
              request={state.pendingSecretGrant}
              onRespond={(secretId, alwaysForProject) => {
                postMessage({
                  type: 'secret_grant_response',
                  grantId: state.pendingSecretGrant!.grantId,
                  secretId,
                  alwaysForProject,
                } as any);
                dispatch({ type: 'clear_secret_grant' } as any);
              }}
              onOpenVault={() => {
                postMessage({ type: 'open_dashboard' } as any);
              }}
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
