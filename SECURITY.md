# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Ava | Supernova, please report it responsibly.

**Do NOT open a public issue for security vulnerabilities.**

Instead, email the maintainers or use [GitHub's private vulnerability reporting](https://github.com/AugmentedValueAcceleration/ava-supernova/security/advisories/new).

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

- API keys are stored locally in `~/.ava/config.json` (CLI) or VSCode settings (extension)
- Keys are never logged, committed, or transmitted anywhere except the configured provider endpoint
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

### What Ava Does NOT Do

- Does not send data to any server other than your configured LLM provider
- Does not collect telemetry, analytics, or usage data
- Does not access files outside the workspace unless explicitly instructed
- Does not store API keys anywhere except local configuration

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x | Yes |
