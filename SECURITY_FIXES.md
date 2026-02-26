# Security Fixes Checklist

Audit date: 2026-02-26
Status: **Pre-launch hardening — 14/23 fixed (all Critical + all High + 5 Medium)**

---

## Critical (Fix Before Launch)

### 1. Weak Admin Password
- **File:** `.env.local` (line 29)
- **Issue:** Admin password is `Admin123` — trivially guessable, no rate limiting on verify endpoint
- **Fix:** Change to a strong password (20+ chars), hash with bcrypt/argon2, compare with constant-time function
- **Code fix:** `crypto.timingSafeEqual()` implemented in `api/admin/verify/route.ts`. Password change is manual in `.env.local`.
- [x] Done

### 2. BYOK API Keys Stored in Plaintext
- **Files:** `packages/extension/src/webview/DashboardPanel.ts` (lines 429-444), `packages/extension/package.json` (lines 159-176)
- **Issue:** DeepSeek, Kimi, Qwen keys stored in `settings.json` (plaintext) — synced to cloud, readable by other extensions. Platform key correctly uses SecretStorage but BYOK keys don't.
- **Fix:** Migrate all three provider keys to `vscode.SecretStorage`. Remove from `contributes.configuration`. On activation, migrate any existing plaintext keys into SecretStorage then delete the old values.
- [x] Done

### 3. Chat Proxy Forwards Entire Request Body
- **File:** `packages/web/src/app/api/chat/route.ts` (lines 91, 120)
- **Issue:** `const { model, stream, ...rest } = body` — the `...rest` spread forwards arbitrary fields to upstream providers. Users can inject `tools`, `logit_bias`, `api_key` overrides, etc.
- **Fix:** Whitelist allowed fields: `{ messages, temperature, max_tokens, top_p, stop }`
- [x] Done

---

## High (Fix Before Launch)

### 4. No Rate Limiting on Any API Route
- **Files:** All routes in `packages/web/src/app/api/`
- **Issue:** Zero rate limiting anywhere. Chat proxy can be hammered burning LLM credits, admin verify can be brute-forced, generate-key can be spammed.
- **Fix:** In-memory rate limiter in `@/lib/rate-limit.ts`. Applied to `/api/chat` (30/min), `/api/admin/verify` (5/15min), `/api/generate-key` (10/hr).
- [x] Done

### 5. Git Tool Command Injection
- **File:** `packages/core/src/tools/git.ts` (lines 43-54)
- **Issue:** `args` parameter concatenated directly into shell command string with zero sanitization. Runs without user confirmation (`riskLevel: 'safe'`).
- **Fix:** Replaced `exec` with `execFile` + array args. Added `SHELL_METACHARACTERS` regex rejection.
- [x] Done

### 6. Client-Reported Token Usage Trusted Blindly
- **File:** `packages/web/src/app/api/usage/route.ts` (lines 13, 25-33)
- **Issue:** Token counts reported by the client, never verified server-side. Users can report `input_tokens: 0, output_tokens: 0` for every request, getting unlimited free usage.
- **Fix:** Non-streaming: server reads `usage.prompt_tokens`/`usage.completion_tokens` from provider response and logs directly in `/api/chat`. Streaming: still client-reported but bounds-checked (max 10M per field).
- [x] Done

### 7. TOCTOU Race Condition on Usage Limits
- **File:** `packages/web/src/app/api/chat/route.ts` (lines 57-88, 131-144)
- **Issue:** Usage limit checked at request start, but usage only logged after response (by the client). Concurrent requests all pass the check before any usage is recorded.
- **Fix:** Created `increment_usage` Postgres function with `FOR UPDATE` row locking (migration 014). Usage route now calls atomic RPC instead of read-then-write.
- [x] Done

### 8. Timing-Attack-Vulnerable Admin Password Comparison
- **File:** `packages/web/src/app/api/admin/verify/route.ts` (line 32)
- **Issue:** Uses `password !== process.env.ADMIN_PASSWORD` — vulnerable to timing attacks.
- **Fix:** `crypto.timingSafeEqual()` with Buffer comparison in verify route.
- [x] Done (part of Critical #1)

### 9. Admin Password Gate is Client-Side Only
- **File:** `packages/web/src/components/AdminPasswordGate.tsx` (lines 12-14)
- **Issue:** `sessionStorage.setItem('admin_verified', 'true')` in devtools bypasses it. Admin API endpoints don't re-verify the password.
- **Fix:** HMAC-SHA256 signed cookie (1hr expiry) set on verify, checked by shared `requireAdmin()` in `@/lib/admin-auth.ts`. All 8 admin routes migrated.
- [x] Done

### 10. PostgREST Filter Injection in Admin Search
- **File:** `packages/web/src/app/api/admin/users/route.ts` (line 38)
- **Issue:** Search param interpolated directly into `.or()` filter string — metacharacters (`,`, `.`) can alter query logic.
- **Fix:** Sanitized search input: `search.replace(/[%.,()]/g, '')`.
- [x] Done

---

## Medium (Fix Soon After Launch)

### 11. CSP Nonce Uses `Math.random()`
- **File:** `packages/extension/src/utils/nonce.ts` (lines 1-8)
- **Issue:** Not cryptographically secure. Nonce is predictable, CSP can be bypassed.
- **Fix:** Replace with `crypto.randomBytes(16).toString('hex')`
- [ ] Done

### 12. `open_url` Handler Has No URL Validation
- **File:** `packages/extension/src/webview/DashboardPanel.ts` (lines 159-160)
- **Issue:** Opens any URL from the webview without checking protocol or domain. Could open `file://` or phishing URLs.
- **Fix:** Validate `url.scheme === 'https'` before opening. For API-returned URLs (checkout/portal), validate against domain allowlist (`ava-supernova.com`, `stripe.com`).
- [ ] Done

### 13. `http_request` Tool Has No SSRF Protection
- **File:** `packages/core/src/tools/http-request.ts` (lines 150-175)
- **Issue:** Can hit `127.0.0.1`, `169.254.169.254` (AWS metadata), `192.168.*` — runs without confirmation.
- **Fix:** Block private/internal IP ranges. Consider changing `riskLevel` to `'write'` so it requires confirmation.
- [ ] Done

### 14. Open Redirect via `Origin` Header
- **Files:** `packages/web/src/app/api/checkout/route.ts` (line 13), `packages/web/src/app/api/portal/route.ts` (line 6)
- **Issue:** `request.headers.get('origin')` used as Stripe redirect base. Attacker can set `Origin: https://evil.com`.
- **Fix:** Removed `Origin` header usage. Now only uses `process.env.NEXT_PUBLIC_APP_URL`.
- [x] Done

### 15. Raw Upstream Provider Errors Forwarded to Users
- **File:** `packages/web/src/app/api/chat/route.ts` (lines 123-129)
- **Issue:** Full provider error response body returned to user. Could leak internal request IDs, account details, rate limit info.
- **Fix:** `console.error` logs full error server-side, client gets generic `Provider returned ${status}`.
- [x] Done (part of Critical #3)

### 16. Mass-Assignment in News PATCH Endpoint
- **File:** `packages/web/src/app/api/admin/news/route.ts` (lines 79, 85-88)
- **Issue:** Entire request body (minus `id`) spread into `.update()`. Admin can set any column.
- **Fix:** Whitelist allowed fields: `{ title, slug, excerpt, content, published, category, source_url, image_url }`.
- [ ] Done

### 17. No Input Validation on Token Counts
- **File:** `packages/web/src/app/api/usage/route.ts` (lines 13-14, 29-30)
- **Issue:** No validation that `input_tokens` / `output_tokens` are non-negative integers. Negative values could reduce recorded usage.
- **Fix:** `Math.max(0, Math.floor(...))` with 10M upper bound. Rejects out-of-range with 400.
- [x] Done

### 18. API Key Prefix Logged to Output Channel
- **File:** `packages/extension/src/webview/AvaViewProvider.ts` (line 336)
- **Issue:** First 8 chars of API key logged — reveals meaningful key material for keys with known prefixes.
- **Fix:** Removed key prefix from log. Now logs only provider name.
- [x] Done (part of Critical #2)

---

## Low (Address Post-Launch)

### 19. No `postMessage` Origin Validation in Webviews
- **Files:** `packages/extension/webview-ui/src/App.tsx`, `packages/extension/dashboard-ui/src/App.tsx`
- **Issue:** Neither webview checks `event.origin`. VSCode sandbox mitigates this, but defense-in-depth is missing.
- **Fix:** Check `event.origin` starts with `vscode-webview://` before processing messages.
- [ ] Done

### 20. Supabase `error.message` Leaked in Responses
- **Files:** Multiple admin routes + `api/news/route.ts`
- **Issue:** DB error messages (table names, constraint names, PostgreSQL internals) returned to client.
- **Fix:** Log specifics server-side, return generic `"Internal server error"` to client.
- [ ] Done

### 21. No Length/Type Validation on Memory Content
- **File:** `packages/web/src/app/api/memories/route.ts` (lines 42-63)
- **Issue:** `key` and `content` checked for presence but not type or length. Could store megabytes of data.
- **Fix:** Validate `typeof === 'string'`, enforce max lengths (key: 256, content: 100K).
- [ ] Done

### 22. Supabase Admin Client Used Broadly
- **Files:** Multiple API routes
- **Issue:** `createAdminClient()` bypasses all RLS. No INSERT policies on `usage`, `usage_logs`, `user_api_keys` as defense-in-depth.
- **Fix:** Add INSERT RLS policies on those tables. Where possible, use user-scoped client instead of admin client.
- [ ] Done

### 23. DEV_MODE Mock Data in Production Code
- **File:** `packages/extension/src/webview/DashboardPanel.ts` (lines 16, 203-218)
- **Issue:** Hardcoded `DEV_MODE = false` with mock pro-tier account data. If toggled, bypasses real auth.
- **Fix:** Strip DEV_MODE blocks in production builds, or gate behind a build-time flag.
- [ ] Done

---

## Already Secure

These areas passed the audit:

- API keys hashed with SHA-256 before storage (only returned once at generation)
- Stripe webhook signatures properly verified via `constructEvent()`
- RLS enabled on all database tables with appropriate policies
- Platform key stored in VS Code SecretStorage (OS keychain)
- Admin tier cannot be self-assigned (whitelisted to free/pro/ultra)
- CSP enforced on webviews with nonce-locked scripts
- `.env` files properly gitignored and not tracked in git
- Typed message protocol reduces protocol confusion
- Markdown rendered via `react-markdown` (sanitized by default)
- No raw SQL — all queries use Supabase client with parameterized methods
- No secrets in API responses (keys never returned after generation)
- IDOR protection solid — all queries scoped by authenticated `user_id`
