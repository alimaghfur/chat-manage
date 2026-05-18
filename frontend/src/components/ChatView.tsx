'use client';

import { useState, useEffect, useRef } from 'react';
import { contactsApi, messagesApi } from '@/lib/api';
import { getSocket, joinSession } from '@/lib/socket';
import { Contact, Message } from '@/lib/types';

interface ChatViewProps {
  sessionId: string;
}

export default function ChatView({ sessionId }: ChatViewProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchContact, setSearchContact] = useState('');
  const [showAddContact, setShowAddContact] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadContacts();
    joinSession(sessionId);

    const socket = getSocket();
    socket.on('new-message', (msg: Message & { contact: Contact }) => {
      setContacts((prev) => {
        const exists = prev.find((c) => c.jid === msg.jid);
        if (exists) {
          return prev.map((c) =>
            c.jid === msg.jid ? { ...c, messages: [msg], updatedAt: msg.timestamp } : c
          ).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        }
        return [{ ...msg.contact, messages: [msg] }, ...prev];
      });

      if (msg.jid === activeContact?.jid) {
        setMessages((prev) => [...prev, msg]);
      }
    });

    socket.on('message-status', ({ messageId, status }) => {
      setMessages((prev) =>
        prev.map((m) => (m.messageId === messageId ? { ...m, status } : m))
      );
    });

    return () => {
      socket.off('new-message');
      socket.off('message-status');
    };
  }, [sessionId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (activeContact) {
      loadMessages(activeContact.jid);
    }
  }, [activeContact]);

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  async function loadContacts() {
    try {
      const data = await contactsApi.getBySession(sessionId);
      setContacts(data);
    } catch (error) {
      console.error('Failed to load contacts:', error);
    }
  }

  async function loadMessages(jid: string) {
    setLoading(true);
    try {
      const data = await messagesApi.getConversation(sessionId, jid);
      setMessages(data.messages);
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
    setLoading(false);
  }

  async function handleSend() {
    if (!input.trim() || !activeContact) return;

    const content = input.trim();
    setInput('');

    try {
      await messagesApi.send(sessionId, activeContact.jid, content);
    } catch (error) {
      console.error('Failed to send message:', error);
      setInput(content);
    }
  }

  async function handleAddContact() {
    if (!newPhone.trim()) return;
    try {
      const contact = await contactsApi.add(sessionId, newPhone.trim(), newName.trim());
      setContacts((prev) => [contact, ...prev]);
      setShowAddContact(false);
      setNewPhone('');
      setNewName('');
    } catch (error) {
      console.error('Failed to add contact:', error);
    }
  }

  const filteredContacts = contacts.filter((c) => {
    const search = searchContact.toLowerCase();
    return (
      (c.name || '').toLowerCase().includes(search) ||
      (c.pushName || '').toLowerCase().includes(search) ||
      c.phone.includes(search)
    );
  });

  function formatTime(timestamp: string) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  }

  function formatDate(timestamp: string) {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Hari ini';
    if (date.toDateString() === yesterday.toDateString()) return 'Kemarin';
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'read': return <DoubleCheckIcon className="w-4 h-4 text-[#53BDEB]" />;
      case 'delivered': return <DoubleCheckIcon className="w-4 h-4 text-[#8696A0]" />;
      case 'sent': return <SingleCheckIcon className="w-4 h-4 text-[#8696A0]" />;
      case 'pending': return <ClockIcon className="w-3.5 h-3.5 text-[#8696A0]" />;
      default: return null;
    }
  }

  return (
    <div className="flex h-full">
      {/* Contact List Panel */}
      <div className="w-[360px] border-r border-[#2A3942] bg-[#111B21] flex flex-col">
        {/* Panel Header */}
        <div className="h-[60px] px-4 flex items-center justify-between border-b border-[#2A3942]">
          <h2 className="text-[#E9EDEF] font-semibold text-base">Percakapan</h2>
          <button
            onClick={() => setShowAddContact(true)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#8696A0] hover:text-[#E9EDEF] hover:bg-[#2A3942] transition-colors"
            title="Tambah kontak"
          >
            <UserPlusIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8696A0]" />
            <input
              type="text"
              placeholder="Cari atau mulai chat baru"
              value={searchContact}
              onChange={(e) => setSearchContact(e.target.value)}
              className="w-full bg-[#202C33] border-none rounded-lg pl-10 pr-4 py-2 text-sm text-[#E9EDEF] placeholder-[#8696A0] focus:outline-none focus:ring-1 focus:ring-[#00A884]"
            />
          </div>
        </div>

        {/* Contacts List */}
        <div className="flex-1 overflow-y-auto">
          {filteredContacts.map((contact) => {
            const isActive = activeContact?.id === contact.id;
            const lastMsg = contact.messages?.[0];
            return (
              <div
                key={contact.id}
                onClick={() => setActiveContact(contact)}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-b border-[#2A3942]/50 ${
                  isActive ? 'bg-[#2A3942]' : 'hover:bg-[#202C33]'
                }`}
              >
                {/* Avatar */}
                <div className="w-12 h-12 rounded-full bg-[#2A3942] flex items-center justify-center text-[#8696A0] text-base font-semibold flex-shrink-0">
                  {(contact.name || contact.pushName || contact.phone)[0]?.toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-[#E9EDEF] text-sm font-medium truncate">
                      {contact.name || contact.pushName || `+${contact.phone}`}
                    </p>
                    {lastMsg && (
                      <span className="text-[11px] text-[#8696A0] flex-shrink-0 ml-2">
                        {formatTime(lastMsg.timestamp)}
                      </span>
                    )}
                  </div>
                  {lastMsg && (
                    <div className="flex items-center gap-1 mt-0.5">
                      {lastMsg.fromMe && (
                        <span className="flex-shrink-0">{getStatusIcon(lastMsg.status)}</span>
                      )}
                      <p className="text-[#8696A0] text-xs truncate">{lastMsg.content}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {filteredContacts.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <div className="w-16 h-16 rounded-full bg-[#202C33] flex items-center justify-center mb-4">
                <SearchIcon className="w-7 h-7 text-[#8696A0]" />
              </div>
              <p className="text-[#8696A0] text-sm text-center">
                {searchContact ? 'Kontak tidak ditemukan' : 'Belum ada percakapan'}
              </p>
              {!searchContact && (
                <button
                  onClick={() => setShowAddContact(true)}
                  className="mt-4 text-[#00A884] text-sm hover:underline"
                >
                  Tambah kontak baru
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {activeContact ? (
          <>
            {/* Chat Header */}
            <div className="h-[60px] bg-[#202C33] border-b border-[#2A3942] px-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#2A3942] flex items-center justify-center text-[#8696A0] text-sm font-semibold">
                {(activeContact.name || activeContact.pushName || activeContact.phone)[0]?.toUpperCase()}
              </div>
              <div className="flex-1">
                <p className="text-[#E9EDEF] font-medium text-sm">
                  {activeContact.name || activeContact.pushName || `+${activeContact.phone}`}
                </p>
                <p className="text-[#8696A0] text-xs">+{activeContact.phone}</p>
              </div>
              <button className="w-8 h-8 flex items-center justify-center rounded-lg text-[#8696A0] hover:text-[#E9EDEF] hover:bg-[#2A3942] transition-colors">
                <MoreIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto chat-bg-pattern p-4">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="flex items-center gap-3 text-[#8696A0]">
                    <div className="w-5 h-5 border-2 border-[#8696A0] border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm">Memuat pesan...</span>
                  </div>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="bg-[#202C33] rounded-lg px-4 py-2 text-center">
                    <p className="text-[#8696A0] text-xs">Belum ada pesan. Kirim pesan pertama!</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-1 max-w-3xl mx-auto">
                  {messages.map((msg, i) => {
                    const showDate =
                      i === 0 ||
                      new Date(msg.timestamp).toDateString() !==
                        new Date(messages[i - 1].timestamp).toDateString();

                    return (
                      <div key={msg.id}>
                        {showDate && (
                          <div className="flex justify-center my-4">
                            <span className="bg-[#182229] text-[#8696A0] text-[11px] px-3 py-1.5 rounded-lg shadow-sm">
                              {formatDate(msg.timestamp)}
                            </span>
                          </div>
                        )}
                        <div
                          className={`flex ${msg.fromMe ? 'justify-end' : 'justify-start'} animate-fadeIn`}
                        >
                          <div className={msg.fromMe ? 'chat-bubble-sent' : 'chat-bubble-received'}>
                            <p className="text-[13px] leading-[19px] whitespace-pre-wrap break-words">
                              {msg.content}
                            </p>
                            <div className="flex items-center justify-end gap-1 mt-1 -mb-0.5">
                              <span className="text-[11px] text-[#8696A0]/70">
                                {formatTime(msg.timestamp)}
                              </span>
                              {msg.fromMe && getStatusIcon(msg.status)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input Area */}
            <div className="bg-[#202C33] border-t border-[#2A3942] px-4 py-3 flex items-center gap-3">
              <button className="w-9 h-9 flex items-center justify-center rounded-full text-[#8696A0] hover:text-[#E9EDEF] hover:bg-[#2A3942] transition-colors">
                <EmojiIcon className="w-5 h-5" />
              </button>
              <button className="w-9 h-9 flex items-center justify-center rounded-full text-[#8696A0] hover:text-[#E9EDEF] hover:bg-[#2A3942] transition-colors">
                <AttachIcon className="w-5 h-5" />
              </button>
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Ketik pesan"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  className="w-full bg-[#2A3942] border-none rounded-lg px-4 py-2.5 text-sm text-[#E9EDEF] placeholder-[#8696A0] focus:outline-none focus:ring-1 focus:ring-[#00A884]"
                />
              </div>
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className={`w-9 h-9 flex items-center justify-center rounded-full transition-all ${
                  input.trim()
                    ? 'bg-[#00A884] text-white hover:bg-[#00C49A] shadow-lg shadow-[#00A884]/20'
                    : 'text-[#8696A0]'
                }`}
              >
                <SendIcon className="w-5 h-5" />
              </button>
            </div>
          </>
        ) : (
          /* Empty State */
          <div className="flex-1 flex items-center justify-center bg-[#0B141A]">
            <div className="text-center animate-fadeIn">
              <div className="w-[200px] h-[200px] mx-auto mb-8 rounded-full bg-[#202C33]/50 flex items-center justify-center">
                <ChatBubbleIcon className="w-24 h-24 text-[#2A3942]" />
              </div>
              <h2 className="text-[#E9EDEF] text-2xl font-light mb-3">WhatsApp Chat Manager</h2>
              <p className="text-[#8696A0] text-sm max-w-md mx-auto leading-relaxed">
                Kirim dan terima pesan WhatsApp. Pilih kontak dari daftar di sebelah kiri untuk memulai percakapan.
              </p>
              <div className="mt-8 flex items-center justify-center gap-2 text-[#8696A0] text-xs">
                <LockIcon className="w-3.5 h-3.5" />
                <span>End-to-end encrypted</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add Contact Modal */}
      {showAddContact && (
        <div className="modal-overlay" onClick={() => { setShowAddContact(false); setNewPhone(''); setNewName(''); }}>
          <div className="modal-content w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-lg bg-[#00A884]/10 flex items-center justify-center">
                <UserPlusIcon className="w-5 h-5 text-[#00A884]" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[#E9EDEF]">Tambah Kontak</h3>
                <p className="text-xs text-[#8696A0]">Masukkan nomor WhatsApp tujuan</p>
              </div>
            </div>
            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs text-[#8696A0] mb-1.5 font-medium">Nomor WhatsApp</label>
                <input
                  type="text"
                  placeholder="628123456789 (tanpa + dan spasi)"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="w-full bg-[#2A3942] border border-[#3B4A54] rounded-lg px-4 py-3 text-[#E9EDEF] placeholder-[#8696A0] focus:outline-none focus:ring-2 focus:ring-[#00A884] focus:border-transparent text-sm"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs text-[#8696A0] mb-1.5 font-medium">Nama (opsional)</label>
                <input
                  type="text"
                  placeholder="Nama kontak"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-[#2A3942] border border-[#3B4A54] rounded-lg px-4 py-3 text-[#E9EDEF] placeholder-[#8696A0] focus:outline-none focus:ring-2 focus:ring-[#00A884] focus:border-transparent text-sm"
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowAddContact(false); setNewPhone(''); setNewName(''); }}
                className="px-4 py-2.5 text-[#8696A0] hover:text-[#E9EDEF] hover:bg-[#2A3942] rounded-lg transition-colors text-sm"
              >
                Batal
              </button>
              <button
                onClick={handleAddContact}
                disabled={!newPhone.trim()}
                className="px-5 py-2.5 bg-[#00A884] text-white rounded-lg hover:bg-[#00C49A] disabled:opacity-40 disabled:cursor-not-allowed transition-all font-medium text-sm"
              >
                Tambah
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Icons
function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function UserPlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" x2="19" y1="8" y2="14" /><line x1="22" x2="16" y1="11" y2="11" />
    </svg>
  );
}

function MoreIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />
    </svg>
  );
}

function EmojiIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" x2="9.01" y1="9" y2="9" /><line x1="15" x2="15.01" y1="9" y2="9" />
    </svg>
  );
}

function AttachIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

function DoubleCheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 7 17l-5-5" /><path d="m22 10-7.5 7.5L13 16" />
    </svg>
  );
}

function SingleCheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function ChatBubbleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
