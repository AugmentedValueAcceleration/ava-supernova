import type { UIMessage, MessageEvent } from '@ava-extension/messages';

/** Helper: get all visible text from an assistant message (for copy, rating, etc). */
export function getMessageText(msg: UIMessage): string {
  if (msg.events) {
    return msg.events
      .filter((e): e is Extract<MessageEvent, { kind: 'text' }> => e.kind === 'text')
      .map((e) => e.content)
      .join('');
  }
  return msg.content || '';
}
