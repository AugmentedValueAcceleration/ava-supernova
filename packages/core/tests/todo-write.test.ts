import { describe, it, expect } from 'vitest';
import { TodoWriteTool } from '../src/tools/todo-write.js';

describe('TodoWriteTool', () => {
  const tool = new TodoWriteTool();

  it('has name "todo_write" and riskLevel "safe"', () => {
    expect(tool.name).toBe('todo_write');
    expect(tool.riskLevel).toBe('safe');
    expect(tool.requiresConfirmation).toBe(false);
  });

  it('schema requires "todos" array', () => {
    expect(tool.schema.parameters.required).toContain('todos');
    expect(tool.schema.parameters.properties.todos.type).toBe('array');
  });

  it('returns formatted output with correct done count', async () => {
    const result = await tool.execute({
      todos: [
        { content: 'Task A', status: 'completed', activeForm: 'Doing A' },
        { content: 'Task B', status: 'in_progress', activeForm: 'Doing B' },
        { content: 'Task C', status: 'pending', activeForm: 'Doing C' },
      ],
    }, { cwd: '/test' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('1/3 done');
  });

  it('uses correct status icons: [x], [~], [ ]', async () => {
    const result = await tool.execute({
      todos: [
        { content: 'Done', status: 'completed', activeForm: '' },
        { content: 'Active', status: 'in_progress', activeForm: '' },
        { content: 'Waiting', status: 'pending', activeForm: '' },
      ],
    }, { cwd: '/test' });

    expect(result.output).toContain('[x] Done');
    expect(result.output).toContain('[~] Active');
    expect(result.output).toContain('[ ] Waiting');
  });

  it('handles empty todos array', async () => {
    const result = await tool.execute({ todos: [] }, { cwd: '/test' });
    expect(result.success).toBe(true);
    expect(result.output).toContain('0/0 done');
  });
});
