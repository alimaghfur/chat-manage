'use client';

import { useState, useEffect } from 'react';
import { sessionsApi } from '@/lib/api';
import { getSocket, joinSession } from '@/lib/socket';
import { Session } from '@/lib/types';

interface DashboardProps {
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
}

export default function Dashboard({ activeSessionId, setActiveSessionId }: DashboardProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);

  useEffect(() => {
    loadSessions();

    const socket = getSocket();
    socket.on('qr-code', ({ sessionId, qr }) => {
      if (sessionId === connectingId) {
        setQrCode(qr);
      }
    });
    socket.on('session-status', ({ sessionId, status }) => {
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, status, qrCode: null } : s))
      );
      if (status === 'connected') {
        setQrCode(null);
        setConnectingId(null);
      }
    });

    return () => {
      socket.off('qr-code');
      socket.off('session-status');
    };
  }, [connectingId]);

  async function loadSessions() {
    try {
      const data = await sessionsApi.getAll();
      setSessions(data);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setLoading(true);
    try {
      const session = await sessionsApi.create(newName.trim());
      setSessions((prev) => [session, ...prev]);
      setNewName('');
      setShowCreate(false);
    } catch (error) {
      console.error('Failed to create session:', error);
    }
    setLoading(false);
  }

  async function handleConnect(id: string) {
    try {
      setConnectingId(id);
      setQrCode(null);
      joinSession(id);
      await sessionsApi.connect(id);
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: 'connecting' } : s))
      );
    } catch (error) {
      console.error('Failed to connect:', error);
      setConnectingId(null);
    }
  }

  async function handleDisconnect(id: string) {
    try {
      await sessionsApi.disconnect(id);
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: 'disconnected' } : s))
      );
      setConnectingId(null);
      setQrCode(null);
    } catch (error) {
      console.error('Failed to disconnect:', error);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Yakin ingin menghapus session ini?')) return;
    try {
      await sessionsApi.delete(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeSessionId === id) setActiveSessionId(null);
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
          <p className="text-gray-500">Kelola session WhatsApp kamu</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-wa-green hover:bg-green-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          + Tambah Session
        </button>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-bold mb-4">Buat Session Baru</h3>
            <input
              type="text"
              placeholder="Nama session (misal: WA Bisnis)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              className="w-full border rounded-lg px-4 py-2.5 mb-4 focus:outline-none focus:ring-2 focus:ring-wa-green"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowCreate(false); setNewName(''); }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Batal
              </button>
              <button
                onClick={handleCreate}
                disabled={loading || !newName.trim()}
                className="px-4 py-2 bg-wa-green text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
              >
                {loading ? 'Membuat...' : 'Buat'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {qrCode && connectingId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4 text-center">
            <h3 className="text-lg font-bold mb-2">Scan QR Code</h3>
            <p className="text-gray-500 text-sm mb-4">Buka WhatsApp &gt; Menu &gt; Linked Devices &gt; Link a Device</p>
            <img src={qrCode} alt="QR Code" className="mx-auto w-64 h-64 mb-4" />
            <button
              onClick={() => { setQrCode(null); setConnectingId(null); }}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* Sessions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`bg-white rounded-xl p-5 border-2 transition-colors cursor-pointer ${
              activeSessionId === session.id ? 'border-wa-green' : 'border-transparent hover:border-gray-200'
            }`}
            onClick={() => setActiveSessionId(session.id)}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800">{session.name}</h3>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  session.status === 'connected'
                    ? 'bg-green-100 text-green-700'
                    : session.status === 'connecting'
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-red-100 text-red-700'
                }`}
              >
                {session.status}
              </span>
            </div>

            {session.phone && (
              <p className="text-sm text-gray-500 mb-2">📞 +{session.phone}</p>
            )}

            <div className="flex gap-4 text-sm text-gray-400 mb-4">
              <span>👥 {session._count?.contacts || 0} kontak</span>
              <span>💬 {session._count?.messages || 0} pesan</span>
            </div>

            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              {session.status === 'disconnected' && (
                <button
                  onClick={() => handleConnect(session.id)}
                  className="flex-1 bg-wa-green text-white text-sm py-2 rounded-lg hover:bg-green-600"
                >
                  Connect
                </button>
              )}
              {session.status === 'connected' && (
                <button
                  onClick={() => handleDisconnect(session.id)}
                  className="flex-1 bg-orange-500 text-white text-sm py-2 rounded-lg hover:bg-orange-600"
                >
                  Disconnect
                </button>
              )}
              {session.status === 'connecting' && (
                <button
                  onClick={() => handleConnect(session.id)}
                  className="flex-1 bg-yellow-500 text-white text-sm py-2 rounded-lg"
                >
                  Scan QR...
                </button>
              )}
              <button
                onClick={() => handleDelete(session.id)}
                className="px-3 py-2 bg-red-50 text-red-500 text-sm rounded-lg hover:bg-red-100"
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>

      {sessions.length === 0 && (
        <div className="text-center py-20">
          <div className="text-6xl mb-4">📱</div>
          <h2 className="text-xl font-semibold text-gray-600 mb-2">Belum Ada Session</h2>
          <p className="text-gray-400 mb-6">Tambahkan session WhatsApp pertama kamu</p>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-wa-green hover:bg-green-600 text-white px-6 py-3 rounded-lg font-medium"
          >
            + Tambah Session
          </button>
        </div>
      )}
    </div>
  );
}
