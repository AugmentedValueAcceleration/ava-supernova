// A refusal must never read as a success.
//
// The confirmation handler answers with true (approved), false (denied), or a
// string — and a string means APPROVED, with the string used as the tool's
// result instead of running it. present_plan relies on that.
//
// Which makes "denied, and here is why" genuinely dangerous to add casually. A
// reason is a string. Send it the obvious way and the registry reports
// success: true, writes 'user-approved' into the audit log, and hands the
// model a result for a call the user refused — on tools like bash and
// git_commit, which are exactly the ones that ask.
//
// So the reasoned denial is an OBJECT, and these tests exist to keep it that
// way. They are about the safety property, not the shape: a denial stays a
// denial, keeps success: false, is audited as denied, and never executes.

import { describe, it, expect, vi } from 'vitest';
import { ToolRegistry } from '../src/tools/tool-registry.js';
import type { Tool, ToolResult, AuditLogEntry } from '../src/tools/types.js';

/** A tool that records whether it was ever allowed to run. */
function spyTool(): Tool & { ran: boolean } {
  const tool = {
    name: 'danger_probe',
    description: 'Test tool that must not run when refused.',
    riskLevel: 'high' as const,
    parameters: { type: 'object' as const, properties: {} },
    ran: false,
    async execute(): Promise<ToolResult> {
      tool.ran = true;
      return { success: true, output: 'EXECUTED' };
    },
  };
  return tool;
}

function setup(decision: unknown) {
  const registry = new ToolRegistry();
  const tool = spyTool();
  registry.register(tool);
  registry.setPermissionMode('strict');
  const audit: AuditLogEntry[] = [];
  registry.setAuditCallback((e) => audit.push(e));
  registry.setConfirmationHandler(vi.fn().mockResolvedValue(decision) as never);
  return { registry, tool, audit };
}

describe('reasoned denial', () => {
  it('does not run the tool, and says why', async () => {
    const { registry, tool } = setup({ approved: false, reason: 'that would wipe the branch' });
    const res = await registry.execute('danger_probe', {}, {} as never);

    expect(tool.ran).toBe(false);
    expect(res.success).toBe(false);
    expect(res.output).toContain('denied by the user');
    expect(res.output).toContain('that would wipe the branch');
  });

  it('is audited as denied, never as an approval', async () => {
    const { registry, audit } = setup({ approved: false, reason: 'wrong directory' });
    await registry.execute('danger_probe', {}, {} as never);

    const entry = audit.find((e) => e.toolName === 'danger_probe');
    expect(entry?.approvalMethod).toBe('denied');
    expect(entry?.status).toBe('denied');
    // The reason is kept on the entry too, so the audit trail records what the
    // user actually objected to rather than just that they objected.
    expect(entry?.result).toBe('wrong directory');
  });

  it('tells the model not to repeat the identical call', async () => {
    // Without this the model reads a refusal as a transient failure and tries
    // again, which turns one refusal into a loop of confirmation cards.
    const { registry } = setup({ approved: false, reason: 'use the staging db' });
    const res = await registry.execute('danger_probe', {}, {} as never);
    expect(res.output.toLowerCase()).toContain('do not retry');
  });

  it('still refuses when the reason is blank', async () => {
    const { registry, tool } = setup({ approved: false, reason: '   ' });
    const res = await registry.execute('danger_probe', {}, {} as never);
    expect(tool.ran).toBe(false);
    expect(res.success).toBe(false);
  });
});

describe('the existing decisions are unchanged', () => {
  it('true runs the tool', async () => {
    const { registry, tool } = setup(true);
    const res = await registry.execute('danger_probe', {}, {} as never);
    expect(tool.ran).toBe(true);
    expect(res.success).toBe(true);
  });

  it('false refuses without a reason', async () => {
    const { registry, tool } = setup(false);
    const res = await registry.execute('danger_probe', {}, {} as never);
    expect(tool.ran).toBe(false);
    expect(res.success).toBe(false);
  });

  it('a bare string is still APPROVED-with-result — present_plan depends on it', async () => {
    // Pinned deliberately. If this ever flips to "denied", present_plan's
    // approval stops reaching the model; if the reasoned-denial object ever
    // collapses back into a plain string, refusals start reporting success.
    // The two shapes must stay distinguishable.
    const { registry, tool } = setup('the plan, approved with notes');
    const res = await registry.execute('danger_probe', {}, {} as never);
    expect(res.success).toBe(true);
    expect(res.output).toBe('the plan, approved with notes');
    expect(tool.ran).toBe(false); // string bypasses execute()
  });
});
