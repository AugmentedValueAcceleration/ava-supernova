import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { t, tt, useLocale } from '../i18n';
import { HEALTH_PROFILE_FIELDS, optionLabel } from '../../../../core/dist/health/profile-fields.js';
import { DateField } from './DateField';
import { ExerciseDetailBody, RecipeDetailBody } from '../pages/Health';

/**
 * The new-plan wizard (Health & Nutrition, 11 Nov 2026 — his design, approved
 * from the mockup: "thats bloody perfect").
 *
 * THIS FILE IS IDENTICAL in the extension (dashboard-ui/src/components) and
 * the IDE (src/components) apart from the import lines at the top, like
 * BrandKitsPage. It styles itself (the <style> block below) because the
 * extension uses Tailwind and the IDE does not; both define the same CSS
 * variables (--accent, --border, --text-*, --bg-input). What genuinely
 * differs between the apps comes in through props. Change one, copy it to
 * the other.
 *
 * ONE wizard for every new plan, a full page:
 *   1 What        Fitness = exercises only · Meal = recipes only · Combined = both;
 *                 and how to start: build it myself · ask Ava · a ready-made plan.
 *                 Ask Ava hands over to the health chat straight away: she asks
 *                 for anything missing herself.
 *   2 Your rules  Never (allergies, diet, injuries, kit) vs Prefer (likes,
 *                 dislikes, cuisines) — only what the type needs, edited in
 *                 place and saved to the profile both apps share. An empty
 *                 profile needs an "I understand" to move on; a disclaimer
 *                 says the plan is theirs.
 *   3 How long    1, 3 or 7 days, and a start date (Ava's own date picker).
 *   4 Build       fills the window; the library down the side (pictures, a
 *                 preview, meal-by-meal for recipes), every item checked
 *                 against their hard rules by the host (core health/safety;
 *                 only slugs leave the machine). Breach = refused with the
 *                 reason; caution = marked with the easier version; no answer
 *                 yet = not added. One breakfast, lunch and dinner a day,
 *                 filled in that order, then the next day. A dish that is not
 *                 for that meal asks first.
 *   5 Check       summary, what is worth knowing, then start or save a draft.
 */

// ── Shapes (structural, so each app passes its own types) ────────────────────

type PlanType = 'fitness' | 'meal' | 'combined';
type Slot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export interface WizardExercise {
  id: string; ref?: { kind: 'exercise'; slug: string } | null; name: string;
  sets: number | null; reps: string | null; weight: string | null; rest_seconds: number | null; tempo: string | null; notes: string | null;
}
export interface WizardMeal {
  id: string; slot: Slot; ref?: { kind: 'recipe'; slug: string } | null; name: string; servings: number | null;
  calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null; cook_time_minutes: number | null; notes: string | null;
}
export interface WizardDay {
  day_index: number; kind: 'training' | 'rest' | 'active_recovery'; title: string | null;
  training: WizardExercise[]; meals: WizardMeal[]; notes: string | null;
}
export interface WizardProfile {
  constraints: { allergens: string[]; dietary: string[]; injuries: string[]; equipment_available: string[] };
  food?: { likes: string[]; dislikes: string[]; cuisines: string[] } | null;
  goals?: { primary: string | null } | null;
  training?: { experience: string | null; days_per_week: number | null } | null;
  kitchen?: { level: string | null } | null;
  updated_at?: string | null;
}
export interface SafetyVerdict {
  slug: string; verdict: 'ok' | 'warn' | 'blocked'; reasons: string[]; unverified: string[];
  alternatives?: Array<{ slug: string; name: string }>;
}
export interface PlanWizardSafety {
  results: Record<string, SafetyVerdict>;
  checked: boolean;
  rules: boolean;
  onCheck: (recipes: string[], exercises: string[]) => void;
}
type ExerciseRow = { slug: string; name: string; workout_type?: string | null; thumbnail_url?: string | null };
type RecipeRow = { slug: string; name: string; course?: string | null; cuisine_name?: string | null; hero_image_url?: string | null };
type RecipeDetailLike = { course?: string | null; versions: Array<{ level: string; nutrition?: { calories?: number } | null }> };
type PlanSearch = (o: { q: string; offset: number; category: string | null }) => void;

export interface PlanWizardProps<P extends WizardProfile = WizardProfile> {
  healthProfile: P | null;
  onSaveProfile?: (p: P) => void;
  onCancel: () => void;
  /** The finished plan (a full HealthPlan, structurally). */
  onCreate: (plan: never) => void;
  onAskAva?: (type: PlanType) => void;
  /** Open the Health & Fitness Safety page (each app opens links its own way). */
  onOpenSafety: () => void;
  exerciseResults: ExerciseRow[];
  recipeResults: RecipeRow[];
  catalogSearching: boolean;
  onSearchExercises: PlanSearch;
  onSearchRecipes: PlanSearch;
  recipeDetails: Record<string, RecipeDetailLike>;
  onLoadRecipeDetail: (slug: string) => void;
  exerciseDetails: Record<string, unknown>;
  onLoadExerciseDetail: (slug: string) => void;
  safety?: PlanWizardSafety;
  curated?: {
    plans: Array<{ id: string; title: string; level?: string | null; duration_days?: number | null }>;
    loading: boolean;
    detail: { id: string; days?: WizardDay[] } | null;
    detailLoading: boolean;
    onLoad: () => void;
    onLoadDetail: (id: string) => void;
  };
}

type Start = 'self' | 'ava' | 'ready';
type LibTab = 'exercises' | 'recipes' | 'readymade';

const ACCENT: Record<PlanType, string> = { fitness: 'var(--accent)', meal: '#f0a24b', combined: '#34d399' };
const SLOTS: Slot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
/** Courses that fit each meal without asking. Anything else asks first. */
const SLOT_COURSES: Record<Slot, string[]> = {
  breakfast: ['breakfast'],
  lunch: ['main', 'starter', 'side'],
  dinner: ['main', 'starter', 'side', 'dessert'],
  snack: ['snack', 'dessert', 'beverage', 'bread'],
};
/** The order meals fill in by themselves. Snacks are optional, so not here. */
const CORE_SLOTS: Slot[] = ['breakfast', 'lunch', 'dinner'];
/** The recipe library's course for each meal: lunch and dinner are mains. */
const COURSE_FOR: Record<Slot, string> = { breakfast: 'breakfast', lunch: 'main', dinner: 'main', snack: 'snack' };
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const newId = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return d; };
const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

function emptyProfile(): WizardProfile {
  return { constraints: { allergens: [], dietary: [], injuries: [], equipment_available: [] }, food: { likes: [], dislikes: [], cuisines: [] }, goals: { primary: null } };
}

// ── Styles: the wizard's own, so it looks the same in both apps ──────────────

const CSS = `
.pw-root{position:fixed;inset:0;z-index:50;display:flex;flex-direction:column;background:#0b0912;color:var(--text-primary);font-size:14px;line-height:1.4}
.pw-root *{box-sizing:border-box}
.pw-root button{font-family:inherit}
.pw-root button:focus-visible,.pw-root input:focus-visible,.pw-root select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.pw-header{display:flex;flex-wrap:wrap;align-items:center;gap:16px;border-bottom:1px solid var(--border);background:#110e1a;padding:20px 32px}
.pw-footer{display:flex;justify-content:space-between;gap:12px;border-top:1px solid var(--border);background:#110e1a;padding:16px 32px}
.pw-h1{margin:0;font-size:20px;font-weight:600}
.pw-h2{margin:0 0 6px;font-size:24px;font-weight:600}
.pw-h3{margin:0 0 10px;font-size:14px;font-weight:600;color:var(--text-secondary)}
.pw-muted{color:var(--text-muted)}
.pw-sec{color:var(--text-secondary)}
.pw-lead{margin:0;font-size:14px;color:var(--text-muted)}
.pw-label{font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:var(--text-muted)}
.pw-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.pw-trunc{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pw-main{flex:1;min-height:0;overflow-y:auto}
.pw-main.fill{overflow:hidden}
.pw-wrap{margin:0 auto;width:100%;max-width:1400px;padding:28px 32px}
.pw-wrap.fill{display:flex;flex-direction:column;height:100%}
.pw-col{display:flex;flex-direction:column}
.pw-row{display:flex;flex-wrap:wrap;align-items:center}
.pw-grid{display:grid}
.pw-pill{min-height:36px;border-radius:999px;border:1px solid var(--border);padding:0 14px;font-size:13px;cursor:pointer;background:transparent;color:var(--text-muted);transition:color .15s,border-color .15s}
.pw-pill:hover{color:var(--text-primary)}
.pw-pill.on{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 15%,transparent);color:var(--text-primary)}
.pw-pill.meal{min-height:32px;padding:0 12px;font-size:12px}
.pw-pill.meal.on{border-color:#f0a24b;background:rgba(240,162,75,.15)}
.pw-pill:disabled{opacity:.4;cursor:not-allowed}
.pw-card{border-radius:14px;border:1px solid var(--border);background:#14111d;text-align:left;cursor:pointer;color:var(--text-primary);transition:border-color .15s}
.pw-card:hover{border-color:color-mix(in srgb,var(--accent) 50%,transparent)}
.pw-card.on{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 10%,transparent);box-shadow:0 0 0 3px rgba(168,85,247,.18)}
.pw-panel{border-radius:14px;border:1px solid var(--border);background:#14111d}
.pw-btn{min-height:44px;cursor:pointer;border-radius:10px;border:1px solid var(--border);background:transparent;padding:0 16px;font-size:14px;color:var(--text-primary)}
.pw-btn.quiet{min-height:40px;font-size:13px;color:var(--text-muted)}
.pw-btn.quiet:hover{color:var(--text-primary)}
.pw-primary{min-height:44px;cursor:pointer;border-radius:10px;border:none;background:var(--accent);padding:0 20px;font-size:14px;font-weight:600;color:#fff}
.pw-primary:disabled{opacity:.4;cursor:not-allowed}
.pw-add{height:36px;cursor:pointer;border-radius:8px;border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);background:color-mix(in srgb,var(--accent) 15%,transparent);padding:0 12px;font-size:13px;color:var(--text-primary);flex:none}
.pw-add:hover{background:color-mix(in srgb,var(--accent) 25%,transparent)}
.pw-add.sm{height:32px;font-size:12px;padding:0 10px}
.pw-chip{display:inline-flex;align-items:center;gap:6px;border-radius:999px;border:1px solid var(--border);background:var(--bg-input);padding:6px 12px;font-size:13px}
.pw-chip.hard{border-color:#4a3a60;background:#231b30}
.pw-x{cursor:pointer;border:none;background:transparent;padding:0;color:var(--text-muted);font-size:14px;line-height:1}
.pw-x:hover{color:var(--text-primary)}
.pw-dashed{cursor:pointer;border-radius:999px;border:1px dashed var(--border);background:transparent;padding:6px 12px;font-size:13px;color:var(--text-muted)}
.pw-dashed:hover{color:var(--text-primary)}
.pw-input{min-height:44px;border-radius:10px;border:1px solid var(--border);background:#0f0c17;padding:0 12px;font-size:14px;color:var(--text-primary);outline:none}
.pw-input.sm{min-height:36px;font-size:13px}
.pw-input:focus{border-color:color-mix(in srgb,var(--accent) 60%,transparent)}
.pw-warnbox{border-radius:12px;border:1px solid rgba(245,158,11,.4);background:rgba(245,158,11,.1);color:#fde68a;padding:12px 16px;font-size:13px}
.pw-errbox{border-radius:12px;border:1px solid #7f1d2d;background:#2a1219;color:#fecdd3;padding:12px 16px;font-size:13px}
.pw-tag-never{border-radius:999px;background:#3b1620;color:#fca5a5;padding:2px 10px;font-size:12px}
.pw-tag-prefer{border-radius:999px;background:var(--border);color:var(--text-secondary);padding:2px 10px;font-size:12px}
.pw-link{cursor:pointer;border:none;background:transparent;padding:0;color:var(--accent);text-decoration:underline dotted;text-underline-offset:2px;font-size:inherit}
.pw-lib{display:flex;min-height:0;width:360px;flex:none;flex-direction:column;gap:12px;padding:14px}
.pw-scroll{display:flex;min-height:0;flex:1;flex-direction:column;gap:8px;overflow-y:auto;padding-right:4px}
.pw-librow{display:flex;align-items:center;gap:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg-input);padding:8px}
.pw-rowbtn{display:flex;min-width:0;flex:1;cursor:pointer;align-items:center;gap:10px;border:none;background:transparent;padding:0;text-align:left;color:var(--text-primary)}
.pw-thumb{width:48px;height:48px;flex:none;border-radius:8px;border:1px solid var(--border);object-fit:cover;background:#1b1726}
.pw-days{display:grid;min-height:0;min-width:0;flex:1;grid-auto-rows:max-content;align-content:start;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px;overflow-y:auto;padding-right:4px}
.pw-day{display:flex;min-height:220px;flex-direction:column;gap:12px;border-radius:12px;border:1px solid var(--border);background:#14111d;padding:12px}
.pw-day.on{border-color:var(--accent)}
.pw-item{display:flex;align-items:flex-start;gap:6px;border-radius:8px;border:1px solid var(--border);background:var(--bg-input);padding:8px}
.pw-item.warn{border-color:rgba(245,158,11,.4)}
.pw-slot{cursor:pointer;border-radius:8px;border:1px dashed var(--border);background:transparent;padding:6px 8px;text-align:left;font-size:12px;color:var(--text-muted)}
.pw-slot:hover{color:var(--text-primary)}
.pw-slot.on{border-color:#f0a24b;background:rgba(240,162,75,.1);color:var(--text-primary)}
.pw-overlay{position:absolute;inset:0;z-index:10;display:flex;justify-content:flex-end;background:rgba(0,0,0,.5)}
.pw-drawer{display:flex;height:100%;width:min(680px,92vw);flex-direction:column;border-left:1px solid color-mix(in srgb,var(--accent) 25%,transparent);background:linear-gradient(#100d1a,#150f22);box-shadow:-24px 0 60px rgba(0,0,0,.5)}
.pw-modalback{position:absolute;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6);padding:24px}
.pw-modal{display:flex;width:100%;max-width:440px;flex-direction:column;gap:16px;border-radius:16px;border:1px solid var(--border);background:#14111d;padding:24px;box-shadow:0 24px 60px rgba(0,0,0,.5)}
.pw-warn{color:#fcd34d}
.pw-bad{color:#fca5a5}
@media (max-width:760px){.pw-buildrow{flex-direction:column}.pw-lib{width:100%;max-height:45vh}.pw-header,.pw-footer{padding-left:16px;padding-right:16px}.pw-wrap{padding:20px 16px}}
`;

/** Shared with PlanReview, so Ava's plan looks like one built here. */
export const PLAN_WIZARD_CSS = CSS;

// ── Rules (step 2) ───────────────────────────────────────────────────────────

type RuleKey = 'allergens' | 'dietary' | 'injuries' | 'equipment' | 'likes' | 'dislikes' | 'cuisines';
const RULE_PATH: Record<RuleKey, (p: WizardProfile) => string[]> = {
  allergens: (p) => p.constraints.allergens,
  dietary: (p) => p.constraints.dietary,
  injuries: (p) => p.constraints.injuries,
  equipment: (p) => p.constraints.equipment_available,
  likes: (p) => p.food?.likes ?? [],
  dislikes: (p) => p.food?.dislikes ?? [],
  cuisines: (p) => p.food?.cuisines ?? [],
};
function setRule<P extends WizardProfile>(p: P, key: RuleKey, list: string[]): P {
  const next = JSON.parse(JSON.stringify(p)) as P;
  next.food = next.food ?? { likes: [], dislikes: [], cuisines: [] };
  if (key === 'allergens') next.constraints.allergens = list;
  else if (key === 'dietary') next.constraints.dietary = list;
  else if (key === 'injuries') next.constraints.injuries = list;
  else if (key === 'equipment') next.constraints.equipment_available = list;
  else if (key === 'likes') next.food.likes = list;
  else if (key === 'dislikes') next.food.dislikes = list;
  else next.food.cuisines = list;
  next.updated_at = new Date().toISOString();
  return next;
}
const optionsFor = (key: RuleKey): Array<{ value: string; label: string }> | undefined => {
  const f = key === 'allergens' ? HEALTH_PROFILE_FIELDS.allergens : key === 'dietary' ? HEALTH_PROFILE_FIELDS.dietary
    : key === 'equipment' ? HEALTH_PROFILE_FIELDS.equipment : key === 'cuisines' ? HEALTH_PROFILE_FIELDS.cuisines : undefined;
  return f?.options?.map((o) => ({ value: o.value, label: optionLabel(o, t) }));
};
const labelFor = (key: RuleKey, v: string) => optionsFor(key)?.find((o) => o.value === v)?.label ?? v.replace(/_/g, ' ');

function RuleRow<P extends WizardProfile>({ label, k, profile, onChange, hard }: {
  label: string; k: RuleKey; profile: P; onChange?: (p: P) => void; hard: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const list = RULE_PATH[k](profile);
  const opts = optionsFor(k)?.filter((o) => !list.includes(o.value));
  const add = (v: string) => { const val = v.trim(); if (!val || list.includes(val) || !onChange) return; onChange(setRule(profile, k, [...list, val])); setText(''); setAdding(false); };
  return (
    <div className="pw-col" style={{ gap: 8 }}>
      <span className="pw-label">{label}</span>
      <div className="pw-row" style={{ gap: 8 }}>
        {list.map((v) => (
          <span key={v} className={cx('pw-chip', hard && 'hard')}>
            {labelFor(k, v)}
            {onChange && (
              <button type="button" className="pw-x" aria-label={tt('health.wizard.remove', 'Remove {x}').replace('{x}', labelFor(k, v))}
                onClick={() => onChange(setRule(profile, k, list.filter((x) => x !== v)))}>×</button>
            )}
          </span>
        ))}
        {list.length === 0 && <span className="pw-muted" style={{ fontSize: 13 }}>{tt('health.wizard.none_yet', 'None yet')}</span>}
        {onChange && !adding && <button type="button" className="pw-dashed" onClick={() => setAdding(true)}>+ {tt('health.wizard.add', 'Add')}</button>}
        {onChange && adding && (opts ? (
          <select autoFocus aria-label={label} defaultValue="" onChange={(e) => add(e.target.value)} onBlur={() => setAdding(false)} className="pw-input sm">
            <option value="" disabled>{tt('health.wizard.choose', 'Choose…')}</option>
            {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); add(text); }} className="pw-row" style={{ gap: 8 }}>
            <label className="pw-sr" htmlFor={`rule-${k}`}>{label}</label>
            <input id={`rule-${k}`} autoFocus value={text} onChange={(e) => setText(e.target.value)} onBlur={() => { if (!text) setAdding(false); }} className="pw-input sm" />
            <button type="submit" className="pw-pill on">{tt('health.wizard.add', 'Add')}</button>
          </form>
        ))}
      </div>
    </div>
  );
}

/** A small square picture for a library row; a quiet tile when there is none. */
function Thumb({ src }: { src?: string | null }) {
  return src ? <img src={src} alt="" className="pw-thumb" loading="lazy" /> : <span aria-hidden="true" className="pw-thumb" />;
}

// ── The wizard ───────────────────────────────────────────────────────────────

export function PlanWizard<P extends WizardProfile>(props: PlanWizardProps<P>) {
  useLocale();
  const { healthProfile, onSaveProfile, onCancel, onCreate, onAskAva, safety, curated, onOpenSafety } = props;
  const [step, setStep] = useState(1);
  const [type, setType] = useState<PlanType>('combined');
  const [start, setStart] = useState<Start>('self');
  const [length, setLength] = useState<1 | 3 | 7>(7);
  const [startDate, setStartDate] = useState(ymd(new Date()));
  const [title, setTitle] = useState('');
  const [days, setDays] = useState<WizardDay[]>([]);
  const [sel, setSel] = useState(0);
  const [tab, setTab] = useState<LibTab>('exercises');
  // Which meal is being filled: breakfast first, then lunch, dinner, snack.
  const [slot, setSlotPick] = useState<Slot>('breakfast');
  const [q, setQ] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [openStarter, setOpenStarter] = useState<string | null>(null);
  // Building it yourself with no rules on the profile: nothing can be blocked,
  // so moving on needs an explicit "I understand" (his call, 11 Nov).
  const [skipAck, setSkipAck] = useState(false);
  const [pendingAdd, setPendingAdd] = useState<{ slug: string; name: string; course: string } | null>(null);
  // A look at one recipe or exercise without leaving the build step.
  const [preview, setPreview] = useState<{ kind: 'exercise' | 'recipe'; slug: string; name: string; base?: WizardExercise } | null>(null);
  const openPreview = (kind: 'exercise' | 'recipe', slug: string, name: string, base?: WizardExercise) => {
    setPreview({ kind, slug, name, base });
    if (kind === 'exercise' && !props.exerciseDetails[slug]) props.onLoadExerciseDetail(slug);
    if (kind === 'recipe' && !props.recipeDetails[slug]) props.onLoadRecipeDetail(slug);
  };
  useEffect(() => {
    if (!preview && !pendingAdd) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPreview(null); setPendingAdd(null); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview, pendingAdd]);

  const profile = (healthProfile ?? emptyProfile()) as P;
  const training = type !== 'meal';
  const meals = type !== 'fitness';
  const hasRules = (meals && (profile.constraints.allergens.length > 0 || profile.constraints.dietary.length > 0))
    || (training && (profile.constraints.injuries.length > 0 || profile.constraints.equipment_available.length > 0));

  // Days follow the length; existing content is kept.
  useEffect(() => {
    setDays((prev) => Array.from({ length }, (_, i) => prev[i] ?? { day_index: i + 1, kind: 'rest' as const, title: null, training: [], meals: [], notes: null }));
    setSel((s) => Math.min(s, length - 1));
  }, [length]);

  // The library tabs this type needs.
  const tabs = useMemo(() => {
    const out: Array<{ id: LibTab; name: string }> = [];
    if (training) out.push({ id: 'exercises', name: tt('health.wizard.lib.exercises', 'Exercises') });
    if (meals) out.push({ id: 'recipes', name: tt('health.wizard.lib.recipes', 'Recipes') });
    if (training && curated) out.push({ id: 'readymade', name: tt('health.wizard.lib.readymade', 'Ready-made plans') });
    return out;
  }, [training, meals, curated]);
  useEffect(() => { if (!tabs.some((x) => x.id === tab)) setTab(tabs[0]?.id ?? 'exercises'); }, [tabs, tab]);

  // Search: debounced; ready-made plans load once.
  const searchRef = useRef(0);
  useEffect(() => {
    if (step !== 4) return;
    if (tab === 'readymade') { if (curated && !curated.plans.length && !curated.loading) curated.onLoad(); return; }
    const n = ++searchRef.current;
    const h = setTimeout(() => {
      if (n !== searchRef.current) return;
      if (tab === 'exercises') props.onSearchExercises({ q, offset: 0, category: null });
      else props.onSearchRecipes({ q, offset: 0, category: COURSE_FOR[slot] });
    }, 250);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, tab, step, slot]);

  const results: Array<ExerciseRow | RecipeRow> = tab === 'exercises' ? props.exerciseResults : tab === 'recipes' ? props.recipeResults : [];
  const starterExercises = useMemo(() => {
    const d = curated?.detail;
    if (!d || d.id !== openStarter) return [];
    const seen = new Map<string, WizardExercise>();
    for (const day of d.days ?? []) for (const e of day.training ?? []) if (e.ref?.slug && !seen.has(e.ref.slug)) seen.set(e.ref.slug, e);
    return [...seen.values()];
  }, [curated?.detail, openStarter]);

  // Ask for verdicts on anything shown that has none yet (and again after
  // their rules change: the app clears the verdicts then).
  useEffect(() => {
    if (!safety || step !== 4) return;
    const shown = tab === 'readymade' ? starterExercises.map((e) => e.ref!.slug) : results.map((r) => r.slug);
    const missing = shown.filter((s) => !safety.results[s]);
    if (!missing.length) return;
    if (tab === 'recipes') safety.onCheck(missing, []); else safety.onCheck([], missing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, starterExercises, tab, step, safety?.results]);

  // No answer yet is 'pending' — never assumed fine.
  const verdictOf = (slug: string): SafetyVerdict | 'pending' | 'unchecked' | null => {
    if (!safety) return null;
    if (!safety.checked) return 'unchecked';
    return safety.results[slug] ?? 'pending';
  };
  const asVerdict = (v: ReturnType<typeof verdictOf>) => (v && typeof v === 'object' ? v : null);

  const addItem = (kind: 'exercise' | 'recipe', slug: string, name: string, base?: Partial<WizardExercise>, opts: { course?: string | null; confirmed?: boolean } = {}) => {
    // A dish that is not for this meal (a breakfast into dinner) asks first.
    if (kind === 'recipe' && !opts.confirmed && opts.course && !SLOT_COURSES[slot].includes(opts.course)) {
      setPendingAdd({ slug, name, course: opts.course });
      return;
    }
    const v = verdictOf(slug);
    if (v === 'pending') { setNotice(tt('health.wizard.checking', 'Still checking that against your rules — try again in a moment.')); return; }
    if (v === 'unchecked') { setNotice(tt('health.wizard.cant_check', 'Your rules could not be checked just now, so nothing can be added. Check your connection and try again.')); return; }
    const vo = asVerdict(v);
    if (vo && vo.verdict === 'blocked') { setNotice(`${name} — ${vo.reasons.join('; ')}. ${tt('health.wizard.swap', 'Swap it for something that fits.')}`); return; }
    // One breakfast, one lunch and one dinner a day: a taken meal goes to the
    // next day that still needs it. Snacks can be more than one.
    let target = sel;
    if (kind === 'recipe' && slot !== 'snack' && days[sel]?.meals.some((m) => m.slot === slot)) {
      const later = days.findIndex((d, i) => i > sel && !d.meals.some((m) => m.slot === slot));
      if (later === -1) {
        setNotice(tt('health.wizard.slot_full', 'Every day from here already has a {meal}. Remove one first to swap it.').replace('{meal}', t(`health.plans.slot.${slot}`).toLowerCase()));
        return;
      }
      target = later;
    }
    setNotice(null);
    setDays((prev) => prev.map((d, i) => {
      if (i !== target) return d;
      if (kind === 'exercise') {
        const ex: WizardExercise = {
          id: newId('ex'), ref: { kind: 'exercise', slug }, name,
          sets: base?.sets ?? 3, reps: base?.reps ?? '10', weight: base?.weight ?? null, rest_seconds: base?.rest_seconds ?? 60, tempo: base?.tempo ?? null,
          notes: vo && vo.verdict === 'warn' ? vo.reasons.join('; ') : (base?.notes ?? null),
        };
        return { ...d, kind: 'training' as const, training: [...d.training, ex] };
      }
      const meal: WizardMeal = { id: newId('ml'), slot, ref: { kind: 'recipe', slug }, name, servings: 1, calories: null, protein_g: null, carbs_g: null, fat_g: null, cook_time_minutes: null, notes: null };
      return { ...d, meals: [...d.meals, meal] };
    }));
    if (kind === 'recipe') {
      if (!props.recipeDetails[slug]) props.onLoadRecipeDetail(slug);
      // Breakfast, lunch, dinner; then the next day's breakfast.
      if (target !== sel) setSel(target);
      const filled = new Set([...(days[target]?.meals ?? []).map((m) => m.slot), slot]);
      const nextToday = CORE_SLOTS.find((x) => !filled.has(x));
      if (nextToday) setSlotPick(nextToday);
      else if (target < days.length - 1) {
        const nextDay = days[target + 1];
        setSel(target + 1);
        setSlotPick(CORE_SLOTS.find((x) => !nextDay.meals.some((m) => m.slot === x)) ?? 'breakfast');
      }
    }
  };

  const removeItem = (dayIdx: number, id: string) => setDays((prev) => prev.map((d, i) => {
    if (i !== dayIdx) return d;
    const tr = d.training.filter((e) => e.id !== id);
    return { ...d, training: tr, meals: d.meals.filter((m) => m.id !== id), kind: tr.length ? 'training' as const : 'rest' as const };
  }));
  /** Pick a day AND which meal to fill on it, and show the recipes for it. */
  const fillSlot = (dayIdx: number, which: Slot) => { setSel(dayIdx); setSlotPick(which); setTab('recipes'); setNotice(null); };

  const useWholeStarter = () => {
    const d = curated?.detail;
    if (!d) return;
    const src = [...(d.days ?? [])].sort((a, b) => a.day_index - b.day_index);
    const blocked = src.flatMap((day) => day.training ?? []).filter((e) => e.ref?.slug && asVerdict(verdictOf(e.ref.slug))?.verdict === 'blocked');
    setDays((prev) => prev.map((day, i) => {
      const from = src[i];
      if (!from) return day;
      const exs = (from.training ?? []).filter((e) => !blocked.includes(e)).map((e) => ({ ...e, id: newId('ex') }));
      return { ...day, kind: exs.length ? 'training' as const : from.kind === 'active_recovery' ? 'active_recovery' as const : 'rest' as const, title: from.title ?? day.title, training: exs };
    }));
    setNotice(blocked.length
      ? `${tt('health.wizard.used_plan', 'Plan copied in.')} ${tt('health.wizard.left_out', 'Left out because they break your rules:')} ${blocked.map((e) => e.name).join(', ')}.`
      : tt('health.wizard.used_plan', 'Plan copied in.'));
  };

  const kcal = (d: WizardDay) => {
    let total = 0, known = false;
    for (const m of d.meals) {
      const det = m.ref?.slug ? props.recipeDetails[m.ref.slug] : undefined;
      // Same version the rest of the health section reads.
      const lvl = healthProfile?.kitchen?.level ?? 'intermediate';
      const withCal = det?.versions.filter((v) => v.nutrition?.calories != null) ?? [];
      const n = (withCal.find((v) => v.level === lvl) ?? withCal.find((v) => v.level === 'intermediate') ?? withCal[0])?.nutrition?.calories;
      if (typeof n === 'number') { total += n * (m.servings ?? 1); known = true; }
    }
    return known ? Math.round(total) : null;
  };

  const warnings = days.flatMap((d) => d.training.filter((e) => e.ref?.slug && asVerdict(verdictOf(e.ref.slug))?.verdict === 'warn'));
  const unverified = [...new Set(days.flatMap((d) => d.meals.flatMap((m) => (m.ref?.slug ? asVerdict(verdictOf(m.ref.slug))?.unverified ?? [] : []))))];
  const sessions = days.filter((d) => d.training.length).length;
  const mealCount = days.reduce((a, d) => a + d.meals.length, 0);
  const typeName = (x: PlanType) => (x === 'fitness' ? tt('health.wizard.type.fitness', 'Fitness') : x === 'meal' ? tt('health.wizard.type.meal', 'Meal') : tt('health.wizard.type.combined', 'Combined'));
  const lengthName = length === 1 ? tt('health.wizard.len.1', '1 day') : `${length} ${tt('health.wizard.days', 'days')}`;
  const defaultTitle = `${typeName(type)} · ${lengthName}`;
  const slotName = (s: Slot) => t(`health.plans.slot.${s}`);

  const finish = (status: 'active' | 'draft') => {
    const plan = {
      schema_version: 1, id: newId('plan'), type, title: title.trim() || defaultTitle, goal: healthProfile?.goals?.primary ?? null,
      source: 'manual', status, duration_days: length, start_date: startDate, profile_snapshot: null,
      days, created_at: new Date().toISOString(), updated_at: null,
    };
    onCreate(plan as never);
    onCancel();
  };

  const blockedNext = step === 2 && !hasRules && !skipAck;
  const next = () => {
    if (blockedNext) return;
    if (step === 1 && start === 'ava' && onAskAva) { onAskAva(type); return; }
    if (step === 1 && start === 'ready') setTab('readymade');
    setNotice(null);
    setStep((s) => Math.min(5, s + 1));
  };
  const back = () => { setNotice(null); if (step === 1) onCancel(); else setStep((s) => s - 1); };

  const steps = [
    tt('health.wizard.step.what', 'What'), tt('health.wizard.step.rules', 'Your rules'), tt('health.wizard.step.length', 'How long'),
    tt('health.wizard.step.build', 'Build'), tt('health.wizard.step.check', 'Check'),
  ];

  // ── The preview: slides over the days; the plan stays as it is ──
  let previewPanel: ReactNode = null;
  if (preview) {
    const exDet = preview.kind === 'exercise' ? props.exerciseDetails[preview.slug] : undefined;
    const reDet = preview.kind === 'recipe' ? props.recipeDetails[preview.slug] : undefined;
    const vObj = asVerdict(verdictOf(preview.slug));
    const day = addDays(startDate, sel);
    previewPanel = (
      <div className="pw-overlay" onClick={() => setPreview(null)}>
        <div role="dialog" aria-modal="true" aria-label={preview.name} onClick={(e) => e.stopPropagation()} className="pw-drawer">
          <div className="pw-row" style={{ gap: 12, borderBottom: '1px solid var(--border)', padding: '16px 20px' }}>
            <span className="pw-trunc" style={{ minWidth: 0, flex: 1, fontSize: 16, fontWeight: 600 }}>{preview.name}</span>
            <button type="button" className="pw-primary" style={{ minHeight: 40, fontSize: 13, padding: '0 16px' }}
              onClick={() => { addItem(preview.kind, preview.slug, preview.name, preview.base, { course: reDet?.course ?? props.recipeResults.find((x) => x.slug === preview.slug)?.course ?? null }); if (!vObj || vObj.verdict !== 'blocked') setPreview(null); }}>
              {tt('health.wizard.add_to', 'Add to')} {WEEKDAY[day.getDay()]} {day.getDate()}
            </button>
            <button type="button" className="pw-btn quiet" onClick={() => setPreview(null)}>{tt('health.wizard.close', 'Close')}</button>
          </div>
          {vObj && vObj.verdict !== 'ok' && (
            <div className={vObj.verdict === 'blocked' ? 'pw-errbox' : 'pw-warnbox'} style={{ margin: '16px 20px 0' }}>
              {vObj.verdict === 'blocked' ? tt('health.wizard.breaks', 'This breaks your rules:') : tt('health.wizard.care', 'Take care:')} {vObj.reasons.join('; ')}
              {vObj.alternatives?.length ? `. ${tt('health.wizard.easier_version', 'Easier version')}: ${vObj.alternatives.map((a) => a.name).join(', ')}` : ''}
            </div>
          )}
          <div style={{ minHeight: 0, flex: 1, overflowY: 'auto', padding: 20 }}>
            {exDet ? <ExerciseDetailBody ex={exDet as never} /> : reDet ? <RecipeDetailBody r={reDet as never} /> : (
              <span className="pw-muted" style={{ fontSize: 13 }}>{tt('health.wizard.loading', 'Loading…')}</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Portalled to <body>, so "fixed" covers the whole window in both apps.
  return createPortal(
    <div className="pw-root" role="dialog" aria-modal="true" aria-label={tt('health.wizard.title', 'New plan')}>
      <style>{CSS}</style>
      <header className="pw-header">
        <div style={{ minWidth: 220, flex: 1 }}>
          <h1 className="pw-h1">{tt('health.wizard.title', 'New plan')}</h1>
          <p className="pw-muted" style={{ margin: '2px 0 0', fontSize: 13 }}>{tt('health.wizard.sub', 'One place to start any plan: build it, ask Ava, or begin from a ready-made one.')}</p>
        </div>
        <nav aria-label={tt('health.wizard.steps', 'Steps')} className="pw-row" style={{ gap: 6 }}>
          {steps.map((label, i) => (
            <button key={label} type="button" className={cx('pw-pill', step === i + 1 && 'on')} onClick={() => setStep(i + 1)}
              disabled={i + 1 > step && (blockedNext || (step === 1 && start === 'ava'))} aria-current={step === i + 1 ? 'step' : undefined}>
              <span style={{ fontWeight: 600 }}>{i + 1}</span> {label}
            </button>
          ))}
        </nav>
        <button type="button" className="pw-btn quiet" onClick={onCancel}>{tt('health.wizard.cancel', 'Cancel')}</button>
      </header>

      <main className={cx('pw-main', step === 4 && 'fill')}>
        <div className={cx('pw-wrap', step === 4 && 'fill')}>

          {step === 1 && (
            <section className="pw-col" style={{ gap: 28 }}>
              <div>
                <h2 className="pw-h2">{tt('health.wizard.what.h', 'What are we planning?')}</h2>
                <p className="pw-lead">{tt('health.wizard.what.p', 'The rest of the wizard shapes itself around this.')}</p>
              </div>
              <div className="pw-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 16 }}>
                {(['fitness', 'meal', 'combined'] as PlanType[]).map((x) => (
                  <button key={x} type="button" onClick={() => setType(x)} className={cx('pw-card', type === x && 'on')} style={{ padding: 24 }} aria-pressed={type === x}>
                    <span style={{ display: 'block', width: 36, height: 4, borderRadius: 2, background: ACCENT[x], marginBottom: 16 }} />
                    <span style={{ display: 'block', fontSize: 20, fontWeight: 600, marginBottom: 6 }}>{typeName(x)}</span>
                    <span className="pw-sec" style={{ display: 'block', fontSize: 14, marginBottom: 4 }}>
                      {x === 'fitness' ? tt('health.wizard.fitness.what', 'Exercises only') : x === 'meal' ? tt('health.wizard.meal.what', 'Recipes only') : tt('health.wizard.combined.what', 'Exercises and recipes')}
                    </span>
                    <span className="pw-muted" style={{ display: 'block', fontSize: 13 }}>
                      {x === 'fitness' ? tt('health.wizard.fitness.detail', 'Training days, sets and reps, rest days.') : x === 'meal' ? tt('health.wizard.meal.detail', 'Breakfast, lunch and dinner, with day totals.') : tt('health.wizard.combined.detail', 'Both, side by side, day by day.')}
                    </span>
                  </button>
                ))}
              </div>
              <div>
                <h3 className="pw-h3">{tt('health.wizard.how', 'How do you want to start?')}</h3>
                <div className="pw-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12 }}>
                  {([
                    { id: 'self' as Start, name: tt('health.wizard.start.self', 'Build it myself'), detail: tt('health.wizard.start.self.d', 'Lay it out day by day from the library.'), show: true },
                    { id: 'ava' as Start, name: tt('health.wizard.start.ava', 'Ask Ava'), detail: tt('health.wizard.start.ava.d', 'She builds it around your rules and goals; you change anything.'), show: !!onAskAva },
                    { id: 'ready' as Start, name: tt('health.wizard.start.ready', 'Start from a ready-made plan'), detail: tt('health.wizard.start.ready.d', 'Built and tested. Use it whole, or as a starting point.'), show: !!curated && training },
                  ]).filter((o) => o.show).map((o) => (
                    <button key={o.id} type="button" onClick={() => setStart(o.id)} className={cx('pw-card', start === o.id && 'on')} style={{ padding: '16px 20px' }} aria-pressed={start === o.id}>
                      <span style={{ display: 'block', fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{o.name}</span>
                      <span className="pw-muted" style={{ display: 'block', fontSize: 13 }}>{o.detail}</span>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="pw-col" style={{ gap: 24 }}>
              <div>
                <h2 className="pw-h2">{tt('health.wizard.rules.h', 'Your rules')}</h2>
                <p className="pw-lead">{tt('health.wizard.rules.p', 'Only what this plan needs. Changes here are saved to your profile.')}</p>
              </div>
              {!hasRules && (
                <div className="pw-warnbox pw-col" style={{ gap: 12 }}>
                  <span style={{ fontSize: 14, color: '#fef3c7' }}>
                    {meals && training
                      ? tt('health.wizard.empty.both', 'Add any allergies, diet, injuries or kit you have so the next step can keep what does not fit out of your plan.')
                      : meals
                        ? tt('health.wizard.empty.meals', 'Add any allergies or diet so the next step can keep what does not fit out of your plan.')
                        : tt('health.wizard.empty.training', 'Add any injuries or the kit you have so the next step can keep what does not fit out of your plan.')}
                  </span>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                    <input type="checkbox" checked={skipAck} onChange={(e) => setSkipAck(e.target.checked)} style={{ marginTop: 2, width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent)' }} />
                    <span>{tt('health.wizard.empty.ack', 'Skip for now: I understand nothing will be blocked for allergies, diet or injuries.')}</span>
                  </label>
                </div>
              )}
              <div className="pw-row" style={{ gap: 16, alignItems: 'stretch' }}>
                <div className="pw-panel pw-col" style={{ minWidth: 300, flex: 1, gap: 16, padding: 20, borderColor: '#3a2a4a' }}>
                  <div className="pw-row" style={{ gap: 10 }}>
                    <span style={{ fontSize: 16, fontWeight: 600 }}>{tt('health.wizard.never', 'Never')}</span>
                    <span className="pw-tag-never">{tt('health.wizard.never.tag', 'hard rules · always blocked')}</span>
                  </div>
                  {meals && <RuleRow label={tt('health.wizard.r.allergies', 'Allergies')} k="allergens" profile={profile} onChange={onSaveProfile} hard />}
                  {meals && <RuleRow label={tt('health.wizard.r.diet', 'Diet')} k="dietary" profile={profile} onChange={onSaveProfile} hard />}
                  {training && <RuleRow label={tt('health.wizard.r.injuries', 'Injuries')} k="injuries" profile={profile} onChange={onSaveProfile} hard />}
                  {training && <RuleRow label={tt('health.wizard.r.kit', 'Kit I have')} k="equipment" profile={profile} onChange={onSaveProfile} hard />}
                </div>
                <div className="pw-panel pw-col" style={{ minWidth: 300, flex: 1, gap: 16, padding: 20 }}>
                  <div className="pw-row" style={{ gap: 10 }}>
                    <span style={{ fontSize: 16, fontWeight: 600 }}>{tt('health.wizard.prefer', 'Prefer')}</span>
                    <span className="pw-tag-prefer">{tt('health.wizard.prefer.tag', 'steers the choices · never blocks')}</span>
                  </div>
                  {meals && <RuleRow label={tt('health.wizard.r.love', 'Love')} k="likes" profile={profile} onChange={onSaveProfile} hard={false} />}
                  {meals && <RuleRow label={tt('health.wizard.r.rather_not', 'Rather not')} k="dislikes" profile={profile} onChange={onSaveProfile} hard={false} />}
                  {meals && <RuleRow label={tt('health.wizard.r.cuisines', 'Favourite cuisines')} k="cuisines" profile={profile} onChange={onSaveProfile} hard={false} />}
                  {training && (
                    <div className="pw-col" style={{ gap: 8 }}>
                      <span className="pw-label">{tt('health.wizard.r.training', 'Training')}</span>
                      <span className="pw-sec" style={{ fontSize: 13 }}>
                        {[profile.training?.experience, profile.training?.days_per_week ? `${profile.training.days_per_week} ${tt('health.wizard.per_week', 'days a week')}` : null].filter(Boolean).join(' · ') || tt('health.wizard.r.training_none', 'Not set yet: you can set it in the Profile tab.')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="pw-panel pw-col pw-sec" style={{ gap: 6, padding: '12px 16px', fontSize: 13, lineHeight: 1.6 }}>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{tt('health.wizard.disclaimer.h', 'This plan is yours')}</span>
                <span>
                  {tt('health.wizard.disclaimer.p', 'Ava checks the library against the rules you give her, but she is not a doctor or dietitian. Always check ingredients against your allergies, and talk to a professional before starting a new diet or exercise programme, especially if you are pregnant, injured or managing a condition.')}{' '}
                  <button type="button" className="pw-link" onClick={onOpenSafety}>{tt('health.wizard.safety_link', 'Health & Fitness Safety')}</button>
                </span>
              </div>
            </section>
          )}

          {step === 3 && (
            <section className="pw-col" style={{ gap: 24, maxWidth: 900 }}>
              <div>
                <h2 className="pw-h2">{tt('health.wizard.len.h', 'How long?')}</h2>
                <p className="pw-lead">{tt('health.wizard.len.p', 'Short plans get finished. When it ends, repeat it and step it up from what you actually did.')}</p>
              </div>
              <div className="pw-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
                {([1, 3, 7] as const).map((n) => (
                  <button key={n} type="button" onClick={() => setLength(n)} className={cx('pw-card', length === n && 'on')} style={{ padding: 20 }} aria-pressed={length === n}>
                    <span style={{ display: 'block', fontSize: 22, fontWeight: 600, marginBottom: 4 }}>{n === 1 ? tt('health.wizard.len.1', '1 day') : `${n} ${tt('health.wizard.days', 'days')}`}</span>
                    <span className="pw-muted" style={{ display: 'block', fontSize: 13 }}>
                      {n === 1 ? tt('health.wizard.len.1.d', 'A single session or a day of meals.') : n === 3 ? tt('health.wizard.len.3.d', 'A short block to try something.') : tt('health.wizard.len.7.d', 'A full week. Shop once.')}
                    </span>
                  </button>
                ))}
              </div>
              <div className="pw-col" style={{ gap: 8, maxWidth: 320 }}>
                <span className="pw-sec" style={{ fontSize: 13 }}>{tt('health.wizard.starts', 'Starts on')}</span>
                <DateField value={startDate} onChange={(v: string | null) => v && setStartDate(v)} />
              </div>
            </section>
          )}

          {step === 4 && (
            <section className="pw-col" style={{ minHeight: 0, flex: 1, gap: 16 }}>
              <div className="pw-row" style={{ gap: 12, alignItems: 'flex-end' }}>
                <div style={{ minWidth: 280, flex: 1 }}>
                  <h2 className="pw-h2">{tt('health.wizard.build.h', 'Build your plan')}</h2>
                  <p className="pw-lead">{tt('health.wizard.build.p', 'Pick a day, then add from the library. Everything is checked against your rules.')}</p>
                </div>
                <span className="pw-chip pw-sec">
                  {tt('health.wizard.adding_to', 'Adding to')}: {WEEKDAY[addDays(startDate, sel).getDay()]} {addDays(startDate, sel).getDate()}{tab === 'recipes' ? ` · ${slotName(slot)}` : ''}
                </span>
              </div>

              {safety && !safety.checked && <div role="status" className="pw-warnbox">{tt('health.wizard.cant_check', 'Your rules could not be checked just now, so nothing can be added. Check your connection and try again.')}</div>}
              {notice && <div role="status" className="pw-errbox">{notice}</div>}

              {/* Fills what is left of the window: the library and the days
                  scroll inside themselves, the page never does. */}
              <div className="pw-buildrow" style={{ display: 'flex', minHeight: 0, flex: 1, gap: 16 }}>
                <aside aria-label={tt('health.wizard.library', 'Library')} className="pw-panel pw-lib">
                  <div role="tablist" className="pw-row" style={{ gap: 6 }}>
                    {tabs.map((x) => <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} className={cx('pw-pill', tab === x.id && 'on')} onClick={() => { setTab(x.id); setNotice(null); }}>{x.name}</button>)}
                  </div>
                  {tab === 'recipes' && (
                    <div role="radiogroup" aria-label={tt('health.wizard.which_meal', 'Which meal')} className="pw-row" style={{ gap: 6 }}>
                      {SLOTS.map((which) => (
                        <button key={which} type="button" role="radio" aria-checked={slot === which} onClick={() => setSlotPick(which)} className={cx('pw-pill meal', slot === which && 'on')}>{slotName(which)}</button>
                      ))}
                    </div>
                  )}
                  {tab !== 'readymade' ? (
                    <>
                      <label className="pw-sr" htmlFor="wizard-search">{tt('health.wizard.search', 'Search the library')}</label>
                      <input id="wizard-search" className="pw-input" value={q} onChange={(e) => setQ(e.target.value)}
                        placeholder={tab === 'recipes' ? tt('health.wizard.search.recipes', 'Search recipes') : tt('health.wizard.search.exercises', 'Search exercises')} />
                      <span className="pw-muted" style={{ fontSize: 12 }}>{props.catalogSearching ? tt('health.wizard.searching', 'Searching…') : tt('health.wizard.lib_note', 'Checked against your rules. Anything that breaks one says why.')}</span>
                      <div className="pw-scroll">
                        {results.map((r) => {
                          const v = verdictOf(r.slug);
                          const vObj = asVerdict(v);
                          const rec = tab === 'recipes' ? (r as RecipeRow) : null;
                          const meta = rec ? [rec.course, rec.cuisine_name].filter(Boolean).join(' · ') : ((r as ExerciseRow).workout_type ?? '');
                          return (
                            <div key={r.slug} className="pw-librow">
                              <button type="button" className="pw-rowbtn" onClick={() => openPreview(rec ? 'recipe' : 'exercise', r.slug, r.name)} aria-label={`${tt('health.wizard.view', 'View')} ${r.name}`}>
                                <Thumb src={rec ? rec.hero_image_url : (r as ExerciseRow).thumbnail_url} />
                                <span className="pw-col" style={{ minWidth: 0, flex: 1, gap: 2 }}>
                                  <span className="pw-trunc" style={{ fontSize: 14, fontWeight: 500 }}>{r.name}</span>
                                  <span className={vObj?.verdict === 'blocked' ? 'pw-bad' : vObj?.verdict === 'warn' ? 'pw-warn' : 'pw-muted'} style={{ fontSize: 12 }}>
                                    {vObj && vObj.verdict !== 'ok' ? vObj.reasons.join('; ') + (vObj.alternatives?.length ? ` · ${tt('health.wizard.easier', 'easier')}: ${vObj.alternatives.map((a) => a.name).join(', ')}` : '') : v === 'pending' ? tt('health.wizard.checking_short', 'Checking…') : meta}
                                  </span>
                                </span>
                              </button>
                              <button type="button" className="pw-add" aria-label={`${tt('health.wizard.add', 'Add')} ${r.name}`}
                                onClick={() => addItem(rec ? 'recipe' : 'exercise', r.slug, r.name, undefined, { course: rec ? rec.course ?? null : null })}>
                                {tt('health.wizard.add', 'Add')}
                              </button>
                            </div>
                          );
                        })}
                        {!props.catalogSearching && results.length === 0 && <span className="pw-muted" style={{ fontSize: 13 }}>{tt('health.wizard.no_results', 'Nothing found. Try another word.')}</span>}
                      </div>
                    </>
                  ) : (
                    <div className="pw-scroll">
                      <span className="pw-muted" style={{ fontSize: 12 }}>{tt('health.wizard.ready_note', 'Use a plan whole, or open it and take single exercises.')}</span>
                      {curated?.loading && <span className="pw-muted" style={{ fontSize: 13 }}>{tt('health.wizard.loading', 'Loading…')}</span>}
                      {curated?.plans.map((p) => (
                        <div key={p.id} className="pw-librow pw-col" style={{ alignItems: 'stretch', borderColor: openStarter === p.id ? 'color-mix(in srgb,var(--accent) 60%,transparent)' : undefined, padding: '10px 12px' }}>
                          <button type="button" className="pw-rowbtn" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }} onClick={() => { setOpenStarter(p.id); curated.onLoadDetail(p.id); }}>
                            <span style={{ fontSize: 14, fontWeight: 500 }}>{p.title}</span>
                            <span className="pw-muted" style={{ fontSize: 12 }}>{[p.level, p.duration_days ? `${p.duration_days} ${tt('health.wizard.days', 'days')}` : null].filter(Boolean).join(' · ')}</span>
                          </button>
                          {openStarter === p.id && (
                            <div className="pw-col" style={{ gap: 8, marginTop: 10 }}>
                              {curated.detailLoading || curated.detail?.id !== p.id ? (
                                <span className="pw-muted" style={{ fontSize: 12 }}>{tt('health.wizard.loading', 'Loading…')}</span>
                              ) : (
                                <>
                                  <button type="button" className="pw-primary" style={{ minHeight: 36, fontSize: 13 }} onClick={useWholeStarter}>{tt('health.wizard.use_whole', 'Use this whole plan')}</button>
                                  {starterExercises.map((e) => {
                                    const vObj = asVerdict(verdictOf(e.ref!.slug));
                                    return (
                                      <div key={e.ref!.slug} className="pw-row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                                        <button type="button" className="pw-rowbtn" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 0 }} onClick={() => openPreview('exercise', e.ref!.slug, e.name, e)} aria-label={`${tt('health.wizard.view', 'View')} ${e.name}`}>
                                          <span className="pw-trunc" style={{ fontSize: 13, maxWidth: '100%' }}>{e.name}</span>
                                          {vObj && vObj.verdict !== 'ok' && <span className={vObj.verdict === 'blocked' ? 'pw-bad' : 'pw-warn'} style={{ fontSize: 11 }}>{vObj.reasons.join('; ')}</span>}
                                        </button>
                                        <button type="button" className="pw-add sm" aria-label={`${tt('health.wizard.add', 'Add')} ${e.name}`} onClick={() => addItem('exercise', e.ref!.slug, e.name, e)}>{tt('health.wizard.add', 'Add')}</button>
                                      </div>
                                    );
                                  })}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </aside>

                <div className="pw-days">
                  {days.map((d, i) => {
                    const date = addDays(startDate, i);
                    const total = kcal(d);
                    return (
                      <div key={i} className={cx('pw-day', sel === i && 'on')}>
                        <button type="button" className="pw-rowbtn" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2, flex: 'none' }} aria-pressed={sel === i}
                          onClick={() => { setSel(i); setNotice(null); const first = SLOTS.find((x) => !d.meals.some((m) => m.slot === x)); if (first) setSlotPick(first); }}>
                          <span className="pw-label">{date.getDate()} {date.toLocaleDateString(undefined, { month: 'short' })}</span>
                          <span style={{ fontSize: 15, fontWeight: 600 }}>{WEEKDAY[date.getDay()]}</span>
                        </button>
                        {training && (
                          <div className="pw-col" style={{ gap: 6 }}>
                            <span className="pw-label" style={{ color: 'var(--accent)', letterSpacing: '.1em' }}>{tt('health.wizard.training', 'Training')}</span>
                            {d.training.map((e) => {
                              const vo = e.ref?.slug ? asVerdict(verdictOf(e.ref.slug)) : null;
                              const warn = vo?.verdict === 'warn';
                              return (
                                <div key={e.id} className={cx('pw-item', warn && 'warn')}>
                                  <span style={{ minWidth: 0, flex: 1 }}>
                                    <span style={{ display: 'block', fontSize: 13 }}>{e.name}</span>
                                    <span className={warn ? 'pw-warn' : 'pw-muted'} style={{ display: 'block', fontSize: 11 }}>{warn ? vo!.reasons.join('; ') : `${e.sets ?? '–'} × ${e.reps ?? '–'}`}</span>
                                  </span>
                                  <button type="button" className="pw-x" aria-label={`${tt('health.wizard.remove_item', 'Remove')} ${e.name}`} onClick={() => removeItem(i, e.id)}>×</button>
                                </div>
                              );
                            })}
                            {!d.training.length && <span className="pw-muted" style={{ fontSize: 12 }}>{tt('health.wizard.rest', 'Rest day')}</span>}
                          </div>
                        )}
                        {meals && (
                          <div className="pw-col" style={{ gap: 6 }}>
                            <span className="pw-label" style={{ color: '#f0a24b', letterSpacing: '.1em' }}>{tt('health.wizard.meals', 'Meals')}</span>
                            {SLOTS.map((which) => {
                              const inSlot = d.meals.filter((m) => m.slot === which);
                              const active = sel === i && tab === 'recipes' && slot === which;
                              return (
                                <div key={which} className="pw-col" style={{ gap: 4 }}>
                                  {inSlot.map((m) => (
                                    <div key={m.id} className="pw-item">
                                      <span style={{ minWidth: 0, flex: 1 }}>
                                        <span className="pw-muted" style={{ display: 'block', fontSize: 11 }}>{slotName(which)}</span>
                                        <span style={{ display: 'block', fontSize: 13 }}>{m.name}</span>
                                      </span>
                                      <button type="button" className="pw-x" aria-label={`${tt('health.wizard.remove_item', 'Remove')} ${m.name}`} onClick={() => removeItem(i, m.id)}>×</button>
                                    </div>
                                  ))}
                                  {inSlot.length === 0 && (
                                    <button type="button" className={cx('pw-slot', active && 'on')} aria-pressed={active} onClick={() => fillSlot(i, which)}>+ {slotName(which)}</button>
                                  )}
                                </div>
                              );
                            })}
                            {total !== null && <span className="pw-sec" style={{ borderTop: '1px solid var(--border)', paddingTop: 6, fontSize: 12 }}>{total} kcal</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {step === 5 && (
            <section className="pw-col" style={{ gap: 20, maxWidth: 900 }}>
              <div>
                <h2 className="pw-h2">{tt('health.wizard.check.h', 'Check and start')}</h2>
                <p className="pw-lead">{tt('health.wizard.check.p', 'A last look before it goes on your calendar.')}</p>
              </div>
              <div className="pw-col" style={{ gap: 8, maxWidth: 480 }}>
                <label htmlFor="wizard-title" className="pw-sec" style={{ fontSize: 13 }}>{tt('health.wizard.name', 'Name it')}</label>
                <input id="wizard-title" className="pw-input" value={title} placeholder={defaultTitle} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="pw-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
                {[
                  { l: tt('health.wizard.sum.plan', 'Plan'), v: typeName(type) },
                  { l: tt('health.wizard.sum.length', 'Length'), v: lengthName },
                  { l: tt('health.wizard.sum.starts', 'Starts'), v: addDays(startDate, 0).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) },
                  ...(training ? [{ l: tt('health.wizard.sum.sessions', 'Training days'), v: String(sessions) }] : []),
                  ...(meals ? [{ l: tt('health.wizard.sum.meals', 'Meals'), v: String(mealCount) }] : []),
                ].map((s) => (
                  <div key={s.l} className="pw-panel pw-col" style={{ gap: 4, padding: 16 }}>
                    <span className="pw-label">{s.l}</span>
                    <span style={{ fontSize: 18, fontWeight: 600 }}>{s.v}</span>
                  </div>
                ))}
              </div>
              {(warnings.length > 0 || unverified.length > 0) && (
                <div className="pw-panel pw-col" style={{ gap: 6, padding: 16, borderColor: 'rgba(245,158,11,.3)' }}>
                  <span className="pw-warn" style={{ fontSize: 14, fontWeight: 600 }}>{tt('health.wizard.worth', 'Worth knowing')}</span>
                  {warnings.map((e) => {
                    const vo = asVerdict(verdictOf(e.ref!.slug));
                    return <span key={e.id} className="pw-sec" style={{ fontSize: 13 }}>{e.name}: {vo?.reasons.join('; ')}{vo?.alternatives?.length ? `. ${tt('health.wizard.easier_version', 'Easier version')}: ${vo.alternatives.map((a) => a.name).join(', ')}` : ''}.</span>;
                  })}
                  {unverified.length > 0 && <span className="pw-sec" style={{ fontSize: 13 }}>{tt('health.wizard.unverified', "Can't be checked for {x}: the library can't confirm a dish is free from it.").replace('{x}', unverified.join(', '))}</span>}
                </div>
              )}
              <div className="pw-row" style={{ gap: 10 }}>
                <button type="button" className="pw-primary" style={{ minHeight: 46, fontSize: 15 }} onClick={() => finish('active')}>{tt('health.wizard.start_plan', 'Start this plan')}</button>
                <button type="button" className="pw-btn" style={{ minHeight: 46, fontSize: 15 }} onClick={() => finish('draft')}>{tt('health.wizard.save_draft', 'Save as a draft')}</button>
                <span className="pw-muted" style={{ fontSize: 12 }}>
                  {tt('health.wizard.not_advice', 'Not medical advice.')}{' '}
                  <button type="button" className="pw-link" style={{ fontSize: 12 }} onClick={onOpenSafety}>{tt('health.wizard.safety_link', 'Health & Fitness Safety')}</button>
                </span>
              </div>
            </section>
          )}
        </div>
      </main>

      <footer className="pw-footer">
        <button type="button" className="pw-btn" onClick={back}>{step === 1 ? tt('health.wizard.cancel', 'Cancel') : tt('health.wizard.back', 'Back')}</button>
        {step < 5 && (
          <button type="button" className="pw-primary" onClick={next} disabled={blockedNext} title={blockedNext ? tt('health.wizard.empty.need', 'Add a rule, or tick the box to skip') : undefined}>
            {step === 1 && start === 'ava' ? tt('health.wizard.ask_ava', 'Ask Ava') : step === 4 ? tt('health.wizard.check_it', 'Check it') : tt('health.wizard.next', 'Next')}
          </button>
        )}
      </footer>
      {previewPanel}
      {pendingAdd && (
        <div className="pw-modalback" onClick={() => setPendingAdd(null)}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="meal-fit-title" className="pw-modal" onClick={(e) => e.stopPropagation()}>
            <h3 id="meal-fit-title" style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>{tt('health.wizard.fit.h', 'Not a {meal} dish').replace('{meal}', slotName(slot).toLowerCase())}</h3>
            <p className="pw-sec" style={{ margin: 0, fontSize: 14 }}>
              {tt('health.wizard.fit.p', '{name} is a {course} dish. Add it to {meal} anyway?').replace('{name}', pendingAdd.name).replace('{course}', pendingAdd.course).replace('{meal}', slotName(slot))}
            </p>
            <div className="pw-row" style={{ gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="pw-btn" autoFocus onClick={() => setPendingAdd(null)}>{tt('health.wizard.cancel', 'Cancel')}</button>
              <button type="button" className="pw-primary" onClick={() => { const p = pendingAdd; setPendingAdd(null); addItem('recipe', p.slug, p.name, undefined, { course: p.course, confirmed: true }); }}>
                {tt('health.wizard.fit.add', 'Add to {meal}').replace('{meal}', slotName(slot))}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
