import { useEffect, useState } from 'react';

// ─── Announcement ticker ─────────────────────────────────────────────────────
//
// A subtle line of hub-set messages in the header — the same feed as the website
// banner (fetched host-side from /api/announcement). Cycles every 8s like the
// site, sits in the header's centre gap, truncates so it never crowds the model
// picker (left) or the credits / New Chat controls (right), and is dismissible.
// Renders nothing when there are no messages.
export function AnnouncementTicker({ messages }: { messages: string[] }) {
  const [i, setI] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const sig = messages.join('|');

  // Reset when the feed changes (a hub update re-shows even if dismissed).
  useEffect(() => { setI(0); setDismissed(false); }, [sig]);

  useEffect(() => {
    if (messages.length <= 1) return;
    const id = setInterval(() => setI(p => (p + 1) % messages.length), 8000);
    return () => clearInterval(id);
  }, [messages.length]);

  if (dismissed || messages.length === 0) return null;

  return (
    <div className="flex min-w-0 items-center justify-center gap-2 px-3 text-[11px]">
      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--accent)] animate-pulse" aria-hidden="true" />
      <span key={i} className="truncate text-[var(--text-secondary)]" title={messages[i]}>{messages[i]}</span>
      <button
        onClick={() => setDismissed(true)}
        className="flex-shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition leading-none"
        aria-label="Dismiss announcement"
      >×</button>
    </div>
  );
}
