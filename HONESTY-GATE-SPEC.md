# Honesty Gate — Spec (active verify-or-restate)

Status: **implemented** — severity tiers + active verify-or-restate loop are
in `claims-auditor.ts` and the agent loop. Auditor unit-tested (19/19) and the
full core suite is green (630/630); the live re-run has **not** yet been
verified against a real model.

## Purpose

The Claims Auditor today is a *soft* gate: it detects unverified state-claims
in the final reply and appends a caveat. This spec upgrades it to an **active
verify-or-restate loop** with a deterministic floor — so the agent doesn't just
flag an unbacked claim, it goes and **verifies** (or honestly **restates**)
before the answer ships.

**Hard requirement: it must work on every model** — frontier, weak, free-tier,
and local. Honesty can never depend on the model being strong.

## Non-negotiable: always on, no off-switch

The gate is **fully automatic. No user control, no setting to disable or weaken
the critical floor.** The severity tiers are internal — the user never sets,
sees, or tags them. The user's only interaction is *seeing the result*: a clean
answer, or a claim with a caveat on it.

> A switch to turn honesty off would signal we're OK shipping misinformation as
> long as someone opted in. We are not. There is deliberately no such switch.

## Architecture — two layers

The design splits the **guarantee** (model-independent) from the **verification**
(model-dependent). That split is the whole answer to "works on every model."

1. **Guarantee layer — deterministic, model-independent.** Detection (regex over
   the output text) + a deterministic caveat floor. Operates on the text and the
   per-run tool-evidence ledger (`runToolEvidence`) — identical on Qwen Flash, a
   local Ollama model, or Opus. This is what holds honesty on every model.
2. **Verification layer — scales with the model.** On a flagged high-stakes
   claim, re-inject a verify-or-restate instruction so the agent runs the right
   tool. Capable models verify; weaker ones may not — and the guarantee layer
   catches whatever they fail to fix.

Result: **every model gets the honesty guarantee; stronger models additionally
self-correct.** Honesty never depends on model strength.

## Flow

```
final reply
  → auditClaims() detects state-claim + assigns tier   (deterministic)
  → Tier A / B  → re-inject "verify-or-restate" (cap: 1 attempt)
                  → re-run → re-audit
                      → backed now?  ship clean
                      → still unbacked?  deterministic top-placed caveat
  → Tier C       → soft caveat only (no round-trip)
  → Tier 0       → ship as-is
```

## Severity tiers (internal, automatic)

The tier is a property of the **claim pattern** (regex-detectable), not of the
model — so it is deterministic everywhere.

| Tier | Claims | Response |
|---|---|---|
| **A — Critical** (security / safety) | "secure", "no vulnerabilities", "safe to run", "sanitised", "no secrets / leaks" | Hard loop, **strictest**. Verify via `audit_dependencies` / security scan / `grep`. If unconfirmed, caveat is **mandatory + top-placed** — never ships as bare fact. |
| **B — High** (completion + system-state) | "done / fixed / deployed / live / shipped", "tests pass", "build passed", "returns 200", "it works" | Hard verify-or-restate loop, then floor. |
| **C — Soft** | bare "verified / confirmed" with no target, loose factual assertions | Soft caveat only, **no forced round-trip**. |
| **0 — Ignore** | explanatory ("works by…"), action statements ("I changed X to Y"), recommendations, anything already hedged | Ship as-is, never flag. |

### Claim → verifying tool (Tier B)

- completion ("done / fixed") → `file_read` / `git_diff` / `git_status`
- tests / build → `test_run` / `bash`
- endpoint / "returns 200" → `http_request` / `browser`

A verifying tool's **successful** result is what clears a claim. Set (from the
current code): `verify_change`, `test_run`, `test_generate`, `benchmark`,
`http_request`, `browser`, `browser_*`, `bash`, `git_diff`, `git_status`,
`file_read`, `grep`, `database_query`, `analyze_architecture`, `self_inspect`.

## Loop cap

**1 verify attempt, then the deterministic floor.**

- Strong model → usually verifies on the first re-prompt. Done.
- Weak / free / local model → more attempts won't help (it can't verify
  reliably) and only burn credits + latency. One try, then the floor catches it.

Bounds worst case to **+1 model call** per high-stakes-unbacked claim,
guarantees termination (no loops), keeps honesty intact regardless of model.

## Floor = caveat, not rewrite (Option A)

When the model won't/can't verify, the harness **appends a visible caveat** — it
does **not** strip or rewrite the model's words.

- More truthful: shows *both* the claim and that it's unverified.
- The caveat's **absence becomes a trust signal** — no caveat ⇒ it was actually
  checked. Calibrated trust beats blind trust.
- Preserves the raw overclaim for telemetry / training.
- Safest on weak/local models — no risky harness editing of poor output.
- **Placed at the top** of the message so it isn't skimmed past.

Caveat text (current): *"⚠ Unverified claim: this turn asserts completion/state
but ran no verifying tool (test, build, request, or read) to confirm it. Treat
it as 'changed, not confirmed' until checked."*

## Why this matters (design intent)

Keeps the **human in the loop and aware** — the opposite of blind AI use.
Professional use means not merging on faith; the gate makes "review, don't trust"
the AI's own default, and every earned caveat trains the user's verification
habit. Honesty made structural, not instructed.

## Implementation notes

- Keep `auditClaims` a **pure function** (unit-testable); add `tier` to its
  result type.
- Loop orchestration lives in `agent.ts` — it already has `runToolEvidence`, the
  finalization hook, and the `verification_evidence` signal.
- Caveat application is a deterministic string prepend.
- **Telemetry:** per-model flag rate + verify-success rate → feeds the
  improvement loop (which models self-correct vs lean on the floor).

## Out of scope / deferred

- Tier C semantic detection of arbitrary factual claims (would need a model pass;
  deferred to keep detection deterministic and every-model).
- "Option C" hard rewrite/restate as the floor — **rejected**: less transparent,
  riskier on weak models, and destroys the trust-signal that the caveat carries.
