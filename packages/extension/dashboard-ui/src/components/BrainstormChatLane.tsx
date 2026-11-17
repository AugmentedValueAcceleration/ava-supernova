// The Brainstorm room's chat in the extension: the shared <Chat> on the
// 'brainstorm' lane, one thread per brainstorm (its id travels as courseId —
// the room's thread key). A seed (a hand-off from the main chat) is sent once,
// as the brainstorm's first message.

import { useEffect, useRef } from 'react';
import { Chat } from '../pages/Chat';
import { post } from '../vscode';
import type { ExtToDashboardMessage } from '../types/messages';

export function BrainstormChatLane({ id, seed, onRegisterDispatch, userName, userAvatarUrl }: {
  id: string;
  seed: string | null;
  onRegisterDispatch: (fn: (msg: ExtToDashboardMessage) => void) => void;
  userName?: string | null;
  userAvatarUrl?: string | null;
}) {
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (!seed || sent.current === id) return;
    sent.current = id;
    // After the chat has registered for its lane, so the turn's stream lands here.
    const timer = setTimeout(() => post({ type: 'send_message', text: seed, mode: 'brainstorm', surface: 'brainstorm', courseId: id } as never), 150);
    return () => clearTimeout(timer);
  }, [id, seed]);
  return (
    <Chat
      key={`brainstorm-${id}`}
      lane="brainstorm"
      courseId={id}
      onRegisterDispatch={onRegisterDispatch}
      isActive
      userName={userName}
      userAvatarUrl={userAvatarUrl}
    />
  );
}
