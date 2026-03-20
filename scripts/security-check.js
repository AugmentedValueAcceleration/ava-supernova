#!/usr/bin/env node
/**
 * Pre-commit security check (Node.js — cross-platform)
 *
 * Scans staged files for secrets and common vulnerabilities.
 * Works on Windows, macOS, and Linux without requiring bash.
 *
 * Usage:
 *   node scripts/security-check.js
 *   // Or in package.json scripts / husky hooks
 */

const { execSync } = require('child_process');

const PATTERNS = [
  { pattern: 'sk-[a-zA-Z0-9]{20,}', label: 'API Key (sk-*)' },
  { pattern: 'ghp_[a-zA-Z0-9]{36}', label: 'GitHub Token' },
  { pattern: 'AKIA[0-9A-Z]{16}', label: 'AWS Access Key' },
  { pattern: 'xox[bpras]-', label: 'Slack Token' },
  { pattern: 'BEGIN.*PRIVATE KEY', label: 'Private Key' },
  { pattern: 'sk_live_', label: 'Stripe Secret Key' },
  { pattern: 'SG\\.', label: 'SendGrid Key' },
];

const FORBIDDEN_FILE_PATTERNS = [
  /\.env$/,
  /\.env\.local$/,
  /\.env\.production$/,
  /\.pem$/,
  /\.key$/,
  /id_rsa$/,
  /id_ed25519$/,
];

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

function main() {
  console.log('Running security check...');

  let secretsFound = false;

  // Check each pattern against staged diffs
  for (const { pattern, label } of PATTERNS) {
    const files = run(`git diff --cached --diff-filter=ACM -S "${pattern}" --name-only`);
    if (files) {
      console.log(`  Potential secret found matching: ${label}`);
      console.log(`  Files: ${files}`);
      secretsFound = true;
    }
  }

  // Check for forbidden file types being committed
  const stagedFiles = run('git diff --cached --name-only');
  if (stagedFiles) {
    for (const file of stagedFiles.split('\n').filter(Boolean)) {
      for (const pattern of FORBIDDEN_FILE_PATTERNS) {
        if (pattern.test(file)) {
          console.log(`  Sensitive file staged for commit: ${file}`);
          secretsFound = true;
        }
      }
    }
  }

  if (secretsFound) {
    console.log('');
    console.log('Secrets detected in staged files. Remove them before committing.');
    console.log('Use environment variables or VS Code SecretStorage instead.');
    process.exit(1);
  }

  console.log('Security check passed');
  process.exit(0);
}

main();
