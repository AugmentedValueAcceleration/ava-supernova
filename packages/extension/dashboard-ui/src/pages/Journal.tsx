import { useState } from 'react';
import { t, useLocale } from '../i18n';
import type { DashboardJournalDay } from '../types/messages';

type JournalTab = 'user' | 'ava';

interface JournalProps {
  day: DashboardJournalDay | null;
  selectedDate: string;
  userName: string | null;
  onSaveUserEntry: (date: string, content: string, mood?: number, tags?: string[]) => void;
  onDeleteUserEntry?: (date: string) => void;
  onDeleteAvaEntry?: (date: string) => void;
}

const MOOD_LABELS = ['', 'Rough', 'Low', 'Okay', 'Good', 'Great'];
const MOOD_COLORS = ['', '#ef4444', '#f59e0b', '#6b7280', '#3b82f6', '#34d399'];

function formatDate(iso: string): string {
  if (!iso || !iso.includes('-')) return iso || '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function Journal({ day, selectedDate, userName, onSaveUserEntry, onDeleteUserEntry, onDeleteAvaEntry }: JournalProps) {
  useLocale();
  const [tab, setTab] = useState<JournalTab>('user');
  const [editContent, setEditContent] = useState('');
  const [editMood, setEditMood] = useState<number | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<'user' | 'ava' | null>(null);

  const handleStartEdit = () => {
    setEditContent(day?.user_entry?.content ?? '');
    setEditMood(day?.user_entry?.mood);
    setEditing(true);
  };

  const handleSave = () => {
    onSaveUserEntry(selectedDate, editContent, editMood);
    setEditing(false);
  };

  const userTitle = userName ? `${userName}'s Journal` : 'Your Journal';

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-[var(--border-card)] mb-4">
        <button
          onClick={() => { setTab('user'); setEditing(false); }}
          className={`px-5 py-2.5 text-sm font-medium border-none cursor-pointer transition-all
            ${tab === 'user'
              ? 'text-white'
              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] bg-transparent'
            }`}
          style={{ borderBottom: tab === 'user' ? '2px solid #A855F7' : '2px solid transparent', background: 'transparent' }}
        >
          {userTitle}
          {day?.user_entry && (
            <span className="ml-2 w-1.5 h-1.5 rounded-full bg-white inline-block align-middle" />
          )}
        </button>
        <button
          onClick={() => { setTab('ava'); setEditing(false); }}
          className={`px-5 py-2.5 text-sm font-medium border-none cursor-pointer transition-all
            ${tab === 'ava'
              ? ''
              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] bg-transparent'
            }`}
          style={{
            borderBottom: tab === 'ava' ? '2px solid #A855F7' : '2px solid transparent',
            background: 'transparent',
            color: tab === 'ava' ? '#A855F7' : undefined,
          }}
        >
          {t('dash.journal.ava_entries')}
          {day?.ava_entry && (
            <span className="ml-2 w-1.5 h-1.5 rounded-full bg-[#A855F7] inline-block align-middle" />
          )}
        </button>
        <div className="flex-1" />
        {/* Delete buttons */}
        {tab === 'user' && day?.user_entry && onDeleteUserEntry && !editing && (
          confirmDelete === 'user' ? (
            <div className="self-center flex items-center gap-1.5 pr-2">
              <span className="text-[11px] text-red-400">Delete your entry?</span>
              <button onClick={() => { onDeleteUserEntry(selectedDate); setConfirmDelete(null); }}
                className="text-[11px] px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 cursor-pointer">Yes</button>
              <button onClick={() => setConfirmDelete(null)}
                className="text-[11px] px-2 py-0.5 rounded bg-[var(--bg-input)] text-[var(--text-muted)] border border-[var(--border-card)] hover:text-white cursor-pointer">No</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete('user')} title="Delete your entry"
              className="self-center mr-2 text-[var(--text-muted)] hover:text-red-400 cursor-pointer bg-transparent border-none transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </button>
          )
        )}
        {tab === 'ava' && day?.ava_entry && onDeleteAvaEntry && (
          confirmDelete === 'ava' ? (
            <div className="self-center flex items-center gap-1.5 pr-2">
              <span className="text-[11px] text-red-400">Delete Ava's entry?</span>
              <button onClick={() => { onDeleteAvaEntry(selectedDate); setConfirmDelete(null); }}
                className="text-[11px] px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 cursor-pointer">Yes</button>
              <button onClick={() => setConfirmDelete(null)}
                className="text-[11px] px-2 py-0.5 rounded bg-[var(--bg-input)] text-[var(--text-muted)] border border-[var(--border-card)] hover:text-white cursor-pointer">No</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete('ava')} title="Delete Ava's entry"
              className="self-center mr-2 text-[var(--text-muted)] hover:text-red-400 cursor-pointer bg-transparent border-none transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </button>
          )
        )}
        <span className="self-center text-[11px] text-[var(--text-muted)] pr-2">{formatDate(selectedDate)}</span>
      </div>

      {/* Content */}
      <div className="flex-1 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] flex flex-col overflow-hidden"
        style={tab === 'ava' ? { borderColor: 'rgba(168, 85, 247, 0.2)' } : undefined}
      >
        {tab === 'user' ? (
          <UserJournal
            entry={day?.user_entry ?? null}
            editing={editing}
            editContent={editContent}
            editMood={editMood}
            dateLabel={formatDate(selectedDate)}
            onStartEdit={handleStartEdit}
            onSave={handleSave}
            onCancel={() => setEditing(false)}
            onContentChange={setEditContent}
            onMoodChange={setEditMood}
          />
        ) : (
          <AvaJournal entry={day?.ava_entry ?? null} />
        )}
      </div>
    </div>
  );
}

// ── User Journal Pane ─────────────────────────────────────────────────────────

interface UserEntry {
  content: string;
  mood?: number;
  tags?: string[];
}

function UserJournal({
  entry,
  editing,
  editContent,
  editMood,
  dateLabel,
  onStartEdit,
  onSave,
  onCancel,
  onContentChange,
  onMoodChange,
}: {
  entry: UserEntry | null;
  editing: boolean;
  editContent: string;
  editMood: number | undefined;
  dateLabel: string;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onContentChange: (v: string) => void;
  onMoodChange: (m: number | undefined) => void;
}) {
  if (editing) {
    return (
      <div className="flex-1 p-5 flex flex-col">
        {/* Date indicator */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-medium text-[var(--text-secondary)]">Writing entry for <span className="text-white font-semibold">{dateLabel}</span></span>
        </div>

        {/* Mood selector */}
        <div className="flex items-center gap-1 mb-3">
          <span className="text-[10px] text-[var(--text-muted)] mr-2">Mood:</span>
          {[1, 2, 3, 4, 5].map(m => (
            <button
              key={m}
              onClick={() => onMoodChange(editMood === m ? undefined : m)}
              className={`w-8 h-8 rounded-full border-none cursor-pointer text-xs font-bold transition
                ${editMood === m ? 'text-white' : 'text-[var(--text-muted)] hover:text-white'}`}
              style={{ background: editMood === m ? MOOD_COLORS[m] : 'var(--bg-input)' }}
              title={MOOD_LABELS[m]}
            >
              {m}
            </button>
          ))}
        </div>

        <textarea
          value={editContent}
          onChange={(e) => onContentChange(e.target.value)}
          placeholder={t('dash.journal.write')}
          className="flex-1 w-full p-4 text-sm rounded-lg resize-none outline-none"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(168, 85, 247, 0.15)',
            color: 'var(--text-primary, var(--vscode-foreground, #e5e5e5))',
          }}
        />

        <div className="flex gap-2 mt-3">
          <button
            onClick={onSave}
            className="px-5 py-2 rounded-lg text-xs font-semibold text-white border-none cursor-pointer transition"
            style={{ background: '#A855F7' }}
          >
            Save Entry
          </button>
          <button
            onClick={onCancel}
            className="px-5 py-2 rounded-lg text-xs text-[var(--text-secondary)] bg-transparent border border-[var(--border-card)] cursor-pointer hover:bg-[var(--bg-input)] transition"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (entry) {
    return (
      <div className="flex-1 p-5 overflow-y-auto">
        {entry.mood && (
          <div className="mb-4">
            <span
              className="px-3 py-1 rounded-full text-xs font-bold text-white"
              style={{ background: MOOD_COLORS[entry.mood] }}
            >
              {MOOD_LABELS[entry.mood]} ({entry.mood}/5)
            </span>
          </div>
        )}
        <div className="text-sm leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap">
          {entry.content}
        </div>
        {entry.tags && entry.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-4">
            {entry.tags.map(tag => (
              <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] bg-[var(--bg-input)] text-[var(--text-muted)]">
                #{tag}
              </span>
            ))}
          </div>
        )}
        <button
          onClick={onStartEdit}
          className="mt-4 px-4 py-1.5 rounded-lg text-xs text-[var(--text-muted)] bg-transparent border border-[var(--border-card)] cursor-pointer hover:bg-[var(--bg-input)] hover:text-white transition"
        >
          Edit Entry
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="text-[var(--text-muted)] opacity-30 mb-3">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
      </svg>
      <p className="text-sm text-[var(--text-muted)] mb-4">{t('dash.journal.no_entries')}</p>
      <button
        onClick={onStartEdit}
        className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white border-none cursor-pointer transition"
        style={{ background: '#A855F7' }}
      >
        Write Entry
      </button>
    </div>
  );
}

// ── Ava Journal Pane ──────────────────────────────────────────────────────────

interface AvaEntry {
  content: string;
  tags?: string[];
}

function AvaJournal({ entry }: { entry: AvaEntry | null }) {
  if (entry) {
    return (
      <div className="flex-1 p-5 overflow-y-auto">
        <div className="text-sm leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap">
          {entry.content}
        </div>
        {entry.tags && entry.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-4">
            {entry.tags.map(tag => (
              <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ background: 'rgba(168,85,247,0.1)', color: '#A855F7' }}>
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#A855F7" strokeWidth={1.5} className="opacity-30 mb-3">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
      </svg>
      <p className="text-sm text-[var(--text-muted)]">{t('dash.journal.no_entries')}</p>
      <p className="text-[11px] text-[var(--text-muted)] mt-1 opacity-60">Ava writes her thoughts at the end of sessions</p>
    </div>
  );
}
