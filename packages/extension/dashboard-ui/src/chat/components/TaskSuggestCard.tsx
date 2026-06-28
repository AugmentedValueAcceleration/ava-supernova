import { useState } from 'react';
import type { ToolCallDisplay } from '../../types/messages';
import { tt, useLocale } from '../../i18n';

/**
 * Task-suggestion card — "Ava suggests, you decide".
 *
 * When Ava calls task_suggest({ title, ... }), this renders the proposed task
 * as a card with Add / Edit & add / Dismiss. The task is NEVER written to the
 * user's board until they tap Add — Dismiss persists nothing. On Add, the
 * (possibly edited) task is sent back to the host, which creates it and tells
 * Ava what landed. Mirrors the ProfileFieldCard confirmation round-trip.
 */

interface Props {
  toolCall: ToolCallDisplay;
  onConfirmation: (confirmationId: string, approved: boolean, alwaysAllowCategory?: boolean, planSelection?: string, userResponse?: string) => void;
}

const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'] as const;
const CATEGORY_OPTIONS = ['personal', 'coding', 'admin', 'meeting', 'health', 'finance', 'errands', 'study', 'home'] as const;
const RECURRENCE_OPTIONS = ['none', 'daily', 'weekdays', 'weekly', 'monthly'] as const;
const REMINDER_OPTIONS: { value: number; label: string }[] = [
  { value: -1, label: 'No reminder' },
  { value: 0, label: 'At time' },
  { value: 10, label: '10 min before' },
  { value: 30, label: '30 min before' },
  { value: 60, label: '1 hour before' },
  { value: 1440, label: '1 day before' },
];
/** task_suggest's reminder enum → minutes-before-due. */
const REMINDER_ENUM_TO_MIN: Record<string, number> = { at_time: 0, '10m': 10, '30m': 30, '1h': 60, '1d': 1440 };

const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-input)',
};

export function TaskSuggestCard({ toolCall, onConfirmation }: Props) {
  useLocale();

  // Parse the proposed task from the tool args.
  let proposed: Record<string, unknown> = {};
  try { proposed = JSON.parse(toolCall.arguments) || {}; } catch { /* ignore */ }

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(String(proposed.title ?? ''));
  const [priority, setPriority] = useState(String(proposed.priority ?? 'medium'));
  const [category, setCategory] = useState(String(proposed.category ?? 'personal'));
  const [dueDate, setDueDate] = useState(String(proposed.due_date ?? ''));
  const [dueTime, setDueTime] = useState(String(proposed.due_time ?? ''));
  const [recurrence, setRecurrence] = useState(String(proposed.recurrence ?? 'none'));
  const [reminderLead, setReminderLead] = useState<number>(
    typeof proposed.reminder === 'string' && proposed.reminder in REMINDER_ENUM_TO_MIN
      ? REMINDER_ENUM_TO_MIN[proposed.reminder as string]
      : -1,
  );
  const note = typeof proposed.note === 'string' ? proposed.note : undefined;
  const subtasks = Array.isArray(proposed.subtasks) ? (proposed.subtasks as unknown[]).map(String) : [];

  const isPending = toolCall.status === 'pending_confirmation' && !!toolCall.confirmationId;
  const isCompleted = toolCall.status === 'success';
  const isDenied = toolCall.status === 'failed';

  const add = () => {
    onConfirmation(toolCall.confirmationId!, true, false, undefined, JSON.stringify({
      title: title.trim() || String(proposed.title ?? ''),
      description: note,
      priority,
      category,
      due_date: dueDate || undefined,
      due_time: dueTime || undefined,
      reminder_lead: reminderLead >= 0 ? reminderLead : undefined,
      recurrence: recurrence !== 'none' ? recurrence : undefined,
      subtasks: subtasks.length ? subtasks : undefined,
    }));
  };
  const dismiss = () => onConfirmation(toolCall.confirmationId!, false, false);

  const reminderLabel = REMINDER_OPTIONS.find(o => o.value === reminderLead)?.label;

  // ── Resolved (added / dismissed) — quiet end state. ────────────────────────
  if (isCompleted || isDenied) {
    return (
      <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)]/40 px-3.5 py-2.5 text-xs text-[var(--text-muted)]">
        {isCompleted
          ? <span>✓ {tt('tasks.suggest_added', 'Added to your tasks')} — {title || String(proposed.title ?? '')}</span>
          : <span>{tt('tasks.suggest_dismissed', 'Suggestion dismissed')}</span>}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/[0.06] p-3.5">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[13px]">🗒️</span>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">
          {tt('tasks.suggest_title', 'Ava suggests a task')}
        </span>
      </div>

      {!editing ? (
        <>
          <p className="text-sm font-medium text-[var(--text-primary)]">{title || String(proposed.title ?? '')}</p>
          {note && <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">{note}</p>}
          {(dueDate || dueTime || recurrence !== 'none' || reminderLead >= 0 || subtasks.length > 0 || category) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {category && <Chip>{category}</Chip>}
              {priority !== 'medium' && <Chip>{tt(`tasks.priority_${priority}`, priority)}</Chip>}
              {dueDate && <Chip>{dueDate}{dueTime ? ` · ${dueTime}` : ''}</Chip>}
              {!dueDate && dueTime && <Chip>{dueTime}</Chip>}
              {recurrence !== 'none' && <Chip>↻ {tt(`tasks.recurrence_${recurrence}`, recurrence)}</Chip>}
              {reminderLead >= 0 && <Chip>🔔 {tt(`tasks.reminder_${reminderLead}`, reminderLabel || '')}</Chip>}
              {subtasks.length > 0 && <Chip>☑ {subtasks.length}</Chip>}
            </div>
          )}
          {subtasks.length > 0 && (
            <ul className="mt-1.5 flex flex-col gap-0.5">
              {subtasks.map((s, i) => (
                <li key={i} className="text-[11px] text-[var(--text-secondary)] flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded border border-white/20 inline-block flex-shrink-0" /> {s}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-2 py-1.5 rounded-md text-xs outline-none" style={INPUT_STYLE} />
          <div className="flex items-center gap-1.5">
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className="flex-1 min-w-0 px-1.5 py-1 rounded-md text-[10px] outline-none cursor-pointer" style={INPUT_STYLE}>
              {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{tt(`tasks.priority_${p}`, p)}</option>)}
            </select>
            <input list="suggest-cats" value={category} onChange={(e) => setCategory(e.target.value)} className="flex-1 min-w-0 px-1.5 py-1 rounded-md text-[10px] outline-none" style={INPUT_STYLE} />
            <datalist id="suggest-cats">{CATEGORY_OPTIONS.map(c => <option key={c} value={c} />)}</datalist>
          </div>
          <div className="flex items-center gap-1.5">
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="flex-1 min-w-0 px-1.5 py-1 rounded-md text-[10px] outline-none cursor-pointer" style={INPUT_STYLE} />
            <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} className="flex-1 min-w-0 px-1.5 py-1 rounded-md text-[10px] outline-none cursor-pointer" style={INPUT_STYLE} />
          </div>
          <div className="flex items-center gap-1.5">
            <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)} className="flex-1 min-w-0 px-1.5 py-1 rounded-md text-[10px] outline-none cursor-pointer" style={INPUT_STYLE}>
              {RECURRENCE_OPTIONS.map(r => <option key={r} value={r}>{tt(`tasks.recurrence_${r}`, r)}</option>)}
            </select>
            <select value={reminderLead} onChange={(e) => setReminderLead(Number(e.target.value))} className="flex-1 min-w-0 px-1.5 py-1 rounded-md text-[10px] outline-none cursor-pointer" style={INPUT_STYLE}>
              {REMINDER_OPTIONS.map(r => <option key={r.value} value={r.value}>{tt(`tasks.reminder_${r.value}`, r.label)}</option>)}
            </select>
          </div>
        </div>
      )}

      {isPending && (
        <div className="mt-3 flex items-center gap-1.5">
          <button
            onClick={add}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border-none cursor-pointer transition"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            {tt('tasks.suggest_add', 'Add')}
          </button>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border transition
                         text-[var(--accent)] border-[var(--accent)]/30 bg-transparent hover:bg-[var(--accent)]/10"
            >
              {tt('tasks.suggest_edit', 'Edit & add')}
            </button>
          )}
          <button
            onClick={dismiss}
            className="ml-auto px-2.5 py-1.5 rounded-lg text-xs font-medium border-none cursor-pointer bg-transparent
                       text-[var(--text-secondary)] opacity-60 hover:opacity-90 transition"
          >
            {tt('tasks.suggest_dismiss', 'Dismiss')}
          </button>
        </div>
      )}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium text-[var(--text-secondary)]"
      style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}>
      {children}
    </span>
  );
}
