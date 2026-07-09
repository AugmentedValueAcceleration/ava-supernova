# Brand Kits — Build Plan

**Goal:** turn the single, design-only Brand Kit into **multiple named kits, one active**, where each kit is a full brand identity — **Identity + Look + Voice** — stored **locally**, and the active kit is passed into *all* generation (design **and** posts). Retire the cloud (Supabase) brand-kit singleton. This is the gate for the next extension release.

**Principles**
- **Local-first, always.** Kits live in a local file the user owns; nothing in the cloud, no account needed.
- **One model everywhere.** Extension + IDE identical (the mirror rule); the hub aligns to the same model. No parallel systems.
- **The active kit drives everything.** Switch brand → design *and* her posts come out on that brand.

---

## 1. The unified kit model

One `BrandKit` shape, replacing both the design-only System A and the Supabase System B:

```ts
interface BrandKit {
  id: string;
  name: string;                 // "Acme", "Client X", "Personal"

  // Identity
  tagline?: string;
  positioning?: string;         // one line: what it is + who it's for

  // Look (drives icons / images / graphics)
  palette: {                    // named roles (canonical — keep System A's shape)
    primary: string; secondary: string; accent: string;
    neutral: string; surface: string;
  };
  styleTags: string[];          // "minimal", "premium", "hand-drawn"
  logo?: { primary?: string; mark?: string; light?: string; dark?: string }; // local paths / data URIs

  // Voice (drives posts / copy)
  voice?: string;               // tone — how this brand writes
  doRules?: string[];           // "always first person"
  dontRules?: string[];         // "never 'excited to announce'"
  defaultHashtags?: string[];
  defaultLink?: string;

  // Audio (optional — only if they use voice/music)
  defaultVoiceId?: string;
  musicPrompt?: string;

  createdAt: number;
  updatedAt: number;
}
```

Notes:
- Palette stays **named roles** (design-cleaner than System B's hex array; derive an array when a caller needs one).
- Everything past `palette`/`styleTags` is the **voice** merge from System B — this is what makes a kit a *brand*, not just a swatch set.

---

## 2. Storage — one shared local file

- **`~/.ava/brand-kits.json`** — a single file: `{ kits: BrandKit[], activeId: string }`.
- Same home as memory (`~/.ava/memory/`) and the same spirit as the Decisions folder — the user owns it, it never leaves the machine.
- **Shared across surfaces on one machine:** extension, IDE, and the hub all read/write the *same* file. So switching the active brand in the IDE is reflected in the hub. (This is the same local-unification idea as the parked memory task — same `~/.ava/` home.)

**Access per surface:**
- **Extension / IDE** — the webview can't touch the filesystem, so the **host** (extension host / IDE sidecar) owns the file and the webview reads/writes via messages (same bridge pattern as memory/config). Replaces the current `localStorage` in `lib/asset-forge/brand-kit.ts`.
- **Hub (Tauri)** — reads/writes `~/.ava/brand-kits.json` directly via Rust FS.
- The load/list/active/upsert/setActive logic already exists (in `brand-kit.ts`); it moves from `localStorage` to this file behind the same function signatures, so callers barely change.

---

## 3. Core tool — `design_brand_kit` (packages/core/src/tools/design-studio-tools.ts)

Today: singleton `read`/`update`. New actions (all delegate to the surface via `sharedState.designControl`, unchanged pattern):
- `list` → all kits (id, name, active flag).
- `read` → the active kit (or a given `id`).
- `create` → new kit (name; seeded from default).
- `update` → set fields on a kit (by `id`, defaults to active) — now including the **voice** fields.
- `set_active` → switch the active kit.
- `rename`, `delete`.

So Ava can manage kits **in conversation**: "make a kit for Client X," "switch to my personal brand," "set the don't-rules for Acme." The persona (`getDesignStudioPrefix` + the social persona) gains a short note that the active kit's Look **and** Voice are in play.

---

## 4. Pass-in — the active kit reaches generation

- **Design (icons / images):** the surface reads the active kit → folds **palette + styleTags** (and, later, the logo as a reference) into the prompt. *(Today only the primary colour crosses; add the style tags + a proper palette.)*
- **Posts (Social Media Manager):** the hub reads the active local kit and **sends it in the `/api/companion/chat` request** (it already sends a brand kit in the body). The route injects the kit's **voice / do-don't / hashtags / name** into the persona — so the *local* kit's voice reaches the server-side Agent per-turn, no cloud store.

---

## 5. UI — extension + IDE (identical), hub aligned

- **Kit picker** — a dropdown (same feel as the model selector): list kits, switch active, **+ New kit**.
- **Kit editor** — edit: name, tagline, positioning, palette (editable colour swatches — the hub's ForgeStudio already has this to crib), style tags, **voice/tone, do/don't rules, hashtags, link**, logo upload. Rename / delete.
- Built once in `extension/dashboard-ui` DesignStudio and mirrored to `ide` DesignStudio (byte-parity on the shared lib). Hub `CreativeStudio` + `ForgeStudio` point at the same model + file.

---

## 6. Retire Supabase System B + migrate

- The hub's Posts-floor kit currently lives in Supabase (`brand_kit` table, one row/user, migration 155). **Retire it.**
- On first run after this ships, **import** the existing Supabase kit → the local file (map `voice_prompt`→`voice`, `do_rules`→`doRules`, etc.) so nothing is lost.
- `useBrandKit()` (Supabase read) → read the local active kit; `augmentVisualPrompt` + the posts request read from local. Then the table is dead code.

---

## 7. Build order (incremental, each step testable)

1. **Local store + unified model** — `~/.ava/brand-kits.json`, the host/Tauri file layer behind the existing `loadKits/activeKit/setActiveKit/upsertKit` signatures + the new `BrandKit` fields.
2. **Core tool** — `design_brand_kit` gains `list` / `create` / `set_active` / `rename` / `delete` + the voice fields; persona note.
3. **Extension UI** — kit picker + full editor (Look + Voice); wire to store + tool.
4. **IDE UI** — mirror exactly.
5. **Design pass-in** — palette + styleTags (+ logo) into icon/image prompts.
6. **Posts pass-in** — hub sends the active local kit in the request; persona reads voice/rules; drop the Supabase read.
7. **Migration** — import existing Supabase kit → local; retire the table.
8. **Test** each surface end-to-end → then cut the extension release.

---

## Open decisions (flag before/while building)
- **Active scope:** global (one active, switch freely) — locked. Per-project binding is a later add-on, not now.
- **Logo handling:** store as local file paths or embed as data URIs? (Data URIs are self-contained but bloat the file; paths are lean but can break if the user moves the image.) Decide at step 1.
- **Web/mobile:** these surfaces can't read the local file. Out of scope for this release (brand kits are an extension/IDE/hub feature); revisit if a cloud-optional mirror is ever wanted — but that's a *choice*, not a default.
