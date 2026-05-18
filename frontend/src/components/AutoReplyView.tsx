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

  const activeCount = autoReplies.filter((ar) => ar.isActive).length;

  return (
    <div className="h-full overflow-y-auto bg-[#0B141A] p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-start mb-8 animate-fadeIn">
          <div>
            <h1 className="text-2xl font-bold text-[#E9EDEF]">Auto Reply</h1>
            <p className="text-[#8696A0] text-sm mt-1">
              Atur balasan otomatis berdasarkan kata kunci
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="bg-[#00A884] hover:bg-[#00C49A] text-white px-5 py-2.5 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 shadow-lg shadow-[#00A884]/20"
          >
            <PlusIcon className="w-4 h-4" />
            <span>Tambah Rule</span>
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6 animate-fadeIn">
          <div className="bg-[#202C33] rounded-xl border border-[#2A3942] p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <RulesIcon className="w-4.5 h-4.5 text-blue-400" />
              </div>
              <div>
                <p className="text-[#8696A0] text-xs">Total Rules</p>
                <p className="text-lg font-bold text-[#E9EDEF]">{autoReplies.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-[#202C33] rounded-xl border border-[#2A3942] p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <CheckCircleIcon className="w-4.5 h-4.5 text-emerald-400" />
              </div>
              <div>
                <p className="text-[#8696A0] text-xs">Aktif</p>
                <p className="text-lg font-bold text-[#E9EDEF]">{activeCount}</p>
              </div>
            </div>
          </div>
          <div className="bg-[#202C33] rounded-xl border border-[#2A3942] p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center">
                <PauseIcon className="w-4.5 h-4.5 text-red-400" />
              </div>
              <div>
                <p className="text-[#8696A0] text-xs">Nonaktif</p>
                <p className="text-lg font-bold text-[#E9EDEF]">{autoReplies.length - activeCount}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Form Modal */}
        {showForm && (
          <div className="modal-overlay" onClick={resetForm}>
            <div className="modal-content w-full max-w-lg mx-4 p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-[#00A884]/10 flex items-center justify-center">
                  <BotIcon className="w-5 h-5 text-[#00A884]" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[#E9EDEF]">
                    {editId ? 'Edit Auto Reply' : 'Buat Auto Reply Baru'}
                  </h3>
                  <p className="text-xs text-[#8696A0]">Tentukan trigger dan balasan otomatis</p>
                </div>
              </div>

              <div className="space-y-4">
                {/* Trigger */}
                <div>
                  <label className="block text-xs text-[#8696A0] mb-1.5 font-medium">
                    Kata Kunci (Trigger)
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: halo, info, harga, bantuan"
                    value={trigger}
                    onChange={(e) => setTrigger(e.target.value)}
                    className="w-full bg-[#2A3942] border border-[#3B4A54] rounded-lg px-4 py-3 text-[#E9EDEF] placeholder-[#8696A0] focus:outline-none focus:ring-2 focus:ring-[#00A884] focus:border-transparent text-sm"
                    autoFocus
                  />
                </div>

                {/* Match Type */}
                <div>
                  <label className="block text-xs text-[#8696A0] mb-1.5 font-medium">
                    Tipe Pencocokan
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 'contains', label: 'Mengandung', desc: 'Pesan mengandung kata' },
                      { value: 'exact', label: 'Persis', desc: 'Pesan harus sama persis' },
                      { value: 'startsWith', label: 'Diawali', desc: 'Pesan diawali dengan kata' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setMatchType(opt.value as typeof matchType)}
                        className={`p-3 rounded-lg border text-left transition-all ${
                          matchType === opt.value
                            ? 'border-[#00A884] bg-[#00A884]/10'
                            : 'border-[#3B4A54] bg-[#2A3942] hover:border-[#8696A0]'
                        }`}
                      >
                        <p className={`text-xs font-medium ${
                          matchType === opt.value ? 'text-[#00A884]' : 'text-[#E9EDEF]'
                        }`}>
                          {opt.label}
                        </p>
                        <p className="text-[10px] text-[#8696A0] mt-0.5">{opt.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Response */}
                <div>
                  <label className="block text-xs text-[#8696A0] mb-1.5 font-medium">
                    Pesan Balasan
                  </label>
                  <textarea
                    placeholder="Tulis pesan balasan otomatis yang akan dikirim..."
                    value={response}
                    onChange={(e) => setResponse(e.target.value)}
                    rows={4}
                    className="w-full bg-[#2A3942] border border-[#3B4A54] rounded-lg px-4 py-3 text-[#E9EDEF] placeholder-[#8696A0] focus:outline-none focus:ring-2 focus:ring-[#00A884] focus:border-transparent text-sm resize-none"
                  />
                </div>

                {/* Preview */}
                {trigger && response && (
                  <div className="bg-[#111B21] rounded-lg p-4 border border-[#2A3942]">
                    <p className="text-[10px] uppercase tracking-wider text-[#8696A0] font-semibold mb-2">Preview</p>
                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <span className="text-xs bg-[#2A3942] text-[#E9EDEF] px-2 py-1 rounded">Masuk:</span>
                        <span className="text-xs text-[#8696A0] italic">"{trigger}"</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-xs bg-[#005C4B] text-[#E9EDEF] px-2 py-1 rounded">Balas:</span>
                        <span className="text-xs text-[#E9EDEF]">{response}</span>
                      </div>
                    </div>
                  </div>
                )}
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
                  disabled={!trigger.trim() || !response.trim()}
                  className="px-5 py-2.5 bg-[#00A884] text-white rounded-lg hover:bg-[#00C49A] disabled:opacity-40 disabled:cursor-not-allowed transition-all font-medium text-sm"
                >
                  {editId ? 'Update Rule' : 'Simpan Rule'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Rules List */}
        <div className="space-y-3 animate-fadeIn">
          {autoReplies.map((ar, i) => (
            <div
              key={ar.id}
              className={`bg-[#202C33] rounded-xl border border-[#2A3942] overflow-hidden transition-all hover:border-[#3B4A54] ${
                !ar.isActive ? 'opacity-60' : ''
              }`}
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <div className="p-4 flex items-start gap-4">
                {/* Status Icon */}
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                  ar.isActive ? 'bg-emerald-500/10' : 'bg-[#2A3942]'
                }`}>
                  <BotIcon className={`w-5 h-5 ${ar.isActive ? 'text-emerald-400' : 'text-[#8696A0]'}`} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-sm font-medium text-[#E9EDEF]">"{ar.trigger}"</span>
                    <MatchTypeBadge type={ar.matchType} />
                  </div>
                  <div className="flex items-start gap-1.5">
                    <ArrowIcon className="w-3.5 h-3.5 text-[#00A884] mt-0.5 flex-shrink-0" />
                    <p className="text-[#8696A0] text-sm leading-relaxed line-clamp-2">{ar.response}</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Toggle */}
                  <button
                    onClick={() => handleToggle(ar.id, ar.isActive)}
                    className={`toggle-switch ${ar.isActive ? 'bg-[#00A884]' : 'bg-[#3B4A54]'}`}
                  >
                    <span className={`toggle-switch-dot ${ar.isActive ? 'translate-x-5' : 'translate-x-1'}`} />
                  </button>

                  {/* Edit */}
                  <button
                    onClick={() => handleEdit(ar)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-[#8696A0] hover:text-[#E9EDEF] hover:bg-[#2A3942] transition-colors"
                  >
                    <EditIcon className="w-4 h-4" />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(ar.id)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-[#8696A0] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Empty State */}
        {autoReplies.length === 0 && !showForm && (
          <div className="text-center py-20 animate-fadeIn">
            <div className="w-20 h-20 rounded-full bg-[#202C33] flex items-center justify-center mx-auto mb-5">
              <BotIcon className="w-10 h-10 text-[#2A3942]" />
            </div>
            <h2 className="text-xl font-semibold text-[#E9EDEF] mb-2">Belum Ada Auto Reply</h2>
            <p className="text-[#8696A0] text-sm mb-8 max-w-sm mx-auto">
              Buat rule auto-reply untuk membalas pesan secara otomatis berdasarkan kata kunci tertentu
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="bg-[#00A884] hover:bg-[#00C49A] text-white px-6 py-3 rounded-lg font-medium transition-all shadow-lg shadow-[#00A884]/20 inline-flex items-center gap-2"
            >
              <PlusIcon className="w-4 h-4" />
              Tambah Rule Pertama
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Match Type Badge
function MatchTypeBadge({ type }: { type: string }) {
  const config = {
    contains: { label: 'Mengandung', color: 'bg-blue-500/10 text-blue-400' },
    exact: { label: 'Persis', color: 'bg-purple-500/10 text-purple-400' },
    startsWith: { label: 'Diawali', color: 'bg-amber-500/10 text-amber-400' },
  };
  const c = config[type as keyof typeof config] || config.contains;

  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${c.color}`}>
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

function BotIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" />
    </svg>
  );
}

function RulesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" x2="8" y1="13" y2="13" /><line x1="16" x2="8" y1="17" y2="17" /><polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="10" x2="10" y1="15" y2="9" /><line x1="14" x2="14" y1="15" y2="9" />
    </svg>
  );
}

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 10 4 15 9 20" /><path d="M20 4v7a4 4 0 0 1-4 4H4" />
    </svg>
  );
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" />
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
