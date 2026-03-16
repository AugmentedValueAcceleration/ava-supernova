interface PersonaInfo {
  id: string;
  phase: 'active' | 'complete' | 'error';
  description?: string;
}

interface PersonaStatusProps {
  active: boolean;
  mode?: string;
  personas: PersonaInfo[];
}

const PERSONA_ICONS: Record<string, string> = {
  scout: '🔍',
  researcher: '🔬',
  architect: '📐',
  verifier: '✅',
  sequencer: '📋',
  challenger: '🎯',
  builder: '🔨',
  content_writer: '✍️',
  quiz_master: '❓',
  tutor: '👩‍🏫',
};

const PERSONA_LABELS: Record<string, string> = {
  scout: 'Scout',
  researcher: 'Researcher',
  architect: 'Architect',
  verifier: 'Verifier',
  sequencer: 'Sequencer',
  challenger: 'Challenger',
  builder: 'Builder',
  content_writer: 'Content Writer',
  quiz_master: 'Quiz Master',
  tutor: 'Tutor',
};

export function PersonaStatus({ active, mode, personas }: PersonaStatusProps) {
  if (!active && personas.length === 0) return null;

  const modeLabel = mode ? mode.charAt(0).toUpperCase() + mode.slice(1) : '';

  return (
    <div className="mx-3 mb-2 rounded-lg border border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] p-3 text-xs">
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--ava-purple, #a855f7)' }} />
        <span className="font-medium text-[var(--vscode-foreground)]">
          {active ? `Planning · ${modeLabel} team` : 'Planning complete'}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {personas.map((p) => (
          <span
            key={p.id}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
              p.phase === 'active'
                ? 'bg-[var(--ava-purple,#a855f7)] bg-opacity-20 text-[var(--ava-purple,#a855f7)]'
                : p.phase === 'complete'
                ? 'bg-[var(--vscode-terminal-ansiGreen)] bg-opacity-20 text-[var(--vscode-terminal-ansiGreen)]'
                : 'bg-[var(--vscode-errorForeground)] bg-opacity-20 text-[var(--vscode-errorForeground)]'
            }`}
          >
            <span>{PERSONA_ICONS[p.id] || '🤖'}</span>
            <span>{PERSONA_LABELS[p.id] || p.id}</span>
            {p.phase === 'active' && <span className="animate-pulse">…</span>}
            {p.phase === 'complete' && <span>✓</span>}
          </span>
        ))}
      </div>
    </div>
  );
}
