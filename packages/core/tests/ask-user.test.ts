import { describe, it, expect } from 'vitest';
import { AskUserTool } from '../src/tools/ask-user.js';

describe('AskUserTool', () => {
  const tool = new AskUserTool();

  it('has name "ask_user" and riskLevel "safe"', () => {
    expect(tool.name).toBe('ask_user');
    expect(tool.riskLevel).toBe('safe');
  });

  it('requiresConfirmation is true (always needs user interaction)', () => {
    expect(tool.requiresConfirmation).toBe(true);
  });

  it('schema requires "question" parameter', () => {
    expect(tool.schema.parameters.required).toContain('question');
    expect(tool.schema.parameters.properties.question.type).toBe('string');
  });

  it('fallback execute returns success', async () => {
    const result = await tool.execute(
      { question: 'What color?' },
      { cwd: '/test' },
    );
    expect(result.success).toBe(true);
    expect(result.output).toContain('User response received');
  });
});
