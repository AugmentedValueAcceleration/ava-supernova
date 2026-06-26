// ─── Shared type definitions ─────────────────────────────────────────────────
// Single source of truth for messages between the extension host and the
// dashboard webview. The dashboard-ui webview imports this file directly via
// a path alias (@ava-extension/messages) so drift is impossible.

export interface AccountInfo {
  id: string;
  email: string;
  name: string | null;
  /** Auth-provider avatar (Google / GitHub OAuth photo, populated
   *  automatically on sign-in). Threaded through to the chat user-
   *  message bubbles so the operator's photo replaces the gradient
   *  + person SVG fallback. Null when never set. */
  avatar_url?: string | null;
  tier: 'free' | 'pro' | 'ultra' | 'enterprise' | 'admin';
  usage: {
    credits_used: number;
    credits_limit: number | null;
    requests_count: number;
    period_start: string | null;
    period_end: string | null;
    free_credits_used: number;
    free_credits_limit: number;
  } | null;
  storage?: {
    used_gb: number;
    base_gb: number;
    addon_gb: number;
    total_gb: number;
    percent_used: number;
  };
  /**
   * Active subscription, if any. Drives the "Renews <date>" line on the
   * billing card — usage.period_end tracks the usage-tracking window
   * (calendar month for free, sub cycle for paid) and is NOT the
   * renewal date. Null for free / admin / cancelled accounts.
   */
  subscription?: {
    status: string;
    current_period_start: string | null;
    current_period_end: string | null;
  } | null;
}

export type MemoryCategory = 'pattern' | 'preference' | 'architecture' | 'bug-fix' | 'convention' | 'tool-config' | 'decision' | 'person' | 'general';

export interface MemoryEntry {
  id: string;
  scope: 'global' | 'project';
  project_id: string | null;
  key: string;
  content: string;
  category: MemoryCategory | string | null;
  created_at: string;
  updated_at: string;
  last_recalled_at?: string | null;
  recall_count?: number;
  tags?: string[];
  archived?: boolean;
  archived_at?: string | null;
  branch?: string | null;
  directory_scope?: string | null;
  // v3 graph fields
  confidence?: number;
  confidence_source?: string;
  source?: string;
  archived_reason?: string | null;
  reinforcement_count?: number;
}

/** v3 graph stats for the dashboard memory health display. */
export interface GraphStats {
  activeNodes: number;
  archivedNodes: number;
  edges: number;
  avgConfidence: number;
  categories: Record<string, number>;
  contradictions: number;
  proceduralPatterns: number;
  crystallisedPatterns: number;
}

/** v3 contradiction pair for resolution UI. */
export interface ContradictionPair {
  nodeA: MemoryEntry;
  nodeB: MemoryEntry;
  similarity: number;
  edgeId: string;
}

/** v3 procedural pattern for the learned patterns display. */
export interface ProceduralPatternUI {
  id: string;
  taskType: string;
  toolSequence: string[];
  observationCount: number;
  confidence: number;
  crystallised: boolean;
  lastObservedAt: string;
}

export interface ConnectionStatus {
  github: boolean;
  email: boolean;
  slack: boolean;
  discord: boolean;
}

export interface DashboardSettings {
  language: string;
  permissionMode: 'strict' | 'balanced' | 'autonomous' | 'custom';
  categoryPermissions?: Record<string, string>;
  temperature: number;
  maxTokens: number;
  activeModel: string;
  autoMemory: boolean;
  memoryLocalOnly: boolean;
  contributeSharedLearning: boolean;
  streamResponses: boolean;
  /**
   * Loop-prevention master switch. When true (default), Ava runs a
   * verify_change pass against unverified file edits before declaring
   * a turn done; if the same failure recurs three times, an independent
   * fresh-eyes review fires once. Mirrors the VS Code setting
   * `ava-supernova.loopPrevention.enabled` — flipping in the dashboard
   * writes through to the same setting so the agent picks it up at
   * next session start.
   */
  loopPreventionEnabled: boolean;
}

export interface ProviderKeyStatus {
  anthropic: boolean;
  deepseek: boolean;
  kimi: boolean;
  glm: boolean;
  qwen: boolean;
  mistral: boolean;
  xiaomi: boolean;
  [key: string]: boolean;
}

export interface UsageLogEntry {
  id: string;
  model: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  timestamp: string;
}

export interface ConversationEntry {
  id: string;
  title: string | null;
  project_id: string | null;
  pinned: boolean;
  messages: { role: string; content: string }[];
  created_at: string;
  updated_at: string;
}

export interface SupportTicket {
  id: string;
  email: string;
  name: string | null;
  subject: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  category: 'bug' | 'feature' | 'question' | 'account' | 'feedback' | 'teach' | 'other';
  source: 'tool' | 'dashboard' | 'website';
  created_at: string;
  updated_at: string;
  support_messages: {
    id: string;
    sender_type: 'user' | 'admin';
    sender_name: string;
    body: string;
    created_at: string;
  }[];
}

// ── Live Support Conversation (new system) ────────────────────────────────
export interface SupportConversation {
  id: string;
  user_id: string;
  platform: string;
  status: 'active' | 'resolved' | 'closed';
  unread_user: number;
  unread_admin: number;
  needs_human: boolean;
  summary: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  user: { email: string; name: string | null; tier: string } | null;
  messageCount: number;
  lastMessage: {
    preview: string;
    senderType: 'user' | 'admin' | 'ava';
    isAva: boolean;
    timestamp: string;
  } | null;
}

export interface SupportConversationMessage {
  id: string;
  sender_type: 'user' | 'admin' | 'ava';
  sender_name: string;
  body: string;
  is_ava: boolean;
  read_at: string | null;
  created_at: string;
}

export interface SessionStats {
  messages: number;
  tool_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  model_breakdown: Array<{
    model: string;
    provider: string;
    requests: number;
    input_tokens: number;
    output_tokens: number;
  }>;
  session_start: string;
}

// ─── Task Management ─────────────────────────────────────────────────────────

export interface DashboardTaskEntry {
  id: string;
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'todo' | 'in-progress' | 'done' | 'archived' | 'blocked';
  due_date?: string;
  // Free-form — common presets exist but any custom label is valid.
  category: string;
  source: 'user' | 'ava';
  project: string;
  recurrence: 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly';
  subtasks: { id: string; title: string; done: boolean }[];
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

// ─── Journal Types ───────────────────────────────────────────────────────────

export type DashboardJournalAuthor = 'user' | 'ava';

export interface DashboardJournalEntry {
  id: string;
  author: DashboardJournalAuthor;
  kind: string;
  title?: string;
  content: string;
  mood?: number;
  tags?: string[];
  created_at: string;
  updated_at: string;
}

/** An entry annotated with its day — for month and search lists. */
export interface DashboardJournalMonthEntry extends DashboardJournalEntry {
  date: string;
}

export interface DashboardJournalDay {
  date: string;
  entries: DashboardJournalEntry[];
}

/** A journal entry kind (built-in or user-defined). */
export interface DashboardJournalKind {
  id: string;
  label: string;
  color: string;
  tracksMood: boolean;
  builtin: boolean;
}

export interface DashboardJournalDaySummary {
  date: string;
  count: number;
  authors: { user: boolean; ava: boolean };
  dominant_mood?: number;
  avg_mood?: number;
  // Legacy fields — kept so the existing mini-calendar dots keep working.
  has_user_entry: boolean;
  has_ava_entry: boolean;
  mood?: number;
}

export interface DashboardJournalSearchHit {
  date: string;
  entry_id: string;
  author: DashboardJournalAuthor;
  kind: string;
  title?: string;
  snippet: string;
}

// ─── Learning Types ─────────────────────────────────────────────────────────

export interface DashboardLessonStep {
  id: string;
  teach: string;
  interaction: {
    kind: 'choice' | 'free_text' | 'code' | 'predict';
    prompt: string;
    options?: string[];
    answer?: string;
    evaluation?: string;
    starter?: string;
  };
  feedback?: { correct: string; incorrect: string };
  status: string;
  attempts: number;
  last_attempt: string | null;
}

export interface DashboardLearningLesson {
  id: string;
  title: string;
  type: string;
  status: string;
  score: number | null;
  // Brilliant-style interactive steps — present when the lesson has been
  // authored in the new format; the player renders them as cards.
  steps?: DashboardLessonStep[];
}

export interface DashboardLearningModule {
  id: string;
  title: string;
  description: string | null;
  status: string;
  progress_percent: number;
  lessons: DashboardLearningLesson[];
}

export interface DashboardLearningCurriculum {
  id: string;
  title: string;
  description: string | null;
  subject: string;
  level: string;
  goal: string | null;
  estimated_hours: number | null;
  status: string;
  progress_percent: number;
  modules: DashboardLearningModule[];
  created_at: string;
  updated_at: string;
}

// ─── Learning Library Types ─────────────────────────────────────────────────

export interface LibraryPath {
  id: string;
  title: string;
  description: string | null;
  subject: string;
  level: string;
  tags: string[];
  goal: string | null;
  prerequisites: string | null;
  estimated_hours: number | null;
  learning_objectives: string[];
  target_audience: string | null;
  source: 'curated' | 'community';
  author_name: string | null;
  fork_count: number;
  completion_count: number;
  rating_sum: number;
  rating_count: number;
  average_rating: number | null;
  created_at: string;
  published_at: string | null;
}

export interface LibraryPathDetail extends LibraryPath {
  content: {
    modules: Array<{
      title: string;
      description?: string;
      lessons: Array<{
        title: string;
        type: string;
        difficulty?: string;
        content?: string;
      }>;
    }>;
  };
}

// ─── Library — Scientific Papers ────────────────────────────────────────────

export type PaperDiscipline =
  | 'ai_cs' | 'biology' | 'medicine' | 'physics' | 'chemistry'
  | 'earth_sciences' | 'social_sciences' | 'economics' | 'engineering'
  | 'math' | 'other';

export interface PaperAuthorRef {
  name: string;
  orcid?: string;
}

export interface LibraryPaper {
  /** Stored row UUID — present when the paper is in the curated set or
   *  was returned by the featured/trending/latest tabs. Undefined for
   *  live-search results coming back from OpenAlex via /api/papers/search. */
  id?: string;
  doi?: string;
  arxiv_id?: string;
  openalex_id?: string;
  title: string;
  authors: PaperAuthorRef[];
  abstract?: string;
  year?: number;
  primary_url?: string;
  oa_pdf_url?: string;
  discipline?: PaperDiscipline;
  source?: 'curated' | 'community' | 'auto' | 'arxiv' | 'openalex' | 'crossref';
  featured_note?: string;
  citation_count?: number;
  retracted?: boolean;
  signals?: {
    citation_count: number;
    citation_velocity_30d: number;
    hn_score: number;
    reddit_score: number;
    social_mentions_7d: number;
    computed_score: number;
  };
}

export type PapersTab = 'featured' | 'trending' | 'latest';

// ─── Health library ─────────────────────────────────────────────────────────
// Shape mirrors lib/health/types.ts on the platform. Kept inline here so the
// extension webview doesn't need to import platform code; the JSON payloads
// from /api/health/* deserialise straight into these.

export type HealthExerciseType =
  | 'compound' | 'isolation' | 'bodyweight' | 'plyometric'
  | 'mobility' | 'cardio' | 'isometric' | 'stretching' | 'breathing';

export type HealthWorkoutType =
  | 'strength' | 'hypertrophy' | 'conditioning' | 'mobility'
  | 'hybrid' | 'yoga' | 'pilates' | 'running' | 'cycling'
  | 'recovery' | 'hiit';

export type HealthMuscleRole = 'primary' | 'secondary';

export interface HealthExerciseRoutine {
  sets: number | string | null;
  reps_target: string | null;
  rest_seconds: number | null;
  tempo: string | null;
  frequency_per_week: string | null;
  progression: string | null;
}

export interface HealthExerciseSummary {
  id: string;
  slug: string;
  name: string;
  exercise_type: HealthExerciseType;
  workout_type: HealthWorkoutType;
  difficulty: number;
  /** Submission status — driven by the auth-aware list endpoint. The
   *  caller's own pending/rejected rows appear alongside public published
   *  rows; cards render a "pending review" badge when status !== 'published'. */
  status?: HealthSubmissionStatus;
  /** Resolved workout_type → image_url from workout_type_thumbnails.
   *  Null until the operator uploads a thumbnail for the workout_type. */
  thumbnail_url?: string | null;
}

export interface HealthMuscleTag {
  slug: string;
  name: string;
  category: string;
  role: HealthMuscleRole;
}

export interface HealthEquipmentTag {
  slug: string;
  name: string;
}

export interface HealthExerciseDetail extends HealthExerciseSummary {
  description: string | null;
  steps: string[];
  routine: HealthExerciseRoutine;
  beginner_detail: string | null;
  common_mistakes: string | null;
  demo_video_url: string | null;
  thumbnail_url: string | null;
  muscles: HealthMuscleTag[];
  equipment: HealthEquipmentTag[];
}

export type HealthRecipeSkillLevel = 'beginner' | 'intermediate' | 'expert';

export interface HealthRecipeSummary {
  id: string;
  slug: string;
  name: string;
  cuisine_name: string | null;
  origin_country: string | null;
  course: string | null;
  hero_image_url: string | null;
  /** Member of the curated "From Scratch" (`unprocessed`) collection — made
   *  entirely from fresh ingredients, nothing processed. Drives the badge. */
  from_scratch?: boolean;
  /** See HealthExerciseSummary.status — same auth-aware list behaviour. */
  status?: HealthSubmissionStatus;
}

export interface HealthRecipeIngredient {
  sort_order: number;
  quantity: number | null;
  unit: string | null;
  name: string;
  notes: string | null;
  optional: boolean;
}

export interface HealthRecipeStep {
  sort_order: number;
  action: string;
  notes: string | null;
  technique_term: string | null;
  time_estimate_seconds: number | null;
  tricky_flag: boolean;
}

export interface HealthRecipeEquipment {
  sort_order: number;
  name: string;
  notes: string | null;
  optional: boolean;
}

/** Per-serving nutrition for a recipe version — Ava-estimated on the
 *  platform from the ingredient list. `source` stays 'estimated' until
 *  an operator hand-verifies it in the Hub. All numeric fields optional;
 *  a recipe with no nutrition yet returns {}. */
export interface HealthRecipeNutrition {
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fibre_g?: number;
  sugar_g?: number;
  sodium_mg?: number;
  saturated_fat_g?: number;
  source?: 'estimated' | 'verified';
  generated_at?: string;
}

export interface HealthRecipeVersionDetail {
  level: HealthRecipeSkillLevel;
  description: string | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  total_time_minutes: number | null;
  default_servings: number | null;
  nutrition: HealthRecipeNutrition;
  steps: HealthRecipeStep[];
  dietary_flags: string[];
  diets: string[];
  equipment: HealthRecipeEquipment[];
}

export interface HealthRecipeStorage {
  keeps_fridge_days: number | null;
  keeps_freezer_months: number | null;
  from_frozen_notes: string | null;
}

export interface HealthRecipeDetail extends HealthRecipeSummary {
  overview: string | null;
  source_attribution: string | null;
  /** Storage / keeping info — may be absent on older API responses. */
  storage?: HealthRecipeStorage;
  ingredients: HealthRecipeIngredient[];
  versions: HealthRecipeVersionDetail[];
}

// ─── Submission flow (community contributions) ─────────────────────────────

export interface HealthTaxonomyAllergen {
  slug: string;
  name: string;
  severity_hint: string | null;
  sort_order: number;
}

export interface HealthTaxonomyContraindication {
  slug: string;
  name: string;
  category: string | null;
  severity_hint: string | null;
  sort_order: number;
}

export interface HealthTaxonomyCuisine {
  slug: string;
  name: string;
  region: string | null;
  sort_order: number;
}

export interface HealthTaxonomyDiet {
  slug: string;
  name: string;
  sort_order: number;
}

export interface HealthTaxonomyDietaryFlag {
  slug: string;
  name: string;
  sort_order: number;
}

/** Curated collection (Unprocessed, …) — the operator-driven filter axis. */
export interface HealthTaxonomyCollection {
  slug: string;
  name: string;
  description?: string | null;
  sort_order: number;
}

export interface HealthTaxonomies {
  allergens: HealthTaxonomyAllergen[];
  contraindications: HealthTaxonomyContraindication[];
  cuisines: HealthTaxonomyCuisine[];
  diets: HealthTaxonomyDiet[];
  dietary_flags: HealthTaxonomyDietaryFlag[];
  collections: HealthTaxonomyCollection[];
}

export type HealthSubmissionStatus = 'pending' | 'rejected' | 'published';

export interface HealthExerciseSubmissionPayload {
  name: string;
  exercise_type: HealthExerciseType;
  workout_type: HealthWorkoutType;
  difficulty: number;
  description: string | null;
  beginner_detail: string | null;
  common_mistakes: string | null;
  steps: string[];
  contraindication_slugs: string[];
}

export interface HealthRecipeVersionStepPayload {
  action: string;
  notes: string | null;
  technique_term: string | null;
  time_estimate_seconds: number | null;
  tricky_flag: boolean;
}

export interface HealthRecipeVersionEquipmentPayload {
  name: string;
  notes: string | null;
  optional: boolean;
}

export interface HealthRecipeVersionPayload {
  level: HealthRecipeSkillLevel;
  description: string | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  total_time_minutes: number | null;
  default_servings: number | null;
  steps: HealthRecipeVersionStepPayload[];
  equipment: HealthRecipeVersionEquipmentPayload[];
  diet_slugs: string[];
  dietary_flag_slugs: string[];
}

export interface HealthRecipeSubmissionPayload {
  name: string;
  cuisine_slug: string | null;
  course: string | null;
  origin_country: string | null;
  overview: string | null;
  ingredients: Array<{
    name: string;
    quantity: number | null;
    unit: string | null;
    optional: boolean;
    notes: string | null;
  }>;
  allergen_slugs: string[];
  /** Skill-level versions. Empty array = no versions persisted (operator
   *  composes them post-approval). Ava-drafted submissions produce 3
   *  versions (beginner / intermediate / expert); manual submissions
   *  produce 0-3 depending on what the submitter fills in. */
  versions: HealthRecipeVersionPayload[];
}

export interface HealthMySubmissionExercise {
  id: string;
  slug: string;
  name: string;
  status: HealthSubmissionStatus;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  exercise_type: string;
  workout_type: string;
}

export interface HealthMySubmissionRecipe {
  id: string;
  slug: string;
  name: string;
  status: HealthSubmissionStatus;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  course: string | null;
}

/**
 * Health Profile — the operator's body stats, goals, constraints,
 * and schedule. Drives the Health Dashboard's morning brief,
 * today's plan, and Ava's plan-generation logic.
 *
 * Local-first by default — stored in VSCode globalState, works
 * fully for BYOK / no-account users. Cloud sync is managed from
 * the existing Sync tab as a single `health_profile` category,
 * not from this profile shape — keeps sync concerns in one place
 * across the dashboard.
 */
export interface HealthProfile {
  schema_version: 1;
  updated_at: string | null;
  /** @deprecated Body basics moved to GeneralProfile (general.json) on
   *  2026-06-21 — they're identity facts reusable beyond health, not health
   *  choices. Kept optional so legacy profile.json files still parse and the
   *  one-time migration can seed GeneralProfile from them. New writes omit it;
   *  every read of body fields now goes through GeneralProfile. */
  body?: {
    sex: 'female' | 'male' | 'other' | null;
    date_of_birth: string | null; // ISO date — DOB stored so age stays accurate over time
    height_cm: number | null;
    weight_kg: number | null;
    body_fat_pct: number | null;
  };
  goals: {
    primary: 'fat_loss' | 'muscle_gain' | 'maintenance' | 'athletic' | 'recovery' | 'longevity' | null;
    weekly_focus: string | null; // free-text current focus, e.g. "deload week"
  };
  constraints: {
    allergens: string[];          // slugs from public.allergens
    dietary: string[];            // slugs from public.diets (vegan, gluten_free…)
    injuries: string[];           // free-text current limiting conditions
    equipment_available: string[]; // slugs from public.equipment
    minutes_per_day_target: number | null;
  };
  /** Food taste — steers meal plans toward what the user enjoys and away from
   *  what they don't. Distinct from `dietary` (rules) and `allergens` (hard
   *  avoid): likes/dislikes are soft, cuisines focus the global catalogue.
   *  Optional for legacy profiles written before this section existed. */
  food?: {
    likes: string[];     // free-text foods the user enjoys
    dislikes: string[];  // free-text foods to keep out of plans (soft)
    cuisines: string[];  // favourite cuisine slugs (italian, thai, korean…)
  };
  schedule: {
    training_window: { start: string | null; end: string | null }; // 24h "HH:MM"
    meal_times: { breakfast: string | null; lunch: string | null; dinner: string | null };
    sleep_target: { bedtime: string | null; wake: string | null };
    /** How long the user has to cook, set per day AND per meal — the data Ava
     *  needs to slot the right recipe into each real slot (a quick weekday
     *  breakfast, a longer weekend dinner). `by_day` keyed '0'–'6' (Sun–Sat);
     *  each day carries a tier per meal ('15'|'30'|'60'|'60+', null = Any).
     *  Optional so existing profiles stay valid; absent = no constraint. */
    cooking_time?: { by_day: Record<string, { breakfast: string | null; lunch: string | null; dinner: string | null }> };
  };
}

/**
 * General profile — identity + body basics, stored at ACCOUNT level
 * (<scopedDir>/general.json), separate from health so it's reusable beyond the
 * health surface. Split out of HealthProfile.body on 2026-06-21; the health
 * room + plans + morning brief read across both. See general-file-store.ts.
 */
export interface GeneralProfile {
  schema_version: 1;
  updated_at: string | null;
  display_name: string | null;   // optional override; falls back to the account name
  sex: 'female' | 'male' | 'other' | null;
  date_of_birth: string | null;  // ISO date — DOB stored so age stays accurate over time
  height_cm: number | null;
  weight_kg: number | null;
  body_fat_pct: number | null;
  units: 'metric' | 'imperial' | null;
}

/**
 * Daily Plan — what the Health Dashboard reads to render today.
 * One file per date at `<scopedDir>/health/daily-plans/{YYYY-MM-DD}.json`.
 * Lives on the same local-first file substrate as the profile.
 *
 * The plan is the integrated day — mobility / meals / workout /
 * wind-down on a single timeline. Items reference catalog rows
 * (exercise slug, recipe slug) when applicable so the dashboard
 * can drill in. Log captures completed activity for the day.
 */
export interface HealthDailyPlanItem {
  id: string;
  time: string;       // "HH:MM" 24h
  kind: 'mobility' | 'meal' | 'workout' | 'rest' | 'sleep' | 'note';
  title: string;
  detail?: string | null;
  /** Optional catalog reference so the timeline card can drill into
   *  the recipe / exercise / workout detail on click. */
  ref?: { kind: 'exercise' | 'recipe' | 'workout'; slug: string } | null;
  duration_minutes?: number | null;
  status: 'pending' | 'done' | 'skipped';
}

export interface HealthDailyLog {
  meals: Array<{ id: string; time: string; description: string | null; calories: number | null; protein_g: number | null }>;
  water_ml: number;
  sleep_hours: number | null;
  /** 1 = drained, 5 = thriving. */
  mood: 1 | 2 | 3 | 4 | 5 | null;
}

export interface HealthDailyPlan {
  schema_version: 1;
  date: string;                       // ISO YYYY-MM-DD
  morning_brief: string | null;       // Ava-authored paragraph for the top of the dashboard
  brief_reasoning: string | null;     // why-drawer content explaining any plan adjustments
  items: HealthDailyPlanItem[];
  log: HealthDailyLog;
  updated_at: string | null;
}

export interface HealthMySubmissions {
  exercises: HealthMySubmissionExercise[];
  recipes: HealthMySubmissionRecipe[];
}

/**
 * Multi-week Plan — a structured fitness / meal / combined program.
 *
 * Distinct from HealthDailyPlan: the Plan is the *program* (weeks of
 * training and/or meals); the daily plan is a single day. The active
 * Plan projects into the daily dashboard — Overview renders today's
 * slice of it.
 *
 * Stored local-first as files — `<scopedDir>/health/plans/{id}.json` per plan;
 * the library index is derived by listing that dir (no separate index file, so
 * it can't drift). On-device only.
 */
export type HealthPlanType = 'fitness' | 'meal' | 'combined';
export type HealthPlanSource = 'manual' | 'ava';
export type HealthPlanStatus = 'draft' | 'active' | 'completed' | 'archived';

/** A planned training exercise within a plan day. Links to a catalog
 *  exercise by slug, or stands alone as a custom entry (ref null). */
export interface HealthPlanExercise {
  id: string;
  ref?: { kind: 'exercise'; slug: string } | null;
  name: string;
  sets: number | null;
  reps: string | null;          // "8-12", "AMRAP", "30s" — free-form target
  weight: string | null;        // "bodyweight", "60kg", "RPE 7" — guidance
  rest_seconds: number | null;
  tempo: string | null;         // "3-1-1-0" or null
  notes: string | null;
}

/** A planned meal within a plan day.
 *
 *  Two kinds share this shape:
 *  - A catalog recipe (`ref` set): nutrition is NOT stored here — it is
 *    derived live from the recipe's per-serving nutrition × `servings`,
 *    so it stays correct if the recipe is later re-estimated. The
 *    calories/macros fields stay null for these.
 *  - A custom off-catalog meal (`ref` null): no recipe to derive from,
 *    so the operator enters calories/macros by hand and they are stored.
 *
 *  `servings` is how many recipe servings this meal is on the day — the
 *  one genuinely per-plan number for a catalog meal. */
export interface HealthPlanMeal {
  id: string;
  slot: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  ref?: { kind: 'recipe'; slug: string } | null;
  name: string;
  servings: number | null;       // recipe servings on this day; null for custom meals
  calories: number | null;       // custom meals only — derived for recipe meals
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  notes: string | null;
}

/** One day of a Plan. `day_index` locates it absolutely (1-based);
 *  the UI groups into weeks by ceil(day_index / 7). A combined plan's
 *  day carries both `training` and `meals`. */
export interface HealthPlanDay {
  day_index: number;            // 1-based absolute day within the plan
  kind: 'training' | 'rest' | 'active_recovery';
  title: string | null;        // "Upper body", "Long run", "Rest day"
  training: HealthPlanExercise[]; // empty on rest days / meal-only plans
  meals: HealthPlanMeal[];        // empty on fitness-only plans
  notes: string | null;
}

export interface HealthPlan {
  schema_version: 1;
  id: string;
  type: HealthPlanType;
  title: string;
  goal: string | null;          // free-text, e.g. "lose 4kg", "first 5k"
  source: HealthPlanSource;
  status: HealthPlanStatus;
  duration_days: number;        // 1 / 7 / 28 / 56 / 84 — the chosen preset
  start_date: string | null;    // ISO YYYY-MM-DD — null until activated
  /** Snapshot of the HealthProfile the plan was built against, so the
   *  plan stays coherent if the profile later changes. */
  profile_snapshot: HealthProfile | null;
  days: HealthPlanDay[];
  created_at: string;
  updated_at: string | null;
}

/** Lightweight summary for the Plans library grid — held in
 *  `ava.planIndex` so the card view skips loading every full plan. */
export interface HealthPlanSummary {
  id: string;
  type: HealthPlanType;
  title: string;
  status: HealthPlanStatus;
  duration_days: number;
  /** Plan start date (YYYY-MM-DD) so the Plans calendar can place it. */
  start_date: string | null;
  source: HealthPlanSource;
  updated_at: string | null;
}

// ─── Ava-assisted generation (community submission drafts) ─────────────────

export interface HealthGenerateExerciseIntake {
  prompt: string;
  goal?: string;
  equipment?: string;
  level?: string;
  /** When true, Ava picks a concept herself — empty prompt is allowed and
   *  the server switches to a creative-bias prompt that avoids names
   *  already in the catalog. */
  surprise?: boolean;
}

export interface HealthGenerateRecipeIntake {
  prompt: string;
  cuisine_hint?: string;
  course_hint?: string;
  dietary?: string;
  surprise?: boolean;
}

/** Draft returned by /api/health/generate/exercise — same shape as the
 *  manual submission payload so the form can be pre-filled from it. */
export interface HealthExerciseDraft {
  name: string;
  exercise_type: HealthExerciseType;
  workout_type: HealthWorkoutType;
  difficulty: number;
  description: string;
  beginner_detail: string;
  common_mistakes: string;
  steps: string[];
  contraindication_slugs: string[];
}

/** Draft returned by /api/health/generate/recipe — same shape as the
 *  manual submission payload (modulo `quantity: number | null` matching
 *  what the form's number input accepts). Includes the full per-skill-
 *  level versions structure so the review form can render every level. */
export interface HealthRecipeDraft {
  name: string;
  cuisine_slug: string | null;
  course: string | null;
  origin_country: string | null;
  overview: string;
  ingredients: Array<{
    name: string;
    quantity: number | null;
    unit: string | null;
    optional: boolean;
    notes: string | null;
  }>;
  allergen_slugs: string[];
  versions: HealthRecipeVersionPayload[];
}

// ─── Release Notes ──────────────────────────────────────────────────────────

// ─── Roadmap ────────────────────────────────────────────────────────────────
// Single source of truth on the platform DB; all surfaces fetch via
// /api/roadmap. Items grouped by theme; localized by the API based on
// the request locale (English fallback when no translation exists).

export interface RoadmapItem {
  id: string;
  label: string;
  shipped: boolean;
  sort_order: number;
}

export interface RoadmapTheme {
  id: string;
  slug: string;
  title: string;
  icon: string;
  color: string;
  color_bg: string;
  sort_order: number;
  items: RoadmapItem[];
}

export interface ReleaseNote {
  id: string;
  version: string;
  title: string;
  body: string;
  highlights: string[];
  tool_count: number;
  published_at: string;
}

// ─── Sync Types ─────────────────────────────────────────────────────────────

export interface SyncDataStatus {
  available: boolean;
  lastSynced: string | null;
  localCount: number;
  syncedCount: number;
  newCount: number;
}

export type SyncStatus = Record<string, SyncDataStatus>;

export interface PersonalityData {
  name: string;
  pronouns: string;
  tone: string;
  energy: string;
  style: string;
  description: string;
}

// ─── Usage Analytics Types ───────────────────────────────────────────────────

export interface UsageHistoryData {
  balance: { used: number; limit: number; tier: string } | null;
  daily: Array<{ date: string; tokens: number }>;
  sessions: Array<{ date: string; duration: string; messages: number; tokens: number; model: string; cost: number }>;
  monthTotal: number;
  lastMonthTotal: number;
  topModels: Array<{ model: string; tokens: number }>;
  avgPerSession: number;
  totalSessions: number;
}

export type Page = 'overview' | 'chat' | 'keys' | 'usage' | 'memory' | 'tasks' | 'journal' | 'learning' | 'learning-library' | 'creative-studio' | 'library' | 'health' | 'personality' | 'sync' | 'releases' | 'roadmap' | 'connections' | 'history' | 'support' | 'billing' | 'settings' | 'planner' | 'account' | 'models' | 'help' | 'documentation';

// ─── Chat UI Types ──────────────────────────────────────────────────────────

export type ProviderSource = 'platform' | 'byok';
export type AvaMode = 'code' | 'plan' | 'chat' | 'teach' | 'security' | 'brainstorm' | 'write' | 'health';

export interface ChatPlatformStatus {
  connected: boolean;
  tier: string | null;
  freeTokensUsed: number;
  freeTokensLimit: number;
  subTokensUsed: number;
  subTokensLimit: number | null;
}

export interface ToolCallDisplay {
  id: string;
  name: string;
  arguments: string;
  status: 'pending_confirmation' | 'running' | 'success' | 'failed';
  result?: string;
  /** Live output chunks streamed via tool_call_partial (bash stdout, file edit diff previews, etc). */
  partialOutput?: string;
  confirmationId?: string;
  summary?: string;
  isAskUser?: boolean;
  /** health_profile_ask — structured profile-field card payload (goal cards,
   *  chips, number box). The webview resolves the control from HEALTH_PROFILE_FIELDS. */
  profileField?: { field: string; question: string; currentValue?: unknown };
}

/**
 * A single event in an assistant message's chronological timeline.
 * See webview-ui types for full docs — same model, mirrored here because
 * dashboard-ui is a separate React app with its own type copy.
 */
export type MessageEvent =
  | { kind: 'thinking'; content: string }
  | { kind: 'text'; content: string }
  | { kind: 'tool_call'; toolCall: ToolCallDisplay };

export interface UIMessage {
  id: string;
  role: 'user' | 'assistant' | 'error' | 'system';
  content: string;
  thinking?: string;
  images?: string[];
  toolCalls: ToolCallDisplay[];
  /**
   * Canonical chronological timeline for assistant messages.
   * When present, MessageBubble renders this instead of the legacy
   * content/thinking/toolCalls fields. One assistant UIMessage per user
   * turn; events accumulate as the agent streams through think → tool →
   * text → think → ... within a single turn.
   */
  events?: MessageEvent[];
  isStreaming: boolean;
  errorCode?: string;
  errorSuggestion?: string;
  timestamp?: number;
  rating?: 'up' | 'down';
  ratingReason?: string;
}

export interface MemoryEntryUI {
  id: string;
  category: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  lastRecalledAt: string | null;
  recallCount: number;
  tags?: string[];
  archived?: boolean;
  archivedAt?: string | null;
  branch?: string | null;
}

export interface TaskSubtaskUI {
  id: string;
  title: string;
  done: boolean;
}

export interface TaskContextUI {
  kind: 'chat' | 'file' | 'plan' | 'lesson' | 'other';
  ref: string;
  label?: string;
}

export interface TodayTaskUI {
  id: string;
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'todo' | 'in-progress' | 'done';
  dueDate?: string;
  dueTime?: string;
  category: string;
  recurrence?: 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly';
  reminderLead?: number;
  subtasks?: TaskSubtaskUI[];
  context?: TaskContextUI;
}

export interface SessionTaskUI {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface AvaCompletedTaskUI {
  id: string;
  title: string;
  completedAt: string;
}

export interface ChatModel {
  id: string;
  name: string;
  provider: string;
  supportsVision?: boolean;
  available: boolean;
}

export interface ChatState {
  messages: UIMessage[];
  /** ID of the assistant bubble currently being built in the active turn. Cleared on done/error/user_message_ack. */
  currentAssistantId: string | null;
  models: ChatModel[];
  activeModel: string | null;
  isStreaming: boolean;
  isThinking: boolean;
  needsSetup: boolean;
  initialized: boolean;
  /**
   * First-load gates for the dashboard chat surface. Mirror of the
   * webview-ui flags (see message-types.ts). Both default true on a
   * platform-key session; flipped false when chat_platform_status /
   * history_list arrive, so the chat area can render a spinner
   * takeover instead of an empty/broken-looking conversation list
   * during the initial fetch.
   */
  accountLoading: boolean;
  historyLoading: boolean;
  lastUsage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost?: number;
    contextWindow?: number;
  } | null;
  contextUsage: { used: number; limit: number; percent: number } | null;
  isCompressing: boolean;
  historyOpen: boolean;
  historyList: Array<{ id: string; title: string; updatedAt: string; pinned?: boolean }>;
  currentConversationId: string | null;
  /** Title of the loaded conversation — surfaced as a chip next to the
   *  model picker in the chat header (mirrors IDE chat). null while a
   *  fresh chat is in progress. */
  conversationTitle: string | null;
  providerSource: ProviderSource;
  platformStatus: {
    connected: boolean;
    tier: string | null;
    freeTokensUsed: number;
    freeTokensLimit: number;
    subTokensUsed: number;
    subTokensLimit: number | null;
  } | null;
  memoryOpen: boolean;
  memoryGlobal: MemoryEntryUI[];
  memoryProject: MemoryEntryUI[];
  tasksOpen: boolean;
  todayTasks: TodayTaskUI[];
  allTasks: TodayTaskUI[];
  sessionTasks: SessionTaskUI[];
  avaCompletedTasks: AvaCompletedTaskUI[];
  tasksPanelWidth: number;
  sessionCredits: number;
  conductorActive: boolean;
  conductorMode?: string | null;
  activePersonas: Array<{
    id: string;
    phase: 'active' | 'complete' | 'error';
    description?: string;
    output?: string;
    tools?: Array<{ name: string; done: boolean; success?: boolean }>;
  }>;
}

// Library (project files — images, documents, spreadsheets)
export type LibraryFileType = 'image' | 'document' | 'spreadsheet' | 'audio' | 'video';

export interface LibraryImage {
  path: string;         // Relative path from project root (e.g. "images/icons/settings.png")
  name: string;         // Filename
  folder: string;       // Parent folder (e.g. "images/icons")
  size: number;         // File size in bytes
  modified: string;     // ISO date string
  dimensions?: string;  // "1024x1024" if detectable
  fileType?: LibraryFileType;  // File category (defaults to 'image' for backwards compat)
  /** Legacy base64 data URI — retained for backwards-compat with
   *  in-flight library_loaded messages from older host versions. New
   *  hosts emit `webviewUri` instead, which streams from disk instead
   *  of bundling the bytes inline. */
  dataUri?: string;
  /** vscode-webview-resource:// URL produced by webview.asWebviewUri().
   *  Streams local files from disk; no size cap, no base64 overhead.
   *  Works for video, large audio, large images. Prefer this over
   *  dataUri when present. */
  webviewUri?: string;
}

/** Cloud-synced creative asset row returned by /api/creative-assets GET.
 *  Shape matches the select in packages/web/src/app/api/creative-assets/route.ts. */
export interface CreativeAsset {
  id: string;
  type?: string;            // legacy column, historical values ('image' | 'post' | etc.)
  asset_type?: string;      // newer column, matches ALLOWED_ASSET_TYPES on the server
  title?: string | null;
  prompt?: string | null;
  url?: string | null;         // public storage URL
  thumbnail_url?: string | null;
  source?: string | null;      // e.g. "Creative Studio", "Chat"
  created_at: string;
}

// ─── Extension Host → Dashboard Webview ──────────────────────────────────────

export type ExtToDashboardMessage =
  | {
      type: 'init';
      account: AccountInfo | null;
      connections: ConnectionStatus;
      settings: DashboardSettings;
      providerKeys: ProviderKeyStatus;
      locale: string;
      /** Present when the user has a platform key saved — lets the dashboard show signed-in state at boot. */
      platformKey?: string;
      /** Persisted Platform/API-Key routing choice, so the NavSidebar toggle
       *  renders the host's actual source on load instead of guessing. */
      providerSource?: 'platform' | 'byok';
      /** Render the welcome overlay on this init (gated by the "show welcome on
       *  startup" preference). Shown for everyone, signed in or not. */
      showWelcome?: boolean;
      /** Current value of the "show welcome on startup" preference. */
      welcomeOnStartup?: boolean;
    }
  | { type: 'show_welcome' }
  | { type: 'account_updated'; account: AccountInfo | null }
  | { type: 'dataset:config'; config: {
      enabled: boolean;
      capture_modes: string[];
      capture_datasets: string[];
      redact_patterns: string[];
      min_trajectory_length: number;
    } }
  | { type: 'provider_keys_updated'; providerKeys: ProviderKeyStatus }
  // Round-trip for the Local / custom OpenAI-compatible provider settings.
  // baseUrl + modelName empty == not configured. hasApiKey is a boolean
  // (don't echo the raw key back to the webview — the dashboard renders
  // bullets to indicate "configured" without exposing the value).
  | { type: 'local_model_loaded'; baseUrl: string; modelName: string; hasApiKey: boolean; modelLabel: string; models: string[] }
  | { type: 'local_models_detected'; models: string[]; error?: string }
  | { type: 'sync_prefs_loaded'; prefs: Record<string, boolean> }
  | { type: 'memories_loaded'; memories: MemoryEntry[]; total?: number; hasMore?: boolean }
  | { type: 'memories_more_loaded'; memories: MemoryEntry[]; total?: number; hasMore?: boolean }
  | { type: 'memory_deleted'; id: string }
  | { type: 'memory_upserted'; memory: MemoryEntry }
  | { type: 'connection_tested'; service: string; success: boolean; message: string }
  | { type: 'connection_saved'; service: string }
  | { type: 'connection_removed'; service: string }
  | { type: 'usage_logs_loaded'; logs: UsageLogEntry[] }
  | { type: 'conversations_loaded'; conversations: ConversationEntry[] }
  | { type: 'conversation_deleted'; id: string }
  | { type: 'conversation_pinned'; id: string; pinned: boolean }
  | { type: 'tickets_loaded'; tickets: SupportTicket[] }
  | { type: 'ticket_created'; ticket: SupportTicket }
  | { type: 'ticket_reply_sent'; ticketId: string }
  // BYOK messages
  | { type: 'local_memories_loaded'; memories: MemoryEntry[] }
  | { type: 'local_memory_deleted'; id: string }
  | { type: 'local_memory_upserted'; memory: MemoryEntry }
  | { type: 'session_stats_loaded'; stats: SessionStats }
  | { type: 'usage_history_loaded'; data: UsageHistoryData | null }
  | { type: 'byok_support_sent'; success: boolean; message: string }
  // Live chat support responses
  | { type: 'support_conversations_loaded'; conversations: any[] }
  | { type: 'support_messages_loaded'; conversationId: string; messages: any[] }
  | { type: 'support_conversation_started'; conversation: any }
  | { type: 'support_message_sent'; conversationId: string; message: any }
  | { type: 'support_chat_cleared' }
  | { type: 'support_unread_count'; count: number }
  // Task messages
  | { type: 'tasks_loaded'; tasks: DashboardTaskEntry[] }
  | { type: 'task_upserted'; task: DashboardTaskEntry }
  | { type: 'task_deleted'; id: string }
  // Journal messages
  | { type: 'journal_day_loaded'; day: DashboardJournalDay }
  | { type: 'journal_month_loaded'; year: number; month: number; entries: DashboardJournalMonthEntry[] }
  | { type: 'journal_year_summaries'; year: number; summaries: DashboardJournalDaySummary[] }
  | { type: 'journal_summaries_loaded'; summaries: DashboardJournalDaySummary[] }
  | { type: 'journal_search_results'; query: string; hits: DashboardJournalSearchHit[] }
  | { type: 'journal_kinds_loaded'; kinds: DashboardJournalKind[] }
  | { type: 'journal_changed'; date: string }
  // Session tasks (Ava's progress)
  | { type: 'session_tasks_updated'; tasks: Array<{ id: string; title: string; status: 'pending' | 'in_progress' | 'completed' }> }
  // Learning messages
  | { type: 'learning_loaded'; curriculums: DashboardLearningCurriculum[] }
  | { type: 'curriculum_deleted'; id: string }
  // Learning Library messages
  | { type: 'library_paths_loaded'; paths: LibraryPath[]; total: number }
  | { type: 'papers_loaded'; tab: PapersTab; papers: LibraryPaper[] }
  | { type: 'papers_search_results'; query: string; papers: LibraryPaper[]; total: number }
  | { type: 'paper_detail_loaded'; paper: LibraryPaper | null }
  // Health library — exercises + recipes browse (paginated; total
  // is the count of ALL visible rows so the webview can render
  // prev/next + page count, even though it only renders the slice it
  // received in the `exercises` / `recipes` field).
  // `error` is set when the host's platform fetch failed (network /
  // timeout) — distinct from a genuinely empty list. The webview shows
  // a "Couldn't load — Retry" state instead of "No exercises match".
  | { type: 'health_exercises_loaded'; exercises: HealthExerciseSummary[]; total: number; offset: number; seq?: number; error?: boolean }
  | { type: 'health_recipes_loaded'; recipes: HealthRecipeSummary[]; total: number; offset: number; seq?: number; error?: boolean }
  | { type: 'health_exercise_detail_loaded'; exercise: HealthExerciseDetail | null }
  | { type: 'health_recipe_detail_loaded'; recipe: HealthRecipeDetail | null }
  // Health submission flow (community contributions)
  | { type: 'health_taxonomies_loaded'; taxonomies: HealthTaxonomies }
  | { type: 'health_submission_result'; kind: 'exercise' | 'recipe'; ok: boolean; error?: string; submission?: { id: string; slug: string; name: string; status: HealthSubmissionStatus } }
  | { type: 'health_my_submissions_loaded'; data: HealthMySubmissions }
  | { type: 'health_my_submissions_cleared'; ok: boolean; exercises_cleared?: number; recipes_cleared?: number; error?: string }
  | { type: 'health_profile_loaded'; profile: HealthProfile }
  | { type: 'health_profile_saved'; profile: HealthProfile }
  | { type: 'general_profile_loaded'; profile: GeneralProfile | null }
  | { type: 'general_profile_saved'; profile: GeneralProfile }
  | { type: 'health_daily_plan_loaded'; plan: HealthDailyPlan }
  | { type: 'health_daily_plan_saved'; plan: HealthDailyPlan }
  // Multi-week Plans — library summaries + a single full plan.
  | { type: 'health_plans_loaded'; plans: HealthPlanSummary[] }
  | { type: 'health_plan_loaded'; plan: HealthPlan | null }
  | { type: 'active_health_plans_loaded'; plans: HealthPlan[] }
  | { type: 'health_plan_saved'; plan: HealthPlan; plans: HealthPlanSummary[] }
  | { type: 'health_plan_deleted'; id: string; plans: HealthPlanSummary[] }
  // Catalog search for the plan editor's "+ Add" picker — separate from
  // the Health page's grid state so the two never collide. `seq` drops
  // stale responses when the user types faster than the network.
  | { type: 'plan_exercises_searched'; exercises: HealthExerciseSummary[]; total: number; seq: number }
  | { type: 'plan_recipes_searched'; recipes: HealthRecipeSummary[]; total: number; seq: number }
  // Plan picker — full detail for a picked exercise / recipe, keyed by
  // slug. Exercise detail carries the routine the builder pre-fills;
  // recipe detail carries the per-version nutrition meals derive from.
  | { type: 'plan_exercise_detail_loaded'; slug: string; exercise: HealthExerciseDetail | null }
  | { type: 'plan_recipe_detail_loaded'; slug: string; recipe: HealthRecipeDetail | null }
  | { type: 'health_morning_brief_generated'; ok: boolean; brief?: string; error?: string }
  | { type: 'health_exercise_draft_generated'; ok: boolean; error?: string; draft?: HealthExerciseDraft }
  | { type: 'health_recipe_draft_generated'; ok: boolean; error?: string; draft?: HealthRecipeDraft }
  | { type: 'roadmap_loaded'; themes: RoadmapTheme[] }
  | { type: 'library_path_detail_loaded'; path: LibraryPathDetail }
  | { type: 'library_path_forked'; curriculumId: string; title: string }
  | { type: 'library_path_published'; pathId: string; status: string; message: string }
  | { type: 'library_path_rated'; pathId: string; rating: number }
  | { type: 'task_dates_loaded'; dates: string[] }
  // Avatar messages
  | { type: 'avatar_loaded'; dataUrl: string }
  | { type: 'avatar_saved'; dataUrl: string }
  | { type: 'avatar_removed' }
  // Sync messages
  | { type: 'sync_status'; data: SyncStatus }
  | { type: 'sync_started'; dataType: string }
  | { type: 'sync_completed'; dataType: string; count: number }
  | { type: 'sync_error'; dataType: string; message: string }
  // Release notes
  | { type: 'releases_loaded'; releases: ReleaseNote[] }
  // Library
  | { type: 'library_loaded'; images: LibraryImage[]; projectRoot: string; hasFolder?: boolean }
  | { type: 'library_image_deleted'; path: string }
  | { type: 'cloud_assets_loaded'; assets: CreativeAsset[] }
  | { type: 'local_creative_loaded'; assets: CreativeAsset[] }
  | { type: 'cloud_assets_error'; message: string }
  | { type: 'cloud_asset_deleted'; id: string }
  // Personality
  | { type: 'personality_loaded'; personality: PersonalityData }
  | { type: 'personality_saved' }
  | { type: 'personality_reset'; personality: PersonalityData }
  // Overview widget data
  | { type: 'weather_loaded'; data: { location: string; temp_c: number; condition: string; emoji: string; humidity: number; wind_kmph: number; forecast: Array<{ date: string; day: string; max_c: number; min_c: number; condition: string; emoji: string }> } | null }
  | { type: 'news_loaded'; articles: Array<{ title: string; category: string; reading_time: number; slug: string; date: string; image_url?: string | null }> }
  | { type: 'news_article_loaded'; post: Record<string, unknown> | null; related: Array<Record<string, unknown>>; loading?: boolean }
  | { type: 'latest_release_loaded'; release: { version: string; title: string; published_at: string } | null }
  | { type: 'error'; message: string }
  | { type: 'info'; message: string }
  // v3 Memory graph dashboard data
  | { type: 'graph_stats'; scope: string; stats: { activeNodes: number; archivedNodes: number; edges: number; avgConfidence: number; categories: Record<string, number>; contradictions: number; proceduralPatterns: number; crystallisedPatterns: number } }
  | { type: 'contradictions_loaded'; contradictions: Array<{ nodeA: any; nodeB: any; similarity: number; edgeId: string }> }
  | { type: 'patterns_loaded'; patterns: Array<{ id: string; taskType: string; toolSequence: string[]; observationCount: number; confidence: number; crystallised: boolean; lastObservedAt: string }> }
  | { type: 'project_brain_loaded'; brain: { brief: string; stack: string[]; keyDecisions: string[]; confidenceAvg: number; nodeCount: number; lastSessionDate: string } | null }
  // OAuth sign-in flow (v0.37.0) — same events as chat webview, routed to
  // the dashboard ConnectAccount screen via AvaViewProvider's externalPostMessage.
  | { type: 'sign_in_started' }
  | {
      type: 'sign_in_complete';
      account: { id: string; email?: string; name?: string; avatar_url?: string; tier?: string };
    }
  | { type: 'sign_in_failed'; error: string }
  | { type: 'sign_in_cancelled' }
  // ── Chat messages (Extension → Chat page) ───────────────────────────────
  | { type: 'chat_init'; models: ChatModel[]; activeModel: string | null; needsSetup: boolean; locale?: string; localeStrings?: Record<string, string>; providerSource?: ProviderSource; platformStatus?: ChatPlatformStatus }
  | ({ type: 'chat_platform_status' } & ChatPlatformStatus)
  | { type: 'user_message_ack'; text: string; images?: string[] }
  | { type: 'stream_start' }
  | { type: 'thinking_delta'; content: string }
  | { type: 'stream_delta'; content: string }
  | { type: 'stream_end' }
  | { type: 'tool_call_start'; toolCall: { id: string; name: string; arguments: string } }
  | { type: 'tool_call_end'; toolCallId: string; result: string; success: boolean }
  | { type: 'tool_confirmation_request'; confirmationId: string; toolCallId?: string; toolName: string; toolCategory?: string; args: Record<string, unknown>; summary: string; isAskUser?: boolean; profileField?: { field: string; question: string; currentValue?: unknown } }
  | { type: 'category_permissions'; permissions: Record<string, string>; mode: string }
  | { type: 'audit_log'; entries: Array<{ timestamp: string; toolName: string; category: string; riskLevel: string; approvalMethod: string; status: string; argsSummary: string; fullArgs?: Record<string, unknown>; result?: string }> }
  | { type: 'usage'; usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number; cached_tokens?: number }; cost?: number; contextWindow?: number; credits?: number }
  | { type: 'done' }
  | { type: 'model_switched'; modelId: string; modelName: string }
  | { type: 'history_list'; conversations: Array<{ id: string; title: string; updatedAt: string; pinned?: boolean }> }
  | { type: 'history_search_results'; conversations: Array<{ id: string; title: string; updatedAt: string; pinned?: boolean }> }
  | { type: 'conversation_loaded'; conversationId: string; title: string; messages: Array<{ role: 'user' | 'assistant'; content: string }> }
  | { type: 'chat_cleared' }
  | { type: 'cloud_sync_changed'; enabled: boolean }
  | { type: 'context_usage'; used: number; limit: number; percent: number }
  | { type: 'compression_start' }
  | { type: 'compression_end'; originalTokens: number; compressedTokens: number }
  | { type: 'memory_content'; global: MemoryEntryUI[]; project: MemoryEntryUI[] }
  | { type: 'system_message'; content: string }
  | { type: 'ping' }
  | { type: 'focus_input' }
  | { type: 'interjection_ack'; content: string }
  | { type: 'today_tasks'; tasks: TodayTaskUI[] }
  | { type: 'all_tasks'; tasks: TodayTaskUI[] }
  | { type: 'session_tasks'; tasks: SessionTaskUI[] }
  | { type: 'ava_completed_tasks'; tasks: AvaCompletedTaskUI[] }
  | { type: 'conductor_status'; active: boolean; mode?: string }
  | { type: 'persona_status'; persona: string; phase: 'active' | 'complete' | 'error'; description?: string; output?: string; error?: string }
  | { type: 'persona_tool_call'; persona: string; tool: string }
  | { type: 'persona_tool_result'; persona: string; tool: string; success: boolean }
  | { type: 'briefing'; text: string; todayTasks: number; overdueTasks: number; totalActive: number }
  | { type: 'data_exported'; dataType: string; content: string; filename: string }
  | { type: 'data_imported'; dataType: string; count: number }
  // Encrypted backup / restore results (data sovereignty).
  | { type: 'backup_done'; ok: boolean; message?: string }
  | { type: 'backup_imported'; ok: boolean; written?: number; skipped?: number; message?: string }
  // Chat streaming — partial tool output chunks during execution
  | { type: 'tool_call_partial'; toolCallId: string; data: string }
  // Agent-generated creative asset landed in the user's library
  | {
      type: 'creative_asset_created';
      asset: {
        type: string;
        path: string;
        absolutePath: string;
        prompt: string;
        size: number;
        dataUri?: string;
      };
    }
  // Host replies to import_pick_files with the user's selection (name + content).
  | {
      type: 'import_files_picked';
      files: Array<{ name: string; content: string; size: number }>;
    }
  // Creative generation result streamed from the host (handleCreativeGenerate).
  | {
      type: 'creative_result';
      success: boolean;
      error?: string;
      data?: unknown;
      // Dataset link: the generation_complete event_id (shape-only capture).
      // The webview stores this on the gallery item so a later kept/retried/
      // discarded action can reference this exact generation. Null if capture
      // is off or the generation failed.
      completeEventId?: string | null;
    };

// ─── Dashboard Webview → Extension Host ──────────────────────────────────────

export type DashboardToExtMessage =
  | { type: 'webview_ready' }
  | { type: 'set_welcome_on_startup'; enabled: boolean }
  | { type: 'connect_account'; key: string }
  | { type: 'disconnect_account' }
  | { type: 'skip_account' }
  // OAuth sign-in flow (v0.37.0) — dashboard-side versions of the same
  // messages the chat webview uses. Routed through DashboardPanel.handleMessage
  // which delegates to AvaViewProvider's SignInManager.
  | { type: 'start_sign_in'; method: 'github' | 'email' }
  | { type: 'cancel_sign_in' }
  | { type: 'save_provider_key'; provider: string; apiKey: string }
  | { type: 'remove_provider_key'; provider: string }
  // Local / custom OpenAI-compatible provider — Ollama, LM Studio, vLLM.
  // baseUrl + modelName are the required fields; apiKey + modelLabel
  // are optional. Empty / missing string clears the value.
  | { type: 'save_local_model'; baseUrl: string; modelName: string; apiKey?: string; modelLabel?: string; models?: string[] }
  | { type: 'remove_local_model' }
  | { type: 'load_local_model' }
  | { type: 'detect_local_models'; baseUrl: string; apiKey?: string }
  | { type: 'load_memories' }
  | { type: 'load_more_memories' }
  | { type: 'delete_memory'; id: string }
  | { type: 'upsert_memory'; id?: string; scope?: 'global' | 'project'; key?: string; content: string; category?: string | null }
  | { type: 'archive_memory'; id: string }
  | { type: 'restore_memory'; id: string }
  | { type: 'save_connection'; service: 'github' | 'email' | 'slack' | 'discord'; credentials: Record<string, string> }
  | { type: 'remove_connection'; service: string }
  | { type: 'test_connection'; service: string }
  | { type: 'load_usage_logs'; period: '7d' | '30d' | 'all' }
  | { type: 'open_checkout'; plan: 'pro' | 'ultra' }
  | { type: 'open_topup'; package: 'starter' | 'standard' | 'pro_pack' }
  | { type: 'open_portal' }
  | { type: 'save_settings'; settings: DashboardSettings }
  | { type: 'open_chat' }
  // Dataset capture (Ava action capture) — own granular schema in
  // ~/.ava/datasets/config.json. See packages/core/src/dataset/config.ts.
  | { type: 'dataset:get_config' }
  | { type: 'dataset:set_config'; config: {
      enabled: boolean;
      capture_modes: string[];
      capture_datasets: string[];
      redact_patterns: string[];
      min_trajectory_length: number;
    } }
  | { type: 'open_url'; url: string }
  | { type: 'update_name'; name: string }
  | { type: 'refresh_account' }
  | { type: 'refresh_storage' }
  // User toggled Cloud sync in the chat header. Data is always saved
  // locally; this only controls whether a copy also goes to the cloud.
  // Host persists the boolean and every cloud-write path checks
  // cloudSyncEnabled() before pushing.
  | { type: 'set_cloud_sync'; enabled: boolean }
  // Cloud-data wipes. Each posts to the corresponding /api/<category>/all
  // DELETE endpoint on the platform, then pushes a refreshed account
  // snapshot so storage totals reflect the drop.
  | { type: 'delete_all_cloud_conversations' }
  | { type: 'delete_all_cloud_tasks' }
  | { type: 'delete_all_cloud_journal' }
  | { type: 'delete_all_cloud_creative' }
  | { type: 'load_conversations' }
  /** Load a saved chat conversation into the chat panel. Sent from the
   *  dashboard's History → Conversations tab. The host forwards to the
   *  chat webview which restores the message thread. Mirrors the IDE's
   *  ava-ide-load-conversation localStorage signal at DashboardPages.tsx:6002. */
  | { type: 'load_conversation'; id: string }
  | { type: 'delete_conversation'; id: string }
  | { type: 'toggle_pin_conversation'; id: string }
  | { type: 'load_tickets' }
  | { type: 'create_support_ticket'; subject: string; message: string; category?: string }
  | { type: 'reply_support_ticket'; ticketId: string; message: string }
  // Live chat support
  | { type: 'start_support_conversation'; message: string; category?: string | null }
  | { type: 'send_support_message'; conversationId: string; message: string }
  | { type: 'load_support_conversations' }
  | { type: 'load_support_messages'; conversationId: string }
  | { type: 'mark_support_read'; conversationId: string }
  | { type: 'clear_support_chat' }
  // BYOK messages
  | { type: 'load_local_memories' }
  | { type: 'delete_local_memory'; id: string }
  | { type: 'upsert_local_memory'; id?: string; content: string; category?: string | null }
  | { type: 'archive_local_memory'; id: string }
  | { type: 'restore_local_memory'; id: string }
  | { type: 'load_session_stats' }
  | { type: 'load_usage_history' }
  | { type: 'send_byok_support'; email: string; subject: string; message: string; category?: string }
  | { type: 'set_working_hours'; start: number; end: number }
  | { type: 'download_asset'; path: string }
  | { type: 'delete_all_memories' }
  | { type: 'delete_all_local_memories' }
  // Task messages
  | { type: 'load_tasks' }
  | { type: 'create_task'; title: string; description?: string; priority?: string; category?: string; due_date?: string; recurrence?: string }
  | { type: 'update_task'; id: string; title?: string; description?: string; priority?: string; status?: string; category?: string; due_date?: string; recurrence?: string; subtasks?: { id: string; title: string; done: boolean }[] }
  | { type: 'delete_task'; id: string }
  | { type: 'complete_task'; id: string }
  | { type: 'archive_task'; id: string }
  | { type: 'restore_task'; id: string }
  // Journal messages
  | { type: 'load_journal_day'; date: string }
  | { type: 'load_journal_month'; year: number; month: number }
  | { type: 'load_journal_year'; year: number }
  | { type: 'load_journal_summaries'; from: string; to: string }
  | { type: 'load_journal_kinds' }
  | { type: 'journal_add_entry'; date: string; author: DashboardJournalAuthor; kind: string; content: string; title?: string; mood?: number; tags?: string[] }
  | { type: 'journal_update_entry'; date: string; id: string; kind?: string; title?: string; content?: string; mood?: number | null; tags?: string[] }
  | { type: 'journal_delete_entry'; date: string; id: string }
  | { type: 'journal_search'; query: string; kind?: string; author?: DashboardJournalAuthor; from?: string; to?: string }
  | { type: 'journal_add_kind'; id: string; label: string; color: string; tracksMood: boolean }
  | { type: 'journal_update_kind'; id: string; label?: string; color?: string; tracksMood?: boolean }
  | { type: 'journal_delete_kind'; id: string }
  // Session tasks (Ava's progress)
  | { type: 'load_session_tasks' }
  // Learning messages
  | { type: 'load_learning' }
  | { type: 'delete_curriculum'; id: string }
  // Interactive lesson player → persist progress back to the learning store
  | { type: 'learning_step_progress'; curriculumId: string; lessonId: string; stepId: string; status: 'attempted' | 'mastered'; lastAttempt: string | null }
  | { type: 'learning_lesson_complete'; curriculumId: string; lessonId: string; score: number }
  // Learning Library messages
  | { type: 'load_library_paths'; search?: string; subject?: string; level?: string; sort?: string }
  | { type: 'load_library_path_detail'; id: string }
  | { type: 'fork_library_path'; id: string }
  | { type: 'publish_to_library'; curriculumId: string }
  | { type: 'rate_library_path'; id: string; rating: number }
  // Library → Papers
  | { type: 'load_papers'; tab: PapersTab; discipline?: PaperDiscipline; limit?: number }
  | { type: 'search_papers'; query: string; discipline?: PaperDiscipline; sort?: 'relevance' | 'date' | 'cited' }
  | { type: 'load_paper_detail'; id: string }
  | { type: 'read_paper_with_ava'; paper: LibraryPaper }
  // Health library — operator wants exercises + recipes browse on the
  // extension surface. Plans/personalised content land in a later pass.
  // limit + offset are optional; the host defaults to limit=24 offset=0
  // if either is missing.
  | { type: 'load_health_exercises'; limit?: number; offset?: number; workoutType?: string; q?: string; seq?: number; locale?: string }
  | { type: 'load_health_recipes'; limit?: number; offset?: number; course?: string; collection?: string; q?: string; seq?: number; locale?: string; collections?: string[]; diets?: string[]; flags?: string[]; cuisines?: string[]; maxTime?: number; sort?: 'name' }
  | { type: 'load_health_exercise_detail'; slug: string; locale?: string }
  | { type: 'load_health_recipe_detail'; slug: string; locale?: string }
  | { type: 'load_health_taxonomies' }
  | { type: 'submit_health_exercise'; payload: HealthExerciseSubmissionPayload }
  | { type: 'submit_health_recipe'; payload: HealthRecipeSubmissionPayload }
  | { type: 'load_my_health_submissions' }
  | { type: 'clear_my_rejected_health_submissions' }
  | { type: 'load_health_profile' }
  | { type: 'save_health_profile'; profile: HealthProfile }
  | { type: 'load_general_profile' }
  | { type: 'save_general_profile'; profile: GeneralProfile }
  | { type: 'load_health_daily_plan'; date: string }
  | { type: 'save_health_daily_plan'; plan: HealthDailyPlan }
  // Multi-week Plans — library list, single load, save (upsert), delete.
  | { type: 'load_health_plans' }
  | { type: 'load_health_plan'; id: string }
  | { type: 'load_active_health_plans' }
  | { type: 'save_health_plan'; plan: HealthPlan }
  | { type: 'delete_health_plan'; id: string }
  // Catalog search for the plan editor's "+ Add" picker.
  | { type: 'search_plan_exercises'; q: string; offset?: number; workoutType?: string; seq: number }
  | { type: 'search_plan_recipes'; q: string; offset?: number; course?: string; seq: number }
  | { type: 'load_plan_exercise_detail'; slug: string }
  | { type: 'load_plan_recipe_detail'; slug: string }
  | { type: 'generate_health_morning_brief'; date: string }
  | { type: 'generate_health_exercise_draft'; intake: HealthGenerateExerciseIntake }
  | { type: 'generate_health_recipe_draft'; intake: HealthGenerateRecipeIntake }
  | { type: 'load_roadmap' }
  | { type: 'load_task_dates' }
  // Sync messages
  | { type: 'load_sync_status' }
  | { type: 'load_sync_prefs' }
  | { type: 'set_sync_pref'; dataType: 'memory' | 'tasks' | 'journal' | 'learning' | 'history' | 'settings' | 'personality' | 'learnings' | 'health_profile'; enabled: boolean }
  | { type: 'push_to_cloud'; dataType: 'memory' | 'tasks' | 'journal' | 'learning' | 'history' | 'settings' | 'personality' | 'learnings' | 'health_profile' }
  | { type: 'save_avatar'; data: string; mimeType: string }
  | { type: 'remove_avatar' }
  | { type: 'load_avatar' }
  // Release notes
  | { type: 'load_releases' }
  // Library
  | { type: 'load_library' }
  | { type: 'load_cloud_assets' }
  | { type: 'download_cloud_asset'; url: string; filename: string }
  | { type: 'delete_cloud_asset'; id: string }
  | { type: 'delete_library_image'; path: string }
  | { type: 'open_library_image'; path: string }
  | { type: 'open_external'; path: string }
  | { type: 'reveal_in_explorer'; path: string }
  // Creative Studio — Documents tab (host prompts for filename via showInputBox
  // because webviews can't use window.prompt)
  | { type: 'create_blank_document'; format: 'docx' | 'xlsx' | 'csv' | 'md' | 'pdf' }
  | { type: 'create_from_template'; template: 'proposal' | 'report' | 'invoice' | 'letter' | 'meeting_notes' | 'resume' }
  // Personality
  | { type: 'load_personality' }
  | { type: 'save_personality'; personality: PersonalityData }
  | { type: 'reset_personality' }
  // Overview widgets (routed through extension host)
  | { type: 'load_weather' }
  | { type: 'load_news'; category?: string }
  | { type: 'load_news_article'; slug: string }
  | { type: 'load_latest_release' }
  // Creative Studio (proxied through extension host for CORS)
  | { type: 'creative_generate'; endpoint: string; body: Record<string, unknown> }
  // Creative Studio dataset signal: what the user did with a generated asset.
  // completeEventId links back to the generation_complete event (shape-only).
  | { type: 'creative_user_action'; completeEventId: string; action: 'kept' | 'retried' | 'discarded' | 'edited' | 'unknown' }
  // ── Chat messages (forwarded to AvaViewProvider) ────────────────────────
  | { type: 'send_message'; text: string; mode: AvaMode | string; attachments?: Array<{ type: 'image'; data: string; name: string }>; surface?: 'main' | 'health' }
  // Command palette — a pre-classified user-aid intent fired by a palette
  // button. `action` is 'create' for most tools; 'image'|'music'|'video'|
  // 'voice' for `creative`. See COMMAND_PALETTE_PLAN.md. `surface: 'health'`
  // routes the turn to the focused Ava Health & Fitness room (its own thread).
  | { type: 'palette_intent'; tool: 'task' | 'journal' | 'memory' | 'support' | 'learning' | 'creative' | 'plans'; action: string; mode: AvaMode | string; surface?: 'main' | 'health' }
  | { type: 'tool_confirmation_response'; confirmationId: string; approved: boolean; alwaysAllowCategory?: boolean; planSelection?: string; userResponse?: string }
  | { type: 'set_category_permission'; category: string; permission: string }
  | { type: 'request_audit_log' }
  | { type: 'export_audit_log'; format: 'markdown' | 'json' }
  | { type: 'export_full_account_data' }
  | { type: 'switch_model'; modelId: string }
  | { type: 'clear_chat'; surface?: 'main' | 'health' }
  | { type: 'cancel' }
  | { type: 'interrupt' }
  | { type: 'request_history' }
  | { type: 'load_chat_conversation'; conversationId: string }
  | { type: 'delete_chat_conversation'; conversationId: string }
  | { type: 'search_history'; query: string }
  | { type: 'rename_conversation'; conversationId: string; newTitle: string }
  | { type: 'pin_conversation'; conversationId: string; pinned: boolean }
  | { type: 'export_conversation'; conversationId: string; format: 'markdown' | 'json' }
  | { type: 'new_chat' }
  | { type: 'compress_context' }
  | { type: 'set_provider_source'; source: ProviderSource }
  | { type: 'request_memory' }
  | { type: 'save_chat_memory'; scope: 'global' | 'project'; content: string }
  | { type: 'clear_chat_memory'; scope: 'global' | 'project' }
  | { type: 'archive_chat_memory'; scope: 'global' | 'project'; id: string }
  | { type: 'restore_chat_memory'; scope: 'global' | 'project'; id: string }
  | { type: 'delete_chat_memory_entry'; scope: 'global' | 'project'; id: string }
  | { type: 'pong' }
  | { type: 'request_today_tasks' }
  | { type: 'request_all_tasks' }
  | { type: 'toggle_task'; taskId: string }
  | { type: 'panel_create_task'; title: string; description?: string; priority?: string; category?: string; due_date?: string; due_time?: string; recurrence?: string; reminder_lead?: number; subtasks?: string[] }
  | { type: 'panel_update_task'; taskId: string; updates: { title?: string; description?: string; priority?: string; category?: string; due_date?: string; due_time?: string; recurrence?: string; reminder_lead?: number } }
  | { type: 'toggle_subtask'; taskId: string; subtaskId: string }
  | { type: 'open_tasks_folder' }
  | { type: 'rate_message'; messageId: string; rating: 'up' | 'down'; reason?: string; model?: string; mode?: string }
  | { type: 'save_secrets'; secrets: Array<{ id: string; label: string; value: string }> }
  | { type: 'load_secrets' }
  | { type: 'export_data'; dataType: string }
  | { type: 'import_data'; dataType: string; content: string }
  // Data sovereignty — encrypted backup (.ava-backup) + readable export.
  | { type: 'export_encrypted_backup'; passphrase: string }
  | { type: 'export_readable_all' }
  | { type: 'import_encrypted_backup'; content: string; passphrase: string; overwrite?: boolean }
  // Open the built-in Ava docs surface (extension command routed from
  // the dashboard welcome flow / help buttons).
  | { type: 'open_docs' }
  // Creative Studio — persist a generated asset URL to disk under the
  // user's project root. Host downloads the URL and writes the bytes.
  | { type: 'save_creative_to_disk'; url: string; filename: string; assetType?: string; prompt?: string }
  | { type: 'load_local_creative' }
  | { type: 'delete_local_creative'; id: string }
  | { type: 'open_creative_folder' }
  // Import-from-disk picker. Dashboard asks host to pop the VS Code open
  // dialog; host replies with an 'import_files_picked' listing files read.
  | { type: 'import_pick_files' };
