import { useState, useEffect } from 'react';
import { t, useLocale } from '../i18n';
import { post } from '../App';
import type { PersonalityData } from '../types/messages';

interface Props {
  personality: PersonalityData | null;
}

// ── Option descriptors ─────────────────────────────────────────────────────

function getTones() {
  return [
    { value: 'warm', label: t('dash.personality.tone.warm'), desc: t('dash.personality.tone.warm_desc') },
    { value: 'direct', label: t('dash.personality.tone.direct'), desc: t('dash.personality.tone.direct_desc') },
    { value: 'playful', label: t('dash.personality.tone.playful'), desc: t('dash.personality.tone.playful_desc') },
    { value: 'professional', label: t('dash.personality.tone.professional'), desc: t('dash.personality.tone.professional_desc') },
    { value: 'dry-wit', label: t('dash.personality.tone.dry'), desc: t('dash.personality.tone.dry_desc') },
  ];
}

function getEnergies() {
  return [
    { value: 'calm', label: t('dash.personality.energy.calm'), desc: t('dash.personality.energy.calm_desc') },
    { value: 'enthusiastic', label: t('dash.personality.energy.enthusiastic'), desc: t('dash.personality.energy.enthusiastic_desc') },
    { value: 'measured', label: t('dash.personality.energy.measured'), desc: t('dash.personality.energy.measured_desc') },
    { value: 'excitable', label: t('dash.personality.energy.excitable'), desc: t('dash.personality.energy.excitable_desc') },
  ];
}

function getStyles() {
  return [
    { value: 'concise', label: t('dash.personality.style.concise'), desc: t('dash.personality.style.concise_desc') },
    { value: 'detailed', label: t('dash.personality.style.detailed'), desc: t('dash.personality.style.detailed_desc') },
    { value: 'conversational', label: t('dash.personality.style.conversational'), desc: t('dash.personality.style.conversational_desc') },
    { value: 'structured', label: t('dash.personality.style.structured'), desc: t('dash.personality.style.structured_desc') },
  ];
}

// ── Component ──────────────────────────────────────────────────────────────

export function Personality({ personality }: Props) {
  useLocale();
  const [tone, setTone] = useState('warm');
  const [energy, setEnergy] = useState('enthusiastic');
  const [style, setStyle] = useState('conversational');
  const [description, setDescription] = useState('');
  const [saved, setSaved] = useState(false);

  // Sync from loaded personality
  useEffect(() => {
    if (personality) {
      setTone(personality.tone);
      setEnergy(personality.energy);
      setStyle(personality.style);
      setDescription(personality.description);
    }
  }, [personality]);

  // Request personality on mount
  useEffect(() => {
    post({ type: 'load_personality' });
  }, []);

  const handleSave = () => {
    post({
      type: 'save_personality',
      personality: { name: 'Ava', pronouns: 'she/her', tone, energy, style, description },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleReset = () => {
    post({ type: 'reset_personality' });
  };

  const TONES = getTones();
  const ENERGIES = getEnergies();
  const STYLES = getStyles();
  const toneLabel = TONES.find(x => x.value === tone)?.label?.toLowerCase() ?? tone;
  const energyLabel = ENERGIES.find(x => x.value === energy)?.label?.toLowerCase() ?? energy;
  const styleLabel = STYLES.find(x => x.value === style)?.label?.toLowerCase() ?? style;

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold text-[#cdd6f4]">{t('dash.personality.title')}</h1>
        <p className="mt-1.5 text-[13px] text-[#6c7086]">
          {t('dash.personality.subtitle')}
        </p>
      </div>

      {/* Tone */}
      <Section label={t('dash.personality.tone')}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {TONES.map(t => (
            <OptionCard
              key={t.value}
              label={t.label}
              description={t.desc}
              selected={tone === t.value}
              onClick={() => setTone(t.value)}
            />
          ))}
        </div>
      </Section>

      {/* Energy */}
      <Section label={t('dash.personality.energy')}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ENERGIES.map(e => (
            <OptionCard
              key={e.value}
              label={e.label}
              description={e.desc}
              selected={energy === e.value}
              onClick={() => setEnergy(e.value)}
            />
          ))}
        </div>
      </Section>

      {/* Style */}
      <Section label={t('dash.personality.style')}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {STYLES.map(s => (
            <OptionCard
              key={s.value}
              label={s.label}
              description={s.desc}
              selected={style === s.value}
              onClick={() => setStyle(s.value)}
            />
          ))}
        </div>
      </Section>

      {/* Free-text description */}
      <Section label={t('dash.personality.description')}>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder={t('dash.personality.description_placeholder')}
          rows={3}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] resize-none"
        />
        <p className="mt-1.5 text-xs text-[var(--text-muted)]">
          {t('dash.personality.description_hint')}
        </p>
      </Section>

      {/* Live preview */}
      <div className="mb-8 rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">{t('dash.personality.preview')}</p>
        <p className="text-sm text-white">
          <span className="font-semibold text-[var(--accent)]">Ava</span>{' '}
          {t('dash.personality.will_be', { name: '', tone: toneLabel, energy: energyLabel, style: styleLabel }).trim()}
        </p>
        {description && (
          <p className="mt-2 text-xs text-[var(--text-secondary)] italic">
            &ldquo;{description}&rdquo;
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          className="rounded-lg bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 cursor-pointer"
        >
          {saved ? t('dash.personality.saved') : t('dash.personality.save')}
        </button>
        <button
          onClick={handleReset}
          className="rounded-lg border border-[var(--border)] bg-transparent px-5 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition hover:border-[var(--text-muted)] hover:text-white cursor-pointer"
        >
          {t('dash.personality.reset')}
        </button>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </label>
      {children}
    </div>
  );
}

function OptionCard({
  label,
  description,
  selected,
  onClick,
}: {
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative flex flex-col items-start rounded-xl border p-4 text-left transition cursor-pointer ${
        selected
          ? 'border-[var(--accent)] bg-[var(--accent)]/10 shadow-[0_0_16px_rgba(168,85,247,0.2)]'
          : 'border-[var(--border)] bg-[var(--bg-input)] hover:border-[var(--text-muted)]'
      }`}
    >
      <span className={`text-sm font-semibold ${selected ? 'text-white' : 'text-[var(--text-secondary)] group-hover:text-white'}`}>
        {label}
      </span>
      <span className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
        {description}
      </span>
      {selected && (
        <span className="absolute right-3 top-3 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent)]">
          <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </span>
      )}
    </button>
  );
}
