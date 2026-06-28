import { t, useLocale } from '../../i18n';

interface PersonaTool {
  name: string;
  done: boolean;
  success?: boolean;
}

interface PersonaInfo {
  id: string;
  phase: 'active' | 'complete' | 'error';
  description?: string;
  output?: string;
  tools?: PersonaTool[];
}

interface PersonaStatusProps {
  active: boolean;
  mode?: string | null;
  personas: PersonaInfo[];
}

const PERSONA_ICONS: Record<string, string> = {
  scout: '🔍',
  recon: '🛡️',
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

// i18n keys (resolved via t() at render — never call t() at module scope).
const PERSONA_LABEL_KEYS: Record<string, string> = {
  scout: 'dash.chat.persona_label.scout',
  recon: 'dash.chat.persona_label.recon',
  researcher: 'dash.chat.persona_label.researcher',
  architect: 'dash.chat.persona_label.architect',
  verifier: 'dash.chat.persona_label.verifier',
  sequencer: 'dash.chat.persona_label.sequencer',
  challenger: 'dash.chat.persona_label.challenger',
  builder: 'dash.chat.persona_label.builder',
  content_writer: 'dash.chat.persona_label.content_writer',
  quiz_master: 'dash.chat.persona_label.quiz_master',
  tutor: 'dash.chat.persona_label.tutor',
};

const PERSONA_VERB_KEYS: Record<string, string> = {
  scout: 'dash.chat.persona_verb.scout',
  recon: 'dash.chat.persona_verb.recon',
  researcher: 'dash.chat.persona_verb.researcher',
  architect: 'dash.chat.persona_verb.architect',
  verifier: 'dash.chat.persona_verb.verifier',
  sequencer: 'dash.chat.persona_verb.sequencer',
  challenger: 'dash.chat.persona_verb.challenger',
  builder: 'dash.chat.persona_verb.builder',
  content_writer: 'dash.chat.persona_verb.content_writer',
  quiz_master: 'dash.chat.persona_verb.quiz_master',
  tutor: 'dash.chat.persona_verb.tutor',
};

export function PersonaStatus({ active, mode, personas }: PersonaStatusProps) {
  useLocale();
  if (!active && personas.length === 0) return null;

  const modeLabel = mode ? mode.charAt(0).toUpperCase() + mode.slice(1) : '';
  const completedCount = personas.filter(p => p.phase === 'complete').length;
  const totalExpected = active ? Math.max(personas.length + 1, 3) : personas.length;

  return (
    <div className="mx-3 mb-2 rounded-lg border border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] overflow-hidden text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--vscode-panel-border)]">
        <div className="flex items-center gap-2">
          {active ? (
            <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--ava-purple, var(--accent))' }} />
          ) : (
            <span className="inline-block w-2 h-2 rounded-full bg-[var(--vscode-terminal-ansiGreen)]" />
          )}
          <span className="font-medium text-[var(--vscode-foreground)]">
            {active ? t('dash.chat.team_planning', { mode: modeLabel }) : t('dash.chat.planning_complete')}
          </span>
        </div>
        <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
          {completedCount}/{totalExpected}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 bg-[var(--vscode-panel-border)]">
        <div
          className="h-full transition-all duration-500 ease-out"
          style={{
            width: `${totalExpected > 0 ? (completedCount / totalExpected) * 100 : 0}%`,
            backgroundColor: 'var(--ava-purple, var(--accent))',
          }}
        />
      </div>

      {/* Persona timeline */}
      <div className="px-3 py-2 space-y-1.5">
        {personas.map((p) => (
          <PersonaRow key={p.id} persona={p} />
        ))}

        {/* Waiting indicator for next persona */}
        {active && personas.every(p => p.phase !== 'active') && (
          <div className="flex items-center gap-2 py-1 text-[var(--vscode-descriptionForeground)]">
            <span className="w-4 text-center animate-pulse">⏳</span>
            <span className="italic">{t('dash.chat.preparing_next_specialist')}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function PersonaRow({ persona }: { persona: PersonaInfo }) {
  useLocale();
  const icon = PERSONA_ICONS[persona.id] || '🤖';
  const labelKey = PERSONA_LABEL_KEYS[persona.id];
  const label = labelKey ? t(labelKey) : persona.id;
  const verbKey = PERSONA_VERB_KEYS[persona.id];
  const verb = verbKey ? t(verbKey) : t('dash.chat.persona_verb.default');
  const isActive = persona.phase === 'active';
  const isComplete = persona.phase === 'complete';
  const isError = persona.phase === 'error';

  return (
    <div className={`rounded-md px-2 py-1.5 transition-all ${
      isActive ? 'bg-[var(--ava-purple,var(--accent))]/10 border border-[var(--ava-purple,var(--accent))]/20' :
      isComplete ? 'bg-[var(--vscode-terminal-ansiGreen)]/5' :
      isError ? 'bg-[var(--vscode-errorForeground)]/5' : ''
    }`}>
      {/* Persona header */}
      <div className="flex items-center gap-2">
        <span className="w-4 text-center text-sm">{icon}</span>
        <span className={`font-semibold ${
          isActive ? 'text-[var(--ava-purple,var(--accent))]' :
          isComplete ? 'text-[var(--vscode-terminal-ansiGreen)]' :
          isError ? 'text-[var(--vscode-errorForeground)]' :
          'text-[var(--vscode-foreground)]'
        }`}>
          {label}
        </span>

        {isActive && (
          <span className="text-[var(--vscode-descriptionForeground)] animate-pulse">
            — {verb}...
          </span>
        )}

        {isComplete && (
          <span className="text-[var(--vscode-terminal-ansiGreen)]">✓</span>
        )}

        {isError && (
          <span className="text-[var(--vscode-errorForeground)]">✗</span>
        )}

        {/* Tool activity indicators */}
        {persona.tools && persona.tools.length > 0 && (
          <div className="flex items-center gap-1 ml-auto">
            {persona.tools.map((tool, i) => (
              <span
                key={i}
                title={tool.name}
                className={`inline-block w-1.5 h-1.5 rounded-full ${
                  !tool.done ? 'animate-pulse bg-[var(--ava-purple,var(--accent))]' :
                  tool.success ? 'bg-[var(--vscode-terminal-ansiGreen)]' :
                  'bg-[var(--vscode-errorForeground)]'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Active persona: show tools being used */}
      {isActive && persona.tools && persona.tools.length > 0 && (
        <div className="mt-1 ml-6 flex flex-wrap gap-1">
          {persona.tools.map((tool, i) => (
            <span
              key={i}
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono ${
                !tool.done
                  ? 'bg-[var(--ava-purple,var(--accent))]/15 text-[var(--ava-purple,var(--accent))]'
                  : tool.success
                  ? 'bg-[var(--vscode-terminal-ansiGreen)]/10 text-[var(--vscode-terminal-ansiGreen)]'
                  : 'bg-[var(--vscode-errorForeground)]/10 text-[var(--vscode-errorForeground)]'
              }`}
            >
              {!tool.done && <span className="animate-spin">⚙</span>}
              {tool.done && tool.success && <span>✓</span>}
              {tool.done && !tool.success && <span>✗</span>}
              {tool.name}
            </span>
          ))}
        </div>
      )}

      {/* Complete persona: show summary */}
      {isComplete && persona.output && (
        <p className="mt-1 ml-6 text-[10px] text-[var(--vscode-descriptionForeground)] line-clamp-2 leading-relaxed">
          {persona.output}
        </p>
      )}
    </div>
  );
}
