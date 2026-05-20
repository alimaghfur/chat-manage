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
  createdAt?: string;
}

export default function SessionsView({ apiKey }: SessionsViewProps) {
  const [sessionsList, setSessionsList] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [connectingSession, setConnectingSession] = useState<string | null>(null);
  const [connectMethod, setConnectMethod] = useState<'qr' | 'pairing'>('qr');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [newSessionName, setNewSessionName] = useState('');
  const [newSessionProxy, setNewSessionProxy] = useState('');
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
    const interval = setInterval(fetchSessions, 5000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  const handleCreate = async () => {
    if (!newSessionName.trim()) return;
    setActionLoading('create');
    try {
      await sessionsApi.create(
        { name: newSessionName, proxyUrl: newSessionProxy || undefined },
        apiKey
      );
      setShowCreateModal(false);
      setNewSessionName('');
      setNewSessionProxy('');
      await fetchSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setActionLoading(null);
    }
  };

  const handleConnect = async (sessionId: string) => {
    setConnectingSession(sessionId);
    setShowConnectModal(true);
    setQrCode(null);
    setPairingCode(null);
  };

  const startConnect = async () => {
    if (!connectingSession) return;
    setActionLoading('connect');
    try {
      const phone = connectMethod === 'pairing' ? phoneNumber : undefined;
      const data = await sessionsApi.connect(connectingSession, connectMethod, phone, apiKey);
      if (connectMethod === 'qr' && data.qr) {
        setQrCode(data.qr);
      } else if (connectMethod === 'pairing' && data.pairingCode) {
        setPairingCode(data.pairingCode);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect session');
      setShowConnectModal(false);
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
            <p className="text-sm mt-1">Create a session to get started</p>
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
              <p className="text-xs text-[#8696A0] mb-3 font-mono">{session.id}</p>
              <div className="flex gap-2">
                {session.status !== 'connected' && (
                  <button
                    onClick={() => handleConnect(session.id)}
                    disabled={actionLoading === session.id}
                    className="px-3 py-1.5 bg-[#00A884] hover:bg-[#00C49A] text-white rounded text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    Connect
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
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[#8696A0] mb-1">Session Name *</label>
                <input
                  type="text"
                  value={newSessionName}
                  onChange={(e) => setNewSessionName(e.target.value)}
                  placeholder="e.g., my-business"
                  className="w-full px-3 py-2 bg-[#2A3942] border border-[#2A3942] rounded-lg text-[#E9EDEF] placeholder-[#8696A0] focus:outline-none focus:border-[#00A884]"
                />
              </div>
              <div>
                <label className="block text-sm text-[#8696A0] mb-1">Proxy URL (optional)</label>
                <input
                  type="text"
                  value={newSessionProxy}
                  onChange={(e) => setNewSessionProxy(e.target.value)}
                  placeholder="http://proxy:port"
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
                disabled={!newSessionName.trim() || actionLoading === 'create'}
                className="px-4 py-2 bg-[#00A884] hover:bg-[#00C49A] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {actionLoading === 'create' ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Connect Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#202C33] border border-[#2A3942] rounded-lg p-6 w-full max-w-md animate-fade-in">
            <h2 className="text-lg font-semibold text-[#E9EDEF] mb-4">Connect Session</h2>

            {!qrCode && !pairingCode && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-[#8696A0] mb-2">Connection Method</label>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setConnectMethod('qr')}
                      className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        connectMethod === 'qr'
                          ? 'bg-[#00A884] text-white'
                          : 'bg-[#2A3942] text-[#8696A0] hover:text-[#E9EDEF]'
                      }`}
                    >
                      QR Code
                    </button>
                    <button
                      onClick={() => setConnectMethod('pairing')}
                      className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        connectMethod === 'pairing'
                          ? 'bg-[#00A884] text-white'
                          : 'bg-[#2A3942] text-[#8696A0] hover:text-[#E9EDEF]'
                      }`}
                    >
                      Pairing Code
                    </button>
                  </div>
                </div>
                {connectMethod === 'pairing' && (
                  <div>
                    <label className="block text-sm text-[#8696A0] mb-1">Phone Number</label>
                    <input
                      type="text"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="e.g., 1234567890"
                      className="w-full px-3 py-2 bg-[#2A3942] border border-[#2A3942] rounded-lg text-[#E9EDEF] placeholder-[#8696A0] focus:outline-none focus:border-[#00A884]"
                    />
                  </div>
                )}
                <div className="flex justify-end gap-3 mt-4">
                  <button
                    onClick={() => {
                      setShowConnectModal(false);
                      setConnectingSession(null);
                    }}
                    className="px-4 py-2 text-[#8696A0] hover:text-[#E9EDEF] text-sm transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={startConnect}
                    disabled={actionLoading === 'connect' || (connectMethod === 'pairing' && !phoneNumber)}
                    className="px-4 py-2 bg-[#00A884] hover:bg-[#00C49A] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {actionLoading === 'connect' ? 'Connecting...' : 'Connect'}
                  </button>
                </div>
              </div>
            )}

            {qrCode && (
              <div className="text-center space-y-4">
                <p className="text-sm text-[#8696A0]">Scan this QR code with WhatsApp</p>
                <div className="bg-white p-4 rounded-lg inline-block">
                  <img src={qrCode} alt="QR Code" className="w-48 h-48" />
                </div>
                <button
                  onClick={() => {
                    setShowConnectModal(false);
                    setQrCode(null);
                    setConnectingSession(null);
                  }}
                  className="px-4 py-2 text-[#8696A0] hover:text-[#E9EDEF] text-sm transition-colors"
                >
                  Close
                </button>
              </div>
            )}

            {pairingCode && (
              <div className="text-center space-y-4">
                <p className="text-sm text-[#8696A0]">Enter this code in WhatsApp</p>
                <div className="bg-[#2A3942] p-4 rounded-lg">
                  <p className="text-3xl font-mono font-bold text-[#00A884] tracking-wider">
                    {pairingCode}
                  </p>
                </div>
                <p className="text-xs text-[#8696A0]">
                  Go to WhatsApp &gt; Settings &gt; Linked Devices &gt; Link a Device
                </p>
                <button
                  onClick={() => {
                    setShowConnectModal(false);
                    setPairingCode(null);
                    setConnectingSession(null);
                  }}
                  className="px-4 py-2 text-[#8696A0] hover:text-[#E9EDEF] text-sm transition-colors"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
