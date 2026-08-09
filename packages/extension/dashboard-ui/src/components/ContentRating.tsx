import { useState } from 'react';
import { t, tt, useLocale } from '../i18n';
import { post } from '../App';

/**
 * Rate a course, recipe or exercise.
 *
 * ONE COMPONENT, not one per surface. The star widget existed twice already —
 * inline in the extension's course detail and again in the IDE — and the two
 * had already diverged before recipes and exercises were even added. Every
 * drift bug found today has the same shape: a fact or a behaviour copied
 * instead of shared, rotting quietly in one of its homes.
 *
 * WHAT IT SHOWS
 *
 * The stars fill from the average, or from YOUR score once you have given one.
 * They used to fill only from the viewer's own rating, so a course sitting at
 * 4/5 rendered five grey stars beside the number 4 — the widget contradicting
 * itself in the same row. Solid amber is yours, dimmer is the crowd's, so the
 * two are never confused.
 *
 * A failure is shown. The path this replaces swallowed errors in an empty
 * catch, and dropped the click entirely when there was no platform key, so a
 * user could click five times and never learn that none of them landed.
 *
 * A low score asks WHY, with codes rather than a text box — most people will
 * tap a chip and almost nobody types. Only at 3 or below: asking someone who
 * gave five stars what went wrong is how you teach people to stop rating
 * things.
 */

export type RatingSubject = 'course' | 'recipe' | 'exercise' | 'workout';

export interface RatingVerdict {
  yourRating: number;
  averageRating: number | null;
  ratingCount: number;
  error?: string;
}

interface Props {
  subjectType: RatingSubject;
  subjectId: string;
  /** The average as the server last reported it, for before the user acts. */
  average?: number | null;
  count?: number;
  /** What came back from the last rating on this item, if any. */
  verdict?: RatingVerdict;
  align?: 'start' | 'end';
}

/**
 * Reasons, in the language of the thing being rated.
 *
 * A course can be "too fast"; a recipe cannot. A recipe "didn't work"; a course
 * does not. Showing course wording on a recipe is the fastest way to teach
 * someone that the feedback box is not really for them — they read five
 * options, none of which describe what happened, and stop bothering.
 *
 * Same codes on the wire, different words on screen.
 */
const REASONS_BY_TYPE: Record<RatingSubject, Array<[string, string, string]>> = {
  course: [
    ['unclear', 'learning_library.reason_unclear', 'Unclear'],
    ['too-fast', 'learning_library.reason_too_fast', 'Too fast'],
    ['too-easy', 'learning_library.reason_too_easy', 'Too easy'],
    ['wrong', 'learning_library.reason_wrong', 'Something wrong'],
    ['translation', 'learning_library.reason_translation', 'Bad translation'],
  ],
  recipe: [
    ['didnt-work', 'feedback.reason.didnt_work', "Didn't work"],
    ['too-fiddly', 'feedback.reason.too_fiddly', 'Too fiddly'],
    ['timings-off', 'feedback.reason.timings_off', 'Timings were off'],
    ['seasoning', 'feedback.reason.seasoning', 'Tasted off'],
    ['unclear', 'learning_library.reason_unclear', 'Unclear'],
  ],
  exercise: [
    // Unsafe first, deliberately. It is the only reason here that should ever
    // pull an exercise rather than merely be noted, so it must not be the
    // option someone has to hunt for.
    ['unsafe', 'feedback.reason.unsafe', 'Felt unsafe'],
    ['too-hard', 'feedback.reason.too_hard', 'Too hard'],
    ['too-easy', 'learning_library.reason_too_easy', 'Too easy'],
    ['form-unclear', 'feedback.reason.form_unclear', "Couldn't tell the form"],
    ['wrong-equipment', 'feedback.reason.wrong_equipment', 'Equipment was wrong'],
  ],
  workout: [
    ['unsafe', 'feedback.reason.unsafe', 'Felt unsafe'],
    ['too-hard', 'feedback.reason.too_hard', 'Too hard'],
    ['too-easy', 'learning_library.reason_too_easy', 'Too easy'],
    ['unclear', 'learning_library.reason_unclear', 'Unclear'],
  ],
};

export function ContentRating({
  subjectType, subjectId, average, count, verdict, align = 'end',
}: Props) {
  useLocale();
  const [askReason, setAskReason] = useState(false);

  const mine = verdict?.yourRating ?? null;
  const avg = verdict?.averageRating ?? average ?? 0;
  const total = verdict?.ratingCount ?? count ?? 0;

  function rate(rating: number, reason?: string) {
    post({ type: 'rate_content', subjectType, subjectId, rating, reason });
    setAskReason(reason ? false : rating <= 3);
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 3,
      alignItems: align === 'end' ? 'flex-end' : 'flex-start',
    }}>
      <span style={{
        fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase',
        letterSpacing: 0.5, fontWeight: 600,
      }}>
        {mine
          ? tt('learning_library.your_rating', 'Your rating')
          : subjectType === 'recipe' ? tt('feedback.rate_recipe', 'Rate this recipe')
          : subjectType === 'exercise' ? tt('feedback.rate_exercise', 'Rate this exercise')
          : t('learning_library.rate_course')}
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star}
            onClick={() => rate(star)}
            title={t('learning_library.rate_star', { star })}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', fontSize: 18,
              padding: 1, lineHeight: 1,
              color: (mine ?? avg) >= star
                ? (mine ? '#fbbf24' : 'rgba(251,191,36,0.55)')
                : 'var(--text-muted)',
            }}
          >{'★'}</button>
        ))}
        {/* Shown at zero as well. Hiding it left unrated items one stat short
            of their neighbours, so a row of cards read as ragged and the rated
            ones looked like the only real ones. */}
        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>
          {avg}/5 ({total})
        </span>
      </div>

      {verdict?.error && (
        <span style={{ fontSize: 10, color: '#f87171', maxWidth: 220, textAlign: align === 'end' ? 'right' : 'left' }}>
          {verdict.error}
        </span>
      )}

      {askReason && !verdict?.error && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2, maxWidth: 280,
          justifyContent: align === 'end' ? 'flex-end' : 'flex-start',
        }}>
          {(REASONS_BY_TYPE[subjectType] ?? REASONS_BY_TYPE.course).map(([code, key, fallback]) => (
            <button
              key={code}
              onClick={() => rate(mine ?? 3, code)}
              style={{
                padding: '2px 8px', borderRadius: 10, fontSize: 10, cursor: 'pointer',
                border: '1px solid var(--border-card)', background: 'transparent',
                color: 'var(--text-secondary)',
              }}
            >{tt(key, fallback)}</button>
          ))}
        </div>
      )}
    </div>
  );
}
