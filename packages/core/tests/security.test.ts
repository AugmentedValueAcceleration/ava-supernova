import { describe, it, expect } from 'vitest';
import { validatePath, validateSearchPath, containsCredentials, SECRET_PATTERNS } from '../src/tools/security.js';

// ── validatePath ─────────────────────────────────────────────────────────────

describe('validatePath', () => {
  const cwd = process.platform === 'win32' ? 'C:\\Users\\test\\project' : '/home/test/project';
  const home = process.env.HOME || process.env.USERPROFILE || '';

  it('allows absolute path within cwd', () => {
    const sub = process.platform === 'win32'
      ? 'C:\\Users\\test\\project\\src\\index.ts'
      : '/home/test/project/src/index.ts';
    expect(validatePath(sub, cwd)).toBe(sub);
  });

  it('resolves relative path against cwd', () => {
    const result = validatePath('src/index.ts', cwd);
    expect(result).toContain('src');
    expect(result).toContain('index.ts');
  });

  it('allows paths within home directory', () => {
    if (!home) return; // skip if HOME not set
    const homePath = process.platform === 'win32'
      ? `${home}\\.ava\\config.json`
      : `${home}/.ava/config.json`;
    expect(validatePath(homePath, cwd)).toContain('.ava');
  });

  it('rejects path traversal with ../', () => {
    expect(() => validatePath('../../../../etc/passwd', cwd)).toThrow('outside the project');
  });

  it('rejects absolute path outside cwd and home', () => {
    const outside = process.platform === 'win32' ? 'C:\\Windows\\System32\\config' : '/etc/shadow';
    expect(() => validatePath(outside, cwd)).toThrow('outside the project');
  });

  it('handles path with redundant separators', () => {
    const result = validatePath('src//utils///helper.ts', cwd);
    expect(result).toContain('helper.ts');
  });
});

// ── validateSearchPath ───────────────────────────────────────────────────────

describe('validateSearchPath', () => {
  const cwd = process.platform === 'win32' ? 'C:\\Users\\test\\project' : '/home/test/project';

  it('returns cwd when no path provided', () => {
    expect(validateSearchPath(undefined, cwd)).toBe(cwd);
  });

  it('returns cwd when empty string provided', () => {
    expect(validateSearchPath('', cwd)).toBe(cwd);
  });

  it('validates provided path same as validatePath', () => {
    expect(() => validateSearchPath('../../../../etc/passwd', cwd)).toThrow('outside the project');
  });
});

// ── containsCredentials ──────────────────────────────────────────────────────

describe('containsCredentials', () => {
  // Build test patterns dynamically so GitHub push protection doesn't flag them.
  // Each pattern matches our regex but is clearly not a real key.
  const fakeKey = (prefix: string, suffix: string) => prefix + suffix;

  it('detects Stripe-style keys (sk_live prefix)', () => {
    expect(containsCredentials(fakeKey('sk_live_', 'FAKE000000FAKE000000FAKE'))).toBe(true);
  });

  it('detects Stripe-style keys (sk_test prefix)', () => {
    expect(containsCredentials(fakeKey('sk_test_', 'FAKE000000FAKE000000FAKE'))).toBe(true);
  });

  it('detects Anthropic-style keys', () => {
    expect(containsCredentials(fakeKey('sk-ant-', 'FAKE000000FAKE000000'))).toBe(true);
  });

  it('detects GitHub token patterns', () => {
    expect(containsCredentials(fakeKey('ghp_', 'FAKE00FAKE00FAKE00FAKE00'))).toBe(true);
  });

  it('detects GitLab PAT patterns', () => {
    expect(containsCredentials(fakeKey('glpat-', 'FAKE00FAKE00FAKE00FAKE00'))).toBe(true);
  });

  it('detects Slack token patterns', () => {
    expect(containsCredentials(fakeKey('xoxb-', 'FAKE00-FAKE00FAKE00FAKE00'))).toBe(true);
  });

  it('detects AWS access key patterns', () => {
    expect(containsCredentials(fakeKey('AKIA', 'FAKE00FAKE00FAKE'))).toBe(true);
  });

  it('detects Google API key patterns', () => {
    expect(containsCredentials(fakeKey('AIza', 'FAKE00FAKE00FAKE00FAKE00FAKE00FAKE'))).toBe(true);
  });

  it('detects PEM private keys', () => {
    expect(containsCredentials('-----BEGIN RSA PRIVATE KEY-----')).toBe(true);
    expect(containsCredentials('-----BEGIN PRIVATE KEY-----')).toBe(true);
    expect(containsCredentials('-----BEGIN EC PRIVATE KEY-----')).toBe(true);
  });

  it('detects JWT patterns', () => {
    // Build a fake JWT-like string with 50+ chars per segment
    const header = 'eyJ' + 'A'.repeat(60);
    const payload = 'B'.repeat(60);
    expect(containsCredentials(`${header}.${payload}`)).toBe(true);
  });

  it('returns false for normal code', () => {
    expect(containsCredentials('const foo = "bar";\nfunction hello() { return 42; }')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(containsCredentials('')).toBe(false);
  });

  it('returns false for regular API usage code', () => {
    expect(containsCredentials('const apiKey = process.env.API_KEY;')).toBe(false);
  });
});

// ── SECRET_PATTERNS exhaustive ───────────────────────────────────────────────

describe('SECRET_PATTERNS', () => {
  it('has at least 8 patterns covering major providers', () => {
    expect(SECRET_PATTERNS.length).toBeGreaterThanOrEqual(8);
  });

  it('patterns do not match common false positives', () => {
    const falsePositives = [
      'skeleton-text',
      'skill_level_test',
      'const ghpId = 123',
      'skipTest()',
      'AIzaShort',  // Too short for Google key
    ];
    for (const fp of falsePositives) {
      expect(containsCredentials(fp)).toBe(false);
    }
  });
});
