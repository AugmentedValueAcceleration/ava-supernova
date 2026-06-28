import { useState, useCallback, useRef, useEffect } from 'react';
import { t, tt, useLocale } from '../../i18n';
import type { TodayTaskUI, SessionTaskUI, AvaCompletedTaskUI } from '../../types/messages';


/** Payload for a manually created task from the panel's quick-add. */
export interface CreateTaskInput {
  title: string;
  priority?: string;
  category?: string;
  due_date?: string;
  due_time?: string;
  recurrence?: string;
  reminder_lead?: number;
  subtasks?: string[];
}

/** Fields the detail editor can change on an existing task. */
export interface UpdateTaskInput {
  title?: string;
  priority?: string;
  category?: string;
  due_date?: string;
  due_time?: string;
  recurrence?: string;
  reminder_lead?: number;
}

/** Preset categories that seed the picker. Default is neutral, not coding —
 *  and the field is free-form, so a user can type ANY label (fitness, garden…). */
const CATEGORY_OPTIONS = ['personal', 'coding', 'admin', 'meeting', 'health', 'finance', 'errands', 'study', 'home'] as const;
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'] as const;
const RECURRENCE_OPTIONS = ['none', 'daily', 'weekdays', 'weekly', 'monthly'] as const;
/** Reminder lead presets — minutes before due. 0 = at the due time.
 *  `key` is the stable i18n key (shared with the IDE panel); `label` is the
 *  English fallback used when a locale hasn't translated it yet. */
const REMINDER_OPTIONS: { value: number; key: string; label: string }[] = [
  { value: -1, key: 'tasks.reminder_none', label: 'No reminder' },
  { value: 0, key: 'tasks.reminder_at_time', label: 'At time' },
  { value: 10, key: 'tasks.reminder_10m', label: '10 min before' },
  { value: 30, key: 'tasks.reminder_30m', label: '30 min before' },
  { value: 60, key: 'tasks.reminder_1h', label: '1 hour before' },
  { value: 1440, key: 'tasks.reminder_1d', label: '1 day before' },
];

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
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onUpdateTask: (taskId: string, updates: UpdateTaskInput) => void;
  onOpenFolder: () => void;
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
  onToggleSubtask,
  onUpdateTask,
  onOpenFolder,
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
        borderLeft: '1px solid var(--border-card)',
        background: 'radial-gradient(ellipse 90% 40% at 50% 0%, color-mix(in srgb, var(--accent) 10%, transparent) 0%, transparent 65%), linear-gradient(180deg, rgba(26,16,40,0.95) 0%, rgba(20,13,34,0.97) 100%)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Drag handle — left edge */}
      <div
        onMouseDown={onMouseDown}
        className="absolute left-0 top-0 bottom-0 z-10 hover:bg-[var(--accent)]/20 transition-colors"
        style={{ width: 4, cursor: 'col-resize' }}
      />

      {/* Persistent grip — same spot as the collapsed spine's, points right to
          collapse. The single, never-moving expand/collapse control. */}
      <button
        onClick={onClose}
        title={tt('tasks.collapse', 'Collapse')}
        aria-label={tt('tasks.collapse', 'Collapse')}
        className="absolute top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-6 h-6 rounded-full cursor-pointer transition hover:scale-110"
        style={{ left: -12, background: 'var(--bg-page)', border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)', color: 'var(--accent)', boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M5.646 3.646a.5.5 0 0 1 .708 0l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L9.293 8 5.646 4.354a.5.5 0 0 1 0-.708z" />
        </svg>
      </button>

      {/* Header — title only; collapse is the persistent grip on the border. */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-card)' }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ color: 'var(--accent)' }} className="opacity-80">
          <path d="M3.75 4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM6 3.5h8v1H6v-1zm-2.25 5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM6 7.5h8v1H6v-1zm-2.25 5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM6 11.5h8v1H6v-1z"/>
        </svg>
        <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{t('tasks.today')}</span>
        {/* Open the on-disk tasks folder — mirrors the Library's "Open save folder". */}
        <button
          onClick={onOpenFolder}
          title={tt('tasks.open_folder', 'Open the tasks folder on disk')}
          aria-label={tt('tasks.open_folder', 'Open the tasks folder on disk')}
          className="ml-auto mr-5 flex items-center justify-center w-6 h-6 rounded-md text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 transition"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1.75 3.5A1.75 1.75 0 0 1 3.5 1.75h2.19c.46 0 .9.18 1.23.51l.82.82h4.51c.97 0 1.75.78 1.75 1.75v7.41c0 .97-.78 1.75-1.75 1.75H3.5a1.75 1.75 0 0 1-1.75-1.75V3.5z"/>
          </svg>
        </button>
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
          onToggleSubtask={onToggleSubtask}
          onUpdateTask={onUpdateTask}
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
        borderBottom: '1px solid color-mix(in srgb, var(--accent) 18%, transparent)',
      }}
    >
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex flex-col gap-1.5 px-3 py-2 bg-transparent border-none cursor-pointer text-left"
      >
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"
            style={{ color: allDone ? '#34d399' : 'var(--accent)' }}
          >
            {!allDone && <span className="inline-block animate-spin" style={{ animationDuration: '1.5s' }}>⟳</span>}
            {tt('tasks.ava', 'Ava')}
          </span>
          <span className="text-[10px] opacity-50 flex-1 truncate">
            {allDone ? tt('tasks.all_complete', 'All steps complete') : current?.title}
          </span>
          <span className="text-[10px] font-semibold flex-shrink-0" style={{ color: allDone ? '#34d399' : 'var(--accent)' }}>
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
        <div className="w-full h-1 rounded-full" style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${total > 0 ? (completedSession / total) * 100 : 0}%`, background: allDone ? '#34d399' : 'var(--accent)' }}
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
    <div className="mt-1" style={{ borderTop: '1px solid color-mix(in srgb, var(--accent) 6%, transparent)' }}>
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
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-input)',
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
  const [dueTime, setDueTime] = useState('');
  const [recurrence, setRecurrence] = useState('none');
  const [reminderLead, setReminderLead] = useState(-1);
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [subInput, setSubInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  const reset = useCallback(() => {
    setTitle('');
    setPriority('medium');
    setCategory('personal');
    setDueDate('');
    setDueTime('');
    setRecurrence('none');
    setReminderLead(-1);
    setSubtasks([]);
    setSubInput('');
  }, []);

  const addSub = useCallback(() => {
    const v = subInput.trim();
    if (!v) return;
    setSubtasks((s) => [...s, v]);
    setSubInput('');
  }, [subInput]);

  const submit = useCallback(() => {
    const trimmed = title.trim();
    if (!trimmed) return;
    // "Today" view implies the task belongs to today unless a date is picked,
    // so it shows up where the user added it. The "All" view stays date-free.
    const due = dueDate || (defaultDueToday ? new Date().toISOString().slice(0, 10) : undefined);
    onCreate({
      title: trimmed,
      priority,
      category,
      due_date: due,
      due_time: dueTime || undefined,
      recurrence: recurrence !== 'none' ? recurrence : undefined,
      reminder_lead: reminderLead >= 0 ? reminderLead : undefined,
      subtasks: subtasks.length ? subtasks : undefined,
    });
    reset();
    setOpen(false);
  }, [title, dueDate, defaultDueToday, priority, category, dueTime, recurrence, reminderLead, subtasks, onCreate, reset]);

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
                     text-[var(--text-secondary)] opacity-50 hover:opacity-90"
          style={{ borderColor: 'color-mix(in srgb, var(--accent) 25%, transparent)', background: 'transparent' }}
        >
          <span className="text-[13px] leading-none" style={{ color: 'var(--accent)' }}>+</span>
          {tt('tasks.add_task', 'Add a task')}
        </button>
      </div>
    );
  }

  const labelCls = 'mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]';
  const fieldCls = 'w-full px-2.5 py-2 rounded-md text-xs outline-none';

  // A clean, centred overlay — roomy, every field on show (no "More" toggle).
  return (
    <div
      onClick={cancel}
      className="fixed inset-0 z-[1000] flex items-center justify-center p-5"
      style={{ background: 'rgba(10,6,18,0.6)', backdropFilter: 'blur(4px)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col gap-4 rounded-2xl p-6 overflow-y-auto"
        style={{
          width: 'min(480px, 92vw)', maxHeight: '88vh',
          background: 'linear-gradient(180deg, rgba(30,18,46,0.99) 0%, rgba(22,14,36,1) 100%)',
          border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)', boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
        }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-bold text-[var(--text-primary)]">{tt('tasks.new_task', 'New task')}</span>
          <button
            onClick={cancel}
            aria-label={tt('tasks.cancel', 'Cancel')}
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg border-none bg-white/[0.04] text-base leading-none text-[var(--text-secondary)] cursor-pointer hover:bg-white/[0.08]"
          >
            ×
          </button>
        </div>

        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); else if (e.key === 'Escape') cancel(); }}
          placeholder={tt('tasks.add_placeholder', 'What needs doing?')}
          className="w-full px-3 py-2.5 rounded-md text-sm outline-none"
          style={QUICK_INPUT_STYLE}
        />

        <div className="flex gap-2.5">
          <div className="flex-1 min-w-0">
            <span className={labelCls}>{tt('tasks.priority', 'Priority')}</span>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className={`${fieldCls} cursor-pointer`} style={QUICK_INPUT_STYLE}>
              {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{tt(`tasks.priority_${p}`, p)}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-0">
            <span className={labelCls}>{tt('tasks.category', 'Category')}</span>
            <input list="quickadd-categories" value={category} onChange={(e) => setCategory(e.target.value)} className={fieldCls} style={QUICK_INPUT_STYLE} />
            <datalist id="quickadd-categories">{CATEGORY_OPTIONS.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
        </div>

        <div className="flex gap-2.5">
          <div className="flex-1 min-w-0">
            <span className={labelCls}>{tt('tasks.due_date', 'Due date')}</span>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={`${fieldCls} cursor-pointer`} style={QUICK_INPUT_STYLE} />
          </div>
          <div className="flex-1 min-w-0">
            <span className={labelCls}>{tt('tasks.due_time', 'Time')}</span>
            <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} className={`${fieldCls} cursor-pointer`} style={QUICK_INPUT_STYLE} />
          </div>
        </div>

        <div className="flex gap-2.5">
          <div className="flex-1 min-w-0">
            <span className={labelCls}>{tt('tasks.recurrence', 'Repeat')}</span>
            <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)} className={`${fieldCls} cursor-pointer`} style={QUICK_INPUT_STYLE}>
              {RECURRENCE_OPTIONS.map((r) => <option key={r} value={r}>{tt(`tasks.recurrence_${r}`, r)}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-0">
            <span className={labelCls}>{tt('tasks.reminder', 'Reminder')}</span>
            <select value={reminderLead} onChange={(e) => setReminderLead(Number(e.target.value))} className={`${fieldCls} cursor-pointer`} style={QUICK_INPUT_STYLE}>
              {REMINDER_OPTIONS.map((r) => <option key={r.value} value={r.value}>{tt(r.key, r.label)}</option>)}
            </select>
          </div>
        </div>

        <div>
          <span className={labelCls}>{tt('tasks.subtasks', 'Subtasks')}</span>
          {subtasks.length > 0 && (
            <div className="mb-2 flex flex-col gap-1">
              {subtasks.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="h-3.5 w-3.5 flex-shrink-0 rounded border border-white/20" />
                  <span className="flex-1 text-xs text-[var(--text-secondary)]">{s}</span>
                  <button onClick={() => setSubtasks((arr) => arr.filter((_, j) => j !== i))} aria-label="Remove" className="border-none bg-transparent text-[15px] leading-none text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-secondary)]">×</button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-1.5">
            <input
              value={subInput}
              onChange={(e) => setSubInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSub(); } }}
              placeholder={tt('tasks.add_step', 'Add a step…')}
              className={`${fieldCls} flex-1`}
              style={QUICK_INPUT_STYLE}
            />
            <button onClick={addSub} className="rounded-md border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3.5 text-xs font-semibold text-[var(--accent)] cursor-pointer hover:bg-[var(--accent)]/20 transition">
              {tt('tasks.add', 'Add')}
            </button>
          </div>
        </div>

        <div className="mt-1 flex gap-2">
          <button
            onClick={submit}
            disabled={!title.trim()}
            className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold border-none cursor-pointer transition disabled:opacity-40 disabled:cursor-default"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            {tt('tasks.create_task', 'Create task')}
          </button>
          <button
            onClick={cancel}
            className="px-4 py-2.5 rounded-lg text-[13px] font-medium border-none cursor-pointer bg-white/[0.05] text-[var(--text-secondary)] hover:bg-white/[0.08] transition"
          >
            {tt('tasks.cancel', 'Cancel')}
          </button>
        </div>
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
  onToggleSubtask,
  onUpdateTask,
}: {
  todayTasks: TodayTaskUI[];
  allTasks: TodayTaskUI[];
  filter: PersonalFilter;
  onFilterChange: (f: PersonalFilter) => void;
  onToggleTask: (id: string) => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onUpdateTask: (taskId: string, updates: UpdateTaskInput) => void;
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
                : 'text-[var(--text-secondary)] opacity-40 hover:opacity-60 bg-transparent'
              }`}
            style={filter === f ? { background: 'var(--accent)' } : undefined}
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
                <TaskItem
                  key={task.id}
                  task={task}
                  onToggle={() => onToggleTask(task.id)}
                  onToggleSubtask={onToggleSubtask}
                  onUpdateTask={onUpdateTask}
                />
              ))}
            </div>
          )}

          {doneTasks.length > 0 && (
            <>
              {activeTasks.length > 0 && (
                <div className="mx-1 my-2" style={{ borderTop: '1px solid color-mix(in srgb, var(--accent) 6%, transparent)' }} />
              )}
              <div className="text-[9px] uppercase tracking-wider opacity-25 px-2 mb-1">
                {t('tasks.completed')}
              </div>
              <div className="flex flex-col gap-0.5">
                {doneTasks.map(task => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onToggle={() => onToggleTask(task.id)}
                    onToggleSubtask={onToggleSubtask}
                    onUpdateTask={onUpdateTask}
                    done
                  />
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
    <div style={{ borderBottom: '1px solid color-mix(in srgb, var(--accent) 6%, transparent)' }}>
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
  if (mins < 1) return tt('tasks.just_now', 'just now');
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
  coding: 'var(--accent)',
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
function recurrenceLabel(r?: string): string | null {
  if (!r || r === 'none') return null;
  return tt(`tasks.recurrence_${r}`, r);
}
function reminderLabel(lead?: number): string | null {
  if (lead === undefined || lead < 0) return null;
  const opt = REMINDER_OPTIONS.find(o => o.value === lead);
  return opt ? tt(opt.key, opt.label) : null;
}

function TaskItem({
  task,
  onToggle,
  onToggleSubtask,
  onUpdateTask,
  done,
}: {
  task: TodayTaskUI;
  onToggle: () => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onUpdateTask: (taskId: string, updates: UpdateTaskInput) => void;
  done?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const style = PRIORITY_STYLES[task.priority];
  const today = new Date().toISOString().slice(0, 10);
  const overdue = !!task.dueDate && !done && task.dueDate < today;
  const dueToday = !!task.dueDate && !done && task.dueDate === today;
  const subs = task.subtasks ?? [];
  const subDone = subs.filter(s => s.done).length;
  const recurs = recurrenceLabel(task.recurrence);
  const remind = reminderLabel(task.reminderLead);
  const hasMeta = !done && (task.category || task.dueDate || task.dueTime || recurs || subs.length > 0 || remind || task.context);
  // Expandable when there's something to show, or it's editable.
  const expandable = !done || !!task.description || subs.length > 0 || !!task.context;

  return (
    <div className="rounded-lg hover:bg-white/[0.04] transition">
      <div className="group flex items-start gap-2 px-2 py-1.5">
        {/* Checkbox toggles complete; stop propagation so it doesn't also expand. */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          aria-label={tt('tasks.toggle_complete', 'Toggle complete')}
          className={`flex items-center justify-center w-4 h-4 rounded-full border flex-shrink-0 transition mt-px bg-transparent cursor-pointer
            ${done
              ? 'border-emerald-400/50 text-emerald-400'
              : 'border-white/[0.15] text-transparent group-hover:border-white/[0.3] group-hover:text-white/[0.15]'
            }`}
          style={{ fontSize: 9 }}
        >
          ✓
        </button>

        {/* Body — click to expand the detail. */}
        <div
          className={`flex-1 min-w-0 ${expandable ? 'cursor-pointer' : ''}`}
          onClick={() => expandable && setExpanded(x => !x)}
        >
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
            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
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
                    color: overdue ? '#ef4444' : dueToday ? '#f59e0b' : 'var(--text-muted)',
                    opacity: overdue || dueToday ? 1 : 0.6,
                  }}
                >
                  {formatDueShort(task.dueDate)}{task.dueTime ? ` · ${task.dueTime}` : ''}{overdue ? ' · overdue' : ''}
                </span>
              )}
              {!task.dueDate && task.dueTime && (
                <span className="text-[9px] text-[var(--text-muted)] opacity-60">{task.dueTime}</span>
              )}
              {recurs && (
                <span className="text-[9px] text-[var(--text-muted)] opacity-70" title={tt('tasks.recurrence', 'Repeat')}>↻ {recurs}</span>
              )}
              {remind && (
                <span className="text-[9px] text-[var(--text-muted)] opacity-70" title={tt('tasks.reminder', 'Reminder')}>🔔 {remind}</span>
              )}
              {subs.length > 0 && (
                <span className="text-[9px] text-[var(--text-muted)] opacity-70" title={tt('tasks.subtasks', 'Subtasks')}>
                  ☑ {subDone}/{subs.length}
                </span>
              )}
              {task.context && (
                <span className="text-[9px] text-[var(--text-muted)] opacity-60 truncate max-w-[120px]" title={task.context.label || task.context.ref}>
                  📎 {task.context.label || task.context.kind}
                </span>
              )}
            </div>
          )}
        </div>

        {expandable && (
          <button
            onClick={() => setExpanded(x => !x)}
            className="flex-shrink-0 mt-0.5 opacity-30 hover:opacity-70 bg-transparent border-none cursor-pointer transition"
            aria-label={tt('tasks.expand', 'Expand')}
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"
              className="transition-transform" style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
              <path d="M6 4l4 4-4 4V4z" />
            </svg>
          </button>
        )}
      </div>

      {expanded && (
        <div className="px-2 pb-2 pl-8 flex flex-col gap-2">
          {task.description && (
            <p className="text-[11px] leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap">{task.description}</p>
          )}

          {subs.length > 0 && (
            <div className="flex flex-col gap-0.5">
              {subs.map(s => (
                <button
                  key={s.id}
                  onClick={() => onToggleSubtask(task.id, s.id)}
                  className="flex items-center gap-2 px-1 py-0.5 rounded text-left bg-transparent border-none cursor-pointer hover:bg-white/[0.03] transition"
                >
                  <span
                    className={`flex items-center justify-center w-3.5 h-3.5 rounded border flex-shrink-0 transition text-[8px]
                      ${s.done ? 'border-emerald-400/50 text-emerald-400' : 'border-white/[0.2] text-transparent'}`}
                  >
                    ✓
                  </span>
                  <span className={`text-[11px] ${s.done ? 'line-through opacity-40' : 'opacity-80'}`}>{s.title}</span>
                </button>
              ))}
            </div>
          )}

          {task.context && (
            <div className="text-[10px] text-[var(--text-muted)] opacity-70">
              📎 {tt('tasks.from', 'From')} {task.context.label || task.context.kind}
            </div>
          )}

          {!done && (
            editing ? (
              <TaskEditForm
                task={task}
                onSave={(u) => { onUpdateTask(task.id, u); setEditing(false); }}
                onCancel={() => setEditing(false)}
              />
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="self-start text-[10px] font-medium px-2 py-0.5 rounded-md cursor-pointer border transition
                           text-[var(--accent)] border-[var(--accent)]/30 bg-[var(--accent)]/[0.06] hover:bg-[var(--accent)]/15"
              >
                {tt('tasks.edit', 'Edit')}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

/** Inline editor for an existing task — priority, category, date, time,
 *  recurrence and reminder. Title is edited via the field at the top. */
function TaskEditForm({
  task,
  onSave,
  onCancel,
}: {
  task: TodayTaskUI;
  onSave: (updates: UpdateTaskInput) => void;
  onCancel: () => void;
}) {
  useLocale();
  const [title, setTitle] = useState(task.title);
  const [priority, setPriority] = useState(task.priority);
  const [category, setCategory] = useState(task.category || 'personal');
  const [dueDate, setDueDate] = useState(task.dueDate || '');
  const [dueTime, setDueTime] = useState(task.dueTime || '');
  const [recurrence, setRecurrence] = useState(task.recurrence || 'none');
  const [reminderLead, setReminderLead] = useState(task.reminderLead ?? -1);

  const save = useCallback(() => {
    onSave({
      title: title.trim() || task.title,
      priority,
      category,
      due_date: dueDate || undefined,
      due_time: dueTime || undefined,
      recurrence,
      reminder_lead: reminderLead,
    });
  }, [title, priority, category, dueDate, dueTime, recurrence, reminderLead, onSave, task.title]);

  return (
    <div className="p-2 rounded-lg flex flex-col gap-2" style={{ background: 'color-mix(in srgb, var(--accent) 5%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 15%, transparent)' }}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full px-2 py-1 rounded-md text-[11px] outline-none"
        style={QUICK_INPUT_STYLE}
      />
      <div className="flex items-center gap-1.5">
        <select value={priority} onChange={(e) => setPriority(e.target.value as TodayTaskUI['priority'])} className="flex-1 min-w-0 px-1.5 py-1 rounded-md text-[10px] outline-none cursor-pointer" style={QUICK_INPUT_STYLE}>
          {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{tt(`tasks.priority_${p}`, p)}</option>)}
        </select>
        <input list="edit-categories" value={category} onChange={(e) => setCategory(e.target.value)} className="flex-1 min-w-0 px-1.5 py-1 rounded-md text-[10px] outline-none" style={QUICK_INPUT_STYLE} />
        <datalist id="edit-categories">{CATEGORY_OPTIONS.map((c) => <option key={c} value={c} />)}</datalist>
      </div>
      <div className="flex items-center gap-1.5">
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="flex-1 min-w-0 px-1.5 py-1 rounded-md text-[10px] outline-none cursor-pointer" style={QUICK_INPUT_STYLE} />
        <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} className="flex-1 min-w-0 px-1.5 py-1 rounded-md text-[10px] outline-none cursor-pointer" style={QUICK_INPUT_STYLE} />
      </div>
      <div className="flex items-center gap-1.5">
        <select value={recurrence} onChange={(e) => setRecurrence(e.target.value as typeof RECURRENCE_OPTIONS[number])} className="flex-1 min-w-0 px-1.5 py-1 rounded-md text-[10px] outline-none cursor-pointer" style={QUICK_INPUT_STYLE}>
          {RECURRENCE_OPTIONS.map((r) => <option key={r} value={r}>{tt(`tasks.recurrence_${r}`, r)}</option>)}
        </select>
        <select value={reminderLead} onChange={(e) => setReminderLead(Number(e.target.value))} className="flex-1 min-w-0 px-1.5 py-1 rounded-md text-[10px] outline-none cursor-pointer" style={QUICK_INPUT_STYLE}>
          {REMINDER_OPTIONS.map((r) => <option key={r.value} value={r.value}>{tt(r.key, r.label)}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-1.5">
        <button onClick={save} className="px-3 py-1 rounded-md text-[11px] font-semibold border-none cursor-pointer transition" style={{ background: 'var(--accent)', color: 'white' }}>
          {tt('tasks.save', 'Save')}
        </button>
        <button onClick={onCancel} className="px-2.5 py-1 rounded-md text-[11px] font-medium border-none cursor-pointer bg-transparent text-[var(--text-secondary)] opacity-50 hover:opacity-90 transition">
          {tt('tasks.cancel', 'Cancel')}
        </button>
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
        style={isActive ? { color: 'var(--accent)' } : undefined}
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
