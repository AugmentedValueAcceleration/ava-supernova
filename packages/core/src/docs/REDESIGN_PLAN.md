# Docs redesign — outcome-first, capability-aware, one corpus

**Goal:** Documentation built for people who *don't* already know the tech. Task-first front
door, progressive depth (one page serves newcomer + power via an expander), a single
capability-aware data spec feeding every surface (web · extension · IDE · companion), and
Ava herself as a docs interface. Kills the website's duplicate corpus.

**Approved decisions (2026-06-07):**
- Audience model → **progressive depth** (one page, inline "Show me the details" expander). No named tracks.
- Front door → **task-first** ("What do you want to do?"). Sections become the "go deeper" basement.

## Foundation
`packages/core/src/docs/` already has: typed `DocPage` model, content as TS objects in
`content/*.ts`, fact tables in `data/*.ts`, a `RendererAdapter` (ext + IDE render the same
blocks), and a 19-locale translation layer (`i18n/translations.ts`, per-block keys). The
**website has a separate duplicate** in `web/src/lib/docs/`. We extend the core spec and
point everything at it.

## Phases
1. **Spec extension (core).** `Surface += 'companion' | 'cli'`. `DocPage += task?, requires?, deeper?`.
   New `data/capabilities.ts` (Capability enum + `CAPABILITY_SURFACES` matrix). New `data/tasks.ts`
   (outcome taxonomy: build · write · learn · media · health · make-it-yours · troubleshooting).
2. **Capability-aware filtering + progressive depth.** `filterByCapability(pages, surface)` —
   `requires` auto-hides where the matrix says unsupported. Adapter gains `deeper` (expander) +
   surface-badges blocks, both fed by the matrix.
3. **Voice prototype (taste gate).** Rewrite `start` → "Your first thing with Ava" outcome-first,
   zero-assumed-knowledge, with a `deeper` layer. Render on all surfaces. Lock the feel before migrating.
4. **Ava is the docs.** "Ask about Ava" box → answers from corpus, surface-aware (`docs_lookup` →
   new spec + current surface).
5. **One corpus.** Core build emits a published artifact (`docs-corpus.json` + data + translations);
   website consumes it; delete `web/src/lib/docs/`. (Submodule seam → artifact/sync, not import.)
6. **Companion docs.** Same artifact, `surface:'companion'`, simplest voice. Acid test for the voice.
7. **Migrate + re-translate.** Remaining content → outcome guides (newcomer-first + `deeper`). Batch
   re-translate all 19 locales ONCE, after English is locked.

## Hard parts (flagged)
- **Translation cost:** rewriting English invalidates that page's 19 translations. Lock English → batch re-translate at the end. Never mid-rewrite.
- **Submodule seam:** web + companion are separate repos; "one corpus" = published artifact they pull, not a shared import. Prototype the build/sync early (Phase 5).

## Verification
Typecheck core per phase. `filterByCapability` unit tests (a `requires:['screenshot']` page is
absent on ext, present on ide). Render the prototype guide on all four surfaces. Website renders
from the artifact with zero local content. Companion shows only its capability subset.

## Start
Phases 1–3 first (spec → capability filtering → one prototype guide) so we can see and feel the
voice before committing to the migration.
