/**
 * The readable making record (Library folders and packs plan, Phase 4).
 *
 * A plain text file at the top of every download, on by default: how each
 * piece was made, written from what the tools RECORDED as the work happened
 * (making.jsonl, the Library's origin fields) — never from Ava's memory, and
 * never by Ava. Stores that take AI-assisted work want it declared, and Unity
 * wants it described "without marketing language, describing all
 * modifications made that add value". This is the raw material for that.
 *
 * Rules it holds to:
 *   - It never claims less AI involvement than was recorded.
 *   - A gap is said plainly ("not recorded"), never filled by guessing.
 *   - No words that imply human craft it can't vouch for — no "drawn",
 *     "hand-drawn", "painted" (Unity 1.6.c). Changes made outside Ava are
 *     called exactly that.
 *   - It is a help for their declaration, not the declaration: they check it
 *     and use their store's own words.
 */

import { readMaking, type MakingEvent, type MakingFont } from '../tools/making-record.js';

/** The making record's name in every download — kept as it is in every store layout. */
export const MAKING_RECORD_FILE = 'How-this-was-made.txt';

export interface ReportPiece {
  label: string;
  /** Where it sits in the download, e.g. "Walls/Stone-Wall". */
  where: string;
  ref: string;
  item?: {
    id: string; kind?: string; title?: string; prompt?: string; absoluteFolder?: string;
    origin?: string; aiModel?: string; aiProvider?: string; createdAt?: string; originalName?: string;
  };
  /** A logo system's forms, for logo: refs. */
  forms?: Array<{ origin?: string }>;
}

const LICENCE_WORDS: Record<MakingFont['licence'], string> = {
  OFL: 'SIL Open Font License (OFL)',
  'Apache-2.0': 'Apache License 2.0 — keep its licence and notices with any font file you pass on; some stores refuse it',
  UFL: 'Ubuntu Font Licence',
  'not-google': 'not a Google font: licence not known — check it before a font file ships',
  alias: 'a generic name; the real font depends on the computer it was made on — not recorded',
  builtin: "Blender's built-in font",
  unchecked: 'licence not checked (offline at the time)',
  unread: 'could not be read',
};

const day = (iso?: string) => (iso ? iso.slice(0, 10) : 'an unrecorded date');
const quote = (s: string, max = 240) => `"${s.length > max ? `${s.slice(0, max - 1)}…` : s}"`;
const PROVIDERS: Record<string, string> = {
  qwen: 'Qwen, Alibaba Cloud', dashscope: 'Qwen, Alibaba Cloud', deepseek: 'DeepSeek', mistral: 'Mistral AI',
  anthropic: 'Anthropic', openai: 'OpenAI', google: 'Google', minimax: 'MiniMax', local: 'a model on their own computer',
};
const provider = (p?: string) => (p ? PROVIDERS[p.toLowerCase()] ?? p : '');
const aiName = (ai: MakingEvent['ai']) => (ai ? `${ai.name ?? ai.id}${ai.provider ? ` (${provider(ai.provider)})` : ''}` : 'an AI model that was not recorded');

interface PieceFacts {
  lines: string[];
  /** AI models that took part, for the summary. */
  ai: Set<string>;
  generatedBy: Set<string>;
  theirs: boolean;
  unknown: boolean;
  fonts: MakingFont[];
}

/** A Blender or GIMP piece, from its making.jsonl. */
async function fromRecord(dir: string, roomName: string): Promise<PieceFacts> {
  const ev = await readMaking(dir);
  const facts: PieceFacts = { lines: [], ai: new Set(), generatedBy: new Set(), theirs: false, unknown: false, fonts: [] };
  const L = facts.lines;
  if (!ev.length) {
    facts.unknown = true;
    L.push(`Made in the ${roomName} room before Ava Supernova kept a making record. How it was made, and which AI model wrote its steps, are not recorded.`);
    return facts;
  }
  const started = ev.find((e) => e.event === 'record_started');
  if (started?.earlier) {
    facts.unknown = true;
    L.push('Part of this piece was made before the making record began. Those earlier steps, the AI model that made them, and any changes outside Ava are not recorded.');
  }

  const steps = ev.filter((e) => e.event === 'step');
  const apps = [...new Set(steps.map((e) => String(e.app ?? '')).filter(Boolean))];
  const models = [...new Set(steps.map((e) => aiName(e.ai ?? null)))];
  for (const m of models) facts.ai.add(m);
  if (steps.length) {
    L.push(`Made in ${apps.join(', ') || roomName} by Ava Supernova, an AI design assistant: it wrote and ran the ${steps.length} recorded step${steps.length === 1 ? '' : 's'} (scripts that build and change the file). AI model${models.length === 1 ? '' : 's'}: ${models.join(', ')}.`);
  }

  // The brief.
  const proposed = ev.filter((e) => e.event === 'brief_proposed');
  const edited = ev.filter((e) => e.event === 'brief_edited');
  const agreed = ev.filter((e) => e.event === 'brief_agreed');
  if (proposed.length) {
    const last = proposed[proposed.length - 1];
    const changedFields = [...new Set(edited.flatMap((e) => Object.keys((e.changed as Record<string, unknown>) ?? {})))];
    L.push(`Brief: proposed by Ava (${aiName(last.ai ?? null)})${proposed.length > 1 ? `, revised ${proposed.length - 1} time${proposed.length === 2 ? '' : 's'}` : ''}` +
      `${changedFields.length ? `; the person changed ${changedFields.join(', ')}` : ''}` +
      `${agreed.length ? `; agreed by the person on ${day(agreed[agreed.length - 1].at)}` : '; not recorded as agreed'}.`);
  }

  // Their direction, in their own words.
  const asks = [...new Set(ev.filter((e) => e.by === 'ava' && typeof e.ask === 'string' && e.ask).map((e) => e.ask as string))];
  if (asks.length) {
    L.push(`Direction from the person (${asks.length} message${asks.length === 1 ? '' : 's'}, their words):`);
    for (const a of asks.slice(0, 12)) L.push(`  - ${quote(a.replace(/\s+/g, ' '))}`);
    if (asks.length > 12) L.push(`  - …and ${asks.length - 12} more.`);
  }

  // Their choices.
  const choices: string[] = [];
  for (const e of ev) {
    if (e.event === 'option_picked') choices.push(`picked "${e.label}" for ${quote(String(e.question ?? 'a choice'), 80)}`);
    if (e.event === 'main_chosen') choices.push(`chose "${e.name}" as the main design`);
    if (e.event === 'version_deleted') choices.push(`deleted design "${e.name}"`);
    if (e.event === 'version_kept') choices.push(`kept "${e.name}" as its own piece`);
    if (e.event === 'final_removed') choices.push(`took ${e.file} out of the finished files`);
    if (e.event === 'restored' && e.by === 'person') choices.push(`went back to step ${e.step}`);
  }
  if (choices.length) L.push(`The person's choices: ${choices.join('; ')}.`);
  // Ava's own actions on the work, said as hers — the record knows she acted, not why.
  const avaActs: string[] = [];
  for (const e of ev) {
    if (e.event === 'restored' && e.by === 'ava') avaActs.push(`went back to step ${e.step}`);
    if (e.event === 'marked_final' && e.by === 'ava') avaActs.push(`marked ${(e.files as string[] ?? []).join(', ')} as finished`);
    if (e.event === 'options_shown') avaActs.push(`put ${(e.options as unknown[] ?? []).length} options up for the person to choose from`);
  }
  if (avaActs.length) L.push(`Ava also: ${avaActs.join('; ')}.`);

  // Brought in.
  const brought = ev.filter((e) => e.event === 'brought_in');
  for (const b of brought) {
    const how = b.made === 'generated' ? `AI-generated in Open Canvas${b.aiModel ? ` with ${b.aiModel}` : ' (model not recorded)'}`
      : b.made === 'composed' ? 'a logo built from shapes and fonts'
      : b.made === 'uploaded' ? 'their own file'
      : b.fromLibrary ? 'from the Library, how it was made not recorded'
      : 'a file from their computer, how it was made not recorded';
    if (b.made === 'generated' && b.aiModel) facts.generatedBy.add(String(b.aiModel));
    if (b.made !== 'generated' && b.made !== 'composed' && b.made !== 'uploaded') facts.unknown = true;
    L.push(`Brought in: ${b.original ?? b.file} — ${how}.`);
  }
  const placed = [...new Set(steps.flatMap((e) => [...(e.placed as string[] ?? []), ...(e.imagesUsed as string[] ?? [])]))];
  if (placed.length) L.push(`Pictures placed into the work: ${placed.join(', ')}.`);
  const logos = [...new Set(steps.flatMap((e) => e.kitLogos as string[] ?? []))];
  if (logos.length) L.push(`Brand kit logo used: ${logos.join(', ')}.`);

  // Changed outside Ava.
  const outside = ev.filter((e) => e.event === 'outside_change');
  if (outside.length) {
    L.push(`Changed outside Ava Supernova ${outside.length} time${outside.length === 1 ? '' : 's'}: ${outside.map((e) => [...(e.changed as string[] ?? []), ...(e.added as string[] ?? [])].join(', ') || 'files removed').join('; ')}. What those changes were is not recorded.`);
  } else if (steps.length) {
    L.push('No changes to its working file outside Ava were detected between recorded steps. Only the working file is checked, so other changes may not be captured.');
  }

  // Fonts in the file.
  const fonts = new Map<string, MakingFont>();
  for (const e of steps) for (const f of (e.fonts as MakingFont[] ?? [])) fonts.set(f.name, f);
  facts.fonts = [...fonts.values()];
  if (facts.fonts.length) L.push(`Fonts in the file: ${facts.fonts.map((f) => `${f.name} (${LICENCE_WORDS[f.licence] ?? f.licence})`).join('; ')}.`);
  return facts;
}

/** Anything else in the Library, from how it was saved. */
function fromLibrary(piece: ReportPiece): PieceFacts {
  const facts: PieceFacts = { lines: [], ai: new Set(), generatedBy: new Set(), theirs: false, unknown: false, fonts: [] };
  const it = piece.item;
  if (piece.ref.startsWith('file:')) {
    facts.unknown = true;
    facts.lines.push('A file from their project. How it was made is not recorded.');
    return facts;
  }
  if (piece.ref.startsWith('logo:')) {
    if (piece.forms?.length && piece.forms.every((f) => f.origin === 'composed')) {
      facts.lines.push('A logo built by code from shapes and fonts in the Logo room, directed by Ava Supernova (an AI design assistant). No picture was generated. Which AI model directed it is not recorded.');
      facts.ai.add('an AI model that was not recorded (Logo room)');
    } else {
      facts.unknown = true;
      facts.lines.push('A logo saved before Ava Supernova recorded how pieces were made. Whether and how AI made it is not recorded.');
    }
    return facts;
  }
  if (it?.origin === 'generated') {
    const model = it.aiModel ? `${it.aiModel}${it.aiProvider ? `, ${provider(it.aiProvider)}` : ''}` : 'an AI model that was not recorded';
    facts.generatedBy.add(model);
    facts.lines.push(`Generated by AI (${model}) in Open Canvas${it.createdAt ? ` on ${day(it.createdAt)}` : ''}${it.prompt ? `, from the prompt ${quote(it.prompt, 300)}` : ''}.`);
  } else if (it?.origin === 'uploaded') {
    facts.theirs = true;
    facts.lines.push(`Their own file${it.originalName ? ` (${it.originalName})` : ''}, uploaded on ${day(it.createdAt)}. Ava Supernova did not make it; how it was made is theirs to describe.`);
  } else if (it?.origin === 'composed') {
    facts.lines.push('Built by code from shapes and fonts, directed by Ava Supernova (an AI design assistant). Which AI model directed it is not recorded.');
    facts.ai.add('an AI model that was not recorded');
  } else {
    facts.unknown = true;
    facts.lines.push('Saved before Ava Supernova recorded how pieces were made. Whether and how AI made it is not recorded.');
  }
  return facts;
}

/** The whole text file. */
export async function buildMakingReport(packName: string, pieces: ReportPiece[], at = new Date()): Promise<string> {
  const sections: string[] = [];
  const ai = new Map<string, number>();
  const generated = new Map<string, number>();
  const fonts = new Map<string, MakingFont>();
  let theirs = 0;
  let unknown = 0;

  for (const p of pieces) {
    const kind = p.item?.kind;
    const recorded = (kind === 'gimp' || (kind === 'model' && !p.item?.id.startsWith('upload_'))) && p.item?.absoluteFolder;
    const facts = recorded ? await fromRecord(p.item!.absoluteFolder!, kind === 'gimp' ? 'GIMP' : 'Blender') : fromLibrary(p);
    for (const m of facts.ai) ai.set(m, (ai.get(m) ?? 0) + 1);
    for (const m of facts.generatedBy) generated.set(m, (generated.get(m) ?? 0) + 1);
    for (const f of facts.fonts) fonts.set(f.name, f);
    if (facts.theirs) theirs++;
    if (facts.unknown) unknown++;
    sections.push([`${p.label}`, `  In this download: ${p.where}`, ...facts.lines.map((l) => (l.startsWith('  ') ? `  ${l}` : `  ${l}`))].join('\n'));
  }

  const summary: string[] = [];
  if (ai.size) summary.push(`- Ava Supernova, an AI design assistant, made or directed pieces in this pack. AI models: ${[...ai.entries()].map(([m, n]) => `${m}: ${n} piece${n === 1 ? '' : 's'}`).join('; ')}.`);
  if (generated.size) summary.push(`- Pictures generated by AI: ${[...generated.entries()].map(([m, n]) => `${m}: ${n} piece${n === 1 ? '' : 's'}`).join('; ')}.`);
  if (theirs) summary.push(`- Their own uploaded files, not made by Ava Supernova: ${theirs} piece${theirs === 1 ? '' : 's'}.`);
  if (unknown) summary.push(`- Not fully recorded: ${unknown} piece${unknown === 1 ? '' : 's'}. Where something is not recorded it says so below; nothing has been guessed.`);
  if (fonts.size) summary.push(`- Fonts: ${[...fonts.values()].map((f) => `${f.name} (${LICENCE_WORDS[f.licence] ?? f.licence})`).join('; ')}.`);

  return [
    `HOW THIS WAS MADE — ${packName}`,
    `${pieces.length} piece${pieces.length === 1 ? '' : 's'} · written ${day(at.toISOString())} by Ava Supernova`,
    '',
    'This record is built from what Ava Supernova recorded while the work was made. It is a help for',
    'declaring AI use to a store, not the declaration itself: check it, and use your store\'s own words.',
    'It never claims less AI involvement than was recorded, and where something was not recorded it',
    'says so rather than guessing. Many stores require AI use to be declared; that is yours to do.',
    '',
    'SUMMARY',
    ...(summary.length ? summary : ['- Nothing about how these pieces were made was recorded.']),
    '',
    'EACH PIECE',
    '',
    sections.join('\n\n'),
    '',
  ].join('\n');
}
