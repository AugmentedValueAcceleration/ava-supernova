import { useState } from 'react';
import { useLocale } from '../i18n';
import { Tasks } from './Tasks';
import { Journal } from './Journal';
import { Learning } from './Learning';
import type { DashboardTaskEntry, DashboardJournalDay, DashboardLearningCurriculum } from '../types/messages';

type PlannerTab = 'tasks' | 'journal' | 'learning';

interface SessionTask {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
}

interface PlannerProps {
  tasks: DashboardTaskEntry[];
  sessionTasks?: SessionTask[];
  journalDay: DashboardJournalDay | null;
  journalDate: string;
  userName: string | null;
  onSaveJournalEntry: (date: string, content: string, mood?: number, tags?: string[]) => void;
  onDeleteUserEntry?: (date: string) => void;
  onDeleteAvaEntry?: (date: string) => void;
  learningCurriculums: DashboardLearningCurriculum[];
}

const TABS: { key: PlannerTab; icon: string }[] = [
  { key: 'tasks', icon: '\u2713' },
  { key: 'journal', icon: '\u270E' },
  { key: 'learning', icon: '\u2605' },
];

const TAB_LABELS: Record<PlannerTab, string> = {
  tasks: 'Tasks',
  journal: 'Journal',
  learning: 'Learning',
};

export function Planner({
  tasks, sessionTasks,
  journalDay, journalDate, userName, onSaveJournalEntry, onDeleteUserEntry, onDeleteAvaEntry,
  learningCurriculums,
}: PlannerProps) {
  useLocale();
  const [activeTab, setActiveTab] = useState<PlannerTab>('tasks');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-white">Planner</h1>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">Tasks, reflections, and learning paths</p>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-[var(--border-card)] pb-px">
        {TABS.map(({ key, icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-3 pb-2 pt-1 text-xs font-medium transition ${
              activeTab === key
                ? 'border-b-2 border-[var(--accent)] text-white'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            <span className="text-[11px]">{icon}</span>
            {TAB_LABELS[key]}
            {key === 'tasks' && tasks.filter(t => t.status === 'todo' || t.status === 'in-progress').length > 0 && (
              <span className="ml-1 rounded-full bg-[var(--accent)]/15 px-1.5 text-[10px] text-[var(--accent)]">
                {tasks.filter(t => t.status === 'todo' || t.status === 'in-progress').length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'tasks' && (
        <Tasks tasks={tasks} sessionTasks={sessionTasks} />
      )}

      {activeTab === 'journal' && (
        <Journal
          day={journalDay}
          selectedDate={journalDate}
          userName={userName}
          onSaveUserEntry={onSaveJournalEntry}
          onDeleteUserEntry={onDeleteUserEntry}
          onDeleteAvaEntry={onDeleteAvaEntry}
        />
      )}

      {activeTab === 'learning' && (
        <Learning curriculums={learningCurriculums} />
      )}
    </div>
  );
}
