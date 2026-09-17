import { useState } from 'react';
import type { ToolCallDisplay } from '../../types/messages';
import { t, tt, useLocale } from '../../i18n';
import { Icon } from '../../components/Icon';
import { NumberField } from './NumberField';
// Shared field registry — same source the host saves from, so "what Ava asks",
// "what this card renders", and "where it saves" never drift. Imported from the
// built core (mirrors the i18n import convention; keeps node-only deps out of
// the browser bundle).
import { HEALTH_PROFILE_FIELDS, optionLabel } from '../../../../../core/dist/health/profile-fields.js';
import { coerceLoad, defaultLoadFor, describeLoad, type EquipmentLoad } from '../../../../../core/dist/health/equipment-load.js';
import { TimeInput } from '../../pages/ProfilePrimitives';
import { CookingTimeGrid, type CookTime } from '../../components/CookingTimeGrid';

/**
 * Profile-field card — the Health room's structured "Ava fills your profile"
 * control. When Ava calls health_profile_ask({ field }), this renders the SAME
 * control the profile page uses (goal cards, equipment chips, a number box),
 * pre-selected with whatever's already saved. The answer goes straight back to
 * the host, which saves it to the General / Health profile and tells Ava what
 * landed. Tap-to-save for single choices; Save button for chips / typed values.
 */

interface Props {
  toolCall: ToolCallDisplay;
  onConfirmation: (confirmationId: string, approved: boolean, alwaysAllowCategory?: boolean, planSelection?: string, userResponse?: string) => void;
}

type FieldDef = (typeof HEALTH_PROFILE_FIELDS)[string];

export function ProfileFieldCard({ toolCall, onConfirmation }: Props) {
  useLocale();

  // field + question from the structured payload, falling back to the raw args.
  let field = toolCall.profileField?.field ?? '';
  let question = toolCall.profileField?.question ?? '';
  const currentValue = toolCall.profileField?.currentValue;
  if (!field) {
    try {
      const a = JSON.parse(toolCall.arguments);
      field = a.field ?? '';
      question = question || a.question || '';
    } catch { /* ignore */ }
  }
  const def: FieldDef | undefined = HEALTH_PROFILE_FIELDS[field];

  const isPending = toolCall.status === 'pending_confirmation' && !!toolCall.confirmationId;
  const isCompleted = toolCall.status === 'success';
  const isDenied = toolCall.status === 'failed';

  // Local working state, seeded from whatever's already on the profile.
  const [multi, setMulti] = useState<string[]>(Array.isArray(currentValue) ? currentValue.map(String) : []);
  const [text, setText] = useState<string>(
    def?.asArray && Array.isArray(currentValue) ? currentValue.join('\n')
    : currentValue != null && !Array.isArray(currentValue) && def?.control !== 'cooking_grid' ? String(currentValue) : '',
  );
  // Load range — mode plus two or three numbers, which fits none of the other
  // controls. Seeded from what they already answered, else a plausible default
  // per kind, so nobody faces three empty boxes. A guess in a form they are
  // about to correct is help; the same guess written into a plan is not, which
  // is why defaultLoadFor is only ever a starting point.
  const [load, setLoad] = useState<EquipmentLoad>(() =>
    coerceLoad(currentValue) ?? defaultLoadFor(def?.loadSlug ?? ''));
  const [grid, setGrid] = useState<CookTime>(
    currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue) && (currentValue as CookTime).by_day
      ? (currentValue as CookTime)
      : { by_day: {} },
  );

  const send = (value: unknown) =>
    onConfirmation(toolCall.confirmationId!, true, false, undefined, JSON.stringify({ field, value }));
  const skip = () =>
    onConfirmation(toolCall.confirmationId!, true, false, undefined, JSON.stringify({ field, skipped: true }));

  const optLabel = (o: { value: string; labelKey?: string; label?: string }) => optionLabel(o, t);

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: isPending ? 'color-mix(in srgb, var(--accent) 45%, transparent)' : 'var(--border)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3.5 py-2"
           style={{ background: isPending ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent' }}>
        <span className="text-[var(--accent)]"><Icon.puzzle size={14} /></span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
          {def ? t(def.labelKey) : t('health.fill.field.goal')}
        </span>
      </div>

      {/* Ava's question */}
      {question && <div className="px-3.5 pt-1 pb-2 text-[13px] text-[var(--text-primary)]">{question}</div>}

      {isPending && def && (
        <div className="px-3.5 pb-3.5">
          {/* — Single choice (goal, sex): tap to save — */}
          {def.control === 'select' && (
            <div className={def.options && def.options.some(o => o.hintKey) ? 'grid grid-cols-1 sm:grid-cols-2 gap-2' : 'flex flex-wrap gap-2'}>
              {(def.options ?? []).map((o) => {
                const active = currentValue === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => send(o.value)}
                    className={`text-left rounded-lg border p-2.5 transition cursor-pointer ${
                      active ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border)] hover:border-[var(--accent)]/40'
                    }`}
                  >
                    <div className={`text-[12px] font-medium ${active ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>{optLabel(o)}</div>
                    {o.hintKey && <div className="mt-0.5 text-[10px] leading-relaxed text-[var(--text-muted)]">{t(o.hintKey)}</div>}
                  </button>
                );
              })}
            </div>
          )}

          {/* — Multi choice (equipment, dietary, allergens): toggle chips + Save — */}
          {def.control === 'multiselect' && (
            <>
              <div className="mb-1 text-[10px] text-[var(--text-muted)]">{t('health.fill.multi_hint')}</div>
              <div className="flex flex-wrap gap-1.5">
                {(def.options ?? []).map((o) => {
                  const on = multi.includes(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setMulti((cur) => on ? cur.filter((v) => v !== o.value) : [...cur, o.value])}
                      className={`rounded-full border px-2.5 py-1 text-[11px] transition cursor-pointer ${
                        on ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]' : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)]/40'
                      }`}
                    >
                      {optLabel(o)}
                    </button>
                  );
                })}
              </div>
              <Actions onSave={() => send(multi)} onSkip={skip} />
            </>
          )}

          {/* — Cooking grid (per-day × per-meal time) — */}
          {def.control === 'cooking_grid' && (
            <>
              <div className="mb-2 text-[10px] text-[var(--text-muted)]">{t('health.fill.cooking_grid_hint')}</div>
              <CookingTimeGrid value={grid} onChange={setGrid} />
              <Actions onSave={() => send(grid)} onSkip={skip} />
            </>
          )}

          {/* — Number (height, weight, minutes) — */}
          {def.control === 'number' && (
            <>
              <div className="flex items-center gap-2">
                <NumberField
                  value={text}
                  onChange={setText}
                  inputMode="numeric"
                  widthClass="w-28"
                  onEnter={() => { if (text.trim()) send(text.trim()); }}
                  autoFocus
                />
                {def.unit && <span className="text-[12px] text-[var(--text-muted)]">{def.unit}</span>}
              </div>
              <Actions onSave={() => send(text.trim())} onSkip={skip} disabled={!text.trim()} />
            </>
          )}

          {/* — Load range: what this kit can actually make — */}
          {def.control === 'load_range' && (
            <>
              <div className="flex flex-col gap-2">
                <div className="flex gap-1.5">
                  {(['adjustable', 'fixed'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setLoad(m === load.mode ? load : defaultLoadFor(def.loadSlug ?? ''))}
                      className={`rounded-full px-3 py-1 text-[12px] transition ${
                        load.mode === m
                          ? 'bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/40'
                          : 'border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {m === 'adjustable'
                        ? tt('health.fill.load.adjustable', 'Adjustable')
                        : tt('health.fill.load.fixed', 'Fixed weights')}
                    </button>
                  ))}
                </div>

                {load.mode === 'adjustable' ? (
                  <div className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-muted)]">
                    {([
                      ['minKg', tt('health.fill.load.from', 'from')],
                      ['maxKg', tt('health.fill.load.to', 'to')],
                      ['stepKg', tt('health.fill.load.step', 'in steps of')],
                    ] as const).map(([key, label]) => (
                      <span key={key} className="flex items-center gap-1.5">
                        {label}
                        <NumberField
                          step={0.5}
                          min={0}
                          inputMode="decimal"
                          widthClass="w-20"
                          value={String((load as Extract<EquipmentLoad, { mode: 'adjustable' }>)[key])}
                          onChange={(v) => setLoad({ ...(load as Extract<EquipmentLoad, { mode: 'adjustable' }>), [key]: v === '' ? 0 : Number(v) })}
                        />
                        kg
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex flex-wrap gap-1.5">
                      {(load as Extract<EquipmentLoad, { mode: 'fixed' }>).weightsKg.map((w, i) => (
                        <button
                          key={`${w}-${i}`}
                          onClick={() => setLoad({ mode: 'fixed', weightsKg: (load as Extract<EquipmentLoad, { mode: 'fixed' }>).weightsKg.filter((_, j) => j !== i) })}
                          title={tt('health.fill.load.remove', 'Remove')}
                          className="rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1 text-[12px] text-[var(--accent)]"
                        >
                          {w} kg ×
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <NumberField
                        step={0.5}
                        min={0}
                        inputMode="decimal"
                        widthClass="w-28"
                        value={text}
                        onChange={setText}
                        placeholder={tt('health.fill.load.add', 'add a weight')}
                        onEnter={() => {
                          if (!text.trim()) return;
                          const n = Number(text);
                          if (Number.isFinite(n) && n > 0) {
                            setLoad({ mode: 'fixed', weightsKg: [...(load as Extract<EquipmentLoad, { mode: 'fixed' }>).weightsKg, n] });
                            setText('');
                          }
                        }}
                      />
                      <span className="text-[11px] text-[var(--text-muted)]">{tt('health.fill.load.add_hint', 'type a weight, press Enter')}</span>
                    </div>
                  </div>
                )}

                {/* What they just described, in the words the plan will use.
                    Shows the ceiling, which is the number people are usually
                    surprised by: 2.5–24 in 2.5s tops out at 22.5, not 24. */}
                <div className="text-[11px] text-[var(--text-muted)]">
                  {describeLoad(def.loadSlug ?? '', coerceLoad(load) ?? undefined)
                    ?? tt('health.fill.load.invalid', 'That range cannot make any weight — check the numbers.')}
                </div>
              </div>
              <Actions onSave={() => send(coerceLoad(load))} onSkip={skip} disabled={!coerceLoad(load)} />
            </>
          )}

          {/* — Time (training window, meal times) — */}
          {def.control === 'time' && (
            <>
              <TimeInput value={text || null} onChange={(v) => setText(v ?? '')} />
              <Actions onSave={() => send(text)} onSkip={skip} disabled={!text} />
            </>
          )}

          {/* — Date (date_of_birth) — */}
          {def.control === 'date' && (
            <>
              <input
                type="date"
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="rounded-lg border border-[var(--border)] bg-transparent px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
              />
              <Actions onSave={() => send(text)} onSkip={skip} disabled={!text} />
            </>
          )}

          {/* — Text (weekly_focus, injuries) — */}
          {def.control === 'text' && (
            <>
              {def.multiline ? (
                <textarea
                  rows={2}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={field === 'injuries' ? t('health.fill.injuries_placeholder') : t('health.fill.text_placeholder')}
                  className="w-full resize-y rounded-lg border border-[var(--border)] bg-transparent px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                  autoFocus
                />
              ) : (
                <input
                  type="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={t('health.fill.text_placeholder')}
                  className="w-full rounded-lg border border-[var(--border)] bg-transparent px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                  onKeyDown={(e) => { if (e.key === 'Enter') send(text); }}
                  autoFocus
                />
              )}
              <Actions onSave={() => send(text)} onSkip={skip} />
            </>
          )}
        </div>
      )}

      {/* Completed / denied */}
      {isCompleted && toolCall.result && (
        <div className="px-3.5 pb-2.5 text-[11px] text-[var(--text-muted)]">✓ {toolCall.result}</div>
      )}
      {isDenied && (
        <div className="px-3.5 pb-2.5 text-[11px] italic text-[var(--text-muted)]">{t('health.fill.skip')}</div>
      )}
    </div>
  );
}

function Actions({ onSave, onSkip, disabled }: { onSave: () => void; onSkip: () => void; disabled?: boolean }) {
  useLocale();
  return (
    <div className="mt-3 flex items-center gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={onSave}
        className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t('health.fill.save')}
      </button>
      <button
        type="button"
        onClick={onSkip}
        className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[12px] text-[var(--text-secondary)] transition hover:border-[var(--accent)]/40"
      >
        {t('health.fill.skip')}
      </button>
    </div>
  );
}
