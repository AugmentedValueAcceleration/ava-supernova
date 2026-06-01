import { useState } from 'react';
import { post } from '../App';
import type { DashboardLearningLesson, DashboardLessonStep } from '../types/messages';

type StepResult = { status: 'attempted' | 'mastered'; lastAttempt: string | null };

/**
 * LessonPlayer — plays a lesson as an interactive teach→do→check loop, one
 * step at a time, as cards. The Brilliant-style surface: a bite of teaching,
 * the learner does something, immediate feedback, advance.
 *
 * Deterministic steps (choice / predict) are checked right here against the
 * step's `answer`. Open steps (free_text / code) have no single right answer —
 * the player shows the learner what a strong answer contains (the `evaluation`
 * rubric) and lets them self-check for now; live Ava grading is the next layer.
 */
interface Props {
  lesson: DashboardLearningLesson;
  /** When set, progress is persisted to the store under this curriculum so
   *  returning resumes and Ava can see it. Omitted for the built-in sample. */
  curriculumId?: string;
  onClose: () => void;
}

export function LessonPlayer({ lesson, curriculumId, onClose }: Props) {
  const steps = lesson.steps ?? [];
  // Resume at the first step not yet mastered — pick up where you left off.
  const resumeAt = steps.findIndex(s => s.status !== 'mastered');
  const [i, setI] = useState(resumeAt === -1 ? 0 : resumeAt);
  const [done, setDone] = useState(false);

  if (steps.length === 0) {
    return (
      <div>
        <BackBar onClose={onClose} title={lesson.title} progress="" />
        <div className="rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)]/30 p-6 text-center">
          <p className="text-sm text-[var(--text-secondary)]">This lesson hasn&apos;t been authored as an interactive lesson yet.</p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">Ask Ava to teach this topic and she&apos;ll build it as a step-by-step loop you can play here.</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div>
        <BackBar onClose={onClose} title={lesson.title} progress="" />
        <div className="rounded-xl border border-emerald-400/30 bg-gradient-to-br from-emerald-400/5 to-[var(--accent)]/5 p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400/10 text-2xl">✓</div>
          <h2 className="text-lg font-bold text-white">You did it</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            You worked through every step yourself — that&apos;s the skill, not the reading.
          </p>
          <button
            onClick={onClose}
            className="mt-5 rounded-lg border-none bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white cursor-pointer hover:opacity-90 transition"
          >
            Back to course
          </button>
        </div>
      </div>
    );
  }

  const step = steps[i];
  const handleStepDone = (result: StepResult) => {
    if (curriculumId) {
      post({ type: 'learning_step_progress', curriculumId, lessonId: lesson.id, stepId: step.id, status: result.status, lastAttempt: result.lastAttempt });
    }
    if (i + 1 >= steps.length) {
      if (curriculumId) post({ type: 'learning_lesson_complete', curriculumId, lessonId: lesson.id, score: 100 });
      setDone(true);
    } else {
      setI(i + 1);
    }
  };

  return (
    <div>
      <BackBar onClose={onClose} title={lesson.title} progress={`${i + 1} / ${steps.length}`} />

      {/* Progress dots */}
      <div className="mb-4 flex gap-1.5">
        {steps.map((_, k) => (
          <div
            key={k}
            className="h-1 flex-1 rounded-full transition"
            style={{ background: k < i ? 'var(--accent)' : k === i ? 'var(--gradient-start)' : 'var(--bg-input)' }}
          />
        ))}
      </div>

      <StepCard key={step.id} step={step} onDone={handleStepDone} />
    </div>
  );
}

function StepCard({ step, onDone }: { step: DashboardLessonStep; onDone: (r: StepResult) => void }) {
  const kind = step.interaction.kind;
  const [picked, setPicked] = useState<string | null>(null);
  const [text, setText] = useState(step.last_attempt ?? step.interaction.starter ?? '');
  const [revealed, setRevealed] = useState(false);

  const isDeterministic = kind === 'choice' || kind === 'predict';
  const correct = isDeterministic && picked !== null && norm(picked) === norm(step.interaction.answer ?? '');

  return (
    <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
      {/* Teach */}
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-white">{step.teach}</p>

      {/* Do */}
      <div className="mt-4 rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)]/40 p-3">
        <p className="mb-2.5 text-xs font-medium text-[var(--text-secondary)]">{step.interaction.prompt}</p>

        {/* choice / predict — option buttons, checked locally */}
        {isDeterministic && (step.interaction.options?.length ?? 0) > 0 && (
          <div className="flex flex-col gap-1.5">
            {step.interaction.options!.map((opt) => {
              const isPicked = picked === opt;
              const showRight = picked !== null && norm(opt) === norm(step.interaction.answer ?? '');
              return (
                <button
                  key={opt}
                  disabled={picked !== null}
                  onClick={() => setPicked(opt)}
                  className="rounded-lg border px-3 py-2 text-left text-xs transition cursor-pointer disabled:cursor-default"
                  style={{
                    borderColor: showRight ? '#34d399' : isPicked && !correct ? '#f87171' : 'var(--border-card)',
                    background: showRight ? 'rgba(52,211,153,0.08)' : isPicked && !correct ? 'rgba(248,113,113,0.08)' : 'transparent',
                    color: 'white',
                  }}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        )}

        {/* free_text — a real answer the learner writes */}
        {kind === 'free_text' && (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Your answer…"
            rows={3}
            className="w-full resize-y rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] p-2.5 text-xs text-white outline-none focus:border-[var(--accent)]/50"
          />
        )}

        {/* code — write + (soon) run real code */}
        {kind === 'code' && (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            rows={6}
            className="w-full resize-y rounded-lg border border-[var(--border-card)] bg-[#11111b] p-2.5 font-mono text-[11px] leading-relaxed text-[#cdd6f4] outline-none focus:border-[var(--accent)]/50"
          />
        )}
      </div>

      {/* Feedback */}
      {isDeterministic && picked !== null && (
        <p className="mt-3 text-xs leading-relaxed" style={{ color: correct ? '#34d399' : '#f87171' }}>
          {correct
            ? (step.feedback?.correct || 'Right.')
            : (step.feedback?.incorrect || `Not quite — the answer is "${step.interaction.answer}".`)}
        </p>
      )}
      {!isDeterministic && revealed && step.interaction.evaluation && (
        <div className="mt-3 rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">What a strong answer has</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">{step.interaction.evaluation}</p>
          <p className="mt-2 text-[10px] text-[var(--text-muted)]">Soon: Ava reads your actual answer and grades it against this live.</p>
        </div>
      )}

      {/* Action */}
      <div className="mt-4 flex justify-end">
        {isDeterministic ? (
          <button
            disabled={picked === null}
            onClick={() => onDone({ status: correct ? 'mastered' : 'attempted', lastAttempt: picked })}
            className="rounded-lg border-none bg-[var(--accent)] px-4 py-1.5 text-xs font-medium text-white cursor-pointer hover:opacity-90 transition disabled:opacity-30 disabled:cursor-default"
          >
            Continue
          </button>
        ) : !revealed ? (
          <button
            disabled={text.trim().length === 0}
            onClick={() => setRevealed(true)}
            className="rounded-lg border-none bg-[var(--accent)] px-4 py-1.5 text-xs font-medium text-white cursor-pointer hover:opacity-90 transition disabled:opacity-30 disabled:cursor-default"
          >
            Check
          </button>
        ) : (
          <button
            onClick={() => onDone({ status: 'mastered', lastAttempt: text })}
            className="rounded-lg border-none bg-[var(--accent)] px-4 py-1.5 text-xs font-medium text-white cursor-pointer hover:opacity-90 transition"
          >
            Continue
          </button>
        )}
      </div>
    </div>
  );
}

function BackBar({ onClose, title, progress }: { onClose: () => void; title: string; progress: string }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <button
        onClick={onClose}
        className="bg-transparent border-none cursor-pointer text-xs text-[var(--text-muted)] hover:text-white transition"
      >
        ← {title}
      </button>
      {progress && <span className="text-[10px] font-medium text-[var(--text-muted)]">{progress}</span>}
    </div>
  );
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/^[a-d]\)\s*/, '');
}
