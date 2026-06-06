/**
 * Built-in worked-exemplar templates.
 *
 * Each `body` is a complete, well-written document of its kind — real prose at
 * the right length and tone, with `{{tokens}}` only where something must change.
 * They double as a quality bar for Ava and as a teaching example for the writer.
 * Stored as TS constants so they ship on every surface with no asset-copy step.
 */

import type { DocTemplate } from './template-model.js';

const proposal: DocTemplate = {
  id: 'business/proposal',
  domain: 'business',
  title: 'Project proposal',
  description: 'A persuasive proposal that opens with the outcome, then earns the budget.',
  styleProfile: 'proposal',
  toneGuide: 'Confident and concrete. Lead with the client\'s outcome, not your process. Second person ("you get…"). No filler.',
  lengthHint: '1–2 pages',
  variables: [
    { key: 'title', label: 'Proposal title', default: 'Project Proposal' },
    { key: 'client', label: 'Client name' },
    { key: 'author', label: 'Your name' },
    { key: 'company', label: 'Your company' },
  ],
  source: 'builtin',
  body: `---
title: {{title}}
author: {{author}}
date: {{date}}
style: proposal
toc: true
---

## Executive summary

{{client}} needs [the outcome they're buying] without [the cost or risk they're avoiding].
This proposal lays out a focused engagement that delivers it in [timeframe], for [budget].
In one line: you get [the result], and we own the hard parts.

## The opportunity

Right now, [describe the situation in the client's words — what's slow, costly, or missing].
Left as-is, it means [the concrete cost: lost time, lost revenue, risk]. The moment to fix it
is now, because [the reason it's urgent].

## Proposed approach

We'll get there in three moves:

1. **[Phase one]** — [what we do and what you have at the end of it].
2. **[Phase two]** — [the build, and the first thing you can use].
3. **[Phase three]** — [launch, handover, and how you keep running without us].

:::tip{title="What makes this different"}
[The one thing about your approach that a competitor can't claim — be specific.]
:::

## Timeline

| Phase | Duration | You receive |
| :--- | :--- | :--- |
| Discovery | [2 weeks] | [A clear plan and scope] |
| Build | [6 weeks] | [A working version] |
| Launch | [2 weeks] | [Live, with handover] |

## Investment

| Item | Cost |
| :--- | ---: |
| [Phase one] | [£0] |
| [Phase two] | [£0] |
| [Phase three] | [£0] |
| **Total** | **[£0]** |

## Why {{company}}

[Two or three sentences of proof — a comparable result, relevant experience, the named people
who'll do the work. Specific beats grand.]

## Next steps

1. You approve this proposal.
2. We book a kickoff for [date].
3. Discovery starts the following Monday.
`,
};

const report: DocTemplate = {
  id: 'business/report',
  domain: 'business',
  title: 'Status report',
  description: 'A crisp progress report that a busy reader can act on in a minute.',
  styleProfile: 'report',
  toneGuide: 'Plain, factual, decision-oriented. Lead with the headline. No hedging — say what is true.',
  lengthHint: '1 page',
  variables: [
    { key: 'title', label: 'Report title', default: 'Status Report' },
    { key: 'author', label: 'Your name' },
    { key: 'period', label: 'Reporting period' },
  ],
  source: 'builtin',
  body: `---
title: {{title}}
author: {{author}}
date: {{date}}
style: report
---

## Summary

[One paragraph: where things stand, the single most important thing the reader needs to know,
and whether we're on track. Say it straight.]

## Progress this period ({{period}})

- [Shipped / completed — a real thing, not "worked on"]
- [Shipped / completed]
- [In progress, with a clear % or expected finish]

## Key numbers

| Metric | Last | Now | Target |
| :--- | ---: | ---: | ---: |
| [Metric] | [0] | [0] | [0] |
| [Metric] | [0] | [0] | [0] |

## Risks & blockers

:::warning
[The one thing most likely to derail this, and what you're doing about it. If there's nothing
real, say "No critical risks this period" — don't invent one.]
:::

## Next period

- [The next concrete deliverable, with a date]
- [The decision you need from the reader, if any]
`,
};

const meetingNotes: DocTemplate = {
  id: 'business/meeting_notes',
  domain: 'business',
  title: 'Meeting notes',
  description: 'Decisions and actions first — the kind of notes people actually re-read.',
  styleProfile: 'meeting_notes',
  toneGuide: 'Terse and factual. Capture decisions and owners, not a transcript.',
  lengthHint: 'Half a page',
  variables: [
    { key: 'title', label: 'Meeting title', default: 'Meeting Notes' },
    { key: 'attendees', label: 'Attendees' },
  ],
  source: 'builtin',
  body: `---
title: {{title}}
date: {{date}}
style: meeting_notes
---

**Attendees:** {{attendees}}

## Decisions

- [The decision that was made — stated as a fact, not a discussion.]
- [Another decision.]

## Discussion

- [The point that mattered and the reasoning behind a decision.]
- [Open question that's still unresolved.]

## Action items

| Action | Owner | Due |
| :--- | :--- | :--- |
| [What needs doing] | [Name] | [Date] |
| [What needs doing] | [Name] | [Date] |

## Next meeting

[Date and the one thing it needs to resolve.]
`,
};

const invoice: DocTemplate = {
  id: 'business/invoice',
  domain: 'business',
  title: 'Invoice',
  description: 'A clean, professional invoice with clear line items and terms.',
  styleProfile: 'invoice',
  toneGuide: 'Neutral and precise. No prose — just the facts of the transaction.',
  variables: [
    { key: 'number', label: 'Invoice number', default: 'INV-001' },
    { key: 'from', label: 'Your details' },
    { key: 'to', label: 'Client details' },
  ],
  source: 'builtin',
  body: `---
title: Invoice {{number}}
date: {{date}}
style: invoice
---

**Invoice number:** {{number}}
**Date:** {{date}}
**Due:** [30 days from date]

## From

{{from}}

## To

{{to}}

## Items

| Description | Qty | Unit price | Total |
| :--- | ---: | ---: | ---: |
| [Service or item] | [1] | [£0.00] | [£0.00] |
| [Service or item] | [1] | [£0.00] | [£0.00] |
| **Total** | | | **[£0.00]** |

## Payment

Payment due within 30 days. Bank transfer to [account details]. Reference {{number}}.
`,
};

const brief: DocTemplate = {
  id: 'business/brief',
  domain: 'business',
  title: 'Decision brief',
  description: 'A one-page brief that leads with the decision and the recommendation.',
  styleProfile: 'brief',
  toneGuide: 'Executive. The recommendation goes first. Everything after it is justification.',
  lengthHint: '1 page',
  variables: [{ key: 'title', label: 'Brief title', default: 'Decision Brief' }],
  source: 'builtin',
  body: `---
title: {{title}}
date: {{date}}
style: brief
---

## Recommendation

[State the decision you're recommending in one sentence. No preamble.]

## Why

- [The strongest reason.]
- [The second reason.]
- [The reason that pre-empts the obvious objection.]

## What it costs

[Money, time, and trade-offs — honestly. The reader trusts a brief that names the downside.]

## The alternative

[What happens if we don't, or the next-best option and why it loses.]

## Decision needed by

[Date, and from whom.]
`,
};

const article: DocTemplate = {
  id: 'editorial/article',
  domain: 'editorial',
  title: 'Article',
  description: 'A long-form article with a strong hook and a clear through-line.',
  styleProfile: 'article',
  toneGuide: 'Engaging and human. Open with a hook, not a definition. Vary sentence length. Earn each section.',
  lengthHint: '800–1500 words',
  variables: [
    { key: 'title', label: 'Article title' },
    { key: 'author', label: 'Author' },
  ],
  source: 'builtin',
  body: `---
title: {{title}}
author: {{author}}
date: {{date}}
style: article
---

[Open with a hook — a scene, a surprising fact, a sharp question. Make the reader want the next
sentence. Do not open with "In today's world" or a dictionary definition.]

[One or two paragraphs that turn the hook into a promise: here's what this piece will show you,
and why it matters to you specifically.]

## [The first idea]

[Make one point per section and make it well. Use a concrete example — a story beats an assertion.
Show, then tell.]

## [The second idea]

[Build on the first. If there's a counter-argument, meet it head-on; it makes you more credible,
not less.]

## [Where it leaves us]

[Land the plane. Return to the hook from the opening, now that the reader sees it differently.
End on a line they'll remember.]
`,
};

const pressRelease: DocTemplate = {
  id: 'editorial/press_release',
  domain: 'editorial',
  title: 'Press release',
  description: 'A standard-format press release with a quotable lead.',
  styleProfile: 'press_release',
  toneGuide: 'Third person, news style. The first sentence carries the whole story. Quotes sound like a person, not a brochure.',
  variables: [
    { key: 'headline', label: 'Headline' },
    { key: 'company', label: 'Company' },
  ],
  source: 'builtin',
  body: `---
title: {{headline}}
date: {{date}}
style: press_release
---

**FOR IMMEDIATE RELEASE**

## {{headline}}

**[City, Date]** — [The lead: who did what, and why it matters, in one sentence a journalist
could publish verbatim. Front-load the news.]

[Second paragraph: the detail that supports the lead — the what and the how, concretely.]

"[A quote that sounds like a real person saying something they believe — not marketing copy,]"
said [Name, Title] at {{company}}. "[A second line that adds meaning, not just enthusiasm.]"

[Third paragraph: context — why now, what it changes, who it's for.]

### About {{company}}

[Two sentences on who the company is and what it does. Plain and factual.]

**Contact:** [Name] · [email] · [phone]
`,
};

const essay: DocTemplate = {
  id: 'academic/essay',
  domain: 'academic',
  title: 'Academic essay',
  description: 'A structured essay with a clear thesis and an argument that builds.',
  styleProfile: 'essay',
  toneGuide: 'Formal but readable. One arguable thesis, defended in stages. Signpost the structure. Cite where you claim.',
  lengthHint: '1000–2500 words',
  variables: [
    { key: 'title', label: 'Essay title' },
    { key: 'author', label: 'Author' },
  ],
  source: 'builtin',
  body: `---
title: {{title}}
author: {{author}}
date: {{date}}
style: essay
---

## Introduction

[Set up the question and why it's worth asking. End the introduction with a clear, arguable
thesis — a claim someone could reasonably disagree with, which this essay will defend.]

## [First supporting argument]

[Make the strongest case for the thesis first. Evidence, then interpretation. Tie the paragraph
back to the thesis explicitly.[^1]]

## [Second supporting argument]

[Develop a distinct line of support. Each section should advance the argument, not restate it.]

## [Counter-argument and response]

[State the best objection fairly, then answer it. This is where the essay earns its conclusion.]

## Conclusion

[Restate the thesis in light of what's been shown — not word for word. End with the wider
significance: so what?]

[^1]: [Citation — author, title, year, page.]
`,
};

const resume: DocTemplate = {
  id: 'career/resume',
  domain: 'career',
  title: 'Résumé / CV',
  description: 'A results-first résumé that leads with impact, not job duties.',
  styleProfile: 'resume',
  toneGuide: 'Tight and active. Every bullet starts with a verb and ends with a result or number. No "responsible for".',
  variables: [
    { key: 'name', label: 'Full name' },
    { key: 'contact', label: 'Contact line' },
  ],
  source: 'builtin',
  body: `---
title: {{name}}
style: resume
---

{{contact}}

## Summary

[Two lines: who you are professionally and the value you bring, stated as outcomes you've
delivered — not adjectives about yourself.]

## Experience

### [Job title] — [Company] ([Year]–[Year])

- [Action verb] [what you did] that [measurable result, e.g. "cut load time 40%"].
- [Action verb] [what you did] for [scope, e.g. "a team of 6 / 10k users"].
- [Action verb] [the achievement you're proudest of here].

### [Job title] — [Company] ([Year]–[Year])

- [Result-first bullet.]
- [Result-first bullet.]

## Education

- [Degree] — [Institution] ([Year])

## Skills

[A focused list of the skills that match the role you want — not everything you've ever touched.]
`,
};

const coverLetter: DocTemplate = {
  id: 'career/cover_letter',
  domain: 'career',
  title: 'Cover letter',
  description: 'A specific, confident cover letter that connects you to this role.',
  styleProfile: 'cover_letter',
  toneGuide: 'Warm, specific, and brief. Show you understand this role at this company. No generic flattery.',
  lengthHint: 'Under one page',
  variables: [
    { key: 'role', label: 'Role' },
    { key: 'company', label: 'Company' },
    { key: 'name', label: 'Your name' },
  ],
  source: 'builtin',
  body: `---
subtitle: Application for {{role}}
date: {{date}}
style: cover_letter
---

Dear [Hiring Manager's name],

[Open with why this role, at this company, specifically — something concrete you admire or that
fits you. Skip "I am writing to apply".]

[Second paragraph: the most relevant thing you've done, told as a short proof. Connect it
directly to what {{company}} needs in this role.]

[Third paragraph: what you'd bring and why you're excited — genuine, not gushing. One line.]

I'd welcome the chance to talk. Thank you for considering my application.

Kind regards,
{{name}}
`,
};

export const BUILTIN_TEMPLATES: DocTemplate[] = [
  proposal, report, meetingNotes, invoice, brief,
  article, pressRelease,
  essay,
  resume, coverLetter,
];
