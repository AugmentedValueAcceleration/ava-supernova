// Onboarding flow — shared data model (dashboard surface).
//
// MIRROR OF RECORD: packages/ide/src/onboarding/flow.ts
// Keep structurally identical (same step ids, path ids, mode ids, copy keys).
// Copy lives in i18n under `onboarding.*` (core en.ts + fallbacks).

export type CanonicalMode = 'work' | 'write' | 'plan' | 'chat' | 'teach' | 'security' | 'brainstorm';
export type Destination = 'chat' | 'journal' | 'learning' | 'health' | 'home';

export interface OnboardingMode {
  id: CanonicalMode;
  prefix: string;
  labelKey: string;
  exampleKey: string;
}

export interface OnboardingPath {
  id: string;
  icon: string;
  labelKey: string;
  blurbKey: string;
  recommendedMode: CanonicalMode;
  tailoredKeys: string[];
  destination: Destination;
}

export interface BreadthItem {
  icon: string;
  labelKey: string;
  blurbKey: string;
}

export interface BreadthGroup {
  titleKey: string;
  items: BreadthItem[];
  surfaces: ('extension' | 'ide')[];
}

export interface OnboardingStep {
  id: 'consent' | 'identity' | 'path' | 'tailored' | 'breadth' | 'connect' | 'desktop' | 'hours' | 'ready';
  surfaces: ('extension' | 'ide')[];
}

export const MODES: OnboardingMode[] = [
  { id: 'work', prefix: '>>', labelKey: 'onboarding.mode.work.label', exampleKey: 'onboarding.mode.work.example' },
  { id: 'write', prefix: '<<', labelKey: 'onboarding.mode.write.label', exampleKey: 'onboarding.mode.write.example' },
  { id: 'plan', prefix: '::', labelKey: 'onboarding.mode.plan.label', exampleKey: 'onboarding.mode.plan.example' },
  { id: 'chat', prefix: '..', labelKey: 'onboarding.mode.chat.label', exampleKey: 'onboarding.mode.chat.example' },
  { id: 'teach', prefix: '??', labelKey: 'onboarding.mode.teach.label', exampleKey: 'onboarding.mode.teach.example' },
  { id: 'security', prefix: '!!', labelKey: 'onboarding.mode.security.label', exampleKey: 'onboarding.mode.security.example' },
  { id: 'brainstorm', prefix: '**', labelKey: 'onboarding.mode.brainstorm.label', exampleKey: 'onboarding.mode.brainstorm.example' },
];

export const PATHS: OnboardingPath[] = [
  {
    id: 'build', icon: '🛠️', labelKey: 'onboarding.path.build.label', blurbKey: 'onboarding.path.build.blurb',
    recommendedMode: 'work', destination: 'chat',
    tailoredKeys: ['onboarding.tailored.build.ship', 'onboarding.tailored.build.plan', 'onboarding.tailored.build.audit'],
  },
  {
    id: 'write', icon: '✍️', labelKey: 'onboarding.path.write.label', blurbKey: 'onboarding.path.write.blurb',
    recommendedMode: 'write', destination: 'chat',
    tailoredKeys: ['onboarding.tailored.write.draft', 'onboarding.tailored.write.shape', 'onboarding.tailored.write.brainstorm'],
  },
  {
    id: 'learn', icon: '🎓', labelKey: 'onboarding.path.learn.label', blurbKey: 'onboarding.path.learn.blurb',
    recommendedMode: 'teach', destination: 'learning',
    tailoredKeys: ['onboarding.tailored.learn.curriculum', 'onboarding.tailored.learn.pace', 'onboarding.tailored.learn.quiz'],
  },
  {
    id: 'wellbeing', icon: '🌿', labelKey: 'onboarding.path.wellbeing.label', blurbKey: 'onboarding.path.wellbeing.blurb',
    recommendedMode: 'chat', destination: 'health',
    tailoredKeys: ['onboarding.tailored.wellbeing.fitness', 'onboarding.tailored.wellbeing.recipes', 'onboarding.tailored.wellbeing.checkin'],
  },
  {
    id: 'reflect', icon: '📔', labelKey: 'onboarding.path.reflect.label', blurbKey: 'onboarding.path.reflect.blurb',
    recommendedMode: 'chat', destination: 'journal',
    tailoredKeys: ['onboarding.tailored.reflect.journal', 'onboarding.tailored.reflect.remember', 'onboarding.tailored.reflect.think'],
  },
  {
    id: 'explore', icon: '✨', labelKey: 'onboarding.path.explore.label', blurbKey: 'onboarding.path.explore.blurb',
    recommendedMode: 'chat', destination: 'home',
    tailoredKeys: ['onboarding.tailored.explore.everything', 'onboarding.tailored.explore.modes', 'onboarding.tailored.explore.yours'],
  },
];

export const BREADTH: BreadthGroup[] = [
  {
    titleKey: 'onboarding.breadth.group.everyday', surfaces: ['extension', 'ide'],
    items: [
      { icon: '🏋️', labelKey: 'onboarding.feature.health.label', blurbKey: 'onboarding.feature.health.blurb' },
      { icon: '🥗', labelKey: 'onboarding.feature.recipes.label', blurbKey: 'onboarding.feature.recipes.blurb' },
      { icon: '🎓', labelKey: 'onboarding.feature.learning.label', blurbKey: 'onboarding.feature.learning.blurb' },
      { icon: '📔', labelKey: 'onboarding.feature.journal.label', blurbKey: 'onboarding.feature.journal.blurb' },
    ],
  },
  {
    titleKey: 'onboarding.breadth.group.create', surfaces: ['extension', 'ide'],
    items: [
      { icon: '🎨', labelKey: 'onboarding.feature.images.label', blurbKey: 'onboarding.feature.images.blurb' },
      { icon: '🎵', labelKey: 'onboarding.feature.music.label', blurbKey: 'onboarding.feature.music.blurb' },
      { icon: '🎬', labelKey: 'onboarding.feature.video.label', blurbKey: 'onboarding.feature.video.blurb' },
    ],
  },
  {
    titleKey: 'onboarding.breadth.group.stays', surfaces: ['extension', 'ide'],
    items: [
      { icon: '🧠', labelKey: 'onboarding.feature.memory.label', blurbKey: 'onboarding.feature.memory.blurb' },
      { icon: '✓', labelKey: 'onboarding.feature.tasks.label', blurbKey: 'onboarding.feature.tasks.blurb' },
      { icon: '🔒', labelKey: 'onboarding.feature.privacy.label', blurbKey: 'onboarding.feature.privacy.blurb' },
    ],
  },
  {
    titleKey: 'onboarding.breadth.group.desktop', surfaces: ['ide'],
    items: [
      { icon: '🖥️', labelKey: 'onboarding.feature.desktop.label', blurbKey: 'onboarding.feature.desktop.blurb' },
    ],
  },
];

export const STEPS: OnboardingStep[] = [
  { id: 'consent', surfaces: ['ide'] },
  { id: 'identity', surfaces: ['extension', 'ide'] },
  { id: 'path', surfaces: ['extension', 'ide'] },
  { id: 'tailored', surfaces: ['extension', 'ide'] },
  { id: 'breadth', surfaces: ['extension', 'ide'] },
  { id: 'connect', surfaces: ['extension', 'ide'] },
  { id: 'desktop', surfaces: ['ide'] },
  { id: 'hours', surfaces: ['ide'] },
  { id: 'ready', surfaces: ['extension', 'ide'] },
];

export function stepsFor(surface: 'extension' | 'ide'): OnboardingStep[] {
  return STEPS.filter((s) => s.surfaces.includes(surface));
}

export function pathById(id: string): OnboardingPath | undefined {
  return PATHS.find((p) => p.id === id);
}
