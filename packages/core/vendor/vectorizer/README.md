# Vendored: @neplex/vectorizer (WebAssembly build)

Logo vectorising for the Design Studio, run on the user's own machine
(`src/creative/image-local.ts`). Same engine (vtracer) the website used through
the native `@neplex/vectorizer` module.

**Why vendored, not a dependency.** `@neplex/vectorizer-wasm32-wasi` declares
`"cpu": ["wasm32"]`, so npm refuses to install it on an ordinary x64 machine
(`EBADPLATFORM`). pnpm let it through inside this workspace, which hid the
problem until the website — which installs core from npm — failed to install
core 0.2.170 (1 Nov 2026). The code runs fine on any Node with WASI; only the
package metadata is wrong for our use. So the three files it needs live here.

- `vectorizer.wasi.cjs` — the loader (needs `@napi-rs/wasm-runtime`, a normal dependency)
- `vectorizer.wasm32-wasi.wasm` — the engine (~11 MB; ~2.7 MB compressed)
- `wasi-worker.mjs` — the worker for the async API (unused: its async path
  fails in this build, so core calls `vectorizeSync`)

Copied unmodified from version 0.1.0. MIT — see `LICENSE`.
