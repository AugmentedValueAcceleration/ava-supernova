import { useEffect, useState } from 'react';
import { t, tt, useLocale } from '../i18n';
import { post } from '../App';
import { GeneralProfilePage } from './GeneralProfilePage';
import { HealthProfilePage } from './HealthProfilePage';
import type {
  GeneralProfile, HealthProfile, HealthTaxonomies, Page,
  ProfileArea, ProfileOverviewSection,
} from '../types/messages';

/**
 * The Profile page (plan 2026-11-27-profile-index, Part 2). Mirrors the IDE's
 * ProfilePage in DashboardPages.tsx: keep the two in step.
 *
 * One place for what Ava knows about the person. Each area shows the exact
 * line in her index and what profile_lookup would hand her, so nothing she
 * knows is hidden, plus the switch that keeps an area to its own room.
 * The general profile moved here from Settings, and the health profile from
 * Health's own tab, so every field is edited in one place.
 */

export type ProfileTab = 'about' | 'health' | 'learning' | 'projects';

interface Props {
  overview: ProfileOverviewSection[] | null;
  initialTab?: ProfileTab | null;
  onConsumeInitialTab?: () => void;
  generalProfile: GeneralProfile | null;
  avatarDataUrl?: string;
  onSaveGeneralProfile: (next: GeneralProfile) => void;
  healthProfile: HealthProfile | null;
  taxonomies: HealthTaxonomies | null;
  onSaveHealthProfile: (next: HealthProfile) => void;
  onLoadTaxonomies: () => void;
  onNavigate: (page: Page) => void;
}

const AREA_LABEL: Record<ProfileArea, () => string> = {
  learning: () => tt('profile.area.learning', 'Learning'),
  training: () => tt('profile.area.training', 'Training'),
  eating: () => tt('profile.area.eating', 'Eating'),
  projects: () => tt('profile.area.projects', 'Projects'),
};

/** Where a section kept to its room can still be seen. Projects have no room. */
const AREA_ROOM: Partial<Record<ProfileArea, () => string>> = {
  learning: () => tt('profile.room.learning', 'the Learning room and Teach mode'),
  training: () => tt('profile.room.health', 'Health & Nutrition'),
  eating: () => tt('profile.room.health', 'Health & Nutrition'),
};

function AreaCard({ s }: { s: ProfileOverviewSection }) {
  useLocale();
  const [open, setOpen] = useState(false);
  const room = AREA_ROOM[s.section];
  const kept = s.visibility === 'room';
  const set = (visibility: 'everywhere' | 'room') => {
    if (visibility !== s.visibility) post({ type: 'set_profile_visibility', section: s.section, visibility });
  };
  return (
    <div className="rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-[var(--text-primary)]">{AREA_LABEL[s.section]()}</div>
          <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{tt('profile.sees', 'What Ava keeps in view')}</div>
        </div>
        {room && (
          <div className="flex items-center gap-2" role="group" aria-label={tt('profile.switch.label', 'Ava can see this')}>
            <span className="text-[11px] text-[var(--text-muted)]">{tt('profile.switch.label', 'Ava can see this')}</span>
            <div className="flex rounded-md border border-[var(--border-card)] p-0.5">
              {(['everywhere', 'room'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => set(v)}
                  aria-pressed={s.visibility === v}
                  className={`rounded px-2.5 py-1 text-[11px] font-medium transition ${s.visibility === v ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
                >
                  {v === 'everywhere' ? tt('profile.switch.everywhere', 'Everywhere') : tt('profile.switch.room', 'Only in its room')}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className={`mt-3 rounded-md bg-[var(--bg-input)] px-3 py-2 font-mono text-[12px] leading-relaxed ${kept ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-secondary)]'}`}>
        {s.line ?? <span className="font-sans not-italic no-underline">{tt('profile.nothing', 'Nothing recorded yet.')}</span>}
      </div>
      {kept && room && (
        <p className="mt-2 text-[11px] text-[var(--text-muted)]">{t('profile.switch.room_hint', { room: room() })}</p>
      )}
      {s.line && (
        <>
          <button onClick={() => setOpen((o) => !o)} className="mt-2 text-[11px] text-[var(--accent)] hover:underline">
            {open ? tt('profile.detail.hide', 'Hide what she can look up') : tt('profile.detail.show', 'Show what she can look up')}
          </button>
          {open && (
            <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-[var(--border-card)] p-3 text-[11px] leading-relaxed text-[var(--text-secondary)]">{s.detail}</pre>
          )}
        </>
      )}
    </div>
  );
}

export function ProfilePage(props: Props) {
  useLocale();
  const { overview, generalProfile, healthProfile, onNavigate } = props;
  const [tab, setTab] = useState<ProfileTab>(props.initialTab ?? 'about');
  // A deep link (Health's "Profile" tab, For you's "set your goals") lands on
  // its tab once; a later sidebar visit opens on About you.
  useEffect(() => {
    if (props.initialTab) { setTab(props.initialTab); props.onConsumeInitialTab?.(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.initialTab]);

  // The lines are built from the same files the editors save, so re-read them
  // after every save: what the page shows is always what Ava sees now.
  useEffect(() => { post({ type: 'load_profile_overview' }); }, [generalProfile, healthProfile]);

  const area = (a: ProfileArea) => overview?.find((s) => s.section === a);
  const cards = (areas: ProfileArea[]) => (
    <div className="space-y-3">
      {overview === null
        ? <div className="text-[12px] text-[var(--text-muted)]">{tt('profile.loading', 'Reading your profile…')}</div>
        : areas.map((a) => { const s = area(a); return s ? <AreaCard key={a} s={s} /> : null; })}
    </div>
  );
  const firstName = generalProfile?.display_name?.trim().split(/\s+/)[0];

  const tabs: Array<{ key: ProfileTab; label: string }> = [
    { key: 'about', label: tt('profile.tab.about', 'About you') },
    { key: 'health', label: tt('profile.tab.health', 'Training & eating') },
    { key: 'learning', label: tt('profile.tab.learning', 'Learning') },
    { key: 'projects', label: tt('profile.tab.projects', 'Projects') },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] font-semibold text-[#cdd6f4]">
          {firstName ? t('general.profile.account_tab_named', { name: firstName }) : t('general.profile.account_tab')}
        </h1>
        <p className="mt-1.5 text-[13px] text-[#6c7086]">{tt('profile.subtitle', 'What Ava knows about you, and where she can see it.')}</p>
      </div>

      <div className="flex items-center gap-1 border-b border-[var(--border-card)] pb-px">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 pb-2 pt-1 text-xs font-medium transition ${tab === key ? 'border-b-2 border-[var(--accent)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'about' && (
        <GeneralProfilePage profile={generalProfile} avatarDataUrl={props.avatarDataUrl} onSave={props.onSaveGeneralProfile} />
      )}

      {tab === 'health' && (
        <div className="space-y-6">
          {cards(['training', 'eating'])}
          <HealthProfilePage profile={healthProfile} taxonomies={props.taxonomies} onSave={props.onSaveHealthProfile} onLoadTaxonomies={props.onLoadTaxonomies} />
        </div>
      )}

      {tab === 'learning' && (
        <div className="space-y-3">
          {cards(['learning'])}
          <p className="text-[12px] text-[var(--text-muted)]">
            {tt('profile.learning.note', 'Your courses and skills are managed in the Learning room.')}{' '}
            <button onClick={() => onNavigate('learning-room')} className="text-[var(--accent)] hover:underline">{tt('profile.open_learning', 'Open Learning')}</button>
          </p>
        </div>
      )}

      {tab === 'projects' && (
        <div className="space-y-3">
          {cards(['projects'])}
          <p className="text-[12px] text-[var(--text-muted)]">
            {tt('profile.projects.note', 'Projects come from Ava’s memory of your work, so they are managed on the Memory page.')}{' '}
            <button onClick={() => onNavigate('memory')} className="text-[var(--accent)] hover:underline">{tt('profile.open_memory', 'Open Memory')}</button>
          </p>
        </div>
      )}
    </div>
  );
}
