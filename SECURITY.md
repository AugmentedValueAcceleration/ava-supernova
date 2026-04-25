# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Ava Supernova, please report it responsibly.

**Do NOT open a public issue for security vulnerabilities.**

Instead, email **security@ava-supernova.com** or use [GitHub's private vulnerability reporting](https://github.com/AugmentedValueAcceleration/ava-supernova/security/advisories/new).

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Affected component (CLI, extension, IDE, web platform, core)
- Suggested fix (if you have one)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Assessment**: Within 1 week
- **Fix (Critical/High)**: Within 72 hours of assessment
- **Fix (Medium/Low)**: Within 2 weeks of assessment
- **Disclosure**: Coordinated with reporter — minimum 90 days before public disclosure

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.6.x   | Yes — current |
| 0.5.x   | Security fixes only |
| < 0.5   | No |

## Security Model

### Scope & Boundaries

Ava is a **coding agent that executes tools on your local machine**. The security model is built around three principles:

1. **User approval gates dangerous operations** — the permission system controls what runs without confirmation
2. **Path boundaries prevent escape** — file and search tools are restricted to the workspace and home directory
3. **Secrets never leave your machine** — API keys stay in OS-level secure storage, never logged or transmitted beyond provider endpoints

### Permission System

Ava executes tools (file read/write, shell commands, git operations) on behalf of the AI model. The **permission system** controls this:

| Mode | File Read/Search | File Write/Edit | Shell Commands | Git Operations |
|------|-----------------|-----------------|----------------|----------------|
| **Strict** (default) | Auto-approved | Requires approval | Requires approval | Requires approval |
| **Balanced** | Auto-approved | Auto-approved | Requires approval | Requires approval |
| **Autonomous** | Auto-approved | Auto-approved | Auto-approved | Auto-approved |

- In **strict** mode (default), all destructive operations require explicit user approval
- Shell commands can execute arbitrary code — review them carefully before approving
- File operations are restricted to the workspace directory and user home directory

### Tool Risk Classification

Every tool has a risk level that determines its behaviour:

| Risk Level | Confirmation | Examples |
|------------|-------------|----------|
| **safe** | Never required | file_read, glob, grep, list_directory, git_status |
| **write** | Required in strict mode | file_write, file_edit, memory_save |
| **dangerous** | Always required (except autonomous) | bash, git_diff, rollback |

### Path Traversal Prevention

All file and search tools (`file_read`, `file_write`, `file_edit`, `glob`, `grep`, `list_directory`) use a shared security module (`tools/security.ts`) that:

- Resolves paths to absolute form before any operation
- Validates the resolved path is within the current working directory **or** the user's home directory
- Rejects any path that escapes these boundaries (e.g., `../../etc/passwd`)
- Handles symlink resolution to prevent link-based escapes

### Credential Detection

A shared credential detection system scans for secrets before they can be leaked through outbound tools:

- **Patterns detected**: Stripe keys, GitHub/GitLab/Slack tokens, JWTs, AWS access keys, Google API keys, PEM private keys
- **Applied to**: `memory_save` (blocks saving secrets to memory), `support_request` (blocks sending secrets in support tickets)
- **Centralised**: All patterns defined once in `tools/security.ts` — no duplication across tools

### ReDoS Protection

The `grep` tool limits regex pattern length to 500 characters to prevent Regular Expression Denial of Service attacks that could freeze the agent.

### API Keys

- **Provider API keys (BYOK)** are stored in VSCode SecretStorage (OS keychain) — never in plaintext settings
- CLI stores keys locally in `~/.ava/config.json` with restricted file permissions
- **Platform keys** (`sk-ava-xxx`) are stored in VSCode SecretStorage — never in plaintext settings
- Keys are never logged, committed, or transmitted anywhere except the configured provider endpoint (or the Ava platform proxy for managed accounts)
- Keys are sent via `Authorization: Bearer` headers over HTTPS

### Platform Account Security

When connected to the Ava platform (optional):

- Platform API keys are hashed with SHA-256 before storage — only shown once at creation
- LLM proxy requests go through `ava-supernova.com/api/proxy` — no request/response content is stored (only token counts are logged)
- Rate limiting enforced on all platform API routes
- Stripe webhook signatures verified via `constructEvent()`
- All database tables use Row-Level Security — users can only access their own data
- SSRF protection blocks internal/private IP addresses from `http_request` tool
- Admin authentication uses HMAC-SHA256 signed cookies with 1-hour expiry
- Input validation and error sanitization on all endpoints

### What Ava Does NOT Do

- Does not send data to any server other than your configured LLM provider (or the Ava platform proxy if you connect an account)
- Does not collect telemetry, analytics, or usage data
- Does not access files outside the workspace and home directory boundaries
- Does not store API keys in plaintext — all keys use OS-level secure storage
- Does not forward raw provider error messages to clients

## Security Audits

### March 2026 — Tool Security Hardening

Completed hardening of all 24 agent tools:

- Centralised path traversal prevention across all file/search tools
- Shared credential detection module blocking secrets in outbound tools
- ReDoS guard on regex-based tools
- Full audit of tool confirmation/approval gates

### February 2026 — Initial Comprehensive Audit

23 vulnerabilities identified and fixed across critical, high, medium, and low severity levels. See [SECURITY_FIXES.md](SECURITY_FIXES.md) for the full checklist.

## Incident Response

If a security vulnerability is confirmed:

1. **Triage** — Assess severity, affected versions, and attack surface
2. **Patch** — Develop fix on a private branch, no public commits until ready
3. **Release** — Ship patched version to npm and VS Code Marketplace
4. **Notify** — Email reporter, post GitHub Security Advisory, update this document
5. **Post-mortem** — Document root cause and prevention measures

For critical vulnerabilities affecting the web platform, the fix will be deployed to production immediately. For CLI/extension vulnerabilities, a patch release will be published within 72 hours.
