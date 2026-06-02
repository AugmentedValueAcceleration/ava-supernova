import { useState, useCallback, useRef, useEffect } from 'react';
import { t, tt, useLocale } from '../i18n';
import type { TodayTaskUI, SessionTaskUI, AvaCompletedTaskUI } from '../types/messages';


/** Payload for a manually created task from the panel's quick-add. */
export interface CreateTaskInput {
  title: string;
  priority?: string;
  category?: string;
  due_date?: string;
}

/** Preset categories that seed the picker. Default is neutral, not coding —
 *  and the field is free-form, so a user can type ANY label (fitness, garden…). */
const CATEGORY_OPTIONS = ['personal', 'coding', 'admin', 'meeting', 'health', 'finance', 'errands', 'study', 'home'] as const;
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'] as const;

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
  onCreateTask: (task: CreateTaskInput) => void;
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
  onCreateTask,
  width,
  onWidthChange,
}: TasksPanelProps) {
  useLocale();
  // Your tasks are the home view; Ava's live work appears as a sticky band on
  // top only while she's working (no tabs — the relevant thing is just there).
  const [filter, setFilter] = useState<PersonalFilter>('today');
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
        background: 'radial-gradient(ellipse 90% 40% at 50% 0%, rgba(168, 85, 247, 0.10) 0%, transparent 65%), linear-gradient(180deg, rgba(26,16,40,0.95) 0%, rgba(20,13,34,0.97) 100%)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Drag handle — left edge */}
      <div
        onMouseDown={onMouseDown}
        className="absolute left-0 top-0 bottom-0 z-10 hover:bg-[#A855F7]/20 transition-colors"
        style={{ width: 4, cursor: 'col-resize' }}
      />

      {/* Persistent grip — same spot as the collapsed spine's, points right to
          collapse. The single, never-moving expand/collapse control. */}
      <button
        onClick={onClose}
        title={tt('tasks.collapse', 'Collapse')}
        aria-label={tt('tasks.collapse', 'Collapse')}
        className="absolute top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-6 h-6 rounded-full cursor-pointer transition hover:scale-110"
        style={{ left: -12, background: '#0f0a1a', border: '1px solid rgba(168,85,247,0.35)', color: '#A855F7', boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M5.646 3.646a.5.5 0 0 1 .708 0l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L9.293 8 5.646 4.354a.5.5 0 0 1 0-.708z" />
        </svg>
      </button>

      {/* Header — title only; collapse is the persistent grip on the border. */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(168, 85, 247, 0.12)' }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ color: '#A855F7' }} className="opacity-80">
          <path d="M3.75 4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM6 3.5h8v1H6v-1zm-2.25 5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM6 7.5h8v1H6v-1zm-2.25 5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM6 11.5h8v1H6v-1z"/>
        </svg>
        <span className="text-xs font-semibold" style={{ color: '#cdd6f4' }}>{t('tasks.today')}</span>
      </div>

      {/* Quick add — pinned under the header. The front door. */}
      <div className="flex-shrink-0">
        <QuickAdd onCreate={onCreateTask} defaultDueToday={filter === 'today'} />
      </div>

      {/* Body — your tasks fill it; Ava's live work pins to the top as a sticky
          band only while she's working; her recent work tucks away at the bottom. */}
      <div className="flex-1 overflow-y-auto">
        {sessionTasks.length > 0 && (
          <AvaBand sessionTasks={sessionTasks} completedSession={completedSession} />
        )}

        <YourTasks
          todayTasks={todayTasks}
          allTasks={allTasks}
          filter={filter}
          onFilterChange={setFilter}
          onToggleTask={onToggleTask}
        />

        {avaCompletedTasks.length > 0 && (
          <AvaRecentWork avaCompletedTasks={avaCompletedTasks} />
        )}
      </div>
    </div>
  );
}

// ── Ava band — sticky live-work indicator ──────────────────────────────────────

function AvaBand({ sessionTasks, completedSession }: { sessionTasks: SessionTaskUI[]; completedSession: number }) {
  const [expanded, setExpanded] = useState(false);
  const total = sessionTasks.length;
  const allDone = completedSession === total;
  const current = sessionTasks.find(t => t.status === 'in_progress')
    ?? sessionTasks.find(t => t.status !== 'completed');

  return (
    <div
      className="sticky top-0 z-10"
      style={{
        background: 'linear-gradient(180deg, rgba(40,22,58,0.97) 0%, rgba(30,18,46,0.97) 100%)',
        backdropFilter: 'blur(6px)',
        borderBottom: '1px solid rgba(168,85,247,0.18)',
      }}
    >
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex flex-col gap-1.5 px-3 py-2 bg-transparent border-none cursor-pointer text-left"
      >
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"
            style={{ color: allDone ? '#34d399' : '#A855F7' }}
          >
            {!allDone && <span className="inline-block animate-spin" style={{ animationDuration: '1.5s' }}>⟳</span>}
            {tt('tasks.ava', 'Ava')}
          </span>
          <span className="text-[10px] opacity-50 flex-1 truncate">
            {allDone ? tt('tasks.all_complete', 'All steps complete') : current?.title}
          </span>
          <span className="text-[10px] font-semibold flex-shrink-0" style={{ color: allDone ? '#34d399' : '#A855F7' }}>
            {completedSession}/{total}
          </span>
          <svg
            width="10" height="10" viewBox="0 0 16 16" fill="currentColor"
            className="opacity-40 flex-shrink-0 transition-transform"
            style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
          >
            <path d="M6 4l4 4-4 4V4z" />
          </svg>
        </div>
        <div className="w-full h-1 rounded-full" style={{ background: 'rgba(168,85,247,0.12)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${total > 0 ? (completedSession / total) * 100 : 0}%`, background: allDone ? '#34d399' : '#A855F7' }}
          />
        </div>
      </button>

      {expanded && (
        <div className="px-2 pb-2 flex flex-col gap-0.5">
          {sessionTasks.map(task => (
            <SessionItem key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Ava recent work — collapsible history at the bottom ─────────────────────────

function AvaRecentWork({ avaCompletedTasks }: { avaCompletedTasks: AvaCompletedTaskUI[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1" style={{ borderTop: '1px solid rgba(168, 85, 247, 0.06)' }}>
      <CollapsibleSection
        title={tt('tasks.ava_recent_work', "Ava's recent work")}
        count={String(avaCompletedTasks.length)}
        open={open}
        onToggle={() => setOpen(o => !o)}
      >
        <div className="flex flex-col gap-0.5">
          {avaCompletedTasks.map(task => (
            <CompletedItem key={task.id} task={task} />
          ))}
        </div>
      </CollapsibleSection>
    </div>
  );
}

// ── Personal Tab ──────────────────────────────────────────────────────────────

type PersonalFilter = 'today' | 'all';

// ── Quick add ─────────────────────────────────────────────────────────────────

const QUICK_INPUT_STYLE: React.CSSProperties = {
  background: 'rgba(49,34,68,0.5)',
  color: '#cdd6f4',
  border: '1px solid rgba(168,85,247,0.2)',
};

function QuickAdd({
  onCreate,
  defaultDueToday,
}: {
  onCreate: (task: CreateTaskInput) => void;
  defaultDueToday: boolean;
}) {
  useLocale();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('medium');
  const [category, setCategory] = useState('personal');
  const [dueDate, setDueDate] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const reset = useCallback(() => {
    setTitle('');
    setPriority('medium');
    setCategory('personal');
    setDueDate('');
  }, []);

  const submit = useCallback(() => {
    const trimmed = title.trim();
    if (!trimmed) return;
    // "Today" view implies the task belongs to today unless a date is picked,
    // so it shows up where the user added it. The "All" view stays date-free.
    const due = dueDate || (defaultDueToday ? new Date().toISOString().slice(0, 10) : undefined);
    onCreate({ title: trimmed, priority, category, due_date: due });
    reset();
    inputRef.current?.focus(); // keep open for rapid entry
  }, [title, dueDate, defaultDueToday, priority, category, onCreate, reset]);

  const cancel = useCallback(() => {
    reset();
    setOpen(false);
  }, [reset]);

  if (!open) {
    return (
      <div className="px-3 pt-2.5">
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 w-full px-2.5 py-1.5 rounded-lg text-[11px] font-medium
                     border border-dashed cursor-pointer transition-all
                     text-[#a6adc8] opacity-50 hover:opacity-90"
          style={{ borderColor: 'rgba(168,85,247,0.25)', background: 'transparent' }}
        >
          <span className="text-[13px] leading-none" style={{ color: '#A855F7' }}>+</span>
          {tt('tasks.add_task', 'Add a task')}
        </button>
      </div>
    );
  }

  return (
    <div
      className="mx-3 mt-2.5 p-2 rounded-lg flex flex-col gap-2"
      style={{ background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.15)' }}
    >
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          else if (e.key === 'Escape') cancel();
        }}
        placeholder={tt('tasks.add_placeholder', 'What needs doing?')}
        className="w-full px-2 py-1.5 rounded-md text-xs outline-none"
        style={QUICK_INPUT_STYLE}
      />

      <div className="flex items-center gap-1.5">
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          title={tt('tasks.priority', 'Priority')}
          className="flex-1 min-w-0 px-1.5 py-1 rounded-md text-[10px] outline-none cursor-pointer"
          style={QUICK_INPUT_STYLE}
        >
          {PRIORITY_OPTIONS.map((p) => (
            <option key={p} value={p}>{tt(`tasks.priority_${p}`, p)}</option>
          ))}
        </select>
        <input
          list="quickadd-categories"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          title={tt('tasks.category', 'Category')}
          placeholder={tt('tasks.category', 'Category')}
          className="flex-1 min-w-0 px-1.5 py-1 rounded-md text-[10px] outline-none"
          style={QUICK_INPUT_STYLE}
        />
        <datalist id="quickadd-categories">
          {CATEGORY_OPTIONS.map((c) => <option key={c} value={c} />)}
        </datalist>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          title={tt('tasks.due_date', 'Due date')}
          className="flex-1 min-w-0 px-1.5 py-1 rounded-md text-[10px] outline-none cursor-pointer"
          style={QUICK_INPUT_STYLE}
        />
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={submit}
          disabled={!title.trim()}
          className="px-3 py-1 rounded-md text-[11px] font-semibold border-none cursor-pointer transition
                     disabled:opacity-30 disabled:cursor-default"
          style={{ background: '#A855F7', color: 'white' }}
        >
          {tt('tasks.add', 'Add')}
        </button>
        <button
          onClick={cancel}
          className="px-2.5 py-1 rounded-md text-[11px] font-medium border-none cursor-pointer bg-transparent
                     text-[#a6adc8] opacity-50 hover:opacity-90 transition"
        >
          {tt('tasks.cancel', 'Cancel')}
        </button>
      </div>
    </div>
  );
}

function YourTasks({
  todayTasks,
  allTasks,
  filter,
  onFilterChange,
  onToggleTask,
}: {
  todayTasks: TodayTaskUI[];
  allTasks: TodayTaskUI[];
  filter: PersonalFilter;
  onFilterChange: (f: PersonalFilter) => void;
  onToggleTask: (id: string) => void;
}) {
  const tasks = filter === 'today' ? todayTasks : allTasks;
  const activeTasks = tasks.filter(t => t.status !== 'done');
  const doneTasks = tasks.filter(t => t.status === 'done');

  return (
    <div className="flex flex-col">
      {/* Today / All toggle */}
      <div className="flex items-center gap-1 px-3 pt-2 pb-1">
        {(['today', 'all'] as const).map(f => (
          <button
            key={f}
            onClick={() => onFilterChange(f)}
            className={`px-2.5 py-1 rounded-md text-[10px] font-medium border-none cursor-pointer transition-all
              ${filter === f
                ? 'text-white'
                : 'text-[#a6adc8] opacity-40 hover:opacity-60 bg-transparent'
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
        <div className="flex flex-col items-center justify-center py-12 opacity-30 text-xs gap-2 px-4 text-center">
          <svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor" className="opacity-40">
            <path d="M3.75 4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM6 3.5h8v1H6v-1zm-2.25 5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM6 7.5h8v1H6v-1zm-2.25 5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM6 11.5h8v1H6v-1z"/>
          </svg>
          <span>{filter === 'today' ? t('tasks.no_tasks_today') : t('tasks.no_active_tasks')}</span>
          <span className="text-[10px] opacity-60">{t('tasks.add_hint')}</span>
        </div>
      ) : (
        <div className="px-2 pt-1 pb-3">
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

// Subtle per-category tint so the board is scannable. Unknown / user-defined
// categories fall back to slate.
const CATEGORY_COLORS: Record<string, string> = {
  personal: '#38bdf8',
  coding: '#a855f7',
  admin: '#f59e0b',
  meeting: '#34d399',
  custom: '#94a3b8',
};
function categoryColor(cat: string): string {
  return CATEGORY_COLORS[cat] ?? '#94a3b8';
}
function formatDueShort(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function TaskItem({ task, onToggle, done }: { task: TodayTaskUI; onToggle: () => void; done?: boolean }) {
  const style = PRIORITY_STYLES[task.priority];
  const today = new Date().toISOString().slice(0, 10);
  const overdue = !!task.dueDate && !done && task.dueDate < today;
  const dueToday = !!task.dueDate && !done && task.dueDate === today;
  const hasMeta = !done && (task.category || task.dueDate);

  return (
    <div
      className="group flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.04] transition cursor-pointer"
      onClick={onToggle}
    >
      <div
        className={`flex items-center justify-center w-4 h-4 rounded-full border flex-shrink-0 transition mt-px
          ${done
            ? 'border-emerald-400/50 text-emerald-400'
            : 'border-white/[0.15] text-transparent group-hover:border-white/[0.3] group-hover:text-white/[0.15]'
          }`}
        style={{ fontSize: 9 }}
      >
        ✓
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
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

        {hasMeta && (
          <div className="flex items-center gap-1.5 mt-0.5">
            {task.category && (
              <span
                className="text-[9px] px-1.5 rounded-full font-medium"
                style={{ color: categoryColor(task.category), backgroundColor: `${categoryColor(task.category)}1a` }}
              >
                {task.category}
              </span>
            )}
            {task.dueDate && (
              <span
                className="text-[9px]"
                style={{
                  color: overdue ? '#ef4444' : dueToday ? '#f59e0b' : '#6c7086',
                  opacity: overdue || dueToday ? 1 : 0.6,
                }}
              >
                {formatDueShort(task.dueDate)}{overdue ? ' · overdue' : ''}
              </span>
            )}
          </div>
        )}
      </div>
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
