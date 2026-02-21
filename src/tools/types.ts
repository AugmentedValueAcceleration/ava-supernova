import type { FunctionSchema } from '../providers/types.js';

export interface ToolResult {
  success: boolean;
  output: string;
  metadata?: Record<string, unknown>;
}

export interface Tool {
  readonly name: string;
  readonly description: string;
  readonly schema: FunctionSchema;
  execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult>;
}

export interface ToolExecutionContext {
  cwd: string;
  signal?: AbortSignal;
}
