'use client';

import { useState, useEffect, useCallback } from 'react';
import { sessions as sessionsApi, platforms as platformsApi } from '@/lib/api';

interface SessionsViewProps {
  apiKey: string;
}

interface Session {
  id: string;
  name: string;
  platform: string;
  status: string;
  phone?: string;
  createdAt?: string;
}

interface Platform {
  id: string;
  name: string;
  color: string;
  description: string;
  credentialFields: { key: string; label: string; required: boolean; type: string; placeholder?: string }[];
}

const PLATFORM_ICONS: Record<string, string> = {
  whatsapp: '💬',
  telegram: '✈️',
  instagram: '📸',
  messenger: '💭',
};

const PLATFORM_COLORS: Record<string, string> = {
  whatsapp: '#25D366',
  telegram: '#0088CC',
  instagram: '#E4405F',
  messenger: '#0084FF',
};

export default function SessionsView({ apiKey }: SessionsViewProps) {
  const [sessionsList, setSessionsList] = useState<Session[]>([]);
  const [platformsList, setPlatformsList] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<string>('');
  const [newSessionName, setNewSessionName] = useState('');
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filterPlatform, setFilterPlatform] = useState<string>('');

  const fetchSessions = useCallback(async () => {
    if (!apiKey) { setLoading(false); return; }
    try {
      const data = await sessionsApi.list(apiKey, filterPlatform || undefined);
      setSessionsList(data.data || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, [apiKey, filterPlatform]);

  const fetchPlatforms = useCallback(async () => {
    try {
      const data = await platformsApi.list(apiKey);
      setPlatformsList(data.data || []);
    } catch { /* ignore */ }
  }, [apiKey]);

  useEffect(() => {
    fetchSessions();
    fetchPlatforms();
    const interval = setInterval(fetchSessions, 10000);
    return () => clearInterval(interval);
  }, [fetchSessions, fetchPlatforms]);

  const handleCreate = async () => {
    if (!newSessionName.trim() || !selectedPlatform) return;
    setActionLoading('create');
    try {
      await sessionsApi.create({ name: newSessionName, platform: selectedPlatform, credentials }, apiKey);
      setShowCreateModal(false);
      setNewSessionName('');
      setSelectedPlatform('');
      setCredentials({});
      await fetchSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setActionLoading(null);
    }
  };

  const handleConnect = async (id: string) => {
    setActionLoading(id);
    try {
      await sessionsApi.connect(id, apiKey);
      await fetchSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDisconnect = async (id: string) => {
    setActionLoading(id);
    try {
      await sessionsApi.disconnect(id, apiKey);
      await fetchSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this session?')) return;
    setActionLoading(id);
    try {
      await sessionsApi.delete(id, apiKey);
      await fetchSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setActionLoading(null);
    }
  };

  const currentPlatformFields = platformsList.find((p) => p.id === selectedPlatform)?.credentialFields || [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[#00A884] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#E9EDEF]">Sessions</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-[#00A884] hover:bg-[#00C49A] text-white rounded-lg text-sm font-medium transition-colors"
        >
          + New Connection
        </button>
      </div>

      {/* Platform Filter */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilterPlatform('')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            !filterPlatform ? 'bg-[#00A884] text-white' : 'bg-[#2A3942] text-[#8696A0] hover:bg-[#3B4F5A]'
          }`}
        >
          All
        </button>
        {platformsList.map((p) => (
          <button
            key={p.id}
            onClick={() => setFilterPlatform(p.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${
              filterPlatform === p.id ? 'text-white' : 'bg-[#2A3942] text-[#8696A0] hover:bg-[#3B4F5A]'
            }`}
            style={filterPlatform === p.id ? { backgroundColor: p.color } : {}}
          >
            {PLATFORM_ICONS[p.id]} {p.name}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 text-red-300 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* Sessions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sessionsList.length === 0 ? (
          <div className="col-span-full text-center py-12 text-[#8696A0]">
            <p className="text-lg">No sessions yet</p>
            <p className="text-sm mt-1">Connect your first chat platform</p>
          </div>
        ) : (
          sessionsList.map((session) => (
            <div key={session.id} className="bg-[#202C33] border border-[#2A3942] rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{PLATFORM_ICONS[session.platform] || '💬'}</span>
                  <div>
                    <h3 className="font-medium text-[#E9EDEF] text-sm">{session.name}</h3>
                    <span
                      className="text-xs font-medium px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: `${PLATFORM_COLORS[session.platform] || '#666'}20`, color: PLATFORM_COLORS[session.platform] || '#666' }}
                    >
                      {session.platform}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${session.status === 'connected' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <span className="text-xs text-[#8696A0] capitalize">{session.status}</span>
                </div>
              </div>
              {session.phone && <p className="text-xs text-[#8696A0] mb-3">{session.phone}</p>}
              <div className="flex gap-2">
                {session.status !== 'connected' ? (
                  <button onClick={() => handleConnect(session.id)} disabled={actionLoading === session.id}
                    className="px-3 py-1.5 bg-[#00A884] hover:bg-[#00C49A] text-white rounded text-xs font-medium disabled:opacity-50">
                    {actionLoading === session.id ? '...' : 'Connect'}
                  </button>
                ) : (
                  <button onClick={() => handleDisconnect(session.id)} disabled={actionLoading === session.id}
                    className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-xs font-medium disabled:opacity-50">
                    Disconnect
                  </button>
                )}
                <button onClick={() => handleDelete(session.id)} disabled={actionLoading === session.id}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium disabled:opacity-50">
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#202C33] border border-[#2A3942] rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-[#E9EDEF] mb-4">Connect New Platform</h2>

            {/* Platform Selector */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              {platformsList.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedPlatform(p.id); setCredentials({}); }}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    selectedPlatform === p.id
                      ? 'border-[#00A884] bg-[#00A884]/10'
                      : 'border-[#2A3942] hover:border-[#3B4F5A]'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">{PLATFORM_ICONS[p.id]}</span>
                    <span className="font-medium text-[#E9EDEF] text-sm">{p.name}</span>
                  </div>
                  <p className="text-xs text-[#8696A0]">{p.description}</p>
                </button>
              ))}
            </div>

            {selectedPlatform && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-[#8696A0] mb-1">Session Name *</label>
                  <input type="text" value={newSessionName} onChange={(e) => setNewSessionName(e.target.value)}
                    placeholder="e.g., My Business" className="w-full px-3 py-2 bg-[#2A3942] border border-[#2A3942] rounded-lg text-[#E9EDEF] placeholder-[#8696A0] focus:outline-none focus:border-[#00A884]" />
                </div>

                {currentPlatformFields.map((field) => (
                  <div key={field.key}>
                    <label className="block text-sm text-[#8696A0] mb-1">
                      {field.label} {field.required && '*'}
                    </label>
                    <input
                      type={field.type || 'text'}
                      value={credentials[field.key] || ''}
                      onChange={(e) => setCredentials({ ...credentials, [field.key]: e.target.value })}
                      placeholder={field.placeholder || ''}
                      className="w-full px-3 py-2 bg-[#2A3942] border border-[#2A3942] rounded-lg text-[#E9EDEF] placeholder-[#8696A0] focus:outline-none focus:border-[#00A884]"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowCreateModal(false); setSelectedPlatform(''); setCredentials({}); }}
                className="px-4 py-2 text-[#8696A0] hover:text-[#E9EDEF] text-sm">Cancel</button>
              <button onClick={handleCreate}
                disabled={!newSessionName.trim() || !selectedPlatform || actionLoading === 'create'}
                className="px-4 py-2 bg-[#00A884] hover:bg-[#00C49A] text-white rounded-lg text-sm font-medium disabled:opacity-50">
                {actionLoading === 'create' ? 'Connecting...' : 'Create & Connect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
