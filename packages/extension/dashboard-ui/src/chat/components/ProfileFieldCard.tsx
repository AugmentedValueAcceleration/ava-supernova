import { useState } from 'react';
import type { ToolCallDisplay } from '../../types/messages';
import { t, useLocale } from '../../i18n';
// Shared field registry — same source the host saves from, so "what Ava asks",
// "what this card renders", and "where it saves" never drift. Imported from the
// built core (mirrors the i18n import convention; keeps node-only deps out of
// the browser bundle).
import { HEALTH_PROFILE_FIELDS, humaniseSlug } from '../../../../../core/dist/health/profile-fields.js';
import { TimeInput } from '../../pages/ProfilePrimitives';

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
    : currentValue != null && !Array.isArray(currentValue) ? String(currentValue) : '',
  );

  const send = (value: unknown) =>
    onConfirmation(toolCall.confirmationId!, true, false, undefined, JSON.stringify({ field, value }));
  const skip = () =>
    onConfirmation(toolCall.confirmationId!, true, false, undefined, JSON.stringify({ field, skipped: true }));

  const optLabel = (o: { value: string; labelKey?: string }) => (o.labelKey ? t(o.labelKey) : humaniseSlug(o.value));

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: isPending ? 'color-mix(in srgb, var(--accent) 45%, transparent)' : 'var(--border)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3.5 py-2"
           style={{ background: isPending ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent' }}>
        <span className="text-[13px]">🧩</span>
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

          {/* — Number (height, weight, minutes) — */}
          {def.control === 'number' && (
            <>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  inputMode="numeric"
                  className="w-28 rounded-lg border border-[var(--border)] bg-transparent px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                  onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) send(text.trim()); }}
                  autoFocus
                />
                {def.unit && <span className="text-[12px] text-[var(--text-muted)]">{def.unit}</span>}
              </div>
              <Actions onSave={() => send(text.trim())} onSkip={skip} disabled={!text.trim()} />
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
