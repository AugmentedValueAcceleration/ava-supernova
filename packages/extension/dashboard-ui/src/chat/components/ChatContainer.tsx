import type { RefObject } from 'react';
import type { UIMessage } from '../../types/messages';
import { MessageBubble } from './MessageBubble';
import { ThinkingIndicator } from './ThinkingIndicator';
import { PersonaStatus } from './PersonaStatus';
import { Icon } from '../../components/Icon';
// ContextBar is rendered by Chat.tsx above the composer — not in here anymore
import { t, useLocale } from '../../i18n';

interface PersonaInfo {
  id: string;
  phase: 'active' | 'complete' | 'error';
  description?: string;
  output?: string;
  tools?: Array<{ name: string; done: boolean; success?: boolean }>;
}

interface ChatContainerProps {
  messages: UIMessage[];
  isThinking: boolean;
  /** What Ava is actually doing right now. Undefined means the surface
   *  knows nothing more specific, and the indicator says so. */
  thinkingLabel?: string;
  conductorActive?: boolean;
  conductorMode?: string | null;
  activePersonas?: PersonaInfo[];
  onConfirmation: (confirmationId: string, approved: boolean, alwaysAllowCategory?: boolean, planSelection?: string, userResponse?: string) => void;
  onContinue: () => void;
  onSuggestion: (prompt: string) => void;
  onRate?: (messageId: string, rating: 'up' | 'down', reason?: string, note?: string) => void;
  chatEndRef: RefObject<HTMLDivElement | null>;
  needsSetup?: boolean;
  initialized?: boolean;
  onOpenDashboard?: () => void;
  activeModel?: string | null;
  models?: Array<{ id: string; name: string; provider: string }>;
  /** Operator's first name — drives the time-of-day-aware seeded
   *  welcome bubble AND the user-avatar initials fallback. */
  userName?: string | null;
  /** User's avatar URL from auth (Supabase users.avatar_url). */
  userAvatarUrl?: string | null;
  // Context bar (v0.39.x) — replaces the circular chip in InputArea.
  contextUsage?: { used: number; limit: number; percent: number } | null;
  isCompressing?: boolean;
  isStreaming?: boolean;
  onCompress?: () => void;
  /** Conversation lane — 'health' swaps the empty-state greeting + starter
   *  chips for the Ava Health & Fitness room (plans/training/nutrition), and
   *  drops the mode-switch tip (the room is locked to health). */
  lane?: 'main' | 'health' | 'learning' | 'design';
  /** For the design lane: which Design Studio room the operator is standing in.
   *  Drives the room-aware greeting, starter chips and heading so the Design
   *  Architect reflects the active Open-Canvas view (Video / Voiceover) instead
   *  of always greeting about icons. Defaults to 'icon'. */
  designRoom?: 'icon' | 'video' | 'voice' | 'image' | 'logo';
}

// SUGGESTIONS / CAPABILITIES / MODE_INFO arrays removed — they backed
// the previous multi-card welcome screen which has been retired to
// match the IDE's single-seeded-message empty state. Props onSuggestion
// / activeModel / models stay in ChatContainerProps for caller
// compatibility but are no longer destructured here.

export function ChatContainer({ messages, isThinking, thinkingLabel, onConfirmation, onContinue, onRate, chatEndRef, initialized, conductorActive, conductorMode, activePersonas, onSuggestion, userName, userAvatarUrl, lane = 'main', designRoom = 'icon' }: ChatContainerProps) {
  useLocale();
  // Don't render welcome screen until init message arrives — prevents setup banner flash
  if (!initialized && messages.length === 0) {
    return <div className="flex-1" />;
  }

  // Empty-state branch fires until the user's first turn. Ambient messages
  // (model-switch notices, daily briefing, tick-engine nudges) push
  // assistant/system rows into state but don't count as the user starting
  // a conversation — gate on `hasUserSpoken` so those don't drop the
  // helper card on first touch. Mirrors the webview-ui chat panel.
  // A NEW chat, not merely "the user has not spoken yet". The old test asked
  // whether any message had role 'user', so a live conversation whose user
  // turns were compressed away or restored differently read as untouched and
  // the starter card reappeared under it mid-work. The seeded welcome is
  // rendered separately and is not in `messages`, so an empty list is the
  // new-chat state and nothing else is. Mirrors webview-ui.
  const isNewChat = messages.length === 0;
  if (isNewChat && !isThinking) {
    const seededWelcome = {
      id: 'welcome-seed',
      role: 'assistant' as const,
      content: buildSeededWelcome(userName ?? null, lane, designRoom),
      isStreaming: false,
      timestamp: Date.now(),
    } as unknown as typeof messages[number];

    return (
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="w-full space-y-3">
          {/* Setup banner removed 2026-04-29. Model picker now carries
              the unlock guidance ("Add Qwen key", "Connect or add
              DeepSeek + Qwen keys", etc.) per the mode-availability
              redesign — this banner duplicated that and shipped stale
              "3M free Qwen tokens" copy from before the credit
              rebalance. The picker is the canonical setup surface now. */}
          <MessageBubble message={seededWelcome} onConfirmation={onConfirmation} />
          {messages.map((msg, i) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onConfirmation={onConfirmation}
              onContinue={msg.role === 'error' && i === messages.length - 1 ? onContinue : undefined}
              onRate={msg.role === 'assistant' ? onRate : undefined}
              userAvatarUrl={userAvatarUrl}
              userName={userName}
            />
          ))}
          <StarterHelper onSuggestion={onSuggestion} lane={lane} designRoom={designRoom} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* ContextBar moved out — Chat.tsx renders it between the message
          list and the composer so the gauge is right where typing happens. */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3" role="log" aria-label={t('dash.chat.messages_log')} aria-live="polite">
        {messages.map((msg, i) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onConfirmation={onConfirmation}
            onContinue={msg.role === 'error' && i === messages.length - 1 ? onContinue : undefined}
            onRate={msg.role === 'assistant' ? onRate : undefined}
          />
        ))}
        {(conductorActive || (activePersonas && activePersonas.length > 0)) && (
          <PersonaStatus
            active={conductorActive || false}
            mode={conductorMode}
            personas={activePersonas || []}
          />
        )}
        {isThinking && <ThinkingIndicator label={thinkingLabel} />}
        <div ref={chatEndRef} />
      </div>
    </div>
  );
}

/**
 * Time-of-day-aware seeded welcome from Ava. First-person, warm, knows
 * the operator's name when the account has loaded. Mirrors the writing
 * voice of Ava elsewhere — partner, not chatbot.
 *
 * Buckets:
 *   05–11  → Morning (energetic, "what are we tackling today?")
 *   12–17  → Afternoon (mid-day, momentum)
 *   18–22  → Evening (winding down, "what are we wrapping up?")
 *   23–04  → Late / early hours (acknowledged, gentler)
 *
 * Date is appended in conversational form ("Tuesday") rather than full
 * ISO so it reads like a human picking up a conversation.
 */
function buildSeededWelcome(userName: string | null, lane: 'main' | 'health' | 'learning' | 'design' = 'main', designRoom: 'icon' | 'video' | 'voice' | 'image' | 'logo' = 'icon'): string {
  const now = new Date();
  const h = now.getHours();
  const day = now.toLocaleDateString('en-GB', { weekday: 'long' });
  const name = userName ? `, ${userName}` : '';

  // The Ava Health room has its own warm, health-scoped greeting — no code talk.
  if (lane === 'health') {
    return t('health.room.greeting', { name });
  }
  // The Learning room greets around what they want to learn — no code talk.
  if (lane === 'learning') {
    return t('learning.room.greeting', { name });
  }
  // The Design Studio room — Ava as the Design Architect. No code talk. The
  // greeting follows the operator into the Open Canvas: filming in the Video
  // room, voicing in the Voiceover room, else the default icon studio.
  if (lane === 'design') {
    if (designRoom === 'video') {
      return `Hey${name} — Design Architect here, and we're on the Open Canvas. What are we filming? Give me the shot — subject, mood, the motion you want — and I'll direct it and render it right here.`;
    }
    if (designRoom === 'voice') {
      return `Hey${name} — Design Architect here, on the Open Canvas. What are we voicing? Tell me the read and the voice you want — I'll write the script, direct the delivery, and voice it. I can translate it too, in the same voice.`;
    }
    if (designRoom === 'image') {
      return `Hey${name} — Design Architect here, on the Open Canvas. What are we making? Describe the image — subject, style, mood — and I'll compose it and render it right here.`;
    }
    if (designRoom === 'logo') {
      return `Hey${name} — Design Architect here, and this is the big one: your brand's identity. A logo isn't one picture, it's a system — so let's design it properly. Tell me about the brand: what does it do, who's it for, and what should it feel like? Or just say the word and I'll work from your brand kit. And here's the real question — what's the one idea the mark should carry? The best ones say a lot with a little.`;
    }
    return `Hey${name} — your Design Architect here. What are we making? An icon, a whole set, a logo? Tell me the vibe and I'll design it with you, on brand.`;
  }

  if (h >= 5 && h < 12) {
    return t('dash.chat.greeting.morning', { name, day });
  }
  if (h >= 12 && h < 18) {
    return t('dash.chat.greeting.afternoon', { name, day });
  }
  if (h >= 18 && h < 23) {
    return t('dash.chat.greeting.evening', { name });
  }
  // Late hours — softer, acknowledges the time
  return userName
    ? t('dash.chat.greeting.late_named', { name })
    : t('dash.chat.greeting.late_anon');
}

/**
 * Empty-state helper card — six clickable starter chips, one per mode,
 * shown alongside the seeded welcome bubble until the user sends their
 * first message. Clicking a chip calls `onSuggestion(prompt)` which
 * (per Chat.tsx) prefills the input rather than auto-sending so the user
 * can edit before firing. Surfaces all seven modes so brand-new users
 * discover the mindset framework without reading docs.
 *
 * Visual: subtle gradient background, animated entrance, hover-lift on
 * chips with prefix-coloured tokens so the modes are recognisable on
 * sight. Aim is "warm partner" not "onboarding tooltip".
 */
function StarterHelper({ onSuggestion, lane = 'main', designRoom = 'icon' }: { onSuggestion: (prompt: string) => void; lane?: 'main' | 'health' | 'learning' | 'design'; designRoom?: 'icon' | 'video' | 'voice' | 'image' | 'logo' }) {
  useLocale();
  const isHealth = lane === 'health';
  const isLearning = lane === 'learning';
  const isDesign = lane === 'design';
  // Design room: plain-prompt chips (no mode prefix — the room is Ava's design
  // hat). They prefill the composer so the user can edit before sending. The
  // set follows the operator into the Open Canvas (Video / Voiceover).
  const iconChips: { label: string; prefix: React.ReactNode; prompt: string; color: string }[] = [
    { label: t('ext.chat.starter.icon.1_l'), prefix: '✦', prompt: t('ext.chat.starter.icon.1_p'), color: 'var(--accent)' },
    { label: t('ext.chat.starter.icon.2_l'), prefix: '✦', prompt: t('ext.chat.starter.icon.2_p'), color: '#f9e2af' },
    { label: t('ext.chat.starter.icon.3_l'), prefix: '✦', prompt: t('ext.chat.starter.icon.3_p'), color: '#60a5fa' },
    { label: t('ext.chat.starter.icon.4_l'), prefix: '✦', prompt: t('ext.chat.starter.icon.4_p'), color: '#94e2d5' },
  ];
  const videoChips: { label: string; prefix: React.ReactNode; prompt: string; color: string }[] = [
    { label: t('ext.chat.starter.video.1_l'), prefix: '✦', prompt: t('ext.chat.starter.video.1_p'), color: 'var(--accent)' },
    { label: t('ext.chat.starter.video.2_l'), prefix: '✦', prompt: t('ext.chat.starter.video.2_p'), color: '#f9e2af' },
    { label: t('ext.chat.starter.video.3_l'), prefix: '✦', prompt: t('ext.chat.starter.video.3_p'), color: '#60a5fa' },
    { label: t('ext.chat.starter.video.4_l'), prefix: '✦', prompt: t('ext.chat.starter.video.4_p'), color: '#94e2d5' },
  ];
  const voiceChips: { label: string; prefix: React.ReactNode; prompt: string; color: string }[] = [
    { label: t('ext.chat.starter.voice.1_l'), prefix: '✦', prompt: t('ext.chat.starter.voice.1_p'), color: 'var(--accent)' },
    { label: t('ext.chat.starter.voice.2_l'), prefix: '✦', prompt: t('ext.chat.starter.voice.2_p'), color: '#f9e2af' },
    { label: t('ext.chat.starter.voice.3_l'), prefix: '✦', prompt: t('ext.chat.starter.voice.3_p'), color: '#60a5fa' },
    { label: t('ext.chat.starter.voice.4_l'), prefix: '✦', prompt: t('ext.chat.starter.voice.4_p'), color: '#94e2d5' },
  ];
  const imageChips: { label: string; prefix: React.ReactNode; prompt: string; color: string }[] = [
    { label: t('ext.chat.starter.image.1_l'), prefix: '✦', prompt: t('ext.chat.starter.image.1_p'), color: 'var(--accent)' },
    { label: t('ext.chat.starter.image.2_l'), prefix: '✦', prompt: t('ext.chat.starter.image.2_p'), color: '#f9e2af' },
    { label: t('ext.chat.starter.image.3_l'), prefix: '✦', prompt: t('ext.chat.starter.image.3_p'), color: '#60a5fa' },
    { label: t('ext.chat.starter.image.4_l'), prefix: '✦', prompt: t('ext.chat.starter.image.4_p'), color: '#94e2d5' },
  ];
  const logoChips: { label: string; prefix: React.ReactNode; prompt: string; color: string }[] = [
    { label: t('ext.chat.starter.logo.1_l'), prefix: '✦', prompt: t('ext.chat.starter.logo.1_p'), color: 'var(--accent)' },
    { label: t('ext.chat.starter.logo.2_l'), prefix: '✦', prompt: t('ext.chat.starter.logo.2_p'), color: '#f9e2af' },
    { label: t('ext.chat.starter.logo.3_l'), prefix: '✦', prompt: t('ext.chat.starter.logo.3_p'), color: '#60a5fa' },
    { label: t('ext.chat.starter.logo.4_l'), prefix: '✦', prompt: t('ext.chat.starter.logo.4_p'), color: '#94e2d5' },
  ];
  const designChips = designRoom === 'video' ? videoChips : designRoom === 'voice' ? voiceChips : designRoom === 'image' ? imageChips : designRoom === 'logo' ? logoChips : iconChips;
  // Health room: plain-prompt chips (no mode prefix — the room is locked to
  // health). They prefill the composer so the user can edit before sending.
  const healthChips: { label: string; prefix: React.ReactNode; prompt: string; color: string }[] = [
    { label: t('health.room.starter.fitness'),  prefix: <Icon.fitness size={14} />,   prompt: t('health.room.starter.fitness_prompt'),  color: 'var(--accent)' },
    { label: t('health.room.starter.meal'),     prefix: <Icon.meal size={14} />,      prompt: t('health.room.starter.meal_prompt'),     color: '#f59e0b' },
    { label: t('health.room.starter.combined'), prefix: <Icon.streak size={14} />,    prompt: t('health.room.starter.combined_prompt'), color: '#34d399' },
    { label: t('health.room.starter.injury'),   prefix: <Icon.injury size={14} />,    prompt: t('health.room.starter.injury_prompt'),   color: '#60a5fa' },
    { label: t('health.room.starter.nutrition'),prefix: <Icon.nutrition size={14} />, prompt: t('health.room.starter.nutrition_prompt'),color: '#94e2d5' },
    { label: t('health.room.starter.exercise'), prefix: <Icon.run size={14} />,       prompt: t('health.room.starter.exercise_prompt'), color: '#f38ba8' },
  ];
  // Learning room: plain-prompt chips (no mode prefix — the room is locked to
  // Teach). They prefill the composer so the user can edit before sending.
  const learningChips: { label: string; prefix: React.ReactNode; prompt: string; color: string }[] = [
    { label: t('learning.room.starter.learn'),   prefix: <Icon.course size={14} />, prompt: t('learning.room.starter.learn_prompt'),   color: 'var(--accent)' },
    { label: t('learning.room.starter.course'),  prefix: <Icon.books size={14} />,  prompt: t('learning.room.starter.course_prompt'),  color: '#f9e2af' },
    { label: t('learning.room.starter.resume'),  prefix: <Icon.play size={14} />,   prompt: t('learning.room.starter.resume_prompt'),  color: '#34d399' },
    { label: t('learning.room.starter.explain'), prefix: <Icon.idea size={14} />,   prompt: t('learning.room.starter.explain_prompt'), color: '#60a5fa' },
  ];
  const codeChips: { label: string; prefix: React.ReactNode; prompt: string; color: string }[] = [
    { label: t('dash.chat.starter.explain'),    prefix: '>>', prompt: t('dash.chat.starter.explain_prompt'),    color: 'var(--accent)' },
    { label: t('dash.chat.starter.plan'),        prefix: '::', prompt: t('dash.chat.starter.plan_prompt'),        color: '#60a5fa' },
    { label: t('dash.chat.starter.teach'),       prefix: '??', prompt: t('dash.chat.starter.teach_prompt'),       color: '#f9e2af' },
    { label: t('dash.chat.starter.audit'),       prefix: '!!', prompt: t('dash.chat.starter.audit_prompt'),       color: '#f38ba8' },
    { label: t('dash.chat.starter.brainstorm'),  prefix: '**', prompt: t('dash.chat.starter.brainstorm_prompt'),  color: '#94e2d5' },
    { label: t('dash.chat.starter.chat'),        prefix: '..', prompt: '.. ',                                     color: '#a6adc8' },
  ];
  const chips = isHealth ? healthChips : isLearning ? learningChips : isDesign ? designChips : codeChips;
  // Design heading follows the room: Direct (video) / Voice (voiceover) / Design (icon).
  const designHeading = designRoom === 'video' ? 'Direct with Ava' : designRoom === 'voice' ? 'Voice with Ava' : designRoom === 'image' ? 'Compose with Ava' : designRoom === 'logo' ? 'Design your logo with Ava' : 'Design with Ava';

  return (
    <div
      className="rounded-2xl p-5 mt-3 ava-starter-card"
      style={{
        background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 8%, transparent) 0%, rgba(96, 165, 250, 0.04) 100%)',
        border: '1px solid color-mix(in srgb, var(--accent) 22%, transparent)',
        boxShadow: '0 4px 20px color-mix(in srgb, var(--accent) 8%, transparent)',
      }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span style={{ color: 'var(--accent)', fontSize: 14 }}>✦</span>
        <div className="text-sm font-semibold" style={{ color: '#cdd6f4' }}>{isHealth ? t('health.room.starter.heading') : isLearning ? t('learning.room.starter.heading') : isDesign ? designHeading : t('dash.chat.starter.heading')}</div>
      </div>
      <p className="text-[12px] leading-relaxed mb-4" style={{ color: '#a6adc8' }}>
        {isHealth ? t('health.room.starter.subheading') : isLearning ? t('learning.room.starter.subheading') : isDesign ? "Tell me what you're making and your brand — I'll design it with you." : t('dash.chat.starter.subheading')}
      </p>
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c.label}
            onClick={() => onSuggestion(c.prompt)}
            className="ava-starter-chip text-[12px] px-3 py-1.5 rounded-lg flex items-center gap-1.5"
            style={{
              background: 'rgba(26, 16, 40, 0.5)',
              border: `1px solid ${c.color}33`,
              color: '#cdd6f4',
              transition: 'transform 0.12s ease, background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = `${c.color}1c`;
              e.currentTarget.style.borderColor = `${c.color}66`;
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(26, 16, 40, 0.5)';
              e.currentTarget.style.borderColor = `${c.color}33`;
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <span style={{ color: c.color, fontFamily: 'monospace', fontSize: 10, fontWeight: 700 }}>{c.prefix}</span>
            <span>{c.label}</span>
          </button>
        ))}
      </div>
      {!isHealth && !isLearning && !isDesign && (
        <p className="text-[10px] mt-4" style={{ color: '#6c7086' }}>
          {t('dash.chat.starter.tip_prefix')} <code style={{ color: 'var(--accent)' }}>{'>>'}</code> <code style={{ color: '#60a5fa' }}>::</code> <code style={{ color: '#a6adc8' }}>..</code> <code style={{ color: '#f9e2af' }}>??</code> <code style={{ color: '#f38ba8' }}>!!</code> <code style={{ color: '#94e2d5' }}>**</code> {t('dash.chat.starter.tip_suffix')}
        </p>
      )}
      <style>{`
        .ava-starter-card {
          animation: avaStarterFade 0.4s ease-out;
        }
        @keyframes avaStarterFade {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
