'use client';

import { useState, useEffect } from 'react';
import { sessionsApi } from '@/lib/api';
import { Session } from '@/lib/types';
import { ActiveView } from '@/app/page';

interface SidebarProps {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
}

export default function Sidebar({ activeView, setActiveView, activeSessionId, setActiveSessionId }: SidebarProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    loadSessions();
    const interval = setInterval(loadSessions, 10000);
    return () => clearInterval(interval);
  }, []);

  async function loadSessions() {
    try {
      const data = await sessionsApi.getAll();
      setSessions(data);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  }

  const menuItems = [
    { id: 'dashboard' as ActiveView, icon: DashboardIcon, label: 'Dashboard' },
    { id: 'chat' as ActiveView, icon: ChatIcon, label: 'Percakapan' },
    { id: 'auto-reply' as ActiveView, icon: BotIcon, label: 'Auto Reply' },
    { id: 'broadcast' as ActiveView, icon: MegaphoneIcon, label: 'Broadcast' },
  ];

  return (
    <aside className={`bg-[#111B21] border-r border-[#2A3942] flex flex-col h-full transition-all duration-300 ${collapsed ? 'w-[72px]' : 'w-[280px]'}`}>
      {/* Header */}
      <div className="h-[60px] px-4 flex items-center justify-between border-b border-[#2A3942]">
        {!collapsed && (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center">
              <WhatsAppIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-[#E9EDEF]">WA Manager</h1>
              <p className="text-[10px] text-[#8696A0]">Chat Management</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center mx-auto">
            <WhatsAppIcon className="w-5 h-5 text-white" />
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-md hover:bg-[#2A3942] text-[#8696A0] transition-colors"
        >
          {collapsed ? <ChevronRightIcon className="w-4 h-4" /> : <ChevronLeftIcon className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        <div className="space-y-0.5">
          {!collapsed && (
            <p className="text-[10px] uppercase tracking-wider text-[#8696A0] font-semibold px-3 mb-2">Menu</p>
          )}
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`w-full flex items-center gap-3 rounded-lg transition-all duration-200 ${
                  collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
                } ${
                  isActive
                    ? 'bg-[#00A884]/15 text-[#00A884]'
                    : 'text-[#8696A0] hover:bg-[#202C33] hover:text-[#E9EDEF]'
                }`}
                title={collapsed ? item.label : undefined}
              >
                <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-[#00A884]' : ''}`} />
                {!collapsed && (
                  <span className="text-[13px] font-medium">{item.label}</span>
                )}
                {isActive && !collapsed && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#00A884]" />
                )}
              </button>
            );
          })}
        </div>

        {/* Sessions */}
        <div className="mt-6 pt-4 border-t border-[#2A3942]">
          {!collapsed && (
            <p className="text-[10px] uppercase tracking-wider text-[#8696A0] font-semibold px-3 mb-2">Sessions</p>
          )}
          <div className="space-y-0.5">
            {sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => setActiveSessionId(session.id)}
                className={`w-full flex items-center gap-3 rounded-lg transition-all duration-200 ${
                  collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
                } ${
                  activeSessionId === session.id
                    ? 'bg-[#00A884]/10 text-[#E9EDEF]'
                    : 'text-[#8696A0] hover:bg-[#202C33] hover:text-[#E9EDEF]'
                }`}
                title={collapsed ? session.name : undefined}
              >
                <div className="relative flex-shrink-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                    activeSessionId === session.id ? 'bg-[#00A884]/20 text-[#00A884]' : 'bg-[#2A3942] text-[#8696A0]'
                  }`}>
                    {session.name[0]?.toUpperCase()}
                  </div>
                  <span className={`absolute -bottom-0.5 -right-0.5 status-dot ${
                    session.status === 'connected' ? 'status-dot-connected' : 
                    session.status === 'connecting' ? 'status-dot-connecting' : 'status-dot-disconnected'
                  }`} />
                </div>
                {!collapsed && (
                  <div className="text-left flex-1 min-w-0">
                    <p className="text-[13px] font-medium truncate">{session.name}</p>
                    <p className="text-[11px] text-[#8696A0] truncate">
                      {session.phone ? `+${session.phone}` : session.status}
                    </p>
                  </div>
                )}
              </button>
            ))}
          </div>
          {sessions.length === 0 && !collapsed && (
            <p className="text-[#8696A0] text-xs text-center py-6 opacity-60">Belum ada session</p>
          )}
        </div>
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="p-3 border-t border-[#2A3942]">
          <div className="flex items-center gap-2 px-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
            <p className="text-[11px] text-[#8696A0]">System Online</p>
          </div>
        </div>
      )}
    </aside>
  );
}

// SVG Icons as components
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function BotIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" />
    </svg>
  );
}

function MegaphoneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 11 18-5v12L3 13v-2z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  );
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
