'use client';

import { useState, useEffect, useCallback } from 'react';
import { messages as messagesApi, sessions as sessionsApi } from '@/lib/api';

interface InboxViewProps {
  apiKey: string;
}

interface InboxMessage {
  id: string;
  sessionId: string;
  platformId: string;
  content: string;
  type: string;
  fromMe: boolean;
  status: string;
  timestamp: string;
  session?: { id: string; name: string; platform: string; phone?: string };
}

interface Session {
  id: string;
  name: string;
  platform: string;
  status: string;
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

export default function InboxView({ apiKey }: InboxViewProps) {
  const [inboxMessages, setInboxMessages] = useState<InboxMessage[]>([]);
  const [sessionsList, setSessionsList] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [recipient, setRecipient] = useState('');
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [filterPlatform, setFilterPlatform] = useState<string>('');

  const fetchInbox = useCallback(async () => {
    try {
      const params: Record<string, string> = { limit: '50' };
      if (filterPlatform) params.platform = filterPlatform;
      const data = await messagesApi.inbox(apiKey, params);
      setInboxMessages(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inbox');
    } finally {
      setLoading(false);
    }
  }, [apiKey, filterPlatform]);

  const fetchSessions = useCallback(async () => {
    try {
      const data = await sessionsApi.list(apiKey);
      const list = data.data || [];
      setSessionsList(list.filter((s: Session) => s.status === 'connected'));
    } catch { /* ignore */ }
  }, [apiKey]);

  useEffect(() => {
    fetchInbox();
    fetchSessions();
    const interval = setInterval(fetchInbox, 5000);
    return () => clearInterval(interval);
  }, [fetchInbox, fetchSessions]);

  const handleSend = async () => {
    if (!selectedSession || !recipient.trim() || !messageText.trim()) return;
    setSending(true);
    setError(null);
    try {
      await messagesApi.sendText({ sessionId: selectedSession, to: recipient, text: messageText }, apiKey);
      setMessageText('');
      setSuccess('Message sent!');
      setTimeout(() => setSuccess(null), 3000);
      await fetchInbox();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
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
      <h1 className="text-2xl font-bold text-[#E9EDEF]">Unified Inbox</h1>

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 text-red-300 text-sm">
          {error}<button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}
      {success && (
        <div className="bg-green-900/20 border border-green-800 rounded-lg p-3 text-green-300 text-sm">{success}</div>
      )}

      {/* Quick Send */}
      <div className="bg-[#202C33] border border-[#2A3942] rounded-lg p-4">
        <h2 className="text-sm font-semibold text-[#E9EDEF] mb-3">Quick Send</h2>
        <div className="flex gap-3 flex-wrap">
          <select value={selectedSession} onChange={(e) => setSelectedSession(e.target.value)}
            className="px-3 py-2 bg-[#2A3942] border border-[#2A3942] rounded-lg text-[#E9EDEF] text-sm focus:outline-none focus:border-[#00A884] min-w-[180px]">
            <option value="">Select session...</option>
            {sessionsList.map((s) => (
              <option key={s.id} value={s.id}>{PLATFORM_ICONS[s.platform]} {s.name}</option>
            ))}
          </select>
          <input type="text" value={recipient} onChange={(e) => setRecipient(e.target.value)}
            placeholder="Recipient ID" className="px-3 py-2 bg-[#2A3942] border border-[#2A3942] rounded-lg text-[#E9EDEF] placeholder-[#8696A0] text-sm focus:outline-none focus:border-[#00A884] flex-1 min-w-[150px]" />
          <input type="text" value={messageText} onChange={(e) => setMessageText(e.target.value)}
            placeholder="Message..." onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            className="px-3 py-2 bg-[#2A3942] border border-[#2A3942] rounded-lg text-[#E9EDEF] placeholder-[#8696A0] text-sm focus:outline-none focus:border-[#00A884] flex-[2] min-w-[200px]" />
          <button onClick={handleSend} disabled={sending || !selectedSession || !recipient || !messageText}
            className="px-4 py-2 bg-[#00A884] hover:bg-[#00C49A] text-white rounded-lg text-sm font-medium disabled:opacity-50">
            {sending ? '...' : 'Send'}
          </button>
        </div>
      </div>

      {/* Platform Filter */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setFilterPlatform('')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium ${!filterPlatform ? 'bg-[#00A884] text-white' : 'bg-[#2A3942] text-[#8696A0]'}`}>
          All Platforms
        </button>
        {Object.entries(PLATFORM_ICONS).map(([key, icon]) => (
          <button key={key} onClick={() => setFilterPlatform(key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1 ${filterPlatform === key ? 'text-white' : 'bg-[#2A3942] text-[#8696A0]'}`}
            style={filterPlatform === key ? { backgroundColor: PLATFORM_COLORS[key] } : {}}>
            {icon} {key}
          </button>
        ))}
      </div>

      {/* Messages Stream */}
      <div className="space-y-2">
        {inboxMessages.length === 0 ? (
          <div className="bg-[#202C33] border border-[#2A3942] rounded-lg p-8 text-center">
            <p className="text-[#8696A0]">No messages yet</p>
            <p className="text-sm text-[#8696A0] mt-1">Messages from all platforms will appear here</p>
          </div>
        ) : (
          inboxMessages.map((msg) => (
            <div key={msg.id} className="bg-[#202C33] border border-[#2A3942] rounded-lg p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{PLATFORM_ICONS[msg.session?.platform || ''] || '💬'}</span>
                  <span className="text-xs font-medium" style={{ color: PLATFORM_COLORS[msg.session?.platform || ''] || '#8696A0' }}>
                    {msg.session?.name || 'Unknown'}
                  </span>
                  <span className="text-xs text-[#8696A0]">
                    {msg.fromMe ? '→' : '←'} {msg.platformId}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${msg.fromMe ? 'bg-blue-900/30 text-blue-300' : 'bg-green-900/30 text-green-300'}`}>
                    {msg.fromMe ? 'Sent' : 'Received'}
                  </span>
                  <span className="text-xs text-[#8696A0]">
                    {new Date(msg.timestamp).toLocaleString()}
                  </span>
                </div>
              </div>
              <p className="text-sm text-[#E9EDEF]">{msg.content}</p>
              {msg.type !== 'text' && (
                <span className="text-xs text-[#8696A0] mt-1 inline-block bg-[#2A3942] px-2 py-0.5 rounded">{msg.type}</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
