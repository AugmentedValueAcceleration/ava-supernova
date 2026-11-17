// Canonical fact table for the 6 modes — states of thought. Brainstorm was the
// seventh until 17 Nov 2026; it is the Brainstorm room now, not a chat mode.
// ModeId keeps 'brainstorm' because the room still runs its persona team.

export type ModeId = 'work' | 'plan' | 'chat' | 'teach' | 'security' | 'brainstorm' | 'write';

export interface ModeFact {
  id: ModeId;
  prefix: string;
  displayName: string;
  mindset: string;
  usesConductor: boolean | 'conditional';
  summary: string;
}

export const MODES: ModeFact[] = [
  {
    id: 'work',
    prefix: '>>',
    displayName: 'Code',
    mindset: 'Builder — full tool access, executes plans with precision.',
    usesConductor: 'conditional',
    summary: 'Write code, run tests, ship changes. Simple tasks run directly; complex multi-file or architecture work triggers the persona conductor.',
  },
  {
    id: 'plan',
    prefix: '::',
    displayName: 'Plan',
    mindset: 'Architect — evidence-based proposals, no code changes.',
    usesConductor: true,
    summary: 'Read-only. Researches, designs approaches, challenges assumptions, and presents a plan for your approval before any execution.',
  },
  {
    id: 'chat',
    prefix: '..',
    displayName: 'Chat',
    mindset: 'Friend — personal conversation, off the clock.',
    usesConductor: false,
    summary: 'Open conversation with memory, search, journal, weather, and news. No personas, no orchestration — just Ava.',
  },
  {
    id: 'teach',
    prefix: '??',
    displayName: 'Teach',
    mindset: 'Tutor — Socratic guidance, adaptive to pace.',
    usesConductor: true,
    summary: 'Build curriculums, deliver lessons, run quizzes, track progress. Five specialists run the teaching loop.',
  },
  {
    id: 'security',
    prefix: '!!',
    displayName: 'Security',
    mindset: 'Auditor — systematic vulnerability scanning, paranoia as a virtue.',
    usesConductor: true,
    summary: 'Five-persona security team: recon, scan, CVE research, verify, report. OWASP and dependency CVE coverage end-to-end.',
  },
  {
    id: 'write',
    prefix: '<<',
    displayName: 'Write',
    mindset: 'Author — compose, edit, and design real documents.',
    usesConductor: false,
    summary: 'Author reports, proposals, articles and more in Markdown, then export branded Word/PDF. Start from a template, refine section by section, see it live. No code — just writing.',
  },
];
