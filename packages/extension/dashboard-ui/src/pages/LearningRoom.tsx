import { useState, useEffect, useRef } from 'react';
import { t, useLocale } from '../i18n';
import { post } from '../App';
import { Chat } from './Chat';
import { CoursePath } from './CoursePath';
import { LearningLibrary } from './LearningLibrary';
import { MyLearning } from './MyLearning';
import type {
  ExtToDashboardMessage,
  LibraryPath,
  LibraryPathDetail,
  DashboardLearningCurriculum,
  LearnerProfilePayload,
  Page,
} from '../types/messages';

/**
 * Learning room — the consolidated home for everything learning, built like the
 * Health room. Three tabs:
 *   - Courses     → the catalogue (LearningLibrary), moved out of the Library page.
 *   - My Learning → enrolled curriculums + interactive lessons (Learning + LessonPlayer),
 *                   moved out of the Planner.
 *   - Ava         → a focused <Chat lane="learning"> running in Teach mode, where Ava
 *                   builds a course, activates it, and teaches it. Main chat hands off here.
 *
 * The Ava tab is always-mounted (hidden off-tab) so its conversation survives tab
 * switches; it drives its own lane (surface:'learning'), separate from the main chat.
 */

type Tab = 'courses' | 'my-learning' | 'ava';

interface Props {
  // Courses tab → LearningLibrary
  paths: LibraryPath[];
  pathDetail: LibraryPathDetail | null;
  onNavigate: (page: Page) => void;
  // My Learning tab → MyLearning (Progression + My Courses)
  learningCurriculums: DashboardLearningCurriculum[];
  learningLoaded: boolean;
  learnerProfile: LearnerProfilePayload | null;
  // Ava tab → <Chat lane="learning">
  onRegisterLearningChatDispatch: (fn: (msg: ExtToDashboardMessage) => void) => void;
  userName?: string | null;
  userAvatarUrl?: string | null;
  // Deep-link (e.g. main-chat handoff opens the Ava tab)
  initialTab: Tab | null;
  onConsumeInitialTab: () => void;
}

export function LearningRoom({
  paths, pathDetail, onNavigate,
  learningCurriculums, learningLoaded, learnerProfile,
  onRegisterLearningChatDispatch, userName, userAvatarUrl,
  initialTab, onConsumeInitialTab,
}: Props) {
  useLocale();
  const [tab, setTab] = useState<Tab>('courses');

  // The single active course drives the Ava-tab chat thread (keyed by it) and
  // the course-path sidebar. Enforced single-active upstream.
  const activeCourse = learningCurriculums.find((c) => c.status === 'active');
  const activeCourseId = activeCourse?.id;

  // Thread adoption (lobby → first course): when the active course appears where
  // there was none (Ava just built the first course mid-chat), carry the lobby
  // conversation over to the new course's thread so it isn't lost on remount.
  // Done synchronously in render (before the re-keyed Chat mounts) with a guard.
  const prevActiveRef = useRef<string | undefined>(activeCourseId);
  if (prevActiveRef.current !== activeCourseId) {
    if (!prevActiveRef.current && activeCourseId) {
      try {
        const lobby = sessionStorage.getItem('ava-learning-room-messages');
        const destKey = `ava-learning:${activeCourseId}-room-messages`;
        if (lobby && !sessionStorage.getItem(destKey)) {
          sessionStorage.setItem(destKey, lobby);
          sessionStorage.removeItem('ava-learning-room-messages');
        }
      } catch { /* sessionStorage unavailable */ }
    }
    prevActiveRef.current = activeCourseId;
  }

  // Deep-link consume-once — the handoff seeds 'ava'.
  useEffect(() => {
    if (initialTab) { setTab(initialTab); onConsumeInitialTab(); }
  }, [initialTab, onConsumeInitialTab]);

  // Re-fire loads when entering My Learning so a curriculum/skill just created
  // in the Ava room appears without a manual refresh. Cheap local-first reads.
  useEffect(() => {
    if (tab === 'my-learning') { post({ type: 'load_learning' }); post({ type: 'load_learning_profile' }); }
  }, [tab]);

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-5">
        <div>
          <h1 className="text-[22px] font-light text-vscode-foreground">{t('learning.room.title')}</h1>
          <p className="mt-1 text-[12px] text-vscode-descriptionForeground">{t('learning.room.intro')}</p>
        </div>

        {/* Top tabs — canonical dashboard style (border-b-2 + --accent var). */}
        <div className="mt-5 flex items-end gap-0.5 border-b border-[var(--border)]">
          {(['courses', 'my-learning', 'ava'] as Tab[]).map((tabKey) => {
            const isActive = tab === tabKey;
            const label =
              tabKey === 'courses' ? t('learning.room.tab.courses') :
              tabKey === 'my-learning' ? t('learning.room.tab.my_learning') :
              t('learning.room.tab.ava');
            return (
              <button
                key={tabKey}
                onClick={() => setTab(tabKey)}
                className={`-mb-px border-b-2 border-x-0 border-t-0 bg-transparent px-4 py-2 text-xs transition cursor-pointer ${
                  isActive
                    ? 'border-[var(--accent)] text-[var(--accent)] font-semibold'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content area. The Ava room owns its own scroll (full-bleed); the browse
          tabs keep the padded, scrolling layout. */}
      <div className={`flex-1 min-h-0 ${tab === 'ava' ? 'overflow-hidden' : 'overflow-y-auto px-6 py-5'}`}>
        {/* Ava Learning room — ALWAYS mounted (hidden off-tab) so its conversation
            survives switching tabs. Its own lane: sends surface:'learning', host
            events tagged lane:'learning' route here, never the main chat. */}
        <div className={`h-full flex-col ${tab === 'ava' ? 'flex' : 'hidden'}`}>
          {/* Chat (active course's thread) + the course-path sidebar. The Chat is
              keyed by the active course so it remounts + loads that course's saved
              conversation when the active course changes. */}
          <div className="min-h-0 flex-1 flex">
            <div className="min-w-0 flex-1">
              <Chat
                key={`learning-${activeCourseId ?? 'lobby'}`}
                lane="learning"
                courseId={activeCourseId}
                onRegisterDispatch={onRegisterLearningChatDispatch}
                isActive={tab === 'ava'}
                userName={userName}
                userAvatarUrl={userAvatarUrl}
              />
            </div>
            <CoursePath curriculum={activeCourse ?? null} />
          </div>
        </div>
        {tab === 'courses' && (
          <LearningLibrary paths={paths} detail={pathDetail} onNavigate={onNavigate} />
        )}
        {tab === 'my-learning' && (
          <MyLearning
            curriculums={learningCurriculums}
            loaded={learningLoaded}
            profilePayload={learnerProfile}
            userName={userName}
            userAvatarUrl={userAvatarUrl}
            onSetActive={(id) => { post({ type: 'set_active_course', id }); setTab('ava'); }}
            onGoToAva={() => setTab('ava')}
          />
        )}
      </div>
    </div>
  );
}
