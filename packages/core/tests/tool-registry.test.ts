import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRegistry } from '../src/tools/tool-registry.js';
import type { Tool, ToolResult, ToolExecutionContext } from '../src/tools/types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTool(overrides: Partial<Tool> & Pick<Tool, 'name' | 'riskLevel'>): Tool {
  return {
    description: overrides.name,
    schema: { name: overrides.name, description: overrides.name, parameters: { type: 'object', properties: {} } },
    requiresConfirmation: overrides.riskLevel !== 'safe',
    execute: vi.fn(async () => ({ success: true, output: 'ok' })),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('registers and lists builtin tools', () => {
    registry.registerBuiltins();
    const schemas = registry.getSchemas();
    const names = schemas.map((s) => s.function.name);
    // getSchemas() presents file tools to the model under short convention
    // names (file_read → read, file_write → write, file_edit → edit) via
    // INTERNAL_TO_MODEL_NAME; other tools keep their names.
    expect(names).toContain('read');
    expect(names).toContain('write');
    expect(names).toContain('edit');
    expect(names).toContain('glob');
    expect(names).toContain('grep');
    expect(names).toContain('bash');
    expect(names).toContain('present_plan');
    // Internal identity stays stable — the agent + dataset capture key off
    // these (e.g. VERIFICATION_TOOLS matches 'file_read', not 'read').
    expect(registry.getTool('file_read')).toBeDefined();
    expect(registry.getTool('file_write')).toBeDefined();
    expect(registry.getTool('file_edit')).toBeDefined();
  });

  it('executes a safe tool without confirmation', async () => {
    const tool = makeTool({ name: 'safe_tool', riskLevel: 'safe' });
    registry.register(tool);
    registry.setPermissionMode('strict');

    const handler = vi.fn();
    registry.setConfirmationHandler(handler);

    const result = await registry.execute('safe_tool', {}, { cwd: '.' });
    expect(result.success).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  it('requires confirmation for write tools in strict mode', async () => {
    const tool = makeTool({ name: 'write_tool', riskLevel: 'write' });
    registry.register(tool);
    registry.setPermissionMode('strict');

    const handler = vi.fn(async () => true);
    registry.setConfirmationHandler(handler);

    // write_tool → default 'file_ops' category; strict/file_ops = 'first_time',
    // so the first invocation this session prompts.
    await registry.execute('write_tool', { arg: 'val' }, { cwd: '.' });
    expect(handler).toHaveBeenCalled();
    // Handler signature is (name, args, toolCallId) — assert the first two
    // robustly rather than pinning the optional trailing arg.
    expect(handler.mock.calls[0][0]).toBe('write_tool');
    expect(handler.mock.calls[0][1]).toEqual({ arg: 'val' });
  });

  it('auto-approves write tools in balanced mode', async () => {
    const tool = makeTool({ name: 'write_tool', riskLevel: 'write' });
    registry.register(tool);
    registry.setPermissionMode('balanced');

    const handler = vi.fn();
    registry.setConfirmationHandler(handler);

    await registry.execute('write_tool', {}, { cwd: '.' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('requires confirmation for an always-ask category', async () => {
    // Confirmation is category-based now, not raw riskLevel: in balanced mode
    // the risky categories (shell/system/database) default to 'always_ask'.
    // danger_tool maps to the default 'file_ops' category, so force that
    // category to 'always_ask' to exercise the gate the real risky tools hit.
    const tool = makeTool({ name: 'danger_tool', riskLevel: 'dangerous' });
    registry.register(tool);
    registry.setPermissionMode('balanced');
    registry.setCategoryPermission('file_ops', 'always_ask');

    const handler = vi.fn(async () => true);
    registry.setConfirmationHandler(handler);

    await registry.execute('danger_tool', {}, { cwd: '.' });
    expect(handler).toHaveBeenCalled();
  });

  it('auto-approves all tools in autonomous mode', async () => {
    const tool = makeTool({ name: 'danger_tool', riskLevel: 'dangerous' });
    registry.register(tool);
    registry.setPermissionMode('autonomous');

    const handler = vi.fn();
    registry.setConfirmationHandler(handler);

    await registry.execute('danger_tool', {}, { cwd: '.' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns denial message when confirmation handler returns false', async () => {
    const tool = makeTool({ name: 'write_tool', riskLevel: 'write' });
    registry.register(tool);
    registry.setPermissionMode('strict');
    registry.setConfirmationHandler(async () => false);

    const result = await registry.execute('write_tool', {}, { cwd: '.' });
    expect(result.success).toBe(false);
    expect(result.output).toContain('denied');
  });

  it('uses string result from confirmation handler (plan approval)', async () => {
    const tool = makeTool({ name: 'present_plan', riskLevel: 'write' });
    registry.register(tool);
    registry.setPermissionMode('strict');
    registry.setConfirmationHandler(async () => 'Plan approved. Execute the steps.');

    const result = await registry.execute('present_plan', {}, { cwd: '.' });
    expect(result.success).toBe(true);
    expect(result.output).toBe('Plan approved. Execute the steps.');
    // execute() should NOT have been called — string result bypasses it
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it('returns error for unknown tool', async () => {
    const result = await registry.execute('nonexistent', {}, { cwd: '.' });
    expect(result.success).toBe(false);
    expect(result.output).toContain('Unknown tool');
  });

  it('catches tool execution errors gracefully', async () => {
    const tool = makeTool({
      name: 'broken_tool',
      riskLevel: 'safe',
      execute: async () => { throw new Error('kaboom'); },
    });
    registry.register(tool);

    const result = await registry.execute('broken_tool', {}, { cwd: '.' });
    expect(result.success).toBe(false);
    expect(result.output).toContain('kaboom');
  });
});
