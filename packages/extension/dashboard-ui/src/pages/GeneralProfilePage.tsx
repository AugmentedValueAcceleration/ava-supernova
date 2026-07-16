import { useEffect, useRef, useState } from 'react';
import { t, useLocale } from '../i18n';
import type { GeneralProfile } from '../types/messages';
import { Select } from '../components/Select';
// DateField was defined here; it now lives in components/DateField.tsx so the
// Tasks overlay and this page share one implementation instead of two copies.
// `sm` keeps this page's compact register unchanged.
import { DateField } from '../components/DateField';
import { Section, FieldGrid, Field, NumberInput, HeightField, WeightField, inputCls } from './ProfilePrimitives';

/**
 * General profile editor — identity + body basics (name, DOB, sex, height,
 * weight, body fat, units). The General sub-tab of "{name}'s profile" in the
 * Account page. Local-first: changes autosave to <scopedDir>/general.json via
 * the host. Split out of HealthProfilePage on 2026-06-21 — this data is reusable
 * beyond health, so it lives at account level.
 */

const SEX_OPTIONS: Array<{ value: GeneralProfile['sex']; labelKey: string }> = [
  { value: 'female', labelKey: 'health.profile.sex.female' },
  { value: 'male', labelKey: 'health.profile.sex.male' },
  { value: 'other', labelKey: 'health.profile.sex.other' },
];

interface Props {
  profile: GeneralProfile | null;
  /** Account display name (from auth) — shown as the placeholder when the
   *  user hasn't set an explicit display_name override. */
  accountName?: string | null;
  onSave: (next: GeneralProfile) => void;
}

export function GeneralProfilePage({ profile, accountName, onSave }: Props) {
  useLocale();
  const [draft, setDraft] = useState<GeneralProfile | null>(profile);
  useEffect(() => { setDraft(profile); }, [profile]);

  // 600ms debounced autosave — mirrors HealthProfilePage.
  const saveTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!draft || !profile) return;
    if (JSON.stringify(draft) === JSON.stringify(profile)) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => onSave(draft), 600);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [draft, profile, onSave]);

  if (!draft) {
    return <div className="py-12 text-center text-[12px] text-[var(--text-muted)]">{t('health.profile.loading')}</div>;
  }

  const patch = (next: Partial<GeneralProfile>) => setDraft({ ...draft, ...next });

  return (
    <div className="w-full space-y-8 pb-12">
      <div>
        <h2 className="text-[16px] font-medium text-[var(--text-primary)]">{t('general.profile.title')}</h2>
        <p className="mt-1 text-[12px] text-[var(--text-muted)] leading-relaxed max-w-prose">
          {t('general.profile.intro')}
        </p>
      </div>

      <Section title={t('general.profile.identity')} subtitle={t('general.profile.identity_subtitle')}>
        <Field label={t('general.profile.display_name')}>
          <input
            type="text"
            value={draft.display_name ?? ''}
            onChange={e => patch({ display_name: e.target.value || null })}
            placeholder={accountName || t('general.profile.display_name_placeholder')}
            maxLength={60}
            className={inputCls}
          />
        </Field>
        <FieldGrid>
          <Field label={t('health.profile.sex')}>
            <Select
              size="sm"
              value={draft.sex ?? ''}
              onChange={v => patch({ sex: (v as GeneralProfile['sex']) || null })}
              options={[{ value: '', label: '—' }, ...SEX_OPTIONS.map(o => ({ value: o.value as string, label: t(o.labelKey) }))]}
            />
          </Field>
          <Field label={t('health.profile.date_of_birth')}>
            <DateField size="sm" value={draft.date_of_birth ?? null} onChange={v => patch({ date_of_birth: v })} />
          </Field>
        </FieldGrid>
      </Section>

      <Section title={t('general.profile.body')} subtitle={t('general.profile.body_subtitle')}>
        <FieldGrid>
          <Field label={t('health.profile.height')} className="sm:col-span-2">
            <HeightField cm={draft.height_cm} onChange={v => patch({ height_cm: v })} />
          </Field>
          <Field label={t('health.profile.weight')} className="sm:col-span-2">
            <WeightField kg={draft.weight_kg} onChange={v => patch({ weight_kg: v })} />
          </Field>
          <Field label={t('health.profile.body_fat')}>
            {/* Mirror the height/weight unit-sublabel so this input lines up
                with the kg / lbs / st cells beside it instead of floating high. */}
            <div>
              <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-1">%</div>
              <NumberInput value={draft.body_fat_pct} onChange={v => patch({ body_fat_pct: v })} placeholder="—" step={0.1} />
            </div>
          </Field>
        </FieldGrid>
      </Section>
    </div>
  );
}
