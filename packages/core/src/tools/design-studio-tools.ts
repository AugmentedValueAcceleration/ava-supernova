import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

/**
 * Design Studio tools — Ava the Design Architect's kit. Same shape-as-dial
 * pipeline the canvas already runs (Lucide armature → qwen-image-edit-max →
 * server matte), driven by Ava instead of a button click. Scope: icons.
 *
 * These tools are deliberately THIN. The actual work (searching shapes,
 * rendering the armature, calling the platform, saving the PNG, reading the
 * brand kit) lives in the Design Studio surface, which owns that code and the
 * open canvas. The tool hands a command to the surface via the host-injected
 * `designControl` callback on shared state and reports back what happened —
 * exactly the pattern health_plan_create uses with `generateHealthPlanDays`.
 *
 * `designControl(command, args)` resolves to { ok, data?, error? }. When it's
 * absent (e.g. the CLI, or the canvas isn't open) the tool says so plainly
 * rather than pretending it worked.
 */

type DesignControl = (
  command: string,
  args: Record<string, unknown>,
) => Promise<{ ok: boolean; data?: unknown; error?: string }>;

function getControl(context: ToolExecutionContext): DesignControl | undefined {
  return context.sharedState?.designControl as DesignControl | undefined;
}

const NO_CANVAS =
  'The Design Studio canvas isn\'t open here, so I can\'t drive it. This tool works inside the Design Studio in the app.';

// ── design_find_shape ────────────────────────────────────────────────────────
// Discovery step — pull the Lucide armature(s) that match a subject. The shape
// is the stick-man; Ava picks one, then generates onto it.
export class DesignFindShapeTool implements Tool {
  readonly name = 'design_find_shape';
  readonly description =
    'Find a known-good Lucide shape (the armature) that matches an icon subject. Always call this before generating — the shape hands the model correct geometry so the icon reads as the thing.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'design_find_shape',
    description:
      'Search the Lucide shape library for an icon armature matching a subject (e.g. "camera", "shopping cart"). ' +
      'Returns candidate shapes with their ids and labels. Use the id with design_generate_icon. ' +
      'Call this first — never generate from a blank prompt.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The subject to find a shape for — a plain noun works best ("bell", "camera", "lock").',
        },
      },
      required: ['query'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const control = getControl(context);
    if (!control) return { success: false, output: NO_CANVAS };
    const query = (args.query as string | undefined)?.trim();
    if (!query) return { success: false, output: 'Missing `query` — the icon subject to search for.' };
    try {
      const res = await control('find_shape', { query });
      if (!res.ok) return { success: false, output: res.error || `No shapes found for "${query}".` };
      const shapes = (res.data as { shapes?: { id: string; label: string }[] })?.shapes ?? [];
      if (shapes.length === 0) {
        return { success: true, output: `No clean Lucide shape matches "${query}". Tell the user, and offer the closest alternative subject.` };
      }
      const list = shapes.map((s) => `${s.label} (id: ${s.id})`).join(', ');
      return {
        success: true,
        output: `Shapes for "${query}": ${list}. Pick the id that best fits and pass it to design_generate_icon.`,
        metadata: { shapes },
      };
    } catch (err) {
      return { success: false, output: `Shape search failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}

// ── design_generate_icon ─────────────────────────────────────────────────────
// The core move: render the shape to a white-silhouette armature and let
// qwen-image-edit-max restyle it in the material + colour, then server-matte to
// a transparent icon. 20 credits — quote before firing (the persona does this).
export class DesignGenerateIconTool implements Tool {
  readonly name = 'design_generate_icon';
  readonly description =
    'Generate one on-brand icon from a shape armature: pick shape + material + colour, run shape-as-dial (Lucide → qwen-image-edit-max → matte). Costs 20 credits — confirm cost with the user first.';
  readonly riskLevel: ToolRiskLevel = 'write';
  // The persona quotes the cost and gets a yes in conversation, so no extra modal.
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'design_generate_icon',
    description:
      'Generate a single icon on the canvas. YOU write the look (art_direction); the shape becomes a reference the ' +
      'model paints onto, then the result is matted to a clean transparent PNG. The system locks the matte-critical ' +
      'rules (silhouette, white background, isolation, no text) — you own the finish, material, lighting and mood. ' +
      'Costs 20 credits — state that and get a yes before calling.',
    parameters: {
      type: 'object',
      properties: {
        shape: {
          type: 'string',
          description: 'The Lucide shape id from design_find_shape (e.g. "Camera"). A plain subject also works — the canvas resolves the closest shape.',
        },
        art_direction: {
          type: 'string',
          description:
            'YOU author this — the creative heart. Describe the LOOK the way a designer briefs an illustrator: material, ' +
            'finish, surface detail, lighting, mood, depth. Write from what you gauged the user wants, e.g. "brushed ' +
            'stainless steel with a soft top-down key light and a faint cool rim, premium and industrial, subtle bevel". ' +
            'Only describe surface/finish/lighting — the shape itself is fixed by the armature. Prefer this over `material`; ' +
            'the system wraps it in the locked isolation rules so you can\'t break the matte.',
        },
        material: {
          type: 'string',
          enum: ['glass', 'clay', 'glossy', 'metal', 'neon3d'],
          description: 'Optional preset shortcut when you don\'t need custom art_direction. glass/metal = premium; clay/glossy = friendly 3D; neon3d = glowing. Used only if art_direction is omitted. There is no flat — that belongs in the free Library.',
        },
        colour: {
          type: 'string',
          description: 'Primary colour as a hex (e.g. "#A855F7"). Omit to use the brand-kit colour already on the canvas.',
        },
        size: {
          type: 'number',
          enum: [1024, 512, 256, 128, 64, 32],
          description: 'Export size in px (generated at a 1024 master). Optional — defaults to the current canvas size.',
        },
      },
      required: ['shape'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const control = getControl(context);
    if (!control) return { success: false, output: NO_CANVAS };
    const shape = (args.shape as string | undefined)?.trim();
    if (!shape) return { success: false, output: 'Missing `shape` — the icon subject or Lucide id.' };
    try {
      const res = await control('generate_icon', {
        shape,
        art_direction: args.art_direction,
        material: args.material,
        colour: args.colour,
        size: args.size,
      });
      if (!res.ok) return { success: false, output: res.error || 'Generation failed.' };
      const d = res.data as { label?: string; material?: string; credits?: number } | undefined;
      const label = d?.label || shape;
      const credits = d?.credits ?? 20;
      return {
        success: true,
        output: `Generated a ${d?.material || ''} "${label}" icon — it's on the canvas, matted clean. ${credits} credits. Ask if they want it saved or tweaked.`.replace(/\s+/g, ' ').trim(),
        metadata: d,
      };
    } catch (err) {
      return { success: false, output: `Generation failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}

// ── design_generate_set ──────────────────────────────────────────────────────
// A matched family — same material/colour/lighting held constant, only the
// subject varies. N × 20 credits; the persona quotes the total first.
export class DesignGenerateSetTool implements Tool {
  readonly name = 'design_generate_set';
  readonly description =
    'Generate a matched set of icons — same material, colour and lighting held constant so they sit together as a family. N × 20 credits; quote the total and get a yes first.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'design_generate_set',
    description:
      'Generate a consistent icon set (2–12). Hold material + colour constant across all so they read as a family — ' +
      'only the subject varies. Costs 20 credits PER icon — say the total ("six icons, 120 credits") and get a yes ' +
      'before calling. Each icon lands on the canvas in turn.',
    parameters: {
      type: 'object',
      properties: {
        shapes: {
          type: 'array',
          description: 'The subjects/Lucide ids for the set, in order (e.g. ["Home","Search","Bell","User"]).',
          items: { type: 'string' },
        },
        art_direction: {
          type: 'string',
          description:
            'YOU author this — ONE look description applied to every icon so the set reads as a family (material, finish, ' +
            'lighting, mood held constant; only the subject varies). e.g. "soft matte clay, gentle top light, friendly and ' +
            'rounded". Prefer this over `material`. The system locks the isolation rules per icon.',
        },
        material: {
          type: 'string',
          enum: ['glass', 'clay', 'glossy', 'metal', 'neon3d'],
          description: 'Optional preset shortcut for the whole set when you don\'t need custom art_direction (never plain flat). Used only if art_direction is omitted.',
        },
        colour: {
          type: 'string',
          description: 'One primary hex colour for the whole set. Omit to use the brand-kit colour.',
        },
      },
      required: ['shapes'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const control = getControl(context);
    if (!control) return { success: false, output: NO_CANVAS };
    const shapes = Array.isArray(args.shapes) ? (args.shapes as unknown[]).map(String).map((s) => s.trim()).filter(Boolean) : [];
    if (shapes.length === 0) return { success: false, output: 'Missing `shapes` — the list of subjects for the set.' };
    if (shapes.length > 12) return { success: false, output: 'A set is capped at 12 icons. Split larger runs into batches so the cost stays legible.' };
    try {
      const res = await control('generate_set', { shapes, art_direction: args.art_direction, material: args.material, colour: args.colour });
      if (!res.ok) return { success: false, output: res.error || 'Set generation failed.' };
      const d = res.data as { made?: number; failed?: string[]; credits?: number } | undefined;
      const made = d?.made ?? 0;
      const credits = d?.credits ?? made * 20;
      const parts = [`Made ${made} of ${shapes.length} icons as a matched set — ${credits} credits.`];
      if (d?.failed?.length) parts.push(`Couldn't place: ${d.failed.join(', ')}.`);
      parts.push('They\'re on the canvas; ask if they want the set saved.');
      return { success: true, output: parts.join(' '), metadata: d };
    } catch (err) {
      return { success: false, output: `Set generation failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}

// ── design_brand_kit ─────────────────────────────────────────────────────────
// Read (default) or update the persistent brand kit every tool composes from.
export class DesignBrandKitTool implements Tool {
  readonly name = 'design_brand_kit';
  readonly description =
    'Manage the user\'s brand kits — multiple named identities, one active. Each kit carries Look (palette + style) AND Voice (tone, do/don\'t, hashtags). List, read, create, switch the active kit, update, rename, or delete. The active kit is what design AND posts come out on.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'design_brand_kit',
    description:
      'The user\'s brand kits — MULTIPLE named identities (e.g. one per business), ONE active. The active kit ' +
      'is what design and posts come out on, so read it before generating. Each kit holds Look (palette + style ' +
      'words + logo) and Voice (tone, do/don\'t rules, default hashtags/link). Actions: "list" all kits; "read" ' +
      'a kit (the active one, or a given kit_id); "create" a new kit; "set_active" to switch which kit is in use; ' +
      '"update" a kit\'s fields; "rename"; "delete". A standing brand colour belongs in a kit; a one-off colour ' +
      'goes on design_generate_icon instead.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'read', 'create', 'update', 'set_active', 'rename', 'delete', 'set_logo'],
          description: 'list all kits · read one · create a new kit · update fields · set_active (switch) · rename · delete · set_logo (assign the asset currently on the canvas as this kit\'s logo).',
        },
        kit_id: { type: 'string', description: 'Target kit id (from "list"). Omit for read/update/set_logo to mean the ACTIVE kit. Required for set_active / delete / a specific rename.' },
        slot: { type: 'string', enum: ['primary', 'mark', 'light', 'dark'], description: 'For set_logo — which logo slot to assign the current canvas asset to. Defaults to "primary".' },
        name: { type: 'string', description: 'The kit/brand name — for create, rename, or update.' },
        // ── Look ──
        palette: {
          type: 'object',
          description: 'For update — any of the five roles as hex. Only pass the ones changing.',
          properties: {
            primary: { type: 'string' }, secondary: { type: 'string' }, accent: { type: 'string' },
            neutral: { type: 'string' }, surface: { type: 'string' },
          },
        },
        styleTags: { type: 'array', items: { type: 'string' }, description: 'For update — direction words ("calm", "premium", "playful").' },
        // ── Identity ──
        tagline: { type: 'string', description: 'For update — the brand tagline / one-liner.' },
        positioning: { type: 'string', description: 'For update — one line: what the brand is + who it\'s for.' },
        // ── Voice ──
        voice: { type: 'string', description: 'For update — the brand\'s voice/tone (how it writes). Flows into posts.' },
        doRules: { type: 'array', items: { type: 'string' }, description: 'For update — voice red lines to always follow.' },
        dontRules: { type: 'array', items: { type: 'string' }, description: 'For update — voice red lines to never break.' },
        defaultHashtags: { type: 'array', items: { type: 'string' }, description: 'For update — default post hashtags (no leading #).' },
        defaultLink: { type: 'string', description: 'For update — the brand\'s default link/URL.' },
      },
      required: ['action'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const control = getControl(context);
    if (!control) return { success: false, output: NO_CANVAS };

    const allowed = ['list', 'read', 'create', 'update', 'set_active', 'rename', 'delete', 'set_logo'];
    const action = allowed.includes(args.action as string) ? (args.action as string) : 'read';

    try {
      const res = await control('brand_kit', {
        action,
        kit_id: args.kit_id,
        slot: args.slot,
        name: args.name,
        palette: args.palette,
        styleTags: args.styleTags,
        tagline: args.tagline,
        positioning: args.positioning,
        voice: args.voice,
        doRules: args.doRules,
        dontRules: args.dontRules,
        defaultHashtags: args.defaultHashtags,
        defaultLink: args.defaultLink,
      });
      if (!res.ok) return { success: false, output: res.error || 'Brand kit unavailable.' };

      // list → a roster of kits with the active one flagged.
      if (action === 'list') {
        const kits = (res.data as { kits?: Array<{ id: string; name: string; active?: boolean }> })?.kits ?? [];
        if (!kits.length) return { success: true, output: 'No brand kits yet — create one with action="create".', metadata: res.data as Record<string, unknown> | undefined };
        const roster = kits.map(k => `${k.name}${k.active ? ' (active)' : ''}`).join(', ');
        return { success: true, output: `Brand kits: ${roster}.`, metadata: res.data as Record<string, unknown> | undefined };
      }

      // Everything else returns the affected kit.
      const kit = res.data as {
        name?: string; palette?: Record<string, string>; styleTags?: string[];
        voice?: string; tagline?: string;
      } | undefined;
      const pal = kit?.palette ? Object.entries(kit.palette).map(([k, v]) => `${k} ${String(v).toUpperCase()}`).join(', ') : '';
      const tags = kit?.styleTags?.length ? ` · style: ${kit.styleTags.join(', ')}` : '';
      const voice = kit?.voice ? ` · voice set` : '';
      const verb =
        action === 'create' ? 'Created' :
        action === 'set_active' ? 'Now active' :
        action === 'rename' ? 'Renamed' :
        action === 'delete' ? 'Deleted' :
        action === 'set_logo' ? 'Logo set' :
        action === 'update' ? 'Updated' : 'Brand kit';
      const body = action === 'delete'
        ? `Deleted "${kit?.name || 'kit'}".`
        : `"${kit?.name || 'brand'}"${pal ? ': ' + pal : ''}${tags}${voice}.`;
      return {
        success: true,
        output: `${verb} — ${body}${action === 'set_active' ? ' Design and posts now come out on this brand.' : ''}`,
        metadata: kit as Record<string, unknown> | undefined,
      };
    } catch (err) {
      return { success: false, output: `Brand kit failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}

// ── design_save ──────────────────────────────────────────────────────────────
// Save the icon currently on the canvas to the local creative library.
export class DesignSaveTool implements Tool {
  readonly name = 'design_save';
  readonly description =
    'Save the icon currently on the canvas to the user\'s local creative library (transparent PNG). Local-first, on their machine.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'design_save',
    description:
      'Save the icon currently shown on the canvas to the local creative library as a transparent PNG. ' +
      'Call after the user is happy with a generated icon. There must be a generated icon on the canvas.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Optional filename/title (e.g. "camera-metal"). A sensible name is derived if omitted.' },
      },
      required: [],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const control = getControl(context);
    if (!control) return { success: false, output: NO_CANVAS };
    try {
      const res = await control('save', { title: args.title });
      if (!res.ok) return { success: false, output: res.error || 'Nothing on the canvas to save yet — generate an icon first.' };
      const d = res.data as { title?: string } | undefined;
      return { success: true, output: `Saved${d?.title ? ` "${d.title}"` : ''} to their creative library.`, metadata: d };
    } catch (err) {
      return { success: false, output: `Save failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}

// ── design_generate_video ────────────────────────────────────────────────────
// A short video via Wan (Alibaba). YOU author the prompt — the shot, subject,
// motion, mood, lighting — from what you gauged the user wants. It runs on the
// Open Canvas video player. Wan takes minutes and auto-dubs a soundtrack.
export class DesignGenerateVideoTool implements Tool {
  readonly name = 'design_generate_video';
  readonly description =
    'Generate a short video on the Open Canvas from an authored prompt (shot / subject / motion / mood) via Wan. YOU write the prompt from what you gauged the user wants. Uses credits — confirm cost first.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'design_generate_video',
    description:
      'Generate a short video clip on the canvas. YOU author the prompt: describe the shot, subject, camera motion, ' +
      'mood and lighting the way a director briefs a shot — drawn from what you gauged the user wants. Wan runs it ' +
      '(a few minutes; it auto-dubs a soundtrack). Clips are 5 or 10 seconds only. Uses credits (more than an icon) — ' +
      'state that and get a yes before calling.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'YOU author this — the creative heart. Describe the shot fully: subject, setting, camera move (dolly, pan, ' +
            'orbit, static), pace, mood, lighting, time of day, style. e.g. "slow dolly-in through a neon-lit rainy ' +
            'Tokyo alley at night, reflections on wet asphalt, cinematic, shallow depth of field, moody teal-and-magenta".',
        },
        duration: {
          type: 'string',
          enum: ['5', '10'],
          description: 'Clip length in seconds — Wan supports 5 or 10 only. Default 5.',
        },
        aspect: {
          type: 'string',
          enum: ['16:9', '9:16', '1:1'],
          description: 'Aspect ratio. 16:9 landscape, 9:16 vertical/social, 1:1 square. Default 16:9.',
        },
        resolution: {
          type: 'string',
          enum: ['720p', '1080p'],
          description: 'Output resolution. Default 1080p.',
        },
      },
      required: ['prompt'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const control = getControl(context);
    if (!control) return { success: false, output: NO_CANVAS };
    const prompt = (args.prompt as string | undefined)?.trim();
    if (!prompt) return { success: false, output: 'Missing `prompt` — the shot you want, authored by you.' };
    try {
      const res = await control('generate_video', {
        prompt,
        duration: args.duration,
        aspect: args.aspect,
        resolution: args.resolution,
      });
      if (!res.ok) return { success: false, output: res.error || 'Video generation failed.' };
      const d = res.data as { duration?: string; credits?: number } | undefined;
      const secs = d?.duration ? `${d.duration}s ` : '';
      const cr = d?.credits ? ` ${d.credits} credits.` : '';
      return {
        success: true,
        output: `Generated a ${secs}clip — it's playing on the canvas.${cr} Ask if they want it saved or a different take.`.replace(/\s+/g, ' ').trim(),
        metadata: d,
      };
    } catch (err) {
      return { success: false, output: `Video generation failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}

// ── design_generate_image ────────────────────────────────────────────────────
// A free-form image via the same qwen-image route the icons use, but full-frame
// (NO matte, no armature). YOU author the whole prompt — subject, style,
// composition, lighting, mood — from what you gauged the user wants. It renders
// to the Open Canvas Image stage. This is NOT the icon pipeline.
export class DesignGenerateImageTool implements Tool {
  readonly name = 'design_generate_image';
  readonly description =
    'Generate a free-form image on the Open Canvas from an authored prompt (subject / style / composition / lighting / mood). YOU write the full prompt from what you gauged the user wants. This is NOT an icon — no armature, no matte. Uses credits — confirm cost first.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'design_generate_image',
    description:
      'Generate a single free-form image on the canvas (a hero shot, illustration, background, scene) — NOT an icon. ' +
      'YOU author the full prompt: describe the subject, style, composition, lighting and mood the way a designer briefs ' +
      'an image, drawn from what you gauged the user wants. It renders full-frame with no matte and no shape armature. ' +
      'Uses credits (~12) — state that and get a yes before calling.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'YOU author this — the creative heart. Describe the image fully: subject, style, composition, lighting, ' +
            'mood. e.g. "a sleek matte-black product on a soft purple gradient studio backdrop, cinematic side lighting, ' +
            'shallow depth of field, premium and minimal".',
        },
        size: {
          type: 'string',
          enum: ['1024*1024', '1280*720', '720*1280'],
          description: 'Output dimensions. 1024*1024 square, 1280*720 landscape (16:9), 720*1280 portrait (9:16). Default 1024*1024.',
        },
      },
      required: ['prompt'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const control = getControl(context);
    if (!control) return { success: false, output: NO_CANVAS };
    const prompt = (args.prompt as string | undefined)?.trim();
    if (!prompt) return { success: false, output: 'Missing `prompt` — the image you want, authored by you.' };
    try {
      const res = await control('generate_image', {
        prompt,
        size: args.size,
      });
      if (!res.ok) return { success: false, output: res.error || 'Image generation failed.' };
      const d = res.data as { credits?: number } | undefined;
      const credits = d?.credits ? ` ${d.credits} credits.` : '';
      return {
        success: true,
        output: `Generated the image — it's on the canvas.${credits} Ask if they want it saved or a different take.`.replace(/\s+/g, ' ').trim(),
        metadata: d,
      };
    } catch (err) {
      return { success: false, output: `Image generation failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}

// ── design_generate_logo ─────────────────────────────────────────────────────
// A full logo SYSTEM: a generative symbol (traced to clean vector) paired with a
// real-font wordmark, composed into the pro variant set. Brand name, palette and
// feel come from the ACTIVE brand kit; Ava authors the symbol concept + font.
export class DesignGenerateLogoTool implements Tool {
  readonly name = 'design_generate_logo';
  readonly description =
    'Design a full LOGO SYSTEM for the active brand — a generative symbol traced to clean vector + a real-font wordmark, composed into lockups, symbol-only, wordmark-only, mono (light/dark) and favicon. Name/palette/feel come from the active brand kit; YOU author the symbol concept and pick a font. Uses credits — confirm first. After it renders, offer to set it as the brand logo (design_brand_kit set_logo).';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'design_generate_logo',
    description:
      'Design a complete logo system for the active brand kit. A generative brand SYMBOL (no text) is traced to a crisp SVG, and the brand NAME is typeset in a real bundled font (never generated pixels), then composed into the full variant set. ' +
      'YOU author the symbol `direction` (the concept the mark evokes) and choose a `font` by brand feel. Name, palette and style come from the active kit unless overridden. Uses credits — state it and get a yes. After it renders, offer to make it the brand logo.',
    parameters: {
      type: 'object',
      properties: {
        mark_type: {
          type: 'string',
          enum: ['letter', 'symbol'],
          description: 'How the mark is made. "letter" = a LETTERMARK built from the brand\'s initial in its font — clean, distinctively theirs, no credits (the strong default for most brands). "symbol" = a pictorial mark generated from a shape (uses credits). Prefer letter unless a pictorial symbol genuinely serves the brand better.',
        },
        container: {
          type: 'string',
          enum: ['none', 'ring'],
          description: 'For a lettermark only: "none" (the letter alone) or "ring" (the letter set inside an emblem ring).',
        },
        mark: {
          type: 'string',
          description:
            'For a SYMBOL mark only — its SHAPE: a Lucide id from design_find_shape, or a subject ("star", "arc", "hexagon", "leaf"). Anchors the geometry (refined into a flat logomark). Call design_find_shape first and pick laterally, not the literal one.',
        },
        direction: {
          type: 'string',
          description:
            'YOU author this — the SYMBOL concept / rationale a designer would brief: what the mark evokes and why. e.g. "a rising arc suggesting momentum", "two leaves forming a heart". Keep it a single simple idea — great marks are minimal.',
        },
        style: {
          type: 'string',
          enum: ['solid', 'monoline', 'geometric'],
          description: 'The mark\'s flat finish: solid (filled shapes), monoline (an even outline stroke), geometric (precise circles/arcs/angles). Omit to use the panel default.',
        },
        font: {
          type: 'string',
          description:
            'Wordmark font, chosen by brand feel. One of: Montserrat, Sora, Inter, Space Grotesk, Archivo, Work Sans, DM Sans, Fraunces, Playfair Display, Zilla Slab, Bitter, Bricolage Grotesque. Omit to auto-pick from the brand style words.',
        },
        brand_name: { type: 'string', description: "The name to typeset. Omit to use the active brand kit's name." },
      },
      required: ['direction'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const control = getControl(context);
    if (!control) return { success: false, output: NO_CANVAS };
    const direction = (args.direction as string | undefined)?.trim();
    if (!direction) return { success: false, output: 'Missing `direction` — the symbol concept, authored by you.' };
    try {
      const res = await control('generate_logo', { direction, mark_type: args.mark_type, container: args.container, mark: args.mark, style: args.style, font: args.font, brand_name: args.brand_name });
      if (!res.ok) return { success: false, output: res.error || 'Logo generation failed.' };
      const d = res.data as { brandName?: string; font?: string; variants?: number } | undefined;
      return {
        success: true,
        output: `Designed the logo for "${d?.brandName ?? 'the brand'}" — ${d?.variants ?? 'several'} variants (lockups, symbol, wordmark, mono, favicon) set in ${d?.font ?? 'a real font'}. Offer to set it as the brand logo, or try a different mark.`.replace(/\s+/g, ' ').trim(),
        metadata: d as Record<string, unknown> | undefined,
      };
    } catch (err) {
      return { success: false, output: `Logo generation failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}

// ── design_generate_voice ────────────────────────────────────────────────────
// A voiceover via Qwen3-TTS. YOU author BOTH the script (the exact words) and
// the delivery `instructions` (tone / pace / emotion) from what you gauged. Pick
// a voice from the curated roster. To voice a translated read, translate the
// script yourself and set `language` — the same voice speaks it. Renders
// synchronously to the Open Canvas as a scrubable waveform.
export class DesignGenerateVoiceTool implements Tool {
  readonly name = 'design_generate_voice';
  readonly description =
    'Generate a voiceover on the Open Canvas via Qwen3-TTS. YOU author the script (the exact words) AND the delivery (tone / pace / emotion) from what you gauged. Pick a voice from the roster; translate the script yourself and set the language to voice it in another language in the SAME voice. Uses credits — confirm cost first.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'design_generate_voice',
    description:
      'Generate a spoken voiceover on the canvas. YOU author the script (the exact words to speak, verbatim) AND the ' +
      'delivery instructions (tone, pace, emotion) — drawn from what you gauged the user wants. Pick a voice from the ' +
      'roster. To voice a TRANSLATED read, translate the script YOURSELF into the target language and set `language` — ' +
      'the same voice speaks it. There is no numeric speed/pitch; you shape the read in words. It renders ' +
      'synchronously and appears as a scrubable waveform. Uses credits — state that and get a yes before calling. ' +
      '',
    parameters: {
      type: 'object',
      properties: {
        script: {
          type: 'string',
          description:
            'YOU author this — the exact words to be spoken, verbatim. Write the read the way a scriptwriter would: ' +
            'natural, paced for the ear, with punctuation that shapes the delivery.',
        },
        voice: {
          type: 'string',
          enum: ['Cherry', 'Serena', 'Vivian', 'Maia', 'Bellona', 'Ethan', 'Moon', 'Vincent', 'Neil', 'Kai'],
          description:
            'The voice from the curated roster (all work on qwen3-tts-instruct-flash). Cherry (F, sunny, friendly — ' +
            'DEFAULT), Serena (F, gentle, warm), Vivian (F, confident, feisty), Maia (F, intellect + gentleness), ' +
            'Bellona (F, powerful, heroic), Ethan (M, warm, energetic), Moon (M, bold, handsome), Vincent (M, raspy, ' +
            'cinematic), Neil (M, news-anchor precision), Kai (M, soothing). Default Cherry.',
        },
        language: {
          type: 'string',
          description:
            'The SPOKEN language (e.g. "English", "French", "Japanese"). Default "English". When the user wants a ' +
            'translated voiceover, translate the script YOURSELF into that language and set this — the SAME voice speaks it.',
        },
        instructions: {
          type: 'string',
          description:
            'YOU author this — the delivery direction: tone, pace, emotion, energy, e.g. "warm, unhurried, reassuring" ' +
            'or "bright and punchy, trailer energy". This is how you shape pace — there is no numeric speed knob.',
        },
      },
      required: ['script'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const control = getControl(context);
    if (!control) return { success: false, output: NO_CANVAS };
    const script = (args.script as string | undefined)?.trim();
    if (!script) return { success: false, output: 'Missing `script` — the words to speak, authored by you.' };
    try {
      const res = await control('generate_voice', {
        script,
        voice: args.voice,
        language: args.language,
        instructions: args.instructions,
      });
      if (!res.ok) return { success: false, output: res.error || 'Voice generation failed.' };
      const d = res.data as { voice?: string; credits?: number } | undefined;
      const credits = d?.credits ? ` ${d.credits} credits.` : '';
      return {
        success: true,
        output: `Voiced it — it's on the canvas.${credits} Ask if they want it saved or a different read.`.replace(/\s+/g, ' ').trim(),
        metadata: d,
      };
    } catch (err) {
      return { success: false, output: `Voice generation failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}
