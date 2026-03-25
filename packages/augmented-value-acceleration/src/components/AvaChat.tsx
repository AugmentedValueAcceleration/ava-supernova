import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
}

interface ToolCall {
  name: string;
  status: 'running' | 'done' | 'error';
  result?: string;
}

interface Personality {
  name?: string;
  systemPrompt?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const API_URL = 'https://ava-supernova.com/api/chat';
const MAX_CHARS = 4000;
const LS_MODEL_KEY = 'ava-platform-chat-model';

interface ModelOption {
  id: string;
  name: string;
}

const MODELS: ModelOption[] = [
  { id: 'qwen-3.5-plus', name: 'Qwen 3.5 Plus' },
  { id: 'qwen-flash', name: 'Qwen Flash' },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

// ── Tool Call Icons ────────────────────────────────────────────────────────────

function ToolStatusIcon({ status }: { status: ToolCall['status'] }) {
  if (status === 'running') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', width: 14, height: 14 }}>
        <svg width="14" height="14" viewBox="0 0 14 14" style={{ animation: 'ava-spin 1s linear infinite' }}>
          <circle cx="7" cy="7" r="5" fill="none" stroke="#a855f7" strokeWidth="2" strokeDasharray="20 12" />
        </svg>
      </span>
    );
  }
  if (status === 'done') {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3,7 6,10 11,4" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round">
      <line x1="4" y1="4" x2="10" y2="10" /><line x1="10" y1="4" x2="4" y2="10" />
    </svg>
  );
}

// ── Loading Dots ───────────────────────────────────────────────────────────────

function LoadingDots() {
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', padding: '4px 0' }}>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#a855f7',
            animation: `ava-bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </span>
  );
}

// ── Ava Icon (floating button) ─────────────────────────────────────────────────

function AvaIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
      <text x="13" y="18" textAnchor="middle" fontSize="14" fontWeight="800" fill="#fff" fontFamily="system-ui">A</text>
      <circle cx="13" cy="13" r="12" stroke="#c084fc" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.5" />
    </svg>
  );
}

// ── Keyframes (injected once) ──────────────────────────────────────────────────

let stylesInjected = false;
function injectKeyframes() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes ava-bounce {
      0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
      40% { transform: scale(1); opacity: 1; }
    }
    @keyframes ava-spin {
      to { transform: rotate(360deg); }
    }
    @keyframes ava-fadein {
      from { opacity: 0; transform: translateY(12px) scale(0.96); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes ava-fadeout {
      from { opacity: 1; transform: translateY(0) scale(1); }
      to { opacity: 0; transform: translateY(12px) scale(0.96); }
    }
  `;
  document.head.appendChild(style);
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function AvaChat() {
  const { isAuthenticated, accessToken, loading: authLoading } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [personality, setPersonality] = useState<Personality>({});
  const [hoveredBtn, setHoveredBtn] = useState(false);
  const [model, setModelState] = useState<string>(() => {
    try { return localStorage.getItem(LS_MODEL_KEY) || 'qwen-3.5-plus'; } catch { return 'qwen-3.5-plus'; }
  });
  const [modelOpen, setModelOpen] = useState(false);

  const setModel = (m: string) => {
    setModelState(m);
    try { localStorage.setItem(LS_MODEL_KEY, m); } catch { /* */ }
  };
  const selectedModel = MODELS.find(m => m.id === model) || MODELS[0];

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  // Inject CSS keyframes
  useEffect(() => { injectKeyframes(); }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && !isClosing) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, isClosing]);

  // Load personality from Supabase user_settings
  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;

    (async () => {
      try {
        const { data } = await supabase
          .from('user_settings')
          .select('ava_name, ava_personality')
          .single();

        if (data) {
          setPersonality({
            name: data.ava_name || undefined,
            systemPrompt: data.ava_personality || undefined,
          });
        }
      } catch {
        // No personality set — use defaults
      }
    })();
  }, [isAuthenticated, accessToken]);

  // Close model dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) setModelOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Panel open/close ───────────────────────────────────────────────────────

  const openPanel = useCallback(() => {
    setIsClosing(false);
    setIsOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, 200);
  }, []);

  // ── New chat ───────────────────────────────────────────────────────────────

  const newChat = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
    setIsStreaming(false);
    setInput('');
  }, []);

  // ── Send message ───────────────────────────────────────────────────────────

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming || !accessToken) return;

    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    const assistantMsg: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      toolCalls: [],
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setIsStreaming(true);

    const assistantId = assistantMsg.id;
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Build messages payload for the API
      const apiMessages = [...messages, userMsg].map(m => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          model,
          messages: apiMessages,
          ...(personality.systemPrompt ? { system: personality.systemPrompt } : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => 'Unknown error');
        throw new Error(`API error ${response.status}: ${errText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data);

            switch (event.type) {
              case 'text':
                setMessages(prev => prev.map(m =>
                  m.id === assistantId
                    ? { ...m, content: m.content + (event.content || '') }
                    : m
                ));
                break;

              case 'tool_call':
                setMessages(prev => prev.map(m =>
                  m.id === assistantId
                    ? {
                        ...m,
                        toolCalls: [
                          ...(m.toolCalls || []),
                          { name: event.name || 'tool', status: 'running' as const },
                        ],
                      }
                    : m
                ));
                break;

              case 'tool_result':
                setMessages(prev => prev.map(m => {
                  if (m.id !== assistantId) return m;
                  const tools = [...(m.toolCalls || [])];
                  const idx = tools.findIndex(t => t.name === (event.name || '') && t.status === 'running');
                  if (idx >= 0) {
                    tools[idx] = {
                      ...tools[idx],
                      status: event.error ? 'error' : 'done',
                      result: event.result || event.error || '',
                    };
                  }
                  return { ...m, toolCalls: tools };
                }));
                break;

              case 'error':
                setMessages(prev => prev.map(m =>
                  m.id === assistantId
                    ? { ...m, content: m.content + `\n\n⚠ ${event.message || 'An error occurred'}` }
                    : m
                ));
                break;

              case 'done':
                break;
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User cancelled
      } else {
        const errorMessage = err instanceof Error ? err.message : 'Something went wrong';
        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? { ...m, content: m.content || `Sorry, I couldn't connect. ${errorMessage}` }
            : m
        ));
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [input, isStreaming, accessToken, messages, personality.systemPrompt, model]);

  // ── Key handler ────────────────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  // ── Auto-resize textarea ───────────────────────────────────────────────────

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    if (val.length <= MAX_CHARS) {
      setInput(val);
    }
    // Auto-resize
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, []);

  // ── Detect mode ────────────────────────────────────────────────────────────

  const detectMode = (): string => {
    const last = input.trim();
    if (last.startsWith('>>')) return 'Work';
    if (last.startsWith('::')) return 'Plan';
    if (last.startsWith('..')) return 'Chat';
    if (last.startsWith('??')) return 'Teach';
    if (last.startsWith('!!')) return 'Security';
    if (last.startsWith('**')) return 'Brainstorm';
    return 'Auto';
  };

  // ── Display name ───────────────────────────────────────────────────────────

  const displayName = personality.name || 'Ava';

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Floating button */}
      {!isOpen && (
        <button
          onClick={openPanel}
          onMouseEnter={() => setHoveredBtn(true)}
          onMouseLeave={() => setHoveredBtn(false)}
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: '#a855f7',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: hoveredBtn
              ? '0 0 24px rgba(168, 85, 247, 0.6), 0 4px 20px rgba(0, 0, 0, 0.4)'
              : '0 4px 20px rgba(0, 0, 0, 0.4)',
            transition: 'box-shadow 0.2s, transform 0.2s',
            transform: hoveredBtn ? 'scale(1.08)' : 'scale(1)',
            zIndex: 9999,
          }}
          title="Chat with Ava"
        >
          <AvaIcon />
        </button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            width: 400,
            height: 600,
            maxHeight: 'calc(100vh - 80px)',
            borderRadius: 16,
            background: 'rgba(26, 16, 40, 0.6)',
            border: '1px solid rgba(168, 85, 247, 0.12)',
            boxShadow: '0 8px 40px rgba(0, 0, 0, 0.6), 0 0 1px rgba(168, 85, 247, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 9999,
            animation: isClosing ? 'ava-fadeout 0.2s ease-out forwards' : 'ava-fadein 0.25s ease-out',
          }}
        >
          {/* ── Header ────────────────────────────────────────────────── */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              borderBottom: '1px solid rgba(168, 85, 247, 0.12)',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Purple dot indicator */}
              <div style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#a855f7',
                boxShadow: '0 0 8px rgba(168, 85, 247, 0.6)',
              }} />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 400, color: '#fff' }}>
                    {displayName}
                  </span>
                  <div ref={modelDropdownRef} style={{ position: 'relative', display: 'inline-flex' }}>
                    <button
                      onClick={() => setModelOpen(!modelOpen)}
                      style={{
                        fontSize: 10,
                        color: '#6b7280',
                        background: 'rgba(49, 34, 68, 0.5)',
                        padding: '2px 8px',
                        borderRadius: 8,
                        fontWeight: 400,
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <span>{selectedModel.name}</span>
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                        style={{ transform: modelOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {modelOpen && (
                      <div style={{
                        position: 'absolute', left: 0, top: '100%', marginTop: 4, width: 160,
                        background: 'rgba(26, 16, 40, 0.95)', border: '1px solid rgba(168, 85, 247, 0.15)',
                        borderRadius: 8, boxShadow: '0 12px 24px rgba(0,0,0,0.6)', zIndex: 100, padding: '4px 0',
                      }}>
                        {MODELS.map(m => (
                          <button
                            key={m.id}
                            onClick={() => { setModel(m.id); setModelOpen(false); }}
                            style={{
                              width: '100%', textAlign: 'left', padding: '6px 10px',
                              background: m.id === model ? 'rgba(168, 85, 247, 0.15)' : 'transparent',
                              color: m.id === model ? '#e5e7eb' : '#9ca3af',
                              fontSize: 11, fontWeight: 300, border: 'none', cursor: 'pointer',
                            }}
                          >{m.name}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <span style={{ fontSize: 10, color: '#6b7280' }}>
                  Mode: {detectMode()}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {/* New chat button */}
              <button
                onClick={newChat}
                title="New chat"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#6b7280',
                  transition: 'background 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(49, 34, 68, 0.5)'; e.currentTarget.style.color = '#9ca3af'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6b7280'; }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <line x1="7" y1="2" x2="7" y2="12" />
                  <line x1="2" y1="7" x2="12" y2="7" />
                </svg>
              </button>

              {/* Close button */}
              <button
                onClick={closePanel}
                title="Close"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#6b7280',
                  transition: 'background 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(49, 34, 68, 0.5)'; e.currentTarget.style.color = '#9ca3af'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6b7280'; }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <line x1="3" y1="3" x2="11" y2="11" />
                  <line x1="11" y1="3" x2="3" y2="11" />
                </svg>
              </button>
            </div>
          </div>

          {/* ── Message List ──────────────────────────────────────────── */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {/* Auth gate */}
            {!authLoading && !isAuthenticated && (
              <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                color: '#6b7280',
                textAlign: 'center',
                padding: 24,
              }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                <span style={{ fontSize: 14, fontWeight: 400, color: '#9ca3af' }}>
                  Sign in to chat with {displayName}
                </span>
                <span style={{ fontSize: 12, color: '#6b7280' }}>
                  Authentication required for AI conversations
                </span>
              </div>
            )}

            {/* Empty state */}
            {isAuthenticated && messages.length === 0 && (
              <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                color: '#6b7280',
                textAlign: 'center',
                padding: 24,
              }}>
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  background: 'rgba(168, 85, 247, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 4,
                }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                  </svg>
                </div>
                <span style={{ fontSize: 14, fontWeight: 400, color: '#9ca3af' }}>
                  Hi, I'm {displayName}
                </span>
                <span style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>
                  Your AI assistant across every surface.<br />
                  Same memory, same identity, everywhere.
                </span>
              </div>
            )}

            {/* Messages */}
            {messages.map(msg => (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  gap: 4,
                }}
              >
                {/* Label for assistant */}
                {msg.role === 'assistant' && (
                  <span style={{ fontSize: 10, fontWeight: 400, color: '#a855f7', paddingLeft: 2 }}>
                    {displayName}
                  </span>
                )}

                {/* Tool calls (before message content) */}
                {msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                    marginBottom: msg.content ? 4 : 0,
                  }}>
                    {msg.toolCalls.map((tool, i) => (
                      <div
                        key={`${msg.id}-tool-${i}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 11,
                          color: '#6b7280',
                          padding: '3px 8px',
                          background: 'rgba(26, 26, 53, 0.6)',
                          borderRadius: 6,
                          maxWidth: 280,
                        }}
                      >
                        <ToolStatusIcon status={tool.status} />
                        <span style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {tool.name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Message bubble */}
                {(msg.content || (msg.role === 'assistant' && isStreaming && msg.id === messages[messages.length - 1]?.id)) && (
                  <div
                    style={{
                      maxWidth: '85%',
                      padding: '10px 14px',
                      borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                      background: msg.role === 'user' ? '#7c3aed' : 'rgba(49, 34, 68, 0.5)',
                      color: msg.role === 'user' ? '#fff' : '#e5e7eb',
                      fontSize: 13,
                      lineHeight: 1.55,
                      wordBreak: 'break-word',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {msg.content}
                    {msg.role === 'assistant' && isStreaming && msg.id === messages[messages.length - 1]?.id && !msg.content && (
                      <LoadingDots />
                    )}
                  </div>
                )}

                {/* Timestamp */}
                <span style={{
                  fontSize: 9,
                  color: '#4b5563',
                  paddingLeft: msg.role === 'assistant' ? 2 : 0,
                  paddingRight: msg.role === 'user' ? 2 : 0,
                }}>
                  {formatTime(msg.timestamp)}
                </span>
              </div>
            ))}

            <div ref={messagesEndRef} />
          </div>

          {/* ── Input Bar ─────────────────────────────────────────────── */}
          {isAuthenticated && (
            <div
              style={{
                padding: '12px 16px',
                borderTop: '1px solid rgba(168, 85, 247, 0.12)',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: 8,
                  background: 'rgba(49, 34, 68, 0.5)',
                  borderRadius: 12,
                  padding: '8px 12px',
                  border: '1px solid rgba(168, 85, 247, 0.12)',
                }}
              >
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder={`Message ${displayName}...`}
                  rows={1}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    resize: 'none',
                    color: '#e5e7eb',
                    fontSize: 13,
                    lineHeight: 1.5,
                    maxHeight: 120,
                    fontFamily: 'inherit',
                  }}
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || isStreaming}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: input.trim() && !isStreaming ? '#a855f7' : 'rgba(168, 85, 247, 0.12)',
                    border: 'none',
                    cursor: input.trim() && !isStreaming ? 'pointer' : 'default',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'background 0.15s',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="7" y1="12" x2="7" y2="2" />
                    <polyline points="3,6 7,2 11,6" />
                  </svg>
                </button>
              </div>

              {/* Character count */}
              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                paddingTop: 4,
              }}>
                <span style={{
                  fontSize: 9,
                  color: input.length > MAX_CHARS * 0.9 ? '#f59e0b' : '#4b5563',
                }}>
                  {input.length}/{MAX_CHARS}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
