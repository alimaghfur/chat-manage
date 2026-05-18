'use client';

import { useState, useEffect } from 'react';
import { autoRepliesApi } from '@/lib/api';
import { AutoReply } from '@/lib/types';

interface AutoReplyViewProps {
  sessionId: string;
}

export default function AutoReplyView({ sessionId }: AutoReplyViewProps) {
  const [autoReplies, setAutoReplies] = useState<AutoReply[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [trigger, setTrigger] = useState('');
  const [response, setResponse] = useState('');
  const [matchType, setMatchType] = useState<'exact' | 'contains' | 'startsWith'>('contains');

  useEffect(() => {
    loadAutoReplies();
  }, [sessionId]);

  async function loadAutoReplies() {
    try {
      const data = await autoRepliesApi.getBySession(sessionId);
      setAutoReplies(data);
    } catch (error) {
      console.error('Failed to load auto-replies:', error);
    }
  }

  async function handleSubmit() {
    if (!trigger.trim() || !response.trim()) return;

    try {
      if (editId) {
        const updated = await autoRepliesApi.update(editId, { trigger, response, matchType });
        setAutoReplies((prev) => prev.map((ar) => (ar.id === editId ? updated : ar)));
      } else {
        const created = await autoRepliesApi.create({ sessionId, trigger, response, matchType });
        setAutoReplies((prev) => [created, ...prev]);
      }
      resetForm();
    } catch (error) {
      console.error('Failed to save auto-reply:', error);
    }
  }

  async function handleToggle(id: string, isActive: boolean) {
    try {
      const updated = await autoRepliesApi.update(id, { isActive: !isActive });
      setAutoReplies((prev) => prev.map((ar) => (ar.id === id ? updated : ar)));
    } catch (error) {
      console.error('Failed to toggle auto-reply:', error);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Yakin ingin menghapus auto-reply ini?')) return;
    try {
      await autoRepliesApi.delete(id);
      setAutoReplies((prev) => prev.filter((ar) => ar.id !== id));
    } catch (error) {
      console.error('Failed to delete auto-reply:', error);
    }
  }

  function handleEdit(ar: AutoReply) {
    setEditId(ar.id);
    setTrigger(ar.trigger);
    setResponse(ar.response);
    setMatchType(ar.matchType);
    setShowForm(true);
  }

  function resetForm() {
    setShowForm(false);
    setEditId(null);
    setTrigger('');
    setResponse('');
    setMatchType('contains');
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Auto Reply</h1>
            <p className="text-gray-500">Atur balasan otomatis berdasarkan keyword</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="bg-wa-green hover:bg-green-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            + Tambah Rule
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-white rounded-xl p-6 mb-6 border">
            <h3 className="font-semibold mb-4">{editId ? 'Edit' : 'Buat'} Auto Reply</h3>
            <div className="grid gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Trigger (Kata Kunci)</label>
                <input
                  type="text"
                  placeholder="Contoh: halo, info, harga"
                  value={trigger}
                  onChange={(e) => setTrigger(e.target.value)}
                  className="w-full border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-wa-green"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipe Pencocokan</label>
                <select
                  value={matchType}
                  onChange={(e) => setMatchType(e.target.value as typeof matchType)}
                  className="w-full border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-wa-green"
                >
                  <option value="contains">Mengandung kata</option>
                  <option value="exact">Persis sama</option>
                  <option value="startsWith">Diawali dengan</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Balasan</label>
                <textarea
                  placeholder="Pesan balasan otomatis..."
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  rows={3}
                  className="w-full border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-wa-green resize-none"
                />
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
                  disabled={!trigger.trim() || !response.trim()}
                  className="px-4 py-2 bg-wa-green text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
                >
                  {editId ? 'Update' : 'Simpan'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* List */}
        <div className="space-y-3">
          {autoReplies.map((ar) => (
            <div key={ar.id} className="bg-white rounded-xl p-4 border flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-gray-800">"{ar.trigger}"</span>
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                    {ar.matchType === 'contains' ? 'mengandung' : ar.matchType === 'exact' ? 'persis' : 'diawali'}
                  </span>
                </div>
                <p className="text-sm text-gray-500 line-clamp-2">↪ {ar.response}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggle(ar.id, ar.isActive)}
                  className={`w-12 h-6 rounded-full transition-colors relative ${
                    ar.isActive ? 'bg-wa-green' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow ${
                      ar.isActive ? 'left-6' : 'left-0.5'
                    }`}
                  />
                </button>
                <button
                  onClick={() => handleEdit(ar)}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  ✏️
                </button>
                <button
                  onClick={() => handleDelete(ar.id)}
                  className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>

        {autoReplies.length === 0 && !showForm && (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🤖</div>
            <h2 className="text-xl font-semibold text-gray-600 mb-2">Belum Ada Auto Reply</h2>
            <p className="text-gray-400 mb-6">Buat rule auto-reply untuk membalas pesan secara otomatis</p>
            <button
              onClick={() => setShowForm(true)}
              className="bg-wa-green hover:bg-green-600 text-white px-6 py-3 rounded-lg font-medium"
            >
              + Tambah Rule
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
