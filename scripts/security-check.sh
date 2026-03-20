#!/bin/bash
# Pre-commit security check
# Scans staged files for secrets and common vulnerabilities
# Works on Unix, macOS, and Windows (Git Bash)

echo "Running security check..."

SECRETS_FOUND=0

# Patterns to check for in staged changes
check_pattern() {
  local pattern="$1"
  local label="$2"
  local matches
  matches=$(git diff --cached --diff-filter=ACM -S "$pattern" --name-only 2>/dev/null)
  if [ -n "$matches" ]; then
    echo "  Potential secret found matching: $label"
    echo "  Files: $matches"
    SECRETS_FOUND=1
  fi
}

check_pattern 'sk-[a-zA-Z0-9]\{20,\}' "API Key (sk-*)"
check_pattern 'ghp_[a-zA-Z0-9]\{36\}' "GitHub Token"
check_pattern 'AKIA[0-9A-Z]\{16\}' "AWS Access Key"
check_pattern 'xox[bpras]-' "Slack Token"
check_pattern 'BEGIN.*PRIVATE KEY' "Private Key"
check_pattern 'sk_live_' "Stripe Secret Key"
check_pattern 'SG\.' "SendGrid Key"

# Check for .env files being committed
ENV_FILES=$(git diff --cached --name-only 2>/dev/null | grep -E '\.env$|\.env\.local$|\.env\.production$')
if [ -n "$ENV_FILES" ]; then
  echo "  Environment file staged for commit:"
  echo "  $ENV_FILES"
  SECRETS_FOUND=1
fi

# Check for private key files
KEY_FILES=$(git diff --cached --name-only 2>/dev/null | grep -E '\.pem$|\.key$|id_rsa$|id_ed25519$')
if [ -n "$KEY_FILES" ]; then
  echo "  Private key file staged for commit:"
  echo "  $KEY_FILES"
  SECRETS_FOUND=1
fi

if [ "$SECRETS_FOUND" -eq 1 ]; then
  echo ""
  echo "Secrets detected in staged files. Remove them before committing."
  echo "Use environment variables or VS Code SecretStorage instead."
  exit 1
fi

echo "Security check passed"
