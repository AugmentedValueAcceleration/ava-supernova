import * as vscode from 'vscode';
import type { TaskManager, TaskEntry } from '@ava/core';

/**
 * Today panel — lightweight WebviewViewProvider (raw HTML, no React).
 *
 * Two sections:
 * - My Tasks: today's user tasks (due today + in-progress)
 * - Ava's Progress: live session tasks with status indicators
 */
export class TasksPanel implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ava-supernova.todayView';

  private view?: vscode.WebviewView;
  private sessionTasks: Array<{ id: string; title: string; status: string }> = [];

  constructor(
    private readonly taskManager: TaskManager,
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = { enableScripts: true };

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'toggle_task' && msg.id) {
        await this.taskManager.completeTask(msg.id);
        this.refreshTodayTasks();
      }
    });

    // Initial render
    this.refreshTodayTasks();
  }

  /** Reload today's tasks from TaskManager and re-render. */
  async refreshTodayTasks(): Promise<void> {
    if (!this.view) return;

    try {
      const todayTasks = await this.taskManager.getTodayTasks();
      const userTasks = todayTasks.filter(t => t.source === 'user');
      this.render(userTasks, this.sessionTasks);
    } catch {
      this.render([], this.sessionTasks);
    }
  }

  /** Update session tasks (called by AvaViewProvider when todo_write fires). */
  updateSessionTasks(tasks: Array<{ id: string; title: string; status: string }>): void {
    this.sessionTasks = tasks;
    this.refreshTodayTasks();
  }

  /** Clear session tasks. */
  clearSessionTasks(): void {
    this.sessionTasks = [];
    this.refreshTodayTasks();
  }

  private render(
    userTasks: TaskEntry[],
    sessionTasks: Array<{ id: string; title: string; status: string }>,
  ): void {
    if (!this.view) return;

    const userTasksHtml = userTasks.length === 0
      ? '<p class="empty">No tasks for today</p>'
      : userTasks.map(t => `
        <div class="task-item">
          <button class="checkbox ${t.status === 'done' ? 'done' : ''}" onclick="toggle('${t.id}')">
            ${t.status === 'done' ? '&#x2713;' : '&#x25CB;'}
          </button>
          <span class="task-title ${t.status === 'done' ? 'done-text' : ''}">${this.escapeHtml(t.title)}</span>
          ${t.priority === 'urgent' || t.priority === 'high'
            ? `<span class="priority ${t.priority}">${t.priority}</span>`
            : ''}
        </div>
      `).join('');

    const sessionTasksHtml = sessionTasks.length === 0
      ? '<p class="empty">No active session</p>'
      : sessionTasks.map(t => {
        const icon = t.status === 'completed' || t.status === 'done'
          ? '&#x2713;'
          : t.status === 'in_progress' || t.status === 'in-progress'
            ? '&#x27F3;'
            : '&#x25CB;';
        const statusClass = t.status === 'completed' || t.status === 'done'
          ? 'done'
          : t.status === 'in_progress' || t.status === 'in-progress'
            ? 'active'
            : 'pending';
        return `
          <div class="task-item">
            <span class="session-icon ${statusClass}">${icon}</span>
            <span class="task-title ${statusClass === 'done' ? 'done-text' : ''}">${this.escapeHtml(t.title)}</span>
          </div>
        `;
      }).join('');

    this.view.webview.html = `<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      padding: 12px;
      margin: 0;
    }
    .section { margin-bottom: 16px; }
    .section-title {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 8px;
    }
    .task-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
    }
    .checkbox {
      width: 18px;
      height: 18px;
      border: 1px solid var(--vscode-input-border);
      border-radius: 50%;
      background: transparent;
      color: var(--vscode-foreground);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      flex-shrink: 0;
      padding: 0;
    }
    .checkbox:hover {
      border-color: var(--vscode-focusBorder);
      color: var(--vscode-focusBorder);
    }
    .checkbox.done {
      background: rgba(52, 211, 153, 0.2);
      border-color: rgba(52, 211, 153, 0.5);
      color: rgb(52, 211, 153);
    }
    .session-icon {
      width: 18px;
      height: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      flex-shrink: 0;
    }
    .session-icon.done { color: rgb(52, 211, 153); }
    .session-icon.active { color: var(--vscode-progressBar-background); }
    .session-icon.pending { color: var(--vscode-descriptionForeground); }
    .task-title {
      font-size: 12px;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .done-text {
      text-decoration: line-through;
      opacity: 0.6;
    }
    .priority {
      font-size: 9px;
      padding: 1px 5px;
      border-radius: 8px;
      font-weight: 600;
      flex-shrink: 0;
    }
    .priority.urgent {
      background: rgba(239, 68, 68, 0.15);
      color: rgb(239, 68, 68);
    }
    .priority.high {
      background: rgba(245, 158, 11, 0.15);
      color: rgb(245, 158, 11);
    }
    .empty {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      font-style: italic;
    }
    .divider {
      border: none;
      border-top: 1px solid var(--vscode-panel-border);
      margin: 12px 0;
    }
  </style>
</head>
<body>
  <div class="section">
    <div class="section-title">My Tasks</div>
    ${userTasksHtml}
  </div>
  <hr class="divider">
  <div class="section">
    <div class="section-title">Ava's Progress</div>
    ${sessionTasksHtml}
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    function toggle(id) {
      vscode.postMessage({ type: 'toggle_task', id });
    }
  </script>
</body>
</html>`;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
