# Prototype F1 — OmniParser v2 cost + latency

**Goal:** measure real per-call latency, output shape, and $ cost of the
OmniParser grounding tier before we commit to a hosting + billing
decision in the spec.

Session 3 of the desktop-automation build. See
[../../DESKTOP_AUTOMATION_SPEC.md](../../DESKTOP_AUTOMATION_SPEC.md) §4
for context, and §8 for the "10K tokens equivalent per call" billing
unit this prototype stress-tests.

## Approach

We hit Microsoft's OmniParser v2 via [Replicate](https://replicate.com/microsoft/omniparser-v2)
on Nvidia T4 GPU at $0.011/call. Three representative screenshots captured
via Playwright (simple / medium / dense UI), sent to the parser, results
recorded.

We don't self-host for this prototype. Production will likely host
elsewhere (A100 is ~10–30× faster and potentially much cheaper per call at
scale), but Replicate gives us honest numbers today without GPU ops work.

## Running it

```bash
cd prototypes/omni-parser
npm install
npx playwright install chromium

# Set your Replicate token (never committed — env var only):
# PowerShell:
$env:REPLICATE_API_TOKEN = "r8_..."
# bash:
export REPLICATE_API_TOKEN=r8_...

npm run run
```

Cost: ~$0.033 for a single run (3 calls × $0.011). Free-tier Replicate
accounts have enough credit for many iterations.

## What the run tells us

The summary JSON in `results/run-<ts>.json` contains:

- **Per-sample timings** — wall-clock (request → parsed output) and
  Replicate's own `predict_time` (GPU-side, excluding queue).
- **Element counts** — how many interactable regions OmniParser found
  per screenshot. Lets us compare UI density impact on output size.
- **Output size in bytes** — what the Rust sidecar would have to ship
  back into the persona prompt. Feeds spec 8's token-budget math.
- **Margin math** — spec 8 proposes billing 10K Qwen-equivalent tokens
  (~$0.01) per call. At Replicate T4 ($0.011) that's negative margin;
  on A100 self-host (~$0.0002) it's ~98% margin. The prototype prints
  both so the hosting decision is grounded in numbers.

## What this does *not* tell us

- A100 latency — you'd need to benchmark separately, or trust
  Microsoft's paper (~0.6s on A100).
- Batching throughput — Replicate doesn't expose batch endpoints for
  this model. Platform hosting decision is out of scope.
- BYOK viability — future work; contract is already designed to point
  at any HTTP endpoint.

## Pass criteria

- at least 1 of 3 calls succeeds
- output shape is parseable (array of elements or `{elements: [...]}`)
- no token-leak in logs or results file
