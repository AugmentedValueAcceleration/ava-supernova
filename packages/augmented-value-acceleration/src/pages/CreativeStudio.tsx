import { useState, useEffect, useRef, useCallback } from 'react';
import PageHeader from '../components/PageHeader';
import { theme } from '../lib/theme';

/* ══════════════════════════════════════════════════════════════════════
   Creative Studio — Augmented Value Acceleration Platform
   Single-file module: Chat + Canvas with SSE streaming
   ══════════════════════════════════════════════════════════════════════ */

const PLATFORM_URL = import.meta.env.VITE_PLATFORM_URL || 'https://ava-platform.vercel.app';

/* ── Theme tokens ──────────────────────────────────────────────────── */

const T = {
  bg:        theme.pageBg,
  bgCard:    theme.cardBg,
  bgInput:   theme.inputBg,
  bgHover:   theme.border,
  accent:    theme.accent,
  accentDim: theme.accentBg,
  border:    theme.border,
  borderHi:  theme.borderSubtle,
  text:      theme.text,
  textSec:   theme.textSecondary,
  textMuted: theme.textMuted,
  white:     '#ffffff',
  purple:    theme.accentHover,
  purpleBg:  theme.accent,
  red:       theme.red,
  redBg:     theme.redBg,
  redBorder: `${theme.red}40`,
  green:     theme.green,
  greenBg:   theme.greenBg,
};

/* ── Types ─────────────────────────────────────────────────────────── */

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolLog?: ToolLog[];
  isError?: boolean;
}

interface ToolLog {
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
}

type CanvasItemType = 'text' | 'image';
type CanvasTab = 'posts' | 'images';
type ContextId = 'social';

interface CanvasItem {
  id: string;
  type: CanvasItemType;
  content: string;
  title?: string;
  platform: string;
  timestamp: Date;
  copied: boolean;
  imageUrl?: string;
  imagePrompt?: string;
}

interface ModelOption {
  id: string;
  name: string;
  provider: string;
  tag?: string;
}

interface QuickPrompt {
  label: string;
  prompt: string;
}

/* ── Context definitions ─────────────────────────────────────────────── */

const MODELS_SOCIAL: ModelOption[] = [
  { id: 'kimi-k2.5',            name: 'Kimi K2.5',         provider: 'Moonshot AI', tag: 'Best for content' },
  { id: 'qwen3.5-plus',         name: 'Qwen 3.5 Plus',    provider: 'Alibaba',     tag: 'Best for content' },
  { id: 'claude-sonnet-4-6',    name: 'Claude Sonnet 4.6', provider: 'Anthropic',   tag: 'Best for content' },
  { id: 'mistral-large-latest', name: 'Mistral Large',     provider: 'Mistral',     tag: 'Best for content' },
  { id: 'glm-5',                name: 'GLM-5',             provider: 'Zhipu AI' },
  { id: 'deepseek-chat',        name: 'DeepSeek V3.2',     provider: 'DeepSeek' },
  { id: 'claude-opus-4-6',      name: 'Claude Opus 4.6',   provider: 'Anthropic' },
  { id: 'claude-haiku-4-5',     name: 'Claude Haiku 4.5',  provider: 'Anthropic',   tag: 'Fast' },
  { id: 'deepseek-reasoner',    name: 'DeepSeek Reasoner', provider: 'DeepSeek',    tag: 'Deep thinking' },
  { id: 'qwen-flash',           name: 'Qwen Flash',        provider: 'Alibaba Cloud', tag: 'Free' },
];

const PROMPTS_SOCIAL: QuickPrompt[] = [
  { label: 'Tweet — Ava\'s voice',     prompt: 'I want a tweet in Ava\'s voice. Ask me what to focus on.' },
  { label: 'Tweet — Professional',      prompt: 'I want a professional tweet. Ask me what to focus on.' },
  { label: 'LinkedIn Post',             prompt: 'I want a LinkedIn post. Ask me what to focus on.' },
  { label: 'Twitter Thread',            prompt: 'I want a Twitter thread. Ask me what to focus on.' },
  { label: 'Banter Tweet',              prompt: 'I want a banter tweet. Ask me what angle to take.' },
  { label: 'Big Tech Clap Back',        prompt: 'I want a clap back tweet responding to a big tech leader. Ask me what to focus on.' },
  { label: 'Stats Update',              prompt: 'Write a stats update post. Ask me which platform.' },
  { label: 'Feature Spotlight',         prompt: 'I want to spotlight a feature. Ask me what to focus on.' },
  { label: 'Blog Article',              prompt: 'I want to write a blog article. Ask me what to focus on.' },
  { label: 'Announcement',              prompt: 'I want to write an announcement. Ask me what to focus on.' },
  { label: 'Release Notes',             prompt: 'I want to write release notes. Ask me what was shipped.' },
  { label: 'Social Media Graphic',      prompt: 'Generate a social media graphic. Ask me what to showcase.' },
  { label: 'Promotional Banner',        prompt: 'Generate a promotional banner image for Ava | Supernova.' },
];

const CONTEXTS: Record<ContextId, {
  label: string;
  badge: string;
  badgeBg: string;
  badgeText: string;
  endpoint: string;
  welcome: string;
  placeholder: string;
  models: ModelOption[];
  defaultModel: string;
  prompts: QuickPrompt[];
  hasCanvas: boolean;
}> = {
  social: {
    label: 'Social Media',
    badge: 'STUDIO',
    badgeBg: 'rgba(147,51,234,0.15)',
    badgeText: '#c084fc',
    endpoint: `${PLATFORM_URL}/api/admin/content/generate`,
    welcome: "Welcome to the Creative Studio. I can create text posts and generate AI images — all from one conversation.\n\n**Posts** — tweets, LinkedIn, blogs, announcements for any platform\n**Images** — AI-generated graphics, banners, and social media visuals\n\nTell me what you need or use the quick prompts. Output appears in the canvas.",
    placeholder: 'What do you want to create — a post or image?',
    models: MODELS_SOCIAL,
    defaultModel: 'kimi-k2.5',
    prompts: PROMPTS_SOCIAL,
    hasCanvas: true,
  },
};

/* ── Tool labels ─────────────────────────────────────────────────────── */

const TOOL_LABELS: Record<string, string> = {
  save_content: 'Saved content to canvas',
  search_platform_specs: 'Searched platform specs',
  web_search: 'Searched the web',
  recent_commits: 'Fetched recent commits',
  get_datetime: 'Got date/time',
  read_file: 'Read file',
  list_directory: 'Listed directory',
  search_code: 'Searched code',
  design_graphic: 'Designed graphic',
  generate_image: 'Generated image',
};

/* ── Platform detection for canvas items ─────────────────────────────── */

const PLATFORM_LABELS: Record<string, string> = {
  tweet: 'Tweet',
  linkedin: 'LinkedIn',
  thread: 'Thread',
  facebook: 'Facebook',
  instagram: 'Instagram',
  reddit: 'Reddit',
  discord: 'Discord',
  youtube: 'YouTube',
  producthunt: 'Product Hunt',
  post: 'Post',
  content: 'Content',
  image: 'Image',
};

const PLATFORM_LIMITS: Record<string, number> = {
  tweet: 280,
  linkedin: 3000,
  facebook: 63206,
};

function detectPlatform(content: string): string {
  const lower = content.toLowerCase();
  if (lower.includes('tweet 1') || lower.includes('1/') || lower.includes('thread')) return 'thread';
  if ((lower.includes('#') && lower.includes('instagram')) || (lower.match(/#\w+/g)?.length ?? 0) >= 5) return 'instagram';
  if (lower.includes('reddit') || lower.includes('r/')) return 'reddit';
  if (lower.includes('youtube') || lower.includes('timestamps')) return 'youtube';
  if (lower.includes('product hunt')) return 'producthunt';
  if (lower.includes('discord')) return 'discord';
  if (content.length <= 280) return 'tweet';
  if (content.length <= 3000) return 'linkedin';
  if (content.length <= 5000) return 'facebook';
  return 'post';
}

/* ── localStorage helpers ─────────────────────────────────────────── */

function loadMessages(ctxId: string, welcome: string): Message[] {
  try {
    const stored = localStorage.getItem(`studio_messages_${ctxId}`);
    if (stored) {
      return (JSON.parse(stored) as Message[]).map(m => ({ ...m, timestamp: new Date(m.timestamp) }));
    }
  } catch { /* ignore */ }
  if (welcome) {
    return [{ id: '0', role: 'assistant', content: welcome, timestamp: new Date() }];
  }
  return [];
}

function persistMessages(ctxId: string, msgs: Message[]) {
  try { localStorage.setItem(`studio_messages_${ctxId}`, JSON.stringify(msgs)); } catch { /* quota */ }
}

/* ══════════════════════════════════════════════════════════════════════
   Main Component
   ══════════════════════════════════════════════════════════════════════ */

export default function CreativeStudio() {
  /* ── Context — Social Media only ──────────────────────────────── */
  const activeCtx: ContextId = 'social';
  const ctx = CONTEXTS[activeCtx];

  /* ── Model selection ───────────────────────────────────────────── */
  const [modelMap, setModelMap] = useState<Record<string, string>>(() => {
    try {
      const s = localStorage.getItem('studio_models');
      return s ? JSON.parse(s) : {};
    } catch { return {}; }
  });
  const model = modelMap[activeCtx] || ctx.defaultModel;
  const setModel = (m: string) => {
    const next = { ...modelMap, [activeCtx]: m };
    setModelMap(next);
    try { localStorage.setItem('studio_models', JSON.stringify(next)); } catch { /* */ }
  };
  const [modelOpen, setModelOpen] = useState(false);
  const modelRef = useRef<HTMLDivElement>(null);

  /* ── Chat state ────────────────────────────────────────────────── */
  const [messages, setMessages] = useState<Message[]>(() => loadMessages(activeCtx, ctx.welcome));
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [liveToolLog, setLiveToolLog] = useState<ToolLog[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /* ── Canvas state ──────────────────────────────────────────────── */
  const [canvasItems, setCanvasItems] = useState<CanvasItem[]>([]);
  const [canvasTab, setCanvasTab] = useState<CanvasTab>('posts');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [showCanvas, setShowCanvas] = useState(false);

  /* ── Tool log expand state ─────────────────────────────────────── */
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});

  /* ── Effects ───────────────────────────────────────────────────── */

  // Persist messages
  useEffect(() => { persistMessages(activeCtx, messages); }, [activeCtx, messages]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({ top: chatContainerRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, liveToolLog, loading]);

  // Focus input on context switch
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 200);
  }, [activeCtx]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) setModelOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* ── Canvas helpers ────────────────────────────────────────────── */

  const addCanvasItem = useCallback((item: CanvasItem) => {
    setCanvasItems(prev => [item, ...prev]);
    setSelectedItemId(item.id);
    setShowCanvas(true);
    if (item.type === 'image') setCanvasTab('images');
    else setCanvasTab('posts');
  }, []);

  const removeCanvasItem = useCallback((id: string) => {
    setCanvasItems(prev => {
      const next = prev.filter(c => c.id !== id);
      if (id === selectedItemId) setSelectedItemId(next[0]?.id || null);
      return next;
    });
  }, [selectedItemId]);

  const copyCanvasItem = useCallback((id: string) => {
    const item = canvasItems.find(c => c.id === id);
    if (!item) return;
    navigator.clipboard.writeText(item.content);
    setCanvasItems(prev => prev.map(c => c.id === id ? { ...c, copied: true } : c));
    setTimeout(() => {
      setCanvasItems(prev => prev.map(c => c.id === id ? { ...c, copied: false } : c));
    }, 2000);
  }, [canvasItems]);

  const clearCanvas = useCallback(() => {
    setCanvasItems([]);
    setSelectedItemId(null);
  }, []);

  /* ── SSE handler ───────────────────────────────────────────────── */

  const handleSSE = useCallback(async (res: Response): Promise<{ content: string; tools: ToolLog[]; hadError: boolean }> => {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const tools: ToolLog[] = [];
    let content = '';
    let hadError = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const json = line.slice(6).trim();
        if (!json) continue;
        try {
          const evt = JSON.parse(json);

          if (evt.type === 'tool_call') {
            tools.push({ name: evt.name, args: evt.args });
            setLiveToolLog([...tools]);
          } else if (evt.type === 'tool_result') {
            const last = [...tools].reverse().find(t => t.name === evt.name);
            if (last) { last.result = evt.result; setLiveToolLog([...tools]); }
          } else if (evt.type === 'canvas_update') {
            addCanvasItem({
              id: Date.now().toString(),
              type: 'text',
              content: evt.body || '',
              title: evt.title,
              platform: detectPlatform(evt.body || ''),
              timestamp: new Date(),
              copied: false,
            });
          } else if (evt.type === 'image_update') {
            addCanvasItem({
              id: Date.now().toString(),
              type: 'image',
              content: evt.prompt || '',
              imageUrl: evt.url,
              imagePrompt: evt.prompt,
              platform: 'image',
              timestamp: new Date(),
              copied: false,
            });
          } else if (evt.type === 'graphic_design') {
            addCanvasItem({
              id: Date.now().toString(),
              type: 'image',
              content: evt.description || 'Designed graphic',
              imagePrompt: evt.description || 'Designed graphic',
              platform: 'image',
              timestamp: new Date(),
              copied: false,
            });
          } else if (evt.type === 'text') {
            content = evt.content;
          } else if (evt.type === 'error') {
            content = `Error: ${evt.message}`;
            hadError = true;
          }
        } catch { /* skip malformed */ }
      }
    }

    setLiveToolLog([]);
    return { content, tools, hadError };
  }, [addCanvasItem]);

  /* ── Send message ──────────────────────────────────────────────── */

  const send = useCallback(async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || loading) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: msg, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setLiveToolLog([]);

    try {
      const body: Record<string, unknown> = {
        model,
        platform: 'general',
        messages: [
          ...messages.filter(m => !m.isError).map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: msg },
        ],
      };

      const res = await fetch(ctx.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `Error: ${err.error || 'Unknown error'}`,
          timestamp: new Date(),
          isError: true,
        }]);
        setLoading(false);
        return;
      }

      const { content, tools, hadError } = await handleSSE(res);
      setLoading(false);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content,
        timestamp: new Date(),
        toolLog: tools.length > 0 ? [...tools] : undefined,
        ...(hadError && { isError: true }),
      }]);
    } catch (err) {
      setLiveToolLog([]);
      setLoading(false);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Network error: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: new Date(),
        isError: true,
      }]);
    }
  }, [input, loading, messages, model, ctx.endpoint, handleSSE]);

  /* ── Clear chat ────────────────────────────────────────────────── */

  const clearChat = useCallback(() => {
    setLiveToolLog([]);
    try {
      localStorage.removeItem(`studio_messages_${activeCtx}`);
    } catch { /* */ }
    if (ctx.welcome) {
      setMessages([{ id: '0', role: 'assistant', content: ctx.welcome, timestamp: new Date() }]);
    } else {
      setMessages([]);
    }
    clearCanvas();
    setShowCanvas(false);
  }, [activeCtx, ctx.welcome, clearCanvas]);

  /* ── Key handler ───────────────────────────────────────────────── */

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  /* ── Filtered canvas items ─────────────────────────────────────── */

  const filteredItems = canvasItems.filter(item => {
    if (canvasTab === 'posts') return item.type === 'text';
    if (canvasTab === 'images') return item.type === 'image';
    return false;
  });

  const activeItem = selectedItemId
    ? filteredItems.find(i => i.id === selectedItemId) || filteredItems[0] || null
    : filteredItems[0] || null;

  /* ── Render helpers ────────────────────────────────────────────── */

  const selectedModel = ctx.models.find(m => m.id === model);

  const renderMarkdown = (text: string) => {
    return text.split(/(\*\*.*?\*\*)/g).map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} style={{ color: T.white, fontWeight: 400 }}>{part.slice(2, -2)}</strong>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  const canvasVisible = ctx.hasCanvas && showCanvas;

  /* ══════════════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════════════ */

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', background: T.bg, color: T.text, overflow: 'hidden' }}>

      {/* ── Page Header ───────────────────────────────────────────── */}
      <div style={{ padding: '16px 20px 0', flexShrink: 0 }}>
        <PageHeader title="Creative Studio" />
      </div>

      {/* ── Header bar ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 20px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>

        {/* Context label */}
        <span style={{ fontSize: 12, fontWeight: 300, color: T.textSec, letterSpacing: '0.02em' }}>
          Social Media
        </span>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Compact model selector */}
          <div ref={modelRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setModelOpen(!modelOpen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 6,
                border: `1px solid ${T.border}`,
                background: 'transparent',
                color: T.textMuted,
                fontSize: 11,
                fontWeight: 300,
                cursor: 'pointer',
              }}
            >
              <span>{selectedModel?.name || model}</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                style={{ transform: modelOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {modelOpen && (
              <div style={{
                position: 'absolute',
                right: 0,
                top: '100%',
                marginTop: 4,
                width: 240,
                maxHeight: 320,
                overflowY: 'auto',
                background: theme.surfaceBg,
                border: `1px solid ${T.border}`,
                borderRadius: 10,
                boxShadow: '0 16px 32px rgba(0,0,0,0.5)',
                zIndex: 50,
                padding: '4px 0',
              }}>
                {ctx.models.map(m => (
                  <button
                    key={m.id}
                    onClick={() => { setModel(m.id); setModelOpen(false); }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 12px',
                      background: m.id === model ? T.accentDim : 'transparent',
                      color: m.id === model ? T.text : T.textSec,
                      fontSize: 12,
                      fontWeight: 300,
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span>{m.name}</span>
                    <span style={{ fontSize: 10, color: T.textMuted, fontWeight: 300 }}>
                      {m.provider}{m.tag ? ` · ${m.tag}` : ''}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Clear button */}
          {messages.length > (ctx.welcome ? 1 : 0) && (
            <button
              onClick={clearChat}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: `1px solid ${T.border}`,
                background: 'transparent',
                color: T.textMuted,
                fontSize: 11,
                fontWeight: 300,
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Main content: Chat + Canvas ─────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── CHAT PANEL ──────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: canvasVisible ? '0 0 60%' : '1 1 auto', minWidth: 0, overflow: 'hidden', borderRight: canvasVisible ? `1px solid ${T.border}` : 'none' }}>

          {/* Messages area */}
          <div
            ref={chatContainerRef}
            style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 10px' }}
          >
            {/* Empty state with compact pill prompts */}
            {messages.length === 0 && !loading && ctx.prompts.length > 0 && (
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                  <h2 style={{ fontSize: 16, fontWeight: 300, color: T.text, marginBottom: 6 }}>{ctx.label}</h2>
                  <p style={{ fontSize: 12, fontWeight: 300, color: T.textMuted, maxWidth: 400, margin: '0 auto 16px' }}>
                    Chat with Ava in {ctx.label} mode
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
                    {ctx.prompts.slice(0, 4).map(s => (
                      <button
                        key={s.prompt}
                        onClick={() => send(s.prompt)}
                        style={{
                          padding: '6px 14px',
                          borderRadius: 9999,
                          border: 'none',
                          background: T.bgCard,
                          color: T.textSec,
                          fontSize: 12,
                          fontWeight: 300,
                          cursor: 'pointer',
                        }}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Message list */}
            {messages.map(msg => (
              <div key={msg.id} style={{ marginBottom: 12, display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                {msg.role === 'user' ? (
                  <div style={{
                    maxWidth: '75%',
                    padding: '8px 14px',
                    borderRadius: '14px 14px 4px 14px',
                    background: T.purpleBg,
                    color: T.white,
                    fontSize: 13,
                    fontWeight: 300,
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                  }}>
                    {msg.content}
                  </div>
                ) : (
                  <div style={{ maxWidth: '85%' }}>
                    {/* Tool log — collapsed by default */}
                    {msg.toolLog && msg.toolLog.length > 0 && (
                      <div style={{ marginBottom: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {msg.toolLog.map((tool, j) => {
                          const toolKey = `${msg.id}-${j}`;
                          const isExpanded = expandedTools[toolKey];
                          const isComplete = tool.result !== undefined;
                          return (
                            <div key={j} style={{ borderRadius: 6, background: T.bgInput, fontSize: 10 }}>
                              <button
                                onClick={() => setExpandedTools(prev => ({ ...prev, [toolKey]: !isExpanded }))}
                                style={{
                                  display: 'flex',
                                  width: '100%',
                                  alignItems: 'center',
                                  gap: 6,
                                  padding: '4px 8px',
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  color: T.textMuted,
                                  textAlign: 'left',
                                  fontWeight: 300,
                                  fontSize: 10,
                                }}
                              >
                                {isComplete ? (
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth={2.5}>
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                ) : (
                                  <div style={{ width: 10, height: 10, borderRadius: '50%', border: `2px solid ${T.border}`, borderTopColor: T.accent, animation: 'spin 1s linear infinite' }} />
                                )}
                                <span>{TOOL_LABELS[tool.name] || tool.name}</span>
                                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={T.textMuted} strokeWidth={2}
                                  style={{ marginLeft: 'auto', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
                                  <polyline points="9 18 15 12 9 6" />
                                </svg>
                              </button>
                              {isExpanded && (
                                <div style={{ borderTop: `1px solid ${T.border}`, padding: '6px 8px' }}>
                                  <p style={{ fontSize: 10, color: T.textMuted, marginBottom: 4, fontWeight: 300 }}>Arguments</p>
                                  <pre style={{ fontSize: 10, fontWeight: 300, color: T.textSec, background: theme.surfaceBg, padding: 6, borderRadius: 4, overflow: 'auto', maxHeight: 100, margin: '0 0 4px', whiteSpace: 'pre-wrap' }}>
                                    {JSON.stringify(tool.args, null, 2)}
                                  </pre>
                                  {tool.result !== undefined && (
                                    <>
                                      <p style={{ fontSize: 10, color: T.textMuted, marginBottom: 4, fontWeight: 300 }}>Result</p>
                                      <pre style={{ fontSize: 10, fontWeight: 300, color: T.textSec, background: theme.surfaceBg, padding: 6, borderRadius: 4, overflow: 'auto', maxHeight: 120, margin: 0, whiteSpace: 'pre-wrap' }}>
                                        {typeof tool.result === 'string' ? tool.result : JSON.stringify(tool.result, null, 2)}
                                      </pre>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Bubble */}
                    <div style={{
                      padding: '8px 14px',
                      borderRadius: '14px 14px 14px 4px',
                      background: msg.isError ? T.redBg : T.bgCard,
                      color: msg.isError ? '#fca5a5' : T.text,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 400, color: T.text }}>Ava</span>
                        <span style={{
                          fontSize: 9,
                          fontWeight: 300,
                          padding: '1px 5px',
                          borderRadius: 4,
                          background: ctx.badgeBg,
                          color: ctx.badgeText,
                          letterSpacing: '0.05em',
                        }}>
                          {ctx.badge}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 300, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                        {renderMarkdown(msg.content)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Live tool log while loading */}
            {loading && liveToolLog.length > 0 && (
              <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 4, maxWidth: '85%' }}>
                {liveToolLog.map((tool, j) => {
                  const isComplete = tool.result !== undefined;
                  return (
                    <div key={j} style={{ borderRadius: 6, background: T.bgInput, fontSize: 10, fontWeight: 300, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {isComplete ? (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth={2.5}>
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <div style={{ width: 10, height: 10, borderRadius: '50%', border: `2px solid ${T.border}`, borderTopColor: T.accent, animation: 'spin 1s linear infinite' }} />
                      )}
                      <span style={{ color: T.textMuted }}>{TOOL_LABELS[tool.name] || tool.name}</span>
                      {typeof tool.result === 'string' && (
                        <span style={{ color: T.textMuted, marginLeft: 4, fontSize: 9 }}>{tool.result}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Loading dots */}
            {loading && liveToolLog.length === 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  borderRadius: '14px 14px 14px 4px',
                  background: T.bgCard,
                }}>
                  <span style={{ fontSize: 12, fontWeight: 300, color: T.text }}>Ava</span>
                  <span style={{
                    fontSize: 9, fontWeight: 300, padding: '1px 5px', borderRadius: 4,
                    background: ctx.badgeBg, color: ctx.badgeText, letterSpacing: '0.05em',
                  }}>{ctx.badge}</span>
                  <span style={{ display: 'flex', gap: 3, marginLeft: 4 }}>
                    {[0, 1, 2].map(i => (
                      <span key={i} style={{
                        width: 5, height: 5, borderRadius: '50%', background: T.accent,
                        animation: `bounce 1.2s infinite ${i * 0.15}s`,
                      }} />
                    ))}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 300, color: T.textMuted, marginLeft: 4 }}>Thinking...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ── Input bar ───────────────────────────────────────────── */}
          <div style={{ flexShrink: 0, borderTop: `1px solid ${T.border}`, padding: '10px 20px' }}>
            {/* Compact quick prompts — horizontal pill row */}
            {ctx.prompts.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {ctx.prompts.map((qp, i) => (
                  <button
                    key={i}
                    onClick={() => send(qp.prompt)}
                    disabled={loading}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 9999,
                      border: 'none',
                      background: T.bgCard,
                      color: T.textMuted,
                      fontSize: 12,
                      fontWeight: 300,
                      cursor: loading ? 'not-allowed' : 'pointer',
                      opacity: loading ? 0.3 : 1,
                      transition: 'color 0.15s',
                    }}
                  >
                    {qp.label}
                  </button>
                ))}
              </div>
            )}

            {/* Text input + send */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => {
                  setInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
                }}
                onKeyDown={handleKeyDown}
                placeholder={ctx.placeholder}
                disabled={loading}
                rows={1}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: `1px solid ${T.border}`,
                  background: T.bgInput,
                  color: T.text,
                  fontSize: 13,
                  fontWeight: 300,
                  resize: 'none',
                  outline: 'none',
                  maxHeight: 100,
                  lineHeight: 1.5,
                  fontFamily: 'inherit',
                  opacity: loading ? 0.5 : 1,
                }}
                onFocus={e => { e.target.style.borderColor = T.accent; }}
                onBlur={e => { e.target.style.borderColor = T.border; }}
              />
              <button
                onClick={() => send()}
                disabled={!input.trim() || loading}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: T.purpleBg,
                  color: T.white,
                  fontSize: 12,
                  fontWeight: 300,
                  cursor: (!input.trim() || loading) ? 'not-allowed' : 'pointer',
                  opacity: (!input.trim() || loading) ? 0.3 : 1,
                  flexShrink: 0,
                }}
              >
                Send
              </button>
            </div>
          </div>
        </div>

        {/* ── CANVAS PANEL — auto-hidden, shown on first content ────── */}
        {canvasVisible && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: '0 0 40%', background: theme.surfaceBg, overflow: 'hidden' }}>

            {/* Canvas header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 300, color: T.textSec }}>Canvas</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {canvasItems.length > 0 && (
                  <button
                    onClick={clearCanvas}
                    style={{ fontSize: 10, fontWeight: 300, color: T.textMuted, background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    Clear all
                  </button>
                )}
                <button
                  onClick={() => setShowCanvas(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, padding: 2, display: 'flex', alignItems: 'center' }}
                  title="Close canvas"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Canvas tabs: Posts / Images */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
              {(['posts', 'images'] as CanvasTab[]).map(tab => {
                const labels: Record<CanvasTab, string> = { posts: 'Posts', images: 'Images' };
                const counts: Record<CanvasTab, number> = {
                  posts: canvasItems.filter(i => i.type === 'text').length,
                  images: canvasItems.filter(i => i.type === 'image').length,
                };
                const isActive = canvasTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setCanvasTab(tab)}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      padding: '8px 0',
                      fontSize: 11,
                      fontWeight: 300,
                      background: 'none',
                      border: 'none',
                      borderBottom: `1px solid ${isActive ? T.accent : 'transparent'}`,
                      color: isActive ? T.text : T.textMuted,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {labels[tab]}
                    {counts[tab] > 0 && (
                      <span style={{
                        fontSize: 9,
                        fontWeight: 300,
                        padding: '1px 5px',
                        borderRadius: 8,
                        background: T.bgInput,
                        color: T.textMuted,
                      }}>
                        {counts[tab]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Canvas content */}
            <>
              {/* Item tabs */}
              {filteredItems.length > 1 && (
                <div style={{ display: 'flex', gap: 4, padding: '6px 14px', borderBottom: `1px solid ${T.border}`, overflowX: 'auto', flexShrink: 0 }}>
                  {filteredItems.map((item, i) => {
                    const isActive = (selectedItemId || filteredItems[0]?.id) === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setSelectedItemId(item.id)}
                        style={{
                          flexShrink: 0,
                          padding: '3px 8px',
                          borderRadius: 6,
                          fontSize: 10,
                          fontWeight: 300,
                          border: 'none',
                          background: isActive ? T.purpleBg : T.bgCard,
                          color: isActive ? T.white : T.textMuted,
                          cursor: 'pointer',
                        }}
                      >
                        #{filteredItems.length - i}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Active item content */}
              {activeItem ? (
                activeItem.type === 'text' ? (
                  /* ── Post view — tighter, no colour backgrounds ──── */
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                    {/* Platform badge row — subtle text badges */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          fontSize: 10,
                          fontWeight: 300,
                          color: T.textMuted,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}>
                          {PLATFORM_LABELS[activeItem.platform] || activeItem.platform}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 300, color: T.textMuted }}>{activeItem.content.length} chars</span>
                        {PLATFORM_LIMITS[activeItem.platform] && activeItem.content.length <= PLATFORM_LIMITS[activeItem.platform] && (
                          <span style={{ fontSize: 10, fontWeight: 300, color: T.green }}>Ready</span>
                        )}
                        {PLATFORM_LIMITS[activeItem.platform] && activeItem.content.length > PLATFORM_LIMITS[activeItem.platform] && (
                          <span style={{ fontSize: 10, fontWeight: 300, color: T.red }}>+{activeItem.content.length - PLATFORM_LIMITS[activeItem.platform]} over</span>
                        )}
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 300, color: T.textMuted }}>
                        {activeItem.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {activeItem.title && (
                      <div style={{ padding: '6px 14px', borderBottom: `1px solid ${T.border}` }}>
                        <h3 style={{ fontSize: 13, fontWeight: 400, color: T.text, margin: 0 }}>{activeItem.title}</h3>
                      </div>
                    )}

                    {/* Content */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
                      <div style={{ fontSize: 13, fontWeight: 300, color: T.text, lineHeight: 1.7, whiteSpace: 'pre-wrap', userSelect: 'all' }}>
                        {activeItem.content}
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 6, padding: '10px 14px', borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
                      <button
                        onClick={() => copyCanvasItem(activeItem.id)}
                        style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          padding: '6px 0',
                          borderRadius: 6,
                          border: 'none',
                          background: activeItem.copied ? T.green : T.purpleBg,
                          color: T.white,
                          fontSize: 12,
                          fontWeight: 300,
                          cursor: 'pointer',
                        }}
                      >
                        {activeItem.copied ? 'Copied' : 'Copy'}
                      </button>
                      <button
                        onClick={() => removeCanvasItem(activeItem.id)}
                        style={{
                          padding: '6px 8px',
                          borderRadius: 6,
                          border: `1px solid ${T.border}`,
                          background: 'none',
                          color: T.textMuted,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        title="Remove"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── Image view — clean, no pulsing ────────────── */
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                    <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
                      {activeItem.imageUrl ? (
                        <div>
                          <img
                            src={activeItem.imageUrl}
                            alt={activeItem.imagePrompt || 'Generated image'}
                            style={{ width: '100%', borderRadius: 8 }}
                          />
                          {activeItem.imagePrompt && (
                            <p style={{ fontSize: 11, fontWeight: 300, color: T.textMuted, fontStyle: 'italic', marginTop: 8 }}>{activeItem.imagePrompt}</p>
                          )}
                        </div>
                      ) : (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          height: 180,
                          borderRadius: 8,
                          background: T.bgInput,
                        }}>
                          <p style={{ fontSize: 12, fontWeight: 300, color: T.textMuted }}>
                            {activeItem.content || 'Generating image...'}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 6, padding: '10px 14px', borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
                      {activeItem.imageUrl && (
                        <a
                          href={activeItem.imageUrl}
                          download={`ava-image-${Date.now()}.png`}
                          style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                            padding: '6px 0',
                            borderRadius: 6,
                            background: T.purpleBg,
                            color: T.white,
                            fontSize: 12,
                            fontWeight: 300,
                            textDecoration: 'none',
                          }}
                        >
                          Download
                        </a>
                      )}
                      <button
                        onClick={() => removeCanvasItem(activeItem.id)}
                        style={{
                          padding: '6px 8px',
                          borderRadius: 6,
                          border: `1px solid ${T.border}`,
                          background: 'none',
                          color: T.textMuted,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        title="Remove"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )
              ) : (
                /* ── Empty state — no emoji ──────────────────────── */
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
                  <p style={{ fontSize: 12, fontWeight: 300, color: T.textMuted }}>
                    {canvasTab === 'posts'
                      ? 'Ask Ava to write a post, tweet, or article'
                      : 'Ask Ava to generate an image or graphic'
                    }
                  </p>
                </div>
              )}
            </>
          </div>
        )}
      </div>

      {/* ── Keyframe animations ──────────────────────────────────────── */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: ${T.borderHi}; }
      `}</style>
    </div>
  );
}
