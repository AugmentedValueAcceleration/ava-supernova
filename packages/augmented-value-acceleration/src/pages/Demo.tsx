import { useState } from 'react';
import PageHeader from '../components/PageHeader';

interface Slide {
  title: string;
  subtitle: string;
  content: string[];
}

const SLIDES: Slide[] = [
  {
    title: 'Ava | Supernova',
    subtitle: 'The AI Operating System',
    content: [
      'Agentic coding agent for open-source LLMs',
      'CLI + VSCode Extension + Companion App + IDE',
      '54 tools across 6 intelligent modes',
      'Democratising agentic coding for everyone',
    ],
  },
  {
    title: 'The Problem',
    subtitle: 'AI coding tools are locked behind walls',
    content: [
      'Proprietary models with opaque pricing',
      'No real choice in providers or models',
      'Education and developer tooling are expensive',
      'Open-source models lack agentic capabilities',
    ],
  },
  {
    title: 'The Solution',
    subtitle: '6 Modes, 24 Specialists, 54 Tools',
    content: [
      'Work Mode: Full agentic coding with 54 tools',
      'Plan Mode: Architecture and read-only analysis',
      'Teach Mode: Free AI tutor with 5 specialists',
      'Chat Mode: Personal assistant with memory',
      'Security Mode: Vulnerability auditing pipeline',
      'Brainstorm Mode: Ideation with structured thinking',
    ],
  },
  {
    title: 'Traction',
    subtitle: 'Zero marketing, organic growth',
    content: [
      '858 VS Code installs in ~3 weeks',
      '1618% conversion rate on marketplace',
      '~45 installs/day and accelerating',
      'Users across all major timezones',
      'Community-driven feature requests',
    ],
  },
  {
    title: 'Business Model',
    subtitle: 'Give away the value, let them upgrade',
    content: [
      'Free tier: 3M tokens/month (Qwen models)',
      'Pro ($29/mo): Premium models, 50M tokens',
      'Ultra ($79/mo): All models, 200M tokens',
      'Enterprise ($249/mo): Custom, unlimited',
      'Token top-ups for burst usage',
    ],
  },
  {
    title: 'Technology',
    subtitle: 'Multi-provider, resilient architecture',
    content: [
      '6 providers: DeepSeek, Kimi, Qwen, Zhipu, Mistral, Anthropic',
      '12 models with automatic fallback chains',
      'Persona-driven orchestration (Conductor pattern)',
      'Local memory system with semantic recall',
      'Tauri desktop app for business operations',
    ],
  },
  {
    title: 'Roadmap',
    subtitle: 'The endgame is JARVIS',
    content: [
      'Phase 1: Coding agent (shipped)',
      'Phase 2: Business operating layer',
      'Phase 3: Personal AI assistant',
      'Phase 4: Health and wellness integration',
      'Phase 5: Full autonomous agent ecosystem',
    ],
  },
  {
    title: 'The Ask',
    subtitle: 'Invest in the future of AI',
    content: [
      'Seed round for scaling infrastructure',
      'Hire core team (3 engineers, 1 designer)',
      'Provider partnerships and volume pricing',
      'Marketing and community building',
      'Enterprise sales pipeline',
    ],
  },
];

export default function Demo() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const slide = SLIDES[currentSlide];

  const prev = () => setCurrentSlide(i => Math.max(0, i - 1));
  const next = () => setCurrentSlide(i => Math.min(SLIDES.length - 1, i + 1));

  return (
    <div style={{ padding: '32px 40px', overflowY: 'auto', height: '100%', background: '#0a0a1a', display: 'flex', flexDirection: 'column' }}>
      <PageHeader title="Investor Demo" subtitle={`Slide ${currentSlide + 1} of ${SLIDES.length}`}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={prev}
            disabled={currentSlide === 0}
            style={{
              background: '#111127', border: '1px solid #1f1f3a', borderRadius: 10,
              padding: '10px 20px', fontSize: 13, color: currentSlide === 0 ? '#3f3f46' : '#fff',
              cursor: currentSlide === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            Previous
          </button>
          <button
            onClick={next}
            disabled={currentSlide === SLIDES.length - 1}
            style={{
              background: currentSlide === SLIDES.length - 1 ? '#111127' : '#a855f7',
              border: currentSlide === SLIDES.length - 1 ? '1px solid #1f1f3a' : '1px solid #a855f7',
              borderRadius: 10,
              padding: '10px 20px', fontSize: 13, fontWeight: 600,
              color: currentSlide === SLIDES.length - 1 ? '#3f3f46' : '#fff',
              cursor: currentSlide === SLIDES.length - 1 ? 'not-allowed' : 'pointer',
            }}
          >
            Next
          </button>
        </div>
      </PageHeader>

      {/* Slide Progress */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 32 }}>
        {SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrentSlide(i)}
            style={{
              flex: 1, height: 4, borderRadius: 2, border: 'none', cursor: 'pointer',
              background: i === currentSlide ? '#a855f7' : i < currentSlide ? 'rgba(168, 85, 247, 0.4)' : '#1f1f3a',
              transition: 'background 0.2s',
            }}
          />
        ))}
      </div>

      {/* Slide Content */}
      <div style={{
        flex: 1, background: '#111127', border: '1px solid #1f1f3a', borderRadius: 20,
        padding: '60px 80px', display: 'flex', flexDirection: 'column', justifyContent: 'center',
        minHeight: 400,
      }}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase' as const, color: '#a855f7', marginBottom: 16 }}>
          AVA | SUPERNOVA
        </div>
        <h2 style={{ fontSize: 40, fontWeight: 800, color: '#fff', margin: '0 0 12px 0', lineHeight: 1.1 }}>
          {slide.title}
        </h2>
        <p style={{ fontSize: 18, color: '#9ca3af', margin: '0 0 40px 0' }}>
          {slide.subtitle}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {slide.content.map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%', background: '#a855f7',
                marginTop: 6, flexShrink: 0,
              }} />
              <span style={{ fontSize: 16, color: '#e5e7eb', lineHeight: 1.5 }}>{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Keyboard hint */}
      <div style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: '#3f3f46' }}>
        Click the progress bar to jump to any slide
      </div>
    </div>
  );
}
