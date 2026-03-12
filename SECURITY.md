# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Ava | Supernova, please report it responsibly.

**Do NOT open a public issue for security vulnerabilities.**

Instead, email **security@ava-supernova.com** or use [GitHub's private vulnerability reporting](https://github.com/AugmentedValueAcceleration/ava-supernova/security/advisories/new).

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if you have one)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Assessment**: Within 1 week
- **Fix**: As soon as practical, depending on severity

## Security Model

### API Keys

- **Provider API keys (BYOK)** are stored in VSCode SecretStorage (OS keychain) — never in plaintext settings
- CLI stores keys locally in `~/.ava/config.json`
- **Platform keys** (`sk-ava-xxx`) are stored in VSCode SecretStorage — never in plaintext settings
- Keys are never logged, committed, or transmitted anywhere except the configured provider endpoint (or the Ava platform proxy for managed accounts)
- Keys are sent via `Authorization: Bearer` headers over HTTPS

### Tool Execution

Ava executes tools (file read/write, shell commands) on behalf of the AI model. The **permission system** controls this:

| Mode | File Read/Search | File Write/Edit | Shell Commands |
|------|-----------------|-----------------|----------------|
| **Strict** (default) | Auto-approved | Requires approval | Requires approval |
| **Balanced** | Auto-approved | Auto-approved | Requires approval |
| **Autonomous** | Auto-approved | Auto-approved | Auto-approved |

- In **strict** mode (default), all destructive operations require explicit user approval
- Shell commands can execute arbitrary code — review them carefully before approving
- File operations are restricted to the workspace directory

### Platform Account Security

When connected to the Ava platform (optional):

- Platform API keys are hashed with SHA-256 before storage — only shown once at creation
- LLM proxy requests go through `ava-supernova.com/api/proxy` — no request/response content is stored (only token counts are logged)
- Rate limiting enforced on all platform API routes
- Stripe webhook signatures verified via `constructEvent()`
- All database tables use Row-Level Security — users can only access their own data
- SSRF protection blocks internal/private IP addresses from `http_request` tool
- Input validation and error sanitization on all endpoints

### What Ava Does NOT Do

- Does not send data to any server other than your configured LLM provider (or the Ava platform proxy if you connect an account)
- Does not collect telemetry, analytics, or usage data
- Does not access files outside the workspace unless explicitly instructed
- Does not store API keys in plaintext — all keys use OS-level secure storage

### Security Audit

A comprehensive security audit was completed on 2026-02-26. All 23 identified vulnerabilities were fixed across critical, high, medium, and low severity levels. See [SECURITY_FIXES.md](SECURITY_FIXES.md) for the full checklist.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.2.x | Yes |
| 0.1.x | Yes |
