import type {
  Tool, ToolResult, ToolExecutionContext, ToolConfirmationHandler,
  PermissionMode, ToolCategory, CategoryPermission, AuditCallback, AuditLogEntry,
} from './types.js';
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
import { PresentationCreateTool } from './presentation-create.js';
import { EmailDraftTool } from './email-draft.js';
import { ReportGenerateTool } from './report-generate.js';
import { GenerateImageTool } from './generate-image.js';
import { GenerateMusicTool } from './generate-music.js';
import { GenerateVideoTool } from './generate-video.js';
import { GenerateVoiceTool } from './generate-voice.js';
import { RemoveBackgroundTool } from './remove-background.js';
import { AuditDependenciesTool } from './audit-dependencies.js';
import { BenchmarkTool } from './benchmark.js';
import { ApplyPlanTool } from './apply-plan.js';
import { DebugLogsTool } from './debug-logs.js';
import { LearningCreateTool, LearningTeachTool, LearningProgressTool } from './learning.js';
import { SelfInspectTool } from './self-inspect.js';
import { ReleaseNotesTool } from './release-notes.js';
import { WeatherTool } from './weather.js';
import { NewsTool } from './news.js';
import { ComputerUseTool } from './computer-use.js';

// ── Tool → Category mapping ────────────────────────────────────────────────

export const TOOL_CATEGORY_MAP: Record<string, ToolCategory> = {
  // File Operations — reading, writing, searching files
  file_read: 'file_ops', file_write: 'file_ops', file_edit: 'file_ops',
  glob: 'file_ops', grep: 'file_ops', list_directory: 'file_ops',
  find_symbol: 'file_ops', project_index: 'file_ops',
  analyze_architecture: 'file_ops', self_inspect: 'file_ops',
  docs_lookup: 'file_ops',
  // Shell — execution, testing, performance
  bash: 'shell', test_run: 'shell', test_generate: 'shell',
  benchmark: 'shell', debug_logs: 'shell',
  // Git — version control
  git_status: 'git', git_diff: 'git', git_commit: 'git',
  git_create_pr: 'git', rollback: 'git',
  // Web — search, HTTP, browsing, real-world data
  web_search: 'web', http_request: 'web', browser: 'web',
  weather: 'web', news: 'web', release_notes: 'web',
  // Media — images, audio, video, screen capture
  screenshot: 'media', generate_image: 'media', generate_music: 'media',
  generate_video: 'media', generate_voice: 'media', remove_background: 'media',
  // Database
  database_query: 'database',
  // System — desktop control, utilities, security
  computer_use: 'system', get_datetime: 'system', detect_language: 'system',
  audit_dependencies: 'system', security: 'system',
  ask_user: 'system', support_request: 'system', propose_tool: 'system',
  // Documents — creation, planning, tasks
  document_manage: 'documents', presentation_create: 'documents',
  report_generate: 'documents', email_draft: 'documents',
  doc_generate: 'documents', todo_write: 'documents',
  task_manage: 'documents', journal_write: 'documents',
  present_plan: 'documents', apply_plan: 'documents',
  // Memory — persistent knowledge
  memory_save: 'memory', memory_recall: 'memory',
  memory_update: 'memory', memory_delete: 'memory',
  // Learning — education system
  learning_create: 'learning', learning_teach: 'learning',
  learning_progress: 'learning',
};

// ── Preset category defaults per permission mode ────────────────────────────

const ALL_CATEGORIES: ToolCategory[] = [
  'file_ops', 'shell', 'git', 'web', 'media',
  'database', 'system', 'documents', 'memory', 'learning',
];

export const PRESET_CATEGORY_DEFAULTS: Record<
  Exclude<PermissionMode, 'custom'>,
  Record<ToolCategory, CategoryPermission>
> = {
  strict: {
    file_ops: 'first_time',
    shell: 'always_ask',
    git: 'always_ask',
    web: 'always_ask',
    media: 'first_time',
    database: 'always_ask',
    system: 'always_ask',
    documents: 'first_time',
    memory: 'auto',
    learning: 'auto',
  },
  balanced: {
    file_ops: 'auto',
    shell: 'always_ask',
    git: 'first_time',
    web: 'first_time',
    media: 'auto',
    database: 'always_ask',
    system: 'always_ask',
    documents: 'auto',
    memory: 'auto',
    learning: 'auto',
  },
  autonomous: {
    file_ops: 'auto',
    shell: 'auto',
    git: 'auto',
    web: 'auto',
    media: 'auto',
    database: 'auto',
    system: 'auto',
    documents: 'auto',
    memory: 'auto',
    learning: 'auto',
  },
};

// ── Summarise tool args for audit display ────────────────────────────────────

function summariseArgs(toolName: string, args: Record<string, unknown>): string {
  const path = args.file_path || args.path || args.target || args.url || args.query || args.command;
  if (typeof path === 'string') {
    const short = path.length > 80 ? '...' + path.slice(-77) : path;
    return `${toolName}(${short})`;
  }
  const keys = Object.keys(args);
  if (keys.length === 0) return toolName;
  return `${toolName}(${keys.join(', ')})`;
}

// ── Registry ────────────────────────────────────────────────────────────────

export class ToolRegistry {
  private tools = new Map<string, Tool>();
  private confirmationHandler?: ToolConfirmationHandler;
  private permissionMode: PermissionMode = 'strict';

  // Category-based permission overrides (user customisation on top of preset)
  private categoryOverrides = new Map<ToolCategory, CategoryPermission>();
  // Categories already approved this session (for first_time mode)
  private sessionFirstTimeApproved = new Set<ToolCategory>();
  // Audit callback
  private auditCallback?: AuditCallback;

  // ── Configuration ───────────────────────────────────────────────────────

  setConfirmationHandler(handler: ToolConfirmationHandler): void {
    this.confirmationHandler = handler;
  }

  setPermissionMode(mode: PermissionMode): void {
    this.permissionMode = mode;
    // When switching to a preset, clear overrides
    if (mode !== 'custom') {
      this.categoryOverrides.clear();
    }
  }

  getPermissionMode(): PermissionMode {
    return this.permissionMode;
  }

  setAuditCallback(cb: AuditCallback): void {
    this.auditCallback = cb;
  }

  // ── Category permissions ────────────────────────────────────────────────

  getCategoryForTool(toolName: string): ToolCategory {
    return TOOL_CATEGORY_MAP[toolName] || 'file_ops';
  }

  getCategoryPermission(category: ToolCategory): CategoryPermission {
    // User overrides take priority
    const override = this.categoryOverrides.get(category);
    if (override !== undefined) return override;
    // Fall back to preset defaults
    const presetMode = this.permissionMode === 'custom' ? 'strict' : this.permissionMode;
    return PRESET_CATEGORY_DEFAULTS[presetMode][category];
  }

  getCategoryPermissions(): Record<ToolCategory, CategoryPermission> {
    const result = {} as Record<ToolCategory, CategoryPermission>;
    for (const cat of ALL_CATEGORIES) {
      result[cat] = this.getCategoryPermission(cat);
    }
    return result;
  }

  setCategoryPermission(category: ToolCategory, permission: CategoryPermission): void {
    this.categoryOverrides.set(category, permission);
    // Check if overrides now differ from any preset → switch to 'custom'
    if (this.permissionMode !== 'custom') {
      const presetDefaults = PRESET_CATEGORY_DEFAULTS[this.permissionMode];
      if (presetDefaults[category] !== permission) {
        this.permissionMode = 'custom';
      }
    }
  }

  setCategoryPermissions(overrides: Partial<Record<ToolCategory, CategoryPermission>>): void {
    for (const [cat, perm] of Object.entries(overrides)) {
      this.categoryOverrides.set(cat as ToolCategory, perm as CategoryPermission);
    }
    // Detect if result matches any preset
    this.detectPresetMatch();
  }

  /** Mark a category as approved for first_time mode (lasts until session reset). */
  approveCategory(category: ToolCategory): void {
    this.sessionFirstTimeApproved.add(category);
  }

  /** Clear first-time approvals (call on new session / clear chat). */
  resetSessionFirstTime(): void {
    this.sessionFirstTimeApproved.clear();
  }

  /** Check if current overrides match a preset and auto-switch mode. */
  private detectPresetMatch(): void {
    const current = this.getCategoryPermissions();
    for (const mode of ['strict', 'balanced', 'autonomous'] as const) {
      const preset = PRESET_CATEGORY_DEFAULTS[mode];
      const matches = ALL_CATEGORIES.every(cat => current[cat] === preset[cat]);
      if (matches) {
        this.permissionMode = mode;
        this.categoryOverrides.clear();
        return;
      }
    }
    this.permissionMode = 'custom';
  }

  // ── Tool registration ───────────────────────────────────────────────────

  registerBuiltins(options?: { exclude?: string[] }): void {
    const excludeSet = new Set(options?.exclude || []);
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
      new LearningCreateTool(),
      new LearningTeachTool(),
      new LearningProgressTool(),
      new SelfInspectTool(),
      new ReleaseNotesTool(),
      new WeatherTool(),
      new NewsTool(),
      new PresentationCreateTool(),
      new EmailDraftTool(),
      new ReportGenerateTool(),
      new GenerateImageTool(),
      new GenerateMusicTool(),
      new GenerateVideoTool(),
      new GenerateVoiceTool(),
      new RemoveBackgroundTool(),
      new ComputerUseTool(),
    ];
    for (const tool of builtins) {
      if (!excludeSet.has(tool.name)) {
        this.tools.set(tool.name, tool);
      }
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

  // ── Permission check ────────────────────────────────────────────────────

  needsConfirmation(tool: Tool): boolean {
    // Plans and ask_user always require confirmation — collaboration checkpoints
    if (tool.name === 'present_plan' || tool.name === 'ask_user') return true;

    const category = this.getCategoryForTool(tool.name);
    const permission = this.getCategoryPermission(category);

    if (permission === 'auto') return false;
    if (permission === 'first_time') return !this.sessionFirstTimeApproved.has(category);
    return true; // always_ask
  }

  // ── Execution ───────────────────────────────────────────────────────────

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

    const category = this.getCategoryForTool(name);
    const permission = this.getCategoryPermission(category);
    const argsSummary = summariseArgs(name, args);

    // Determine approval method for audit
    let approvalMethod: AuditLogEntry['approvalMethod'] = 'auto';

    if (this.needsConfirmation(tool) && this.confirmationHandler) {
      try {
        const result = await this.confirmationHandler(name, args);
        if (result === false) {
          this.emitAudit(name, category, tool.riskLevel, 'denied', 'denied', argsSummary, args);
          return {
            success: false,
            output: `Tool "${name}" was denied by the user.`,
          };
        }
        // Handler provided a custom result string (e.g., plan approval with context)
        if (typeof result === 'string') {
          approvalMethod = permission === 'first_time' ? 'first-time' : 'user-approved';
          this.emitAudit(name, category, tool.riskLevel, approvalMethod, 'success', argsSummary, args, result);
          return { success: true, output: result };
        }
        approvalMethod = permission === 'first_time' ? 'first-time' : 'user-approved';
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.emitAudit(name, category, tool.riskLevel, 'user-approved', 'failed', argsSummary, args, message);
        return {
          success: false,
          output: `Tool "${name}" confirmation failed: ${message}`,
        };
      }
    }

    try {
      const toolResult = await tool.execute(args, context);
      this.emitAudit(
        name, category, tool.riskLevel, approvalMethod,
        toolResult.success ? 'success' : 'failed',
        argsSummary, args, toolResult.output?.slice(0, 200),
      );
      return toolResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emitAudit(name, category, tool.riskLevel, approvalMethod, 'failed', argsSummary, args, message);
      return {
        success: false,
        output: `Tool "${name}" failed: ${message}`,
      };
    }
  }

  private emitAudit(
    toolName: string,
    category: ToolCategory,
    riskLevel: Tool['riskLevel'],
    approvalMethod: AuditLogEntry['approvalMethod'],
    status: AuditLogEntry['status'],
    argsSummary: string,
    fullArgs?: Record<string, unknown>,
    result?: string,
  ): void {
    this.auditCallback?.({
      timestamp: new Date().toISOString(),
      toolName,
      category,
      riskLevel,
      approvalMethod,
      status,
      argsSummary,
      fullArgs,
      result,
    });
  }
}
