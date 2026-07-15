import { useEffect, useState } from 'react';
import { tt, useLocale } from '../i18n';
import { Tasks } from './Tasks';
import { Journal } from './Journal';
import { HealthPlans } from './HealthPlans';
import type {
  DashboardTaskEntry, DashboardJournalMonthEntry, DashboardJournalKind, DashboardJournalSearchHit,
  DashboardJournalDaySummary,
  HealthPlan, HealthPlanSummary, HealthExerciseSummary, HealthRecipeSummary,
  HealthExerciseDetail, HealthRecipeDetail,
} from '../types/messages';

type PlannerTab = 'tasks' | 'journal' | 'plans';

interface SessionTask {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
}

interface PlannerProps {
  tasks: DashboardTaskEntry[];
  sessionTasks?: SessionTask[];
  journalDate: string;
  journalYear: number;
  journalMonth: number;
  journalMonthEntries: DashboardJournalMonthEntry[];
  journalKinds: DashboardJournalKind[];
  journalSearchHits: DashboardJournalSearchHit[] | null;
  journalYearSummaries: DashboardJournalDaySummary[];
  onChangeJournalMonth: (year: number, month: number) => void;
  onClearJournalSearch: () => void;
  /** Counter that ticks when the operator picks a day on the sidebar
   *  mini-calendar. Watched by a useEffect that switches the active tab
   *  to Journal — without this, Planner stayed on Tasks and the calendar
   *  click looked like a no-op. Counter not boolean so re-clicking the
   *  same day still re-fires the tab switch. */
  journalNavTick?: number;
  /** Per-source load signals — true once the first load has landed.
   *  Each sub-tab skeletons until its own data is in. */
  tasksLoaded: boolean;
  journalLoaded: boolean;
  // Multi-week Health plans — the "Plans" tab. Threaded straight
  // through to the HealthPlans surface.
  healthPlans: HealthPlanSummary[];
  /** Full (dated) plans with days — drives the calendar's per-day content. */
  activeHealthPlans: HealthPlan[];
  healthPlanOpen: HealthPlan | null;
  onOpenHealthPlan: (id: string) => void;
  onSaveHealthPlan: (plan: HealthPlan) => void;
  onDeleteHealthPlan: (id: string) => void;
  onCloseHealthPlan: () => void;
  planExerciseResults: HealthExerciseSummary[];
  planRecipeResults: HealthRecipeSummary[];
  planCatalogSearching: boolean;
  planExerciseTotal: number;
  planRecipeTotal: number;
  onSearchPlanExercises: (o: { q: string; offset: number; category: string | null }) => void;
  onSearchPlanRecipes: (o: { q: string; offset: number; category: string | null }) => void;
  // Plan picker detail caches + loaders — routine pre-fill + meal nutrition.
  planExerciseDetails: Record<string, HealthExerciseDetail>;
  planRecipeDetails: Record<string, HealthRecipeDetail>;
  onLoadPlanExerciseDetail: (slug: string) => void;
  onLoadPlanRecipeDetail: (slug: string) => void;
}

const TABS: { key: PlannerTab; icon: string }[] = [
  { key: 'tasks', icon: '\u2713' },
  { key: 'journal', icon: '\u270E' },
  { key: 'plans', icon: '\u2630' },
];

const TAB_KEYS: Record<PlannerTab, string> = {
  tasks: 'dash.nav.tasks',
  journal: 'dash.nav.journal',
  plans: 'dash.planner.tab_plans',
};

export function Planner({
  tasks, sessionTasks,
  journalDate, journalNavTick,
  journalYear, journalMonth, journalMonthEntries, journalKinds, journalSearchHits, journalYearSummaries, onChangeJournalMonth, onClearJournalSearch,
  tasksLoaded, journalLoaded,
  healthPlans, activeHealthPlans, healthPlanOpen, onOpenHealthPlan, onSaveHealthPlan, onDeleteHealthPlan, onCloseHealthPlan,
  planExerciseResults, planRecipeResults, planCatalogSearching, planExerciseTotal, planRecipeTotal,
  onSearchPlanExercises, onSearchPlanRecipes,
  planExerciseDetails, planRecipeDetails, onLoadPlanExerciseDetail, onLoadPlanRecipeDetail,
}: PlannerProps) {
  useLocale();
  const [activeTab, setActiveTab] = useState<PlannerTab>('tasks');

  // Sidebar mini-calendar pick → switch to Journal tab so the operator
  // sees the day they clicked. Initial tick is 0; first click bumps it
  // to 1 and triggers the switch. Subsequent clicks keep ticking and
  // re-firing this effect even when the date is unchanged.
  useEffect(() => {
    if (journalNavTick && journalNavTick > 0) {
      setActiveTab('journal');
    }
  }, [journalNavTick]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-semibold text-[#cdd6f4]">{tt('dash.nav.planner', 'Planner')}</h1>
        <p className="mt-1.5 text-[13px] text-[#6c7086]">{tt('ext.planner.subtitle', 'Tasks, reflections, and plans')}</p>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-[var(--border-card)] pb-px">
        {TABS.map(({ key, icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-3 pb-2 pt-1 text-xs font-medium transition ${
              activeTab === key
                ? 'border-b-2 border-[var(--accent)] text-white'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            <span className="text-[11px]">{icon}</span>
            {tt(TAB_KEYS[key], key)}
            {key === 'tasks' && tasks.filter(t => t.status === 'todo' || t.status === 'in-progress').length > 0 && (
              <span className="ml-1 rounded-full bg-[var(--accent)]/15 px-1.5 text-[10px] text-[var(--accent)]">
                {tasks.filter(t => t.status === 'todo' || t.status === 'in-progress').length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'tasks' && (
        <Tasks tasks={tasks} sessionTasks={sessionTasks} selectedDate={journalDate} loaded={tasksLoaded} />
      )}

      {activeTab === 'journal' && (
        <Journal
          year={journalYear}
          month={journalMonth}
          monthEntries={journalMonthEntries}
          kinds={journalKinds}
          searchHits={journalSearchHits}
          yearSummaries={journalYearSummaries}
          loaded={journalLoaded}
          onChangeMonth={onChangeJournalMonth}
          onClearSearch={onClearJournalSearch}
        />
      )}

      {activeTab === 'plans' && (
        <HealthPlans
          plans={healthPlans}
          fullPlans={activeHealthPlans}
          planOpen={healthPlanOpen}
          onOpenPlan={onOpenHealthPlan}
          onSavePlan={onSaveHealthPlan}
          onDeletePlan={onDeleteHealthPlan}
          onClosePlan={onCloseHealthPlan}
          exerciseResults={planExerciseResults}
          recipeResults={planRecipeResults}
          catalogSearching={planCatalogSearching}
          exerciseTotal={planExerciseTotal}
          recipeTotal={planRecipeTotal}
          onSearchExercises={onSearchPlanExercises}
          onSearchRecipes={onSearchPlanRecipes}
          exerciseDetails={planExerciseDetails}
          recipeDetails={planRecipeDetails}
          onLoadExerciseDetail={onLoadPlanExerciseDetail}
          onLoadRecipeDetail={onLoadPlanRecipeDetail}
        />
      )}
    </div>
  );
}
