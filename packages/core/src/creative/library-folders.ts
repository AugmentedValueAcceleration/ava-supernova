/**
 * Library folders: named folders anyone can make to organise their work their
 * own way (Library folders and packs plan, Phase 1, 9 Nov 2026).
 *
 * FOLDERS ARE NAMES, NOT DISK FOLDERS. A folder holds pointers to work in the
 * Library; files never move. Brand kits, rooms and copies already hold file
 * locations, so moving a file would break them. One piece can sit in several
 * folders, and deleting a folder never deletes work.
 *
 * Stored in ~/.ava/creative/folders.json, owned by core so the extension and
 * the IDE share one set. Every change goes through one queue and is written
 * whole to a temp file then renamed, so a reader never sees half a file.
 *
 * A member is a reference, by kind:
 *   creative:<id>   an entry in the Library's metadata.json (image, video,
 *                   voice, GIMP work, 3D model, upload)
 *   logo:<group>    a logo system: every variant saved as <group>_<variant>
 *   file:<path>     a file in an open project, by absolute path
 * `pick` chooses part of a work (some GIMP finals, some logo forms); absent
 * means the whole work.
 *
 * Work removed from the Library drops out of its folders on the next read:
 * creative and logo references that no longer resolve are cleared — but only
 * when the Library index was read cleanly, so a half-written index can never
 * empty a folder. Project files are never cleared: a drive that isn't plugged
 * in is not a deleted file. They are reported as missing instead.
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { creativeDir, metadataFile } from '../tools/blender/paths.js';

export interface FolderMember {
  ref: string;
  /** Part of a work, e.g. ["final/logo-64.png"] or ["primary", "favicon"]. Absent = the whole work. */
  pick?: string[];
  addedAt: string;
}

export interface LibraryFolder {
  id: string;
  name: string;
  /** null = top level. */
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  members: FolderMember[];
  /** One line on how everything in this folder looks, e.g. "flat, two colours,
   *  2px dark outline, 64px grid". Theirs: written in the Folders tab, or by
   *  Ava only after they say yes (his call, 9 Nov). She reads it before every
   *  brief for work in this folder. */
  note?: string;
  /** The pack plan: what this pack needs, piece by piece. Shown pinned inside
   *  the folder, never a real subfolder — so it never ships in a download. */
  plan?: PackPlan;
}

/** One planned piece of a pack. */
export interface PlanItem {
  id: string;
  /** "Arched window". */
  name: string;
  /** One line: what it is and what it must do. */
  what: string;
  /** The room that makes it. */
  tool: 'gimp' | 'blender' | 'other';
  /** The folder inside the pack it is filed into, e.g. "Windows". Absent = the pack itself. */
  folder?: string;
  /** The work making it, once started: its room and name. */
  work?: { tool: 'gimp' | 'blender'; slug: string; name: string };
}

/**
 * The pack plan (his idea, 9 Nov 2026): Ava proposes it like a brief — every
 * piece the pack needs, with her reasoning — and they edit and agree it.
 * Agreeing it builds the folders inside the pack. Every piece is still made
 * one at a time with its own agreed brief: the plan is the map, never a
 * button. A change by them puts it back to proposed: a changed plan is a new
 * agreement.
 */
export interface PackPlan {
  title: string;
  reasoning: string;
  status: 'proposed' | 'agreed';
  proposedAt: string;
  agreedAt?: string;
  editedByPerson?: boolean;
  items: PlanItem[];
}

export interface FoldersFile { version: 1; folders: LibraryFolder[] }

export type FolderResult<T = LibraryFolder> = { ok: true; value: T } | { ok: false; error: string };

export const MAX_FOLDER_NAME = 80;
export const MAX_FOLDER_DEPTH = 8;
export const MAX_FOLDER_NOTE = 400;

export const foldersFile = () => join(creativeDir(), 'folders.json');

// ── Reading ──────────────────────────────────────────────────────────────────

async function readRaw(): Promise<FoldersFile> {
  try {
    const parsed = JSON.parse(await readFile(foldersFile(), 'utf-8')) as Partial<FoldersFile>;
    if (Array.isArray(parsed?.folders)) return { version: 1, folders: parsed.folders.filter(isFolder) };
  } catch { /* none yet, or unreadable: start empty rather than fail */ }
  return { version: 1, folders: [] };
}

function isFolder(f: unknown): f is LibraryFolder {
  const x = f as LibraryFolder;
  return !!x && typeof x.id === 'string' && typeof x.name === 'string' && Array.isArray(x.members);
}

/** What the Library holds right now, or null if its index can't be read cleanly. */
async function libraryRefs(): Promise<{ creative: Set<string>; logos: Set<string> } | null> {
  if (!existsSync(metadataFile())) return { creative: new Set(), logos: new Set() };
  try {
    const items = JSON.parse(await readFile(metadataFile(), 'utf-8'));
    if (!Array.isArray(items)) return null;
    const creative = new Set<string>();
    const logos = new Set<string>();
    for (const i of items) {
      if (typeof i?.id !== 'string') continue;
      creative.add(i.id);
      const m = /^(logo_\d+)_[a-z-]+$/.exec(i.id);
      if (m) logos.add(m[1]);
    }
    return { creative, logos };
  } catch { return null; }
}

function resolves(ref: string, lib: { creative: Set<string>; logos: Set<string> }): boolean {
  if (ref.startsWith('creative:')) return lib.creative.has(ref.slice(9));
  if (ref.startsWith('logo:')) return lib.logos.has(ref.slice(5));
  return true; // file: refs are never cleared
}

/** Every folder, with work that has left the Library cleared out. */
export async function readFolders(): Promise<LibraryFolder[]> {
  return queued(async () => {
    const file = await readRaw();
    const lib = await libraryRefs();
    if (!lib) return file.folders;
    let changed = false;
    for (const f of file.folders) {
      const kept = f.members.filter((m) => resolves(m.ref, lib));
      if (kept.length !== f.members.length) { f.members = kept; changed = true; }
    }
    if (changed) await writeAll(file);
    return file.folders;
  });
}

/** Project files a folder points at that aren't there now (e.g. a drive unplugged). */
export function missingFiles(folder: LibraryFolder): string[] {
  return folder.members.filter((m) => m.ref.startsWith('file:') && !existsSync(m.ref.slice(5))).map((m) => m.ref.slice(5));
}

// ── Writing ──────────────────────────────────────────────────────────────────

let queue: Promise<unknown> = Promise.resolve();
function queued<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
  return next;
}

async function writeAll(file: FoldersFile): Promise<void> {
  await mkdir(creativeDir(), { recursive: true });
  const tmp = `${foldersFile()}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(file, null, 2), 'utf-8');
  await rename(tmp, foldersFile());
}

/** Read, change, write — all inside the queue, so two changes never cross. */
function change<T>(fn: (file: FoldersFile) => FolderResult<T>): Promise<FolderResult<T>> {
  return queued(async () => {
    const file = await readRaw();
    const res = fn(file);
    if (res.ok) await writeAll(file);
    return res;
  });
}

// ── Rules ────────────────────────────────────────────────────────────────────

function cleanName(raw: string): FolderResult<string> {
  const name = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!name) return { ok: false, error: 'Give the folder a name.' };
  if (name.length > MAX_FOLDER_NAME) return { ok: false, error: `Folder names can be up to ${MAX_FOLDER_NAME} characters.` };
  if (/[\\/:*?"<>|\u0000-\u001f]/.test(name)) return { ok: false, error: 'Folder names can\'t contain \\ / : * ? " < > |, because a folder can be downloaded as a real one.' };
  if (/^\.+$/.test(name)) return { ok: false, error: 'That name can\'t be used for a folder.' };
  return { ok: true, value: name };
}

function nameTaken(file: FoldersFile, name: string, parentId: string | null, except?: string): boolean {
  return file.folders.some((f) => f.parentId === parentId && f.id !== except && f.name.toLowerCase() === name.toLowerCase());
}

function depthOf(file: FoldersFile, id: string | null): number {
  let d = 0;
  for (let cur = id; cur; d++) {
    cur = file.folders.find((f) => f.id === cur)?.parentId ?? null;
    if (d > 64) break;
  }
  return d;
}

function subtreeHeight(file: FoldersFile, id: string): number {
  const kids = file.folders.filter((f) => f.parentId === id);
  return kids.length ? 1 + Math.max(...kids.map((k) => subtreeHeight(file, k.id))) : 0;
}

const now = () => new Date().toISOString();

// ── Folders ──────────────────────────────────────────────────────────────────

export function createFolder(rawName: string, parentId: string | null = null): Promise<FolderResult> {
  return change((file) => {
    const name = cleanName(rawName);
    if (!name.ok) return name;
    if (parentId && !file.folders.some((f) => f.id === parentId)) return { ok: false, error: 'That folder no longer exists.' };
    if (depthOf(file, parentId) >= MAX_FOLDER_DEPTH) return { ok: false, error: `Folders can go ${MAX_FOLDER_DEPTH} deep.` };
    if (nameTaken(file, name.value, parentId)) return { ok: false, error: `There is already a folder called "${name.value}" here.` };
    const at = now();
    const folder: LibraryFolder = { id: `fld_${randomUUID().slice(0, 12)}`, name: name.value, parentId, createdAt: at, updatedAt: at, members: [] };
    file.folders.push(folder);
    return { ok: true, value: folder };
  });
}

export function renameFolder(id: string, rawName: string): Promise<FolderResult> {
  return change((file) => {
    const folder = file.folders.find((f) => f.id === id);
    if (!folder) return { ok: false, error: 'That folder no longer exists.' };
    const name = cleanName(rawName);
    if (!name.ok) return name;
    if (nameTaken(file, name.value, folder.parentId, id)) return { ok: false, error: `There is already a folder called "${name.value}" here.` };
    folder.name = name.value;
    folder.updatedAt = now();
    return { ok: true, value: folder };
  });
}

/** Move a folder inside another, or to the top level (null). Never into itself. */
export function moveFolder(id: string, parentId: string | null): Promise<FolderResult> {
  return change((file) => {
    const folder = file.folders.find((f) => f.id === id);
    if (!folder) return { ok: false, error: 'That folder no longer exists.' };
    if (parentId) {
      if (!file.folders.some((f) => f.id === parentId)) return { ok: false, error: 'That folder no longer exists.' };
      for (let cur: string | null = parentId; cur; cur = file.folders.find((f) => f.id === cur)?.parentId ?? null) {
        if (cur === id) return { ok: false, error: 'A folder can\'t go inside itself.' };
      }
    }
    if (depthOf(file, parentId) + 1 + subtreeHeight(file, id) > MAX_FOLDER_DEPTH) return { ok: false, error: `Folders can go ${MAX_FOLDER_DEPTH} deep.` };
    if (nameTaken(file, folder.name, parentId, id)) return { ok: false, error: `There is already a folder called "${folder.name}" there.` };
    folder.parentId = parentId;
    folder.updatedAt = now();
    return { ok: true, value: folder };
  });
}

/**
 * Delete a folder. Never deletes work: the work stays in the Library. Folders
 * inside it move up one level, so nothing they hold is lost either; a name
 * that would clash there gets " (2)" added.
 */
export function deleteFolder(id: string): Promise<FolderResult<{ movedUp: number }>> {
  return change((file) => {
    const folder = file.folders.find((f) => f.id === id);
    if (!folder) return { ok: false, error: 'That folder no longer exists.' };
    const kids = file.folders.filter((f) => f.parentId === id);
    file.folders = file.folders.filter((f) => f.id !== id);
    for (const kid of kids) {
      kid.parentId = folder.parentId;
      let name = kid.name;
      for (let n = 2; nameTaken(file, name, kid.parentId, kid.id); n++) name = `${kid.name} (${n})`;
      kid.name = name;
      kid.updatedAt = now();
    }
    return { ok: true, value: { movedUp: kids.length } };
  });
}

// ── What's in a folder ───────────────────────────────────────────────────────

const REF = /^(creative|logo|file):.+/;

export function addToFolder(id: string, items: Array<{ ref: string; pick?: string[] }>): Promise<FolderResult> {
  return change((file) => {
    const folder = file.folders.find((f) => f.id === id);
    if (!folder) return { ok: false, error: 'That folder no longer exists.' };
    const bad = items.find((i) => !REF.test(String(i?.ref ?? '')));
    if (bad) return { ok: false, error: 'That can\'t go in a folder.' };
    for (const item of items) {
      const pick = Array.isArray(item.pick) && item.pick.length ? [...new Set(item.pick.map(String))] : undefined;
      const existing = folder.members.find((m) => m.ref === item.ref);
      if (existing) {
        if (pick) existing.pick = existing.pick ? [...new Set([...existing.pick, ...pick])] : undefined;
        else delete existing.pick; // the whole work now
      } else {
        folder.members.push({ ref: item.ref, ...(pick ? { pick } : {}), addedAt: now() });
      }
    }
    folder.updatedAt = now();
    return { ok: true, value: folder };
  });
}

/** Take work out of a folder. The work itself is untouched. */
export function removeFromFolder(id: string, refs: string[]): Promise<FolderResult> {
  return change((file) => {
    const folder = file.folders.find((f) => f.id === id);
    if (!folder) return { ok: false, error: 'That folder no longer exists.' };
    const out = new Set(refs);
    folder.members = folder.members.filter((m) => !out.has(m.ref));
    folder.updatedAt = now();
    return { ok: true, value: folder };
  });
}

/** Choose which parts of a work are in the folder. An empty list means the whole work. */
export function setMemberPick(id: string, ref: string, pick: string[]): Promise<FolderResult> {
  return change((file) => {
    const folder = file.folders.find((f) => f.id === id);
    const member = folder?.members.find((m) => m.ref === ref);
    if (!folder || !member) return { ok: false, error: 'That work isn\'t in this folder any more.' };
    if (pick.length) member.pick = [...new Set(pick.map(String))];
    else delete member.pick;
    folder.updatedAt = now();
    return { ok: true, value: folder };
  });
}

/** The folder's style note. Empty clears it. */
export function setFolderNote(id: string, raw: string): Promise<FolderResult> {
  return change((file) => {
    const folder = file.folders.find((f) => f.id === id);
    if (!folder) return { ok: false, error: 'That folder no longer exists.' };
    const note = String(raw ?? '').replace(/\s+/g, ' ').trim();
    if (note.length > MAX_FOLDER_NOTE) return { ok: false, error: `Keep the style note to ${MAX_FOLDER_NOTE} characters: one line on how everything in it looks.` };
    if (note) folder.note = note; else delete folder.note;
    folder.updatedAt = now();
    return { ok: true, value: folder };
  });
}

/** A folder by id, by name, or by path ("Pack / Icons"), case-insensitive. */
export function findFolder(folders: LibraryFolder[], key: string): LibraryFolder | null {
  const k = String(key ?? '').trim();
  if (!k) return null;
  const byId = folders.find((f) => f.id === k);
  if (byId) return byId;
  const parts = k.split('/').map((p) => p.trim().toLowerCase()).filter(Boolean);
  const pathOf = (f: LibraryFolder): string[] => {
    const out: string[] = [];
    for (let cur: LibraryFolder | undefined = f; cur; cur = folders.find((x) => x.id === cur!.parentId)) out.unshift(cur.name.toLowerCase());
    return out;
  };
  const exact = folders.filter((f) => pathOf(f).join('/') === parts.join('/'));
  if (exact.length === 1) return exact[0];
  const byName = folders.filter((f) => f.name.toLowerCase() === parts[parts.length - 1]);
  return byName.length === 1 ? byName[0] : null;
}

/** "Pack / Icons" for a folder. */
export function folderPath(folders: LibraryFolder[], f: LibraryFolder): string {
  const out: string[] = [];
  for (let cur: LibraryFolder | undefined = f; cur && out.length < 64; cur = folders.find((x) => x.id === cur!.parentId)) out.unshift(cur.name);
  return out.join(' / ');
}

// ── Pack plans ───────────────────────────────────────────────────────────────

export const MAX_PLAN_ITEMS = 200;

type ItemInput = { name?: unknown; what?: unknown; tool?: unknown; folder?: unknown };

function cleanItem(raw: ItemInput, id?: string): FolderResult<PlanItem> {
  const name = String(raw?.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const what = String(raw?.what ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!name) return { ok: false, error: 'Every piece in the plan needs a name.' };
  const tool = raw?.tool === 'gimp' || raw?.tool === 'blender' ? raw.tool : 'other';
  let folder: string | undefined;
  if (typeof raw?.folder === 'string' && raw.folder.trim()) {
    const f = cleanName(raw.folder);
    if (!f.ok) return { ok: false, error: `"${name}": ${f.error}` };
    folder = f.value;
  }
  return { ok: true, value: { id: id ?? `pi_${randomUUID().slice(0, 10)}`, name, what, tool, ...(folder ? { folder } : {}) } };
}

/** Her proposal (or a revised one). Pieces already started keep their work, matched by name. */
export function proposePackPlan(id: string, input: { title?: unknown; reasoning?: unknown; items?: unknown }): Promise<FolderResult> {
  return change((file) => {
    const folder = file.folders.find((f) => f.id === id);
    if (!folder) return { ok: false, error: 'That folder no longer exists.' };
    const reasoning = String(input.reasoning ?? '').trim();
    if (!reasoning) return { ok: false, error: 'Give your reasoning: what the pack is for, what a buyer or engine expects, why these pieces. It is what they question.' };
    const raw = Array.isArray(input.items) ? input.items as ItemInput[] : [];
    if (!raw.length) return { ok: false, error: 'A plan needs at least one piece.' };
    if (raw.length > MAX_PLAN_ITEMS) return { ok: false, error: `A plan can hold up to ${MAX_PLAN_ITEMS} pieces.` };
    const before = new Map((folder.plan?.items ?? []).map((i) => [i.name.toLowerCase(), i]));
    const items: PlanItem[] = [];
    for (const r of raw) {
      const res = cleanItem(r);
      if (!res.ok) return res;
      if (items.some((i) => i.name.toLowerCase() === res.value.name.toLowerCase())) return { ok: false, error: `"${res.value.name}" is in the plan twice. Give each piece its own name.` };
      const kept = before.get(res.value.name.toLowerCase());
      items.push(kept?.work ? { ...res.value, id: kept.id, work: kept.work } : res.value);
    }
    folder.plan = {
      title: String(input.title ?? '').trim().slice(0, 80) || folder.name,
      reasoning: reasoning.slice(0, 4000),
      status: 'proposed', proposedAt: now(), items,
    };
    folder.updatedAt = now();
    return { ok: true, value: folder };
  });
}

/**
 * Their button. The ONLY way a plan becomes agreed — and it builds the
 * folders inside the pack that the plan names, so every piece has its place.
 */
export function agreePackPlan(id: string): Promise<FolderResult> {
  return change((file) => {
    const folder = file.folders.find((f) => f.id === id);
    if (!folder?.plan) return { ok: false, error: 'There is no plan here to agree.' };
    for (const name of [...new Set(folder.plan.items.map((i) => i.folder).filter((f): f is string => !!f))]) {
      if (file.folders.some((f) => f.parentId === folder.id && f.name.toLowerCase() === name.toLowerCase())) continue;
      if (depthOf(file, folder.id) >= MAX_FOLDER_DEPTH) return { ok: false, error: `This pack is already ${MAX_FOLDER_DEPTH} folders deep, so "${name}" can't go inside it.` };
      const at = now();
      file.folders.push({ id: `fld_${randomUUID().slice(0, 12)}`, name, parentId: folder.id, createdAt: at, updatedAt: at, members: [] });
    }
    folder.plan.status = 'agreed';
    folder.plan.agreedAt = now();
    folder.updatedAt = now();
    return { ok: true, value: folder };
  });
}

/** Their edits: change (itemId + fields), add (null + fields) or remove (itemId + null) a piece. A changed plan is agreed again. */
export function editPlanItem(id: string, itemId: string | null, raw: ItemInput | null): Promise<FolderResult> {
  return change((file) => {
    const folder = file.folders.find((f) => f.id === id);
    const plan = folder?.plan;
    if (!folder || !plan) return { ok: false, error: 'There is no plan here.' };
    if (itemId && raw === null) {
      plan.items = plan.items.filter((i) => i.id !== itemId);
    } else {
      const existing = itemId ? plan.items.find((i) => i.id === itemId) : undefined;
      if (itemId && !existing) return { ok: false, error: 'That piece is no longer in the plan.' };
      const res = cleanItem({ ...(existing ?? {}), ...(raw ?? {}) }, existing?.id);
      if (!res.ok) return res;
      if (plan.items.some((i) => i.id !== res.value.id && i.name.toLowerCase() === res.value.name.toLowerCase())) return { ok: false, error: `There is already a "${res.value.name}" in the plan.` };
      const next = existing?.work ? { ...res.value, work: existing.work } : res.value;
      if (existing) plan.items = plan.items.map((i) => (i.id === existing.id ? next : i));
      else if (plan.items.length >= MAX_PLAN_ITEMS) return { ok: false, error: `A plan can hold up to ${MAX_PLAN_ITEMS} pieces.` };
      else plan.items.push(next);
    }
    plan.editedByPerson = true;
    plan.status = 'proposed';
    delete plan.agreedAt;
    folder.updatedAt = now();
    return { ok: true, value: folder };
  });
}

export function deletePackPlan(id: string): Promise<FolderResult> {
  return change((file) => {
    const folder = file.folders.find((f) => f.id === id);
    if (!folder) return { ok: false, error: 'That folder no longer exists.' };
    delete folder.plan;
    folder.updatedAt = now();
    return { ok: true, value: folder };
  });
}

export const planWorkId = (w: { tool: 'gimp' | 'blender'; slug: string }) => (w.tool === 'gimp' ? `gimp_${w.slug}` : `model_${w.slug}`);

/** Where a planned piece is filed: its folder inside the pack, or the pack itself. */
function homeOf(folders: LibraryFolder[], pack: LibraryFolder, item: PlanItem): LibraryFolder {
  if (!item.folder) return pack;
  return folders.find((f) => f.parentId === pack.id && f.name.toLowerCase() === item.folder!.toLowerCase()) ?? pack;
}

/**
 * Link a planned piece to the work making it — Ava, when she starts it. Only
 * on an agreed plan. If the work is already in the Library it is filed now;
 * otherwise it is filed when its first step is made (fileLinkedWork).
 */
export function startPlanItem(id: string, item: string, tool: 'gimp' | 'blender', workName: string, slug: string): Promise<FolderResult<{ item: PlanItem; home: string }>> {
  return queued(async () => {
    const lib = await libraryRefs();
    const file = await readRaw();
    const folder = file.folders.find((f) => f.id === id);
    const plan = folder?.plan;
    if (!folder || !plan) return { ok: false as const, error: 'This folder has no pack plan.' };
    if (plan.status !== 'agreed') return { ok: false as const, error: 'The plan is still waiting for them to agree it. Ask them to agree it in the folder first.' };
    const key = item.trim().toLowerCase();
    const piece = plan.items.find((i) => i.id === item || i.name.toLowerCase() === key);
    if (!piece) return { ok: false as const, error: `There is no "${item}" in the plan. It has: ${plan.items.map((i) => i.name).join(', ')}.` };
    piece.work = { tool, slug, name: workName.trim() };
    const home = homeOf(file.folders, folder, piece);
    const ref = `creative:${planWorkId(piece.work)}`;
    if (lib?.creative.has(planWorkId(piece.work)) && !home.members.some((m) => m.ref === ref)) home.members.push({ ref, addedAt: now() });
    folder.updatedAt = now();
    await writeAll(file);
    return { ok: true as const, value: { item: piece, home: home.name } };
  });
}

/**
 * A step of work was just made: if a plan names this work, file it into its
 * folder in the pack. Called by the build tools; never fails the build.
 */
export function fileLinkedWork(tool: 'gimp' | 'blender', slug: string): Promise<void> {
  return queued(async () => {
    const file = await readRaw();
    const ref = `creative:${planWorkId({ tool, slug })}`;
    let changed = false;
    for (const pack of file.folders) {
      for (const item of pack.plan?.items ?? []) {
        if (item.work?.tool !== tool || item.work.slug !== slug) continue;
        const home = homeOf(file.folders, pack, item);
        if (!home.members.some((m) => m.ref === ref)) { home.members.push({ ref, addedAt: now() }); changed = true; }
      }
    }
    if (changed) await writeAll(file);
  }).catch(() => { /* the work is made either way */ });
}
