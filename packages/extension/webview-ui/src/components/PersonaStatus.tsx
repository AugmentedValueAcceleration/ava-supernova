import { t, useLocale } from '../i18n';
import type { StringKey } from '../locales/en';

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
  mode?: string;
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

/**
 * Known persona ids — used to guard dynamic `persona.label.{id}` /
 * `persona.verb.{id}` key lookups so TypeScript confirms both maps exist.
 */
const PERSONA_IDS = [
  'scout', 'recon', 'researcher', 'architect', 'verifier', 'sequencer',
  'challenger', 'builder', 'content_writer', 'quiz_master', 'tutor',
] as const;
type PersonaId = (typeof PERSONA_IDS)[number];

function personaLabel(id: string): string {
  if ((PERSONA_IDS as readonly string[]).includes(id)) {
    return t(`persona.label.${id as PersonaId}` as StringKey);
  }
  return id;
}

function personaVerb(id: string): string {
  if ((PERSONA_IDS as readonly string[]).includes(id)) {
    return t(`persona.verb.${id as PersonaId}` as StringKey);
  }
  return t('persona.verb.default');
}

export function PersonaStatus({ active, mode, personas }: PersonaStatusProps) {
  useLocale();
  if (!active && personas.length === 0) return null;

  // Reuse existing mode labels from input.mode.* (already translated).
  const modeKey = mode ? `input.mode.${mode}` as StringKey : null;
  const modeLabel = modeKey ? t(modeKey) : '';
  const completedCount = personas.filter(p => p.phase === 'complete').length;
  const totalExpected = active ? Math.max(personas.length + 1, 3) : personas.length;

  return (
    <div className="mx-3 mb-2 rounded-lg border border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] overflow-hidden text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--vscode-panel-border)]">
        <div className="flex items-center gap-2">
          {active ? (
            <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--ava-purple, #a855f7)' }} />
          ) : (
            <span className="inline-block w-2 h-2 rounded-full bg-[var(--vscode-terminal-ansiGreen)]" />
          )}
          <span className="font-medium text-[var(--vscode-foreground)]">
            {active ? t('persona.team_planning', { mode: modeLabel }) : t('persona.complete')}
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
            backgroundColor: 'var(--ava-purple, #a855f7)',
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
            <span className="italic">{t('persona.preparing_next')}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function PersonaRow({ persona }: { persona: PersonaInfo }) {
  const icon = PERSONA_ICONS[persona.id] || '🤖';
  const label = personaLabel(persona.id);
  const verb = personaVerb(persona.id);
  const isActive = persona.phase === 'active';
  const isComplete = persona.phase === 'complete';
  const isError = persona.phase === 'error';

  return (
    <div className={`rounded-md px-2 py-1.5 transition-all ${
      isActive ? 'bg-[var(--ava-purple,#a855f7)]/10 border border-[var(--ava-purple,#a855f7)]/20' :
      isComplete ? 'bg-[var(--vscode-terminal-ansiGreen)]/5' :
      isError ? 'bg-[var(--vscode-errorForeground)]/5' : ''
    }`}>
      {/* Persona header */}
      <div className="flex items-center gap-2">
        <span className="w-4 text-center text-sm">{icon}</span>
        <span className={`font-semibold ${
          isActive ? 'text-[var(--ava-purple,#a855f7)]' :
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
            {persona.tools.map((t, i) => (
              <span
                key={i}
                title={t.name}
                className={`inline-block w-1.5 h-1.5 rounded-full ${
                  !t.done ? 'animate-pulse bg-[var(--ava-purple,#a855f7)]' :
                  t.success ? 'bg-[var(--vscode-terminal-ansiGreen)]' :
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
          {persona.tools.map((t, i) => (
            <span
              key={i}
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono ${
                !t.done
                  ? 'bg-[var(--ava-purple,#a855f7)]/15 text-[var(--ava-purple,#a855f7)]'
                  : t.success
                  ? 'bg-[var(--vscode-terminal-ansiGreen)]/10 text-[var(--vscode-terminal-ansiGreen)]'
                  : 'bg-[var(--vscode-errorForeground)]/10 text-[var(--vscode-errorForeground)]'
              }`}
            >
              {!t.done && <span className="animate-spin">⚙</span>}
              {t.done && t.success && <span>✓</span>}
              {t.done && !t.success && <span>✗</span>}
              {t.name}
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
