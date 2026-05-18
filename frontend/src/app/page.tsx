'use client';

import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Dashboard from '@/components/Dashboard';
import ChatView from '@/components/ChatView';
import AutoReplyView from '@/components/AutoReplyView';
import BroadcastView from '@/components/BroadcastView';

export type ActiveView = 'dashboard' | 'chat' | 'auto-reply' | 'broadcast';

export default function Home() {
  const [activeView, setActiveView] = useState<ActiveView>('dashboard');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  return (
    <div className="flex h-screen overflow-hidden bg-[#0B141A]">
      <Sidebar
        activeView={activeView}
        setActiveView={setActiveView}
        activeSessionId={activeSessionId}
        setActiveSessionId={setActiveSessionId}
      />
      <main className="flex-1 overflow-hidden">
        {activeView === 'dashboard' && (
          <Dashboard
            activeSessionId={activeSessionId}
            setActiveSessionId={setActiveSessionId}
          />
        )}
        {activeView === 'chat' && activeSessionId && (
          <ChatView sessionId={activeSessionId} />
        )}
        {activeView === 'auto-reply' && activeSessionId && (
          <AutoReplyView sessionId={activeSessionId} />
        )}
        {activeView === 'broadcast' && activeSessionId && (
          <BroadcastView sessionId={activeSessionId} />
        )}
        {(activeView !== 'dashboard' && !activeSessionId) && (
          <div className="flex items-center justify-center h-full bg-[#0B141A]">
            <div className="text-center animate-fadeIn">
              <div className="w-24 h-24 rounded-full bg-[#202C33] flex items-center justify-center mx-auto mb-6">
                <svg className="w-12 h-12 text-[#2A3942]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="14" height="20" x="5" y="2" rx="2" ry="2" /><path d="M12 18h.01" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-[#E9EDEF] mb-2">Pilih Session</h2>
              <p className="text-[#8696A0] text-sm max-w-sm mx-auto">
                Pilih atau buat session WhatsApp dari sidebar untuk memulai
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
