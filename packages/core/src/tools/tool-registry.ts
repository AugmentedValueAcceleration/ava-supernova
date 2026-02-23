import type { Tool, ToolResult, ToolExecutionContext, ToolConfirmationHandler, PermissionMode, ToolRiskLevel } from './types.js';
import type { ToolSchema } from '../providers/types.js';
import { FileReadTool } from './file-read.js';
import { FileWriteTool } from './file-write.js';
import { FileEditTool } from './file-edit.js';
import { GlobTool } from './glob.js';
import { GrepTool } from './grep.js';
import { BashTool } from './bash.js';
import { PresentPlanTool } from './present-plan.js';
import { TodoWriteTool } from './todo-write.js';
import { ListDirectoryTool } from './list-directory.js';
import { WebSearchTool } from './web-search.js';
import { AskUserTool } from './ask-user.js';
import { GitStatusTool } from './git.js';
import { HttpRequestTool } from './http-request.js';

// Which risk levels require confirmation under each permission mode
const CONFIRMATION_MATRIX: Record<PermissionMode, Set<ToolRiskLevel>> = {
  strict: new Set(['write', 'dangerous']),
  balanced: new Set(['dangerous']),
  autonomous: new Set(),
};

export class ToolRegistry {
  private tools = new Map<string, Tool>();
  private confirmationHandler?: ToolConfirmationHandler;
  private permissionMode: PermissionMode = 'strict';

  setConfirmationHandler(handler: ToolConfirmationHandler): void {
    this.confirmationHandler = handler;
  }

  setPermissionMode(mode: PermissionMode): void {
    this.permissionMode = mode;
  }

  getPermissionMode(): PermissionMode {
    return this.permissionMode;
  }

  registerBuiltins(): void {
    const builtins: Tool[] = [
      new FileReadTool(),
      new FileWriteTool(),
      new FileEditTool(),
      new GlobTool(),
      new GrepTool(),
      new BashTool(),
      new PresentPlanTool(),
      new TodoWriteTool(),
      new ListDirectoryTool(),
      new WebSearchTool(),
      new AskUserTool(),
      new GitStatusTool(),
      new HttpRequestTool(),
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

  private needsConfirmation(tool: Tool): boolean {
    // Plans always require confirmation — they're a collaboration checkpoint, not a permission check.
    // Even in autonomous mode, the user should approve the direction before Ava executes.
    if (tool.name === 'present_plan' || tool.name === 'ask_user') return true;
    return CONFIRMATION_MATRIX[this.permissionMode].has(tool.riskLevel);
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

    if (this.needsConfirmation(tool) && this.confirmationHandler) {
      try {
        const result = await this.confirmationHandler(name, args);
        if (result === false) {
          return {
            success: false,
            output: `Tool "${name}" was denied by the user.`,
          };
        }
        // Handler provided a custom result string (e.g., plan approval with context)
        if (typeof result === 'string') {
          return { success: true, output: result };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          output: `Tool "${name}" confirmation failed: ${message}`,
        };
      }
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
