import { describe, it, expect } from 'vitest';
import { PresentPlanTool } from '../src/tools/present-plan.js';

describe('PresentPlanTool', () => {
  const tool = new PresentPlanTool();

  it('has correct name and risk level', () => {
    expect(tool.name).toBe('present_plan');
    expect(tool.riskLevel).toBe('write');
  });

  it('schema requires title, goal, steps, and verification', () => {
    const required = tool.schema.parameters.required;
    expect(required).toContain('title');
    expect(required).toContain('goal');
    expect(required).toContain('steps');
    expect(required).toContain('verification');
  });

  it('schema includes optional alternatives', () => {
    const props = tool.schema.parameters.properties as Record<string, unknown>;
    expect(props).toHaveProperty('alternatives');
  });

  it('execute returns fallback approval message', async () => {
    const result = await tool.execute({}, { cwd: '.' });
    expect(result.success).toBe(true);
    expect(result.output).toContain('approved');
  });
});
