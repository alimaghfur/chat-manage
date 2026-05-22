'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { sessions as sessionsApi, platforms as platformsApi } from '@/lib/api';

interface SessionsViewProps {
  apiKey: string;
}

interface Session {
  id: string;
  name: string;
  platform: string;
  connectionType: string;
  status: string;
  phone?: string;
  username?: string;
  avatar?: string;
  qrCode?: string;
  pairingCode?: string;
}

interface Platform {
  id: string;
  name: string;
  color: string;
  description: string;
  connectionType: string;
  authFields: { key: string; label: string; type: string; required: boolean; placeholder?: string }[];
  authOptions?: { id: string; label: string; description: string; fields?: { key: string; label: string; type: string; required: boolean; placeholder?: string }[] }[];
  notes?: string;
}

const PLATFORM_ICONS: Record<string, string> = {
  whatsapp: '💬', whatsapp_api: '📱', telegram: '✈️', instagram: '📸', messenger: '💭',
};

const PLATFORM_COLORS: Record<string, string> = {
  whatsapp: '#25D366', whatsapp_api: '#128C7E', telegram: '#0088CC', instagram: '#E4405F', messenger: '#0084FF',
};

export default function SessionsView({ apiKey }: SessionsViewProps) {
  const [sessionsList, setSessionsList] = useState<Session[]>([]);
  const [platformsList, setPlatformsList] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<string>('');
  const [authOption, setAuthOption] = useState<string>('');
  const [newSessionName, setNewSessionName] = useState('');
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filterPlatform, setFilterPlatform] = useState<string>('');

  // Auth flow states
  const [connectingSession, setConnectingSession] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [twoFAPassword, setTwoFAPassword] = useState('');
  const [authStep, setAuthStep] = useState<'idle' | 'qr' | 'otp' | '2fa' | 'connected'>('idle');
  const [currentQR, setCurrentQR] = useState<string | null>(null);
  const [currentPairingCode, setCurrentPairingCode] = useState<string | null>(null);

  const qrPollRef = useRef<NodeJS.Timeout | null>(null);

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
    const interval = setInterval(fetchSessions, 8000);
    return () => clearInterval(interval);
  }, [fetchSessions, fetchPlatforms]);

  // Poll QR code for WhatsApp sessions
  useEffect(() => {
    if (connectingSession && authStep === 'qr') {
      qrPollRef.current = setInterval(async () => {
        try {
          const data = await sessionsApi.get(connectingSession, apiKey);
          const s = data.data;
          if (s?.qrCode) setCurrentQR(s.qrCode);
          if (s?.pairingCode) setCurrentPairingCode(s.pairingCode);
          if (s?.status === 'connected') {
            setAuthStep('connected');
            setSuccess('Connected successfully!');
            setTimeout(() => { setConnectingSession(null); setAuthStep('idle'); setSuccess(null); }, 2000);
            fetchSessions();
          }
        } catch { /* ignore */ }
      }, 3000);
    }
    return () => { if (qrPollRef.current) clearInterval(qrPollRef.current); };
  }, [connectingSession, authStep, apiKey, fetchSessions]);

  const handleCreate = async () => {
    if (!newSessionName.trim() || !selectedPlatform) return;
    setActionLoading('create');
    try {
      const result = await sessionsApi.create({ name: newSessionName, platform: selectedPlatform, credentials }, apiKey);
      const newSession = result.data;
      setShowCreateModal(false);
      setNewSessionName('');
      setSelectedPlatform('');
      setCredentials({});
      setAuthOption('');
      await fetchSessions();

      // Auto-start connection
      if (newSession?.id) {
        await startConnect(newSession.id, selectedPlatform);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setActionLoading(null);
    }
  };

  const startConnect = async (sessionId: string, platform: string) => {
    setConnectingSession(sessionId);
    setActionLoading(sessionId);
    try {
      const connectPayload: Record<string, unknown> = {};

      if (platform === 'whatsapp') {
        if (credentials.phoneNumber) {
          connectPayload.usePairingCode = true;
          connectPayload.phoneNumber = credentials.phoneNumber;
        }
        // Otherwise just start QR scan
      } else if (platform === 'telegram') {
        connectPayload.phoneNumber = credentials.phoneNumber;
      } else if (platform === 'instagram') {
        connectPayload.username = credentials.username;
        connectPayload.password = credentials.password;
      } else if (platform === 'messenger') {
        if (credentials.appState) {
          connectPayload.appState = credentials.appState;
        } else {
          connectPayload.email = credentials.email;
          connectPayload.password = credentials.password;
        }
      } else if (platform === 'whatsapp_api') {
        // Credentials already saved, just verify
      }

      const result = await sessionsApi.connect(sessionId, apiKey, connectPayload);
      const status = result.data?.status;

      if (status === 'connected') {
        setAuthStep('connected');
        setSuccess('Connected!');
        setTimeout(() => { setConnectingSession(null); setAuthStep('idle'); setSuccess(null); }, 2000);
      } else if (status === 'qr_ready' || platform === 'whatsapp') {
        setAuthStep('qr');
      } else if (status === 'otp_required' || status === 'challenge_required') {
        setAuthStep('otp');
      } else if (status === '2fa_required') {
        setAuthStep('2fa');
      } else if (status === 'awaiting_phone' || status === 'awaiting_login') {
        // Need credentials - show form was already shown during create
        setConnectingSession(null);
        setAuthStep('idle');
      }

      await fetchSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
      setConnectingSession(null);
      setAuthStep('idle');
    } finally {
      setActionLoading(null);
    }
  };

  const handleVerify = async () => {
    if (!connectingSession || !otpCode) return;
    setActionLoading('verify');
    try {
      const result = await sessionsApi.verify(connectingSession, apiKey, { code: otpCode, password: twoFAPassword || undefined });
      const status = result.data?.status;

      if (status === 'connected') {
        setAuthStep('connected');
        setSuccess('Connected!');
        setOtpCode('');
        setTwoFAPassword('');
        setTimeout(() => { setConnectingSession(null); setAuthStep('idle'); setSuccess(null); }, 2000);
      } else if (status === '2fa_required') {
        setAuthStep('2fa');
      }

      await fetchSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
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
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this session and all its data?')) return;
    setActionLoading(id);
    try {
      await sessionsApi.delete(id, apiKey);
      await fetchSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setActionLoading(null);
    }
  };

  const currentPlatformInfo = platformsList.find((p) => p.id === selectedPlatform);
  const currentAuthFields = authOption && currentPlatformInfo?.authOptions?.find((o) => o.id === authOption)?.fields
    || currentPlatformInfo?.authFields || [];

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-[#00A884] border-t-transparent rounded-full animate-spin"></div></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#E9EDEF]">Connections</h1>
        <button onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-[#00A884] hover:bg-[#00C49A] text-white rounded-lg text-sm font-medium transition-colors">
          + Connect Platform
        </button>
      </div>

      {/* Platform Filter */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setFilterPlatform('')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${!filterPlatform ? 'bg-[#00A884] text-white' : 'bg-[#2A3942] text-[#8696A0] hover:bg-[#3B4F5A]'}`}>
          All
        </button>
        {platformsList.map((p) => (
          <button key={p.id} onClick={() => setFilterPlatform(p.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1 ${filterPlatform === p.id ? 'text-white' : 'bg-[#2A3942] text-[#8696A0] hover:bg-[#3B4F5A]'}`}
            style={filterPlatform === p.id ? { backgroundColor: p.color } : {}}>
            {PLATFORM_ICONS[p.id]} {p.name}
          </button>
        ))}
      </div>

      {error && <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 text-red-300 text-sm">{error}<button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button></div>}
      {success && <div className="bg-green-900/20 border border-green-800 rounded-lg p-3 text-green-300 text-sm">{success}</div>}

      {/* QR / OTP / 2FA Auth Modal */}
      {connectingSession && authStep !== 'idle' && authStep !== 'connected' && (
        <div className="bg-[#202C33] border border-[#2A3942] rounded-lg p-6">
          {authStep === 'qr' && (
            <div className="text-center">
              <h3 className="text-lg font-semibold text-[#E9EDEF] mb-3">Scan QR Code</h3>
              <p className="text-sm text-[#8696A0] mb-4">Open WhatsApp on your phone &gt; Linked Devices &gt; Link a Device</p>
              {currentQR ? (
                <div className="inline-block bg-white p-4 rounded-lg mb-4">
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(currentQR)}`} alt="QR Code" className="w-[250px] h-[250px]" />
                </div>
              ) : (
                <div className="w-[250px] h-[250px] mx-auto bg-[#2A3942] rounded-lg flex items-center justify-center mb-4">
                  <div className="w-8 h-8 border-2 border-[#00A884] border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
              {currentPairingCode && (
                <div className="mb-4">
                  <p className="text-sm text-[#8696A0] mb-1">Or enter this pairing code:</p>
                  <p className="text-2xl font-mono font-bold text-[#00A884] tracking-wider">{currentPairingCode}</p>
                </div>
              )}
              <button onClick={() => { setConnectingSession(null); setAuthStep('idle'); }}
                className="px-4 py-2 text-[#8696A0] hover:text-[#E9EDEF] text-sm">Cancel</button>
            </div>
          )}

          {(authStep === 'otp' || authStep === '2fa') && (
            <div className="max-w-sm mx-auto text-center">
              <h3 className="text-lg font-semibold text-[#E9EDEF] mb-2">
                {authStep === 'otp' ? 'Enter Verification Code' : 'Two-Factor Authentication'}
              </h3>
              <p className="text-sm text-[#8696A0] mb-4">
                {authStep === 'otp' ? 'Check your phone/email for the code' : 'Enter your 2FA password'}
              </p>
              <input type="text" value={otpCode} onChange={(e) => setOtpCode(e.target.value)}
                placeholder={authStep === 'otp' ? 'Enter code...' : 'Enter OTP code...'}
                className="w-full px-4 py-3 bg-[#2A3942] border border-[#2A3942] rounded-lg text-[#E9EDEF] text-center text-xl tracking-wider font-mono placeholder-[#8696A0] focus:outline-none focus:border-[#00A884] mb-3"
                autoFocus />
              {authStep === '2fa' && (
                <input type="password" value={twoFAPassword} onChange={(e) => setTwoFAPassword(e.target.value)}
                  placeholder="2FA Password (if enabled)"
                  className="w-full px-4 py-3 bg-[#2A3942] border border-[#2A3942] rounded-lg text-[#E9EDEF] placeholder-[#8696A0] focus:outline-none focus:border-[#00A884] mb-3" />
              )}
              <div className="flex gap-3 justify-center">
                <button onClick={() => { setConnectingSession(null); setAuthStep('idle'); setOtpCode(''); }}
                  className="px-4 py-2 text-[#8696A0] hover:text-[#E9EDEF] text-sm">Cancel</button>
                <button onClick={handleVerify} disabled={!otpCode || actionLoading === 'verify'}
                  className="px-6 py-2 bg-[#00A884] hover:bg-[#00C49A] text-white rounded-lg text-sm font-medium disabled:opacity-50">
                  {actionLoading === 'verify' ? 'Verifying...' : 'Verify'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sessions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sessionsList.length === 0 ? (
          <div className="col-span-full text-center py-12 text-[#8696A0]">
            <p className="text-4xl mb-3">💬 ✈️ 📸 💭</p>
            <p className="text-lg">No connections yet</p>
            <p className="text-sm mt-1">Connect WhatsApp, Telegram, Instagram, or Messenger</p>
          </div>
        ) : (
          sessionsList.map((session) => (
            <div key={session.id} className="bg-[#202C33] border border-[#2A3942] rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{PLATFORM_ICONS[session.platform] || '💬'}</span>
                  <div>
                    <h3 className="font-medium text-[#E9EDEF] text-sm">{session.name}</h3>
                    <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                      style={{ backgroundColor: `${PLATFORM_COLORS[session.platform] || '#666'}20`, color: PLATFORM_COLORS[session.platform] || '#666' }}>
                      {session.platform.replace('_', ' ')}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className={`w-2.5 h-2.5 rounded-full ${session.status === 'connected' ? 'bg-green-500' : session.status === 'connecting' || session.status === 'qr_ready' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`}></div>
                  <span className="text-xs text-[#8696A0] capitalize">{session.status.replace('_', ' ')}</span>
                </div>
              </div>

              {(session.phone || session.username) && (
                <p className="text-xs text-[#8696A0] mb-3">{session.username || session.phone}</p>
              )}

              <div className="flex gap-2 flex-wrap">
                {session.status === 'connected' ? (
                  <button onClick={() => handleDisconnect(session.id)} disabled={actionLoading === session.id}
                    className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-xs font-medium disabled:opacity-50">
                    Disconnect
                  </button>
                ) : (
                  <button onClick={() => startConnect(session.id, session.platform)} disabled={actionLoading === session.id}
                    className="px-3 py-1.5 bg-[#00A884] hover:bg-[#00C49A] text-white rounded text-xs font-medium disabled:opacity-50">
                    {actionLoading === session.id ? '...' : 'Connect'}
                  </button>
                )}
                <button onClick={() => handleDelete(session.id)} disabled={actionLoading === session.id}
                  className="px-3 py-1.5 bg-red-600/80 hover:bg-red-700 text-white rounded text-xs font-medium disabled:opacity-50">
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#202C33] border border-[#2A3942] rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-[#E9EDEF] mb-4">Connect New Platform</h2>

            {/* Platform Grid */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              {platformsList.map((p) => (
                <button key={p.id} onClick={() => { setSelectedPlatform(p.id); setCredentials({}); setAuthOption(''); }}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${selectedPlatform === p.id ? 'border-[#00A884] bg-[#00A884]/10' : 'border-[#2A3942] hover:border-[#3B4F5A]'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">{PLATFORM_ICONS[p.id]}</span>
                    <span className="font-medium text-[#E9EDEF] text-sm">{p.name}</span>
                  </div>
                  <p className="text-xs text-[#8696A0] line-clamp-2">{p.description}</p>
                </button>
              ))}
            </div>

            {selectedPlatform && (
              <div className="space-y-4 border-t border-[#2A3942] pt-4">
                <div>
                  <label className="block text-sm text-[#8696A0] mb-1">Session Name *</label>
                  <input type="text" value={newSessionName} onChange={(e) => setNewSessionName(e.target.value)}
                    placeholder="e.g., My WhatsApp, Work Telegram..."
                    className="w-full px-3 py-2 bg-[#2A3942] border border-[#2A3942] rounded-lg text-[#E9EDEF] placeholder-[#8696A0] focus:outline-none focus:border-[#00A884]" />
                </div>

                {/* Auth Options (if platform has multiple) */}
                {currentPlatformInfo?.authOptions && currentPlatformInfo.authOptions.length > 0 && (
                  <div>
                    <label className="block text-sm text-[#8696A0] mb-2">Connection Method</label>
                    <div className="space-y-2">
                      {currentPlatformInfo.authOptions.map((opt) => (
                        <button key={opt.id} onClick={() => setAuthOption(opt.id)}
                          className={`w-full p-3 rounded-lg border text-left ${authOption === opt.id ? 'border-[#00A884] bg-[#00A884]/5' : 'border-[#2A3942] hover:border-[#3B4F5A]'}`}>
                          <p className="text-sm font-medium text-[#E9EDEF]">{opt.label}</p>
                          <p className="text-xs text-[#8696A0]">{opt.description}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Credential Fields */}
                {currentAuthFields.map((field) => (
                  <div key={field.key}>
                    <label className="block text-sm text-[#8696A0] mb-1">{field.label} {field.required && '*'}</label>
                    {field.type === 'textarea' ? (
                      <textarea value={credentials[field.key] || ''} onChange={(e) => setCredentials({ ...credentials, [field.key]: e.target.value })}
                        placeholder={field.placeholder || ''} rows={4}
                        className="w-full px-3 py-2 bg-[#2A3942] border border-[#2A3942] rounded-lg text-[#E9EDEF] placeholder-[#8696A0] focus:outline-none focus:border-[#00A884] font-mono text-xs" />
                    ) : (
                      <input type={field.type || 'text'} value={credentials[field.key] || ''}
                        onChange={(e) => setCredentials({ ...credentials, [field.key]: e.target.value })}
                        placeholder={field.placeholder || ''}
                        className="w-full px-3 py-2 bg-[#2A3942] border border-[#2A3942] rounded-lg text-[#E9EDEF] placeholder-[#8696A0] focus:outline-none focus:border-[#00A884]" />
                    )}
                  </div>
                ))}

                {currentPlatformInfo?.notes && (
                  <p className="text-xs text-yellow-300/70 bg-yellow-900/10 border border-yellow-800/30 rounded-lg p-2">{currentPlatformInfo.notes}</p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowCreateModal(false); setSelectedPlatform(''); setCredentials({}); }}
                className="px-4 py-2 text-[#8696A0] hover:text-[#E9EDEF] text-sm">Cancel</button>
              <button onClick={handleCreate}
                disabled={!newSessionName.trim() || !selectedPlatform || actionLoading === 'create'}
                className="px-4 py-2 bg-[#00A884] hover:bg-[#00C49A] text-white rounded-lg text-sm font-medium disabled:opacity-50">
                {actionLoading === 'create' ? 'Connecting...' : 'Connect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
