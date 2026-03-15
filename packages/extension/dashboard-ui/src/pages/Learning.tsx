import { SectionGroup } from '../components/SectionGroup';

export function Learning() {
  return (
    <div>
      <h1 className="text-xl font-bold text-white mb-1">Learning</h1>
      <p className="text-sm text-[var(--text-secondary)] mb-6">
        Your learning paths, created by Ava through conversation.
      </p>

      <SectionGroup title="How it works">
        <div className="space-y-3">
          <div className="flex gap-3 items-start">
            <span className="text-lg shrink-0">💬</span>
            <div>
              <p className="text-sm text-white font-medium">Tell Ava what you want to learn</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Say something like &quot;I want to learn Rust&quot; or &quot;Teach me system design&quot; in the chat.
              </p>
            </div>
          </div>
          <div className="flex gap-3 items-start">
            <span className="text-lg shrink-0">🧠</span>
            <div>
              <p className="text-sm text-white font-medium">Ava assesses your level</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                She&apos;ll ask about your background, goals, and available time to tailor the curriculum.
              </p>
            </div>
          </div>
          <div className="flex gap-3 items-start">
            <span className="text-lg shrink-0">📚</span>
            <div>
              <p className="text-sm text-white font-medium">She builds your curriculum</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Structured modules with concepts, exercises, projects, and quizzes — all personalized to you.
              </p>
            </div>
          </div>
          <div className="flex gap-3 items-start">
            <span className="text-lg shrink-0">🎓</span>
            <div>
              <p className="text-sm text-white font-medium">Learn at your pace</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Tell Ava when you&apos;re ready for the next lesson. She teaches, quizzes, and adapts based on your progress.
              </p>
            </div>
          </div>
        </div>
      </SectionGroup>

      <div className="mt-6 rounded-xl border border-[var(--border-card)] bg-[var(--bg-input)]/30 p-6 text-center">
        <p className="text-sm text-[var(--text-secondary)]">
          Your learning paths will appear here once Ava creates them.
        </p>
        <p className="text-xs text-[var(--text-muted)] mt-2">
          Progress is tracked across sessions via memory — Ava remembers where you left off.
        </p>
      </div>
    </div>
  );
}
