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
import { GitDiffTool } from './git-diff.js';
import { ScreenshotTool } from './screenshot.js';
import { DatabaseQueryTool } from './database-query.js';
import { BrowserTool } from './browser.js';
import { MemorySaveTool } from './memory-save.js';
import { MemoryRecallTool } from './memory-recall.js';
import { MemoryUpdateTool } from './memory-update.js';
import { MemoryDeleteTool } from './memory-delete.js';
import { RollbackTool } from './rollback.js';
import { ProjectIndexTool } from './project-index.js';
import { FindSymbolTool } from './find-symbol.js';
import { DocsLookupTool } from './docs-lookup.js';
import { SupportRequestTool } from './support-request.js';
import { ProposeToolTool } from './propose-tool.js';
import { GetDateTimeTool } from './get-datetime.js';
import { DetectLanguageTool } from './detect-language.js';
import { TaskManageTool } from './task-manage.js';
import { JournalWriteTool } from './journal.js';
import { DocumentManageTool } from './document-manage.js';
import { GitCommitTool } from './git-commit.js';
import { GitCreatePrTool } from './git-create-pr.js';
import { TestRunTool } from './test-run.js';
import { TestGenerateTool } from './test-generate.js';
import { AnalyzeArchitectureTool } from './analyze-architecture.js';
import { DocGenerateTool } from './doc-generate.js';
import { AuditDependenciesTool } from './audit-dependencies.js';
import { BenchmarkTool } from './benchmark.js';
import { ApplyPlanTool } from './apply-plan.js';
import { DebugLogsTool } from './debug-logs.js';

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
      new GitDiffTool(),
      new ScreenshotTool(),
      new DatabaseQueryTool(),
      new BrowserTool(),
      new MemorySaveTool(),
      new MemoryRecallTool(),
      new MemoryUpdateTool(),
      new MemoryDeleteTool(),
      new RollbackTool(),
      new ProjectIndexTool(),
      new FindSymbolTool(),
      new DocsLookupTool(),
      new SupportRequestTool(),
      new ProposeToolTool(),
      new GetDateTimeTool(),
      new DetectLanguageTool(),
      new TaskManageTool(),
      new JournalWriteTool(),
      new DocumentManageTool(),
      new GitCommitTool(),
      new GitCreatePrTool(),
      new TestRunTool(),
      new TestGenerateTool(),
      new AnalyzeArchitectureTool(),
      new DocGenerateTool(),
      new AuditDependenciesTool(),
      new BenchmarkTool(),
      new ApplyPlanTool(),
      new DebugLogsTool(),
    ];
    for (const tool of builtins) {
      this.tools.set(tool.name, tool);
    }
  }

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getSchemas(): ToolSchema[] {
    return Array.from(this.tools.values()).map((tool) => ({
      type: 'function' as const,
      function: tool.schema,
    }));
  }

  needsConfirmation(tool: Tool): boolean {
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
