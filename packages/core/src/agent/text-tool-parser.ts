/**
 * Text-based tool call parser for models that don't support native tool_calls.
 *
 * When a model lacks native function calling, we:
 * 1. Inject tool descriptions into the system prompt as text
 * 2. Instruct the model to output tool calls as XML blocks
 * 3. Parse the XML blocks from the model's text response
 * 4. Convert them into the standard ToolCall format
 *
 * Format used:
 *   <tool_call>
 *   {"name": "tool_name", "arguments": {"param": "value"}}
 *   </tool_call>
 */

import type { ToolSchema } from '../providers/types.js';
import type { ToolCall } from '../core/types.js';

// Regex to match <tool_call>...</tool_call> blocks (lazy, dotAll)
const TOOL_CALL_REGEX = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;

let _callCounter = 0;

/**
 * Generate a text description of available tools to inject into the system prompt.
 */
export function buildToolPrompt(schemas: ToolSchema[]): string {
  if (schemas.length === 0) return '';

  const toolDescriptions = schemas.map((schema) => {
    const fn = schema.function;
    const params = fn.parameters;
    const required = new Set(params.required ?? []);

    const paramLines = Object.entries(params.properties).map(([name, def]) => {
      const p = def as Record<string, unknown>;
      const type = p.type ?? 'string';
      const desc = p.description ?? '';
      const req = required.has(name) ? ' (required)' : ' (optional)';
      const enumValues = p.enum ? ` — one of: ${(p.enum as string[]).join(', ')}` : '';
      return `    - ${name}: ${type}${req} — ${desc}${enumValues}`;
    });

    return `### ${fn.name}\n${fn.description}\nParameters:\n${paramLines.join('\n')}`;
  });

  return `## Available Tools

You have access to the following tools. To use a tool, output a <tool_call> block with the tool name and arguments as JSON:

<tool_call>
{"name": "tool_name", "arguments": {"param1": "value1", "param2": "value2"}}
</tool_call>

You can make multiple tool calls in a single response. Each must be in its own <tool_call> block.
After each tool call, you will receive the result. Use the results to continue your work.
Always explain what you're doing before and after tool calls.

${toolDescriptions.join('\n\n')}`;
}

/**
 * Parse tool calls from model text output.
 * Returns the extracted tool calls and the text with tool_call blocks removed.
 */
export function parseToolCalls(text: string): { toolCalls: ToolCall[]; cleanText: string } {
  const toolCalls: ToolCall[] = [];
  let match: RegExpExecArray | null;

  // Reset regex state
  TOOL_CALL_REGEX.lastIndex = 0;

  while ((match = TOOL_CALL_REGEX.exec(text)) !== null) {
    const jsonStr = match[1].trim();
    try {
      const parsed = JSON.parse(jsonStr);
      const name = parsed.name;
      const args = parsed.arguments ?? {};

      if (typeof name === 'string' && name.length > 0) {
        toolCalls.push({
          id: `text_tc_${++_callCounter}`,
          type: 'function',
          function: {
            name,
            arguments: typeof args === 'string' ? args : JSON.stringify(args),
          },
        });
      }
    } catch {
      // Malformed JSON inside tool_call block — skip it
    }
  }

  // Remove tool_call blocks from the text to get clean display content
  const cleanText = text.replace(TOOL_CALL_REGEX, '').trim();

  return { toolCalls, cleanText };
}

/**
 * Convert tool results back into a format the model can understand as text.
 * For models without native tool support, tool results are injected as user messages.
 */
export function formatToolResult(toolName: string, result: string, success: boolean): string {
  const status = success ? 'success' : 'error';
  return `<tool_result name="${toolName}" status="${status}">
${result}
</tool_result>`;
}
