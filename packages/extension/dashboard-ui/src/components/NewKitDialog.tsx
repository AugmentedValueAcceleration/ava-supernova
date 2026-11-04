import { useState } from 'react';
import { tt } from '../i18n';
import { Select } from './Select';

// ─── Starting a brand kit ──────────────────────────────────────────────────────
//
// A kit is chosen for a project when it's created. From here Ava reads the
// project, researches, and proposes the kit for them to question and agree.
// Starting blank stays available for someone who'd rather fill it in by hand.

export interface KnownProject { path: string; name: string }

export function NewKitDialog({ projects, current, onWithAva, onBlank, onClose }: {
  projects: KnownProject[];
  current: string | null;
  onWithAva: (project: KnownProject | null) => void;
  onBlank: (project: KnownProject | null) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState(current ?? '');
  const project = projects.find((p) => p.path === picked) ?? null;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center px-6" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div className="w-full max-w-[420px] rounded-xl border border-[var(--border-card)] p-5 flex flex-col gap-3" style={{ background: 'rgba(17,12,26,0.99)' }} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[14px] text-[var(--text-primary)]">{tt('ext.studio.kit_new_title', 'New brand kit')}</h3>
        <div>
          <label className="text-[11px] text-[var(--text-muted)] block mb-1.5">{tt('ext.studio.kit_new_project', 'Which project is it for?')}</label>
          <Select
            size="sm"
            value={picked}
            onChange={setPicked}
            options={[{ value: '', label: tt('ext.studio.kit_new_no_project', 'No project yet') }, ...projects.map((p) => ({ value: p.path, label: p.name }))]}
          />
        </div>
        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
          {tt('ext.studio.kit_new_hint', 'Ava reads the project, works out what it is, researches, and puts a kit in front of you to question and agree.')}
        </p>
        <div className="flex items-center gap-2">
          <button onClick={() => onWithAva(project)} className="px-3 py-1.5 rounded-md text-[11px] font-medium text-white transition hover:brightness-110" style={{ background: 'var(--accent)' }}>
            {tt('ext.studio.kit_new_with_ava', 'Make it with Ava')}
          </button>
          <button onClick={() => onBlank(project)} className="px-3 py-1.5 rounded-md text-[11px] border border-[var(--border-card)] text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]">
            {tt('ext.studio.kit_new_blank', 'Start blank')}
          </button>
          <button onClick={onClose} className="ml-auto px-3 py-1.5 rounded-md text-[11px] text-[var(--text-muted)] transition hover:text-[var(--text-primary)]">
            {tt('library.cancel', 'Cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
