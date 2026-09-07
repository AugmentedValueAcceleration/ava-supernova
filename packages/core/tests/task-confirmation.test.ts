// The confirmation a task card cannot work without.
//
// Found live 2026-09-07: Ava suggested a task, the chat showed "✓ Added to your
// tasks", no Add button ever appeared, and the board was empty. Her own
// sentence in the same message said "tap Add if you want it" — the card and the
// prose disagreed, and the prose was right.
//
// task_suggest writes NOTHING on its own; the task exists only if the user taps
// Add on the card. No card, no tap, no task — and its execute() fallback
// reported success, which is exactly what the card renders "Added" from.
//
// Both task tools declare `requiresConfirmation = true` and nothing reads that
// field, so these pin the REGISTRY's answer rather than the declaration.

import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry } from '../src/tools/tool-registry.js';

let registry: ToolRegistry;

beforeEach(() => {
  registry = new ToolRegistry();
  registry.registerBuiltins();
});

function tool(name: string) {
  const t = registry.getTool(name);
  expect(t, `${name} is not registered`).toBeTruthy();
  return t!;
}

describe('task_suggest always gets its card', () => {
  it('requires confirmation even though it is a safe tool', () => {
    // The bug in one line. It is riskLevel 'safe', and needsConfirmation()
    // short-circuits every safe tool to false — so it has to be named above
    // that line, which it was not.
    expect(tool('task_suggest').riskLevel).toBe('safe');
    expect(registry.needsConfirmation(tool('task_suggest'), { title: 'Build the thing' })).toBe(true);
  });

  it('requires it in every permission mode, including the permissive ones', () => {
    // A suggestion card is not a permission question. There is no mode in which
    // "just add it without asking" is the right reading, because the tap IS the
    // task — skipping the card does not add it faster, it loses it entirely.
    for (const mode of ['strict', 'standard', 'autonomous'] as const) {
      registry.setPermissionMode(mode);
      expect(
        registry.needsConfirmation(tool('task_suggest'), { title: 'x' }),
        `task_suggest skipped its card in ${mode} mode`,
      ).toBe(true);
    }
  });

  it('never reports success from its own execute()', async () => {
    // The fallback path — a surface with no task-suggestion bridge. It used to
    // return success, and the card paints "✓ Added to your tasks" from exactly
    // that, so the one branch meaning "no card here" was the branch claiming
    // the task was on their board.
    const r = await tool('task_suggest').execute({ title: 'x' }, { cwd: '.' } as never);
    expect(r.success).toBe(false);
    expect(r.output.toLowerCase()).toContain('nothing was added');
  });
});

describe('task_manage prompts when it writes, not when it reads', () => {
  // Its own comment has said this since it was written — added because Ava was
  // creating tasks unprompted from tangential mentions — and it had never once
  // happened, because 'safe' short-circuited before anything read the action.
  it('confirms create, update and delete', () => {
    for (const action of ['create', 'update', 'delete']) {
      expect(
        registry.needsConfirmation(tool('task_manage'), { action }),
        `task_manage ${action} ran without asking`,
      ).toBe(true);
    }
  });

  it('does NOT confirm list', () => {
    // Mild friction on a read is friction for nothing, and the tool's comment
    // says so explicitly.
    expect(registry.needsConfirmation(tool('task_manage'), { action: 'list' })).toBe(false);
  });

  it('holds in autonomous mode too — this is about consent, not caution', () => {
    registry.setPermissionMode('autonomous');
    expect(registry.needsConfirmation(tool('task_manage'), { action: 'delete' })).toBe(true);
  });
});

describe('the safe short-circuit still does its job', () => {
  it('todo_write is not dragged into a prompt', () => {
    // The reason the short-circuit exists: safe tools getting stuck in
    // category-level "first_time" gates that never resolve. Fixing the task
    // tools must not undo that.
    expect(registry.needsConfirmation(tool('todo_write'), {})).toBe(false);
  });

  it('and a plain read stays silent', () => {
    expect(registry.needsConfirmation(tool('read'), { path: 'x.ts' })).toBe(false);
  });
});
