import { randomUUID } from 'node:crypto';
import type { Message, ContentPart } from '../core/types.js';

/**
 * A compaction boundary. Everything in the transcript BEFORE `keptFrom` is
 * represented to the model by `middle` (the continuation summary, the user's
 * verbatim turns, the session tasks); everything from `keptFrom` on is sent
 * as it is. `systemNote` is appended to the system prompt (the pinned
 * original request).
 *
 * Why this exists (19 Sep 2026): auto-compression ran INSIDE the agent's
 * turn and was deliberately kept out of the saved conversation, so the next
 * turn sent the whole uncompressed history in again, compressed it again
 * from scratch, and the context bar shot back up the moment the turn ended.
 * The operator saw compression fire every turn and a "messages summarised"
 * note every turn. A boundary that persists is compacted once and then only
 * again when the compacted context itself grows past the threshold — and
 * the transcript the user scrolls is never touched.
 */
export interface Compaction {
  middle: Message[];
  systemNote: string;
  /** Index into the TRANSCRIPT (getMessages) from which messages are kept verbatim. */
  keptFrom: number;
}

export class Conversation {
  private messages: Message[] = [];
  private compaction: Compaction | null = null;
  private _id: string;

  constructor(id?: string) {
    this._id = id ?? randomUUID();
  }

  get id(): string {
    return this._id;
  }

  setSystemPrompt(content: string): void {
    if (this.messages.length > 0 && this.messages[0].role === 'system') {
      this.messages[0] = { role: 'system', content };
    } else {
      this.messages.unshift({ role: 'system', content });
    }
  }

  addUserMessage(content: string | ContentPart[]): void {
    this.messages.push({ role: 'user', content });
  }

  setMessages(messages: Message[]): void {
    // A full replace normally means a different conversation (load, clear,
    // a stop marker). But two callers push onto getMessages()' copy and
    // hand it straight back — an append in disguise. The boundary survives
    // exactly when the messages it indexes are still the same objects in the
    // same places; otherwise it no longer describes anything and is dropped.
    const c = this.compaction;
    const stillValid = !!c
      && messages.length >= this.messages.length
      && c.keptFrom <= messages.length
      && this.messages.slice(0, c.keptFrom).every((m, i) => messages[i] === m);
    this.messages = [...messages];
    if (!stillValid) this.compaction = null;
  }

  /** What the MODEL is sent: the system prompt (with the compaction's note),
   *  the compaction's middle, then the transcript from the boundary on. With
   *  no compaction this is the transcript itself. */
  getContextMessages(): Message[] {
    const c = this.compaction;
    if (!c) return [...this.messages];
    const system = this.messages[0]?.role === 'system' ? this.messages[0] : null;
    const head: Message[] = system
      ? [{ ...system, content: (typeof system.content === 'string' ? system.content : '') + c.systemNote }]
      : c.systemNote ? [{ role: 'system', content: c.systemNote.trimStart() }] : [];
    return [...head, ...c.middle, ...this.messages.slice(c.keptFrom)];
  }

  getCompaction(): Compaction | null {
    return this.compaction ? { ...this.compaction, middle: [...this.compaction.middle] } : null;
  }

  /** Restore a boundary loaded from disk. Dropped if it no longer fits. */
  setCompaction(c: Compaction | null): void {
    this.compaction = c && c.keptFrom <= this.messages.length && c.keptFrom > 0 ? { ...c, middle: [...c.middle] } : null;
  }

  /**
   * Record a compaction the agent produced from getContextMessages().
   * `keptFromContext` is the index in THAT array where the kept window
   * starts; it is mapped back onto the transcript here, so a second
   * compaction (of an already-compacted context) lands in the right place.
   */
  applyCompaction(c: { middle: Message[]; systemNote: string; keptFromContext: number }): void {
    const prev = this.compaction;
    const hasSystem = this.messages[0]?.role === 'system';
    const headLen = (hasSystem || (prev && prev.systemNote) ? 1 : 0) + (prev ? prev.middle.length : 0);
    const tailStartInTranscript = prev ? prev.keptFrom : (hasSystem ? 1 : 0);
    const keptFrom = tailStartInTranscript + Math.max(0, c.keptFromContext - headLen);
    if (keptFrom <= 0 || keptFrom > this.messages.length) return;
    this.compaction = {
      middle: [...c.middle],
      // Notes accumulate only if they differ — the pinned request is the
      // same request every time.
      systemNote: prev && prev.systemNote === c.systemNote ? c.systemNote : (prev?.systemNote ?? '') + c.systemNote,
      keptFrom,
    };
  }

  /**
   * Append new messages to the conversation in order. This is the
   * canonical way to consume Agent.run's return value — the agent
   * produces the messages a single turn generated (assistant replies,
   * tool results, interjections) and the caller appends them to the
   * conversation it owns. setMessages is kept for full-replace paths
   * (loading a conversation from disk, clearing, stop-marker injection),
   * but append is the default for the run-agent loop.
   */
  appendMessages(messages: Message[]): void {
    if (messages.length === 0) return;
    this.messages.push(...messages);
  }

  getMessages(): Message[] {
    return [...this.messages];
  }

  clear(): void {
    const systemMsg = this.messages.find((m) => m.role === 'system');
    this.messages = systemMsg ? [systemMsg] : [];
    this.compaction = null;
  }

  truncateToFit(maxTokens: number): boolean {
    const estimatedTokens = this.estimateTokenCount();
    if (estimatedTokens <= maxTokens) return false;

    const systemMsg = this.messages[0]?.role === 'system' ? this.messages[0] : null;
    const rest = systemMsg ? this.messages.slice(1) : [...this.messages];

    const systemTokens = systemMsg ? this.estimateMessageTokens(systemMsg) : 0;
    const budget = maxTokens - systemTokens;

    const kept: Message[] = [];
    let used = 0;

    for (let i = rest.length - 1; i >= 0; i--) {
      const msgTokens = this.estimateMessageTokens(rest[i]);
      if (used + msgTokens > budget) break;
      kept.unshift(rest[i]);
      used += msgTokens;
    }

    this.messages = systemMsg ? [systemMsg, ...kept] : kept;
    return true;
  }

  estimateTokenCount(): number {
    return this.messages.reduce((sum, m) => sum + this.estimateMessageTokens(m), 0);
  }

  private estimateMessageTokens(message: Message): number {
    const { content } = message;
    if (content === null) return 4;
    // Use /3 divisor aligned with agent.ts estimation to avoid context window divergence
    if (typeof content === 'string') return Math.ceil(content.length / 3) + 4;
    // Content array — sum text tokens + ~85 tokens per image
    return content.reduce((sum, part) => {
      if (part.type === 'text') return sum + Math.ceil(part.text.length / 3);
      if (part.type === 'image_url') return sum + 85;
      return sum;
    }, 0) + 4;
  }
}
