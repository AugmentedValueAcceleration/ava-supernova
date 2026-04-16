// History + conversation persistence. Thin class that wraps the core HistoryManager
// and wires the webview-facing operations (list, load, delete, search, rename, pin,
// export, restore-last) without the rest of AvaViewProvider having to know about them.

import * as vscode from 'vscode';
import { Conversation } from '@ava/core';
import type { HistoryManager } from '@ava/core';
import type { ExtToWebviewMessage } from './message-types.js';
import { buildUIMessages } from './helpers.js';

export interface HistoryCoordinatorDeps {
  context: vscode.ExtensionContext;
  historyManager: HistoryManager;
  postMessage: (message: ExtToWebviewMessage) => void;
  /** Live getter so we see the current conversation even if it was swapped mid-session. */
  getConversation: () => Conversation | undefined;
  /** Replace the active conversation when loading from history. */
  setConversation: (conversation: Conversation) => void;
  /** Produce a fresh system prompt for a loaded conversation. */
  buildSystemPrompt: () => Promise<string>;
}

export class HistoryCoordinator {
  private readonly LAST_CONVERSATION_KEY = 'lastConversationId';

  constructor(private readonly deps: HistoryCoordinatorDeps) {}

  getLastConversationId(): string | undefined {
    return this.deps.context.globalState.get<string>(this.LAST_CONVERSATION_KEY);
  }

  setLastConversationId(id: string | undefined): void {
    this.deps.context.globalState.update(this.LAST_CONVERSATION_KEY, id);
  }

  async restoreLast(): Promise<void> {
    // If we already have a conversation with content, re-send it to the webview.
    const current = this.deps.getConversation();
    if (current) {
      const msgs = current.getMessages();
      if (msgs.length > 1) {
        this.deps.postMessage({
          type: 'conversation_loaded',
          conversationId: current.id,
          title: '',
          messages: buildUIMessages(msgs),
        });
        return;
      }
    }

    // Otherwise try to restore the last active conversation from disk.
    const lastId = this.getLastConversationId();
    if (!lastId) return;

    const record = await this.deps.historyManager.resumeConversation(lastId);
    if (!record) {
      // Conversation was deleted — clear the stale reference.
      this.setLastConversationId(undefined);
      return;
    }

    const conversation = new Conversation(record.id);
    const messages = record.messages;
    if (messages.length > 0 && messages[0].role === 'system') {
      messages[0] = { role: 'system' as const, content: await this.deps.buildSystemPrompt() };
    }
    conversation.setMessages(messages);
    this.deps.setConversation(conversation);

    this.deps.postMessage({
      type: 'conversation_loaded',
      conversationId: record.id,
      title: record.title,
      messages: buildUIMessages(record.messages),
    });
  }

  async sendList(): Promise<void> {
    const conversations = await this.deps.historyManager.listConversations(false);
    this.deps.postMessage({ type: 'history_list', conversations });
  }

  async load(conversationId: string): Promise<void> {
    const record = await this.deps.historyManager.resumeConversation(conversationId);
    if (!record) {
      this.deps.postMessage({ type: 'error', message: 'Conversation not found.' });
      return;
    }

    const conversation = new Conversation(record.id);
    const messages = record.messages;
    if (messages.length > 0 && messages[0].role === 'system') {
      messages[0] = { role: 'system' as const, content: await this.deps.buildSystemPrompt() };
    }
    conversation.setMessages(messages);
    this.deps.setConversation(conversation);

    this.setLastConversationId(record.id);

    this.deps.postMessage({
      type: 'conversation_loaded',
      conversationId: record.id,
      title: record.title,
      messages: buildUIMessages(record.messages),
    });
  }

  async delete(conversationId: string): Promise<void> {
    await this.deps.historyManager.deleteConversation(conversationId);
    await this.sendList();
  }

  async search(query: string): Promise<void> {
    const results = await this.deps.historyManager.searchConversations(query, false);
    this.deps.postMessage({ type: 'history_search_results', conversations: results });
  }

  async rename(conversationId: string, newTitle: string): Promise<void> {
    await this.deps.historyManager.renameConversation(conversationId, newTitle);
    await this.sendList();
  }

  async pin(conversationId: string, pinned: boolean): Promise<void> {
    await this.deps.historyManager.pinConversation(conversationId, pinned);
    await this.sendList();
  }

  async export(conversationId: string, format: 'markdown' | 'json'): Promise<void> {
    const content = await this.deps.historyManager.exportConversation(conversationId, format);
    if (!content) {
      this.deps.postMessage({ type: 'error', message: 'Failed to export conversation.' });
      return;
    }
    const ext = format === 'json' ? 'json' : 'md';
    const defaultUri = vscode.Uri.file(`conversation-export.${ext}`);
    const uri = await vscode.window.showSaveDialog({
      defaultUri,
      filters: format === 'json' ? { 'JSON': ['json'] } : { 'Markdown': ['md'] },
    });
    if (uri) {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
      vscode.window.showInformationMessage(`Conversation exported to ${uri.fsPath}`);
    }
  }
}
