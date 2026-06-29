// Pure learner-context formatter — turns a LearningStore (+ the learner's raw
// self-listed skills) into the Markdown block injected into Ava's Teach-mode
// system prompt. Shared by every host so the extension and the IDE sidecar build
// the exact same context (no node deps here — each host reads its own files and
// passes them in). The file-reading wrappers live host-side:
//   extension → src/webview/helpers.ts getLearningContext
//   IDE       → sidecar/index.mjs (reads ~/.ava/learning.json + learner.json)

import type { LearningStore } from '../tools/learning.js';
import { deriveProgression, type SkillLevel } from './progression.js';

/**
 * Format the learner's active courses, full course list and skills profile for
 * system-prompt injection. Returns undefined when there's nothing worth saying.
 *
 * @param store        Parsed learning.json (curriculums + streaks).
 * @param selfSkillsRaw The learner.json `self.skills` array (unverified claims);
 *                      pass [] if there's no learner profile.
 */
export function formatLearnerContext(
  store: LearningStore,
  selfSkillsRaw: string[] = [],
): string | undefined {
  if (!store.streaks) store.streaks = { current: 0, longest: 0, lastActiveDate: null };
  if (!Array.isArray(store.curriculums)) store.curriculums = [];

  // Active curriculums — what they're working through right now.
  const active = store.curriculums.filter((c) => c.status === 'active');
  const activeBlock = active.length === 0 ? '' : active.map((c) => {
    const currentModule = c.modules.find((m) => m.status === 'in_progress' || m.status === 'available');
    const nextLesson = currentModule?.lessons.find((l) => l.status === 'not_started' || l.status === 'in_progress');
    return `**${c.title}** (${c.subject}, ${c.level}, ${Math.round(c.progress_percent)}% complete)\n` +
      (currentModule ? `  Current module: ${currentModule.title}\n` : '') +
      (nextLesson ? `  Next lesson: ${nextLesson.title} (${nextLesson.type})` : '  All lessons in current module complete — ready to unlock next module');
  }).join('\n\n');

  // Skills profile — what they've PROVEN (earned) + what they CLAIM (self-added).
  // Lets Ava pitch new courses at the right level and build on existing skills.
  const { skills } = deriveProgression(store);
  const levelOrder: Record<SkillLevel, number> = { mastered: 0, proficient: 1, familiar: 2, novice: 3 };
  const earned = skills
    .slice()
    .sort((a, b) => levelOrder[a.level] - levelOrder[b.level])
    .map((s) => `- ${s.name} — ${s.level}${s.stale ? ' (needs a refresh)' : ''}`);
  const selfSkills = selfSkillsRaw.filter(
    (s) => !skills.some((e) => e.name.toLowerCase() === s.trim().toLowerCase()),
  );
  let skillsBlock = '';
  if (earned.length) skillsBlock += `### Proven skills (earned — build on these, pitch above them)\n${earned.join('\n')}`;
  if (selfSkills.length) skillsBlock += `${earned.length ? '\n\n' : ''}### Self-listed (unverified — gut-check via assess before relying)\n${selfSkills.join(', ')}`;

  // Full course list (active / paused / completed) so Ava can offer to switch
  // when the learner asks — only one course is active at a time.
  const allCourses = store.curriculums.length === 0 ? '' : store.curriculums
    .map((c) => `- ${c.title} (${c.subject}) — ${Math.round(c.progress_percent)}% [${c.status}]`)
    .join('\n');

  const blocks = [
    activeBlock && `## Active course (what you're teaching now)\n${activeBlock}`,
    allCourses && `## All their courses (set one active with learning_teach action:'set_active' if they want to switch)\n${allCourses}`,
    skillsBlock && `## Learner skills profile\n${skillsBlock}`,
  ].filter(Boolean);
  return blocks.length ? blocks.join('\n\n') : undefined;
}
