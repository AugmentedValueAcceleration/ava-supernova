// A written tool call is still a tool call.
//
// Seen live on 2026-08-19, Plan mode, a real project: Ava produced a complete
// and correct plan and emitted it as
//
//   <present_plan>
//   { "title": "Inventory System Completion Plan", "steps": [ … ] }
//   </present_plan>
//
// in the visible reply. The user got a wall of JSON where a plan card belongs,
// and the turn closed cleanly because the agent saw no tool_calls at all.
//
// The failure is quiet in the worst way: the work was right, the presentation
// destroyed it, and nothing errored.

import { describe, it, expect } from 'vitest';
import { recoverWrittenToolCalls } from '../src/agent/recover-written-calls.js';

const OFFERED = new Set(['present_plan', 'ask_user', 'read']);
const ids = () => {
  let n = 0;
  return () => `id_${++n}`;
};

describe('recovering a tool call written as text', () => {
  it('lifts the call the operator actually hit', () => {
    const content = `I have a clear picture of your inventory system.

<present_plan>
{"title":"Inventory System Completion Plan","goal":"Complete the implementation"}
</present_plan>`;

    const { calls, text } = recoverWrittenToolCalls(content, OFFERED, ids());
    expect(calls).toHaveLength(1);
    expect(calls[0].function.name).toBe('present_plan');
    expect(JSON.parse(calls[0].function.arguments).title).toBe('Inventory System Completion Plan');
    // The prose survives; only the block goes.
    expect(text).toBe('I have a clear picture of your inventory system.');
  });

  it('recovers more than one call in a reply', () => {
    const content = '<ask_user>{"question":"which one?"}</ask_user> and <read>{"path":"a.ts"}</read>';
    const { calls } = recoverWrittenToolCalls(content, OFFERED, ids());
    expect(calls.map((c) => c.function.name)).toEqual(['ask_user', 'read']);
  });

  it('ignores a tag that is not a tool offered this turn', () => {
    // The whole point of the allowlist: a model musing in angle brackets, or a
    // reply about XML, must not become a tool call.
    const content = '<summary>{"note":"not a tool"}</summary>';
    const { calls, text } = recoverWrittenToolCalls(content, OFFERED, ids());
    expect(calls).toEqual([]);
    expect(text).toBe(content);
  });

  it('ignores a tool tag wrapped around prose rather than JSON', () => {
    const content = '<present_plan>I think we should start with the widget.</present_plan>';
    const { calls, text } = recoverWrittenToolCalls(content, OFFERED, ids());
    expect(calls).toEqual([]);
    expect(text).toBe(content);
  });

  it('ignores a JSON array — arguments are an object', () => {
    const content = '<present_plan>[1,2,3]</present_plan>';
    expect(recoverWrittenToolCalls(content, OFFERED, ids()).calls).toEqual([]);
  });

  it('ignores malformed JSON rather than guessing at it', () => {
    const content = '<present_plan>{"title": "unclosed</present_plan>';
    expect(recoverWrittenToolCalls(content, OFFERED, ids()).calls).toEqual([]);
  });

  it('leaves an ordinary reply byte-identical', () => {
    // Whitespace tidying only runs when something was removed, so normal prose
    // — including code fences and angle brackets — is never reformatted.
    const content = 'Use `Array<string>` here.\n\n\nAnd keep the blank lines.';
    const { calls, text } = recoverWrittenToolCalls(content, OFFERED, ids());
    expect(calls).toEqual([]);
    expect(text).toBe(content);
  });

  it('does nothing when no tools were offered', () => {
    const content = '<present_plan>{"title":"x"}</present_plan>';
    const { calls, text } = recoverWrittenToolCalls(content, new Set(), ids());
    expect(calls).toEqual([]);
    expect(text).toBe(content);
  });

  it('recovers from the OPENING tag when the closing one mismatches', () => {
    // Reversed 2026-08-19 when the unclosed form was handled. This used to
    // assert no recovery, guarding against loose matching. But an opening tag
    // naming a real tool, wrapping valid JSON, is a call whatever the closing
    // tag says — a mismatch is a typo, not a different kind of statement. The
    // orphan tag is swallowed with it rather than left in the reply.
    const content = '<present_plan>{"title":"x"}</ask_user>';
    const { calls, text } = recoverWrittenToolCalls(content, OFFERED, ids());
    expect(calls).toHaveLength(1);
    expect(calls[0].function.name).toBe('present_plan');
    expect(text).toBe('');
  });
});

describe('recovering a call written without a closing tag', () => {
  it('lifts the exact shape the operator hit', () => {
    // 2026-08-19, immediately after the paired form was fixed:
    //   <read>
    //   {"file_path": "Decisions/design/inventory-data-model.md"}
    // and nothing after it.
    const content = `Let me first check the Decisions folder.

<read>
{"file_path": "Decisions/design/inventory-data-model.md"}`;

    const { calls, text } = recoverWrittenToolCalls(content, OFFERED, ids());
    expect(calls).toHaveLength(1);
    expect(calls[0].function.name).toBe('read');
    expect(JSON.parse(calls[0].function.arguments).file_path)
      .toBe('Decisions/design/inventory-data-model.md');
    expect(text).toBe('Let me first check the Decisions folder.');
  });

  it('handles a nested object — a lazy match would truncate it', () => {
    const content = '<present_plan>{"title":"x","steps":[{"description":"a"}],"confidence":"high"}';
    const { calls } = recoverWrittenToolCalls(content, OFFERED, ids());
    expect(calls).toHaveLength(1);
    const args = JSON.parse(calls[0].function.arguments);
    expect(args.steps[0].description).toBe('a');
    expect(args.confidence).toBe('high');
  });

  it('is not fooled by a brace inside a string', () => {
    const content = '<read>{"file_path":"src/{weird}/file.ts"}';
    const { calls } = recoverWrittenToolCalls(content, OFFERED, ids());
    expect(JSON.parse(calls[0].function.arguments).file_path).toBe('src/{weird}/file.ts');
  });

  it('leaves an unclosed tag with no JSON alone', () => {
    const content = 'Use <read> when you want a file.';
    const { calls, text } = recoverWrittenToolCalls(content, OFFERED, ids());
    expect(calls).toEqual([]);
    expect(text).toBe(content);
  });

  it('does not double-count a properly closed call', () => {
    const content = '<read>{"file_path":"a.ts"}</read>';
    const { calls } = recoverWrittenToolCalls(content, OFFERED, ids());
    expect(calls).toHaveLength(1);
  });

  it('leaves an unterminated object alone rather than guessing', () => {
    const content = '<read>{"file_path":"a.ts"';
    expect(recoverWrittenToolCalls(content, OFFERED, ids()).calls).toEqual([]);
  });
});
