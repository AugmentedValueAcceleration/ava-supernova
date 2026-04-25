# Governance

How Ava Supernova is maintained, how decisions are made, and how you can grow your role in the project.

## Project Lead

**AugmentedValueAcceleration** — Final decision-maker on project direction, architecture, and releases. Day-to-day decisions are delegated to maintainers where possible.

## Roles

| Role | Scope | How to get there |
|------|-------|------------------|
| **Contributor** | Submit PRs, report issues, improve docs | Anyone — just open a PR |
| **Reviewer** | Review PRs in your area of expertise | Consistent quality contributions + invitation |
| **Area Maintainer** | Own a package or area (e.g., `extension`, `i18n`, `cli`) | Demonstrated deep knowledge + sustained contributions |
| **Core Maintainer** | Merge to `main`, cut releases, triage across all areas | Trust + track record as area maintainer |

## Decision Process

### Minor Changes

Bug fixes, documentation improvements, small features, dependency updates:
- **Lazy consensus** — Open a PR. If no objections from maintainers within 3 working days, merge.

### Significant Changes

New tools, provider integrations, API changes, new dependencies:
- Open a PR with a clear description of the change and its motivation
- At least one maintainer review required
- Discussion happens on the PR itself

### Major Changes

Architecture changes, new packages, breaking changes, governance updates:
- **RFC process** — Open a [GitHub Discussion](https://github.com/AugmentedValueAcceleration/ava-supernova/discussions) with the proposal
- Allow at least 1 week for community input
- Project lead makes the final call, incorporating feedback

## Releases

- **Semantic versioning** — `MAJOR.MINOR.PATCH`
- **Changelog** — Every release includes a changelog entry
- **Release cadence** — As needed, no fixed schedule. Critical fixes ship immediately.
- **Branch model** — `development` for active work, `main` for releases

## Code of Conduct

All participants are expected to follow the [Contributor Covenant 2.1](CODE_OF_CONDUCT.md).

**Enforcement**:
1. First violation → Private warning from a maintainer
2. Repeated violations → Temporary ban from the repository
3. Severe violations → Permanent ban

Reports can be sent to the project lead via the contact methods listed in `CODE_OF_CONDUCT.md`.

## Licensing

Ava Supernova is licensed under **Apache 2.0**. No CLA (Contributor License Agreement) is required — your contributions are covered by the project license.
