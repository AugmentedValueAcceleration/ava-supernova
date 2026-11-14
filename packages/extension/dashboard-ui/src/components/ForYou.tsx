// "For you" on the command centre's Health tab (Health Part 4, 14 Nov 2026;
// mockup approved the same night). The picks are chosen on this computer by
// core's buildForYou (the host runs it, where the profile lives); this file
// only draws them. Mirrors the IDE's ForYou.tsx.
//
// Nobody has to make a plan to try something: "Make this" and "How to do it"
// just open the dish or the exercise. "Start a plan with it" is there for
// those who want one.

import { useEffect, useState } from 'react';
import { tt, useLocale } from '../i18n';
import { post } from '../App';
import { Icon } from './Icon';
import { ForYouPreview } from './ForYouPreview';
import type { ForYouResult, ForYouPick, ForYouExtra, ForYouAction } from '../types/messages';

export interface ForYouHandlers {
  onOpenItem: (kind: 'recipe' | 'exercise', slug: string) => void;
  onStartPlan: (seed: { kind: 'recipe' | 'exercise'; slug: string; name: string; course?: string | null }) => void;
  onProfile: () => void;
  onOpenPlans: () => void;
}

const card = 'overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-input)]/30';
const ghost = 'min-h-[30px] flex-1 cursor-pointer rounded-md border border-[var(--border)] bg-transparent px-2 text-[11px] text-[var(--text-primary)] hover:border-[var(--accent)]/50';
const solid = 'min-h-[30px] flex-1 cursor-pointer rounded-md border-none bg-[var(--accent)] px-2 text-[11px] font-semibold text-white hover:opacity-90';

function Picture({ pick, h }: { pick: ForYouPick; h: string }) {
  return (
    <div className={`${h} flex w-full items-center justify-center overflow-hidden bg-black/20`}>
      {pick.image
        ? <img src={pick.image} alt="" className="h-full w-full object-cover" loading="lazy" />
        : pick.kind === 'recipe' ? <Icon.meal size={20} /> : <Icon.fitness size={20} />}
    </div>
  );
}

function PickCard({ pick, set, h }: { pick: ForYouPick; set: boolean; h: ForYouHandlers }) {
  return (
    <div className={`${card} flex flex-col`}>
      <Picture pick={pick} h="h-[96px]" />
      <div className="flex flex-1 flex-col gap-1 px-3 py-2.5">
        {pick.kicker && <span className="text-[9px] font-medium uppercase tracking-[0.18em]" style={{ color: pick.kind === 'recipe' ? '#fbbf24' : '#89b4fa' }}>{pick.kicker}</span>}
        <span className="text-[13px] text-[var(--text-primary)]">{pick.name}</span>
        {pick.why && <span className="text-[11px]" style={{ color: set ? '#a6e3a1' : 'var(--text-secondary)' }}>{pick.why}</span>}
      </div>
      {set && (
        <div className="flex gap-1.5 px-3 pb-3">
          <button type="button" className={ghost} onClick={() => h.onOpenItem(pick.kind, pick.slug)}>
            {pick.kind === 'recipe' ? tt('health.foryou.make', 'Make this') : tt('health.foryou.how', 'How to do it')}
          </button>
          <button type="button" className={solid} onClick={() => h.onStartPlan({ kind: pick.kind, slug: pick.slug, name: pick.name, course: pick.course })}>
            {tt('health.foryou.start_plan', 'Start a plan with it')}
          </button>
        </div>
      )}
      {!set && (
        <button type="button" className="mx-3 mb-3 cursor-pointer border-none bg-transparent p-0 text-left text-[11px] text-[var(--accent)] hover:underline" onClick={() => h.onOpenItem(pick.kind, pick.slug)}>
          {pick.kind === 'recipe' ? tt('health.foryou.see_recipe', 'See the recipe') : tt('health.foryou.see_exercise', 'See the exercise')}
        </button>
      )}
    </div>
  );
}

function ExtraCard({ x, busy, onDo, h }: { x: ForYouExtra; busy: boolean; onDo: (a: ForYouAction) => void; h: ForYouHandlers }) {
  return (
    <div className={`${card} flex flex-col`}>
      <button type="button" onClick={() => h.onOpenItem(x.kind, x.slug)} className="block cursor-pointer border-none bg-transparent p-0">
        <Picture pick={x} h="h-[84px]" />
      </button>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {x.kicker && <span className="text-[9px] font-medium uppercase tracking-[0.18em]" style={{ color: x.kind === 'recipe' ? '#fbbf24' : '#89b4fa' }}>{x.kicker}</span>}
        <button type="button" onClick={() => h.onOpenItem(x.kind, x.slug)} className="cursor-pointer border-none bg-transparent p-0 text-left text-[13px] text-[var(--text-primary)] hover:underline">{x.name}</button>
        <span className="text-[11px]" style={{ color: '#a6e3a1' }}>{x.why}</span>
        <button type="button" disabled={busy} className={`${ghost} mt-1 flex-none self-start disabled:opacity-50`} onClick={() => onDo(x.action)}>
          {x.action.type === 'swap_meal' ? tt('health.foryou.swap_in', 'Swap it in') : tt('health.foryou.add_today', 'Add to today')}
        </button>
      </div>
    </div>
  );
}

/** A small square picture for the session and dinner rows. */
function Thumb({ src, kind }: { src?: string | null; kind: 'recipe' | 'exercise' }) {
  return (
    <div className="flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-md bg-black/20">
      {src ? <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" /> : kind === 'recipe' ? <Icon.meal size={18} /> : <Icon.fitness size={18} />}
    </div>
  );
}

export function ForYou({ result, h }: { result: ForYouResult | null | undefined; h: ForYouHandlers }) {
  useLocale();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  /** The suggestion being looked at before anything changes. */
  const [preview, setPreview] = useState<ForYouExtra | null>(null);
  useEffect(() => { post({ type: 'load_for_you' }); }, []);
  useEffect(() => { setBusy(false); }, [result]);

  const apply = (a: ForYouAction) => {
    setPreview(null);
    setBusy(true);
    setDone(a.name);
    // The host saves the plan, then sends a fresh card built against it.
    post({ type: 'apply_for_you', action: a });
  };

  if (result === undefined) {
    return (
      <section className="mb-6 flex h-[230px] flex-col items-center justify-center gap-3 rounded-xl border border-[var(--border)]" role="status">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" aria-hidden />
        <span className="text-[12px] text-[var(--text-secondary)]">{tt('health.foryou.loading', 'Finding picks for you…')}</span>
      </section>
    );
  }
  if (result === null) return null; // the library could not be reached: say nothing rather than something wrong

  const head = (title: string, hint: string) => (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="m-0 text-[15px] font-semibold text-[var(--text-primary)]">{title}</h2>
      <span className="text-[11px] text-[var(--text-secondary)]">{hint}</span>
    </div>
  );

  if (!result.checked) {
    return (
      <section className="mb-6 rounded-xl border border-[var(--border)] p-5">
        {head(tt('health.foryou.title', 'For you'), '')}
        <p className="m-0 text-[12px]" style={{ color: '#f9e2af' }}>{tt('health.foryou.unchecked', 'Your picks could not be checked against your rules just now, so none are shown. They will be back when the library can be reached.')}</p>
      </section>
    );
  }

  if (result.state === 'running') {
    return (
      <section className="mb-6 rounded-xl border border-[var(--border)] p-5">
        {head(tt('health.foryou.title_today', 'For you today'), result.planTitle ? tt('health.foryou.from_plan', 'From your plan: {title}').replace('{title}', result.planTitle) : '')}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {result.session && (
            <div className={`${card} flex items-center gap-3 p-3`}>
              <Thumb src={result.session.image} kind="exercise" />
              <div className="min-w-0 flex-1">
                <div className="text-[9px] font-medium uppercase tracking-[0.18em]" style={{ color: '#89b4fa' }}>{tt('health.foryou.session', "Today's session")}</div>
                <div className="truncate text-[13px] text-[var(--text-primary)]">{result.session.title ?? tt('health.foryou.training', 'Training')} · {tt('health.foryou.n_exercises', '{n} exercises').replace('{n}', String(result.session.count))}</div>
                {result.session.first && <div className="truncate text-[11px] text-[var(--text-secondary)]">{tt('health.foryou.first', '{name} first').replace('{name}', result.session.first)}</div>}
              </div>
              <button type="button" className={`${solid} flex-none px-3`} onClick={h.onOpenPlans}>{tt('health.foryou.open', 'Open')}</button>
            </div>
          )}
          {result.dinner && (
            <div className={`${card} flex items-center gap-3 p-3`}>
              <Thumb src={result.dinner.image} kind="recipe" />
              <div className="min-w-0 flex-1">
                <div className="text-[9px] font-medium uppercase tracking-[0.18em]" style={{ color: '#fbbf24' }}>{tt('health.foryou.dinner', "Tonight's dinner")}</div>
                <div className="truncate text-[13px] text-[var(--text-primary)]">{result.dinner.name}</div>
                {result.dinner.why && <div className="truncate text-[11px] text-[var(--text-secondary)]">{result.dinner.why}</div>}
              </div>
              {result.dinner.slug && <button type="button" className={`${solid} flex-none px-3`} onClick={() => h.onOpenItem('recipe', result.dinner!.slug!)}>{tt('health.foryou.make', 'Make this')}</button>}
            </div>
          )}
        </div>
        {result.extras.length > 0 && (
          <>
            <div className="mb-2 mt-4 text-[11px] uppercase tracking-[0.14em] text-[var(--text-secondary)]">{tt('health.foryou.goes_with', 'Goes with today')}</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {result.extras.map((x) => <ExtraCard key={`${x.action.type}:${x.slug}`} x={x} busy={busy} onDo={() => setPreview(x)} h={h} />)}
            </div>
          </>
        )}
        {preview && <ForYouPreview x={preview} result={result} onConfirm={apply} onClose={() => setPreview(null)} />}
        {done && busy && (
          <p className="mb-0 mt-3 flex items-center gap-2 text-[11px] text-[var(--text-secondary)]" role="status">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" aria-hidden />
            {tt('health.foryou.saving', 'Adding {name} to your plan…').replace('{name}', done)}
          </p>
        )}
      </section>
    );
  }

  const set = result.state === 'profile';
  return (
    <section className="mb-6 rounded-xl border border-[var(--border)] p-5">
      {head(tt('health.foryou.title', 'For you'), set ? tt('health.foryou.hint_set', 'Fits your rules · new picks each day') : tt('health.foryou.hint_taste', 'A taste of the library'))}
      {result.picks.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {result.picks.map((p) => <PickCard key={`${p.kind}:${p.slug}`} pick={p} set={set} h={h} />)}
        </div>
      ) : (
        <p className="m-0 text-[12px] text-[var(--text-secondary)]">{tt('health.foryou.none', 'Nothing in today’s picks fits your rules. Try again tomorrow, or browse the library.')}</p>
      )}
      {set ? (
        <p className="mb-0 mt-3 text-[11px] text-[var(--text-secondary)]">{tt('health.foryou.privacy', 'Picked from the library on this computer, checked against your allergies, diet, injuries and kit.')}</p>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-3">
          <p className="m-0 flex-1 text-[13px] text-[var(--text-primary)]">{tt('health.foryou.invite', 'Tell Ava what you eat and how you train, and these become yours.')}</p>
          <button type="button" className={`${solid} flex-none px-4`} onClick={h.onProfile}>{tt('health.foryou.set_up', 'Set up your profile')}</button>
        </div>
      )}
    </section>
  );
}
