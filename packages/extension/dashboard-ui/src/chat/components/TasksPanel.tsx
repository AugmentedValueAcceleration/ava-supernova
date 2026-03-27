import { useState, useCallback, useRef, useEffect } from 'react';
import { t, useLocale } from '../../i18n';
import type { TodayTaskUI, SessionTaskUI, AvaCompletedTaskUI } from '../../types/messages';

type Tab = 'personal' | 'ava';

const MIN_WIDTH = 200;
const MAX_WIDTH = 500;
const DEFAULT_WIDTH = 260;

interface TasksPanelProps {
  todayTasks: TodayTaskUI[];
  allTasks: TodayTaskUI[];
  sessionTasks: SessionTaskUI[];
  avaCompletedTasks: AvaCompletedTaskUI[];
  onClose: () => void;
  onToggleTask: (taskId: string) => void;
  width: number;
  onWidthChange: (width: number) => void;
}

export function TasksPanel({
  todayTasks,
  allTasks,
  sessionTasks,
  avaCompletedTasks,
  onClose,
  onToggleTask,
  width,
  onWidthChange,
}: TasksPanelProps) {
  useLocale();
  const [tab, setTab] = useState<Tab>('personal');
  const panelRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(width);
  const [liveWidth, setLiveWidth] = useState(width);
  const liveWidthRef = useRef(liveWidth);
  const rafRef = useRef<number | null>(null);

  // Sync liveWidth when prop changes (e.g. restored from state)
  useEffect(() => { if (!isDragging.current) { setLiveWidth(width); liveWidthRef.current = width; } }, [width]);

  // ── Escape to close ──────────────────────────────────────────────────
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

  // ── Auto-switch to Ava tab ───────────────────────────────────────────
  useEffect(() => {
    if (sessionTasks.length > 0 && tab === 'personal' && todayTasks.length === 0) {
      setTab('ava');
    }
  }, [sessionTasks.length, tab, todayTasks.length]);

  // ── Drag resize — smooth with rAF, commit on mouseup ────────────────
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = liveWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [liveWidth]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      if (rafRef.current !== null) return; // throttle to 1 rAF
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const delta = startX.current - e.clientX;
        const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta));
        liveWidthRef.current = newWidth;
        setLiveWidth(newWidth);
      });
    };

    const onMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        // Commit final width to parent (triggers persist)
        onWidthChange(liveWidthRef.current);
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [onWidthChange]);

  const completedSession = sessionTasks.filter(t => t.status === 'completed').length;

  return (
    <div
      ref={panelRef}
      className="relative flex flex-col h-full"
      style={{
        width: liveWidth,
        minWidth: MIN_WIDTH,
        maxWidth: MAX_WIDTH,
        borderLeft: '1px solid rgba(168, 85, 247, 0.12)',
        background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(168, 85, 247, 0.04) 0%, transparent 70%), var(--vscode-sideBar-background)',
      }}
    >
      {/* Drag handle — left edge */}
      <div
        onMouseDown={onMouseDown}
        className="absolute left-0 top-0 bottom-0 z-10 hover:bg-[#A855F7]/20 transition-colors"
        style={{ width: 4, cursor: 'col-resize' }}
      />

      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2.5 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(168, 85, 247, 0.12)' }}
      >
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="opacity-50">
            <path d="M3.75 4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM6 3.5h8v1H6v-1zm-2.25 5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM6 7.5h8v1H6v-1zm-2.25 5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM6 11.5h8v1H6v-1z"/>
          </svg>
          <span className="text-xs font-semibold">{t('tasks.today')}</span>
        </div>
        <button
          onClick={onClose}
          title={t('tasks.close')}
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
            background: 'transparent',
            borderBottom: tab === 'personal' ? '2px solid #A855F7' : '2px solid transparent',
          }}
        >
          {t('tasks.personal')}
          {allTasks.length > 0 && (
            <span className="ml-1.5 text-[9px] opacity-50">
              {allTasks.filter(t => t.status !== 'done').length}
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
          {t('tasks.ava')}
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
            todayTasks={todayTasks}
            allTasks={allTasks}
            onToggleTask={onToggleTask}
          />
        ) : (
          <AvaTab
            sessionTasks={sessionTasks}
            completedSession={completedSession}
            avaCompletedTasks={avaCompletedTasks}
          />
        )}
      </div>
    </div>
  );
}

// ── Personal Tab ──────────────────────────────────────────────────────────────

type PersonalFilter = 'today' | 'all';

function PersonalTab({
  todayTasks,
  allTasks,
  onToggleTask,
}: {
  todayTasks: TodayTaskUI[];
  allTasks: TodayTaskUI[];
  onToggleTask: (id: string) => void;
}) {
  const [filter, setFilter] = useState<PersonalFilter>('today');

  const tasks = filter === 'today' ? todayTasks : allTasks;
  const activeTasks = tasks.filter(t => t.status !== 'done');
  const doneTasks = tasks.filter(t => t.status === 'done');

  return (
    <div className="flex flex-col h-full">
      {/* Toggle */}
      <div className="flex items-center gap-1 px-3 pt-2 pb-1">
        {(['today', 'all'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2.5 py-1 rounded-md text-[10px] font-medium border-none cursor-pointer transition-all
              ${filter === f
                ? 'text-white'
                : 'text-[var(--vscode-foreground)] opacity-40 hover:opacity-60 bg-transparent'
              }`}
            style={filter === f ? { background: '#A855F7' } : undefined}
          >
            {f === 'today' ? t('tasks.filter_today') : t('tasks.filter_all')}
            <span className="ml-1 opacity-60">
              {f === 'today' ? todayTasks.filter(t => t.status !== 'done').length : allTasks.filter(t => t.status !== 'done').length}
            </span>
          </button>
        ))}
      </div>

      {/* Tasks */}
      {activeTasks.length === 0 && doneTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 opacity-30 text-xs gap-2 px-4 text-center">
          <svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor" className="opacity-40">
            <path d="M3.75 4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM6 3.5h8v1H6v-1zm-2.25 5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM6 7.5h8v1H6v-1zm-2.25 5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM6 11.5h8v1H6v-1z"/>
          </svg>
          <span>{filter === 'today' ? t('tasks.no_tasks_today') : t('tasks.no_active_tasks')}</span>
          <span className="text-[10px] opacity-60">{t('tasks.add_hint')}</span>
        </div>
      ) : (
        <div className="px-2 pt-1 pb-3 flex-1 overflow-y-auto">
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
                {t('tasks.completed')}
              </div>
              <div className="flex flex-col gap-0.5">
                {doneTasks.map(task => (
                  <TaskItem key={task.id} task={task} onToggle={() => onToggleTask(task.id)} done />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Ava Tab ───────────────────────────────────────────────────────────────────

function AvaTab({
  sessionTasks,
  completedSession,
  avaCompletedTasks,
}: {
  sessionTasks: SessionTaskUI[];
  completedSession: number;
  avaCompletedTasks: AvaCompletedTaskUI[];
}) {
  const [currentOpen, setCurrentOpen] = useState(true);
  const [completedOpen, setCompletedOpen] = useState(false);

  const hasSession = sessionTasks.length > 0;
  const allDone = hasSession && completedSession === sessionTasks.length;

  return (
    <div className="pb-3">
      {/* ── Current section ─────────────────────────────────────────── */}
      <CollapsibleSection
        title={t('tasks.current')}
        count={hasSession ? `${completedSession}/${sessionTasks.length}` : undefined}
        open={currentOpen}
        onToggle={() => setCurrentOpen(!currentOpen)}
      >
        {hasSession ? (
          <>
            {/* Progress bar */}
            <div className="px-2 mb-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] opacity-40">
                  {allDone ? t('tasks.all_complete') : t('tasks.step_of', { current: String(completedSession + 1), total: String(sessionTasks.length) })}
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
            <div className="flex flex-col gap-0.5">
              {sessionTasks.map(task => (
                <SessionItem key={task.id} task={task} />
              ))}
            </div>
          </>
        ) : (
          <p className="text-[11px] opacity-30 italic px-2 m-0">{t('tasks.no_active_session')}</p>
        )}
      </CollapsibleSection>

      {/* ── Completed section ───────────────────────────────────────── */}
      <CollapsibleSection
        title={t('tasks.completed')}
        count={avaCompletedTasks.length > 0 ? String(avaCompletedTasks.length) : undefined}
        open={completedOpen}
        onToggle={() => setCompletedOpen(!completedOpen)}
      >
        {avaCompletedTasks.length > 0 ? (
          <div className="flex flex-col gap-0.5">
            {avaCompletedTasks.map(task => (
              <CompletedItem key={task.id} task={task} />
            ))}
          </div>
        ) : (
          <p className="text-[11px] opacity-30 italic px-2 m-0">{t('tasks.no_completed_yet')}</p>
        )}
      </CollapsibleSection>
    </div>
  );
}

// ── Collapsible Section ───────────────────────────────────────────────────────

function CollapsibleSection({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ borderBottom: '1px solid rgba(168, 85, 247, 0.06)' }}>
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 w-full px-3 py-2 text-left bg-transparent border-none cursor-pointer
                   hover:bg-white/[0.03] transition"
      >
        <svg
          width="10" height="10" viewBox="0 0 16 16" fill="currentColor"
          className="opacity-40 transition-transform flex-shrink-0"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          <path d="M6 4l4 4-4 4V4z"/>
        </svg>
        <span className="text-[10px] font-semibold uppercase tracking-wider opacity-50">
          {title}
        </span>
        {count && (
          <span className="text-[9px] opacity-30 ml-auto">{count}</span>
        )}
      </button>
      {open && (
        <div className="px-2 pb-2">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Completed Item ────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(diff / 86400000);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function CompletedItem({ task }: { task: AvaCompletedTaskUI }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition">
      <span className="flex items-center justify-center w-4 h-4 flex-shrink-0 text-[11px] text-emerald-400">
        ✓
      </span>
      <span className="text-xs flex-1 truncate line-through opacity-30">
        {task.title}
      </span>
      <span className="text-[9px] opacity-20 flex-shrink-0">
        {timeAgo(task.completedAt)}
      </span>
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

export { DEFAULT_WIDTH };
