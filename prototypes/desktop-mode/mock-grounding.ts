// Hand-written ScreenStates for the fake task
//
//   "Open the GitHub notifications page and tell me the three newest ones."
//
// This simulates what Scout would see at each step. In the real build this
// comes from the grounding layer (UIA / Playwright / OmniParser). For the
// prototype we need predictable inputs so token counts and persona behaviour
// are measurable, not noisy.

import type { ScreenState } from './types';

/** Step 1 — browser on Google. Task has just started. */
export const STATE_STEP_1: ScreenState = {
  step: 1,
  app: 'Chromium',
  url: 'https://www.google.com',
  groundingSource: 'playwright',
  confidence: 'high',
  viewport: { w: 1440, h: 900 },
  elements: [
    { id: 'search', kind: 'textbox', name: 'Search', role: 'searchbox', selector: 'textarea[name="q"]', source: 'playwright' },
    { id: 'search-btn', kind: 'button', name: 'Google Search', role: 'button', selector: 'input[name="btnK"]', source: 'playwright' },
    { id: 'lucky-btn', kind: 'button', name: "I'm Feeling Lucky", role: 'button', selector: 'input[name="btnI"]', source: 'playwright' },
    { id: 'gmail-link', kind: 'link', name: 'Gmail', role: 'link', selector: 'a[href*="mail.google"]', source: 'playwright' },
    { id: 'images-link', kind: 'link', name: 'Images', role: 'link', selector: 'a[href*="imghp"]', source: 'playwright' },
  ],
  notes: 'Fresh browser session, no search performed yet. User is on github.com whitelist — navigation to github.com/notifications is allowed.',
};

/** Step 2 — after navigation, GitHub notifications page logged in. */
export const STATE_STEP_2: ScreenState = {
  step: 2,
  app: 'Chromium',
  url: 'https://github.com/notifications',
  groundingSource: 'playwright',
  confidence: 'high',
  viewport: { w: 1440, h: 900 },
  elements: [
    { id: 'nav-header', kind: 'region', name: 'Site header', role: 'banner', selector: 'header.AppHeader', source: 'playwright' },
    { id: 'notifications-title', kind: 'heading', name: 'Inbox', role: 'heading', selector: 'h2.f1-light', source: 'playwright' },
    { id: 'filter-unread', kind: 'link', name: 'Unread', role: 'link', selector: 'a[href*="query=is%3Aunread"]', source: 'playwright' },
    { id: 'filter-participating', kind: 'link', name: 'Participating', role: 'link', selector: 'a[href*="reason%3Aparticipating"]', source: 'playwright' },
    { id: 'notif-1', kind: 'listitem', name: 'PR #4821 — "Fix flaky memory test" — updated 12 minutes ago', role: 'listitem', selector: 'li.notifications-list-item:nth-child(1)', source: 'playwright' },
    { id: 'notif-2', kind: 'listitem', name: 'Issue #3127 — "Dashboard nav breaks on mobile Safari" — updated 1 hour ago', role: 'listitem', selector: 'li.notifications-list-item:nth-child(2)', source: 'playwright' },
    { id: 'notif-3', kind: 'listitem', name: 'PR #4812 — "Bump tsup to 9.0.1" — updated 3 hours ago', role: 'listitem', selector: 'li.notifications-list-item:nth-child(3)', source: 'playwright' },
    { id: 'notif-4', kind: 'listitem', name: 'Discussion #812 — "Where are we landing on the v1 freeze?" — updated yesterday', role: 'listitem', selector: 'li.notifications-list-item:nth-child(4)', source: 'playwright' },
  ],
  notes: 'Notifications page loaded. User session cookies valid. Four notifications visible above the fold, ordered by update time descending.',
};

/** Step 3 — extraction step, same page, Planner/Actor should decide the task is done. */
export const STATE_STEP_3: ScreenState = {
  ...STATE_STEP_2,
  step: 3,
};

/** Ordered by step number. The orchestrator reads from this array. */
export const STATES: ScreenState[] = [STATE_STEP_1, STATE_STEP_2, STATE_STEP_3];

/** Return the ScreenState for a given step (1-indexed). Last state repeats if the run exceeds the array. */
export function groundingForStep(step: number): ScreenState {
  if (step <= 0) return STATES[0];
  const idx = Math.min(step - 1, STATES.length - 1);
  return { ...STATES[idx], step };
}
