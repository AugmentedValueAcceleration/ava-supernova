import { describe, it, expect } from 'vitest';
import {
  classifyFile,
  selectChecks,
  type CheckId,
} from '../src/personas/verification-matrix.js';
import { fileMatchesSurface, deployPrefixes } from '../src/tools/deploy-manifest.js';

const ids = (changed: string[], opts?: { deployPrefixes?: string[] }): CheckId[] =>
  selectChecks(changed, opts).map((c) => c.id);

describe('verification-matrix · classifyFile', () => {
  it('classifies a plain source file as ts', () => {
    expect(classifyFile('src/foo.ts')).toEqual(['ts']);
  });

  it('tags auth + ts for an auth middleware', () => {
    const cats = classifyFile('src/auth/session.ts');
    expect(cats).toContain('auth');
    expect(cats).toContain('ts');
  });

  it('tags a SQL migration', () => {
    expect(classifyFile('supabase/migrations/292_x.sql')).toContain('migration');
  });

  it('does NOT tag deployed without prefixes', () => {
    expect(classifyFile('packages/web/src/app/dashboard/page.tsx')).not.toContain('deployed');
  });

  it('tags deployed when the file is under a declared prefix', () => {
    const cats = classifyFile('packages/web/src/app/dashboard/page.tsx', ['packages/web']);
    expect(cats).toContain('deployed');
    expect(cats).toContain('route');
  });

  it('does not over-match a sibling directory by prefix', () => {
    // "packages/web" must not match "packages/web-tools/..."
    expect(classifyFile('packages/web-tools/x.ts', ['packages/web'])).not.toContain('deployed');
  });
});

describe('verification-matrix · selectChecks', () => {
  it('returns nothing for an empty change set', () => {
    expect(selectChecks([])).toEqual([]);
  });

  it('runs typecheck once regardless of file count', () => {
    const checks = ids(['a.ts', 'b.ts', 'c.tsx']);
    expect(checks.filter((c) => c === 'typecheck')).toHaveLength(1);
  });

  it('emits mandatory auth_full_suite for auth paths', () => {
    expect(ids(['src/auth/login.ts'])).toContain('auth_full_suite');
  });

  it('does NOT emit deploy_state without a deploy prefix', () => {
    expect(ids(['packages/web/src/app/dashboard/page.tsx'])).not.toContain('deploy_state');
  });

  it('emits deploy_state for a file under a deployed surface', () => {
    const checks = ids(['packages/web/src/app/dashboard/page.tsx'], { deployPrefixes: ['packages/web'] });
    expect(checks).toContain('deploy_state');
  });

  it('places deploy_state last — liveness is checked after correctness', () => {
    const checks = ids(['packages/web/src/app/dashboard/page.tsx'], { deployPrefixes: ['packages/web'] });
    expect(checks[checks.length - 1]).toBe('deploy_state');
  });
});

describe('deploy-manifest · matching', () => {
  const surface = { name: 'web', match: 'packages/web/**', url: 'https://x', marker: 'x-ava-commit' };

  it('matches a file under the surface prefix', () => {
    expect(fileMatchesSurface('packages/web/src/app/dashboard/page.tsx', surface)).toBe(true);
  });

  it('matches the prefix directory itself', () => {
    expect(fileMatchesSurface('packages/web', surface)).toBe(true);
  });

  it('rejects a sibling directory', () => {
    expect(fileMatchesSurface('packages/web-tools/x.ts', surface)).toBe(false);
  });

  it('normalises Windows backslashes', () => {
    expect(fileMatchesSurface('packages\\web\\src\\app.tsx', surface)).toBe(true);
  });

  it('derives literal prefixes, stripping glob suffixes', () => {
    expect(deployPrefixes({ surfaces: [surface] })).toEqual(['packages/web']);
  });

  it('returns no prefixes for a null manifest', () => {
    expect(deployPrefixes(null)).toEqual([]);
  });
});
