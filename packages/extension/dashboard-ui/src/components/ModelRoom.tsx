import { useEffect, useMemo, useState } from 'react';
import { post } from '../App';
import { tt } from '../i18n';
import type { DesignModelSummary } from '../types/messages';

import { LazyModelViewer } from './LazyModelViewer';

// ─── The 3D Model / Prop room's stage ───────────────────────────────────────
//
// The brief card and the model, side by side. Ava researches and proposes the
// brief (design_propose_model_brief); it lands here; he questions it with her
// in the dock, edits it on the card if he wants, and AGREES it here — the only
// place a brief becomes agreed, and design_build_model refuses until it is.
// Then each build lands in the viewer as she works.
//
// Models come from the host (list_models → models_listed), which follows every
// model's brief.json and the creative index, so the card and the viewer update
// on their own while Ava works.

export function ModelRoom({ onActiveModel }: { onActiveModel: (m: DesignModelSummary | null) => void }) {
  const [models, setModels] = useState<DesignModelSummary[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'models_listed') setModels(e.data.models as DesignModelSummary[]);
    };
    window.addEventListener('message', onMessage);
    post({ type: 'list_models' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // The model on the stage: the one he picked, else the most recently touched
  // — so a brief Ava has just proposed comes forward by itself.
  const active = useMemo(() => {
    if (!models?.length) return null;
    return models.find((m) => m.slug === picked) ?? models[0];
  }, [models, picked]);
  useEffect(() => { onActiveModel(active); }, [active, onActiveModel]);

  return (
    <div className="flex-1 min-h-0 px-6 py-5 flex flex-col overflow-hidden">
      <div className="mb-3 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-normal text-[var(--text-primary)]">{tt('dash.studio.model.title', '3D Model / Prop')}</h2>
          <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
            {tt('dash.studio.model.subtitle', 'Built in Blender on your computer — free. The brief comes first: Ava researches it, you agree it, then you build it together.')}
          </p>
        </div>
        {models && models.length > 1 && (
          <select
            value={active?.slug ?? ''}
            onChange={(e) => setPicked(e.target.value)}
            className="max-w-[220px] rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] px-2.5 py-1.5 text-[12px] text-[var(--text-primary)] outline-none"
            aria-label={tt('dash.studio.model.pick', 'Model')}
          >
            {models.map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}
          </select>
        )}
      </div>

      {models === null ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-[22px] h-[22px] rounded-full border-2 border-[var(--border-card)] border-t-[var(--accent)] animate-spin" role="status" aria-label="Loading" />
        </div>
      ) : !active ? (
        <div className="flex-1 rounded-xl border border-dashed border-[var(--border-card)] flex flex-col items-center justify-center gap-2 text-center px-10">
          <span className="text-3xl opacity-50">{'\u{1F9CA}'}</span>
          <p className="text-[13px] text-[var(--text-secondary)]">{tt('dash.studio.model.empty', 'Tell Ava what you want to make.')}</p>
          <p className="max-w-[440px] text-[12px] text-[var(--text-muted)] leading-relaxed">
            {tt('dash.studio.model.empty_sub', 'She’ll research real references and measurements, then put a brief here for you to question and agree before anything is built.')}
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid gap-4 overflow-hidden" style={{ gridTemplateColumns: 'minmax(280px, 380px) 1fr' }}>
          <BriefCard key={active.slug + (active.brief?.status ?? '')} model={active} />
          <div className="min-h-0 flex flex-col rounded-xl border border-[var(--border-card)] overflow-hidden">
            {active.built && active.glb_url ? (
              <LazyModelViewer fill src={active.glb_url} poster={active.preview_url} alt={active.name} />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-8 py-12">
                <p className="text-[13px] text-[var(--text-secondary)]">{tt('dash.studio.model.not_built', 'Nothing built yet.')}</p>
                <p className="max-w-[360px] text-[12px] text-[var(--text-muted)] leading-relaxed">
                  {active.brief?.status === 'agreed'
                    ? tt('dash.studio.model.not_built_agreed', 'The brief is agreed — Ava can start building. Each step appears here.')
                    : tt('dash.studio.model.not_built_brief', 'Once you agree the brief, Ava builds it here, step by step.')}
                </p>
              </div>
            )}
            {active.built && active.creative_id && (
              <div className="shrink-0 flex flex-wrap items-center gap-2 border-t border-[var(--border-card)] px-3 py-2">
                <button
                  onClick={() => post({ type: 'open_model_in_blender', id: active.creative_id! })}
                  className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 transition"
                >
                  {tt('library.model.open_in_blender', 'Open in Blender')}
                </button>
                <button
                  onClick={() => post({ type: 'reveal_creative', id: active.creative_id! })}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition"
                >
                  {tt('library.model.open_folder', 'Open folder')}
                </button>
                <span className="ml-auto text-[11px] text-[var(--text-muted)]">
                  {[active.size_m?.length === 3 ? `${active.size_m.map((n) => +n.toFixed(2)).join(' × ')} m` : '',
                    typeof active.triangles === 'number' ? `${active.triangles.toLocaleString()} tris` : ''].filter(Boolean).join(' · ')}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Say it to Ava in the design chat, as him (Chat.tsx listens on the design lane). */
function sayToAva(text: string) {
  window.dispatchEvent(new CustomEvent('ava-design-say', { detail: { text } }));
}

const pendingAgree = new Set<string>();

function BriefCard({ model }: { model: DesignModelSummary }) {
  const brief = model.brief;
  useEffect(() => {
    if (brief?.status === 'agreed' && pendingAgree.delete(model.slug)) {
      sayToAva(`I've agreed the brief for "${model.name}" — go ahead and start building.`);
    }
  }, [brief?.status, model.slug, model.name]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries((brief?.fields ?? []).map((f) => [f.key, f.value])),
  );

  if (!brief) {
    return (
      <div className="min-h-0 rounded-xl border border-[var(--border-card)] p-4 flex flex-col gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{tt('dash.studio.model.brief', 'The brief')}</p>
        <p className="text-[12px] text-[var(--text-secondary)]">{tt('dash.studio.model.brief_none', 'Ava hasn’t proposed a brief for this model yet.')}</p>
      </div>
    );
  }

  const agreed = brief.status === 'agreed';
  const save = () => {
    const changed = (brief?.fields ?? []).filter((f) => (draft[f.key] ?? '').trim() !== f.value).map((f) => f.label.toLowerCase());
    post({ type: 'save_model_brief', slug: model.slug, fields: draft });
    setEditing(false);
    if (changed.length) sayToAva(`I've edited the brief for "${model.name}" — I changed ${changed.join(', ')}. Have a look at my version.`);
  };
  // Tell Ava only once the agreement is on disk — the host confirms by sending
  // the models back with this brief 'agreed' (the card remounts on that, keyed
  // by status). Saying it first could start her turn before the build tool
  // can see the agreement, and it would refuse.
  const agree = () => {
    pendingAgree.add(model.slug);
    post({ type: 'agree_model_brief', slug: model.slug });
  };

  return (
    <div className="min-h-0 rounded-xl border border-[var(--border-card)] flex flex-col overflow-hidden">
      <div className="shrink-0 flex items-center gap-2 border-b border-[var(--border-card)] px-4 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{tt('dash.studio.model.brief', 'The brief')}</p>
        <span
          className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={agreed
            ? { background: 'rgba(52,211,153,0.12)', color: '#34d399' }
            : { background: 'rgba(240,162,75,0.14)', color: '#f0a24b' }}
        >
          {agreed ? tt('dash.studio.model.agreed', 'Agreed') : tt('dash.studio.model.proposed', 'Waiting for you')}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2.5">
        {brief.fields.map((f) => (
          <div key={f.key}>
            <p className="text-[10.5px] text-[var(--text-muted)]">{f.label}</p>
            {editing ? (
              <textarea
                value={draft[f.key] ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                rows={Math.min(4, Math.max(1, Math.ceil((draft[f.key]?.length ?? 0) / 42)))}
                className="mt-0.5 w-full resize-y rounded-md border border-[var(--border-card)] bg-[var(--bg-input)] px-2 py-1 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/50"
              />
            ) : (
              <p className="text-[12px] text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">{f.value || '—'}</p>
            )}
          </div>
        ))}
        {brief.reasoning && !editing && (
          <div className="mt-1 rounded-lg bg-[var(--bg-input)] px-3 py-2">
            <p className="text-[10.5px] text-[var(--text-muted)]">{tt('dash.studio.model.reasoning', 'Ava’s reasoning')}</p>
            <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">{brief.reasoning}</p>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-[var(--border-card)] px-4 py-2.5 flex flex-wrap items-center gap-2">
        {editing ? (
          <>
            <button onClick={save} className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 transition">
              {tt('dash.studio.model.save', 'Save changes')}
            </button>
            <button onClick={() => setEditing(false)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition">
              {tt('dash.studio.model.cancel', 'Cancel')}
            </button>
          </>
        ) : (
          <>
            {!agreed && (
              <button
                onClick={agree}
                className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 transition"
              >
                {tt('dash.studio.model.agree', 'Agree the brief')}
              </button>
            )}
            <button onClick={() => setEditing(true)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition">
              {tt('dash.studio.model.edit', 'Edit')}
            </button>
            <span className="text-[10.5px] text-[var(--text-muted)]">
              {agreed
                ? tt('dash.studio.model.agreed_hint', 'Changing it means agreeing it again.')
                : brief.edited_by_person
                ? tt('dash.studio.model.edited_hint', 'You edited this — agree it when it’s right.')
                : tt('dash.studio.model.proposed_hint', 'Question it with Ava below, then agree.')}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
