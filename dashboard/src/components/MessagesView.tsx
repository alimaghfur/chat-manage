'use client';

import { useState, useEffect, useCallback } from 'react';
import { sessions as sessionsApi, messages as messagesApi } from '@/lib/api';

interface MessagesViewProps {
  apiKey: string;
}

interface Session {
  id: string;
  name: string;
  status: string;
}

interface SentMessage {
  id: string;
  to: string;
  text: string;
  timestamp: string;
  status: string;
}

export default function MessagesView({ apiKey }: MessagesViewProps) {
  const [sessionsList, setSessionsList] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [recipient, setRecipient] = useState('');
  const [messageText, setMessageText] = useState('');
  const [sentMessages, setSentMessages] = useState<SentMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const data = await sessionsApi.list(apiKey);
      const list = data.data || data || [];
      setSessionsList(Array.isArray(list) ? list.filter((s: Session) => s.status === 'connected') : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleSend = async () => {
    if (!selectedSession || !recipient.trim() || !messageText.trim()) return;

    setSending(true);
    setError(null);
    setSuccess(null);

    try {
      await messagesApi.sendText({ sessionId: selectedSession, to: recipient, text: messageText }, apiKey);

      const newMessage: SentMessage = {
        id: Date.now().toString(),
        to: recipient,
        text: messageText,
        timestamp: new Date().toISOString(),
        status: 'sent',
      };

      setSentMessages((prev) => [newMessage, ...prev]);
      setMessageText('');
      setSuccess('Message sent successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
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
      <h1 className="text-2xl font-bold text-[#E9EDEF]">Messages</h1>

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 text-red-300 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">
            Dismiss
          </button>
        </div>
      )}

      {success && (
        <div className="bg-green-900/20 border border-green-800 rounded-lg p-3 text-green-300 text-sm">
          {success}
        </div>
      )}

      {/* Message Composer */}
      <div className="bg-[#202C33] border border-[#2A3942] rounded-lg p-6">
        <h2 className="text-lg font-semibold text-[#E9EDEF] mb-4">Send Message</h2>
        <div className="space-y-4">
          {/* Session Selector */}
          <div>
            <label className="block text-sm text-[#8696A0] mb-1">Session</label>
            <select
              value={selectedSession}
              onChange={(e) => setSelectedSession(e.target.value)}
              className="w-full px-3 py-2 bg-[#2A3942] border border-[#2A3942] rounded-lg text-[#E9EDEF] focus:outline-none focus:border-[#00A884]"
            >
              <option value="">Select a session...</option>
              {sessionsList.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name || session.id}
                </option>
              ))}
            </select>
            {sessionsList.length === 0 && (
              <p className="text-xs text-[#8696A0] mt-1">No connected sessions available</p>
            )}
          </div>

          {/* Recipient */}
          <div>
            <label className="block text-sm text-[#8696A0] mb-1">Recipient (Phone Number)</label>
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="e.g., 15551234567 (country code + number, no + or @)"
              className="w-full px-3 py-2 bg-[#2A3942] border border-[#2A3942] rounded-lg text-[#E9EDEF] placeholder-[#8696A0] focus:outline-none focus:border-[#00A884]"
            />
            <p className="text-xs text-[#8696A0] mt-1">Format: Country code + phone number (e.g., 15551234567 for US, 6281234567890 for Indonesia)</p>
          </div>

          {/* Message */}
          <div>
            <label className="block text-sm text-[#8696A0] mb-1">Message</label>
            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Type your message..."
              rows={4}
              className="w-full px-3 py-2 bg-[#2A3942] border border-[#2A3942] rounded-lg text-[#E9EDEF] placeholder-[#8696A0] focus:outline-none focus:border-[#00A884] resize-none"
            />
          </div>

          {/* Send Button */}
          <button
            onClick={handleSend}
            disabled={sending || !selectedSession || !recipient.trim() || !messageText.trim()}
            className="px-6 py-2 bg-[#00A884] hover:bg-[#00C49A] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? 'Sending...' : 'Send Message'}
          </button>
        </div>
      </div>

      {/* Recent Sent Messages */}
      <div className="bg-[#202C33] border border-[#2A3942] rounded-lg p-4">
        <h2 className="text-lg font-semibold text-[#E9EDEF] mb-3">Recent Sent Messages</h2>
        {sentMessages.length === 0 ? (
          <p className="text-[#8696A0] text-sm">No messages sent in this session</p>
        ) : (
          <div className="space-y-3">
            {sentMessages.map((msg) => (
              <div
                key={msg.id}
                className="bg-[#2A3942] rounded-lg p-3 animate-slide-in"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-[#8696A0]">To: {msg.to}</span>
                  <span className="text-xs text-[#8696A0]">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-sm text-[#E9EDEF]">{msg.text}</p>
                <div className="flex items-center gap-1 mt-1">
                  <svg className="w-3 h-3 text-[#00A884]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                  </svg>
                  <span className="text-xs text-[#00A884]">{msg.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
