import { useState, useMemo } from 'react';
import type { DashboardJournalDay, DashboardJournalDaySummary } from '../types/messages';

interface JournalProps {
  day: DashboardJournalDay | null;
  summaries: DashboardJournalDaySummary[];
  onLoadDay: (date: string) => void;
  onLoadSummaries: (from: string, to: string) => void;
  onSaveUserEntry: (date: string, content: string, mood?: number, tags?: string[]) => void;
}

const MOOD_LABELS = ['', 'Rough', 'Low', 'Okay', 'Good', 'Great'];
const MOOD_COLORS = ['', '#ef4444', '#f59e0b', '#6b7280', '#3b82f6', '#34d399'];

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function getMonthRange(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const last = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  return { from, to };
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_HEADERS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export function Journal({ day, summaries, onLoadDay, onLoadSummaries, onSaveUserEntry }: JournalProps) {
  const today = getToday();
  const [selectedDate, setSelectedDate] = useState(today);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());

  // Editing state
  const [editContent, setEditContent] = useState('');
  const [editMood, setEditMood] = useState<number | undefined>(undefined);
  const [editing, setEditing] = useState(false);

  // When day loads, sync editor
  const dayDate = day?.date;
  const dayContent = day?.user_entry?.content;
  const dayMood = day?.user_entry?.mood;

  // Select a date
  const handleSelectDate = (date: string) => {
    setSelectedDate(date);
    setEditing(false);
    onLoadDay(date);
  };

  // Navigate months
  const handlePrevMonth = () => {
    const m = viewMonth === 0 ? 11 : viewMonth - 1;
    const y = viewMonth === 0 ? viewYear - 1 : viewYear;
    setViewMonth(m);
    setViewYear(y);
    const range = getMonthRange(y, m);
    onLoadSummaries(range.from, range.to);
  };

  const handleNextMonth = () => {
    const m = viewMonth === 11 ? 0 : viewMonth + 1;
    const y = viewMonth === 11 ? viewYear + 1 : viewYear;
    setViewMonth(m);
    setViewYear(y);
    const range = getMonthRange(y, m);
    onLoadSummaries(range.from, range.to);
  };

  // Start editing
  const handleStartEdit = () => {
    setEditContent(dayContent ?? '');
    setEditMood(dayMood);
    setEditing(true);
  };

  // Save
  const handleSave = () => {
    onSaveUserEntry(selectedDate, editContent, editMood);
    setEditing(false);
  };

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const startDow = (firstDay.getDay() + 6) % 7; // Monday=0
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    const summaryMap = new Map(summaries.map(s => [s.date, s]));
    const cells: Array<{ date: string; day: number; summary?: DashboardJournalDaySummary } | null> = [];

    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ date, day: d, summary: summaryMap.get(date) });
    }

    return cells;
  }, [viewYear, viewMonth, summaries]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Journal</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Your thoughts and Ava's observations — side by side</p>
      </div>

      {/* Mini Calendar */}
      <div className="mb-6 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4">
        {/* Month nav */}
        <div className="flex items-center justify-between mb-3">
          <button onClick={handlePrevMonth} className="px-2 py-1 rounded-lg text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-input)] hover:text-white bg-transparent border-none cursor-pointer transition">
            &lt;
          </button>
          <span className="text-sm font-semibold text-white">{MONTH_NAMES[viewMonth]} {viewYear}</span>
          <button onClick={handleNextMonth} className="px-2 py-1 rounded-lg text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-input)] hover:text-white bg-transparent border-none cursor-pointer transition">
            &gt;
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAY_HEADERS.map(h => (
            <div key={h} className="text-center text-[10px] font-semibold text-[var(--text-muted)] py-1">{h}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((cell, i) => {
            if (!cell) return <div key={`empty-${i}`} />;

            const isSelected = cell.date === selectedDate;
            const isToday = cell.date === today;
            const hasUser = cell.summary?.has_user_entry;
            const hasAva = cell.summary?.has_ava_entry;

            return (
              <button
                key={cell.date}
                onClick={() => handleSelectDate(cell.date)}
                className={`relative flex flex-col items-center justify-center py-1.5 rounded-lg text-xs border-none cursor-pointer transition
                  ${isSelected
                    ? 'bg-[#A855F7] text-white'
                    : isToday
                      ? 'bg-[var(--bg-input)] text-white'
                      : 'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-input)]'
                  }`}
              >
                {cell.day}
                {/* Dot indicators */}
                {(hasUser || hasAva) && (
                  <div className="flex gap-0.5 mt-0.5">
                    {hasUser && <span className="w-1 h-1 rounded-full bg-white" />}
                    {hasAva && <span className="w-1 h-1 rounded-full bg-[#A855F7]" />}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 justify-center">
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
            <span className="w-1.5 h-1.5 rounded-full bg-white" /> You
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#A855F7]" /> Ava
          </div>
        </div>
      </div>

      {/* Split View */}
      <div className="grid grid-cols-2 gap-4">
        {/* User Journal — Left */}
        <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-white">Your Journal</h2>
            <span className="text-[10px] text-[var(--text-muted)]">{selectedDate}</span>
          </div>

          {editing ? (
            <>
              {/* Mood selector */}
              <div className="flex items-center gap-1 mb-3">
                <span className="text-[10px] text-[var(--text-muted)] mr-2">Mood:</span>
                {[1, 2, 3, 4, 5].map(m => (
                  <button
                    key={m}
                    onClick={() => setEditMood(editMood === m ? undefined : m)}
                    className={`w-7 h-7 rounded-full border-none cursor-pointer text-xs font-bold transition
                      ${editMood === m ? 'text-white' : 'text-[var(--text-muted)] hover:text-white'}`}
                    style={{
                      background: editMood === m ? MOOD_COLORS[m] : 'var(--bg-input)',
                    }}
                    title={MOOD_LABELS[m]}
                  >
                    {m}
                  </button>
                ))}
              </div>

              {/* Editor */}
              <textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                placeholder="How are you feeling? What happened today? Write freely..."
                className="w-full min-h-[200px] p-3 text-sm font-mono rounded-lg resize-y
                           bg-[var(--bg-input)] text-[var(--text-primary,var(--vscode-foreground))]
                           border border-[var(--border-card)]
                           outline-none focus:border-[#A855F7]/50 transition"
              />

              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleSave}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white border-none cursor-pointer transition"
                  style={{ background: '#A855F7' }}
                >
                  Save
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="px-4 py-1.5 rounded-lg text-xs text-[var(--text-secondary)] bg-transparent border border-[var(--border-card)] cursor-pointer hover:bg-[var(--bg-input)] transition"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : day?.user_entry ? (
            <>
              {day.user_entry.mood && (
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                    style={{ background: MOOD_COLORS[day.user_entry.mood] }}
                  >
                    {MOOD_LABELS[day.user_entry.mood]} ({day.user_entry.mood}/5)
                  </span>
                </div>
              )}
              <div className="text-sm leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap">
                {day.user_entry.content}
              </div>
              {day.user_entry.tags && day.user_entry.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-3">
                  {day.user_entry.tags.map(tag => (
                    <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] bg-[var(--bg-input)] text-[var(--text-muted)]">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
              <button
                onClick={handleStartEdit}
                className="mt-3 px-3 py-1 rounded-lg text-[10px] text-[var(--text-muted)] bg-transparent border border-[var(--border-card)] cursor-pointer hover:bg-[var(--bg-input)] hover:text-white transition"
              >
                Edit
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-[var(--text-muted)] mb-3">No entry for this day</p>
              <button
                onClick={handleStartEdit}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-white border-none cursor-pointer transition"
                style={{ background: '#A855F7' }}
              >
                Write Entry
              </button>
            </div>
          )}
        </div>

        {/* Ava Journal — Right (read-only) */}
        <div className="rounded-xl border border-[#A855F7]/20 bg-[var(--bg-card)] p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold" style={{ color: '#A855F7' }}>Ava's Journal</h2>
            <span className="text-[10px] text-[var(--text-muted)]">{selectedDate}</span>
          </div>

          {day?.ava_entry ? (
            <>
              <div className="text-sm leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap">
                {day.ava_entry.content}
              </div>
              {day.ava_entry.tags && day.ava_entry.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-3">
                  {day.ava_entry.tags.map(tag => (
                    <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ background: 'rgba(168,85,247,0.1)', color: '#A855F7' }}>
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-[var(--text-muted)]">Ava hasn't written anything for this day</p>
              <p className="text-[11px] text-[var(--text-muted)] mt-1 opacity-60">Ava writes her thoughts at the end of sessions</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
