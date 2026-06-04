import { useState, useMemo } from 'react';
import { t, tt, useLocale } from '../i18n';
import { post } from '../App';
import { SectionGroup } from '../components/SectionGroup';
import { Skeleton } from '../components/Skeleton';
import { Select } from '../components/Select';
import { SearchIcon, TrashIcon, PencilIcon, PlusIcon, CalendarIcon } from '../components/Icons';
import type { DashboardTaskEntry } from '../types/messages';

// Preset categories that seed the picker. Not a closed set — the field is
// free-form, so a user can type any label (fitness, garden, kids…).
const CATEGORY_SUGGESTIONS = ['personal', 'coding', 'admin', 'meeting', 'health', 'finance', 'errands', 'study', 'home'];

// ── Constants ────────────────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-green-500/15 text-green-400 border-green-500/20',
  medium: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  high: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  urgent: 'bg-red-500/15 text-red-400 border-red-500/20',
};

const CATEGORY_COLORS: Record<string, string> = {
  coding: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
  personal: 'bg-pink-500/15 text-pink-400 border-pink-500/20',
  admin: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  meeting: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  custom: 'bg-gray-500/15 text-gray-400 border-gray-500/20',
};

const STATUS_ICONS: Record<string, string> = {
  todo: '○',
  'in-progress': '⟳',
  done: '✓',
  archived: '▫',
};

type ViewTab = 'active' | 'done' | 'archived';
type PriorityFilter = 'all' | 'low' | 'medium' | 'high' | 'urgent';
type CategoryFilter = 'all' | 'coding' | 'personal' | 'admin' | 'meeting' | 'custom';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function isOverdue(task: DashboardTaskEntry): boolean {
  if (!task.due_date || task.status === 'done' || task.status === 'archived') return false;
  return task.due_date < new Date().toISOString().slice(0, 10);
}

function isDueToday(task: DashboardTaskEntry): boolean {
  if (!task.due_date) return false;
  return task.due_date === new Date().toISOString().slice(0, 10);
}

// ── Sub-components ───────────────────────────────────────────────────────────

const PRIORITY_KEYS: Record<string, string> = {
  low: 'dash.tasks.priority_low',
  medium: 'dash.tasks.priority_medium',
  high: 'dash.tasks.priority_high',
  urgent: 'dash.tasks.priority_urgent',
};

const CATEGORY_KEYS: Record<string, string> = {
  coding: 'dash.tasks.cat_coding',
  personal: 'dash.tasks.cat_personal',
  admin: 'dash.tasks.cat_admin',
  meeting: 'dash.tasks.cat_meeting',
  custom: 'dash.tasks.cat_custom',
};

const TAB_KEYS: Record<string, string> = {
  active: 'dash.tasks.tab_active',
  done: 'dash.tasks.tab_done',
  archived: 'dash.tasks.tab_archived',
};

function PriorityBadge({ priority }: { priority: string }) {
  const colors = PRIORITY_COLORS[priority] ?? PRIORITY_COLORS.medium;
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${colors}`}>
      {t(PRIORITY_KEYS[priority] ?? 'dash.tasks.priority_medium')}
    </span>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const colors = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.custom;
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${colors}`}>
      {t(CATEGORY_KEYS[category] ?? 'dash.tasks.cat_custom')}
    </span>
  );
}

function SubtaskProgress({ subtasks }: { subtasks: { done: boolean }[] }) {
  if (subtasks.length === 0) return null;
  const done = subtasks.filter(s => s.done).length;
  const pct = Math.round((done / subtasks.length) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-[var(--text-muted)]">{done}/{subtasks.length}</span>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

interface SessionTask {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
}

interface TasksProps {
  tasks: DashboardTaskEntry[];
  sessionTasks?: SessionTask[];
  /** ISO date selected on the Planner-level mini-calendar. Filters
   *  the visible task list to that day's due_date. Defaults to today
   *  on first load — same behaviour as before the prop existed. */
  selectedDate?: string;
  /** True once the tasks list's first load has landed. */
  loaded: boolean;
}

export function Tasks({ tasks, sessionTasks = [], selectedDate, loaded }: TasksProps) {
  useLocale();
  const [viewTab, setViewTab] = useState<ViewTab>('active');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  // Date scope toggle. "selected" filters by the calendar pick (the
  // operator's primary intent when clicking a day); "all" shows every
  // task regardless of due_date so the page is still usable for
  // overdue / undated work. Defaults to "selected" so the calendar
  // click has immediate visible effect.
  const [dateScope, setDateScope] = useState<'selected' | 'all'>('selected');
  const todayIso = new Date().toISOString().slice(0, 10);
  const activeDate = selectedDate ?? todayIso;

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPriority, setFormPriority] = useState<string>('medium');
  const [formCategory, setFormCategory] = useState<string>('personal');
  const [formDueDate, setFormDueDate] = useState('');
  const [formRecurrence, setFormRecurrence] = useState<string>('none');

  // Stats
  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return {
      active: tasks.filter(t => t.status === 'todo' || t.status === 'in-progress').length,
      today: tasks.filter(t => (t.due_date === today && t.status !== 'done' && t.status !== 'archived') || t.status === 'in-progress').length,
      overdue: tasks.filter(t => isOverdue(t)).length,
      completed: tasks.filter(t => t.status === 'done').length,
    };
  }, [tasks]);

  // Filtered tasks
  const filtered = useMemo(() => {
    let list = tasks;

    // Date filter — only when scope is "selected". "All" shows every
    // task regardless of due_date.
    if (dateScope === 'selected') {
      list = list.filter(t => t.due_date === activeDate);
    }

    // Tab filter
    if (viewTab === 'active') {
      list = list.filter(t => t.status === 'todo' || t.status === 'in-progress');
    } else if (viewTab === 'done') {
      list = list.filter(t => t.status === 'done');
    } else {
      list = list.filter(t => t.status === 'archived');
    }

    // Priority filter
    if (priorityFilter !== 'all') {
      list = list.filter(t => t.priority === priorityFilter);
    }

    // Category filter
    if (categoryFilter !== 'all') {
      list = list.filter(t => t.category === categoryFilter);
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.title.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q))
      );
    }

    return list;
  }, [tasks, viewTab, priorityFilter, categoryFilter, search, dateScope, activeDate]);

  function resetForm() {
    setFormTitle('');
    setFormDesc('');
    setFormPriority('medium');
    setFormCategory('personal');
    setFormDueDate('');
    setFormRecurrence('none');
    setShowForm(false);
    setEditingId(null);
  }

  function handleSubmitTask() {
    if (!formTitle.trim()) return;

    if (editingId) {
      post({
        type: 'update_task',
        id: editingId,
        title: formTitle.trim(),
        description: formDesc.trim() || undefined,
        priority: formPriority,
        category: formCategory,
        due_date: formDueDate || undefined,
        recurrence: formRecurrence,
      });
    } else {
      post({
        type: 'create_task',
        title: formTitle.trim(),
        description: formDesc.trim() || undefined,
        priority: formPriority,
        category: formCategory,
        due_date: formDueDate || undefined,
        recurrence: formRecurrence,
      });
    }
    resetForm();
  }

  function startEdit(task: DashboardTaskEntry) {
    setEditingId(task.id);
    setFormTitle(task.title);
    setFormDesc(task.description ?? '');
    setFormPriority(task.priority);
    setFormCategory(task.category);
    setFormDueDate(task.due_date ?? '');
    setFormRecurrence(task.recurrence);
    setShowForm(true);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <h1 className="text-[22px] font-semibold text-[#cdd6f4]">{t('dash.tasks.title')}</h1>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(!showForm); }}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-xs font-medium text-[var(--accent)] transition hover:bg-[var(--accent)]/20"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          {t('dash.tasks.new_task')}
        </button>
      </div>

      {/* Date scope — shows the day picked on the sidebar mini-calendar
          and lets the operator switch to "all" when they want every task
          regardless of due_date. Without this surface the calendar pick
          had no visible effect on the Tasks tab. */}
      <div className="flex items-center gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] px-3 py-2">
        <CalendarIcon className="h-3.5 w-3.5 text-[var(--text-muted)]" />
        <span className="text-[11px] text-[var(--text-muted)]">
          {dateScope === 'selected'
            ? <>Showing tasks for <span className="font-semibold text-[var(--accent)]">{activeDate === todayIso ? 'today' : new Date(activeDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span></>
            : <>Showing <span className="font-semibold text-[var(--accent)]">all tasks</span></>}
        </span>
        <div className="ml-auto flex items-center gap-1 rounded-md border border-[var(--border-card)] bg-[var(--bg-input)] p-0.5">
          <button
            onClick={() => setDateScope('selected')}
            className={`rounded px-2 py-0.5 text-[10px] transition border-none cursor-pointer ${
              dateScope === 'selected'
                ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
                : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            Selected day
          </button>
          <button
            onClick={() => setDateScope('all')}
            className={`rounded px-2 py-0.5 text-[10px] transition border-none cursor-pointer ${
              dateScope === 'all'
                ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
                : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            All
          </button>
        </div>
      </div>

      {/* Ava's Progress — live session tasks */}
      {sessionTasks.length > 0 && (() => {
        const active = sessionTasks.filter(t => t.status !== 'completed');
        const completed = sessionTasks.filter(t => t.status === 'completed');
        const allDone = active.length === 0 && completed.length > 0;
        const completedCount = completed.length;
        const totalCount = sessionTasks.length;
        const pct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

        return (
          <div className={`rounded-xl border p-4 ${allDone ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-[#A855F7]/20 bg-[#A855F7]/5'}`}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm">{allDone ? '✅' : '⚡'}</span>
              <h2 className={`text-sm font-semibold ${allDone ? 'text-emerald-400' : 'text-[#A855F7]'}`}>
                {allDone ? t('dash.tasks.all_complete') : t('dash.tasks.ava_progress')}
              </h2>
              <span className="text-[10px] text-[var(--text-muted)]">
                {t('dash.tasks.x_completed').replace('{done}', String(completedCount)).replace('{total}', String(totalCount))}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-input)] overflow-hidden ml-2">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${allDone ? 'bg-emerald-500' : 'bg-[#A855F7]'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            {/* Active tasks */}
            {active.length > 0 && (
              <div className="space-y-1.5">
                {active.map(task => (
                  <div key={task.id} className="flex items-center gap-2 text-xs">
                    <span className={`w-4 text-center ${
                      task.status === 'in_progress' ? 'text-[#A855F7] animate-pulse' : 'text-[var(--text-muted)]'
                    }`}>
                      {task.status === 'in_progress' ? '⟳' : '○'}
                    </span>
                    <span className={task.status === 'in_progress' ? 'text-white font-medium' : 'text-[var(--text-secondary)]'}>
                      {task.title}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Completed tasks — collapsible */}
            {completed.length > 0 && (
              <div className={active.length > 0 ? 'mt-2 pt-2 border-t border-[var(--border-card)]' : ''}>
                <details open={allDone}>
                  <summary className="text-[10px] text-emerald-400 cursor-pointer select-none opacity-70 hover:opacity-100">
                    {t('dash.tasks.n_completed').replace('{n}', String(completedCount))}
                  </summary>
                  <div className="space-y-1 mt-1.5">
                    {completed.map(task => (
                      <div key={task.id} className="flex items-center gap-2 text-xs">
                        <span className="w-4 text-center text-emerald-400">✓</span>
                        <span className="text-[var(--text-muted)] line-through">{task.title}</span>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            )}
          </div>
        );
      })()}

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: t('dash.tasks.active'), value: stats.active, color: 'text-blue-400' },
          { label: t('dash.tasks.today'), value: stats.today, color: 'text-amber-400' },
          { label: t('dash.tasks.overdue'), value: stats.overdue, color: stats.overdue > 0 ? 'text-red-400' : 'text-[var(--text-muted)]' },
          { label: t('dash.tasks.completed'), value: stats.completed, color: 'text-emerald-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] p-3 text-center">
            <p className={`text-lg font-semibold ${color}`}>{value}</p>
            <p className="text-[10px] text-[var(--text-muted)]">{label}</p>
          </div>
        ))}
      </div>

      {/* Add/Edit Form — Centered Overlay */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => resetForm()}
        >
          <div
            className="relative w-full max-w-lg mx-4 rounded-2xl border border-[var(--accent)]/20 bg-[var(--bg-card)] shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <p className="text-sm font-semibold text-white">{editingId ? t('dash.tasks.edit_task') : t('dash.tasks.new_task')}</p>
              <button
                onClick={resetForm}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white/50 hover:text-white hover:bg-white/10 border-none cursor-pointer transition"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Form */}
            <div className="px-5 pb-5 space-y-3">
              <input
                type="text"
                placeholder={t('dash.tasks.title_placeholder')}
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmitTask()}
                className="w-full rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] px-3 py-2.5 text-sm text-white placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent)]/50"
                autoFocus
              />
              <textarea
                placeholder={t('dash.tasks.desc_placeholder')}
                value={formDesc}
                onChange={e => setFormDesc(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] px-3 py-2.5 text-sm text-white placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent)]/50 resize-none"
              />
              <div className="grid grid-cols-2 gap-3">
                {/* Priority */}
                <div>
                  <label className="mb-1 block text-[10px] text-[var(--text-muted)]">{t('dash.tasks.label_priority')}</label>
                  <Select value={formPriority} onChange={setFormPriority} options={[
                    { value: 'low', label: t('dash.tasks.priority_low') },
                    { value: 'medium', label: t('dash.tasks.priority_medium') },
                    { value: 'high', label: t('dash.tasks.priority_high') },
                    { value: 'urgent', label: t('dash.tasks.priority_urgent') },
                  ]} />
                </div>
                {/* Category — free-form: pick a preset or type your own */}
                <div>
                  <label className="mb-1 block text-[10px] text-[var(--text-muted)]">{t('dash.tasks.label_category')}</label>
                  <input
                    list="task-category-suggestions"
                    value={formCategory}
                    onChange={e => setFormCategory(e.target.value)}
                    placeholder={tt('dash.tasks.cat_placeholder', 'e.g. personal, fitness…')}
                    className="w-full rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] px-3 py-2 text-xs text-white placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent)]/50"
                  />
                  <datalist id="task-category-suggestions">
                    {CATEGORY_SUGGESTIONS.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
                {/* Due date */}
                <div>
                  <label className="mb-1 block text-[10px] text-[var(--text-muted)]">{t('dash.tasks.label_due_date')}</label>
                  <input
                    type="date"
                    value={formDueDate}
                    onChange={e => setFormDueDate(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] px-3 py-2 text-xs text-white outline-none"
                  />
                </div>
                {/* Recurrence */}
                <div>
                  <label className="mb-1 block text-[10px] text-[var(--text-muted)]">{t('dash.tasks.label_recurrence')}</label>
                  <Select value={formRecurrence} onChange={setFormRecurrence} options={[
                    { value: 'none', label: t('dash.tasks.recurrence_none') },
                    { value: 'daily', label: t('dash.tasks.recurrence_daily') },
                    { value: 'weekdays', label: tt('dash.tasks.recurrence_weekdays', 'Weekdays (Mon–Fri)') },
                    { value: 'weekly', label: t('dash.tasks.recurrence_weekly') },
                    { value: 'monthly', label: tt('dash.tasks.recurrence_monthly', 'Monthly') },
                  ]} />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSubmitTask}
                  disabled={!formTitle.trim()}
                  className="flex-1 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-40 border-none cursor-pointer"
                >
                  {editingId ? t('dash.tasks.save_changes') : t('dash.tasks.add_task')}
                </button>
                <button
                  onClick={resetForm}
                  className="rounded-lg border border-[var(--border-card)] bg-transparent px-4 py-2.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-input)] cursor-pointer"
                >
                  {t('dash.tasks.cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View tabs */}
      <div className="flex items-center gap-4 border-b border-[var(--border-card)] pb-px">
        {(['active', 'done', 'archived'] as ViewTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setViewTab(tab)}
            className={`pb-2 text-xs font-medium transition ${
              viewTab === tab
                ? 'border-b-2 border-[var(--accent)] text-white'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {t(TAB_KEYS[tab])}
            {tab === 'done' && stats.completed > 0 && (
              <span className="ml-1 text-[10px] opacity-50">{stats.completed}</span>
            )}
          </button>
        ))}
        <div className="flex-1" />
        {viewTab === 'done' && stats.completed > 0 && (
          <button
            onClick={() => {
              const doneTasks = tasks.filter(t => t.status === 'done');
              for (const t of doneTasks) {
                post({ type: 'archive_task', id: t.id });
              }
            }}
            className="pb-2 text-[10px] text-red-400 opacity-60 hover:opacity-100 bg-transparent border-none cursor-pointer transition"
          >
            {t('dash.tasks.clear_completed')}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <SearchIcon className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder={t('dash.tasks.add')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] py-1.5 pl-8 pr-3 text-xs text-white placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent)]/50"
          />
        </div>

        {/* Priority pills */}
        <div className="flex gap-1">
          {(['all', 'urgent', 'high', 'medium', 'low'] as PriorityFilter[]).map(p => (
            <button
              key={p}
              onClick={() => setPriorityFilter(p)}
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition ${
                priorityFilter === p
                  ? p === 'all' ? 'bg-white/15 text-white' : PRIORITY_COLORS[p]
                  : 'text-[var(--text-muted)] hover:bg-white/5'
              }`}
            >
              {p === 'all' ? t('dash.tasks.filter_all') : t(PRIORITY_KEYS[p] ?? 'dash.tasks.priority_medium')}
            </button>
          ))}
        </div>

        {/* Category pills */}
        <div className="flex gap-1">
          {(['all', 'coding', 'personal', 'admin', 'meeting', 'custom'] as CategoryFilter[]).map(c => (
            <button
              key={c}
              onClick={() => setCategoryFilter(c)}
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition ${
                categoryFilter === c
                  ? c === 'all' ? 'bg-white/15 text-white' : CATEGORY_COLORS[c]
                  : 'text-[var(--text-muted)] hover:bg-white/5'
              }`}
            >
              {c === 'all' ? t('dash.tasks.filter_all') : t(CATEGORY_KEYS[c] ?? 'dash.tasks.cat_custom')}
            </button>
          ))}
        </div>
      </div>

      {/* Task list */}
      <SectionGroup label={t('dash.tasks.section_label').replace('{tab}', t(TAB_KEYS[viewTab]))} count={t('dash.tasks.count_label').replace(/\{n\}/g, String(filtered.length))}>
        {!loaded ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map(i => <Skeleton key={i} height={92} radius={8} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] p-8 text-center">
            <p className="text-sm text-[var(--text-muted)]">
              {search ? t('dash.tasks.empty_search') : viewTab === 'active' ? t('dash.tasks.empty_active') : t('dash.tasks.empty_tab').replace('{tab}', t(TAB_KEYS[viewTab]).toLowerCase())}
            </p>
          </div>
        ) : (
          filtered.map(task => (
            <div
              key={task.id}
              className={`group rounded-lg border bg-[var(--bg-card)] p-4 transition hover:border-[var(--accent)]/30 ${
                isOverdue(task)
                  ? 'border-red-500/30'
                  : isDueToday(task)
                    ? 'border-amber-500/20'
                    : 'border-[var(--border-card)]'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Status indicator / Complete button */}
                {task.status !== 'done' && task.status !== 'archived' ? (
                  <button
                    onClick={() => post({ type: 'complete_task', id: task.id })}
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--border-card)] text-[var(--text-muted)] transition hover:border-emerald-500 hover:text-emerald-400"
                    title={t('dash.tasks.complete_task')}
                  >
                    <span className="text-xs">{STATUS_ICONS[task.status]}</span>
                  </button>
                ) : (
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs">
                    {STATUS_ICONS[task.status]}
                  </span>
                )}

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-medium ${task.status === 'done' ? 'text-[var(--text-muted)] line-through' : 'text-white'}`}>
                      {task.title}
                    </p>
                    {task.source === 'ava' && (
                      <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[9px] font-medium text-violet-400 border border-violet-500/20">
                        Ava
                      </span>
                    )}
                    {task.recurrence !== 'none' && (
                      <span className="text-[10px] text-[var(--text-muted)]" title={t('dash.tasks.repeats').replace('{recurrence}', task.recurrence)}>
                        ↻ {task.recurrence}
                      </span>
                    )}
                  </div>

                  {task.description && (
                    <p className="mt-1 text-xs text-[var(--text-secondary)] line-clamp-2">{task.description}</p>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <PriorityBadge priority={task.priority} />
                    <CategoryBadge category={task.category} />

                    {task.due_date && (
                      <span className={`flex items-center gap-1 text-[10px] ${
                        isOverdue(task) ? 'text-red-400 font-medium' :
                        isDueToday(task) ? 'text-amber-400' : 'text-[var(--text-muted)]'
                      }`}>
                        <CalendarIcon className="h-3 w-3" />
                        {isOverdue(task) ? t('dash.tasks.overdue_prefix') : isDueToday(task) ? t('dash.tasks.due_today') : ''}{formatDate(task.due_date)}
                      </span>
                    )}

                    <SubtaskProgress subtasks={task.subtasks} />

                    {task.completed_at && (
                      <span className="text-[10px] text-[var(--text-muted)]">
                        {t('dash.tasks.done_on').replace('{date}', formatDate(task.completed_at))}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100">
                  {task.status !== 'archived' && task.status !== 'done' && (
                    <button onClick={() => startEdit(task)} className="rounded p-1 text-[var(--text-muted)] hover:bg-white/5 hover:text-white" title={t('dash.tasks.edit')}>
                      <PencilIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {task.status === 'done' && (
                    <button onClick={() => post({ type: 'archive_task', id: task.id })} className="rounded p-1 text-[var(--text-muted)] hover:bg-white/5 hover:text-white" title={t('dash.tasks.archive')}>
                      <span className="text-xs">▫</span>
                    </button>
                  )}
                  {task.status === 'archived' && (
                    <button onClick={() => post({ type: 'restore_task', id: task.id })} className="rounded p-1 text-[var(--text-muted)] hover:bg-white/5 hover:text-emerald-400" title={t('dash.tasks.restore')}>
                      <span className="text-xs">↩</span>
                    </button>
                  )}
                  {confirmDelete === task.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { post({ type: 'delete_task', id: task.id }); setConfirmDelete(null); }}
                        className="rounded bg-red-500/20 px-2 py-0.5 text-[10px] font-medium text-red-400 hover:bg-red-500/30"
                      >
                        {t('dash.tasks.delete')}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="rounded bg-white/5 px-2 py-0.5 text-[10px] text-[var(--text-muted)] hover:bg-white/10"
                      >
                        {t('dash.tasks.cancel')}
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDelete(task.id)} className="rounded p-1 text-[var(--text-muted)] hover:bg-white/5 hover:text-red-400" title={t('dash.tasks.delete')}>
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </SectionGroup>
    </div>
  );
}
