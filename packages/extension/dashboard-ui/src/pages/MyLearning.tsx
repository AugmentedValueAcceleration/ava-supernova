import { useEffect, useState } from 'react';
import { tt, useLocale } from '../i18n';
import { post } from '../App';
import { Learning } from './Learning';
import { Progression } from './Progression';
import type { DashboardLearningCurriculum, LearnerProfilePayload } from '../types/messages';

/**
 * My Learning — the "your stuff" half of the Learning room, split into two inner
 * sub-tabs: Progression (the learner profile / CV) and My Courses (the existing
 * course list + LessonPlayer). The outer "Courses" tab stays "discover"; this is
 * "yours". Rendered by LearningRoom's `my-learning` tab.
 */

type Inner = 'progression' | 'courses';

interface Props {
  curriculums: DashboardLearningCurriculum[];
  loaded: boolean;
  profilePayload: LearnerProfilePayload | null;
  userName?: string | null;
  userAvatarUrl?: string | null;
  onSetActive?: (id: string) => void;
  onGoToAva?: () => void;
}

export function MyLearning({ curriculums, loaded, profilePayload, userName, userAvatarUrl, onSetActive, onGoToAva }: Props) {
  useLocale();
  const [inner, setInner] = useState<Inner>('progression');

  // Refresh the profile when entering Progression so a just-finished course's
  // skills/certs appear without a manual reload (cheap local-first read).
  useEffect(() => { if (inner === 'progression') post({ type: 'load_learning_profile' }); }, [inner]);

  return (
    <div className="space-y-4">
      {/* Inner sub-tab pills */}
      <div className="flex items-center gap-1">
        {(['progression', 'courses'] as Inner[]).map((key) => {
          const active = inner === key;
          const label = key === 'progression' ? tt('learning.tab.progression', 'Progression') : tt('learning.tab.my_courses', 'My Courses');
          return (
            <button
              key={key}
              onClick={() => setInner(key)}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition ${
                active
                  ? 'border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)]'
                  : 'border border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {inner === 'progression'
        ? <Progression payload={profilePayload} userName={userName} userAvatarUrl={userAvatarUrl} />
        : <Learning curriculums={curriculums} loaded={loaded} onSetActive={onSetActive} onGoToAva={onGoToAva} />}
    </div>
  );
}
