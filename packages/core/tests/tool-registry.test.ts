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
    expect(names).toContain('file_read');
    expect(names).toContain('file_write');
    expect(names).toContain('file_edit');
    expect(names).toContain('glob');
    expect(names).toContain('grep');
    expect(names).toContain('bash');
    expect(names).toContain('present_plan');
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

    await registry.execute('write_tool', { arg: 'val' }, { cwd: '.' });
    expect(handler).toHaveBeenCalledWith('write_tool', { arg: 'val' });
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

  it('requires confirmation for dangerous tools in balanced mode', async () => {
    const tool = makeTool({ name: 'danger_tool', riskLevel: 'dangerous' });
    registry.register(tool);
    registry.setPermissionMode('balanced');

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
