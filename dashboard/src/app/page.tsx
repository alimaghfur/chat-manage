'use client';

import { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import DashboardView from '@/components/DashboardView';
import SessionsView from '@/components/SessionsView';
import InboxView from '@/components/InboxView';
import MessagesView from '@/components/MessagesView';
import WebhooksView from '@/components/WebhooksView';
import ApiKeysView from '@/components/ApiKeysView';

export default function Home() {
  const [activeView, setActiveView] = useState<string>('inbox');
  const [apiKey, setApiKey] = useState<string>('');
  const [keyInput, setKeyInput] = useState<string>('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem('chat-manager-api-key');
    if (stored) setApiKey(stored);
  }, []);

  const handleApiKeyChange = (key: string) => {
    setApiKey(key);
    localStorage.setItem('chat-manager-api-key', key);
  };

  const handleKeySubmit = async () => {
    if (!keyInput.trim()) return;
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const res = await fetch(`${apiUrl}/health/verify-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': keyInput.trim() },
      });
      const data = await res.json();
      if (data.valid) {
        handleApiKeyChange(keyInput.trim());
      } else {
        alert('API Key tidak valid.');
      }
    } catch {
      alert('Backend tidak bisa dihubungi. Pastikan server sudah running.');
    }
  };

  if (!mounted) {
    return <div className="flex items-center justify-center h-screen bg-[#0B141A]"><div className="w-8 h-8 border-2 border-[#00A884] border-t-transparent rounded-full animate-spin"></div></div>;
  }

  if (!apiKey) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0B141A]">
        <div className="bg-[#202C33] border border-[#2A3942] rounded-xl p-8 max-w-md w-full mx-4 text-center">
          <div className="flex justify-center gap-2 text-3xl mb-4">
            <span>💬</span><span>✈️</span><span>📸</span><span>💭</span>
          </div>
          <h1 className="text-xl font-bold text-[#E9EDEF] mb-2">Chat Manager</h1>
          <p className="text-[#8696A0] text-sm mb-6">
            Kelola WhatsApp, Telegram, Instagram, & Messenger dalam satu dashboard
          </p>
          <input type="text" placeholder="Masukkan API Key atau Master Key"
            value={keyInput} onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleKeySubmit()}
            className="w-full bg-[#2A3942] border border-[#3B4A54] rounded-lg px-4 py-3 text-[#E9EDEF] placeholder-[#8696A0] focus:outline-none focus:ring-2 focus:ring-[#00A884] mb-4 text-sm"
            autoFocus />
          <button onClick={handleKeySubmit} disabled={!keyInput.trim()}
            className="w-full px-5 py-3 bg-[#00A884] text-white rounded-lg hover:bg-[#00C49A] disabled:opacity-40 transition-all font-medium text-sm">
            Masuk Dashboard
          </button>
          <p className="text-[#8696A0] text-xs mt-4">Gunakan Master Key dari .env untuk generate API key baru</p>
        </div>
      </div>
    );
  }

  const renderView = () => {
    switch (activeView) {
      case 'dashboard': return <DashboardView apiKey={apiKey} onViewChange={setActiveView} />;
      case 'inbox': return <InboxView apiKey={apiKey} />;
      case 'sessions': return <SessionsView apiKey={apiKey} />;
      case 'messages': return <MessagesView apiKey={apiKey} />;
      case 'webhooks': return <WebhooksView apiKey={apiKey} />;
      case 'api-keys': return <ApiKeysView apiKey={apiKey} />;
      default: return <InboxView apiKey={apiKey} />;
    }
  };

  return (
    <Layout activeView={activeView} onViewChange={setActiveView} apiKey={apiKey} onApiKeyChange={handleApiKeyChange}>
      {renderView()}
    </Layout>
  );
}
