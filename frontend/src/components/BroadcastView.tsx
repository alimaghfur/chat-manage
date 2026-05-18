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

  useEffect(() => {
    loadBroadcasts();
    loadContacts();

    const socket = getSocket();
    socket.on('broadcast-progress', ({ broadcastId, sentCount, failCount, total }) => {
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
  }

  function toggleContact(id: string) {
    setSelectedContacts((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  function selectAll() {
    if (selectedContacts.length === contacts.length) {
      setSelectedContacts([]);
    } else {
      setSelectedContacts(contacts.map((c) => c.id));
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Broadcast</h1>
            <p className="text-gray-500">Kirim pesan massal ke banyak kontak sekaligus</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="bg-wa-green hover:bg-green-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            + Buat Broadcast
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-white rounded-xl p-6 mb-6 border">
            <h3 className="font-semibold mb-4">Buat Broadcast Baru</h3>
            <div className="grid gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Broadcast</label>
                <input
                  type="text"
                  placeholder="Contoh: Promo Akhir Tahun"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-wa-green"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pesan</label>
                <textarea
                  placeholder="Tulis pesan broadcast..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  className="w-full border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-wa-green resize-none"
                />
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Penerima ({selectedContacts.length} dipilih)
                  </label>
                  <button
                    onClick={selectAll}
                    className="text-xs text-wa-green hover:underline"
                  >
                    {selectedContacts.length === contacts.length ? 'Hapus Semua' : 'Pilih Semua'}
                  </button>
                </div>
                <div className="border rounded-lg max-h-48 overflow-y-auto">
                  {contacts.map((contact) => (
                    <label
                      key={contact.id}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                    >
                      <input
                        type="checkbox"
                        checked={selectedContacts.includes(contact.id)}
                        onChange={() => toggleContact(contact.id)}
                        className="w-4 h-4 text-wa-green rounded"
                      />
                      <span className="text-sm">
                        {contact.name || contact.pushName || contact.phone}
                      </span>
                      <span className="text-xs text-gray-400 ml-auto">+{contact.phone}</span>
                    </label>
                  ))}
                  {contacts.length === 0 && (
                    <p className="text-center text-gray-400 text-sm py-4">Belum ada kontak</p>
                  )}
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={resetForm}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={sending || !name.trim() || !message.trim() || selectedContacts.length === 0}
                  className="px-4 py-2 bg-wa-green text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
                >
                  {sending ? 'Mengirim...' : 'Kirim Broadcast'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* List */}
        <div className="space-y-3">
          {broadcasts.map((bc) => (
            <div key={bc.id} className="bg-white rounded-xl p-4 border">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-gray-800">{bc.name}</h4>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      bc.status === 'completed'
                        ? 'bg-green-100 text-green-700'
                        : bc.status === 'sending'
                        ? 'bg-yellow-100 text-yellow-700'
                        : bc.status === 'failed'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {bc.status}
                  </span>
                  <button
                    onClick={() => handleDelete(bc.id)}
                    className="p-1 text-red-400 hover:text-red-600"
                  >
                    🗑️
                  </button>
                </div>
              </div>
              <p className="text-sm text-gray-500 mb-2 line-clamp-2">{bc.message}</p>
              <div className="flex gap-4 text-xs text-gray-400">
                <span>📨 {bc.sentCount}/{bc.totalCount} terkirim</span>
                {bc.failCount > 0 && <span className="text-red-400">❌ {bc.failCount} gagal</span>}
                <span>📅 {new Date(bc.createdAt).toLocaleDateString('id-ID')}</span>
              </div>
              {bc.status === 'sending' && (
                <div className="mt-2 bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-wa-green h-full transition-all"
                    style={{ width: `${((bc.sentCount + bc.failCount) / bc.totalCount) * 100}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {broadcasts.length === 0 && !showForm && (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📢</div>
            <h2 className="text-xl font-semibold text-gray-600 mb-2">Belum Ada Broadcast</h2>
            <p className="text-gray-400 mb-6">Kirim pesan ke banyak kontak sekaligus</p>
            <button
              onClick={() => setShowForm(true)}
              className="bg-wa-green hover:bg-green-600 text-white px-6 py-3 rounded-lg font-medium"
            >
              + Buat Broadcast
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
