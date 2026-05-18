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

  useEffect(() => {
    loadSessions();
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
    { id: 'dashboard' as ActiveView, icon: '🏠', label: 'Dashboard' },
    { id: 'chat' as ActiveView, icon: '💬', label: 'Chat' },
    { id: 'auto-reply' as ActiveView, icon: '🤖', label: 'Auto Reply' },
    { id: 'broadcast' as ActiveView, icon: '📢', label: 'Broadcast' },
  ];

  return (
    <aside className="w-64 bg-wa-dark text-white flex flex-col h-full">
      {/* Logo */}
      <div className="p-4 border-b border-white/10">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <span className="text-2xl">📱</span>
          WA Chat Manager
        </h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto">
        <div className="p-3">
          <p className="text-xs uppercase text-white/50 mb-2 px-3">Menu</p>
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 transition-colors ${
                activeView === item.id
                  ? 'bg-white/20 text-white'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span>{item.icon}</span>
              <span className="text-sm font-medium">{item.label}</span>
            </button>
          ))}
        </div>

        {/* Sessions */}
        <div className="p-3 border-t border-white/10">
          <p className="text-xs uppercase text-white/50 mb-2 px-3">Sessions</p>
          {sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => setActiveSessionId(session.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg mb-1 transition-colors ${
                activeSessionId === session.id
                  ? 'bg-wa-green/30 text-white'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  session.status === 'connected'
                    ? 'bg-green-400'
                    : session.status === 'connecting'
                    ? 'bg-yellow-400'
                    : 'bg-red-400'
                }`}
              />
              <div className="text-left flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{session.name}</p>
                <p className="text-xs text-white/50">{session.phone || session.status}</p>
              </div>
            </button>
          ))}
          {sessions.length === 0 && (
            <p className="text-white/40 text-xs text-center py-4">Belum ada session</p>
          )}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-white/10">
        <p className="text-xs text-white/40 text-center">v1.0.0</p>
      </div>
    </aside>
  );
}
