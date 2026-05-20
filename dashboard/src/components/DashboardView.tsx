'use client';

import { useState, useEffect } from 'react';
import { sessions as sessionsApi, contacts, audit } from '@/lib/api';

interface DashboardViewProps {
  apiKey: string;
}

interface SessionData {
  id: string;
  name: string;
  status: string;
}

interface AuditEntry {
  id: string;
  action: string;
  resource: string;
  timestamp: string;
  details?: string;
}

export default function DashboardView({ apiKey }: DashboardViewProps) {
  const [stats, setStats] = useState({
    totalSessions: 0,
    connected: 0,
    messages: 0,
    contacts: 0,
  });
  const [recentActivity, setRecentActivity] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const sessionsData = await sessionsApi.list(apiKey);
        const sessionsList: SessionData[] = sessionsData.sessions || sessionsData || [];
        const connectedCount = sessionsList.filter((s) => s.status === 'connected').length;

        let contactCount = 0;
        for (const session of sessionsList.filter((s) => s.status === 'connected')) {
          try {
            const contactsData = await contacts.list(session.id, apiKey);
            const contactsList = contactsData.contacts || contactsData || [];
            contactCount += Array.isArray(contactsList) ? contactsList.length : 0;
          } catch {
            // Skip if contacts fetch fails for a session
          }
        }

        setStats({
          totalSessions: sessionsList.length,
          connected: connectedCount,
          messages: 0,
          contacts: contactCount,
        });

        try {
          const auditData = await audit.list(apiKey, { limit: '10' });
          const auditList = auditData.logs || auditData.entries || auditData || [];
          setRecentActivity(Array.isArray(auditList) ? auditList.slice(0, 10) : []);
        } catch {
          setRecentActivity([]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [apiKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[#00A884] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-red-300">
        <p className="font-medium">Error loading dashboard</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  const statCards = [
    { label: 'Total Sessions', value: stats.totalSessions, icon: '📱' },
    { label: 'Connected', value: stats.connected, icon: '🟢' },
    { label: 'Messages', value: stats.messages, icon: '💬' },
    { label: 'Contacts', value: stats.contacts, icon: '👤' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#E9EDEF]">Dashboard</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className="bg-[#202C33] border border-[#2A3942] rounded-lg p-4 animate-slide-in"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[#8696A0]">{stat.label}</p>
                <p className="text-2xl font-bold text-[#E9EDEF] mt-1">{stat.value}</p>
              </div>
              <span className="text-2xl">{stat.icon}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="bg-[#202C33] border border-[#2A3942] rounded-lg p-4">
        <h2 className="text-lg font-semibold text-[#E9EDEF] mb-3">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <button className="px-4 py-2 bg-[#00A884] hover:bg-[#00C49A] text-white rounded-lg text-sm font-medium transition-colors">
            Create Session
          </button>
          <a
            href="http://localhost:3001/api-docs"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-[#2A3942] hover:bg-[#3B4F5A] text-[#E9EDEF] rounded-lg text-sm font-medium transition-colors"
          >
            View API Docs
          </a>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-[#202C33] border border-[#2A3942] rounded-lg p-4">
        <h2 className="text-lg font-semibold text-[#E9EDEF] mb-3">Recent Activity</h2>
        {recentActivity.length === 0 ? (
          <p className="text-[#8696A0] text-sm">No recent activity</p>
        ) : (
          <div className="space-y-2">
            {recentActivity.map((entry, index) => (
              <div
                key={entry.id || index}
                className="flex items-center justify-between py-2 border-b border-[#2A3942] last:border-0"
              >
                <div>
                  <p className="text-sm text-[#E9EDEF]">
                    <span className="font-medium">{entry.action}</span>
                    {entry.resource && (
                      <span className="text-[#8696A0]"> - {entry.resource}</span>
                    )}
                  </p>
                  {entry.details && (
                    <p className="text-xs text-[#8696A0] mt-0.5">{entry.details}</p>
                  )}
                </div>
                <span className="text-xs text-[#8696A0]">
                  {new Date(entry.timestamp).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
