// History + conversation persistence. Thin class that wraps the core HistoryManager
// and wires the webview-facing operations (list, load, delete, search, rename, pin,
// export, restore-last) without the rest of AvaViewProvider having to know about them.

import * as vscode from 'vscode';
import { Conversation } from '@ava/core';
import type { HistoryManager } from '@ava/core';
import type { ExtToWebviewMessage } from './message-types.js';
import { buildUIMessages, isInternalPrimer } from './helpers.js';

export interface HistoryCoordinatorDeps {
  context: vscode.ExtensionContext;
  historyManager: HistoryManager;
  postMessage: (message: ExtToWebviewMessage) => void;
  /** Live getter so we see the current conversation even if it was swapped mid-session. */
  getConversation: () => Conversation | undefined;
  /** Replace the active conversation when loading from history. */
  setConversation: (conversation: Conversation) => void;
  /** Reflect the outgoing session into memory before it's swapped out.
   *  Called on resume/load (a genuine session boundary) — NOT on delete,
   *  where the operator's intent is to discard the conversation. */
  reflectOutgoing?: () => void;
  /** Produce a fresh system prompt for a loaded conversation. */
  buildSystemPrompt: () => Promise<string>;
  /** Emit a context_usage event based on the current active conversation
   *  and model. Called after load/restore so the context bar reflects the
   *  loaded history instead of sitting at "awaiting first turn" until the
   *  user sends the next message. Owner computes used/limit/percent. */
  emitContextUsage?: () => void;
}

export class HistoryCoordinator {
  private readonly LAST_CONVERSATION_KEY = 'lastConversationId';

  constructor(private readonly deps: HistoryCoordinatorDeps) {}

  getLastConversationId(): string | undefined {
    return this.deps.context.globalState.get<string>(this.LAST_CONVERSATION_KEY);
  }

  /**
   * Persist the "reopen this one next time" pointer.
   *
   * Returns the promise — `globalState.update()` is asynchronous, and this
   * used to be fire-and-forget. The conversation itself is saved with an
   * awaited `saveConversation()`, so a window closed just after a turn kept
   * the transcript on disk but could lose the pointer to it: the chat was
   * still in history, it just never reopened. That is the intermittent
   * "starts a new chat each time" report — it depended on whether the write
   * flushed before the host was disposed.
   */
  setLastConversationId(id: string | undefined): Thenable<void> {
    return this.deps.context.globalState.update(this.LAST_CONVERSATION_KEY, id);
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
    // Drop stale host-injected primers ([Memory Brief] / [Memory pointer]) before
    // rehydrating. One is appended EVERY turn, so a long conversation accumulates
    // them — and older transcripts saved them as role:'user', which means the model
    // reads them back as things the operator said. A fresh brief is generated for
    // the next turn anyway, so the stale ones are pure noise (and pure token cost).
    const messages = record.messages.filter((m) => !isInternalPrimer(m));
    if (messages.length > 0 && messages[0].role === 'system') {
      messages[0] = { role: 'system' as const, content: await this.deps.buildSystemPrompt() };
    }
    conversation.setMessages(messages);
    this.deps.setConversation(conversation);

    this.deps.postMessage({
      type: 'conversation_loaded',
      conversationId: record.id,
      title: record.title,
      messages: buildUIMessages(messages),
    });

    // Recompute the context bar from the restored messages so users don't
    // see "awaiting first turn" on a conversation with real content.
    this.deps.emitContextUsage?.();
  }

  async sendList(): Promise<void> {
    try {
      const conversations = await this.deps.historyManager.listConversations(false);
      this.deps.postMessage({ type: 'history_list', conversations });
    } catch (err) {
      // Never leave the chat's historyLoading gate stuck: a failed list read must
      // STILL send history_list (empty) so the panel unlocks. Conversations aren't
      // lost — the user can reopen the sidebar to retry once the transient error
      // clears. Previously this threw and the caller swallowed it, trapping the
      // chat on the "Loading your account and chat history…" spinner forever.
      console.warn(`[history] sendList failed, sending empty list to unblock the chat: ${err instanceof Error ? err.message : err}`);
      this.deps.postMessage({ type: 'history_list', conversations: [] });
    }
  }

  async load(conversationId: string): Promise<void> {
    const record = await this.deps.historyManager.resumeConversation(conversationId);
    if (!record) {
      console.warn(`[history] load: conversation ${conversationId} not found on disk`);
      this.deps.postMessage({ type: 'error', message: 'Conversation not found.' });
      return;
    }

    // Switching to a different conversation ends the current one — reflect it
    // into memory before swapping it out.
    this.deps.reflectOutgoing?.();

    const conversation = new Conversation(record.id);
    // Same as restoreLast: strip stale host-injected primers before rehydrating,
    // so the model doesn't read old [Memory Brief] blobs back as operator speech
    // and the chat doesn't render them as "You" bubbles.
    const messages = record.messages.filter((m) => !isInternalPrimer(m));
    if (messages.length > 0 && messages[0].role === 'system') {
      // Refresh the system prompt, but never let a failure here abort the load
      // — a thrown buildSystemPrompt() used to swallow the whole click, so the
      // chat appeared to do nothing. Fall back to the stored system message.
      try {
        messages[0] = { role: 'system' as const, content: await this.deps.buildSystemPrompt() };
      } catch (err) {
        console.warn(`[history] load: buildSystemPrompt failed, keeping stored system message: ${err instanceof Error ? err.message : err}`);
      }
    }
    conversation.setMessages(messages);
    this.deps.setConversation(conversation);

    // Awaited — see setLastConversationId. Picking a chat from history and
    // then closing the window is exactly the case where an unflushed pointer
    // write sends you back to a new chat next launch.
    await this.setLastConversationId(record.id);

    console.log(`[history] loaded conversation ${record.id}: ${record.messages.length} messages (${record.messages.length - messages.length} stale primer(s) dropped)`);
    this.deps.postMessage({
      type: 'conversation_loaded',
      conversationId: record.id,
      title: record.title,
      messages: buildUIMessages(messages),
    });

    // Refresh the context bar now that a potentially-large history is loaded.
    this.deps.emitContextUsage?.();
  }

  async delete(conversationId: string): Promise<void> {
    await this.deps.historyManager.deleteConversation(conversationId);

    // If the operator deleted the conversation currently loaded in the
    // chat panel, OR cleared history entirely (last conv just removed),
    // reset the active conversation. Otherwise the chat keeps rendering
    // a conv that no longer exists in storage — no auto-save target,
    // mismatched lastConversationId, stale state on next session restore.
    const current = this.deps.getConversation();
    const isCurrent = current?.id === conversationId;
    const remaining = await this.deps.historyManager.listConversations(false);
    const allCleared = remaining.length === 0;

    if (isCurrent || allCleared) {
      // Wipe the lastConversationId pointer first so a session restore
      // doesn't try to resume the deleted record.
      this.setLastConversationId(undefined);
      // Build a fresh Conversation with a new system prompt and swap it in.
      const fresh = new Conversation();
      fresh.setSystemPrompt(await this.deps.buildSystemPrompt());
      this.deps.setConversation(fresh);
      // Tell the webview to reset the chat surface.
      this.deps.postMessage({ type: 'chat_cleared' });
      // Refresh context bar so the operator doesn't see the old usage
      // figure floating against an empty conversation.
      this.deps.emitContextUsage?.();
    }

    // Always send the updated list — the chat-history page needs to
    // refresh either way.
    this.deps.postMessage({ type: 'history_list', conversations: remaining });
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
