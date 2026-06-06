// Canonical fact table for the 24 specialist personas across 5 mode teams.
// Chat mode has no personas. IDs are mode-prefixed (e.g. 'work.scout') so names can repeat across modes.

import type { ModeId } from './modes.js';

// Chat and Write run without a persona conductor (just Ava), so they have no
// persona team here.
export type PersonaMode = Exclude<ModeId, 'chat' | 'write'>;

export interface PersonaFact {
  id: string;
  name: string;
  mode: PersonaMode;
  role: string;
  order: number;
}

export const PERSONAS: PersonaFact[] = [
  // Work (6) — Scout → Architect → Verifier → Sequencer → Challenger → Builder
  { id: 'work.scout', name: 'Scout', mode: 'work', order: 1, role: 'Maps the codebase and surfaces current state before anyone plans or builds.' },
  { id: 'work.architect', name: 'Architect', mode: 'work', order: 2, role: 'Designs the approach from Scout findings and produces the implementation blueprint.' },
  { id: 'work.verifier', name: 'Verifier', mode: 'work', order: 3, role: 'Fact-checks the plan and confirms assumptions are correct before Builder runs.' },
  { id: 'work.sequencer', name: 'Sequencer', mode: 'work', order: 4, role: 'Breaks the verified plan into ordered, dependency-aware implementation steps.' },
  { id: 'work.challenger', name: 'Challenger', mode: 'work', order: 5, role: 'Questions the plan to prevent over-engineering and surfaces simpler alternatives.' },
  { id: 'work.builder', name: 'Builder', mode: 'work', order: 6, role: 'Executes the verified and sequenced plan to deliver the final implementation.' },

  // Plan (3) — Researcher → Architect → Challenger
  { id: 'plan.researcher', name: 'Researcher', mode: 'plan', order: 1, role: 'Gathers evidence about competitors, trends, and user needs before strategy decisions.' },
  { id: 'plan.architect', name: 'Architect', mode: 'plan', order: 2, role: 'Analyses codebase patterns and proposes strategic approaches with trade-offs.' },
  { id: 'plan.challenger', name: 'Challenger', mode: 'plan', order: 3, role: 'Challenges strategic decisions, guards timing, and prevents scope creep.' },

  // Teach (5) — Curriculum Architect → Content Writer → Fact Checker → Quiz Master → Tutor
  { id: 'teach.curriculum_architect', name: 'Curriculum Architect', mode: 'teach', order: 1, role: 'Designs learning paths with dependency ordering and balanced progression.' },
  { id: 'teach.content_writer', name: 'Content Writer', mode: 'teach', order: 2, role: 'Writes clear explanations with examples and analogies tailored to the learner.' },
  { id: 'teach.fact_checker', name: 'Fact Checker', mode: 'teach', order: 3, role: 'Verifies lesson content is accurate and flags outdated information or errors.' },
  { id: 'teach.quiz_master', name: 'Quiz Master', mode: 'teach', order: 4, role: 'Creates assessments that test understanding rather than memorisation.' },
  { id: 'teach.tutor', name: 'Tutor', mode: 'teach', order: 5, role: 'Delivers lessons with Socratic guidance, checks understanding, adapts to pace.' },

  // Security (5) — Recon → Scanner → CVE Researcher → Verifier → Reporter
  { id: 'security.recon', name: 'Recon', mode: 'security', order: 1, role: 'Maps the attack surface — entry points, tech stack, data flows.' },
  { id: 'security.scanner', name: 'Scanner', mode: 'security', order: 2, role: 'Systematically checks each OWASP category against the identified attack surface.' },
  { id: 'security.cve_researcher', name: 'CVE Researcher', mode: 'security', order: 3, role: 'Looks up known CVEs in dependencies and assesses real-world impact.' },
  { id: 'security.verifier', name: 'Verifier', mode: 'security', order: 4, role: 'Confirms each finding is real and eliminates false positives with proof.' },
  { id: 'security.reporter', name: 'Reporter', mode: 'security', order: 5, role: 'Structures verified findings into a severity-sorted, actionable report.' },

  // Brainstorm (5) — Explorer → Researcher → Ideator → Challenger → Refiner
  { id: 'brainstorm.explorer', name: 'Explorer', mode: 'brainstorm', order: 1, role: 'Mines user context and memory to build a profile for personalised ideation.' },
  { id: 'brainstorm.researcher', name: 'Researcher', mode: 'brainstorm', order: 2, role: 'Researches market gaps, trends, and demand signals to ground ideation.' },
  { id: 'brainstorm.ideator', name: 'Ideator', mode: 'brainstorm', order: 3, role: 'Generates specific, actionable ideas tailored to the person and the market.' },
  { id: 'brainstorm.challenger', name: 'Challenger', mode: 'brainstorm', order: 4, role: 'Stress-tests ideas and cuts weak ones ruthlessly against reality.' },
  { id: 'brainstorm.refiner', name: 'Refiner', mode: 'brainstorm', order: 5, role: 'Sharpens surviving ideas into concrete next steps and validation tests.' },
];

export const PERSONAS_BY_MODE: Record<PersonaMode, PersonaFact[]> = {
  work: PERSONAS.filter(p => p.mode === 'work').sort((a, b) => a.order - b.order),
  plan: PERSONAS.filter(p => p.mode === 'plan').sort((a, b) => a.order - b.order),
  teach: PERSONAS.filter(p => p.mode === 'teach').sort((a, b) => a.order - b.order),
  security: PERSONAS.filter(p => p.mode === 'security').sort((a, b) => a.order - b.order),
  brainstorm: PERSONAS.filter(p => p.mode === 'brainstorm').sort((a, b) => a.order - b.order),
};

export const TOTAL_PERSONA_COUNT = PERSONAS.length;
