// Pure progression-document builders — certificate + CV Markdown from the
// derived progression. NO node deps (no authoring engine, no pdfkit), so this
// is safe to import from any surface including the Tauri webview. The PDF
// renderer (which pulls the authoring engine) stays in ./progression-export.ts;
// that module re-exports these so the host's import surface is unchanged.

import type { DerivedCertificate, LearnerProgression } from './progression.js';

const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

/** Branded Markdown for a single earned certificate. */
export function buildCertificateMarkdown(cert: DerivedCertificate, learnerName: string): string {
  return `---
title: Certificate of Completion
author: Ava Supernova
---

# 🎓 Certificate of Completion

This certifies that **${learnerName}** has successfully completed

## ${cert.title}

| | |
|---|---|
| **Subject** | ${cert.subject} |
| **Level** | ${cert.level} |
| **Lessons** | ${cert.lessons} |
| **Average score** | ${cert.score}% |
| **Time invested** | ${cert.hours}h |
| **Completed** | ${fmtDate(cert.completedAt)} |
| **Verify code** | \`${cert.hash}\` |

---

*Awarded by **Ava Supernova** — earned through graded performance, not completion alone.*
`;
}

export interface CvInput {
  name: string;
  headline: string | null;
  bio: string | null;
  progression: LearnerProgression;
  selfSkills: string[];
  selfAchievements: string[];
}

/** Branded Markdown CV combining earned + self-declared. */
export function buildCvMarkdown(input: CvInput): string {
  const { name, headline, bio, progression: p, selfSkills, selfAchievements } = input;
  const lines: string[] = [
    `---`,
    `title: ${name} — Learning CV`,
    `author: ${name}`,
    `---`,
    ``,
    `# ${name}`,
  ];
  if (headline) lines.push(`**${headline}**`, ``);
  if (bio) lines.push(bio, ``);

  lines.push(`## At a glance`, ``,
    `- **${p.stats.coursesCompleted}** courses completed · **${p.stats.lessonsMastered}** lessons mastered`,
    `- **${p.stats.totalHours}h** invested · longest streak **${p.stats.longestStreak} days**`,
    p.stats.avgScore != null ? `- Average graded score **${p.stats.avgScore}%**` : ``,
    ``);

  if (p.skills.length) {
    lines.push(`## Verified skills`, ``);
    for (const s of p.skills) lines.push(`- **${s.name}** — ${s.level} *(verified — ${s.lessonsMastered}/${s.lessonsTotal} lessons${s.avgScore != null ? `, ${s.avgScore}%` : ''})*`);
    lines.push(``);
  }
  if (selfSkills.length) {
    lines.push(`## Other skills`, ``, selfSkills.map((s) => `- ${s}`).join('\n'), ``);
  }
  if (p.certificates.length) {
    lines.push(`## Certificates`, ``);
    for (const c of p.certificates) lines.push(`- **${c.title}** — ${c.subject}, ${c.score}% *(${fmtDate(c.completedAt)})*  \`${c.hash}\``);
    lines.push(``);
  }
  const achievements = [...p.achievements.map((a) => a.title), ...selfAchievements];
  if (achievements.length) {
    lines.push(`## Achievements`, ``, achievements.map((a) => `- ${a}`).join('\n'), ``);
  }
  lines.push(`---`, ``, `*Verified credentials earned in **Ava Supernova** — graded, not self-marked.*`);
  return lines.filter((l) => l !== undefined).join('\n');
}
