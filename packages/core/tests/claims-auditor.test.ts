import { describe, it, expect } from 'vitest';
import { auditClaims } from '../src/agent/claims-auditor.js';

const noTools: Array<{ name: string; ok: boolean }> = [];

describe('claims-auditor: flags unbacked state claims', () => {
  it('flags "Done —" with no verifying tool', () => {
    expect(auditClaims({ text: 'Done — the fix is in.', toolsUsed: noTools }).flagged).toBe(true);
  });
  it('flags "it\'s live now"', () => {
    expect(auditClaims({ text: "It's live now, give it a try.", toolsUsed: noTools }).flagged).toBe(true);
  });
  it('flags "tests pass" with no test run', () => {
    expect(auditClaims({ text: 'All wired up and the tests pass.', toolsUsed: noTools }).flagged).toBe(true);
  });
  it('flags "it works"', () => {
    expect(auditClaims({ text: 'Pushed the change and it works.', toolsUsed: noTools }).flagged).toBe(true);
  });
  it('flags "verified" with no evidence', () => {
    expect(auditClaims({ text: 'Verified — the route is correct.', toolsUsed: noTools }).flagged).toBe(true);
  });
  it('flags "returns a 200" with no request', () => {
    expect(auditClaims({ text: 'The endpoint returns a 200.', toolsUsed: noTools }).flagged).toBe(true);
  });
});

describe('claims-auditor: does NOT flag when honest or backed', () => {
  it('does not flag when a verifying tool succeeded', () => {
    expect(auditClaims({ text: 'Done — tests pass.', toolsUsed: [{ name: 'test_run', ok: true }] }).flagged).toBe(false);
  });
  it('does not flag a live claim backed by an http_request', () => {
    expect(auditClaims({ text: "It's live — confirmed working.", toolsUsed: [{ name: 'http_request', ok: true }] }).flagged).toBe(false);
  });
  it('does not flag hedged language ("should work")', () => {
    expect(auditClaims({ text: 'This should work now, but I haven\'t run it.', toolsUsed: noTools }).flagged).toBe(false);
  });
  it('does not flag explanatory "works by …"', () => {
    expect(auditClaims({ text: 'This works by reading the config first.', toolsUsed: noTools }).flagged).toBe(false);
  });
  it('does not flag a plain action statement (a fact, not a claim)', () => {
    expect(auditClaims({ text: 'I updated the file and added the import.', toolsUsed: noTools }).flagged).toBe(false);
  });
  it('does not flag explicit "not verified"', () => {
    expect(auditClaims({ text: "Change is in; I haven't verified it works yet.", toolsUsed: noTools }).flagged).toBe(false);
  });
  it('does not flag a failed verifying tool from rescuing nothing (still no real claim)', () => {
    expect(auditClaims({ text: 'I made the edit.', toolsUsed: [{ name: 'test_run', ok: false }] }).flagged).toBe(false);
  });
});
