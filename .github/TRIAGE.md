# Issue Triage Guide

How maintainers should handle incoming issues on Ava | Supernova.

## Label Taxonomy

Labels are defined in [`.github/labels.yml`](labels.yml). Every issue should have at least:

1. **One type label** — `bug`, `feature`, `enhancement`, `docs`, `question`, or `security`
2. **One priority label** — `priority: critical` / `high` / `medium` / `low`
3. **One area label** — `area: core`, `area: cli`, `area: extension`, `area: ide`, `area: web`, or `area: i18n`
4. **A provider label** (if applicable) — `provider: deepseek`, `provider: anthropic`, etc.

## Triage Workflow

```
New issue arrives → add `needs-triage`
  ├── Duplicate?         → label `duplicate`, link original, close
  ├── Not actionable?    → ask for reproduction steps, keep `needs-triage`
  ├── Won't fix?         → label `wontfix`, explain reasoning, close
  └── Valid?             → remove `needs-triage`, add `confirmed` + type + priority + area
```

## Response Time Targets

| Priority | First response | Resolution target |
|----------|---------------|-------------------|
| `critical` | 24 hours | ASAP — blocks users or causes data loss |
| `high` | 3 days | Current milestone |
| `medium` | 1 week | Upcoming milestone |
| `low` | 2 weeks | When convenient |

These are targets, not SLAs. We're a volunteer-driven open-source project.

## When to Use Each Priority

- **Critical** — App crashes on launch, data loss, security vulnerability, complete feature breakage
- **High** — Major feature broken for a subset of users, regression from recent release
- **Medium** — Non-critical bug with a workaround, moderate UX issue, missing docs
- **Low** — Cosmetic issues, minor UX polish, nice-to-have improvements

## Assigning `good-first-issue`

Use `good-first-issue` when the issue:

- Has a clear, self-contained scope (one file or one function)
- Doesn't require deep knowledge of the agent loop or provider architecture
- Has an obvious fix path (e.g., missing i18n key, CSS fix, typo in docs)
- Is a good introduction to the codebase structure

Always add a brief comment pointing newcomers to `CONTRIBUTING.md` and the relevant file(s).

## Security Issues

- If reported as a public issue and it's sensitive → convert to a [Security Advisory](https://github.com/AugmentedValueAcceleration/ava-supernova/security/advisories)
- Label with `security` + appropriate priority
- Do not discuss exploit details in public comments
- See the security issue template for reporting guidelines

## Closing Issues

- Always explain **why** when closing (even for duplicates)
- Link to the fix PR or duplicate issue
- Be kind — every reporter took time to file the issue
