import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import { theme, statCardStyle, inputStyle } from '../lib/theme';

/* ── Research-backed constants ───────────────────────────────────────────── */

// Market (2026 → 2030+):
//   AI Coding Tools:  $7.37B (2025) → $30.1B by 2032, 27.1% CAGR (GetPanto/Industry Reports)
//   AI in Education:  $9.58B (2026) → $136.79B by 2035, 34.5% CAGR (Precedence Research)
//   AI Tutoring:      $3.55B (2025) → $6.45B by 2030, 12.7% CAGR (Grand View Research)
//   AI Personalised Learning: $6B (2026) → $16.4B by 2030, 28.6% CAGR (Research & Markets)
//   AI Productivity:  $17.0B → $41.1B, 25% CAGR (Grand View Research)
//   AI Companions:    $49.5B → $141B, 31% CAGR (Precedence Research)
//   Combined TAM:     $93B+ addressable (2026)
//
// Competitors (2026):
//   Cursor:   $2B ARR, Fortune 500 (60% enterprise), 18% market share, $29.3B valuation
//   Copilot:  $451M-$848M ARR, 4.7M paid subs, 20M all-time users, 42% market share
//   Windsurf: acquired for $250M
//
// Conversion: OSS dev tools 1-3% free→paid, top quartile 3-5%
// Ava traction: 1,354+ VS Code installs in 2 weeks, zero marketing, ~100/day velocity (accelerating), 1618% conversion
// First live stream: 17 installs during stream, daily streaming planned
// Ava pricing: Pro $19/mo, Ultra $39/mo, Enterprise $79/mo (Qwen at 50% enterprise pricing)
// Top-ups: 3M/$3, 10M/$8, 25M/$15
// Growth projection at 100/day: 2,000 by week 4, 5,000 by mid-April, 10,000+ by May

/* ── Types ───────────────────────────────────────────────────────────────── */

interface YearData {
  year: number;
  label: string;
  totalUsers: number;
  conversionRate: number;
  payingUsers: number;
  mrr: number;
  arr: number;
  costs: number;
  netArr: number;
}

interface Scenario {
  key: 'conservative' | 'base' | 'optimistic';
  label: string;
  description: string;
  color: string;
  colorBg: string;
  years: YearData[];
  assumptions: string[];
}

interface Objective {
  id: string;
  title: string;
  status: 'not-started' | 'in-progress' | 'complete';
  priority: 'critical' | 'high' | 'medium';
  funding: string[];
  description: string;
  activities: Array<{ text: string; done: boolean }>;
}

/* ── Scenario Builder ────────────────────────────────────────────────────── */

function buildScenario(
  key: Scenario['key'],
  label: string,
  description: string,
  color: string,
  colorBg: string,
  data: { users: number; conv: number; arpu: number; costPct: number }[],
  assumptions: string[],
): Scenario {
  const years: YearData[] = data.map((d, i) => {
    const paying = Math.round(d.users * (d.conv / 100));
    const mrr = paying * d.arpu;
    const arr = mrr * 12;
    const costs = Math.round(arr * (d.costPct / 100));
    return {
      year: i + 1,
      label: `Year ${i + 1}`,
      totalUsers: d.users,
      conversionRate: d.conv,
      payingUsers: paying,
      mrr,
      arr,
      costs,
      netArr: arr - costs,
    };
  });
  return { key, label, description, color, colorBg, years, assumptions };
}

/* ── Scenario Data ───────────────────────────────────────────────────────── */

const conservative = buildScenario(
  'conservative',
  'Conservative',
  'Fully bootstrapped. Organic growth only — daily streams, word of mouth. Single maintainer building in public.',
  '#60a5fa',
  'rgba(59,130,246,0.2)',
  [
    { users: 36_000,    conv: 3.0, arpu: 8,  costPct: 80 },
    { users: 100_000,   conv: 3.0, arpu: 9,  costPct: 60 },
    { users: 250_000,   conv: 3.0, arpu: 10, costPct: 50 },
    { users: 600_000,   conv: 3.0, arpu: 10, costPct: 40 },
    { users: 1_500_000, conv: 3.0, arpu: 10, costPct: 35 },
  ],
  [
    'Zero external funding — fully bootstrapped and self-sustaining',
    'Based on ACTUAL traction: 1,354+ installs in 2 weeks, ~100/day and accelerating',
    'Daily live streams driving 17+ installs per stream session',
    'Organic growth: VS Code Marketplace, GitHub, Twitch, YouTube, word of mouth',
    '3% conversion rate (OSS dev tool benchmark: 1-3%, top quartile: 3-5%)',
    'Pro tier at $19/mo, Ultra $39/mo, Enterprise $79/mo (Qwen at 50% enterprise pricing)',
    'Low cost base: BYOK users cost nothing, free tier at ~$0.90/user (3M Qwen tokens)',
    'Revenue from coding agent, education (Teach mode), and AI companion features',
    'Profitable from Year 1 — 1,080 paying users x $8 ARPU = $104K ARR',
  ],
);

const realistic = buildScenario(
  'base',
  'Base',
  'Seed funding secured, small team (2-3), daily streaming, active community. Project giveaways drive viral loops.',
  '#34d399',
  'rgba(16,185,129,0.2)',
  [
    { users: 50_000,    conv: 4.0, arpu: 9,  costPct: 120 },
    { users: 200_000,   conv: 4.0, arpu: 10, costPct: 85 },
    { users: 500_000,   conv: 4.0, arpu: 11, costPct: 65 },
    { users: 1_200_000, conv: 4.0, arpu: 12, costPct: 50 },
    { users: 3_000_000, conv: 4.0, arpu: 12, costPct: 40 },
  ],
  [
    'Seed round (NGI, Sovereign Tech Fund, or angel)',
    'Based on ACTUAL traction: 1,354+ installs in 2 weeks at 100/day, accelerating with daily streams',
    'First live stream: 17 installs during session, project giveaway model drives retention',
    'Team of 2-3 by Year 2, growing to 4-5 by Year 4',
    'Companion app (Capacitor) drives mobile adoption and education use case',
    'Pro $19/mo, Ultra $39/mo, Enterprise $79/mo — blended ARPU rises to $12',
    'Addressable markets: $93B+ combined TAM across coding, education, productivity, companions',
    'Conversion improves with daily content, community, and persona system stickiness',
  ],
);

const optimistic = buildScenario(
  'optimistic',
  'Optimistic',
  'Series A funding, viral adoption via daily streams + giveaways, enterprise contracts. Multi-market expansion.',
  '#fbbf24',
  'rgba(245,158,11,0.2)',
  [
    { users: 75_000,    conv: 5.0, arpu: 10, costPct: 150 },
    { users: 400_000,   conv: 5.0, arpu: 11, costPct: 100 },
    { users: 1_000_000, conv: 5.0, arpu: 12, costPct: 70 },
    { users: 3_000_000, conv: 5.0, arpu: 13, costPct: 50 },
    { users: 7_000_000, conv: 5.0, arpu: 14, costPct: 35 },
  ],
  [
    'Funding: seed → Series A by Year 2',
    'Based on ACTUAL traction: 1,354+ installs in 2 weeks at 100/day → viral with marketing + daily streams',
    'Daily live streams + project giveaways create viral loop and YouTube content library',
    'Teach mode drives education adoption — schools, bootcamps, developing countries',
    'Enterprise tier ($79/mo) + top-ups drive blended ARPU up to ~$14/mo by Year 5',
    'Team grows to 10-15 by Year 4',
    'Addressable markets: $93B+ combined TAM',
    'Comparable trajectories: Cursor $2B ARR ($29.3B valuation), Copilot 4.7M paid subs',
  ],
);

const scenarios: Scenario[] = [conservative, realistic, optimistic];

/* ── Objectives Data ─────────────────────────────────────────────────────── */

const objectives: Objective[] = [
  {
    id: 'security',
    title: 'Security Hardening & Audit',
    status: 'complete',
    priority: 'critical',
    funding: ['Sovereign Tech Fund', 'NGI Zero Commons'],
    description:
      'Comprehensive security audit of all 54 tools, focusing on the confirmation/approval system that gates dangerous operations.',
    activities: [
      { text: 'Audit all tool confirmation/approval gates (file writes, shell execution, git operations)', done: true },
      { text: 'Path traversal prevention and input validation across all file/search tools', done: true },
      { text: 'Credential detection — shared security module blocking secrets in outbound tools', done: true },
      { text: 'ReDoS guard on regex-based tools (grep pattern length limits)', done: true },
      { text: 'Input sanitisation and sandboxing improvements for bash tool across Windows, macOS, Linux', done: true },
      { text: 'Automated security scanning in CI/CD (dependency vulns, static analysis, secret detection)', done: true },
      { text: 'Formal security policy and responsible disclosure process (SECURITY.md update)', done: true },
      { text: 'Code signing for desktop IDE releases to ensure distribution integrity', done: true },
    ],
  },
  {
    id: 'testing',
    title: 'Testing Infrastructure & Resilience',
    status: 'complete',
    priority: 'critical',
    funding: ['Sovereign Tech Fund', 'NGI Zero Commons'],
    description:
      'Building comprehensive test coverage to ensure reliability across platforms and providers.',
    activities: [
      { text: 'Integration test suite covering all 7 AI provider APIs with contract testing', done: true },
      { text: 'Cross-platform end-to-end testing (Windows, macOS, Linux) for CLI, extension, and IDE', done: true },
      { text: 'Tool execution test harness — each of 54 tools tested with known-good and adversarial inputs', done: true },
      { text: 'Automated regression testing in CI to prevent security and stability regressions', done: true },
    ],
  },
  {
    id: 'resilience',
    title: 'Provider Resilience & Failover',
    status: 'complete',
    priority: 'high',
    funding: ['Sovereign Tech Fund'],
    description:
      'Reducing dependency on any single AI provider to ensure continuity. Automatic failover when providers experience downtime.',
    activities: [
      { text: 'Automatic failover when a provider experiences downtime or deprecates a model', done: true },
      { text: 'Provider health monitoring and graceful degradation', done: true },
      { text: 'Standardised provider adapter interface to reduce maintenance burden on API changes', done: true },
      { text: 'Documentation and tooling for self-hosting with local models (Ollama, LMStudio) as zero-dependency fallback', done: true },
    ],
  },
  {
    id: 'platform',
    title: 'Multi-Platform & Multi-Surface',
    status: 'complete',
    priority: 'high',
    funding: ['Sovereign Tech Fund'],
    description:
      'Four surfaces (CLI, Extension, Companion, IDE) all powered by the same core. Production-grade across all platforms.',
    activities: [
      { text: 'VS Code extension with 54 tools, 6 modes, dashboard, memory, tasks, journal, learning', done: true },
      { text: 'Companion web app (PWA) with chat, tasks, memory, journal — responsive desktop + mobile', done: true },
      { text: 'CLI with full REPL, streaming, tool confirmation, conversation history', done: true },
      { text: 'Desktop IDE (Eclipse Theia) with integrated agent panel', done: true },
      { text: 'Extension stability — workspace switching, context preservation, crash recovery', done: true },
    ],
  },
  {
    id: 'learning',
    title: 'Teaching & Learning System',
    status: 'complete',
    priority: 'high',
    funding: ['NGI Zero Commons'],
    description:
      'Teach Mode — Ava as personal tutor. Personalised curriculums, adaptive teaching, progress tracking. Free education for everyone.',
    activities: [
      { text: 'learning_create, learning_teach, learning_progress tools in core', done: true },
      { text: 'Teach mode (??) with Socratic teaching personality and full toolkit', done: true },
      { text: 'Local-first curriculum storage with Supabase sync for platform users', done: true },
      { text: 'Learning dashboard in extension and web platform', done: true },
      { text: 'Supabase migration for learning tables (curriculums, modules, lessons, assessments)', done: true },
    ],
  },
  {
    id: 'personas',
    title: 'Persona System & Conductor',
    status: 'complete',
    priority: 'critical',
    funding: [],
    description:
      '11-persona system with Conductor orchestration layer. Each persona has specialised expertise, unique system prompts, and dedicated tool access. Live in extension + CLI.',
    activities: [
      { text: '11 specialised personas: Architect, Coder, Debugger, Reviewer, Tester, DevOps, Documenter, Educator, Researcher, Security, Designer', done: true },
      { text: 'Conductor agent — automatically routes tasks to the right persona based on intent', done: true },
      { text: 'Per-persona system prompts, tool whitelists, and behavioural tuning', done: true },
      { text: 'Persona switching in extension UI and CLI with mode-aware context', done: true },
      { text: 'Conductor confidence scoring and persona recommendation system', done: true },
    ],
  },
  {
    id: 'companion-overhaul',
    title: 'Companion App Overhaul',
    status: 'complete',
    priority: 'high',
    funding: [],
    description:
      'Major companion app rebuild — learning tab, offline queueing, push notifications, improved sync, and responsive design overhaul.',
    activities: [
      { text: 'Learning tab with curriculum browser, lesson viewer, and progress tracking', done: true },
      { text: 'Offline message queueing — compose messages without internet, send when reconnected', done: true },
      { text: 'Push notification system for task reminders and journal updates', done: true },
      { text: 'Responsive design overhaul — works on all screen sizes from mobile to ultrawide', done: true },
      { text: 'Improved Supabase sync with conflict resolution for tasks, memory, and journal', done: true },
    ],
  },
  {
    id: 'release-notes',
    title: 'Release Notes System',
    status: 'complete',
    priority: 'medium',
    funding: [],
    description:
      'Automated release notes generation and display. Dashboard integration with filtering, CORS handling, and message type support.',
    activities: [
      { text: 'Release notes dashboard panel with month filtering', done: true },
      { text: 'CORS configuration for cross-origin dashboard requests', done: true },
      { text: 'Message type classification and display formatting', done: true },
      { text: 'Dashboard UI rebuild with release notes integration', done: true },
    ],
  },
  {
    id: 'self-inspect',
    title: 'Self-Inspect & Diagnostics',
    status: 'complete',
    priority: 'medium',
    funding: [],
    description:
      'Ava can inspect her own configuration, provider status, tool availability, and system health. Diagnostic tools for debugging.',
    activities: [
      { text: 'Self-inspect command — shows active provider, model, tool count, mode, and system state', done: true },
      { text: 'Provider health check — tests API connectivity and model availability', done: true },
      { text: 'Tool inventory — lists all 54 tools with their status and confirmation requirements', done: true },
      { text: 'Debug logging improvements for troubleshooting provider and tool issues', done: true },
    ],
  },
  {
    id: 'community',
    title: 'Documentation & Community Infrastructure',
    status: 'complete',
    priority: 'medium',
    funding: ['NGI Zero Commons'],
    description:
      'Preparing the project for sustainable community-driven maintenance with comprehensive contributor documentation.',
    activities: [
      { text: 'Architecture guides, tool development guides, provider integration guides', done: true },
      { text: 'Issue triage workflows, PR review templates, and code of conduct', done: true },
      { text: 'Internationalisation verification — 20 languages supported', done: true },
      { text: 'Public roadmap and governance model for community input on direction', done: true },
    ],
  },
  {
    id: 'team',
    title: 'Building a European Team',
    status: 'not-started',
    priority: 'high',
    funding: ['Sovereign Tech Fund', 'NGI Zero Commons'],
    description:
      'Transitioning from single-maintainer to a sustainable, EU-based development team. Eliminating bus-factor risk.',
    activities: [
      { text: 'Hire 1-2 EU-based developers to distribute maintenance across security, testing, and platform support', done: false },
      { text: 'Establish code review and knowledge-sharing processes to eliminate bus-factor risk', done: false },
      { text: 'Ensure long-term continuity of the project beyond any individual contributor', done: false },
    ],
  },
  {
    id: 'teach-improve',
    title: 'Teach Mode — Community-Driven Improvement',
    status: 'in-progress',
    priority: 'critical',
    funding: [],
    description:
      'Teach mode v1 is shipped. Now we need the community to help perfect it — testing with real learners, improving curriculum quality, adding assessment types, and building out the adaptive learning engine.',
    activities: [
      { text: 'Gather community feedback on Teach mode — what works, what breaks, what\'s missing', done: false },
      { text: 'Improve curriculum generation quality — better module structure, pacing, prerequisites', done: false },
      { text: 'Add quiz/assessment engine — multiple choice, code challenges, fill-in-the-blank', done: false },
      { text: 'Adaptive difficulty — Ava adjusts based on quiz scores and learner feedback', done: false },
      { text: 'Spaced repetition — revisit weak topics automatically across sessions', done: false },
      { text: 'Progress visualisation — charts, streaks, completion certificates', done: false },
      { text: 'Curriculum sharing — users can share/fork curriculums with the community', done: false },
    ],
  },
  {
    id: 'daily-briefing',
    title: 'Daily Briefing & Smart Reminders',
    status: 'not-started',
    priority: 'high',
    funding: [],
    description:
      'JARVIS-style daily briefing on startup — summarises tasks, journal entries, calendar, weather, and priorities. Smart reminders that adapt to context and work patterns.',
    activities: [
      { text: 'Morning briefing on extension/companion startup — tasks due, journal summary, priorities', done: false },
      { text: 'Smart reminders based on task deadlines, overdue items, and work patterns', done: false },
      { text: 'Contextual awareness — briefing adapts based on time of day and recent activity', done: false },
      { text: 'Weather and calendar integration for productivity context', done: false },
      { text: 'Companion push notifications for daily briefing delivery', done: false },
      { text: 'Briefing customisation — users choose what sections they want', done: false },
    ],
  },
  {
    id: 'health-wellness',
    title: 'Health & Wellness Tracking',
    status: 'not-started',
    priority: 'medium',
    funding: [],
    description:
      'Ava as wellness companion — break reminders, posture nudges, mood tracking, energy logging. Addresses the $12B wellness apps market.',
    activities: [
      { text: 'Break reminders based on coding session duration (Pomodoro-aware)', done: false },
      { text: 'Mood and energy logging — quick check-ins stored in journal', done: false },
      { text: 'Wellness insights — patterns between work habits, breaks, and productivity', done: false },
      { text: 'Posture and eye strain nudges with customisable intervals', done: false },
      { text: 'Integration with companion app for mobile wellness tracking', done: false },
      { text: 'Weekly wellness summary in daily briefing', done: false },
    ],
  },
  {
    id: 'multi-agent',
    title: 'Multi-Agent Parallel Execution',
    status: 'not-started',
    priority: 'medium',
    funding: [],
    description:
      'Phase 2 of the persona system — multiple personas working in parallel on different aspects of a task. Conductor orchestrates, distributes subtasks, and merges results.',
    activities: [
      { text: 'Parallel execution engine — run multiple persona agents concurrently', done: false },
      { text: 'Conductor task decomposition — break complex tasks into parallelisable subtasks', done: false },
      { text: 'Result merging and conflict resolution when parallel agents touch the same files', done: false },
      { text: 'Progress visualisation — see all active agents and their status in real time', done: false },
      { text: 'Resource management — token budget allocation across parallel agents', done: false },
    ],
  },
  {
    id: 'companion-mobile',
    title: 'Companion App — Capacitor Native Wrap',
    status: 'not-started',
    priority: 'high',
    funding: [],
    description:
      'Wrap the companion web app with Capacitor for native iOS and Android distribution. Push notifications, offline mode, biometric auth.',
    activities: [
      { text: 'Capacitor project setup with iOS and Android targets', done: false },
      { text: 'Push notifications for task reminders and Ava journal updates', done: false },
      { text: 'Offline mode — local-first chat and tasks work without internet', done: false },
      { text: 'Biometric authentication (Face ID / fingerprint)', done: false },
      { text: 'App Store and Google Play submissions', done: false },
      { text: 'Deep linking — open specific chats/tasks from notifications', done: false },
    ],
  },
  {
    id: 'memory-sync',
    title: 'Memory & Settings Sync Across All Surfaces',
    status: 'in-progress',
    priority: 'high',
    funding: [],
    description:
      'Unified memory, settings, and task sync across extension, companion, web, and CLI. One brain, everywhere.',
    activities: [
      { text: 'Memory sync — extension writes to Supabase, companion and web read from it', done: true },
      { text: 'Task sync — same task list visible across all surfaces', done: true },
      { text: 'Journal sync — entries visible in extension dashboard, web, and companion', done: true },
      { text: 'Learning sync — curriculums visible in extension dashboard and web', done: true },
      { text: 'Settings sync — theme, language, model preferences sync across surfaces', done: false },
      { text: 'Conversation sync — resume chats across extension and companion', done: false },
      { text: 'Conflict resolution — handle concurrent edits from multiple surfaces', done: false },
    ],
  },
  {
    id: 'extension-polish',
    title: 'Extension Polish & Testing Coverage',
    status: 'not-started',
    priority: 'high',
    funding: [],
    description:
      'With 1,354+ installs growing fast, the extension needs to be rock solid. Unit tests, integration tests, edge case handling, and UX polish.',
    activities: [
      { text: 'Unit tests for all 47 tool implementations', done: false },
      { text: 'Integration tests for provider failover and resilience', done: false },
      { text: 'End-to-end tests for extension activation, chat flow, and dashboard', done: false },
      { text: 'Error handling audit — every error path shows a helpful message', done: false },
      { text: 'Performance profiling — startup time, memory usage, large file handling', done: false },
      { text: 'Accessibility audit — screen reader, keyboard navigation, ARIA labels', done: false },
    ],
  },
  {
    id: 'computer-use',
    title: 'Computer Use — GUI Desktop Control',
    status: 'not-started',
    priority: 'medium',
    funding: [],
    description:
      'GUI desktop control via ShowUI + vision models. For actions that can\'t be done via CLI — clicking buttons, filling forms, navigating GUIs.',
    activities: [
      { text: 'Research ShowUI + Qwen2.5-VL integration for GUI control', done: false },
      { text: 'Screenshot → action pipeline — capture screen, identify elements, execute clicks/types', done: false },
      { text: 'Safety gates — user confirmation before any GUI action', done: false },
      { text: 'Integration with existing screenshot and browser tools', done: false },
      { text: 'Cross-platform support — Windows, macOS, Linux', done: false },
    ],
  },
  {
    id: 'game-engines',
    title: 'Game Engine Integrations',
    status: 'not-started',
    priority: 'medium',
    funding: [],
    description:
      'Ava as a game development partner — write code + control the editor + screenshot the viewport for visual iteration loops.',
    activities: [
      { text: 'Unreal Engine — Remote Control API + Python scripting integration', done: false },
      { text: 'Unity — Editor C# API + CLI build pipeline', done: false },
      { text: 'Godot — GDScript + LSP + scene tree manipulation', done: false },
      { text: 'Visual iteration loop — screenshot viewport, analyse, suggest changes, apply', done: false },
    ],
  },
  {
    id: 'plugin-marketplace',
    title: 'Plugin & Tool Marketplace',
    status: 'not-started',
    priority: 'medium',
    funding: [],
    description:
      'Community-contributed tools and integrations. Revenue share model. Browse, install, and publish tools from within Ava.',
    activities: [
      { text: 'Plugin registry API — publish, discover, install, update tools', done: false },
      { text: 'Plugin sandboxing — community tools run in isolated context', done: false },
      { text: 'Revenue share model — 70/30 split for premium plugins', done: false },
      { text: 'In-app marketplace UI in extension dashboard and web platform', done: false },
      { text: 'Plugin review and approval process', done: false },
    ],
  },
  {
    id: 'productivity-integrations',
    title: 'Productivity Integrations',
    status: 'not-started',
    priority: 'medium',
    funding: [],
    description:
      'Connect Ava to external services — email, Slack, Discord, calendar. Agent proposes actions, user approves.',
    activities: [
      { text: 'send_email tool — SMTP with local credentials, user approves before sending', done: false },
      { text: 'Slack integration — read/send messages, summarise channels', done: false },
      { text: 'Discord integration — community management, bot commands', done: false },
      { text: 'Calendar integration — schedule meetings, check availability', done: false },
      { text: 'OAuth flows for Gmail, Outlook, Google Calendar', done: false },
    ],
  },
];

/* ── Formatting helpers ──────────────────────────────────────────────────── */

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function fmtUsers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

/* ── Shared style constants ──────────────────────────────────────────────── */

const cardStyle: React.CSSProperties = {
  background: theme.cardBg,
  border: 'none',
  borderRadius: theme.radiusLg,
  padding: theme.cardPadding,
};

const chipStyle = (bg: string, color: string): React.CSSProperties => ({
  display: 'inline-block',
  background: bg,
  color,
  fontSize: 10,
  fontWeight: 400,
  borderRadius: 9999,
  padding: '2px 10px',
});

const statBoxStyle: React.CSSProperties = {
  background: theme.inputBg,
  borderRadius: theme.radiusSm,
  padding: 14,
};

/* ── Days until launch helper ────────────────────────────────────────────── */

function getDaysToLaunch(): number {
  const launch = new Date('2026-04-13T00:00:00');
  const now = new Date();
  const diff = launch.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

/* ── Dashboard Tab ───────────────────────────────────────────────────────── */

function DashboardTab() {
  const [installs, setInstalls] = useState(() => {
    const saved = localStorage.getItem('ava-platform-installs');
    return saved ? parseInt(saved, 10) : 1354;
  });
  const [signups, setSignups] = useState(() => {
    const saved = localStorage.getItem('ava-platform-signups');
    return saved ? parseInt(saved, 10) : 10;
  });
  const [dailyRate, setDailyRate] = useState(() => {
    const saved = localStorage.getItem('ava-platform-daily-rate');
    return saved ? parseInt(saved, 10) : 100;
  });
  const daysToLaunch = getDaysToLaunch();

  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const startEdit = (key: string, current: number) => {
    setEditing(key);
    setEditValue(String(current));
  };

  const saveEdit = (key: string) => {
    const val = parseInt(editValue, 10);
    if (!isNaN(val) && val >= 0) {
      if (key === 'installs') { setInstalls(val); localStorage.setItem('ava-platform-installs', String(val)); }
      if (key === 'signups') { setSignups(val); localStorage.setItem('ava-platform-signups', String(val)); }
      if (key === 'dailyRate') { setDailyRate(val); localStorage.setItem('ava-platform-daily-rate', String(val)); }
    }
    setEditing(null);
  };

  const cancelEdit = () => setEditing(null);

  const projectedInstalls = installs + (dailyRate * daysToLaunch);

  const kpis = [
    { key: 'installs', label: 'VS Code Installs', value: installs, sub: 'Total lifetime', color: theme.accent, editable: true },
    { key: 'signups', label: 'Platform Signups', value: signups, sub: 'Registered accounts', color: theme.blue, editable: true },
    { key: 'dailyRate', label: 'Daily Install Rate', value: dailyRate, sub: 'Current velocity', color: theme.green, editable: true },
    { key: 'daysToLaunch', label: 'Days to Launch', value: daysToLaunch, sub: 'April 13, 2026', color: theme.yellow, editable: false },
  ];

  const readinessItems: { label: string; status: string; detail?: string; statusColor: string; statusBg: string }[] = [
    { label: 'Stripe Integration', status: 'pending', statusColor: theme.yellow, statusBg: theme.yellowBg },
    { label: 'Plans Configured', status: 'configured', detail: '$19 / $39 / $79', statusColor: theme.blue, statusBg: theme.blueBg },
    { label: 'Token Top-ups', status: 'pending', statusColor: theme.yellow, statusBg: theme.yellowBg },
    { label: 'BYOK', status: 'live', statusColor: theme.green, statusBg: theme.greenBg },
    { label: 'Free Tier', status: 'live', detail: '3M tokens', statusColor: theme.green, statusBg: theme.greenBg },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {kpis.map((kpi) => (
          <div key={kpi.key} style={{ ...statCardStyle, border: 'none' }}>
            <div style={{ fontSize: 11, fontWeight: 400, color: theme.textMuted }}>{kpi.label}</div>
            {editing === kpi.key ? (
              <div style={{ marginTop: 6 }}>
                <input
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveEdit(kpi.key);
                    if (e.key === 'Escape') cancelEdit();
                  }}
                  autoFocus
                  style={{
                    ...inputStyle,
                    width: 90,
                    padding: '4px 8px',
                    fontSize: 20,
                    fontWeight: 300,
                    textAlign: 'left',
                  }}
                />
              </div>
            ) : (
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 300,
                  color: kpi.color,
                  marginTop: 6,
                  lineHeight: 1,
                  cursor: kpi.editable ? 'pointer' : 'default',
                }}
                onClick={() => kpi.editable && startEdit(kpi.key, kpi.value)}
                title={kpi.editable ? 'Click to edit' : undefined}
              >
                {kpi.value.toLocaleString()}
              </div>
            )}
            <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 6 }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Growth Velocity */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: 14, fontWeight: 400, color: theme.text, margin: '0 0 14px 0' }}>
          Growth Velocity
        </h3>
        <div style={{ background: theme.inputBg, borderRadius: theme.radiusSm, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 300, color: theme.textSecondary, lineHeight: 1.7 }}>
            At current rate, projecting{' '}
            <span style={{ fontWeight: 400, color: theme.accent, fontSize: 15 }}>
              {projectedInstalls.toLocaleString()}
            </span>{' '}
            installs by launch
          </div>
          <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 8, fontFamily: 'monospace' }}>
            {installs.toLocaleString()} current + ({dailyRate} / day x {daysToLaunch} days) = {projectedInstalls.toLocaleString()}
          </div>
          {/* Visual bar */}
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: theme.textMuted, marginBottom: 4 }}>
              <span>Current</span>
              <span>Projected at launch</span>
            </div>
            <div style={{ height: 8, width: '100%', borderRadius: 9999, background: 'rgba(168,85,247,0.1)', position: 'relative' }}>
              <div
                style={{
                  height: 8,
                  borderRadius: 9999,
                  background: `linear-gradient(90deg, ${theme.accent}, ${theme.blue})`,
                  width: projectedInstalls > 0 ? `${Math.min(100, (installs / projectedInstalls) * 100)}%` : '0%',
                  transition: 'width 0.3s',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Revenue Readiness */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: 14, fontWeight: 400, color: theme.text, margin: '0 0 14px 0' }}>
          Revenue Readiness
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {readinessItems.map((item) => (
            <div
              key={item.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: theme.inputBg,
                borderRadius: theme.radiusSm,
                padding: '10px 14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 300, color: theme.text }}>{item.label}</span>
                {item.detail && (
                  <span style={{ fontSize: 11, color: theme.textMuted }}>{item.detail}</span>
                )}
              </div>
              <span style={chipStyle(item.statusBg, item.statusColor)}>{item.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Market Context Panel ────────────────────────────────────────────────── */

function MarketContext() {
  const marketData = [
    { label: 'AI Coding Tools', value: '$7.37B', sub: '27.1% CAGR -> $30.1B by 2032' },
    { label: 'AI in Education', value: '$9.58B', sub: '34.5% CAGR -> $136.79B by 2035' },
    { label: 'AI Tutoring', value: '$3.55B', sub: '12.7% CAGR -> $6.45B by 2030' },
    { label: 'AI Personalised Learning', value: '$6B', sub: '28.6% CAGR -> $16.4B by 2030' },
    { label: 'AI Productivity', value: '$17.0B', sub: '25% CAGR -> $41.1B by 2030' },
    { label: 'AI Companions', value: '$49.5B', sub: '31% CAGR -> $141B by 2030' },
    { label: 'Combined TAM', value: '$93B+', sub: 'Addressable across all markets (2026)' },
    { label: 'Ava Traction', value: '1,354+', sub: '2 weeks, $0 marketing, ~100/day' },
  ];

  const competitors = [
    { label: 'Cursor', value: '$2B ARR', sub: '$29.3B valuation, 18% market share, 60% enterprise' },
    { label: 'GitHub Copilot', value: '$451M-$848M ARR', sub: '4.7M paid subs, 20M all-time users, 42% market share' },
    { label: 'Windsurf (acq.)', value: '$250M', sub: 'Acquired by OpenAI' },
    { label: 'Education Market', value: '$9.58B', sub: "34.5% CAGR — market Cursor doesn't touch" },
  ];

  return (
    <div style={cardStyle}>
      <h3 style={{ fontSize: 14, fontWeight: 400, color: theme.text, margin: '0 0 12px 0' }}>
        Market Context (March 2026)
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {marketData.map((item) => (
          <div key={item.label} style={statBoxStyle}>
            <div style={{ fontSize: 11, color: theme.textMuted }}>{item.label}</div>
            <div style={{ fontSize: 18, fontWeight: 400, color: theme.text }}>{item.value}</div>
            <div style={{ fontSize: 11, color: theme.textSecondary }}>{item.sub}</div>
          </div>
        ))}
      </div>

      <h4 style={{ fontSize: 11, fontWeight: 400, color: theme.textMuted, margin: '16px 0 8px 0' }}>
        Competitor Landscape
      </h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {competitors.map((item) => (
          <div key={item.label} style={statBoxStyle}>
            <div style={{ fontSize: 11, color: theme.textMuted }}>{item.label}</div>
            <div style={{ fontSize: 18, fontWeight: 400, color: theme.text }}>{item.value}</div>
            <div style={{ fontSize: 11, color: theme.textSecondary }}>{item.sub}</div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 11, color: theme.textMuted, marginTop: 12, lineHeight: 1.6 }}>
        Ava&apos;s unique position: open-source agentic coding agent with built-in personal tutor, AI companion,
        and 11-persona system — straddles multiple high-growth markets with a single platform.
        Priced at $19/mo Pro, $39/mo Ultra, $79/mo Enterprise (Qwen at 50% enterprise pricing). 1618% conversion rate on VS Code Marketplace.
      </p>
    </div>
  );
}

/* ── Bar chart (pure CSS) ────────────────────────────────────────────────── */

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const width = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div style={{ height: 12, width: '100%', borderRadius: 9999, background: theme.inputBg }}>
      <div style={{ height: 12, borderRadius: 9999, background: color, width: `${width}%` }} />
    </div>
  );
}

/* ── Scenario Card ───────────────────────────────────────────────────────── */

function ScenarioCard({ scenario }: { scenario: Scenario }) {
  const [showAssumptions, setShowAssumptions] = useState(false);
  const maxArr = Math.max(...scenario.years.map((y) => y.arr));
  const y5 = scenario.years[4];

  const barColor =
    scenario.key === 'conservative' ? '#3b82f6' :
    scenario.key === 'base' ? '#10b981' : '#f59e0b';

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span style={chipStyle(scenario.colorBg, scenario.color)}>{scenario.label}</span>
        <span style={{ fontSize: 11, color: theme.textMuted }}>{scenario.description}</span>
      </div>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <div style={{ ...statBoxStyle, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: theme.textMuted }}>Year 5 ARR</div>
          <div style={{ fontSize: 18, fontWeight: 400, color: scenario.color }}>{fmt(y5.arr)}</div>
        </div>
        <div style={{ ...statBoxStyle, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: theme.textMuted }}>Year 5 Users</div>
          <div style={{ fontSize: 18, fontWeight: 400, color: theme.text }}>{fmtUsers(y5.totalUsers)}</div>
        </div>
        <div style={{ ...statBoxStyle, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: theme.textMuted }}>Year 5 Net</div>
          <div style={{ fontSize: 18, fontWeight: 400, color: y5.netArr >= 0 ? theme.green : theme.red }}>
            {fmt(y5.netArr)}
          </div>
        </div>
      </div>

      {/* Year-by-year table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${theme.border}`, textAlign: 'left', fontSize: 11, color: theme.textMuted }}>
              <th style={{ paddingBottom: 8, paddingRight: 12, fontWeight: 400 }}>Year</th>
              <th style={{ paddingBottom: 8, paddingRight: 12, fontWeight: 400 }}>Users</th>
              <th style={{ paddingBottom: 8, paddingRight: 12, fontWeight: 400 }}>Conv %</th>
              <th style={{ paddingBottom: 8, paddingRight: 12, fontWeight: 400 }}>Paying</th>
              <th style={{ paddingBottom: 8, paddingRight: 12, fontWeight: 400 }}>MRR</th>
              <th style={{ paddingBottom: 8, paddingRight: 12, fontWeight: 400 }}>ARR</th>
              <th style={{ paddingBottom: 8, paddingRight: 12, fontWeight: 400 }}>Costs</th>
              <th style={{ paddingBottom: 8, paddingRight: 12, fontWeight: 400 }}>Net</th>
              <th style={{ paddingBottom: 8, width: 96, fontWeight: 400 }}>ARR</th>
            </tr>
          </thead>
          <tbody>
            {scenario.years.map((y) => (
              <tr key={y.year} style={{ borderBottom: `1px solid ${theme.border}40` }}>
                <td style={{ padding: '8px 12px 8px 0', fontWeight: 400, color: theme.text }}>{y.label}</td>
                <td style={{ padding: '8px 12px 8px 0', color: theme.text }}>{fmtUsers(y.totalUsers)}</td>
                <td style={{ padding: '8px 12px 8px 0', color: theme.text }}>{pct(y.conversionRate)}</td>
                <td style={{ padding: '8px 12px 8px 0', color: theme.text }}>{fmtUsers(y.payingUsers)}</td>
                <td style={{ padding: '8px 12px 8px 0', color: theme.text }}>{fmt(y.mrr)}</td>
                <td style={{ padding: '8px 12px 8px 0', fontWeight: 400, color: scenario.color }}>{fmt(y.arr)}</td>
                <td style={{ padding: '8px 12px 8px 0', color: theme.textMuted }}>{fmt(y.costs)}</td>
                <td style={{ padding: '8px 12px 8px 0', fontWeight: 400, color: y.netArr >= 0 ? theme.green : theme.red }}>
                  {fmt(y.netArr)}
                </td>
                <td style={{ padding: '8px 0', width: 96 }}>
                  <MiniBar value={y.arr} max={maxArr} color={barColor} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Assumptions toggle */}
      <div style={{ marginTop: 16 }}>
        <button
          onClick={() => setShowAssumptions(!showAssumptions)}
          style={{
            background: 'none',
            border: 'none',
            color: theme.textMuted,
            fontSize: 11,
            cursor: 'pointer',
            padding: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = theme.text)}
          onMouseLeave={(e) => (e.currentTarget.style.color = theme.textMuted)}
        >
          {showAssumptions ? 'Hide' : 'View'} assumptions
        </button>
        {showAssumptions && (
          <ul style={{ marginTop: 8, padding: 0, listStyle: 'none' }}>
            {scenario.assumptions.map((a, i) => (
              <li key={i} style={{ display: 'flex', gap: 8, fontSize: 11, color: theme.textSecondary, marginBottom: 4 }}>
                <span style={{ flexShrink: 0, color: theme.textMuted }}>&bull;</span>
                {a}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ── Comparison Chart ────────────────────────────────────────────────────── */

function ComparisonChart() {
  const maxVal = optimistic.years[4].arr;

  return (
    <div style={cardStyle}>
      <h3 style={{ fontSize: 14, fontWeight: 400, color: theme.text, margin: '0 0 16px 0' }}>
        5-Year ARR Comparison
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[1, 2, 3, 4, 5].map((yr) => {
          const c = conservative.years[yr - 1];
          const r = realistic.years[yr - 1];
          const o = optimistic.years[yr - 1];
          return (
            <div key={yr}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: theme.textMuted, marginBottom: 4 }}>
                <span>Year {yr}</span>
                <span style={{ display: 'flex', gap: 16 }}>
                  <span style={{ color: theme.blue }}>{fmt(c.arr)}</span>
                  <span style={{ color: theme.green }}>{fmt(r.arr)}</span>
                  <span style={{ color: theme.yellow }}>{fmt(o.arr)}</span>
                </span>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <div style={{ height: 8, borderRadius: 9999, background: '#3b82f6', width: `${(c.arr / maxVal) * 100}%`, minWidth: 2 }} />
                <div style={{ height: 8, borderRadius: 9999, background: '#10b981', width: `${(r.arr / maxVal) * 100}%`, minWidth: 2 }} />
                <div style={{ height: 8, borderRadius: 9999, background: '#f59e0b', width: `${(o.arr / maxVal) * 100}%`, minWidth: 2 }} />
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 16, fontSize: 11, color: theme.textMuted, marginTop: 12 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 9999, background: '#3b82f6' }} /> Conservative
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 9999, background: '#10b981' }} /> Base
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 9999, background: '#f59e0b' }} /> Optimistic
        </span>
      </div>
    </div>
  );
}

/* ── Unit Economics ──────────────────────────────────────────────────────── */

function UnitEconomics() {
  const metrics = [
    { label: 'Pro Tier', value: '$19/mo', sub: '15M tokens included' },
    { label: 'Ultra Tier', value: '$39/mo', sub: '40M tokens included' },
    { label: 'Enterprise', value: '$79/mo', sub: '100M tokens, SSO, priority' },
    { label: 'Free->Paid Conv.', value: '3-5%', sub: 'OSS benchmark: 1-3%, top quartile: 3-5%' },
    { label: 'CAC (organic)', value: '~$0', sub: '1,354+ installs, $0 marketing' },
    { label: 'Our Cost (Qwen)', value: '~$0.30/M', sub: 'Blended cost at 50% enterprise pricing' },
    { label: 'Gross Margin', value: '62-76%', sub: 'Depending on tier, BYOK = zero cost' },
    { label: 'Combined TAM', value: '$93B+', sub: 'Addressable markets (2026)' },
  ];

  return (
    <div style={cardStyle}>
      <h3 style={{ fontSize: 14, fontWeight: 400, color: theme.text, margin: '0 0 12px 0' }}>
        Unit Economics &amp; Key Metrics
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {metrics.map((m) => (
          <div key={m.label} style={statBoxStyle}>
            <div style={{ fontSize: 11, color: theme.textMuted }}>{m.label}</div>
            <div style={{ fontSize: 15, fontWeight: 400, color: theme.text }}>{m.value}</div>
            <div style={{ fontSize: 11, color: theme.textSecondary }}>{m.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Revenue Streams Breakdown ───────────────────────────────────────────── */

function RevenueStreams() {
  const streams = [
    {
      name: 'Managed API (Pro tier)',
      pct: '40-50%',
      desc: 'Managed API plans: Pro $19/mo (15M tokens), Ultra $39/mo (40M tokens), Enterprise $79/mo (100M tokens). Qwen at 50% enterprise pricing.',
      timeline: 'Now',
    },
    {
      name: 'Team / Enterprise',
      pct: '15-25%',
      desc: 'Enterprise $79/mo/seat — shared workspace, admin controls, priority support, SSO.',
      timeline: 'Year 2-3',
    },
    {
      name: 'Education / Learning',
      pct: '15-20%',
      desc: 'Teach mode premium: advanced curriculums, certification tracking, institutional licences. Free tier remains generous.',
      timeline: 'Year 1-2',
    },
    {
      name: 'Companion Premium',
      pct: '5-10%',
      desc: 'Mobile app premium features: offline mode, advanced voice, cross-device sync, priority API access.',
      timeline: 'Year 1-2',
    },
    {
      name: 'Token Top-ups',
      pct: '5-10%',
      desc: 'Pay-as-you-go token bundles: 5M/$5, 15M/$12, 50M/$30 for burst usage beyond plan limits.',
      timeline: 'Now',
    },
    {
      name: 'Marketplace / Plugins',
      pct: '5-10%',
      desc: 'Revenue share on premium community tools and integrations.',
      timeline: 'Year 3-4',
    },
  ];

  return (
    <div style={cardStyle}>
      <h3 style={{ fontSize: 14, fontWeight: 400, color: theme.text, margin: '0 0 12px 0' }}>Revenue Streams</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {streams.map((s) => (
          <div key={s.name} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: theme.inputBg, borderRadius: 8, padding: 12 }}>
            <div style={{
              flexShrink: 0,
              background: 'rgba(168,85,247,0.2)',
              color: theme.accent,
              fontSize: 11,
              fontWeight: 400,
              borderRadius: 6,
              padding: '2px 8px',
            }}>
              {s.pct}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 400, color: theme.text }}>{s.name}</span>
                <span style={{
                  background: theme.cardBg,
                  color: theme.textMuted,
                  fontSize: 10,
                  borderRadius: 9999,
                  padding: '2px 8px',
                }}>
                  {s.timeline}
                </span>
              </div>
              <p style={{ fontSize: 11, color: theme.textSecondary, marginTop: 4, margin: '4px 0 0 0' }}>{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Funding Tab ─────────────────────────────────────────────────────────── */

function FundingTab() {
  const fundingApplications = [
    {
      name: 'NGI Zero Commons Fund',
      org: 'NLnet Foundation',
      status: 'Submitted' as const,
      amount: '\u20AC50,000',
      deadline: 'April 1, 2026',
      description: 'Supporting open-source digital infrastructure with a focus on privacy, security, and trust. Funds open-source projects that contribute to an open internet.',
      linkedObjectives: objectives.filter((o) => o.funding.includes('NGI Zero Commons')),
    },
    {
      name: 'Sovereign Tech Fund',
      org: 'German Federal Government',
      status: 'In Progress' as const,
      amount: '\u20AC50K+',
      deadline: 'Rolling',
      description: 'Investing in the maintenance and improvement of critical open-source digital infrastructure. No upper funding limit for qualifying projects.',
      linkedObjectives: objectives.filter((o) => o.funding.includes('Sovereign Tech Fund')),
    },
  ];

  const statusStyles: Record<string, { color: string; bg: string }> = {
    'Submitted': { color: theme.green, bg: theme.greenBg },
    'In Progress': { color: theme.yellow, bg: theme.yellowBg },
  };

  // Build mapping: requirement key -> objective ids
  const requirementMapping: { fund: string; requirement: string; objectiveIds: string[] }[] = [
    { fund: 'NGI Zero Commons', requirement: 'Security audit and hardening', objectiveIds: ['security'] },
    { fund: 'NGI Zero Commons', requirement: 'Testing infrastructure', objectiveIds: ['testing'] },
    { fund: 'NGI Zero Commons', requirement: 'Teaching and learning system', objectiveIds: ['learning'] },
    { fund: 'NGI Zero Commons', requirement: 'Documentation and community', objectiveIds: ['community'] },
    { fund: 'NGI Zero Commons', requirement: 'European team building', objectiveIds: ['team'] },
    { fund: 'Sovereign Tech Fund', requirement: 'Security hardening', objectiveIds: ['security'] },
    { fund: 'Sovereign Tech Fund', requirement: 'Testing and resilience', objectiveIds: ['testing', 'resilience'] },
    { fund: 'Sovereign Tech Fund', requirement: 'Multi-platform support', objectiveIds: ['platform'] },
    { fund: 'Sovereign Tech Fund', requirement: 'European team building', objectiveIds: ['team'] },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Funding Application Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
        {fundingApplications.map((app) => {
          const st = statusStyles[app.status];
          const completeCount = app.linkedObjectives.filter((o) => o.status === 'complete').length;
          const totalLinked = app.linkedObjectives.length;
          const progressPct = totalLinked > 0 ? Math.round((completeCount / totalLinked) * 100) : 0;

          return (
            <div key={app.name} style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 400, color: theme.text }}>{app.name}</div>
                  <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>{app.org}</div>
                </div>
                <span style={chipStyle(st.bg, st.color)}>{app.status}</span>
              </div>

              <p style={{ fontSize: 11, color: theme.textSecondary, lineHeight: 1.6, margin: '0 0 14px 0' }}>
                {app.description}
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 14 }}>
                <div style={statBoxStyle}>
                  <div style={{ fontSize: 10, color: theme.textMuted }}>Amount</div>
                  <div style={{ fontSize: 15, fontWeight: 400, color: theme.text }}>{app.amount}</div>
                </div>
                <div style={statBoxStyle}>
                  <div style={{ fontSize: 10, color: theme.textMuted }}>Deadline</div>
                  <div style={{ fontSize: 15, fontWeight: 400, color: theme.text }}>{app.deadline}</div>
                </div>
              </div>

              {/* Linked objectives progress */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: theme.textMuted, marginBottom: 4 }}>
                  <span>{totalLinked} linked objectives</span>
                  <span>{completeCount}/{totalLinked} complete</span>
                </div>
                <div style={{ height: 6, width: '100%', borderRadius: 9999, background: theme.inputBg }}>
                  <div
                    style={{
                      height: 6,
                      borderRadius: 9999,
                      background: progressPct === 100 ? theme.green : theme.accent,
                      width: `${progressPct}%`,
                      transition: 'width 0.3s',
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Requirement → Objective Mapping */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: 14, fontWeight: 400, color: theme.text, margin: '0 0 14px 0' }}>
          Requirement to Objective Mapping
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {requirementMapping.map((rm, idx) => {
            const linkedObjs = rm.objectiveIds.map((id) => objectives.find((o) => o.id === id)).filter(Boolean) as Objective[];
            const allComplete = linkedObjs.every((o) => o.status === 'complete');
            const anyInProgress = linkedObjs.some((o) => o.status === 'in-progress');

            return (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: theme.inputBg,
                  borderRadius: theme.radiusSm,
                  padding: '8px 14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span style={chipStyle(theme.accentBg, theme.accent)}>{rm.fund}</span>
                  <span style={{ fontSize: 12, fontWeight: 300, color: theme.text }}>{rm.requirement}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {linkedObjs.map((o) => (
                    <span key={o.id} style={{ fontSize: 10, color: theme.textMuted }}>{o.title.split(' ')[0]}</span>
                  ))}
                  <span
                    style={chipStyle(
                      allComplete ? theme.greenBg : anyInProgress ? theme.yellowBg : theme.inputBg,
                      allComplete ? theme.green : anyInProgress ? theme.yellow : theme.textMuted,
                    )}
                  >
                    {allComplete ? 'complete' : anyInProgress ? 'in progress' : 'not started'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Objective Card ──────────────────────────────────────────────────────── */

const statusConfig: Record<Objective['status'], { label: string; color: string; bg: string }> = {
  'not-started': { label: 'Not Started', color: theme.textMuted, bg: theme.inputBg },
  'in-progress': { label: 'In Progress', color: theme.yellow, bg: theme.yellowBg },
  'complete': { label: 'Complete', color: theme.green, bg: theme.greenBg },
};

const priorityConfig: Record<Objective['priority'], { label: string; color: string; bg: string }> = {
  critical: { label: 'Critical', color: theme.red, bg: theme.redBg },
  high: { label: 'High', color: theme.orange, bg: theme.orangeBg },
  medium: { label: 'Medium', color: theme.blue, bg: theme.blueBg },
};

function ObjectiveCard({ obj }: { obj: Objective }) {
  const [expanded, setExpanded] = useState(false);
  const status = statusConfig[obj.status];
  const priority = priorityConfig[obj.priority];
  const doneCount = obj.activities.filter((a) => a.done).length;
  const totalCount = obj.activities.length;

  return (
    <div style={{ background: theme.cardBg, border: 'none', borderRadius: 12, overflow: 'hidden' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          width: '100%',
          alignItems: 'center',
          gap: 12,
          padding: 20,
          textAlign: 'left',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: theme.text,
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ flexShrink: 0, color: theme.textMuted, transition: 'transform 0.15s', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <div style={{ display: 'flex', flex: 1, flexWrap: 'wrap', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <h3 style={{ fontSize: 13, fontWeight: 400, color: theme.text, margin: 0 }}>{obj.title}</h3>
          <span style={chipStyle(status.bg, status.color)}>{status.label}</span>
          <span style={{ ...chipStyle(theme.inputBg, theme.textMuted), fontWeight: 400 }}>
            {doneCount}/{totalCount} done
          </span>
          <span style={chipStyle(priority.bg, priority.color)}>{priority.label}</span>
          {obj.funding.map((f) => (
            <span key={f} style={{ ...chipStyle(theme.inputBg, theme.textMuted), fontWeight: 400 }}>{f}</span>
          ))}
        </div>
      </button>

      {expanded && (
        <div style={{ padding: '0 20px 20px 20px' }}>
          <p style={{ fontSize: 11, color: theme.textSecondary, marginBottom: 12, marginTop: 0 }}>{obj.description}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {obj.activities.map((a, i) => (
              <div key={i} style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                background: theme.inputBg,
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 11,
                color: theme.textSecondary,
              }}>
                <span style={{ marginTop: 2, flexShrink: 0 }}>
                  {a.done ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={theme.green} strokeWidth="2">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={theme.textMuted} strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                    </svg>
                  )}
                </span>
                <span style={a.done ? { color: theme.textMuted, textDecoration: 'line-through' } : undefined}>
                  {a.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Objectives Tab ──────────────────────────────────────────────────────── */

function ObjectivesTab() {
  const [viewTab, setViewTab] = useState<'active' | 'completed'>('active');

  const total = objectives.length;
  const activeObjectives = objectives.filter((o) => o.status !== 'complete');
  const completedObjectives = objectives.filter((o) => o.status === 'complete');
  const complete = completedObjectives.length;
  const inProgress = objectives.filter((o) => o.status === 'in-progress').length;
  const notStarted = objectives.filter((o) => o.status === 'not-started').length;
  const displayedObjectives = viewTab === 'active' ? activeObjectives : completedObjectives;

  const subTabStyle = (active: boolean): React.CSSProperties => ({
    background: active ? theme.cardBg : 'transparent',
    color: active ? theme.text : theme.textMuted,
    border: 'none',
    borderRadius: 6,
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 400,
    cursor: 'pointer',
    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
    transition: 'all 0.15s',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Overview */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: 14, fontWeight: 400, color: theme.text, margin: '0 0 12px 0' }}>
          Strategic Objectives Overview
        </h3>
        <p style={{ fontSize: 11, color: theme.textSecondary, marginBottom: 16, marginTop: 0 }}>
          Long-term objectives aligned with funding applications and project sustainability goals.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <div style={{ ...statBoxStyle, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: theme.textMuted }}>Total</div>
            <div style={{ fontSize: 18, fontWeight: 400, color: theme.text }}>{total}</div>
          </div>
          <div style={{ ...statBoxStyle, textAlign: 'center', background: 'rgba(16,185,129,0.1)' }}>
            <div style={{ fontSize: 11, color: theme.green }}>Complete</div>
            <div style={{ fontSize: 18, fontWeight: 400, color: theme.green }}>{complete}</div>
          </div>
          <div style={{ ...statBoxStyle, textAlign: 'center', background: 'rgba(245,158,11,0.1)' }}>
            <div style={{ fontSize: 11, color: theme.yellow }}>In Progress</div>
            <div style={{ fontSize: 18, fontWeight: 400, color: theme.yellow }}>{inProgress}</div>
          </div>
          <div style={{ ...statBoxStyle, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: theme.textMuted }}>Not Started</div>
            <div style={{ fontSize: 18, fontWeight: 400, color: theme.textMuted }}>{notStarted}</div>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: theme.textMuted, marginBottom: 4 }}>
            <span>Overall Progress</span>
            <span>{total > 0 ? Math.round((complete / total) * 100) : 0}%</span>
          </div>
          <div style={{ display: 'flex', height: 8, gap: 2, overflow: 'hidden', borderRadius: 9999 }}>
            {complete > 0 && <div style={{ height: '100%', borderRadius: 9999, background: '#10b981', width: `${(complete / total) * 100}%` }} />}
            {inProgress > 0 && <div style={{ height: '100%', borderRadius: 9999, background: '#f59e0b', width: `${(inProgress / total) * 100}%` }} />}
            {notStarted > 0 && <div style={{ height: '100%', borderRadius: 9999, background: theme.inputBg, width: `${(notStarted / total) * 100}%` }} />}
          </div>
        </div>
      </div>

      {/* Active / Completed toggle */}
      <div style={{ display: 'flex', gap: 4, background: theme.inputBg, borderRadius: 8, padding: 4, width: 'fit-content' }}>
        <button onClick={() => setViewTab('active')} style={subTabStyle(viewTab === 'active')}>
          Active ({activeObjectives.length})
        </button>
        <button onClick={() => setViewTab('completed')} style={subTabStyle(viewTab === 'completed')}>
          Completed ({completedObjectives.length})
        </button>
      </div>

      {/* Objective cards */}
      {displayedObjectives.length === 0 ? (
        <div style={{
          background: `${theme.cardBg}80`,
          border: 'none',
          borderRadius: 12,
          padding: 32,
          textAlign: 'center',
        }}>
          <p style={{ fontSize: 13, color: theme.textMuted, margin: 0 }}>
            {viewTab === 'active' ? 'All objectives are complete!' : 'No completed objectives yet.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {displayedObjectives.map((obj) => <ObjectiveCard key={obj.id} obj={obj} />)}
        </div>
      )}
    </div>
  );
}

/* ── Sources Section ─────────────────────────────────────────────────────── */

function SourcesSection() {
  const sources = [
    {
      category: 'Market Size & Growth',
      items: [
        { name: 'AI Coding Tools Market', source: 'GetPanto / Industry Reports', url: 'https://www.getpanto.ai/blog/ai-coding-assistant-statistics' },
        { name: 'AI in Education Market', source: 'Precedence Research', url: 'https://www.precedenceresearch.com/ai-in-education-market' },
        { name: 'AI Tutoring Market', source: 'Grand View Research', url: 'https://www.grandviewresearch.com/industry-analysis/ai-tutors-market-report' },
        { name: 'AI Personalised Learning', source: 'Research & Markets', url: 'https://www.researchandmarkets.com/reports/6225935/ai-powered-personalized-learning-path-market' },
      ],
    },
    {
      category: 'Competitor Data',
      items: [
        { name: 'Cursor $2B ARR', source: 'TechBuzz', url: 'https://www.techbuzz.ai/articles/cursor-hits-2b-arr-doubles-revenue-in-just-3-months' },
        { name: 'Copilot 4.7M subs', source: 'TechBullion', url: 'https://techbullion.com/github-copilot-reaches-4-7-million-subscribers-ai-powered-software-development-in-2026/' },
        { name: 'Copilot 20M all-time users', source: 'TechCrunch', url: 'https://techcrunch.com/2025/07/30/github-copilot-crosses-20-million-all-time-users/' },
      ],
    },
    {
      category: 'Benchmarks',
      items: [
        { name: 'OSS SaaS conversion rates', source: 'OpenView Partners', url: 'https://openviewpartners.com/blog/open-source-saas-benchmarks' },
        { name: 'Developer tool metrics', source: 'ChartMogul', url: 'https://chartmogul.com/reports/saas-benchmarks' },
        { name: 'SaaS growth benchmarks', source: 'CB Insights', url: 'https://www.cbinsights.com/research/saas-growth-benchmarks' },
      ],
    },
  ];

  return (
    <div style={cardStyle}>
      <h3 style={{ fontSize: 14, fontWeight: 400, color: theme.text, margin: '0 0 12px 0' }}>
        Sources &amp; References
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {sources.map((group) => (
          <div key={group.category}>
            <h4 style={{ fontSize: 11, fontWeight: 400, color: theme.textMuted, margin: '0 0 8px 0' }}>
              {group.category}
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {group.items.map((item) => (
                <a
                  key={item.name}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: theme.inputBg,
                    borderRadius: 8,
                    padding: '8px 12px',
                    fontSize: 11,
                    textDecoration: 'none',
                    transition: 'background 0.15s',
                    color: 'inherit',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = theme.inputBg)}
                >
                  <span style={{ color: theme.textSecondary }}>{item.name}</span>
                  <span style={{ color: theme.textMuted }}>{item.source} &rarr;</span>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 10, color: theme.textMuted, marginTop: 12, marginBottom: 0 }}>
        All market data as of March 2026. Figures in USD unless otherwise stated.
      </p>
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────────────── */

type Tab = 'dashboard' | 'projections' | 'funding' | 'objectives' | 'sources';

export default function Financials() {
  const [tab, setTab] = useState<Tab>('dashboard');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'projections', label: 'Projections' },
    { key: 'funding', label: 'Funding' },
    { key: 'objectives', label: 'Objectives' },
    { key: 'sources', label: 'Sources' },
  ];

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    background: active ? theme.cardBg : 'transparent',
    color: active ? theme.text : theme.textMuted,
    border: 'none',
    borderRadius: 6,
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: active ? 400 : 300,
    cursor: 'pointer',
    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
    transition: 'all 0.15s',
  });

  return (
    <div style={{ padding: theme.pagePadding, overflowY: 'auto', height: '100%', background: theme.pageBg }}>

      {/* Header */}
      <PageHeader title="Financials" subtitle="Live dashboard, revenue projections, funding, and strategic objectives" />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, background: theme.inputBg, borderRadius: 8, padding: 4, width: 'fit-content', marginBottom: 24 }}>
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={tabBtnStyle(tab === t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'dashboard' && <DashboardTab />}

      {tab === 'projections' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <MarketContext />
          <UnitEconomics />
          <RevenueStreams />
          <ComparisonChart />
          {scenarios.map((s) => (
            <ScenarioCard key={s.key} scenario={s} />
          ))}

          {/* Methodology */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: 14, fontWeight: 400, color: theme.text, margin: '0 0 8px 0' }}>Methodology</h3>
            <p style={{ fontSize: 11, color: theme.textSecondary, lineHeight: 1.7, margin: 0 }}>
              Projections are based on publicly available data from Cursor ($2B ARR, $29.3B valuation, 18% market share, 60% enterprise),
              GitHub Copilot (4.7M paid subs, 20M all-time users, $451M-$848M ARR, 42% market share), Windsurf (acquired for $250M),
              and industry benchmarks from GetPanto, Grand View Research, Precedence Research, Research &amp; Markets, CB Insights, OpenView Partners,
              and ChartMogul. Market data covers addressable segments: AI coding tools ($7.37B), AI in education ($9.58B),
              AI tutoring ($3.55B), AI personalised learning ($6B), AI productivity ($17B), AI companions ($49.5B) — combined TAM of $93B+ (2026).
              Conversion rates use OSS SaaS benchmarks (1-3% range, top quartile 3-5%).
              Cost estimates include infrastructure, API provider margins (Qwen at ~$0.30/M blended), and team salaries scaled to each scenario.
              Pricing: Pro $19/mo (15M tokens), Ultra $39/mo (40M tokens), Enterprise $79/mo (100M tokens). Top-ups: 5M/$5, 15M/$12, 50M/$30.
              Gross margins of 62-76% depending on tier. BYOK users cost nothing to serve.
              Ava&apos;s unique multi-market position is reflected across all scenarios.
              All figures in USD. Updated March 2026.
            </p>
          </div>

          <SourcesSection />
        </div>
      )}

      {tab === 'funding' && <FundingTab />}

      {tab === 'objectives' && <ObjectivesTab />}

      {tab === 'sources' && <SourcesSection />}
    </div>
  );
}
