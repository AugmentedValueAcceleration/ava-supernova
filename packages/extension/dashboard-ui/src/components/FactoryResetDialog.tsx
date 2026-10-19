/**
 * Factory reset — the dialog.
 *
 * Its job is not to enable a reset. It is to stop the wrong one. Everything
 * here exists because of a specific way this goes badly:
 *
 *  • Sizes next to every row, because "Projects (19.0 GB)" stops a hand that
 *    "Projects" does not.
 *  • Your source code unticked, bottom of the list, in red, behind a typed
 *    confirmation. It is the only thing here that cannot be re-earned.
 *  • A backup offer first — and an explicit warning that the backup does NOT
 *    include your projects, because someone who backs up, ticks Projects and
 *    loses their code believing it was saved is the worst outcome this
 *    feature can produce.
 */
import { useEffect, useMemo, useState } from 'react';
import { tt } from '../i18n';
import { post } from '../App';

type Severity = 'ordinary' | 'permanent' | 'irreversible';

interface CatMeta { id: string; severity: Severity; defaultSelected: boolean }
interface CatSize { id: string; bytes: number; approximate: boolean; empty: boolean }

interface Props { open: boolean; onClose: () => void }

const CONFIRM_WORD = 'DELETE';

function formatBytes(n: number): string {
  if (n <= 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / Math.pow(1024, i);
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
}

export function FactoryResetDialog({ open, onClose }: Props) {
  const [cats, setCats] = useState<CatMeta[]>([]);
  const [sizes, setSizes] = useState<Record<string, CatSize>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [scanning, setScanning] = useState(true);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<null | {
    ok: boolean; removed?: number; bytesFreed?: number;
    failed?: { path: string; reason: string }[]; error?: string;
  }>(null);
  const [backupState, setBackupState] = useState<'idle' | 'running' | 'done'>('idle');
  const [passphrase, setPassphrase] = useState('');

  useEffect(() => {
    if (!open) return;
    setScanning(true);
    setReport(null);
    setConfirmText('');
    setBackupState('idle');
    post({ type: 'factory_reset_scan' });
  }, [open]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const m = e.data;
      if (m?.type === 'factory_reset_scanned') {
        setCats(m.categories ?? []);
        setSizes(Object.fromEntries((m.sizes ?? []).map((s: CatSize) => [s.id, s])));
        setSelected(Object.fromEntries(
          (m.categories ?? []).map((c: CatMeta) => [c.id, c.defaultSelected]),
        ));
        setScanning(false);
      }
      if (m?.type === 'factory_reset_done') { setReport(m); setBusy(false); }
      if (m?.type === 'backup_done') { setBackupState(m.ok ? 'done' : 'idle'); }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const label = (id: string) => tt(`dash.reset.cat.${id}`, FALLBACK_LABEL[id] ?? id);
  const desc = (id: string) => tt(`dash.reset.cat.${id}.desc`, FALLBACK_DESC[id] ?? '');

  const chosen = useMemo(() => cats.filter(c => selected[c.id]), [cats, selected]);
  const needsTyping = chosen.some(c => c.severity === 'irreversible');
  const totalBytes = chosen.reduce((a, c) => a + (sizes[c.id]?.bytes ?? 0), 0);
  const anyApprox = chosen.some(c => sizes[c.id]?.approximate);
  const canGo = chosen.length > 0 && !busy
    && (!needsTyping || confirmText.trim().toUpperCase() === CONFIRM_WORD);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-red-500/40 bg-[var(--bg-card)] p-6 shadow-2xl">

        <h2 className="text-lg font-semibold text-red-400">
          {tt('dash.reset.title', 'Factory reset')}
        </h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          {tt('dash.reset.subtitle',
            'Choose what to erase. Anything you leave unticked is kept exactly as it is.')}
        </p>

        {report ? (
          <ResultPanel report={report} tt={tt} onClose={onClose} />
        ) : scanning ? (
          <p className="py-10 text-center text-sm text-[var(--text-muted)]">
            {tt('dash.reset.scanning', 'Measuring what is on disk…')}
          </p>
        ) : (
          <>
            {/* ── Back up first ─────────────────────────────────────────── */}
            <div className="mt-4 rounded-xl border border-[var(--border-card)] p-4">
              <p className="text-sm font-semibold">
                {tt('dash.reset.backup_title', 'Back up first?')}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {tt('dash.reset.backup_desc',
                  'Save an encrypted .ava-backup file you can restore later.')}
              </p>
              {/* The single most important sentence in this dialog. */}
              <p className="mt-2 text-xs font-semibold text-amber-400">
                {tt('dash.reset.backup_excludes_projects',
                  'The backup does NOT include your projects folder — your source code. Copy that yourself if you intend to delete it.')}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder={tt('dash.reset.passphrase', 'Passphrase')}
                  className="flex-1 rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] px-3 py-2 text-xs"
                />
                <button
                  disabled={!passphrase || backupState === 'running'}
                  onClick={() => {
                    setBackupState('running');
                    post({ type: 'export_encrypted_backup', passphrase } as never);
                  }}
                  className="rounded-lg border border-[var(--border-card)] px-3 py-2 text-xs font-semibold disabled:opacity-40"
                >
                  {backupState === 'running'
                    ? tt('dash.reset.backup_running', 'Saving…')
                    : backupState === 'done'
                      ? tt('dash.reset.backup_done', 'Saved ✓')
                      : tt('dash.reset.backup_now', 'Back up')}
                </button>
              </div>
            </div>

            {/* ── What to erase ─────────────────────────────────────────── */}
            <div className="mt-4 space-y-1">
              {cats.map(c => {
                const sz = sizes[c.id];
                const irreversible = c.severity === 'irreversible';
                return (
                  <label
                    key={c.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                      irreversible
                        ? 'border-red-500/40 bg-red-500/5 hover:bg-red-500/10'
                        : 'border-[var(--border-card)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={!!selected[c.id]}
                      onChange={(e) => setSelected(s => ({ ...s, [c.id]: e.target.checked }))}
                      className="mt-0.5 h-4 w-4 accent-red-500"
                    />
                    <span className="flex-1">
                      <span className={`block text-sm font-medium ${irreversible ? 'text-red-400' : ''}`}>
                        {label(c.id)}
                        {sz && !sz.empty && (
                          <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">
                            {sz.approximate ? '≥ ' : ''}{formatBytes(sz.bytes)}
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-[var(--text-muted)]">{desc(c.id)}</span>
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between text-xs">
              <button
                onClick={() => setSelected(Object.fromEntries(cats.map(c => [c.id, true])))}
                className="text-[var(--text-muted)] underline hover:text-[var(--text-primary)]"
              >
                {tt('dash.reset.select_all', 'Select everything (full wipe)')}
              </button>
              <span className="text-[var(--text-muted)]">
                {tt('dash.reset.total', 'Frees')}{' '}
                {anyApprox ? '≥ ' : ''}{formatBytes(totalBytes)}
              </span>
            </div>

            {needsTyping && (
              <div className="mt-4 rounded-xl border border-red-500/50 bg-red-500/5 p-4">
                <p className="text-xs font-semibold text-red-400">
                  {tt('dash.reset.typed_warning',
                    'You have selected your projects folder. This is your own source code and it cannot be undone or restored from a backup.')}
                </p>
                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={CONFIRM_WORD}
                  className="mt-2 w-full rounded-lg border border-red-500/40 bg-[var(--bg-input)] px-3 py-2 text-xs"
                />
                <p className="mt-1 text-[10px] text-red-400/70">
                  {tt('dash.reset.typed_hint', 'Type DELETE to confirm.')}
                </p>
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-lg border border-[var(--border-card)] px-4 py-2 text-xs font-semibold"
              >
                {tt('dash.reset.cancel', 'Cancel')}
              </button>
              <button
                disabled={!canGo}
                onClick={() => {
                  setBusy(true);
                  post({ type: 'factory_reset_execute', categories: chosen.map(c => c.id) });
                }}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-red-500 disabled:opacity-40"
              >
                {busy
                  ? tt('dash.reset.running', 'Erasing…')
                  : tt('dash.reset.go', 'Erase selected')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ResultPanel({ report, tt, onClose }: {
  report: { ok: boolean; removed?: number; bytesFreed?: number; failed?: { path: string; reason: string }[]; error?: string };
  tt: (k: string, f: string) => string;
  onClose: () => void;
}) {
  return (
    <div className="mt-5">
      <p className={`text-sm font-semibold ${report.ok ? 'text-emerald-400' : 'text-amber-400'}`}>
        {report.ok
          ? tt('dash.reset.result_ok', 'Done.')
          : tt('dash.reset.result_partial', 'Finished, but some items could not be removed.')}
      </p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        {report.removed ?? 0} {tt('dash.reset.result_items', 'items removed')}
        {report.bytesFreed ? ` · ${formatBytes(report.bytesFreed)} ${tt('dash.reset.result_freed', 'freed')}` : ''}
      </p>
      {/* Named, not counted. "3 failed" leaves someone guessing which three. */}
      {!!report.failed?.length && (
        <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-amber-500/30 p-3">
          {report.failed.map((f, i) => (
            <li key={i} className="text-[11px] text-amber-400/90">
              <span className="font-mono">{f.path}</span> — {f.reason}
            </li>
          ))}
        </ul>
      )}
      {report.error && <p className="mt-2 text-xs text-red-400">{report.error}</p>}
      <p className="mt-3 text-xs text-[var(--text-muted)]">
        {tt('dash.reset.reload_note',
          'If settings were cleared, the window reloads in a moment and Ava starts from onboarding.')}
      </p>
      <div className="mt-5 flex justify-end">
        <button
          onClick={onClose}
          className="rounded-lg border border-[var(--border-card)] px-4 py-2 text-xs font-semibold"
        >
          {tt('dash.reset.close', 'Close')}
        </button>
      </div>
    </div>
  );
}

/**
 * English fallbacks. The i18n keys are authoritative; these keep the dialog
 * readable in a locale that has not been translated yet — which for a
 * destructive dialog is not a cosmetic concern.
 */
const FALLBACK_LABEL: Record<string, string> = {
  logs: 'Logs and diagnostics',
  caches: 'Downloaded models and binaries',
  memory: 'Everything Ava knows about you',
  conversations: 'Conversations, journal, tasks and health',
  profile: 'Your profile and Ava’s personality',
  datasets: 'Captured training data',
  project_data: 'What Ava knows about your projects',
  credentials: 'API keys and sign-in',
  settings: 'Settings, onboarding and consent',
  projects: 'Your projects folder — YOUR SOURCE CODE',
};

const FALLBACK_DESC: Record<string, string> = {
  logs: 'Audit log and debug output. Nothing you would miss.',
  caches: 'Re-downloaded automatically when next needed.',
  memory: 'Memories, procedures and everything learned about how you work.',
  conversations: 'Every chat transcript, journal entry, task and health record.',
  profile: 'Your details, Ava’s personality and her avatar.',
  datasets: 'The only copy. Generated from your usage.',
  project_data: 'The project registry and notes — not the projects themselves.',
  credentials: 'Every provider key and your platform sign-in.',
  settings: 'Clears these and Ava starts from onboarding, like a fresh install.',
  projects: 'The actual code you have written. This cannot be undone and is NOT in the backup.',
};
