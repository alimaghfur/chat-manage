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
    <div className="flex h-screen">
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
          <div className="flex items-center justify-center h-full bg-wa-bg">
            <div className="text-center">
              <div className="text-6xl mb-4">📱</div>
              <h2 className="text-xl font-semibold text-gray-600">Pilih Session Terlebih Dahulu</h2>
              <p className="text-gray-400 mt-2">Buat atau pilih session WhatsApp dari sidebar</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
