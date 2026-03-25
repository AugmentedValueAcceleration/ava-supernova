import { useState, useCallback } from 'react';
import { useAuth } from './lib/auth';
import TitleBar from './components/TitleBar';
import Sidebar, { type Page } from './components/Sidebar';
import AvaChat from './components/AvaChat';
import Dashboard from './pages/Dashboard';
import CreativeStudio from './pages/CreativeStudio';
import Library from './pages/Library';
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
import Compliance from './pages/Compliance';
import Plugins from './pages/Plugins';
import Login from './pages/Login';

const PAGE_MAP: Record<Page, React.ComponentType<{ onNavigate?: (page: string) => void }>> = {
  'dashboard': Dashboard,
  'creative-studio': CreativeStudio,
  'library': Library,
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
  'compliance': Compliance,
  'plugins': Plugins,
};

export default function App() {
  const [activePage, setActivePage] = useState<Page>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { isAuthenticated, loading } = useAuth();

  const handleCollapsedChange = useCallback((collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
  }, []);

  // Show loading screen while checking auth state
  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: 'linear-gradient(135deg, #0f0a1a 0%, #1a1028 40%, #150d22 100%)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14, margin: '0 auto 16px',
            background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, fontWeight: 300, color: '#fff',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}>A</div>
          <div style={{ fontSize: 14, color: '#6b7280' }}>Loading...</div>
        </div>
      </div>
    );
  }

  // Gate: unauthenticated users see only the login page
  if (!isAuthenticated) {
    return <Login />;
  }

  const PageComponent = PAGE_MAP[activePage] || Dashboard;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TitleBar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar activePage={activePage} onNavigate={setActivePage} onCollapsedChange={handleCollapsedChange} />
        <main style={{ flex: 1, overflow: 'hidden', transition: 'margin-left 200ms ease' }}>
          <PageComponent onNavigate={(p) => setActivePage(p as Page)} />
        </main>
      </div>
      <AvaChat />
    </div>
  );
}
