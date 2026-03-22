import { useState } from 'react';

type Page = 'dashboard' | 'creative-studio' | 'news' | 'financials' | 'planner' |
  'projects' | 'tasks' | 'crm' | 'documents' | 'people' | 'communication' |
  'learning' | 'security' | 'audit-log' | 'support' | 'coupons' | 'settings';

interface SidebarProps {
  activePage: Page;
  onNavigate: (page: Page) => void;
}

interface NavItem {
  id: Page;
  label: string;
  icon: React.ReactNode;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"
    style={{ color: 'var(--text-muted)', transform: open ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.15s' }}>
    <path d="M4 2l4 4-4 4" />
  </svg>
);

const I = ({ d }: { d: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'COMMAND CENTRE',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: <I d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1v-2zM14 13a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1h-4a1 1 0 01-1-1v-5z" /> },
    ],
  },
  {
    title: 'BUSINESS',
    items: [
      { id: 'creative-studio', label: 'Creative Studio', icon: <I d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /> },
      { id: 'news', label: 'News', icon: <I d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2" /> },
      { id: 'financials', label: 'Financials', icon: <I d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /> },
      { id: 'planner', label: 'Planner', icon: <I d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /> },
    ],
  },
  {
    title: 'OPERATIONS',
    items: [
      { id: 'projects', label: 'Projects', icon: <I d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /> },
      { id: 'tasks', label: 'Tasks', icon: <I d="M9 5l7 7-7 7" /> },
      { id: 'crm', label: 'CRM', icon: <I d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /> },
      { id: 'documents', label: 'Documents', icon: <I d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /> },
    ],
  },
  {
    title: 'TEAM',
    items: [
      { id: 'people', label: 'People', icon: <I d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /> },
      { id: 'communication', label: 'Communication', icon: <I d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /> },
      { id: 'learning', label: 'Learning', icon: <I d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /> },
    ],
  },
  {
    title: 'SECURITY',
    items: [
      { id: 'security', label: 'Security Centre', icon: <I d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /> },
      { id: 'audit-log', label: 'Audit Log', icon: <I d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /> },
    ],
  },
  {
    title: 'SYSTEM',
    items: [
      { id: 'support', label: 'Support', icon: <I d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" /> },
      { id: 'coupons', label: 'Coupons', icon: <I d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /> },
      { id: 'settings', label: 'Settings', icon: <I d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /> },
    ],
  },
];

export type { Page };

export default function Sidebar({ activePage, onNavigate }: SidebarProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleSection = (title: string) => {
    setCollapsed(prev => ({ ...prev, [title]: !prev[title] }));
  };

  return (
    <div className="flex flex-col w-60 shrink-0 overflow-y-auto" style={{ background: 'var(--bg-sidebar)', borderRight: '1px solid var(--border-card)' }}>
      <nav className="flex-1 py-3 px-2">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="mb-1">
            <button
              onClick={() => toggleSection(section.title)}
              className="flex items-center justify-between w-full px-2 py-1.5 text-[10px] font-semibold tracking-[1.5px] uppercase cursor-pointer hover:bg-white/3 rounded transition-colors"
              style={{ color: 'var(--text-muted)' }}
            >
              {section.title}
              <ChevronIcon open={!collapsed[section.title]} />
            </button>

            {!collapsed[section.title] && (
              <div className="mt-0.5">
                {section.items.map((item) => {
                  const isActive = activePage === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onNavigate(item.id)}
                      className={`flex items-center gap-2.5 w-full px-3 py-1.5 rounded-md text-[13px] transition-all cursor-pointer ${
                        isActive
                          ? 'font-medium'
                          : 'hover:bg-white/3'
                      }`}
                      style={{
                        color: isActive ? 'var(--ava-purple)' : 'var(--text-secondary)',
                        background: isActive ? 'rgba(168, 85, 247, 0.08)' : undefined,
                        borderLeft: isActive ? '2px solid var(--ava-purple)' : '2px solid transparent',
                      }}
                    >
                      <span style={{ color: isActive ? 'var(--ava-purple)' : 'var(--text-muted)' }}>
                        {item.icon}
                      </span>
                      {item.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* User */}
      <div className="p-3 mt-auto" style={{ borderTop: '1px solid var(--border-card)' }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold" style={{ background: 'var(--ava-purple)', color: '#fff' }}>
            SV
          </div>
          <div>
            <div className="text-[12px] font-medium">Stewart Vincent</div>
            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Admin</div>
          </div>
        </div>
      </div>
    </div>
  );
}
