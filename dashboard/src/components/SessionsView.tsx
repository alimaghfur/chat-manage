'use client';

import { useState, useEffect, useCallback } from 'react';
import { sessions as sessionsApi } from '@/lib/api';

interface SessionsViewProps {
  apiKey: string;
}

interface Session {
  id: string;
  name: string;
  status: string;
  phone?: string;
  phoneNumberId?: string;
  waBusinessId?: string;
  isConnected?: boolean;
  createdAt?: string;
}

export default function SessionsView({ apiKey }: SessionsViewProps) {
  const [sessionsList, setSessionsList] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [newPhoneNumberId, setNewPhoneNumberId] = useState('');
  const [newAccessToken, setNewAccessToken] = useState('');
  const [newWaBusinessId, setNewWaBusinessId] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    if (!apiKey) { setLoading(false); return; }
    try {
      const data = await sessionsApi.list(apiKey);
      const list = data.data || data || [];
      setSessionsList(Array.isArray(list) ? list : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 10000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  const handleCreate = async () => {
    if (!newSessionName.trim() || !newPhoneNumberId.trim() || !newAccessToken.trim()) return;
    setActionLoading('create');
    try {
      await sessionsApi.create(
        {
          name: newSessionName,
          phoneNumberId: newPhoneNumberId,
          accessToken: newAccessToken,
          waBusinessId: newWaBusinessId || undefined,
        },
        apiKey
      );
      setShowCreateModal(false);
      setNewSessionName('');
      setNewPhoneNumberId('');
      setNewAccessToken('');
      setNewWaBusinessId('');
      await fetchSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setActionLoading(null);
    }
  };


  const handleConnect = async (sessionId: string) => {
    setActionLoading(sessionId);
    try {
      await sessionsApi.connect(sessionId, apiKey);
      await fetchSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify token');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDisconnect = async (sessionId: string) => {
    setActionLoading(sessionId);
    try {
      await sessionsApi.disconnect(sessionId, apiKey);
      await fetchSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect session');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this session?')) return;
    setActionLoading(sessionId);
    try {
      await sessionsApi.delete(sessionId, apiKey);
      await fetchSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete session');
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
        return 'bg-[#00A884]';
      case 'disconnected':
        return 'bg-red-500';
      case 'connecting':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

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
          + Create Session
        </button>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 text-red-300 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Sessions List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sessionsList.length === 0 ? (
          <div className="col-span-full text-center py-12 text-[#8696A0]">
            <p className="text-lg">No sessions yet</p>
            <p className="text-sm mt-1">Create a session with your Cloud API credentials</p>
          </div>
        ) : (
          sessionsList.map((session) => (
            <div
              key={session.id}
              className="bg-[#202C33] border border-[#2A3942] rounded-lg p-4 animate-slide-in"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-[#E9EDEF]">{session.name || session.id}</h3>
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${getStatusColor(session.status)}`}></div>
                  <span className="text-xs text-[#8696A0] capitalize">{session.status}</span>
                </div>
              </div>
              <p className="text-xs text-[#8696A0] mb-1 font-mono">{session.id}</p>
              {session.phone && (
                <p className="text-xs text-[#8696A0] mb-3">{session.phone}</p>
              )}
              <div className="flex gap-2 mt-3">
                {session.status !== 'connected' && (
                  <button
                    onClick={() => handleConnect(session.id)}
                    disabled={actionLoading === session.id}
                    className="px-3 py-1.5 bg-[#00A884] hover:bg-[#00C49A] text-white rounded text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    {actionLoading === session.id ? 'Verifying...' : 'Verify & Connect'}
                  </button>
                )}
                {session.status === 'connected' && (
                  <button
                    onClick={() => handleDisconnect(session.id)}
                    disabled={actionLoading === session.id}
                    className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    Disconnect
                  </button>
                )}
                <button
                  onClick={() => handleDelete(session.id)}
                  disabled={actionLoading === session.id}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium transition-colors disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>


      {/* Create Session Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#202C33] border border-[#2A3942] rounded-lg p-6 w-full max-w-md animate-fade-in">
            <h2 className="text-lg font-semibold text-[#E9EDEF] mb-4">Create New Session</h2>
            <p className="text-xs text-[#8696A0] mb-4">
              Enter your WhatsApp Cloud API credentials from Meta Business Suite.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[#8696A0] mb-1">Session Name *</label>
                <input
                  type="text"
                  value={newSessionName}
                  onChange={(e) => setNewSessionName(e.target.value)}
                  placeholder="e.g., My Business"
                  className="w-full px-3 py-2 bg-[#2A3942] border border-[#2A3942] rounded-lg text-[#E9EDEF] placeholder-[#8696A0] focus:outline-none focus:border-[#00A884]"
                />
              </div>
              <div>
                <label className="block text-sm text-[#8696A0] mb-1">Phone Number ID *</label>
                <input
                  type="text"
                  value={newPhoneNumberId}
                  onChange={(e) => setNewPhoneNumberId(e.target.value)}
                  placeholder="e.g., 123456789012345"
                  className="w-full px-3 py-2 bg-[#2A3942] border border-[#2A3942] rounded-lg text-[#E9EDEF] placeholder-[#8696A0] focus:outline-none focus:border-[#00A884]"
                />
              </div>
              <div>
                <label className="block text-sm text-[#8696A0] mb-1">Access Token *</label>
                <input
                  type="password"
                  value={newAccessToken}
                  onChange={(e) => setNewAccessToken(e.target.value)}
                  placeholder="EAABx..."
                  className="w-full px-3 py-2 bg-[#2A3942] border border-[#2A3942] rounded-lg text-[#E9EDEF] placeholder-[#8696A0] focus:outline-none focus:border-[#00A884]"
                />
              </div>
              <div>
                <label className="block text-sm text-[#8696A0] mb-1">WhatsApp Business Account ID</label>
                <input
                  type="text"
                  value={newWaBusinessId}
                  onChange={(e) => setNewWaBusinessId(e.target.value)}
                  placeholder="e.g., 987654321098765 (optional)"
                  className="w-full px-3 py-2 bg-[#2A3942] border border-[#2A3942] rounded-lg text-[#E9EDEF] placeholder-[#8696A0] focus:outline-none focus:border-[#00A884]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-[#8696A0] hover:text-[#E9EDEF] text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newSessionName.trim() || !newPhoneNumberId.trim() || !newAccessToken.trim() || actionLoading === 'create'}
                className="px-4 py-2 bg-[#00A884] hover:bg-[#00C49A] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {actionLoading === 'create' ? 'Creating...' : 'Create Session'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
