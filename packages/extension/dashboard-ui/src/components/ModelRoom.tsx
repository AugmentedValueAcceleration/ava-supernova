import { useEffect, useMemo, useRef, useState } from 'react';
import { post } from '../App';
import { tt } from '../i18n';
import type { DesignModelSummary } from '../types/messages';

import { LazyModelViewer } from './LazyModelViewer';
import { Select } from './Select';

// ─── The Blender (Headless) room's stage ───────────────────────────────────────
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

/** What differs between the two rooms. Everything else — the brief card, the
 *  agreement, the picker — is one component, so the rules cannot drift. */
const ROOMS = {
  blender: {
    list: 'list_models', listed: 'models_listed', agree: 'agree_model_brief', save: 'save_model_brief',
    titleKey: 'dash.studio.model.title', title: 'Blender (Headless)',
    subtitleKey: 'dash.studio.model.subtitle', subtitle: 'Built in Blender on your computer — free. The brief comes first: Ava researches it, you agree it, then you build it together.',
    openKey: 'library.model.open_in_blender', open: 'Open in Blender',
    emptySub: 'She\u2019ll research real references and measurements, then put a brief here for you to question and agree before anything is built.',
  },
  gimp: {
    list: 'list_image_work', listed: 'image_work_listed', agree: 'agree_image_brief', save: 'save_image_brief',
    titleKey: 'dash.studio.gimp.title', title: 'GIMP (Headless)',
    subtitleKey: 'dash.studio.gimp.subtitle', subtitle: 'Made in GIMP on your computer — free. The brief comes first, and you keep layered files you can open and change yourself.',
    openKey: 'library.gimp.open_in_gimp', open: 'Open in GIMP',
    emptySub: 'Icons, sets, game UI, sprites, textures, web graphics. She\u2019ll put a brief here for you to question and agree before anything is made.',
  },
} as const;

/** What really exists in the room, checked this moment: the one thing a memory
 *  cannot tell her. Her notes outlive the work, so without this she describes
 *  deleted pieces as still on disk (4 Nov 2026). */
export function roomRoster(names: string[]): string {
  return names.length
    ? `Everything that exists in this room right now: ${names.map((n) => `"${n}"`).join(', ')}.`
    : 'This room is EMPTY right now: no briefs, no files, nothing on disk.';
}

export function ModelRoom({ tool = 'blender', busy = false, onActiveModel, onRoster }: { tool?: keyof typeof ROOMS; busy?: boolean; onActiveModel: (m: DesignModelSummary | null) => void; onRoster?: (names: string[]) => void }) {
  const room = ROOMS[tool];
  const [models, setModels] = useState<DesignModelSummary[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  // The stage is cleared by New brief, and stays clear until a new piece of
  // work appears. A slug we have not seen comes forward by itself, even if an
  // older piece was picked in the dropdown: that pick used to stick and hide it.
  const [fresh, setFresh] = useState(false);
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!models) { known.current = null; return; }
    const seen = known.current;
    if (seen && models.some((m) => !seen.has(m.slug))) { setPicked(null); setFresh(false); }
    known.current = new Set(models.map((m) => m.slug));
  }, [models]);
  // The are-you-sure, tied to one slug so it can never carry over to another
  // piece if the stage changes while it is open.
  const [confirming, setConfirming] = useState<string | null>(null);
  const startNew = () => {
    setFresh(true);
    window.dispatchEvent(new CustomEvent('ava-design-new'));
  };

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === room.listed) setModels(e.data.models as DesignModelSummary[]);
      if (e.data?.type === 'image_art_added') sayToAva(`I've added my art: ${e.data.file}. Use it to test the work against.`);
    };
    window.addEventListener('message', onMessage);
    setModels(null);
    post({ type: room.list });
    return () => window.removeEventListener('message', onMessage);
  }, [room]);

  // The model on the stage: the one he picked, else the most recently touched
  // — so a brief Ava has just proposed comes forward by itself.
  const active = useMemo(() => {
    if (!models?.length || fresh) return null;
    return models.find((m) => m.slug === picked) ?? models[0];
  }, [models, picked, fresh]);
  useEffect(() => { onActiveModel(active); }, [active, onActiveModel]);
  useEffect(() => { if (models) onRoster?.(models.map((m) => m.name)); }, [models, onRoster]);

  return (
    <div className="flex-1 min-h-0 px-6 py-5 flex flex-col overflow-hidden">
      <div className="mb-3 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-normal text-[var(--text-primary)]">{tt(room.titleKey, room.title)}</h2>
          <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
            {tt(room.subtitleKey, room.subtitle)}
          </p>
        </div>
        {tool === 'gimp' && active && (
          <button
            onClick={() => post({ type: 'add_image_art', slug: active.slug })}
            className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition"
          >
            {tt('dash.studio.add_art', 'Add your art')}
          </button>
        )}
        {!!models?.length && !fresh && (
          <button
            onClick={startNew}
            className="shrink-0 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 transition"
          >
            {tt('dash.studio.new_brief', 'New brief')}
          </button>
        )}
        {active && (
          <button
            onClick={() => setConfirming(active.slug)}
            disabled={busy}
            title={busy ? tt('dash.studio.delete_busy', 'Ava is working. Wait for her to finish, or stop her, to delete this.') : undefined}
            className="shrink-0 rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            {tt('library.delete', 'Delete')}
          </button>
        )}
        {models && (models.length > 1 || (fresh && models.length > 0)) && (
          <Select
            size="sm"
            className="w-[220px] shrink-0"
            title={tt('dash.studio.model.pick', 'Model')}
            value={active?.slug ?? ''}
            onChange={(slug) => { if (slug) { setPicked(slug); setFresh(false); } }}
            options={[
              ...(fresh ? [{ value: '', label: tt('dash.studio.new_brief', 'New brief') }] : []),
              ...models.map((m) => ({ value: m.slug, label: m.name })),
            ]}
          />
        )}
      </div>

      {active && confirming === active.slug && !busy && (
        <div className="mb-3 shrink-0 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3">
          <p className="text-xs font-medium text-[var(--text-primary)]">
            {tt('dash.studio.delete_title', 'Are you sure you want to delete “{name}”?').replace('{name}', active.name)}
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
            {tool === 'gimp'
              ? tt('dash.studio.gimp.delete_body', 'The brief and the whole folder are removed from disk — the layered files, their exports, saved versions and any art you added. It cannot be undone.')
              : tt('dash.studio.model.delete_body', 'The brief and the whole model folder are removed from disk — the Blender file, its exports and its saved versions. It cannot be undone.')}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => setConfirming(null)}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
            >
              {tt('library.cancel', 'Cancel')}
            </button>
            <button
              onClick={() => { post({ type: 'delete_design_work', tool, slug: active.slug }); setConfirming(null); setPicked(null); }}
              className="rounded-lg border border-red-500/60 bg-red-500/15 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/25"
            >
              {tt('library.delete', 'Delete')}
            </button>
          </div>
        </div>
      )}

      {models === null ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-[22px] h-[22px] rounded-full border-2 border-[var(--border-card)] border-t-[var(--accent)] animate-spin" role="status" aria-label="Loading" />
        </div>
      ) : !active ? (
        <div className="flex-1 rounded-xl border border-dashed border-[var(--border-card)] flex flex-col items-center justify-center gap-2 text-center px-10">
          <span className="text-3xl opacity-50">{'\u{1F9CA}'}</span>
          <p className="text-[13px] text-[var(--text-secondary)]">{tt('dash.studio.model.empty', 'Tell Ava what you want to make.')}</p>
          <p className="max-w-[440px] text-[12px] text-[var(--text-muted)] leading-relaxed">
            {tt(`dash.studio.${tool}.empty_sub`, room.emptySub)}
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid gap-4 overflow-hidden" style={{ gridTemplateColumns: 'minmax(280px, 380px) 1fr' }}>
          <BriefCard key={active.slug + (active.brief?.status ?? '')} model={active} agreeType={room.agree} saveType={room.save} />
          <div className="min-h-0 flex flex-col rounded-xl border border-[var(--border-card)] overflow-hidden">
            {tool === 'gimp' && active.options ? (
              <OptionsStage
                model={active}
                onPick={(index, label) => {
                  post({ type: 'pick_image_option', slug: active.slug, index });
                  sayToAva(`I pick "${label}".`);
                }}
              />
            ) : active.built && tool === 'gimp' && active.preview_url ? (
              <div className="relative flex-1 min-h-0 bg-black/20">
                <img src={active.preview_url} alt={active.name} className="ava-checker absolute inset-4 m-auto max-w-[calc(100%-2rem)] max-h-[calc(100%-2rem)]" />
              </div>
            ) : active.built && active.glb_url ? (
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
            {tool === 'gimp' && active.built && (
              <div className="shrink-0 flex items-center gap-2 overflow-x-auto border-t border-[var(--border-card)] px-3 py-2">
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{tt('dash.studio.finals', 'Final')}</span>
                {!active.finals?.length && (
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: 'rgba(240,162,75,0.14)', color: '#f0a24b' }}>
                    {tt('dash.studio.no_final', 'No final yet')}
                  </span>
                )}
                {active.finals?.map((f) => (
                  <div key={f.file} title={f.file} className="relative shrink-0 group">
                    <img src={f.url} alt={f.file} className="ava-checker h-10 w-10 rounded border border-[var(--border-card)] object-contain" />
                    <button
                      onClick={() => post({ type: 'remove_image_final', slug: active.slug, file: f.file })}
                      aria-label={tt('dash.studio.finals_remove', 'Remove from finals')}
                      title={tt('dash.studio.finals_remove', 'Remove from finals')}
                      className="absolute -top-1 -right-1 hidden group-hover:flex h-4 w-4 items-center justify-center rounded-full bg-black/80 text-[10px] text-white"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            {active.built && active.creative_id && (
              <div className="shrink-0 flex flex-wrap items-center gap-2 border-t border-[var(--border-card)] px-3 py-2">
                <button
                  onClick={() => post(tool === 'gimp' ? { type: 'open_work_in_gimp', id: active.creative_id! } : { type: 'open_model_in_blender', id: active.creative_id! })}
                  className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 transition"
                >
                  {tt(room.openKey, room.open)}
                </button>
                <button
                  onClick={() => post({ type: 'reveal_creative', id: active.creative_id! })}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition"
                >
                  {tt('library.model.open_folder', 'Open folder')}
                </button>
                <span className="ml-auto text-[11px] text-[var(--text-muted)]">
                  {[typeof active.image_count === 'number' ? `${active.image_count} image${active.image_count === 1 ? '' : 's'}` : '',
                    active.references?.length ? tt('dash.studio.art_count', 'Your art: {count}').replace('{count}', String(active.references.length)) : '',
                    active.size_m?.length === 3 ? `${active.size_m.map((n) => +n.toFixed(2)).join(' × ')} m` : '',
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

/** Versions Ava put on the stage: they choose by eye, and the click is the answer. */
function OptionsStage({ model, onPick }: { model: DesignModelSummary; onPick: (index: number, label: string) => void }) {
  const options = model.options!;
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto p-4 gap-3">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-[13px] text-[var(--text-primary)]">{options.question}</p>
        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: 'rgba(240,162,75,0.14)', color: '#f0a24b' }}>
          {tt('dash.studio.model.proposed', 'Waiting for you')}
        </span>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {options.items.map((o, i) => (
          <button
            key={o.url}
            onClick={() => onPick(i, o.label)}
            className="group flex flex-col gap-2 rounded-xl border border-[var(--border-card)] p-2.5 text-left hover:border-[var(--accent)]/50 hover:bg-[var(--bg-hover)] transition"
          >
            <img src={o.url} alt={o.label} className="ava-checker w-full max-h-[280px] object-contain rounded-lg" />
            <span className="text-[12px] font-medium text-[var(--text-primary)]">{o.label}</span>
            {o.note && <span className="text-[11px] text-[var(--text-muted)] leading-relaxed">{o.note}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Say it to Ava in the design chat, as him (Chat.tsx listens on the design lane). */
function sayToAva(text: string) {
  window.dispatchEvent(new CustomEvent('ava-design-say', { detail: { text } }));
}

const pendingAgree = new Set<string>();

function BriefCard({ model, agreeType, saveType }: { model: DesignModelSummary; agreeType: 'agree_model_brief' | 'agree_image_brief'; saveType: 'save_model_brief' | 'save_image_brief' }) {
  const brief = model.brief;
  useEffect(() => {
    if (brief?.status === 'agreed' && pendingAgree.delete(model.slug)) {
      sayToAva(`I've agreed the brief for "${model.name}" — go ahead and start.`);
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
    post({ type: saveType, slug: model.slug, fields: draft });
    setEditing(false);
    if (changed.length) sayToAva(`I've edited the brief for "${model.name}" — I changed ${changed.join(', ')}. Have a look at my version.`);
  };
  // Tell Ava only once the agreement is on disk — the host confirms by sending
  // the models back with this brief 'agreed' (the card remounts on that, keyed
  // by status). Saying it first could start her turn before the build tool
  // can see the agreement, and it would refuse.
  const agree = () => {
    pendingAgree.add(model.slug);
    post({ type: agreeType, slug: model.slug });
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
