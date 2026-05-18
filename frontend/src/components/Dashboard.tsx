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
    
    // Listen for QR code - use callback to always get latest connectingId
    const handleQr = ({ sessionId, qr }: { sessionId: string; qr: string }) => {
      setConnectingId((currentId) => {
        if (sessionId === currentId) {
          setQrCode(qr);
        }
        return currentId;
      });
    };

    const handleStatus = ({ sessionId, status }: { sessionId: string; status: string }) => {
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, status, qrCode: null } : s))
      );
      if (status === 'connected') {
        setQrCode(null);
        setConnectingId(null);
      }
    };

    socket.on('qr-code', handleQr);
    socket.on('session-status', handleStatus);

    return () => {
      socket.off('qr-code', handleQr);
      socket.off('session-status', handleStatus);
    };
  }, []);

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
      
      // Join socket room FIRST, then call connect API
      const socket = getSocket();
      socket.emit('join-session', id);
      
      // Small delay to ensure room is joined before backend emits QR
      await new Promise((resolve) => setTimeout(resolve, 300));
      
      await sessionsApi.connect(id);
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: 'connecting' } : s))
      );
    } catch (error) {
      console.error('Failed to connect:', error);
      alert('Gagal connect: ' + (error as Error).message);
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

  const connectedCount = sessions.filter((s) => s.status === 'connected').length;
  const totalContacts = sessions.reduce((acc, s) => acc + (s._count?.contacts || 0), 0);
  const totalMessages = sessions.reduce((acc, s) => acc + (s._count?.messages || 0), 0);

  return (
    <div className="h-full overflow-y-auto bg-[#0B141A] p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-8 animate-fadeIn">
        <div>
          <h1 className="text-2xl font-bold text-[#E9EDEF]">Dashboard</h1>
          <p className="text-[#8696A0] text-sm mt-1">Kelola semua session WhatsApp kamu</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-[#00A884] hover:bg-[#00C49A] text-white px-5 py-2.5 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 shadow-lg shadow-[#00A884]/20"
        >
          <PlusIcon className="w-4 h-4" />
          <span>Tambah Session</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 animate-fadeIn">
        <StatCard
          icon={<DeviceIcon className="w-5 h-5" />}
          label="Total Session"
          value={sessions.length.toString()}
          color="blue"
        />
        <StatCard
          icon={<WifiIcon className="w-5 h-5" />}
          label="Connected"
          value={connectedCount.toString()}
          color="green"
        />
        <StatCard
          icon={<UsersIcon className="w-5 h-5" />}
          label="Total Kontak"
          value={totalContacts.toString()}
          color="purple"
        />
        <StatCard
          icon={<MessageIcon className="w-5 h-5" />}
          label="Total Pesan"
          value={totalMessages.toString()}
          color="amber"
        />
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => { setShowCreate(false); setNewName(''); }}>
          <div className="modal-content w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-lg bg-[#00A884]/10 flex items-center justify-center">
                <PlusIcon className="w-5 h-5 text-[#00A884]" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[#E9EDEF]">Buat Session Baru</h3>
                <p className="text-xs text-[#8696A0]">Tambahkan nomor WhatsApp baru</p>
              </div>
            </div>
            <input
              type="text"
              placeholder="Nama session (misal: WA Bisnis, WA Personal)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              className="w-full bg-[#2A3942] border border-[#3B4A54] rounded-lg px-4 py-3 text-[#E9EDEF] placeholder-[#8696A0] focus:outline-none focus:ring-2 focus:ring-[#00A884] focus:border-transparent mb-5"
              autoFocus
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowCreate(false); setNewName(''); }}
                className="px-4 py-2.5 text-[#8696A0] hover:text-[#E9EDEF] hover:bg-[#2A3942] rounded-lg transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleCreate}
                disabled={loading || !newName.trim()}
                className="px-5 py-2.5 bg-[#00A884] text-white rounded-lg hover:bg-[#00C49A] disabled:opacity-40 disabled:cursor-not-allowed transition-all font-medium"
              >
                {loading ? 'Membuat...' : 'Buat Session'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {connectingId && (
        <div className="modal-overlay" onClick={() => { setQrCode(null); setConnectingId(null); }}>
          <div className="modal-content w-full max-w-sm mx-4 p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full bg-[#00A884]/10 flex items-center justify-center mx-auto mb-4">
              <QrIcon className="w-6 h-6 text-[#00A884]" />
            </div>
            <h3 className="text-lg font-semibold text-[#E9EDEF] mb-1">
              {qrCode ? 'Scan QR Code' : 'Menunggu QR Code...'}
            </h3>
            <p className="text-[#8696A0] text-xs mb-5">
              Buka WhatsApp di HP → Menu → Linked Devices → Link a Device
            </p>
            {qrCode ? (
              <div className="bg-white rounded-xl p-3 inline-block mb-5">
                <img src={qrCode} alt="QR Code" className="w-56 h-56" />
              </div>
            ) : (
              <div className="flex items-center justify-center mb-5 py-10">
                <div className="w-10 h-10 border-4 border-[#2A3942] border-t-[#00A884] rounded-full animate-spin"></div>
              </div>
            )}
            <div>
              <button
                onClick={() => { setQrCode(null); setConnectingId(null); }}
                className="px-5 py-2.5 text-[#8696A0] hover:text-[#E9EDEF] hover:bg-[#2A3942] rounded-lg transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sessions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {sessions.map((session, i) => (
          <div
            key={session.id}
            className={`bg-[#202C33] rounded-xl border transition-all duration-200 cursor-pointer group animate-fadeIn hover:border-[#00A884]/50 ${
              activeSessionId === session.id ? 'border-[#00A884] ring-1 ring-[#00A884]/30' : 'border-[#2A3942]'
            }`}
            style={{ animationDelay: `${i * 50}ms` }}
            onClick={() => setActiveSessionId(session.id)}
          >
            {/* Card Header */}
            <div className="p-5 pb-3">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold ${
                    session.status === 'connected' 
                      ? 'bg-emerald-500/10 text-emerald-400' 
                      : 'bg-[#2A3942] text-[#8696A0]'
                  }`}>
                    {session.name[0]?.toUpperCase()}{session.name[1]?.toUpperCase() || ''}
                  </div>
                  <div>
                    <h3 className="font-semibold text-[#E9EDEF] text-sm">{session.name}</h3>
                    {session.phone ? (
                      <p className="text-xs text-[#8696A0] mt-0.5">+{session.phone}</p>
                    ) : (
                      <p className="text-xs text-[#8696A0] mt-0.5">Belum terhubung</p>
                    )}
                  </div>
                </div>
                <StatusBadge status={session.status} />
              </div>

              {/* Stats */}
              <div className="flex gap-4 mt-4">
                <div className="flex items-center gap-1.5 text-xs text-[#8696A0]">
                  <UsersIcon className="w-3.5 h-3.5" />
                  <span>{session._count?.contacts || 0} kontak</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-[#8696A0]">
                  <MessageIcon className="w-3.5 h-3.5" />
                  <span>{session._count?.messages || 0} pesan</span>
                </div>
              </div>
            </div>

            {/* Card Actions */}
            <div className="px-5 py-3 border-t border-[#2A3942] flex gap-2" onClick={(e) => e.stopPropagation()}>
              {session.status === 'disconnected' && (
                <button
                  onClick={() => handleConnect(session.id)}
                  className="flex-1 bg-[#00A884] text-white text-xs font-medium py-2 rounded-lg hover:bg-[#00C49A] transition-colors flex items-center justify-center gap-1.5"
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                  Connect
                </button>
              )}
              {session.status === 'connected' && (
                <button
                  onClick={() => handleDisconnect(session.id)}
                  className="flex-1 bg-amber-500/10 text-amber-400 text-xs font-medium py-2 rounded-lg hover:bg-amber-500/20 transition-colors flex items-center justify-center gap-1.5"
                >
                  <UnlinkIcon className="w-3.5 h-3.5" />
                  Disconnect
                </button>
              )}
              {session.status === 'connecting' && (
                <button
                  onClick={() => handleConnect(session.id)}
                  className="flex-1 bg-amber-500/10 text-amber-400 text-xs font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 animate-pulse"
                >
                  <QrIcon className="w-3.5 h-3.5" />
                  Scan QR...
                </button>
              )}
              <button
                onClick={() => handleDelete(session.id)}
                className="px-3 py-2 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {sessions.length === 0 && (
        <div className="text-center py-20 animate-fadeIn">
          <div className="w-20 h-20 rounded-full bg-[#202C33] flex items-center justify-center mx-auto mb-5">
            <DeviceIcon className="w-10 h-10 text-[#8696A0]" />
          </div>
          <h2 className="text-xl font-semibold text-[#E9EDEF] mb-2">Belum Ada Session</h2>
          <p className="text-[#8696A0] text-sm mb-8 max-w-sm mx-auto">
            Tambahkan session WhatsApp pertama kamu untuk mulai mengelola percakapan
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-[#00A884] hover:bg-[#00C49A] text-white px-6 py-3 rounded-lg font-medium transition-all shadow-lg shadow-[#00A884]/20 inline-flex items-center gap-2"
          >
            <PlusIcon className="w-4 h-4" />
            Tambah Session Pertama
          </button>
        </div>
      )}
    </div>
  );
}

// Stat Card Component
function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  const colors = {
    blue: 'bg-blue-500/10 text-blue-400',
    green: 'bg-emerald-500/10 text-emerald-400',
    purple: 'bg-purple-500/10 text-purple-400',
    amber: 'bg-amber-500/10 text-amber-400',
  };

  return (
    <div className="bg-[#202C33] rounded-xl border border-[#2A3942] p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors[color as keyof typeof colors]}`}>
          {icon}
        </div>
        <div>
          <p className="text-[#8696A0] text-xs">{label}</p>
          <p className="text-xl font-bold text-[#E9EDEF]">{value}</p>
        </div>
      </div>
    </div>
  );
}

// Status Badge
function StatusBadge({ status }: { status: string }) {
  const config = {
    connected: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' },
    connecting: { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400' },
    disconnected: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-400' },
  };
  const c = config[status as keyof typeof config] || config.disconnected;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot} ${status === 'connecting' ? 'animate-pulse' : ''}`} />
      {status}
    </span>
  );
}

// Icons
function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function DeviceIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="14" height="20" x="5" y="2" rx="2" ry="2" /><path d="M12 18h.01" />
    </svg>
  );
}

function WifiIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h.01" /><path d="M2 8.82a15 15 0 0 1 20 0" /><path d="M5 12.859a10 10 0 0 1 14 0" /><path d="M8.5 16.429a5 5 0 0 1 7 0" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function MessageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function LinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function UnlinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71" /><path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71" /><line x1="8" x2="8" y1="2" y2="5" /><line x1="2" x2="5" y1="8" y2="8" /><line x1="16" x2="16" y1="19" y2="22" /><line x1="19" x2="22" y1="16" y2="16" />
    </svg>
  );
}

function QrIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="5" height="5" x="3" y="3" rx="1" /><rect width="5" height="5" x="16" y="3" rx="1" /><rect width="5" height="5" x="3" y="16" rx="1" /><path d="M21 16h-3a2 2 0 0 0-2 2v3" /><path d="M21 21v.01" /><path d="M12 7v3a2 2 0 0 1-2 2H7" /><path d="M3 12h.01" /><path d="M12 3h.01" /><path d="M12 16v.01" /><path d="M16 12h1" /><path d="M21 12v.01" /><path d="M12 21v-1" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}
