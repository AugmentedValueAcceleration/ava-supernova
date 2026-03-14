import { useState, useCallback, useRef, useEffect } from 'react';
import type { TodayTaskUI, SessionTaskUI } from '../types/messages';

type Tab = 'personal' | 'ava';

interface TasksPanelProps {
  todayTasks: TodayTaskUI[];
  sessionTasks: SessionTaskUI[];
  onClose: () => void;
  onToggleTask: (taskId: string) => void;
}

export function TasksPanel({
  todayTasks,
  sessionTasks,
  onClose,
  onToggleTask,
}: TasksPanelProps) {
  const [tab, setTab] = useState<Tab>('personal');
  const panelRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Auto-switch to Ava tab when session tasks appear
  useEffect(() => {
    if (sessionTasks.length > 0 && tab === 'personal' && todayTasks.length === 0) {
      setTab('ava');
    }
  }, [sessionTasks.length, tab, todayTasks.length]);

  const activeTasks = todayTasks.filter(t => t.status !== 'done');
  const doneTasks = todayTasks.filter(t => t.status === 'done');
  const completedSession = sessionTasks.filter(t => t.status === 'completed').length;

  return (
    <div
      ref={panelRef}
      className="flex flex-col h-full"
      style={{
        minWidth: 230,
        maxWidth: 280,
        width: 260,
        borderLeft: '1px solid rgba(168, 85, 247, 0.12)',
        background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(168, 85, 247, 0.04) 0%, transparent 70%), var(--vscode-sideBar-background)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2.5 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(168, 85, 247, 0.12)' }}
      >
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="opacity-50">
            <path d="M3.75 4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM6 3.5h8v1H6v-1zm-2.25 5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM6 7.5h8v1H6v-1zm-2.25 5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM6 11.5h8v1H6v-1z"/>
          </svg>
          <span className="text-xs font-semibold">Today</span>
        </div>
        <button
          onClick={onClose}
          title="Close"
          className="flex items-center justify-center w-6 h-6 rounded-lg
                     hover:bg-white/[0.06]
                     text-[var(--vscode-foreground)] opacity-50 hover:opacity-100
                     bg-transparent border-none cursor-pointer transition"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z"/>
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex" style={{ borderBottom: '1px solid rgba(168, 85, 247, 0.08)' }}>
        <button
          onClick={() => setTab('personal')}
          className={`flex-1 px-3 py-2 text-[11px] font-medium border-none cursor-pointer transition-all
            ${tab === 'personal'
              ? 'text-[var(--vscode-foreground)] opacity-90'
              : 'text-[var(--vscode-foreground)] opacity-40 hover:opacity-60 bg-transparent'
            }`}
          style={{
            background: tab === 'personal' ? 'transparent' : 'transparent',
            borderBottom: tab === 'personal' ? '2px solid #A855F7' : '2px solid transparent',
          }}
        >
          Personal
          {todayTasks.length > 0 && (
            <span className="ml-1.5 text-[9px] opacity-50">
              {activeTasks.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('ava')}
          className={`flex-1 px-3 py-2 text-[11px] font-medium border-none cursor-pointer transition-all
            ${tab === 'ava'
              ? 'text-[var(--vscode-foreground)] opacity-90'
              : 'text-[var(--vscode-foreground)] opacity-40 hover:opacity-60 bg-transparent'
            }`}
          style={{
            background: 'transparent',
            borderBottom: tab === 'ava' ? '2px solid #A855F7' : '2px solid transparent',
          }}
        >
          Ava
          {sessionTasks.length > 0 && (
            <span className="ml-1.5 text-[9px] opacity-50">
              {completedSession}/{sessionTasks.length}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'personal' ? (
          <PersonalTab
            activeTasks={activeTasks}
            doneTasks={doneTasks}
            onToggleTask={onToggleTask}
          />
        ) : (
          <AvaTab
            sessionTasks={sessionTasks}
            completedSession={completedSession}
          />
        )}
      </div>
    </div>
  );
}

// ── Personal Tab ──────────────────────────────────────────────────────────────

function PersonalTab({
  activeTasks,
  doneTasks,
  onToggleTask,
}: {
  activeTasks: TodayTaskUI[];
  doneTasks: TodayTaskUI[];
  onToggleTask: (id: string) => void;
}) {
  if (activeTasks.length === 0 && doneTasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full opacity-30 text-xs gap-2 px-4 text-center">
        <svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor" className="opacity-40">
          <path d="M3.75 4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM6 3.5h8v1H6v-1zm-2.25 5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM6 7.5h8v1H6v-1zm-2.25 5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM6 11.5h8v1H6v-1z"/>
        </svg>
        <span>No tasks for today</span>
        <span className="text-[10px] opacity-60">Add tasks in the dashboard</span>
      </div>
    );
  }

  return (
    <div className="px-2 pt-2 pb-3">
      {activeTasks.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {activeTasks.map(task => (
            <TaskItem key={task.id} task={task} onToggle={() => onToggleTask(task.id)} />
          ))}
        </div>
      )}

      {doneTasks.length > 0 && (
        <>
          {activeTasks.length > 0 && (
            <div className="mx-1 my-2" style={{ borderTop: '1px solid rgba(168, 85, 247, 0.06)' }} />
          )}
          <div className="text-[9px] uppercase tracking-wider opacity-25 px-2 mb-1">
            Completed
          </div>
          <div className="flex flex-col gap-0.5">
            {doneTasks.map(task => (
              <TaskItem key={task.id} task={task} onToggle={() => onToggleTask(task.id)} done />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Ava Tab ───────────────────────────────────────────────────────────────────

function AvaTab({
  sessionTasks,
  completedSession,
}: {
  sessionTasks: SessionTaskUI[];
  completedSession: number;
}) {
  if (sessionTasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full opacity-30 text-xs gap-2 px-4 text-center">
        <svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor" className="opacity-40">
          <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 13A6 6 0 1 1 8 2a6 6 0 0 1 0 12zm1-9H7v4.414l2.293 2.293.707-.707L8.5 9V5z"/>
        </svg>
        <span>No active session</span>
        <span className="text-[10px] opacity-60">Ava's progress shows here while working</span>
      </div>
    );
  }

  const allDone = completedSession === sessionTasks.length;

  return (
    <div className="px-2 pt-2 pb-3">
      {/* Progress bar */}
      <div className="px-2 mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] opacity-40">
            {allDone ? 'All tasks complete' : `Step ${completedSession + 1} of ${sessionTasks.length}`}
          </span>
          <span className="text-[10px] opacity-30">
            {Math.round((completedSession / sessionTasks.length) * 100)}%
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full" style={{ background: 'rgba(168, 85, 247, 0.1)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${(completedSession / sessionTasks.length) * 100}%`,
              background: allDone ? '#34d399' : '#A855F7',
            }}
          />
        </div>
      </div>

      {/* Task list */}
      <div className="flex flex-col gap-0.5">
        {sessionTasks.map(task => (
          <SessionItem key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}

// ── Task Item ─────────────────────────────────────────────────────────────────

const PRIORITY_STYLES: Record<string, { bg: string; text: string }> = {
  urgent: { bg: 'rgba(239,68,68,0.12)', text: '#ef4444' },
  high: { bg: 'rgba(245,158,11,0.12)', text: '#f59e0b' },
};

function TaskItem({ task, onToggle, done }: { task: TodayTaskUI; onToggle: () => void; done?: boolean }) {
  const style = PRIORITY_STYLES[task.priority];

  return (
    <div
      className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.04] transition cursor-pointer"
      onClick={onToggle}
    >
      <div
        className={`flex items-center justify-center w-4 h-4 rounded-full border flex-shrink-0 transition
          ${done
            ? 'border-emerald-400/50 text-emerald-400'
            : 'border-white/[0.15] text-transparent group-hover:border-white/[0.3] group-hover:text-white/[0.15]'
          }`}
        style={{ fontSize: 9 }}
      >
        ✓
      </div>

      <span className={`text-xs flex-1 truncate transition ${done ? 'line-through opacity-30' : 'opacity-80'}`}>
        {task.title}
      </span>

      {style && !done && (
        <span
          className="text-[9px] px-1.5 py-0 rounded-full font-medium flex-shrink-0"
          style={{ backgroundColor: style.bg, color: style.text }}
        >
          {task.priority}
        </span>
      )}
    </div>
  );
}

// ── Session Item ──────────────────────────────────────────────────────────────

function SessionItem({ task }: { task: SessionTaskUI }) {
  const isDone = task.status === 'completed';
  const isActive = task.status === 'in_progress';

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition">
      <span
        className={`flex items-center justify-center w-4 h-4 flex-shrink-0 text-[11px]
          ${isDone ? 'text-emerald-400' : isActive ? '' : 'opacity-25'}`}
        style={isActive ? { color: '#A855F7' } : undefined}
      >
        {isDone ? '✓' : isActive ? '⟳' : '○'}
      </span>

      <span
        className={`text-xs flex-1 truncate
          ${isDone ? 'line-through opacity-30' : isActive ? 'opacity-90 font-medium' : 'opacity-50'}`}
      >
        {task.title}
      </span>
    </div>
  );
}
