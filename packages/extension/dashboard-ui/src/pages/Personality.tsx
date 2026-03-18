import { useState, useEffect } from 'react';
import { post } from '../App';
import type { PersonalityData } from '../types/messages';

interface Props {
  personality: PersonalityData | null;
}

// ── Option descriptors ─────────────────────────────────────────────────────

const PRONOUNS = [
  { value: 'she/her', label: 'she / her' },
  { value: 'he/him', label: 'he / him' },
  { value: 'they/them', label: 'they / them' },
];

const TONES = [
  { value: 'warm', label: 'Warm', desc: 'Warm and encouraging \u2014 celebrates wins, genuinely cares' },
  { value: 'direct', label: 'Direct', desc: 'Direct and no-nonsense \u2014 straight to the point' },
  { value: 'playful', label: 'Playful', desc: 'Playful and witty \u2014 uses humour naturally' },
  { value: 'professional', label: 'Professional', desc: 'Professional and polished \u2014 clear, authoritative' },
  { value: 'dry-wit', label: 'Dry Wit', desc: 'Dry wit \u2014 understated brilliance, bone dry humour' },
];

const ENERGIES = [
  { value: 'calm', label: 'Calm', desc: 'Calm and steady \u2014 reassuring, never rushes' },
  { value: 'enthusiastic', label: 'Enthusiastic', desc: 'Enthusiastic \u2014 gets excited when plans come together' },
  { value: 'measured', label: 'Measured', desc: 'Measured and deliberate \u2014 weighs every word' },
  { value: 'excitable', label: 'Excitable', desc: 'Excitable \u2014 high energy, expressive, visibly excited' },
];

const STYLES = [
  { value: 'concise', label: 'Concise', desc: 'Concise \u2014 sharp, no filler, one sentence over three' },
  { value: 'detailed', label: 'Detailed', desc: 'Detailed \u2014 thorough, explains the why' },
  { value: 'conversational', label: 'Conversational', desc: 'Conversational \u2014 natural, talks like a person' },
  { value: 'structured', label: 'Structured', desc: 'Structured \u2014 headers, bullets, everything in its place' },
];

// ── Component ──────────────────────────────────────────────────────────────

export function Personality({ personality }: Props) {
  const [name, setName] = useState('Ava');
  const [pronouns, setPronouns] = useState('she/her');
  const [tone, setTone] = useState('warm');
  const [energy, setEnergy] = useState('enthusiastic');
  const [style, setStyle] = useState('conversational');
  const [description, setDescription] = useState('');
  const [saved, setSaved] = useState(false);

  // Sync from loaded personality
  useEffect(() => {
    if (personality) {
      setName(personality.name);
      setPronouns(personality.pronouns);
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
      personality: { name, pronouns, tone, energy, style, description },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleReset = () => {
    post({ type: 'reset_personality' });
  };

  const toneLabel = TONES.find(t => t.value === tone)?.label?.toLowerCase() ?? tone;
  const energyLabel = ENERGIES.find(e => e.value === energy)?.label?.toLowerCase() ?? energy;
  const styleLabel = STYLES.find(s => s.value === style)?.label?.toLowerCase() ?? style;

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Design Your AI</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Make it yours &mdash; choose a name, personality, and communication style
        </p>
      </div>

      {/* Name */}
      <Section label="Name">
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Ava"
          className="w-full max-w-xs rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-4 py-2.5 text-sm text-white outline-none transition focus:border-[var(--accent)]"
        />
      </Section>

      {/* Pronouns */}
      <Section label="Pronouns">
        <div className="flex gap-2">
          {PRONOUNS.map(p => (
            <button
              key={p.value}
              onClick={() => setPronouns(p.value)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition cursor-pointer ${
                pronouns === p.value
                  ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-white shadow-[0_0_12px_rgba(168,85,247,0.25)]'
                  : 'border-[var(--border)] bg-[var(--bg-input)] text-[var(--text-secondary)] hover:border-[var(--text-muted)] hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </Section>

      {/* Tone */}
      <Section label="Tone">
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
      <Section label="Energy">
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
      <Section label="Communication Style">
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
      <Section label="Description">
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="e.g. Like a patient older brother who's been coding for 20 years"
          rows={3}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] resize-none"
        />
        <p className="mt-1.5 text-xs text-[var(--text-muted)]">
          Optional. Describe the vibe in your own words and your AI will embody it.
        </p>
      </Section>

      {/* Live preview */}
      <div className="mb-8 rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Preview</p>
        <p className="text-sm text-white">
          <span className="font-semibold text-[var(--accent)]">{name || 'Ava'}</span>{' '}
          will be {toneLabel}, {energyLabel}, and {styleLabel}.
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
          {saved ? 'Saved!' : 'Save Personality'}
        </button>
        <button
          onClick={handleReset}
          className="rounded-lg border border-[var(--border)] bg-transparent px-5 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition hover:border-[var(--text-muted)] hover:text-white cursor-pointer"
        >
          Reset to Default
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
