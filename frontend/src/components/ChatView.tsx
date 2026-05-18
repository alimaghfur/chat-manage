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
      // Update contacts list
      setContacts((prev) => {
        const exists = prev.find((c) => c.jid === msg.jid);
        if (exists) {
          return prev.map((c) =>
            c.jid === msg.jid ? { ...c, messages: [msg], updatedAt: msg.timestamp } : c
          ).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        }
        return [{ ...msg.contact, messages: [msg] }, ...prev];
      });

      // Update messages if viewing this conversation
      if (msg.jid === activeContact?.jid) {
        setMessages((prev) => [...prev, msg]);
      }
    });

    return () => {
      socket.off('new-message');
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
      setInput(content); // Restore message on failure
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

  return (
    <div className="flex h-full">
      {/* Contact List */}
      <div className="w-80 border-r bg-white flex flex-col">
        {/* Search & Add */}
        <div className="p-3 border-b">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Cari kontak..."
              value={searchContact}
              onChange={(e) => setSearchContact(e.target.value)}
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wa-green"
            />
            <button
              onClick={() => setShowAddContact(true)}
              className="bg-wa-green text-white px-3 py-2 rounded-lg text-sm hover:bg-green-600"
            >
              +
            </button>
          </div>
        </div>

        {/* Contacts */}
        <div className="flex-1 overflow-y-auto">
          {filteredContacts.map((contact) => (
            <div
              key={contact.id}
              onClick={() => setActiveContact(contact)}
              className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 border-b border-gray-50 ${
                activeContact?.id === contact.id ? 'bg-wa-light/30' : ''
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-lg">
                {(contact.name || contact.pushName || '?')[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between">
                  <p className="text-sm font-medium truncate">
                    {contact.name || contact.pushName || contact.phone}
                  </p>
                  {contact.messages?.[0] && (
                    <span className="text-xs text-gray-400">
                      {formatTime(contact.messages[0].timestamp)}
                    </span>
                  )}
                </div>
                {contact.messages?.[0] && (
                  <p className="text-xs text-gray-500 truncate">
                    {contact.messages[0].fromMe ? '✓ ' : ''}
                    {contact.messages[0].content}
                  </p>
                )}
              </div>
            </div>
          ))}
          {filteredContacts.length === 0 && (
            <div className="text-center py-10 text-gray-400 text-sm">
              {searchContact ? 'Kontak tidak ditemukan' : 'Belum ada percakapan'}
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col bg-wa-chat-bg">
        {activeContact ? (
          <>
            {/* Chat Header */}
            <div className="bg-wa-header text-white px-4 py-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-lg">
                {(activeContact.name || activeContact.pushName || '?')[0]?.toUpperCase()}
              </div>
              <div>
                <p className="font-medium">
                  {activeContact.name || activeContact.pushName || activeContact.phone}
                </p>
                <p className="text-xs text-white/70">+{activeContact.phone}</p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {loading ? (
                <div className="text-center py-10 text-gray-400">Loading...</div>
              ) : (
                messages.map((msg, i) => {
                  const showDate =
                    i === 0 ||
                    new Date(msg.timestamp).toDateString() !==
                      new Date(messages[i - 1].timestamp).toDateString();

                  return (
                    <div key={msg.id}>
                      {showDate && (
                        <div className="text-center my-3">
                          <span className="bg-white/80 text-gray-500 text-xs px-3 py-1 rounded-full">
                            {formatDate(msg.timestamp)}
                          </span>
                        </div>
                      )}
                      <div className={`flex ${msg.fromMe ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={
                            msg.fromMe ? 'chat-bubble-sent' : 'chat-bubble-received'
                          }
                        >
                          <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                          <div className="flex items-center justify-end gap-1 mt-1">
                            <span className="text-[10px] text-gray-400">
                              {formatTime(msg.timestamp)}
                            </span>
                            {msg.fromMe && (
                              <span className="text-[10px]">
                                {msg.status === 'read'
                                  ? '✓✓'
                                  : msg.status === 'delivered'
                                  ? '✓✓'
                                  : '✓'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="bg-white px-4 py-3 border-t flex gap-2">
              <input
                type="text"
                placeholder="Ketik pesan..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                className="flex-1 border rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-wa-green"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="bg-wa-green text-white px-5 py-2.5 rounded-full hover:bg-green-600 disabled:opacity-50 transition-colors"
              >
                Kirim
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-6xl mb-4">💬</div>
              <h2 className="text-xl font-semibold text-gray-600">Pilih Kontak</h2>
              <p className="text-gray-400 mt-2">Pilih percakapan dari daftar di sebelah kiri</p>
            </div>
          </div>
        )}
      </div>

      {/* Add Contact Modal */}
      {showAddContact && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-bold mb-4">Tambah Kontak Baru</h3>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Nomor WhatsApp (misal: 628123456789)"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="w-full border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-wa-green"
                autoFocus
              />
              <input
                type="text"
                placeholder="Nama (opsional)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-wa-green"
              />
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={() => { setShowAddContact(false); setNewPhone(''); setNewName(''); }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Batal
              </button>
              <button
                onClick={handleAddContact}
                disabled={!newPhone.trim()}
                className="px-4 py-2 bg-wa-green text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
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
