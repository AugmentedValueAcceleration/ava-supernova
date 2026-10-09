import { useState, useEffect } from 'react';
import { tt, getLocale } from '../i18n';
import { post } from '../App';
import type { DashboardLearningLesson, DashboardLessonStep } from '../types/messages';
import type { GradeResult } from '@ava/core/learning';

type StepResult = { status: 'attempted' | 'mastered'; lastAttempt: string | null };

/**
 * LessonPlayer — plays a lesson as an interactive teach→do→check loop, one
 * step at a time, as cards. The Brilliant-style surface: a bite of teaching,
 * the learner does something, immediate feedback, advance.
 *
 * Deterministic steps (choice / predict) are checked right here against the
 * step's `answer`. Open steps (free_text / code) have no single right answer,
 * so the host grades the learner's ACTUAL attempt against the step's
 * `evaluation` rubric and only a "strong" verdict counts as mastery.
 *
 * It used to show the rubric and let the learner self-check, with Continue
 * marking the step mastered either way. That made a completed course mean
 * nothing: every open step passed regardless of what was typed in it.
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
  // When this sitting began. Nothing else measures lesson time: core's
  // trackTime needs `started_at`, which only the Ava-taught path sets, so a
  // course done entirely here showed 0 hours on its certificate.
  const [openedAt] = useState(() => Date.now());
  // What the lesson came to, kept so the finish screen can say it. A
  // congratulations screen that cannot tell you how you did is the same
  // participation trophy the hardcoded 100 was.
  const [result, setResult] = useState<{ mastered: number; total: number } | null>(null);
  // What each step actually came to, so the lesson can be scored on it.
  //
  // Seeded from the steps' own statuses rather than starting empty: a lesson
  // resumed at step 7 must be scored on all of it, not on the three steps
  // done in this sitting.
  const [outcomes, setOutcomes] = useState<Record<string, StepResult['status']>>(() => {
    const seed: Record<string, StepResult['status']> = {};
    for (const s of steps) {
      if (s.status === 'mastered' || s.status === 'attempted') seed[s.id] = s.status;
    }
    return seed;
  });

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
          <h2 className="text-lg font-bold text-white">{tt('ext.lesson.you_did_it','You did it')}</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            You worked through every step yourself — that&apos;s the skill, not the reading.
          </p>
          {/* What it came to. This feeds the course score, and the course
              score is what a certificate states, so saying it here is also
              saying what the certificate will claim. */}
          {result && (
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              {result.mastered === result.total
                ? tt('ext.lesson.all_mastered', 'Every step mastered.')
                : `${result.mastered}/${result.total} ${tt('ext.lesson.steps_mastered', 'steps mastered')} — ${tt('ext.lesson.revisit_hint', 'the rest are worth another look.')}`}
            </p>
          )}
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
    const settled = { ...outcomes, [step.id]: result.status };
    setOutcomes(settled);
    if (i + 1 >= steps.length) {
      // The score is what they MASTERED, not the fact they reached the end.
      //
      // This was hardcoded to 100. Every lesson therefore reported a perfect
      // score, and since a certificate averages lesson scores, someone could
      // be graded weak on every open answer, press Move on each time, and
      // finish with a 100% certificate. The machinery was sound; the number
      // going into it was invented.
      const mastered = steps.filter((s) => settled[s.id] === 'mastered').length;
      const score = steps.length === 0 ? 0 : Math.round((mastered / steps.length) * 100);
      const minutes = Math.round((Date.now() - openedAt) / 60000);
      if (curriculumId) post({ type: 'learning_lesson_complete', curriculumId, lessonId: lesson.id, score, minutes });
      setResult({ mastered, total: steps.length });
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

      <StepCard key={step.id} step={step} lessonTitle={lesson.title} onDone={handleStepDone} />
    </div>
  );
}

function StepCard({ step, lessonTitle, onDone }: { step: DashboardLessonStep; lessonTitle: string; onDone: (r: StepResult) => void }) {
  const kind = step.interaction.kind;
  const [picked, setPicked] = useState<string | null>(null);
  const [text, setText] = useState(step.last_attempt ?? step.interaction.starter ?? '');
  const [revealed, setRevealed] = useState(false);
  const [grading, setGrading] = useState(false);
  const [grade, setGrade] = useState<GradeResult | null>(null);
  const [gradeError, setGradeError] = useState<string | null>(null);

  const isDeterministic = kind === 'choice' || kind === 'predict';
  // No rubric means there is nothing to grade against. The step still plays,
  // self-checked, and no request is sent — spending a credit to be told the
  // course is missing something is the learner paying for our gap.
  const gradable = !isDeterministic && !!step.interaction.evaluation?.trim();

  // One listener per step card, matched on stepId. Only one step is ever on
  // screen, but matching means a late reply from a step already left behind
  // can never land on the next one.
  useEffect(() => {
    if (!gradable) return;
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (!msg || msg.type !== 'open_answer_graded' || msg.stepId !== step.id) return;
      setGrading(false);
      if (msg.ok && msg.result) {
        setGrade(msg.result as GradeResult);
        setGradeError(null);
        return;
      }
      setGrade(null);
      // A missing rubric is the COURSE's gap, and saying so is the honest
      // answer. Anything else is ours, and the learner's answer is untouched
      // either way — neither is a reason to mark them down.
      setGradeError(
        msg.reason === 'no_rubric'
          ? tt('ext.lesson.no_rubric', 'This step has no marking guide yet, so it cannot be graded. That is the course to fix, not your answer.')
          : (msg.error || tt('ext.lesson.grade_failed', 'Grading did not come back. Your answer is untouched.')),
      );
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [step.id, gradable]);

  const askForGrade = () => {
    setGrading(true);
    setGrade(null);
    setGradeError(null);
    post({
      type: 'grade_open_answer',
      stepId: step.id,
      kind: kind === 'code' ? 'code' : 'free_text',
      prompt: step.interaction.prompt,
      rubric: step.interaction.evaluation ?? '',
      answer: text,
      starter: step.interaction.starter,
      lessonTitle,
      locale: getLocale(),
    });
  };
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
            placeholder={tt('ext.lesson.answer_ph','Your answer…')}
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
      {/* The verdict on an open answer. The rubric is shown ALONGSIDE it, not
          instead of it: the learner should be able to see what was asked of
          them next to what they were told about their attempt. */}
      {grading && (
        <p className="mt-3 text-xs text-[var(--text-muted)]">{tt('ext.lesson.grading', 'Reading your answer…')}</p>
      )}
      {!grading && grade && (
        <div
          className="mt-3 rounded-lg border p-3"
          style={{
            borderColor: grade.verdict === 'strong' ? 'rgba(52,211,153,0.3)' : grade.verdict === 'partial' ? 'rgba(251,191,36,0.3)' : 'rgba(248,113,113,0.3)',
            background: grade.verdict === 'strong' ? 'rgba(52,211,153,0.06)' : grade.verdict === 'partial' ? 'rgba(251,191,36,0.06)' : 'rgba(248,113,113,0.06)',
          }}
        >
          <p
            className="text-[10px] font-semibold uppercase tracking-wide"
            style={{ color: grade.verdict === 'strong' ? '#34d399' : grade.verdict === 'partial' ? '#fbbf24' : '#f87171' }}
          >
            {grade.verdict === 'strong'
              ? tt('ext.lesson.verdict_strong', 'That holds up')
              : grade.verdict === 'partial'
                ? tt('ext.lesson.verdict_partial', 'Part of the way there')
                : tt('ext.lesson.verdict_weak', 'Not yet')}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-white">{grade.feedback}</p>
          {grade.met.length > 0 && (
            <ul className="mt-2 list-none space-y-1 p-0">
              {grade.met.map((m, k) => (
                <li key={`met-${k}`} className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
                  <span style={{ color: '#34d399' }}>{'✓'}</span> {m}
                </li>
              ))}
            </ul>
          )}
          {grade.missing.length > 0 && (
            <ul className="mt-2 list-none space-y-1 p-0">
              {grade.missing.map((m, k) => (
                <li key={`missing-${k}`} className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
                  <span style={{ color: '#fbbf24' }}>{'→'}</span> {m}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {!grading && gradeError && (
        <p className="mt-3 text-xs leading-relaxed" style={{ color: '#f87171' }}>{gradeError}</p>
      )}
      {/* Self-check fallback: no rubric to grade against, so the best the
          player can do is let them move on. Never silently mastered. */}
      {!isDeterministic && !gradable && revealed && (
        <p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">
          {tt('ext.lesson.self_check', 'This step has no marking guide yet, so it is yours to judge. Read it back against what the step asked for.')}
        </p>
      )}
      {!isDeterministic && (grade || gradeError) && step.interaction.evaluation && (
        <div className="mt-3 rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">{tt('ext.lesson.strong_answer','What a strong answer has')}</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">{step.interaction.evaluation}</p>
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
        ) : grade?.mastered ? (
          /* Mastery comes from the verdict, never from pressing Continue. */
          <button
            onClick={() => onDone({ status: 'mastered', lastAttempt: text })}
            className="rounded-lg border-none bg-[var(--accent)] px-4 py-1.5 text-xs font-medium text-white cursor-pointer hover:opacity-90 transition disabled:opacity-30 disabled:cursor-default"
          >
            {tt('ext.lesson.continue', 'Continue')}
          </button>
        ) : grade || gradeError ? (
          /* Graded short, or grading failed. Another go is the useful default,
             and moving on is still allowed — the step records what it was,
             which is attempted, so the course cannot complete on it. */
          <div className="flex gap-2">
            <button
              onClick={() => onDone({ status: 'attempted', lastAttempt: text })}
              className="rounded-lg border border-[var(--border-card)] bg-transparent px-4 py-1.5 text-xs font-medium text-[var(--text-secondary)] cursor-pointer hover:text-white transition"
            >
              {tt('ext.lesson.move_on', 'Move on')}
            </button>
            <button
              disabled={text.trim().length === 0}
              onClick={askForGrade}
              className="rounded-lg border-none bg-[var(--accent)] px-4 py-1.5 text-xs font-medium text-white cursor-pointer hover:opacity-90 transition disabled:opacity-30 disabled:cursor-default"
            >
              {tt('ext.lesson.try_again', 'Try again')}
            </button>
          </div>
        ) : !gradable && revealed ? (
          /* No rubric, so nothing graded it. Attempted, not mastered: a step
             nobody could check must not count towards a certificate. */
          <button
            onClick={() => onDone({ status: 'attempted', lastAttempt: text })}
            className="rounded-lg border-none bg-[var(--accent)] px-4 py-1.5 text-xs font-medium text-white cursor-pointer hover:opacity-90 transition disabled:opacity-30 disabled:cursor-default"
          >
            {tt('ext.lesson.continue', 'Continue')}
          </button>
        ) : (
          <button
            disabled={text.trim().length === 0 || grading}
            onClick={() => (gradable ? askForGrade() : setRevealed(true))}
            className="rounded-lg border-none bg-[var(--accent)] px-4 py-1.5 text-xs font-medium text-white cursor-pointer hover:opacity-90 transition disabled:opacity-30 disabled:cursor-default"
          >
            {grading ? tt('ext.lesson.checking', 'Checking…') : tt('ext.lesson.check', 'Check')}
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
