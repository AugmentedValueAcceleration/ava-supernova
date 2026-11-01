// Onboarding — rebuilt key-first (BYOK plan, agreed 1 Nov 2026).
//
// Four screens: Welcome (what Ava is + consent) → Your key (tested before it is
// saved) → About you (name + what brings you here) → Ready (one first thing to
// try). Ava has no accounts, so a working key is the only way in, and this is
// where it is set up. `mode: 'key'` shows only the key screen — for people who
// used Ava before this existed and have no key yet.
//
// The feature tour, work hours and the desktop intro moved out (tips as you go,
// Settings, the first time that mode opens). Paths: ../onboarding/flow (shared
// with the IDE). Copy: onboarding.* in core i18n.

import { useState, useEffect } from 'react';
import { t, tt, useLocale, getLocale, languageOptions } from '../i18n';
import { post } from '../App';
import { Icon } from './Icon';
import { Select } from './Select';
import { PATHS, pathById, type Destination, type OnboardingPath } from '../onboarding/flow';
import type { ExtToDashboardMessage, ProviderKeyStatus } from '../types/messages';

interface Props {
  mode: 'full' | 'key';
  providerKeys: ProviderKeyStatus;
  consentAccepted: boolean;
  userName: string | null;
  onRenameUser: (name: string | null) => void;
  /** Done or skipped. The host is told so it does not show this again. */
  onClose: () => void;
  onNavigate: (page: string) => void;
  onSetLanguage: (locale: string) => void;
}

type Step = 'welcome' | 'key' | 'about' | 'ready';
const ACCENT = 'var(--accent)';
const BTN = 'rounded-lg text-sm font-semibold cursor-pointer transition bg-[var(--accent)]/10 border border-[var(--accent)]/25 text-[var(--accent)] hover:bg-[var(--accent)]/20';

const DEST_PAGE: Record<Destination, string> = { chat: 'chat', journal: 'journal', learning: 'learning', health: 'health', home: 'overview' };

/**
 * Where each provider hands out keys. Every link was checked against the
 * provider's own docs on 1 Nov 2026 (international sites; all need a login).
 * MiniMax is not here on purpose: nothing in the extension uses its key now.
 */
const QWEN_KEY_URL = 'https://modelstudio.console.alibabacloud.com/ap-southeast-1/settings/api-key';
const OTHER_PROVIDERS: { id: string; name: string; url: string; note: string }[] = [
  { id: 'deepseek', name: 'DeepSeek', url: 'https://platform.deepseek.com/api_keys', note: 'Coding and reasoning — Supernova runs on it.' },
  { id: 'mistral', name: 'Mistral', url: 'https://console.mistral.ai/api-keys', note: 'European models — Aurora runs on them.' },
  { id: 'kimi', name: 'Kimi (Moonshot)', url: 'https://platform.kimi.ai/console/api-keys', note: 'Long context — Longxiang runs on it.' },
  { id: 'glm', name: 'GLM (Z.ai)', url: 'https://z.ai/manage-apikey/apikey-list', note: 'Open-weights coding models.' },
  { id: 'tencent', name: 'Tencent TokenHub (Hunyuan)', url: 'https://console.tencentcloud.com/tokenhub/apikey', note: 'Pick the Singapore region before creating the key.' },
  { id: 'nvidia', name: 'NVIDIA', url: 'https://build.nvidia.com/settings/api-keys', note: 'Keys start with nvapi-.' },
  { id: 'xiaomi', name: 'Xiaomi MiMo', url: 'https://platform.xiaomimimo.com/#/console/api-keys', note: 'Use a pay-as-you-go key (sk-), not a Token Plan key.' },
];
const BRAVE = { id: 'brave', name: 'Brave Search', url: 'https://api-dashboard.search.brave.com/app/keys' };

const hasModelKey = (keys: ProviderKeyStatus) => Object.entries(keys).some(([k, v]) => v && k !== 'brave');

export function WelcomeOnboarding({ mode, providerKeys, consentAccepted, userName, onRenameUser, onClose, onNavigate, onSetLanguage }: Props) {
  useLocale();
  const steps: Step[] = mode === 'key' ? ['key'] : ['welcome', 'key', 'about', 'ready'];
  const [idx, setIdx] = useState(0);
  const [agreed, setAgreed] = useState(consentAccepted);
  const [name, setName] = useState(userName ?? '');
  const [pathId, setPathId] = useState<string | null>(null);
  const step = steps[idx];
  const path = pathId ? pathById(pathId) : undefined;

  const finish = () => {
    post({ type: 'finish_onboarding' });
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finish(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const next = () => {
    if (step === 'welcome' && agreed && !consentAccepted) post({ type: 'accept_consent' });
    if (step === 'about') onRenameUser(name.trim() || null);
    if (idx === steps.length - 1) { finish(); return; }
    setIdx((i) => i + 1);
  };
  const back = () => setIdx((i) => Math.max(i - 1, 0));
  const canNext = step === 'welcome' ? agreed : step === 'key' ? hasModelKey(providerKeys) : true;

  const launch = () => {
    if (path) onNavigate(DEST_PAGE[path.destination]);
    finish();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div
        className="relative flex flex-col rounded-2xl border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] shadow-2xl overflow-hidden"
        style={{ width: 'min(980px, 94vw)', height: 'min(760px, 92vh)', background: 'var(--bg-card, #1a1020)' }}
      >
        <div className="flex items-center gap-2 px-6 py-4 border-b border-[rgba(255,255,255,0.06)]">
          {steps.length > 1 && steps.map((s, i) => (
            <span key={s} className="h-1.5 rounded-full transition-all" style={{ width: i === idx ? 28 : 8, background: i <= idx ? ACCENT : 'rgba(255,255,255,0.15)' }} />
          ))}
          <div className="flex-1" />
          {/* Language first, so everything after is in the user's language. */}
          <Select value={getLocale()} onChange={onSetLanguage} options={languageOptions()} size="sm" title={t('dash.settings.language')} />
          {step !== 'welcome' && (
            <button onClick={finish} className="text-xs text-[var(--text-muted)] hover:text-white bg-transparent border-none cursor-pointer">
              {step === 'key' ? tt('onb.key.later', "I'll add a key later") : t('onboarding.skip')}
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-8">
          {step === 'welcome' && <WelcomeStep agreed={agreed} onAgree={setAgreed} alreadyAccepted={consentAccepted} />}
          {step === 'key' && <KeyStep providerKeys={providerKeys} onLocalModel={() => { onNavigate('keys'); finish(); }} />}
          {step === 'about' && <AboutStep name={name} onName={setName} selected={pathId} onPick={(p) => setPathId(p.id)} />}
          {step === 'ready' && <ReadyStep path={path} />}
        </div>

        <div className="flex items-center gap-3 px-6 py-4 border-t border-[rgba(255,255,255,0.06)]">
          {steps.length > 1 && (
            <button onClick={back} disabled={idx === 0} className={`px-4 py-2 ${BTN} disabled:opacity-30`}>{t('onboarding.back')}</button>
          )}
          <div className="flex-1" />
          {step === 'ready' ? (
            <button onClick={launch} className={`px-6 py-2 ${BTN}`}>{t('onboarding.ready.go')}</button>
          ) : (
            <button onClick={next} disabled={!canNext} className={`px-6 py-2 ${BTN} disabled:opacity-40`}>
              {mode === 'key' ? tt('onb.done', 'Done') : t('onboarding.next')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 1. Welcome ───────────────────────────────────────────────────────────────

function WelcomeStep({ agreed, onAgree, alreadyAccepted }: { agreed: boolean; onAgree: (v: boolean) => void; alreadyAccepted: boolean }) {
  // Ava's headshot — the host injects a webview-safe URI on #root.
  const avatarUri = typeof document !== 'undefined' ? document.getElementById('root')?.dataset.avaAvatarUri : '';
  return (
    <div className="h-full flex flex-col items-center justify-center text-center max-w-2xl mx-auto">
      <div className="w-24 h-24 rounded-full mb-6 overflow-hidden flex items-center justify-center text-3xl" style={{ background: 'linear-gradient(135deg, var(--accent), #6366f1)', border: '1px solid color-mix(in srgb, var(--accent) 33%, transparent)' }}>
        {avatarUri
          ? <img src={avatarUri} alt="Ava" className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          : <Icon.sparkle size={30} />}
      </div>
      <h1 className="text-4xl font-semibold text-[var(--text-primary,#e5e5e5)] mb-4">{t('onboarding.identity.title')}</h1>
      <p className="text-base leading-relaxed text-[var(--text-secondary)] mb-2">{t('onboarding.identity.body')}</p>
      <p className="text-sm leading-relaxed text-[var(--text-muted)] mb-8">
        {tt('onb.welcome.tagline', 'Free and open source. Your keys. Your machine. Your work. Everything stays on this computer, and you pay your AI provider directly.')}
      </p>
      {!alreadyAccepted && (
        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer select-none">
          <input type="checkbox" checked={agreed} onChange={(e) => onAgree(e.target.checked)} />
          <span>
            {tt('onb.welcome.agree', 'I agree to the')}{' '}
            <a className="underline cursor-pointer" onClick={(e) => { e.preventDefault(); post({ type: 'open_url', url: 'https://avasupernova.com/terms' }); }}>{t('dash.support.terms')}</a>
            {' '}{tt('onb.welcome.and', 'and')}{' '}
            <a className="underline cursor-pointer" onClick={(e) => { e.preventDefault(); post({ type: 'open_url', url: 'https://avasupernova.com/privacy' }); }}>{t('dash.support.privacy')}</a>
          </span>
        </label>
      )}
    </div>
  );
}

// ── 2. Your key ──────────────────────────────────────────────────────────────

type TestState = { busy: boolean; result?: { status: 'valid' } | { status: 'invalid' | 'unverified'; message: string } };

/** One paste box: Test & save, then the verdict in plain words. */
function KeyBox({ provider, saved, placeholder }: { provider: string; saved: boolean; placeholder: string }) {
  const [value, setValue] = useState('');
  const [state, setState] = useState<TestState>({ busy: false });

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const msg = e.data as ExtToDashboardMessage;
      if (msg?.type === 'provider_key_tested' && msg.provider === provider) {
        setState({ busy: false, result: msg.result });
        if (msg.saved) setValue('');
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [provider]);

  const test = () => {
    if (!value.trim() || state.busy) return;
    setState({ busy: true });
    post({ type: 'test_provider_key', provider, apiKey: value.trim() });
  };

  const r = state.result;
  return (
    <div>
      <div className="flex gap-2">
        <input
          type="password"
          value={value}
          onChange={(e) => { setValue(e.target.value); if (r) setState({ busy: false }); }}
          onKeyDown={(e) => { if (e.key === 'Enter') test(); }}
          placeholder={saved ? tt('onb.key.saved_placeholder', 'Saved — paste a new key to replace it') : placeholder}
          className="flex-1 min-w-0 rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
          autoComplete="off"
          spellCheck={false}
        />
        <button onClick={test} disabled={!value.trim() || state.busy} className={`px-4 py-2 shrink-0 ${BTN} disabled:opacity-40`}>
          {state.busy ? tt('onb.key.testing', 'Testing…') : tt('onb.key.test', 'Test & save')}
        </button>
      </div>
      {(r || saved) && (
        <p className={`mt-1.5 text-xs ${r?.status === 'invalid' ? 'text-red-400' : r?.status === 'unverified' ? 'text-amber-400' : 'text-green-400'}`}>
          {r && r.status !== 'valid' ? r.message : tt('onb.key.works', 'Key works — saved on this machine.')}
        </p>
      )}
    </div>
  );
}

function LinkButton({ url, label }: { url: string; label: string }) {
  return (
    <button onClick={() => post({ type: 'open_url', url })} className="shrink-0 text-xs text-[var(--accent)] hover:underline bg-transparent border-none cursor-pointer p-0">
      {label} ↗
    </button>
  );
}

function KeyStep({ providerKeys, onLocalModel }: { providerKeys: ProviderKeyStatus; onLocalModel: () => void }) {
  const [showOthers, setShowOthers] = useState(false);
  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-semibold text-[var(--text-primary,#e5e5e5)] mb-1">{tt('onb.key.title', 'Your key')}</h2>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        {tt('onb.key.subtitle', 'Ava runs on your own AI provider key. It is tested here, then kept in VS Code’s secret storage on this machine — it never comes to us.')}
      </p>

      {/* Qwen first: one key covers chat, images, voice and video. */}
      <div className="rounded-xl border p-5 mb-4" style={{ borderColor: 'color-mix(in srgb, var(--accent) 40%, transparent)', background: 'color-mix(in srgb, var(--accent) 6%, transparent)' }}>
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">Qwen (Alibaba Model Studio)</span>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: ACCENT, background: 'color-mix(in srgb, var(--accent) 15%, transparent)' }}>{tt('onb.key.recommended', 'Recommended')}</span>
          </div>
          <LinkButton url={QWEN_KEY_URL} label={tt('onb.key.get_qwen', 'Get a Qwen key')} />
        </div>
        <p className="text-xs text-[var(--text-secondary)] mb-3">{tt('onb.key.qwen_desc', 'One key: chat, images, voice and video.')}</p>
        <KeyBox provider="qwen" saved={!!providerKeys.qwen} placeholder="sk-…" />
        <p className="mt-2 text-[11px] text-[var(--text-muted)]">
          {tt('onb.key.singapore', 'Make the key in the Singapore region (the switch at the top of Model Studio) — Ava uses the international endpoint, and a key from another region is refused.')}
        </p>
      </div>

      {/* Every other provider, each with its own key page. */}
      <button onClick={() => setShowOthers((v) => !v)} className="text-xs text-[var(--text-secondary)] hover:text-white bg-transparent border-none cursor-pointer p-0 mb-3">
        {showOthers ? '▾' : '▸'} {tt('onb.key.others', 'Use another provider instead (or as well)')}
      </button>
      {showOthers && (
        <div className="space-y-3 mb-4">
          {OTHER_PROVIDERS.map((p) => (
            <div key={p.id} className="rounded-xl border border-[var(--border-card)] p-4">
              <div className="flex items-center justify-between gap-3 mb-0.5">
                <span className="text-sm font-semibold text-white">{p.name}</span>
                <LinkButton url={p.url} label={tt('onb.key.get', 'Get a key')} />
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mb-2">{p.note}</p>
              <KeyBox provider={p.id} saved={!!providerKeys[p.id]} placeholder={tt('onb.key.paste', 'Paste the key')} />
            </div>
          ))}
          <div className="rounded-xl border border-[var(--border-card)] p-4 flex items-center justify-between gap-3">
            <div>
              <span className="text-sm font-semibold text-white">{tt('onb.key.local', 'A local or custom model')}</span>
              <p className="text-[11px] text-[var(--text-muted)]">{tt('onb.key.local_desc', 'Ollama, LM Studio, vLLM or any OpenAI-compatible server — set up in Settings.')}</p>
            </div>
            <button onClick={onLocalModel} className={`px-3 py-1.5 shrink-0 ${BTN}`}>{tt('onb.key.local_cta', 'Open Settings')}</button>
          </div>
        </div>
      )}

      {/* Web search: optional. DuckDuckGo works without any key. */}
      <div className="rounded-xl border border-[var(--border-card)] p-4">
        <div className="flex items-center justify-between gap-3 mb-0.5">
          <span className="text-sm font-semibold text-white">{BRAVE.name} <span className="text-[11px] font-normal text-[var(--text-muted)]">· {tt('onb.key.optional', 'optional')}</span></span>
          <LinkButton url={BRAVE.url} label={tt('onb.key.get', 'Get a key')} />
        </div>
        <p className="text-[11px] text-[var(--text-muted)] mb-2">{tt('onb.key.brave_desc', 'Better web search for Ava. Without it she searches with DuckDuckGo.')}</p>
        <KeyBox provider="brave" saved={!!providerKeys.brave} placeholder={tt('onb.key.paste', 'Paste the key')} />
      </div>
    </div>
  );
}

// ── 3. About you ─────────────────────────────────────────────────────────────

function AboutStep({ name, onName, selected, onPick }: { name: string; onName: (v: string) => void; selected: string | null; onPick: (p: OnboardingPath) => void }) {
  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-2xl font-semibold text-[var(--text-primary,#e5e5e5)] mb-1 text-center">{tt('onb.about.title', 'About you')}</h2>
      <p className="text-sm text-[var(--text-muted)] mb-5 text-center">{tt('onb.about.subtitle', 'Both optional. It stays on this machine.')}</p>
      <label className="block max-w-sm mx-auto mb-8">
        <span className="block text-xs text-[var(--text-secondary)] mb-1.5">{tt('onb.about.name', 'What should Ava call you?')}</span>
        <input
          value={name}
          onChange={(e) => onName(e.target.value)}
          maxLength={40}
          placeholder={t('general.profile.display_name_placeholder')}
          className="w-full rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
        />
      </label>
      <p className="text-sm font-semibold text-[var(--text-primary,#e5e5e5)] mb-3 text-center">{t('onboarding.path.title')}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {PATHS.map((p) => (
          <button key={p.id} onClick={() => onPick(p)} className="text-left p-4 rounded-xl border cursor-pointer transition flex items-start gap-3"
            style={{ borderColor: selected === p.id ? ACCENT : 'rgba(255,255,255,0.1)', background: selected === p.id ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent' }}>
            <span className="text-2xl">{p.icon}</span>
            <span>
              <span className="block text-sm font-semibold text-[var(--text-primary,#e5e5e5)] mb-0.5">{t(p.labelKey)}</span>
              <span className="block text-xs text-[var(--text-muted)] leading-relaxed">{t(p.blurbKey)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── 4. Ready ─────────────────────────────────────────────────────────────────

function ReadyStep({ path }: { path: OnboardingPath | undefined }) {
  // One suggested first thing for their path — the first of its examples.
  const first = path?.tailoredKeys[0];
  return (
    <div className="h-full flex flex-col items-center justify-center text-center max-w-2xl mx-auto">
      <div className="mb-4 flex justify-center text-[var(--accent)]"><Icon.rocket size={36} /></div>
      <h2 className="text-3xl font-semibold text-[var(--text-primary,#e5e5e5)] mb-3">{t('onboarding.ready.title')}</h2>
      {first ? (
        <>
          <p className="text-sm text-[var(--text-secondary)] mb-4">{tt('onb.ready.try', 'A good first thing to ask:')}</p>
          <code className="text-sm px-3 py-2 rounded-lg" style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)', color: ACCENT }}>{t(`${first}.example`)}</code>
        </>
      ) : (
        <p className="text-sm text-[var(--text-secondary)]">{tt('onb.ready.any', 'Ask Ava anything — she will tell you what she can do.')}</p>
      )}
    </div>
  );
}
