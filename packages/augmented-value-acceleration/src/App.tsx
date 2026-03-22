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
