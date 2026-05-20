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

  useEffect(() => {
    const stored = localStorage.getItem('wa-dashboard-api-key');
    if (stored) {
      setApiKey(stored);
    }
  }, []);

  const handleApiKeyChange = (key: string) => {
    setApiKey(key);
    localStorage.setItem('wa-dashboard-api-key', key);
  };

  const renderView = () => {
    switch (activeView) {
      case 'dashboard':
        return <DashboardView apiKey={apiKey} />;
      case 'sessions':
        return <SessionsView apiKey={apiKey} />;
      case 'messages':
        return <MessagesView apiKey={apiKey} />;
      case 'webhooks':
        return <WebhooksView apiKey={apiKey} />;
      case 'api-keys':
        return <ApiKeysView apiKey={apiKey} />;
      default:
        return <DashboardView apiKey={apiKey} />;
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
