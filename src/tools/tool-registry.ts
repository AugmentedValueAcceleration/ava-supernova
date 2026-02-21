import type { Tool, ToolResult, ToolExecutionContext } from './types.js';
import type { ToolSchema } from '../providers/types.js';
import { FileReadTool } from './file-read.js';
import { FileWriteTool } from './file-write.js';
import { FileEditTool } from './file-edit.js';
import { GlobTool } from './glob.js';
import { GrepTool } from './grep.js';
import { BashTool } from './bash.js';

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  registerBuiltins(): void {
    const builtins: Tool[] = [
      new FileReadTool(),
      new FileWriteTool(),
      new FileEditTool(),
      new GlobTool(),
      new GrepTool(),
      new BashTool(),
    ];
    for (const tool of builtins) {
      this.tools.set(tool.name, tool);
    }
  }

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  getSchemas(): ToolSchema[] {
    return Array.from(this.tools.values()).map((tool) => ({
      type: 'function' as const,
      function: tool.schema,
    }));
  }

  async execute(
    name: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        output: `Unknown tool: ${name}. Available: ${Array.from(this.tools.keys()).join(', ')}`,
      };
    }
    try {
      return await tool.execute(args, context);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        output: `Tool "${name}" failed: ${message}`,
      };
    }
  }
}
