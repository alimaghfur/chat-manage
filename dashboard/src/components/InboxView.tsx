'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { messages as messagesApi, sessions as sessionsApi } from '@/lib/api';

interface InboxViewProps {
  apiKey: string;
}

interface Conversation {
  id: string;
  sessionId: string;
  platformId: string;
  pushName?: string;
  phone?: string;
  username?: string;
  avatar?: string;
  isGroup: boolean;
  lastMessage?: string;
  lastMsgTime?: string;
  unreadCount: number;
  session?: { id: string; name: string; platform: string; phone?: string; username?: string };
}

interface Message {
  id: string;
  sessionId: string;
  platformChatId: string;
  senderName?: string;
  content: string;
  type: string;
  mediaUrl?: string;
  fromMe: boolean;
  status: string;
  timestamp: string;
  externalMsgId?: string;
  quotedContent?: string;
  isForwarded?: boolean;
  isStarred?: boolean;
}

interface Session {
  id: string;
  name: string;
  platform: string;
  status: string;
}

const PLATFORM_ICONS: Record<string, string> = {
  whatsapp: '💬', whatsapp_api: '📱', telegram: '✈️', instagram: '📸', messenger: '💭',
};
const PLATFORM_COLORS: Record<string, string> = {
  whatsapp: '#25D366', whatsapp_api: '#128C7E', telegram: '#0088CC', instagram: '#E4405F', messenger: '#0084FF',
};

export default function InboxView({ apiKey }: InboxViewProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [sessionsList, setSessionsList] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterPlatform, setFilterPlatform] = useState<string>('');
  const [selectedChat, setSelectedChat] = useState<Conversation | null>(null);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchConversations = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (filterPlatform) params.platform = filterPlatform;
      const data = await messagesApi.conversations(apiKey, params);
      setConversations(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [apiKey, filterPlatform]);

  const fetchSessions = useCallback(async () => {
    try {
      const data = await sessionsApi.list(apiKey);
      setSessionsList((data.data || []).filter((s: Session) => s.status === 'connected'));
    } catch { /* ignore */ }
  }, [apiKey]);

  useEffect(() => {
    fetchConversations();
    fetchSessions();
    const interval = setInterval(fetchConversations, 5000);
    return () => clearInterval(interval);
  }, [fetchConversations, fetchSessions]);

  const openChat = async (conv: Conversation) => {
    setSelectedChat(conv);
    setChatLoading(true);
    try {
      const data = await messagesApi.list(conv.sessionId, conv.platformId, apiKey);
      setChatMessages(data.data || []);
      // Mark as read
      await messagesApi.markRead({ sessionId: conv.sessionId, to: conv.platformId }, apiKey).catch(() => {});
      // Update unread locally
      setConversations((prev) => prev.map((c) => c.id === conv.id ? { ...c, unreadCount: 0 } : c));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setChatLoading(false);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Poll for new messages in open chat
  useEffect(() => {
    if (!selectedChat) return;
    const interval = setInterval(async () => {
      try {
        const data = await messagesApi.list(selectedChat.sessionId, selectedChat.platformId, apiKey);
        setChatMessages(data.data || []);
      } catch { /* ignore */ }
    }, 4000);
    return () => clearInterval(interval);
  }, [selectedChat, apiKey]);

  const handleSend = async () => {
    if (!selectedChat || !messageText.trim()) return;
    setSending(true);
    try {
      await messagesApi.sendText({ sessionId: selectedChat.sessionId, to: selectedChat.platformId, text: messageText }, apiKey);
      setMessageText('');
      // Refresh messages
      const data = await messagesApi.list(selectedChat.sessionId, selectedChat.platformId, apiKey);
      setChatMessages(data.data || []);
      fetchConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (c.pushName?.toLowerCase().includes(q) || c.phone?.includes(q) || c.username?.toLowerCase().includes(q) || c.platformId.includes(q));
  });

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-[#00A884] border-t-transparent rounded-full animate-spin"></div></div>;
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] -m-6">
      {/* Left Panel - Conversation List */}
      <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-[360px] border-r border-[#2A3942] bg-[#111B21]`}>
        {/* Header */}
        <div className="p-3 border-b border-[#2A3942]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-[#E9EDEF]">
              Inbox {totalUnread > 0 && <span className="ml-2 text-xs bg-[#00A884] text-white px-2 py-0.5 rounded-full">{totalUnread}</span>}
            </h2>
          </div>
          {/* Search */}
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full px-3 py-2 bg-[#202C33] border border-[#2A3942] rounded-lg text-sm text-[#E9EDEF] placeholder-[#8696A0] focus:outline-none focus:border-[#00A884]" />
          {/* Platform Filter */}
          <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1">
            <button onClick={() => setFilterPlatform('')}
              className={`px-2.5 py-1 rounded-full text-xs shrink-0 ${!filterPlatform ? 'bg-[#00A884] text-white' : 'bg-[#202C33] text-[#8696A0]'}`}>All</button>
            {Object.entries(PLATFORM_ICONS).map(([key, icon]) => (
              <button key={key} onClick={() => setFilterPlatform(key)}
                className={`px-2.5 py-1 rounded-full text-xs shrink-0 flex items-center gap-1 ${filterPlatform === key ? 'text-white' : 'bg-[#202C33] text-[#8696A0]'}`}
                style={filterPlatform === key ? { backgroundColor: PLATFORM_COLORS[key] } : {}}>
                {icon}
              </button>
            ))}
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.length === 0 ? (
            <div className="text-center py-12 text-[#8696A0]">
              <p className="text-3xl mb-2">📭</p>
              <p className="text-sm">No conversations yet</p>
            </div>
          ) : (
            filteredConversations.map((conv) => (
              <button key={conv.id} onClick={() => openChat(conv)}
                className={`w-full flex items-center gap-3 px-3 py-3 hover:bg-[#202C33] border-b border-[#2A3942]/50 transition-colors text-left ${selectedChat?.id === conv.id ? 'bg-[#2A3942]' : ''}`}>
                {/* Avatar */}
                <div className="relative shrink-0">
                  <div className="w-12 h-12 rounded-full bg-[#2A3942] flex items-center justify-center text-lg">
                    {conv.isGroup ? '👥' : (conv.avatar ? <img src={conv.avatar} className="w-12 h-12 rounded-full object-cover" alt="" /> : '👤')}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 text-xs">{PLATFORM_ICONS[conv.session?.platform || '']}</span>
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-[#E9EDEF] truncate">{conv.pushName || conv.username || conv.phone || conv.platformId}</span>
                    <span className="text-xs text-[#8696A0] shrink-0 ml-2">
                      {conv.lastMsgTime ? new Date(conv.lastMsgTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-xs text-[#8696A0] truncate">{conv.lastMessage || 'No messages'}</span>
                    {conv.unreadCount > 0 && (
                      <span className="ml-2 shrink-0 bg-[#00A884] text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-medium">
                        {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right Panel - Chat View */}
      <div className={`${selectedChat ? 'flex' : 'hidden md:flex'} flex-col flex-1 bg-[#0B141A]`}>
        {!selectedChat ? (
          <div className="flex-1 flex items-center justify-center text-[#8696A0]">
            <div className="text-center">
              <p className="text-5xl mb-4">💬</p>
              <p className="text-lg font-medium">Multi-Platform Chat Manager</p>
              <p className="text-sm mt-1">Select a conversation to start chatting</p>
              <div className="flex justify-center gap-3 mt-4 text-2xl">
                <span title="WhatsApp">💬</span>
                <span title="Telegram">✈️</span>
                <span title="Instagram">📸</span>
                <span title="Messenger">💭</span>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="flex items-center gap-3 px-4 py-3 bg-[#202C33] border-b border-[#2A3942]">
              <button onClick={() => setSelectedChat(null)} className="md:hidden p-1 text-[#8696A0]">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <div className="w-10 h-10 rounded-full bg-[#2A3942] flex items-center justify-center text-lg">
                {selectedChat.isGroup ? '👥' : '👤'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#E9EDEF] truncate">{selectedChat.pushName || selectedChat.username || selectedChat.platformId}</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs" style={{ color: PLATFORM_COLORS[selectedChat.session?.platform || ''] }}>
                    {PLATFORM_ICONS[selectedChat.session?.platform || '']} {selectedChat.session?.name}
                  </span>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'200\' height=\'200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 0h200v200H0z\' fill=\'%23091520\'/%3E%3C/svg%3E")' }}>
              {chatLoading ? (
                <div className="flex items-center justify-center h-32"><div className="w-6 h-6 border-2 border-[#00A884] border-t-transparent rounded-full animate-spin"></div></div>
              ) : chatMessages.length === 0 ? (
                <div className="text-center text-[#8696A0] py-12"><p className="text-sm">No messages in this conversation</p></div>
              ) : (
                chatMessages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.fromMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-lg px-3 py-2 ${msg.fromMe ? 'bg-[#005C4B]' : 'bg-[#202C33]'}`}>
                      {!msg.fromMe && msg.senderName && (
                        <p className="text-xs font-medium text-[#00A884] mb-0.5">{msg.senderName}</p>
                      )}
                      {msg.quotedContent && (
                        <div className="border-l-2 border-[#00A884] pl-2 mb-1 text-xs text-[#8696A0] bg-black/10 rounded py-1">{msg.quotedContent}</div>
                      )}
                      {msg.isForwarded && <p className="text-xs text-[#8696A0] italic mb-0.5">Forwarded</p>}
                      {msg.type !== 'text' && msg.type !== 'reaction' && (
                        <span className="inline-block bg-black/20 text-xs px-1.5 py-0.5 rounded mb-1 text-[#8696A0]">{msg.type}</span>
                      )}
                      <p className="text-sm text-[#E9EDEF] whitespace-pre-wrap break-words">{msg.content}</p>
                      <div className="flex items-center justify-end gap-1 mt-1">
                        <span className="text-[10px] text-[#8696A0]">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {msg.fromMe && (
                          <span className="text-[10px]">
                            {msg.status === 'read' ? '✓✓' : msg.status === 'delivered' ? '✓✓' : msg.status === 'sent' ? '✓' : '⏳'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="px-4 py-3 bg-[#202C33] border-t border-[#2A3942]">
              {error && <div className="text-xs text-red-400 mb-2">{error}<button onClick={() => setError(null)} className="ml-1 underline">x</button></div>}
              <div className="flex gap-2">
                <input type="text" value={messageText} onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2.5 bg-[#2A3942] border border-[#2A3942] rounded-full text-sm text-[#E9EDEF] placeholder-[#8696A0] focus:outline-none focus:border-[#00A884]"
                  disabled={sending} />
                <button onClick={handleSend} disabled={sending || !messageText.trim()}
                  className="w-10 h-10 bg-[#00A884] hover:bg-[#00C49A] text-white rounded-full flex items-center justify-center disabled:opacity-50 transition-colors">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
