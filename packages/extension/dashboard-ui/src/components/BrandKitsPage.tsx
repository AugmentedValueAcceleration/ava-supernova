import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { tt } from '../i18n';
import { Select } from './Select';
import {
  activeKit, contrastOf, createKit, deleteKit, kitPieces, kitProject, kitShapes, linkedHere, setActiveKit, storeKits, upsertKit,
  type BrandKit, type PieceDef, type PieceState,
} from '../lib/asset-forge/brand-kit';

// ─── Brand Kits ────────────────────────────────────────────────────────────────
//
// The cards, the brand sheet a kit opens into, its editor, and starting a new
// one. This file is IDENTICAL in the extension and the IDE apart from the i18n
// import; what differs between them comes in through `actions`, so the two
// cannot drift. Inline styles for the same reason.

export interface KnownProject { path: string; name: string }
export interface KitLibraryChoice { key: string; title: string; path: string; src: string }
export interface FontChoices { installed: string[] | null; google: string[] }

export interface KitActions {
  link(id: string, link: boolean, project?: string): void;
  agree(id: string): void;
  /** Open the piece's room, or the chat for a piece made on the kit. */
  startPiece(kit: BrandKit, piece: PieceDef): void;
  withAva(project: KnownProject | null): void;
  loadLibrary(everything: boolean): Promise<KitLibraryChoice[]>;
  logoFromLibrary(kitId: string, path: string): void;
  /** What can be chosen, and installing one. `installed` is null when GIMP can't be asked. */
  loadFonts(): Promise<FontChoices>;
  installFont(family: string): Promise<{ ok: boolean; message: string }>;
  /** Setting a piece by hand. */
  pieceFromLibrary(kitId: string, piece: string, path: string): void;
  pieceUpload(kitId: string, piece: string, name: string, dataUrl: string): void;
  pieceRemoveFile(kitId: string, piece: string, file?: string): void;
  /** A kit's file, as an image source. */
  toSrc(value: string): string;
}

const C = {
  text: 'var(--text-primary, #cdd6f4)', soft: 'var(--text-secondary, #a6adc8)', muted: 'var(--text-muted, #8b8398)',
  border: 'var(--border-card, rgba(255,255,255,0.08))', input: 'var(--bg-input, #1e1b2e)', accent: 'var(--accent)',
  panel: 'rgba(17,12,26,0.99)',
};
const CHECKER: CSSProperties = {
  backgroundColor: '#5c5c66',
  backgroundImage: 'linear-gradient(45deg, #7a7a84 25%, transparent 25%, transparent 75%, #7a7a84 75%), linear-gradient(45deg, #7a7a84 25%, transparent 25%, transparent 75%, #7a7a84 75%)',
  backgroundSize: '16px 16px', backgroundPosition: '0 0, 8px 8px',
};
const button = (kind: 'primary' | 'ghost' | 'danger' = 'ghost'): CSSProperties => ({
  padding: '5px 12px', borderRadius: 7, fontSize: 11.5, fontWeight: 500, cursor: 'pointer', flexShrink: 0,
  border: `1px solid ${kind === 'danger' ? 'rgba(239,68,68,0.45)' : kind === 'primary' ? 'transparent' : C.border}`,
  background: kind === 'primary' ? C.accent : 'transparent',
  color: kind === 'primary' ? '#fff' : kind === 'danger' ? '#f87171' : C.soft,
});
const input: CSSProperties = { width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', fontSize: 12.5, color: C.text, outline: 'none', fontFamily: 'inherit' };
const label: CSSProperties = { fontSize: 11, color: C.muted, display: 'block', marginBottom: 5 };
const heading: CSSProperties = { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.2, color: C.muted, margin: '0 0 10px' };
const stateStyle = (s: PieceState): CSSProperties => (s === 'agreed'
  ? { background: 'rgba(52,211,153,0.12)', color: '#34d399' }
  : s === 'in_progress' ? { background: 'rgba(240,162,75,0.14)', color: '#f0a24b' } : { background: 'rgba(255,255,255,0.05)', color: C.muted });
const pill: CSSProperties = { flexShrink: 0, borderRadius: 999, padding: '2px 8px', fontSize: 10, fontWeight: 500 };
const lastPart = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ borderRadius: 12, border: `1px solid ${C.border}`, padding: 16, minWidth: 0 }}>
      <h4 style={heading}>{title}</h4>
      {children}
    </section>
  );
}
const NotSet = ({ text }: { text: string }) => <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>{text}</p>;

function Hero({ kit, height }: { kit: BrandKit; height: number }) {
  return (
    <div style={{ position: 'relative', height, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, boxSizing: 'border-box', background: kit.palette.surface }}>
      {kit.logo?.primary
        ? <img src={kit.logo.primary} alt={kit.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        : <span style={{ fontSize: height > 150 ? 56 : 34, fontWeight: 600, color: kit.palette.primary, ...(kit.fonts?.heading ? { fontFamily: `"${kit.fonts.heading}"` } : {}) }}>{kit.name.trim().charAt(0).toUpperCase()}</span>}
    </div>
  );
}
const PaletteBar = ({ kit, height }: { kit: BrandKit; height: number }) => (
  <div style={{ display: 'flex', height, flexShrink: 0 }}>
    {Object.entries(kit.palette).map(([role, c]) => <span key={role} title={`${role} ${c}`} style={{ flex: 1, background: c }} />)}
  </div>
);

// ── The brand sheet ──────────────────────────────────────────────────────────

function Sheet({ kit, actions, onBack, onEdit, onDelete, onPickPiece }: { kit: BrandKit; actions: KitActions; onBack: () => void; onEdit: () => void; onDelete: () => void; onPickPiece: (p: PieceDef) => void }) {
  const active = activeKit().id === kit.id;
  const project = kitProject();
  const colour = (c: string) => (c.startsWith('#') ? c : (kit.palette as unknown as Record<string, string>)[c] ?? '#000000');
  const work = Object.entries(kit.pieces ?? {}).flatMap(([id, p]) => (p.files ?? []).map((file) => ({ id, file, src: kit.fileMap?.[file] })))
    .filter((w) => w.src);
  const fonts = (['heading', 'body', 'ui'] as const).filter((u) => kit.fonts?.[u]);
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={onBack} style={{ ...button(), border: 'none', paddingLeft: 0 }}>← {tt('dash.studio.brandkit.title', 'Brand Kits')}</button>
        <span style={{ flex: 1 }} />
        {!active && kit.status !== 'proposed' && <button onClick={() => setActiveKit(kit.id)} style={button()}>{tt('ext.studio.make_active', 'Make active')}</button>}
        <button onClick={onEdit} style={button()}>{tt('dash.studio.model.edit', 'Edit')}</button>
        <button onClick={onDelete} style={button('danger')}>{tt('library.delete', 'Delete')}</button>
      </div>

      {kit.status === 'proposed' && (
        <div style={{ borderRadius: 12, border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)', background: 'color-mix(in srgb, var(--accent) 7%, transparent)', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: C.text }}>{tt('ext.studio.kit_proposed', 'Ava’s proposal')}</span>
            <span style={{ ...pill, ...stateStyle('in_progress'), marginLeft: 'auto' }}>{tt('dash.studio.model.proposed', 'Waiting for you')}</span>
          </div>
          {kit.reasoning && <p style={{ fontSize: 12.5, color: C.soft, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{kit.reasoning}</p>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => actions.agree(kit.id)} style={button('primary')}>{tt('ext.studio.kit_agree', 'Agree this kit')}</button>
            <span style={{ fontSize: 11, color: C.muted }}>{tt('ext.studio.kit_agree_hint', 'Question it with Ava, or change anything first.')}</span>
          </div>
        </div>
      )}

      <div style={{ borderRadius: 14, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
        <Hero kit={kit} height={220} />
        <PaletteBar kit={kit} height={10} />
        <div style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: 20, fontWeight: 500, color: C.text, margin: 0, ...(kit.fonts?.heading ? { fontFamily: `"${kit.fonts.heading}"` } : {}) }}>{kit.name}</h3>
            {kit.kind && <span style={{ ...pill, ...stateStyle('not_made') }}>{kitShapes().kinds.find((k) => k.id === kit.kind)?.label ?? kit.kind}</span>}
            {active && kit.status !== 'proposed' && <span style={{ ...pill, background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: C.accent }}>{tt('ext.studio.kit_active', 'Active')}</span>}
          </div>
          {kit.tagline && <p style={{ fontSize: 13, color: C.soft, margin: '4px 0 0' }}>{kit.tagline}</p>}
          {kit.positioning && <p style={{ fontSize: 12.5, color: C.muted, margin: '4px 0 0', lineHeight: 1.6 }}>{kit.positioning}</p>}
          {!!kit.projects?.length && <p style={{ fontSize: 11, color: C.muted, margin: '8px 0 0' }}>{tt('ext.studio.kit_linked_to', 'Linked to')} {kit.projects.map(lastPart).join(', ')}</p>}
          {project && kit.status !== 'proposed' && (
            <button onClick={() => actions.link(kit.id, !linkedHere(kit))} style={{ ...button(), marginTop: 8 }}>
              {linkedHere(kit) ? tt('ext.studio.kit_unlink', 'Unlink from') : tt('ext.studio.kit_link', 'Link to')} {lastPart(project.path)}
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <Section title={tt('ext.studio.kit_sheet_colours', 'Colours')}>
          <div style={{ display: 'flex', gap: 6 }}>
            {Object.entries(kit.palette).map(([role, c]) => (
              <div key={role} style={{ flex: 1, minWidth: 0 }}>
                <div style={{ height: 52, borderRadius: 8, background: c, border: `1px solid ${C.border}` }} />
                <p style={{ fontSize: 10.5, color: C.soft, margin: '4px 0 0', textTransform: 'capitalize' }}>{role}</p>
                <p style={{ fontSize: 10, color: C.muted, margin: 0 }}>{c.toUpperCase()}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title={tt('ext.studio.kit_sheet_pairings', 'Colours together')}>
          {kit.pairings?.length ? (
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))' }}>
              {kit.pairings.map((p, i) => {
                const ratio = contrastOf(colour(p.ink), colour(p.on));
                return (
                  <div key={i} style={{ borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.border}` }}>
                    <div style={{ height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', background: colour(p.on), color: colour(p.ink), fontSize: 20, fontWeight: 600 }}>Aa</div>
                    <p style={{ fontSize: 10, color: ratio >= 4.5 ? C.soft : ratio >= 3 ? '#f0a24b' : '#f87171', margin: 0, padding: '4px 6px' }}>
                      {p.use ? `${p.use} · ` : ''}{ratio}:1{ratio < 3 ? ` · ${tt('ext.studio.kit_too_low', 'too low')}` : ratio < 4.5 ? ` · ${tt('ext.studio.kit_large_only', 'large only')}` : ''}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : <NotSet text={tt('ext.studio.kit_no_pairings', 'Not set yet. Ask Ava which colours go on which.')} />}
        </Section>

        <Section title={tt('ext.studio.kit_fonts', 'Fonts')}>
          {fonts.length ? fonts.map((use) => (
            <div key={use} style={{ marginBottom: 10 }}>
              <p style={{ fontSize: use === 'heading' ? 24 : 14, color: C.text, margin: 0, fontFamily: `"${kit.fonts![use]}"`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{use === 'heading' ? kit.name : kit.tagline || kit.name}</p>
              <p style={{ fontSize: 10.5, color: C.muted, margin: 0 }}>{kit.fonts![use]} · {use === 'ui' ? 'UI' : use}</p>
            </div>
          )) : <NotSet text={tt('ext.studio.kit_no_fonts', 'Not chosen yet.')} />}
        </Section>

        <Section title={tt('ext.studio.kit_image_style', 'Image style')}>
          {kit.imageStyle ? <p style={{ fontSize: 12.5, color: C.soft, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{kit.imageStyle}</p> : <NotSet text={tt('ext.studio.kit_no_image_style', 'Not written yet.')} />}
          {!!kit.styleTags?.length && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
              {kit.styleTags.map((t) => <span key={t} style={{ ...pill, ...stateStyle('not_made') }}>{t}</span>)}
            </div>
          )}
        </Section>

        {!!(kit.visualDo?.length || kit.visualDont?.length) && (
          <Section title={tt('ext.studio.kit_sheet_rules', 'Visual rules')}>
            {(kit.visualDo ?? []).map((r) => <p key={r} style={{ fontSize: 12, color: C.soft, margin: '0 0 4px' }}><span style={{ color: '#34d399' }}>✓</span> {r}</p>)}
            {(kit.visualDont ?? []).map((r) => <p key={r} style={{ fontSize: 12, color: C.soft, margin: '0 0 4px' }}><span style={{ color: '#f87171' }}>×</span> {r}</p>)}
          </Section>
        )}

        {!!kit.voice && (
          <Section title={tt('ext.studio.kit_sheet_voice', 'Written voice')}>
            <p style={{ fontSize: 12.5, color: C.soft, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{kit.voice}</p>
          </Section>
        )}

        {!!work.length && (
          <div style={{ gridColumn: '1 / -1' }}>
            <Section title={tt('ext.studio.kit_sheet_work', 'Approved work')}>
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
                {work.map((w) => <img key={w.file} src={actions.toSrc(w.src as string)} alt={w.file} title={w.file} style={{ ...CHECKER, width: '100%', aspectRatio: '1', objectFit: 'contain', borderRadius: 8 }} />)}
              </div>
            </Section>
          </div>
        )}

        <div style={{ gridColumn: '1 / -1' }}>
          <Section title={tt('ext.studio.kit_pieces', 'What this kit needs')}>
            {!kit.kind && <NotSet text={tt('ext.studio.kit_no_kind', 'Choose what this kit is for in Edit, and its full list appears here.')} />}
            {kit.status !== 'proposed' && <p style={{ fontSize: 12, color: C.soft, margin: '0 0 10px' }}>{tt('ext.studio.kit_pieces_hint', 'Click any piece to set it yourself, choose from your Library, or make it with Ava.')}</p>}
            <div style={{ display: 'grid', gap: 4, gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', marginTop: kit.kind ? 0 : 8 }}>
              {kitPieces(kit).map((p) => {
                const state: PieceState = kit.pieces?.[p.id]?.state ?? 'not_made';
                return (
                  <button key={p.id} disabled={kit.status === 'proposed'} onClick={() => onPickPiece(p)}
                    title={tt('ext.studio.kit_piece_set', 'Set this yourself, or make it with Ava')}
                    onMouseEnter={(e) => { if (kit.status !== 'proposed') { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; } }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.02)', color: C.soft, fontSize: 12, cursor: kit.status === 'proposed' ? 'default' : 'pointer', textAlign: 'left', fontFamily: 'inherit', transition: 'border-color 120ms, background 120ms' }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tt(`ext.studio.kit_piece_${p.id}`, p.label)}</span>
                    <span style={{ ...pill, ...stateStyle(state) }}>
                      {state === 'agreed' ? tt('ext.studio.kit_state_agreed', 'Agreed') : state === 'in_progress' ? tt('ext.studio.kit_state_in_progress', 'In progress') : tt('ext.studio.kit_state_not_made', 'Not made')}
                    </span>
                    {kit.status !== 'proposed' && <span aria-hidden style={{ flexShrink: 0, fontSize: 14, lineHeight: 1, color: C.muted }}>›</span>}
                  </button>
                );
              })}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

// ── The editor ───────────────────────────────────────────────────────────────

function Editor({ kit, fonts, onChange, onDone, onLibrary }: { kit: BrandKit; fonts: Fonts; onChange: (patch: Partial<BrandKit>) => void; onDone: () => void; onLibrary: () => void }) {
  const lines = (v: string) => v.split('\n');
  const onLogo = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === 'string') onChange({ logo: { ...kit.logo, primary: reader.result } }); };
    reader.readAsDataURL(file);
  };
  const text = (key: keyof BrandKit, title: string, rows = 0) => (
    <div>
      <label style={label}>{title}</label>
      {rows
        ? <textarea rows={rows} value={(kit[key] as string) ?? ''} onChange={(e) => onChange({ [key]: e.target.value })} style={{ ...input, resize: 'vertical' }} />
        : <input value={(kit[key] as string) ?? ''} onChange={(e) => onChange({ [key]: e.target.value })} style={input} />}
    </div>
  );
  const list = (key: 'visualDo' | 'visualDont' | 'doRules' | 'dontRules', title: string) => (
    <div>
      <label style={label}>{title}</label>
      <textarea rows={3} value={(kit[key] ?? []).join('\n')} onChange={(e) => onChange({ [key]: lines(e.target.value) })} style={{ ...input, resize: 'vertical' }} />
    </div>
  );
  return (
    <div style={{ maxWidth: 620, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <h3 style={{ flex: 1, fontSize: 14, fontWeight: 400, color: C.text, margin: 0 }}>{tt('ext.studio.kit_edit_title', 'Edit')} {kit.name}</h3>
        <button onClick={onDone} style={button('primary')}>{tt('ext.studio.kit_edit_done', 'Done')}</button>
      </div>
      {text('name', tt('ext.studio.brand_name', 'Brand name'))}
      {text('tagline', tt('ext.studio.tagline', 'Tagline'))}
      {text('positioning', tt('ext.studio.positioning', 'Positioning'))}
      <div>
        <label style={label}>{tt('ext.studio.kit_kind', 'What is this kit for?')}</label>
        <Select size="sm" value={kit.kind ?? ''} onChange={(v) => { if (v) onChange({ kind: v }); }}
          options={[...(kit.kind ? [] : [{ value: '', label: tt('ext.studio.kit_kind_pick', 'Choose one') }]), ...kitShapes().kinds.map((k) => ({ value: k.id, label: tt(`ext.studio.kit_kind_${k.id}`, k.label) }))]} />
      </div>
      <div>
        <label style={label}>{tt('ext.studio.kit_logo', 'Logo')}</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ ...CHECKER, width: 56, height: 56, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
            {kit.logo?.primary && <img src={kit.logo.primary} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
          </div>
          <label style={{ ...button(), display: 'inline-block' }}>
            {kit.logo?.primary ? tt('ext.studio.kit_replace', 'Replace') : tt('ext.studio.kit_upload', 'Upload')}
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { onLogo(e.target.files?.[0]); e.currentTarget.value = ''; }} />
          </label>
          <button onClick={onLibrary} style={button()}>{tt('ext.studio.kit_library_button', 'From Library')}</button>
          {kit.logo?.primary && <button onClick={() => onChange({ logo: { ...kit.logo, primary: undefined } })} style={button()}>{tt('ext.studio.kit_remove', 'Remove')}</button>}
        </div>
      </div>
      <div>
        <label style={label}>{tt('dash.studio.brandkit.palette', 'Palette')}</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
          {(Object.keys(kit.palette) as Array<keyof BrandKit['palette']>).map((role) => (
            <label key={role} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontSize: 10, color: C.muted, textTransform: 'capitalize' }}>
              <input type="color" value={kit.palette[role]} onChange={(e) => onChange({ palette: { ...kit.palette, [role]: e.target.value } })} style={{ width: 34, height: 34, padding: 0, border: `1px solid ${C.border}`, borderRadius: 6, background: 'transparent', cursor: 'pointer' }} />
              {role}
            </label>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ ...label, marginBottom: 0 }}>{tt('ext.studio.kit_fonts', 'Fonts')}</label>
        <FontPicker title={tt('ext.studio.kit_font_heading', 'Heading')} value={kit.fonts?.heading ?? ''} onChange={(v) => onChange({ fonts: { ...kit.fonts, heading: v } })} fonts={fonts} />
        <FontPicker title={tt('ext.studio.kit_font_body', 'Body')} value={kit.fonts?.body ?? ''} onChange={(v) => onChange({ fonts: { ...kit.fonts, body: v } })} fonts={fonts} />
        <FontPicker title={tt('ext.studio.kit_font_ui', 'UI')} value={kit.fonts?.ui ?? ''} onChange={(v) => onChange({ fonts: { ...kit.fonts, ui: v } })} fonts={fonts} />
      </div>
      {text('imageStyle', tt('ext.studio.kit_image_style', 'Image style'), 2)}
      {list('visualDo', tt('ext.studio.kit_visual_do', 'Visual do (one per line)'))}
      {list('visualDont', tt('ext.studio.kit_visual_dont', 'Visual don’t (one per line)'))}
      {text('voice', tt('ext.studio.voice_tone', 'Voice / tone (flows into posts)'), 3)}
      {list('doRules', tt('ext.studio.kit_do', 'Do (one per line)'))}
      {list('dontRules', tt('ext.studio.kit_dont', 'Don’t (one per line)'))}
      <div>
        <label style={label}>{tt('ext.studio.kit_hashtags', 'Default hashtags (comma-separated)')}</label>
        <input value={(kit.defaultHashtags ?? []).join(', ')} onChange={(e) => onChange({ defaultHashtags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} style={input} />
      </div>
      {text('defaultLink', tt('ext.studio.default_link', 'Default link'))}
    </div>
  );
}

// ── Choosing a font ──────────────────────────────────────────────────────────

const SHOWN_FONTS = 120;
interface Fonts {
  /** Null until they've loaded. */
  choices: FontChoices | null;
  installing: string | null;
  problem: { family: string; message: string } | null;
  install(family: string): void;
}

/** One load for the whole page: GIMP takes seconds to answer. */
function useFonts(actions: KitActions): Fonts {
  const [choices, setChoices] = useState<FontChoices | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [problem, setProblem] = useState<Fonts['problem']>(null);
  useEffect(() => {
    let live = true;
    actions.loadFonts().then((c) => { if (live) setChoices(c); }).catch(() => { if (live) setChoices({ installed: null, google: [] }); });
    return () => { live = false; };
  }, [actions]);
  const install = (family: string) => {
    setInstalling(family);
    setProblem(null);
    actions.installFont(family)
      .then(({ ok, message }) => {
        if (ok) setChoices((c) => (c ? { ...c, installed: c.installed && [...c.installed, family].sort((x, y) => x.localeCompare(y)) } : c));
        else setProblem({ family, message });
      })
      .catch(() => setProblem({ family, message: tt('ext.studio.kit_font_failed', 'That font could not be installed.') }))
      .finally(() => setInstalling(null));
  };
  return { choices, installing, problem, install };
}

function FontPicker({ title, value, onChange, fonts }: { title: string; value: string; onChange: (font: string) => void; fonts: Fonts }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { choices, installing, problem, install } = fonts;
  const here = useMemo(() => new Set((choices?.installed ?? []).map((f) => f.toLowerCase())), [choices]);
  const q = search.trim().toLowerCase();
  const matches = (f: string) => !q || f.toLowerCase().includes(q);
  const onComputer = (choices?.installed ?? []).filter(matches);
  const fromGoogle = (choices?.google ?? []).filter((f) => !here.has(f.toLowerCase()) && matches(f));
  const shownGoogle = fromGoogle.slice(0, Math.max(0, SHOWN_FONTS - onComputer.length));
  const typed = search.trim();
  const known = !typed || here.has(typed.toLowerCase()) || (choices?.google ?? []).some((f) => f.toLowerCase() === typed.toLowerCase());
  const missing = !!value.trim() && !!choices?.installed && !here.has(value.trim().toLowerCase());
  const canInstall = missing && (choices?.google ?? []).some((f) => f.toLowerCase() === value.trim().toLowerCase());
  const pick = (font: string) => { onChange(font); setOpen(false); setSearch(''); };
  const heading2: CSSProperties = { fontSize: 10, color: C.muted, padding: '8px 8px 3px', textTransform: 'uppercase', letterSpacing: 1 };
  const rowStyle: CSSProperties = { flex: 1, minWidth: 0, padding: '5px 8px', border: 'none', background: 'transparent', color: C.text, fontSize: 12.5, textAlign: 'left', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
  const installLabel = (family: string) => (installing === family ? tt('ext.studio.kit_font_installing', 'Installing…') : tt('ext.studio.kit_font_install', 'Install'));

  return (
    <div>
      <label style={label}>{title}</label>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        style={{ ...input, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: value ? C.text : C.muted, ...(value && !missing ? { fontFamily: `"${value}"` } : {}) }}>
          {value || tt('ext.studio.kit_font_choose', 'Choose a font')}
        </span>
        <span aria-hidden style={{ flexShrink: 0, fontSize: 10, color: C.muted }}>{open ? '▲' : '▼'}</span>
      </button>

      {missing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 11, lineHeight: 1.5, color: '#f0a24b' }}>
            {canInstall ? tt('ext.studio.kit_font_missing', 'Not installed, so GIMP can’t use it yet.') : tt('ext.studio.kit_font_missing_elsewhere', 'Not installed, and it isn’t on Google Fonts, so it can’t be installed here.')}
          </span>
          {canInstall && <button type="button" disabled={!!installing} onClick={() => install(value.trim())} style={{ ...button('primary'), padding: '3px 10px', opacity: installing ? 0.6 : 1 }}>{installLabel(value.trim())}</button>}
        </div>
      )}
      {problem && problem.family.toLowerCase() === value.trim().toLowerCase() && <p style={{ fontSize: 11, lineHeight: 1.5, color: '#f87171', margin: '5px 0 0' }}>{problem.message}</p>}

      {open && (
        <div style={{ marginTop: 4, padding: 6, borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.02)' }}>
          <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tt('ext.studio.kit_font_search', 'Search fonts')} style={input} />
          <div style={{ maxHeight: 200, overflowY: 'auto', marginTop: 4 }}>
            {!choices && <p style={{ padding: '16px 0', textAlign: 'center', fontSize: 12, color: C.muted, margin: 0 }}>{tt('ext.studio.kit_font_loading', 'Checking your fonts…')}</p>}
            {choices && value && !q && <div style={{ display: 'flex' }}><button type="button" onClick={() => pick('')} style={{ ...rowStyle, color: C.muted }}>{tt('ext.studio.kit_font_none', 'No font')}</button></div>}
            {choices && !!onComputer.length && <div style={heading2}>{tt('ext.studio.kit_font_on_computer', 'On your computer')}</div>}
            {onComputer.slice(0, SHOWN_FONTS).map((f) => (
              <div key={f} style={{ display: 'flex' }}><button type="button" onClick={() => pick(f)} style={{ ...rowStyle, fontFamily: `"${f}"` }}>{f}</button></div>
            ))}
            {!!shownGoogle.length && <div style={heading2}>{tt('ext.studio.kit_font_google', 'Google Fonts, free to install')}</div>}
            {shownGoogle.map((f) => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button type="button" onClick={() => pick(f)} style={rowStyle}>{f}</button>
                <button type="button" disabled={!!installing} onClick={() => install(f)} style={{ ...button(), padding: '2px 8px', fontSize: 10.5, marginRight: 4, opacity: installing && installing !== f ? 0.5 : 1 }}>{installLabel(f)}</button>
              </div>
            ))}
            {problem && <p style={{ fontSize: 11, lineHeight: 1.5, color: '#f87171', margin: '6px 8px' }}>{problem.message}</p>}
            {choices && !known && <div style={{ display: 'flex' }}><button type="button" onClick={() => pick(typed)} style={{ ...rowStyle, color: C.soft }}>{tt('ext.studio.kit_font_use_typed', 'Use “{name}”').replace('{name}', typed)}</button></div>}
            {fromGoogle.length > shownGoogle.length && <p style={{ fontSize: 11, color: C.muted, margin: '6px 8px' }}>{tt('ext.studio.kit_font_more', 'Keep typing to find more.')}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── One piece, set by hand ───────────────────────────────────────────────────

const fontsSet = (k: BrandKit) => !!(k.fonts?.heading?.trim() || k.fonts?.body?.trim());
const uiFontSet = (k: BrandKit) => !!k.fonts?.ui?.trim();
/** Pieces the kit has its own fields for, and whether those are filled. Colours
 *  aren't here: every kit starts with a palette, so filled says nothing. */
const FILLED: Record<string, (k: BrandKit) => boolean> = {
  fonts: fontsSet, web_fonts: fontsSet, ui_fonts: uiFontSet, interface_type: uiFontSet,
  image_style: (k) => !!k.imageStyle?.trim(),
  voice: (k) => !!k.voice?.trim(),
  visual_rules: (k) => !!(k.visualDo?.some((l) => l.trim()) || k.visualDont?.some((l) => l.trim())),
};
const takesPictures = (p: PieceDef) => p.room !== 'kit' || p.id === 'world_references';
const takesNote = (p: PieceDef) => p.room === 'kit' && p.id !== 'colours' && !FILLED[p.id];

/** What Edit changed, carried to the pieces it fills, so the list tells the truth. */
function piecesAfterEditing(kit: BrandKit): BrandKit['pieces'] {
  const pieces = { ...kit.pieces };
  for (const p of kitPieces(kit)) {
    const filled = p.slot ? !!(kit.logo as Record<string, string | undefined> | undefined)?.[p.slot] : FILLED[p.id]?.(kit);
    if (filled === undefined) continue;
    const state = pieces[p.id]?.state ?? 'not_made';
    if (filled && state !== 'agreed') pieces[p.id] = { ...pieces[p.id], state: 'agreed' };
    if (!filled && state === 'agreed') pieces[p.id] = { ...pieces[p.id], state: 'not_made' };
  }
  return pieces;
}

function PieceCard({ kit, piece, actions, fonts, onSave, onLibrary, onClose }: { kit: BrandKit; piece: PieceDef; actions: KitActions; fonts: Fonts; onSave: (patch: Partial<BrandKit>) => void; onLibrary: () => void; onClose: () => void }) {
  const entry = kit.pieces?.[piece.id];
  const state: PieceState = entry?.state ?? 'not_made';
  const [patch, setPatch] = useState<Partial<BrandKit>>({});
  const [note, setNote] = useState(entry?.note ?? '');
  const draft = { ...kit, ...patch };
  const files = (entry?.files ?? []).filter((f) => kit.fileMap?.[f]);
  const logo = piece.slot ? (kit.logo as Record<string, string | undefined> | undefined)?.[piece.slot] : undefined;
  const written = piece.room === 'kit';

  const mark = (next: PieceState) => onSave({ pieces: { ...kit.pieces, [piece.id]: { ...entry, state: next } } });
  const save = () => {
    const tidy = (l?: string[]) => l?.map((s) => s.trim()).filter(Boolean);
    const fields = { ...patch, ...(patch.visualDo ? { visualDo: tidy(patch.visualDo) } : {}), ...(patch.visualDont ? { visualDont: tidy(patch.visualDont) } : {}) };
    const next = { ...entry, state } as NonNullable<BrandKit['pieces']>[string];
    if (takesNote(piece)) {
      if (note.trim()) next.note = note.trim(); else delete next.note;
    }
    const filled = piece.id === 'colours' || (FILLED[piece.id] ? FILLED[piece.id]({ ...kit, ...fields }) : !!(note.trim() || files.length));
    next.state = filled ? 'agreed' : 'not_made';
    onSave({ ...fields, pieces: { ...kit.pieces, [piece.id]: next } });
    onClose();
  };
  const upload = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === 'string') actions.pieceUpload(kit.id, piece.id, file.name, reader.result); };
    reader.readAsDataURL(file);
  };
  const font = (use: 'heading' | 'body' | 'ui', title: string) => (
    <FontPicker title={title} value={draft.fonts?.[use] ?? ''} onChange={(v) => setPatch({ ...patch, fonts: { ...draft.fonts, [use]: v } })} fonts={fonts} />
  );
  const box = (title: string, value: string, onChange: (v: string) => void, rows = 4) => (
    <div>
      <label style={label}>{title}</label>
      <textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} style={{ ...input, resize: 'vertical' }} />
    </div>
  );
  const picture = (src: string, onRemove: () => void, key: string) => (
    <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <img src={src} alt="" style={{ ...CHECKER, width: '100%', aspectRatio: '1', objectFit: 'contain', borderRadius: 8 }} />
      <button onClick={onRemove} style={{ ...button(), padding: '3px 8px' }}>{tt('ext.studio.kit_remove', 'Remove')}</button>
    </div>
  );

  return (
    <Overlay onClose={onClose} width={480}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3 style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 400, color: C.text, margin: 0 }}>{tt(`ext.studio.kit_piece_${piece.id}`, piece.label)}</h3>
        <span style={{ ...pill, ...stateStyle(state) }}>
          {state === 'agreed' ? tt('ext.studio.kit_state_agreed', 'Agreed') : state === 'in_progress' ? tt('ext.studio.kit_state_in_progress', 'In progress') : tt('ext.studio.kit_state_not_made', 'Not made')}
        </span>
        <button onClick={onClose} style={button()}>{tt('ext.studio.kit_close', 'Close')}</button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {takesPictures(piece) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {piece.slot
              ? logo
                ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>{picture(logo, () => actions.pieceRemoveFile(kit.id, piece.id), 'logo')}</div>
                : <NotSet text={tt('ext.studio.kit_piece_empty', 'Nothing set yet.')} />
              : files.length
                ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>{files.map((f) => picture(actions.toSrc(kit.fileMap![f]), () => actions.pieceRemoveFile(kit.id, piece.id, f), f))}</div>
                : <NotSet text={tt('ext.studio.kit_piece_empty', 'Nothing set yet.')} />}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onLibrary} style={button()}>{tt('ext.studio.kit_library_button', 'From Library')}</button>
              <label style={{ ...button(), display: 'inline-block' }}>
                {tt('ext.studio.kit_upload', 'Upload')}
                <input type="file" accept=".png,.jpg,.jpeg,.webp,.svg" style={{ display: 'none' }} onChange={(e) => { upload(e.target.files?.[0]); e.currentTarget.value = ''; }} />
              </label>
            </div>
          </div>
        )}

        {piece.id === 'colours' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
            {(Object.keys(draft.palette) as Array<keyof BrandKit['palette']>).map((role) => (
              <label key={role} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontSize: 10, color: C.muted, textTransform: 'capitalize' }}>
                <input type="color" value={draft.palette[role]} onChange={(e) => setPatch({ ...patch, palette: { ...draft.palette, [role]: e.target.value } })} style={{ width: 34, height: 28, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }} />
                {role}
              </label>
            ))}
          </div>
        )}
        {(piece.id === 'fonts' || piece.id === 'web_fonts') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {font('heading', tt('ext.studio.kit_font_heading', 'Heading'))}
            {font('body', tt('ext.studio.kit_font_body', 'Body'))}
            {font('ui', tt('ext.studio.kit_font_ui', 'UI'))}
          </div>
        )}
        {(piece.id === 'ui_fonts' || piece.id === 'interface_type') && font('ui', tt('ext.studio.kit_font_ui_name', 'Font'))}
        {piece.id === 'image_style' && box(tt('ext.studio.kit_image_style', 'Image style'), draft.imageStyle ?? '', (v) => setPatch({ ...patch, imageStyle: v }))}
        {piece.id === 'voice' && box(tt('ext.studio.voice_tone', 'Voice / tone (flows into posts)'), draft.voice ?? '', (v) => setPatch({ ...patch, voice: v }))}
        {piece.id === 'visual_rules' && box(tt('ext.studio.kit_visual_do', 'Visual do (one per line)'), (draft.visualDo ?? []).join('\n'), (v) => setPatch({ ...patch, visualDo: v.split('\n') }), 3)}
        {piece.id === 'visual_rules' && box(tt('ext.studio.kit_visual_dont', 'Visual don’t (one per line)'), (draft.visualDont ?? []).join('\n'), (v) => setPatch({ ...patch, visualDont: v.split('\n') }), 3)}
        {takesNote(piece) && box(tt('ext.studio.kit_piece_note', 'In your own words'), note, setNote)}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {written && <button onClick={save} style={button('primary')}>{tt('ext.studio.kit_piece_save', 'Save')}</button>}
        <button onClick={() => { onClose(); actions.startPiece(kit, piece); }} style={button(written ? 'ghost' : 'primary')}>
          {written ? tt('ext.studio.kit_piece_with_ava', 'Work on it with Ava') : tt('ext.studio.kit_new_with_ava', 'Make it with Ava')}
        </button>
        <span style={{ flex: 1 }} />
        {state !== 'agreed' && <button onClick={() => mark('agreed')} style={button()}>{tt('ext.studio.kit_piece_mark_agreed', 'Mark as agreed')}</button>}
        {state !== 'not_made' && <button onClick={() => mark('not_made')} style={button()}>{tt('ext.studio.kit_piece_mark_not_made', 'Mark as not made')}</button>}
      </div>
    </Overlay>
  );
}

// ── Overlays ─────────────────────────────────────────────────────────────────

const Overlay = ({ onClose, width, children }: { onClose: () => void; width: number; children: ReactNode }) => (
  <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px', background: 'rgba(0,0,0,0.55)' }}>
    <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: width, maxHeight: '80%', boxSizing: 'border-box', borderRadius: 12, border: `1px solid ${C.border}`, background: C.panel, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {children}
    </div>
  </div>
);

function NewKit({ onWithAva, onBlank, onClose }: { onWithAva: (p: KnownProject | null) => void; onBlank: (p: KnownProject | null) => void; onClose: () => void }) {
  const projects = kitShapes().projects;
  const [picked, setPicked] = useState(kitProject()?.path ?? '');
  const project = projects.find((p) => p.path === picked) ?? null;
  return (
    <Overlay onClose={onClose} width={420}>
      <h3 style={{ fontSize: 14, fontWeight: 400, color: C.text, margin: 0 }}>{tt('ext.studio.kit_new_title', 'New brand kit')}</h3>
      <div>
        <label style={label}>{tt('ext.studio.kit_new_project', 'Which project is it for?')}</label>
        <Select size="sm" value={picked} onChange={setPicked} options={[{ value: '', label: tt('ext.studio.kit_new_no_project', 'No project yet') }, ...projects.map((p) => ({ value: p.path, label: p.name }))]} />
      </div>
      <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.6, margin: 0 }}>{tt('ext.studio.kit_new_hint', 'Ava reads the project, works out what it is, researches, and puts a kit in front of you to question and agree.')}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => onWithAva(project)} style={button('primary')}>{tt('ext.studio.kit_new_with_ava', 'Make it with Ava')}</button>
        <button onClick={() => onBlank(project)} style={button()}>{tt('ext.studio.kit_new_blank', 'Start blank')}</button>
        <button onClick={onClose} style={{ ...button(), marginLeft: 'auto', border: 'none' }}>{tt('library.cancel', 'Cancel')}</button>
      </div>
    </Overlay>
  );
}

function LibraryPicker({ load, onPick, onClose }: { load: KitActions['loadLibrary']; onPick: (path: string) => void; onClose: () => void }) {
  const [everything, setEverything] = useState(false);
  const [choices, setChoices] = useState<KitLibraryChoice[] | null>(null);
  const [search, setSearch] = useState('');
  useEffect(() => {
    let live = true;
    setChoices(null);
    load(everything).then((c) => { if (live) setChoices(c); }).catch(() => { if (live) setChoices([]); });
    return () => { live = false; };
  }, [load, everything]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? (choices ?? []).filter((c) => c.title.toLowerCase().includes(q)) : choices ?? [];
  }, [choices, search]);
  return (
    <Overlay onClose={onClose} width={440}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <h3 style={{ flex: 1, fontSize: 14, fontWeight: 400, color: C.text, margin: 0 }}>{tt('ext.studio.kit_from_library', 'Choose from your Library')}</h3>
        <button onClick={onClose} style={button()}>{tt('library.cancel', 'Cancel')}</button>
      </div>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tt('ext.studio.kit_library_search', 'Search your Library')} style={input} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: C.soft, cursor: 'pointer' }}>
        <input type="checkbox" checked={everything} onChange={(e) => setEverything(e.target.checked)} />
        {tt('ext.studio.kit_library_all', 'Show all files, including tests and comparisons')}
      </label>
      <div style={{ minHeight: 120, flex: 1, overflowY: 'auto' }}>
        {choices === null ? <p style={{ padding: '32px 0', textAlign: 'center', fontSize: 12, color: C.muted, margin: 0 }}>{tt('dash.studio.model.loading', 'Loading…')}</p>
          : !shown.length ? <p style={{ padding: '32px 0', textAlign: 'center', fontSize: 12, color: C.muted, margin: 0 }}>{search ? tt('ext.studio.kit_library_none', 'Nothing matches that.') : tt('ext.studio.kit_library_empty', 'No images in your Library yet.')}</p>
          : (
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(3, 1fr)' }}>
              {shown.map((c) => (
                <button key={c.key} title={c.title} onClick={() => onPick(c.path)} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, padding: 6, borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
                  <img src={c.src} alt={c.title} loading="lazy" style={{ ...CHECKER, width: '100%', aspectRatio: '1', objectFit: 'contain', borderRadius: 4 }} />
                  <span style={{ fontSize: 10.5, color: C.soft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                </button>
              ))}
            </div>
          )}
      </div>
    </Overlay>
  );
}

// ── The page ─────────────────────────────────────────────────────────────────

export function BrandKitsPage({ actions, onOpenKit }: { actions: KitActions; onOpenKit?: (kit: BrandKit | null) => void }) {
  const [, redraw] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [newKit, setNewKit] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pieceId, setPieceId] = useState<string | null>(null);
  const [pickingForPiece, setPickingForPiece] = useState(false);
  const fonts = useFonts(actions);
  const [confirm, setConfirm] = useState<BrandKit | null>(null);

  // A kit Ava has just proposed comes forward by itself.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const onChange = () => {
      redraw((n) => n + 1);
      const kits = storeKits();
      if (!kits) return;
      if (seen.current) {
        const fresh = kits.find((k) => k.status === 'proposed' && !seen.current!.has(k.id));
        if (fresh) {
          setOpenId(fresh.id); setEditing(false);
          window.dispatchEvent(new CustomEvent('ava-design-card'));
        }
      }
      seen.current = new Set(kits.map((k) => k.id));
    };
    onChange();
    window.addEventListener('ava-kit-changed', onChange);
    return () => window.removeEventListener('ava-kit-changed', onChange);
  }, []);

  const kits = storeKits();
  const open = kits?.find((k) => k.id === openId) ?? null;
  useEffect(() => { onOpenKit?.(open); }, [open, onOpenKit]);
  const openPiece = open && pieceId ? kitPieces(open).find((p) => p.id === pieceId) ?? null : null;
  const active = activeKit().id;
  const save = (kit: BrandKit, patch: Partial<BrandKit>) => { upsertKit({ ...kit, ...patch }); redraw((n) => n + 1); };
  const blank = (project: KnownProject | null) => {
    setNewKit(false);
    const made = createKit('New brand');
    setOpenId(made.id);
    setEditing(true);
    if (project) actions.link(made.id, true, project.path);
  };

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 96px' }}>
        {open && editing ? (
          <Editor kit={open} fonts={fonts} onChange={(p) => save(open, p)} onDone={() => { save(open, { pieces: piecesAfterEditing(open) }); setEditing(false); }} onLibrary={() => setPicking(true)} />
        ) : open ? (
          <Sheet kit={open} actions={actions} onBack={() => setOpenId(null)} onEdit={() => setEditing(true)} onDelete={() => setConfirm(open)} onPickPiece={(p) => setPieceId(p.id)} />
        ) : (
          <>
            <h2 style={{ fontSize: 17, fontWeight: 400, color: C.text, margin: 0 }}>{tt('ext.studio.brand_kits', 'Brand Kits')}</h2>
            <p style={{ fontSize: 12, color: C.muted, margin: '2px 0 16px' }}>{tt('ext.studio.brand_kits_sub2', 'The brand behind your work. Each kit belongs to its projects, and everything made there comes out on it.')}</p>
            <div style={{ display: 'grid', gap: 12, maxWidth: 820, gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
              {(kits ?? []).map((k) => (
                <div key={k.id} onClick={() => setOpenId(k.id)} style={{ borderRadius: 12, overflow: 'hidden', cursor: 'pointer', display: 'flex', flexDirection: 'column', border: `1px solid ${k.id === active ? C.accent : C.border}` }}>
                  <div style={{ position: 'relative' }}>
                    <Hero kit={k} height={120} />
                    {k.status === 'proposed' && <span style={{ ...pill, position: 'absolute', top: 8, left: 8, background: 'rgba(240,162,75,0.2)', color: '#f0a24b' }}>{tt('dash.studio.model.proposed', 'Waiting for you')}</span>}
                    {k.id === active && k.status !== 'proposed' && <span style={{ ...pill, position: 'absolute', top: 8, right: 8, background: 'rgba(13,9,22,0.75)', color: C.accent }}>{tt('ext.studio.kit_active', 'Active')}</span>}
                  </div>
                  <PaletteBar kit={k} height={10} />
                  <div style={{ padding: 12, display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <span style={{ fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.name}</span>
                    <span style={{ fontSize: 11, color: C.muted, minHeight: 16, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.tagline}</span>
                    {!!k.projects?.length && <span title={k.projects.join('\n')} style={{ fontSize: 10, color: C.muted, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tt('ext.studio.kit_linked_to', 'Linked to')} {k.projects.map(lastPart).join(', ')}</span>}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                      {k.id !== active && k.status !== 'proposed' && <button onClick={(e) => { e.stopPropagation(); setActiveKit(k.id); }} style={button('primary')}>{tt('ext.studio.make_active', 'Make active')}</button>}
                      <button onClick={(e) => { e.stopPropagation(); setConfirm(k); }} style={{ ...button('danger'), marginLeft: 'auto' }}>{tt('library.delete', 'Delete')}</button>
                    </div>
                  </div>
                </div>
              ))}
              <button onClick={() => setNewKit(true)} style={{ minHeight: 200, borderRadius: 12, border: `1px dashed ${C.border}`, background: 'transparent', color: C.muted, fontSize: 12, cursor: 'pointer' }}>
                + {tt('ext.studio.kit_add', 'Add brand')}
              </button>
            </div>
          </>
        )}
      </div>

      {newKit && <NewKit onClose={() => setNewKit(false)} onBlank={blank} onWithAva={(p) => { setNewKit(false); actions.withAva(p); }} />}
      {openPiece && open && <PieceCard key={openPiece.id} kit={open} piece={openPiece} actions={actions} fonts={fonts} onSave={(p) => save(open, p)} onLibrary={() => setPickingForPiece(true)} onClose={() => setPieceId(null)} />}
      {pickingForPiece && open && openPiece && <LibraryPicker load={actions.loadLibrary} onClose={() => setPickingForPiece(false)} onPick={(path) => { actions.pieceFromLibrary(open.id, openPiece.id, path); setPickingForPiece(false); }} />}
      {picking && open && <LibraryPicker load={actions.loadLibrary} onClose={() => setPicking(false)} onPick={(path) => { actions.logoFromLibrary(open.id, path); setPicking(false); }} />}
      {confirm && (
        <Overlay onClose={() => setConfirm(null)} width={340}>
          <h3 style={{ fontSize: 14, fontWeight: 400, color: C.text, margin: 0 }}>{tt('dash.studio.delete_title', 'Are you sure you want to delete “{name}”?').replace('{name}', confirm.name)}</h3>
          <p style={{ fontSize: 12, color: C.muted, margin: 0, lineHeight: 1.6 }}>{tt('ext.studio.kit_delete_body', 'The kit and its saved files are removed from disk. Work you made with it stays where it is. It cannot be undone.')}</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => setConfirm(null)} style={button()}>{tt('library.cancel', 'Cancel')}</button>
            <button onClick={() => { deleteKit(confirm.id); if (openId === confirm.id) setOpenId(null); setConfirm(null); }} style={{ ...button('danger'), background: 'rgba(239,68,68,0.15)' }}>{tt('library.delete', 'Delete')}</button>
          </div>
        </Overlay>
      )}
    </div>
  );
}
