import { useState } from 'react';

/**
 * A compact, dark-themed month calendar that mirrors the sidebar mini-calendar
 * (NavSidebar's TaskCalendar) so date pickers across the dashboard share one
 * look instead of falling back to the native (light) browser date input.
 */
interface MiniDatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (iso: string) => void;
}

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function MiniDatePicker({ value, onChange }: MiniDatePickerProps) {
  const base = value ? new Date(`${value}T00:00:00`) : new Date();
  const [view, setView] = useState({ y: base.getFullYear(), m: base.getMonth() }); // m: 0-11

  const todayStr = new Date().toISOString().slice(0, 10);
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const firstDay = new Date(view.y, view.m, 1).getDay();
  const label = new Date(view.y, view.m, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const step = (delta: number) => setView((v) => {
    const d = new Date(v.y, v.m + delta, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const stepYear = (delta: number) => setView((v) => ({ y: v.y + delta, m: v.m }));

  const navBtn = 'text-[var(--text-muted)] bg-transparent border-none cursor-pointer hover:text-white px-1 leading-none';

  return (
    <div className="rounded-xl border border-[var(--border-card)] p-3 shadow-2xl" style={{ width: 220, background: '#1b1230' }}>
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center">
          <button onClick={() => stepYear(-1)} title="Previous year" className={`${navBtn} text-[13px]`}>{'«'}</button>
          <button onClick={() => step(-1)} title="Previous month" className={`${navBtn} text-xs`}>{'‹'}</button>
        </span>
        <span className="text-[11px] font-medium text-[var(--text-secondary)]">{label}</span>
        <span className="flex items-center">
          <button onClick={() => step(1)} title="Next month" className={`${navBtn} text-xs`}>{'›'}</button>
          <button onClick={() => stepYear(1)} title="Next year" className={`${navBtn} text-[13px]`}>{'»'}</button>
        </span>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center mb-1">
        {DOW.map((d, i) => <span key={i} className="text-[9px] text-[var(--text-muted)]">{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
        {days.map((day) => {
          const iso = `${view.y}-${String(view.m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isToday = iso === todayStr;
          const isSelected = iso === value;
          return (
            <button
              key={day}
              onClick={() => onChange(iso)}
              className="flex items-center justify-center border-none cursor-pointer transition mx-auto hover:bg-white/10"
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                fontSize: 11,
                background: isSelected ? 'var(--accent)' : isToday ? 'rgba(168,85,247,0.2)' : 'transparent',
                color: isSelected ? '#fff' : isToday ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
