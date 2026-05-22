'use client';

import { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import DashboardView from '@/components/DashboardView';
import SessionsView from '@/components/SessionsView';
import MessagesView from '@/components/MessagesView';
import WebhooksView from '@/components/WebhooksView';
import ApiKeysView from '@/components/ApiKeysView';

export default function Home() {
  const [activeView, setActiveView] = useState<string>('dashboard');
  const [apiKey, setApiKey] = useState<string>('');
  const [keyInput, setKeyInput] = useState<string>('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem('wa-dashboard-api-key');
    if (stored) {
      setApiKey(stored);
    }
  }, []);

  const handleApiKeyChange = (key: string) => {
    setApiKey(key);
    localStorage.setItem('wa-dashboard-api-key', key);
  };

  const handleKeySubmit = async () => {
    if (!keyInput.trim()) return;
    
    // Verify key against backend before saving
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
        alert('API Key tidak valid. Pastikan key sesuai dengan API_MASTER_KEY di file .env backend.');
      }
    } catch (err) {
      // If backend is not running, still allow entry (will show error in dashboard)
      alert('Tidak bisa menghubungi backend di ' + (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api') + '. Pastikan backend sudah running.');
    }
  };

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0B141A]">
        <div className="w-8 h-8 border-2 border-[#00A884] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Show API key setup screen if no key configured
  if (!apiKey) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0B141A]">
        <div className="bg-[#202C33] border border-[#2A3942] rounded-xl p-8 max-w-md w-full mx-4 text-center">
          <div className="w-16 h-16 rounded-full bg-[#00A884]/10 flex items-center justify-center mx-auto mb-5">
            <svg className="w-8 h-8 text-[#00A884]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-[#E9EDEF] mb-2">WhatsApp API Dashboard</h1>
          <p className="text-[#8696A0] text-sm mb-6">
            Masukkan API Key atau Master Key untuk mengakses dashboard
          </p>
          <input
            type="text"
            placeholder="Masukkan API Key (wk_xxx... atau master key)"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleKeySubmit()}
            className="w-full bg-[#2A3942] border border-[#3B4A54] rounded-lg px-4 py-3 text-[#E9EDEF] placeholder-[#8696A0] focus:outline-none focus:ring-2 focus:ring-[#00A884] focus:border-transparent mb-4 text-sm"
            autoFocus
          />
          <button
            onClick={handleKeySubmit}
            disabled={!keyInput.trim()}
            className="w-full px-5 py-3 bg-[#00A884] text-white rounded-lg hover:bg-[#00C49A] disabled:opacity-40 disabled:cursor-not-allowed transition-all font-medium text-sm"
          >
            Masuk Dashboard
          </button>
          <p className="text-[#8696A0] text-xs mt-4">
            Belum punya API key? Gunakan Master Key dari file .env untuk generate key baru di menu API Keys.
          </p>
        </div>
      </div>
    );
  }

  const renderView = () => {
    switch (activeView) {
      case 'dashboard':
        return <DashboardView apiKey={apiKey} onViewChange={setActiveView} />;
      case 'sessions':
        return <SessionsView apiKey={apiKey} />;
      case 'messages':
        return <MessagesView apiKey={apiKey} />;
      case 'webhooks':
        return <WebhooksView apiKey={apiKey} />;
      case 'api-keys':
        return <ApiKeysView apiKey={apiKey} />;
      default:
        return <DashboardView apiKey={apiKey} onViewChange={setActiveView} />;
    }
  };

  return (
    <Layout
      activeView={activeView}
      onViewChange={setActiveView}
      apiKey={apiKey}
      onApiKeyChange={handleApiKeyChange}
    >
      {renderView()}
    </Layout>
  );
}
