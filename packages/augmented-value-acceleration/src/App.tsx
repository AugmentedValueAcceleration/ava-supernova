import { useState } from 'react';
import TitleBar from './components/TitleBar';
import Sidebar, { type Page } from './components/Sidebar';
import AvaChat from './components/AvaChat';
import Dashboard from './pages/Dashboard';
import CreativeStudio from './pages/CreativeStudio';
import News from './pages/News';
import Financials from './pages/Financials';
import Planner from './pages/Planner';
import Projects from './pages/Projects';
import Tasks from './pages/Tasks';
import CRM from './pages/CRM';
import Documents from './pages/Documents';
import People from './pages/People';
import Communication from './pages/Communication';
import Learning from './pages/Learning';
import SecurityCentre from './pages/SecurityCentre';
import Feedback from './pages/Feedback';
import AuditLog from './pages/AuditLog';
import Support from './pages/Support';
import Coupons from './pages/Coupons';
import Settings from './pages/Settings';
import Users from './pages/Users';
import Billing from './pages/Billing';
import Models from './pages/Models';
import Demo from './pages/Demo';
import Roadmap from './pages/Roadmap';
import ToolProposals from './pages/ToolProposals';
import UserBilling from './pages/UserBilling';
import UserHistory from './pages/UserHistory';
import UserKeys from './pages/UserKeys';
import UserMemory from './pages/UserMemory';
import UserUsage from './pages/UserUsage';

const PAGE_MAP: Record<Page, React.ComponentType<{ onNavigate?: (page: string) => void }>> = {
  'dashboard': Dashboard,
  'creative-studio': CreativeStudio,
  'news': News,
  'financials': Financials,
  'planner': Planner,
  'projects': Projects,
  'tasks': Tasks,
  'crm': CRM,
  'documents': Documents,
  'people': People,
  'communication': Communication,
  'learning': Learning,
  'security': SecurityCentre,
  'feedback': Feedback,
  'audit-log': AuditLog,
  'support': Support,
  'coupons': Coupons,
  'settings': Settings,
  'users': Users,
  'admin-billing': Billing,
  'models': Models,
  'demo': Demo,
  'roadmap': Roadmap,
  'tool-proposals': ToolProposals,
  'user-billing': UserBilling,
  'user-history': UserHistory,
  'user-keys': UserKeys,
  'user-memory': UserMemory,
  'user-usage': UserUsage,
};

export default function App() {
  const [activePage, setActivePage] = useState<Page>('dashboard');

  const PageComponent = PAGE_MAP[activePage] || Dashboard;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TitleBar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar activePage={activePage} onNavigate={setActivePage} />
        <main style={{ flex: 1, overflow: 'hidden' }}>
          <PageComponent onNavigate={(p) => setActivePage(p as Page)} />
        </main>
      </div>
      <AvaChat />
    </div>
  );
}
