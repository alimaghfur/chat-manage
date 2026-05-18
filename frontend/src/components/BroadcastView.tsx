'use client';

import { useState, useEffect } from 'react';
import { broadcastsApi, contactsApi } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { Broadcast, Contact } from '@/lib/types';

interface BroadcastViewProps {
  sessionId: string;
}

export default function BroadcastView({ sessionId }: BroadcastViewProps) {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [searchContact, setSearchContact] = useState('');

  useEffect(() => {
    loadBroadcasts();
    loadContacts();

    const socket = getSocket();
    socket.on('broadcast-progress', ({ broadcastId, sentCount, failCount }) => {
      setBroadcasts((prev) =>
        prev.map((b) => (b.id === broadcastId ? { ...b, sentCount, failCount, status: 'sending' } : b))
      );
    });
    socket.on('broadcast-complete', ({ broadcastId }) => {
      setBroadcasts((prev) =>
        prev.map((b) => (b.id === broadcastId ? { ...b, status: 'completed' } : b))
      );
    });

    return () => {
      socket.off('broadcast-progress');
      socket.off('broadcast-complete');
    };
  }, [sessionId]);

  async function loadBroadcasts() {
    try {
      const data = await broadcastsApi.getBySession(sessionId);
      setBroadcasts(data);
    } catch (error) {
      console.error('Failed to load broadcasts:', error);
    }
  }

  async function loadContacts() {
    try {
      const data = await contactsApi.getBySession(sessionId);
      setContacts(data);
    } catch (error) {
      console.error('Failed to load contacts:', error);
    }
  }

  async function handleSubmit() {
    if (!name.trim() || !message.trim() || selectedContacts.length === 0) return;

    setSending(true);
    try {
      const recipients = selectedContacts.map((id) => {
        const contact = contacts.find((c) => c.id === id);
        return contact?.jid || '';
      }).filter(Boolean);

      const broadcast = await broadcastsApi.create({
        sessionId,
        name: name.trim(),
        message: message.trim(),
        recipients,
      });

      setBroadcasts((prev) => [broadcast, ...prev]);
      resetForm();
    } catch (error) {
      console.error('Failed to create broadcast:', error);
    }
    setSending(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Yakin ingin menghapus broadcast ini?')) return;
    try {
      await broadcastsApi.delete(id);
      setBroadcasts((prev) => prev.filter((b) => b.id !== id));
    } catch (error) {
      console.error('Failed to delete broadcast:', error);
    }
  }

  function resetForm() {
    setShowForm(false);
    setName('');
    setMessage('');
    setSelectedContacts([]);
    setSearchContact('');
  }

  function toggleContact(id: string) {
    setSelectedContacts((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  function selectAll() {
    if (selectedContacts.length === filteredContacts.length) {
      setSelectedContacts([]);
    } else {
      setSelectedContacts(filteredContacts.map((c) => c.id));
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

  const totalSent = broadcasts.reduce((acc, b) => acc + b.sentCount, 0);
  const totalFailed = broadcasts.reduce((acc, b) => acc + b.failCount, 0);

  return (
    <div className="h-full overflow-y-auto bg-[#0B141A] p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-start mb-8 animate-fadeIn">
          <div>
            <h1 className="text-2xl font-bold text-[#E9EDEF]">Broadcast</h1>
            <p className="text-[#8696A0] text-sm mt-1">
              Kirim pesan massal ke banyak kontak sekaligus
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="bg-[#00A884] hover:bg-[#00C49A] text-white px-5 py-2.5 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 shadow-lg shadow-[#00A884]/20"
          >
            <PlusIcon className="w-4 h-4" />
            <span>Buat Broadcast</span>
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6 animate-fadeIn">
          <div className="bg-[#202C33] rounded-xl border border-[#2A3942] p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <MegaphoneIcon className="w-4.5 h-4.5 text-blue-400" />
              </div>
              <div>
                <p className="text-[#8696A0] text-xs">Total Broadcast</p>
                <p className="text-lg font-bold text-[#E9EDEF]">{broadcasts.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-[#202C33] rounded-xl border border-[#2A3942] p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <CheckIcon className="w-4.5 h-4.5 text-emerald-400" />
              </div>
              <div>
                <p className="text-[#8696A0] text-xs">Pesan Terkirim</p>
                <p className="text-lg font-bold text-[#E9EDEF]">{totalSent}</p>
              </div>
            </div>
          </div>
          <div className="bg-[#202C33] rounded-xl border border-[#2A3942] p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center">
                <XIcon className="w-4.5 h-4.5 text-red-400" />
              </div>
              <div>
                <p className="text-[#8696A0] text-xs">Gagal</p>
                <p className="text-lg font-bold text-[#E9EDEF]">{totalFailed}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Form Modal */}
        {showForm && (
          <div className="modal-overlay" onClick={resetForm}>
            <div className="modal-content w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-[#00A884]/10 flex items-center justify-center">
                  <MegaphoneIcon className="w-5 h-5 text-[#00A884]" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[#E9EDEF]">Buat Broadcast Baru</h3>
                  <p className="text-xs text-[#8696A0]">Kirim pesan ke banyak kontak</p>
                </div>
              </div>

              <div className="space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-xs text-[#8696A0] mb-1.5 font-medium">Nama Broadcast</label>
                  <input
                    type="text"
                    placeholder="Contoh: Promo Akhir Tahun, Info Update"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-[#2A3942] border border-[#3B4A54] rounded-lg px-4 py-3 text-[#E9EDEF] placeholder-[#8696A0] focus:outline-none focus:ring-2 focus:ring-[#00A884] focus:border-transparent text-sm"
                    autoFocus
                  />
                </div>

                {/* Message */}
                <div>
                  <label className="block text-xs text-[#8696A0] mb-1.5 font-medium">Pesan</label>
                  <textarea
                    placeholder="Tulis pesan broadcast yang akan dikirim..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={4}
                    className="w-full bg-[#2A3942] border border-[#3B4A54] rounded-lg px-4 py-3 text-[#E9EDEF] placeholder-[#8696A0] focus:outline-none focus:ring-2 focus:ring-[#00A884] focus:border-transparent text-sm resize-none"
                  />
                </div>

                {/* Recipients */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-xs text-[#8696A0] font-medium">
                      Penerima ({selectedContacts.length} dipilih)
                    </label>
                    <button
                      onClick={selectAll}
                      className="text-[11px] text-[#00A884] hover:text-[#00C49A] font-medium"
                    >
                      {selectedContacts.length === filteredContacts.length ? 'Hapus Semua' : 'Pilih Semua'}
                    </button>
                  </div>

                  {/* Search contacts */}
                  <div className="relative mb-2">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8696A0]" />
                    <input
                      type="text"
                      placeholder="Cari kontak..."
                      value={searchContact}
                      onChange={(e) => setSearchContact(e.target.value)}
                      className="w-full bg-[#2A3942] border border-[#3B4A54] rounded-lg pl-9 pr-4 py-2 text-[#E9EDEF] placeholder-[#8696A0] focus:outline-none focus:ring-1 focus:ring-[#00A884] text-xs"
                    />
                  </div>

                  <div className="border border-[#3B4A54] rounded-lg max-h-48 overflow-y-auto bg-[#2A3942]">
                    {filteredContacts.map((contact) => (
                      <label
                        key={contact.id}
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#202C33] cursor-pointer border-b border-[#3B4A54]/50 last:border-b-0 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedContacts.includes(contact.id)}
                          onChange={() => toggleContact(contact.id)}
                          className="w-4 h-4 rounded border-[#3B4A54] text-[#00A884] focus:ring-[#00A884] bg-[#111B21]"
                        />
                        <div className="w-7 h-7 rounded-full bg-[#111B21] flex items-center justify-center text-[10px] text-[#8696A0] font-semibold flex-shrink-0">
                          {(contact.name || contact.pushName || contact.phone)[0]?.toUpperCase()}
                        </div>
                        <span className="text-xs text-[#E9EDEF] flex-1 truncate">
                          {contact.name || contact.pushName || contact.phone}
                        </span>
                        <span className="text-[10px] text-[#8696A0]">+{contact.phone}</span>
                      </label>
                    ))}
                    {filteredContacts.length === 0 && (
                      <p className="text-center text-[#8696A0] text-xs py-6">
                        {searchContact ? 'Tidak ditemukan' : 'Belum ada kontak'}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-[#2A3942]">
                <button
                  onClick={resetForm}
                  className="px-4 py-2.5 text-[#8696A0] hover:text-[#E9EDEF] hover:bg-[#2A3942] rounded-lg transition-colors text-sm"
                >
                  Batal
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={sending || !name.trim() || !message.trim() || selectedContacts.length === 0}
                  className="px-5 py-2.5 bg-[#00A884] text-white rounded-lg hover:bg-[#00C49A] disabled:opacity-40 disabled:cursor-not-allowed transition-all font-medium text-sm inline-flex items-center gap-2"
                >
                  {sending ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Mengirim...
                    </>
                  ) : (
                    <>
                      <SendIcon className="w-4 h-4" />
                      Kirim Broadcast
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Broadcast List */}
        <div className="space-y-3 animate-fadeIn">
          {broadcasts.map((bc, i) => {
            const progress = bc.totalCount > 0 ? ((bc.sentCount + bc.failCount) / bc.totalCount) * 100 : 0;
            return (
              <div
                key={bc.id}
                className="bg-[#202C33] rounded-xl border border-[#2A3942] overflow-hidden transition-all hover:border-[#3B4A54]"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        bc.status === 'completed' ? 'bg-emerald-500/10' :
                        bc.status === 'sending' ? 'bg-amber-500/10' :
                        bc.status === 'failed' ? 'bg-red-500/10' : 'bg-[#2A3942]'
                      }`}>
                        <MegaphoneIcon className={`w-5 h-5 ${
                          bc.status === 'completed' ? 'text-emerald-400' :
                          bc.status === 'sending' ? 'text-amber-400' :
                          bc.status === 'failed' ? 'text-red-400' : 'text-[#8696A0]'
                        }`} />
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-[#E9EDEF]">{bc.name}</h4>
                        <p className="text-xs text-[#8696A0] mt-0.5">
                          {new Date(bc.createdAt).toLocaleDateString('id-ID', {
                            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={bc.status} />
                      <button
                        onClick={() => handleDelete(bc.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-[#8696A0] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Message Preview */}
                  <div className="bg-[#111B21] rounded-lg px-3 py-2 mb-3">
                    <p className="text-xs text-[#8696A0] line-clamp-2">{bc.message}</p>
                  </div>

                  {/* Progress */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="bg-[#111B21] rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            bc.status === 'completed' ? 'bg-emerald-400' :
                            bc.status === 'failed' ? 'bg-red-400' : 'bg-[#00A884]'
                          }`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex gap-3 text-[11px] flex-shrink-0">
                      <span className="text-emerald-400">{bc.sentCount} terkirim</span>
                      {bc.failCount > 0 && <span className="text-red-400">{bc.failCount} gagal</span>}
                      <span className="text-[#8696A0]">{bc.totalCount} total</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Empty State */}
        {broadcasts.length === 0 && !showForm && (
          <div className="text-center py-20 animate-fadeIn">
            <div className="w-20 h-20 rounded-full bg-[#202C33] flex items-center justify-center mx-auto mb-5">
              <MegaphoneIcon className="w-10 h-10 text-[#2A3942]" />
            </div>
            <h2 className="text-xl font-semibold text-[#E9EDEF] mb-2">Belum Ada Broadcast</h2>
            <p className="text-[#8696A0] text-sm mb-8 max-w-sm mx-auto">
              Kirim pesan ke banyak kontak sekaligus dengan fitur broadcast
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="bg-[#00A884] hover:bg-[#00C49A] text-white px-6 py-3 rounded-lg font-medium transition-all shadow-lg shadow-[#00A884]/20 inline-flex items-center gap-2"
            >
              <PlusIcon className="w-4 h-4" />
              Buat Broadcast Pertama
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Status Badge
function StatusBadge({ status }: { status: string }) {
  const config = {
    completed: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Selesai' },
    sending: { bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'Mengirim' },
    failed: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Gagal' },
    pending: { bg: 'bg-[#2A3942]', text: 'text-[#8696A0]', label: 'Pending' },
  };
  const c = config[status as keyof typeof config] || config.pending;

  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>
      {c.label}
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

function MegaphoneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 11 18-5v12L3 13v-2z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
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

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}
