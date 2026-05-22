'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiKeys as apiKeysApi } from '@/lib/api';

interface ApiKeysViewProps {
  apiKey: string;
}

interface ApiKeyEntry {
  id: string;
  name: string;
  key?: string;
  maskedKey?: string;
  permissions?: string[];
  createdAt?: string;
  lastUsed?: string;
}

export default function ApiKeysView({ apiKey }: ApiKeysViewProps) {
  const [keysList, setKeysList] = useState<ApiKeyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyCreated, setNewKeyCreated] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const fetchKeys = useCallback(async () => {
    try {
      const data = await apiKeysApi.list(apiKey);
      const list = data.data || data || [];
      setKeysList(Array.isArray(list) ? list : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    setActionLoading('create');
    try {
      const response = await apiKeysApi.create({ name: newKeyName }, apiKey);
      const createdKey = response.data?.key || response.key || '';
      setNewKeyCreated(createdKey);
      setNewKeyName('');
      setSuccess('API key created! Make sure to copy it now.');
      await fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create API key');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this API key? This action cannot be undone.')) return;
    setActionLoading(id);
    try {
      await apiKeysApi.revoke(id, apiKey);
      await fetchKeys();
      setSuccess('API key revoked');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke API key');
    } finally {
      setActionLoading(null);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#E9EDEF]">API Keys</h1>
        <button
          onClick={() => {
            setShowCreateForm(!showCreateForm);
            setNewKeyCreated(null);
          }}
          className="px-4 py-2 bg-[#00A884] hover:bg-[#00C49A] text-white rounded-lg text-sm font-medium transition-colors"
        >
          {showCreateForm ? 'Cancel' : '+ Generate Key'}
        </button>
      </div>

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

      {/* Create Form */}
      {showCreateForm && (
        <div className="bg-[#202C33] border border-[#2A3942] rounded-lg p-6 animate-fade-in">
          <h2 className="text-lg font-semibold text-[#E9EDEF] mb-4">Generate New API Key</h2>

          {!newKeyCreated ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[#8696A0] mb-1">Key Name *</label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g., Production API Key"
                  className="w-full px-3 py-2 bg-[#2A3942] border border-[#2A3942] rounded-lg text-[#E9EDEF] placeholder-[#8696A0] focus:outline-none focus:border-[#00A884]"
                />
              </div>
              <button
                onClick={handleCreate}
                disabled={!newKeyName.trim() || actionLoading === 'create'}
                className="px-4 py-2 bg-[#00A884] hover:bg-[#00C49A] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {actionLoading === 'create' ? 'Generating...' : 'Generate Key'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-3">
                <p className="text-sm text-yellow-300 font-medium">
                  ⚠️ Copy your API key now. You won&apos;t be able to see it again!
                </p>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-[#2A3942] rounded-lg text-sm text-[#00A884] font-mono break-all">
                  {newKeyCreated}
                </code>
                <button
                  onClick={() => copyToClipboard(newKeyCreated)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    copiedKey
                      ? 'bg-[#00A884] text-white'
                      : 'bg-[#2A3942] hover:bg-[#3B4F5A] text-[#E9EDEF]'
                  }`}
                >
                  {copiedKey ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <button
                onClick={() => {
                  setShowCreateForm(false);
                  setNewKeyCreated(null);
                  setSuccess(null);
                }}
                className="px-4 py-2 text-[#8696A0] hover:text-[#E9EDEF] text-sm transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>
      )}

      {/* Keys List */}
      <div className="space-y-3">
        {keysList.length === 0 ? (
          <div className="bg-[#202C33] border border-[#2A3942] rounded-lg p-8 text-center">
            <p className="text-[#8696A0]">No API keys found</p>
            <p className="text-sm text-[#8696A0] mt-1">Generate a key to authenticate API requests</p>
          </div>
        ) : (
          keysList.map((key) => (
            <div
              key={key.id}
              className="bg-[#202C33] border border-[#2A3942] rounded-lg p-4 animate-slide-in"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-[#E9EDEF]">{key.name}</h3>
                  <p className="text-sm text-[#8696A0] font-mono mt-1">
                    {key.maskedKey || key.key || '••••••••••••••••'}
                  </p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-[#8696A0]">
                    {key.createdAt && (
                      <span>Created: {new Date(key.createdAt).toLocaleDateString()}</span>
                    )}
                    {key.lastUsed && (
                      <span>Last used: {new Date(key.lastUsed).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleRevoke(key.id)}
                  disabled={actionLoading === key.id}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium transition-colors disabled:opacity-50"
                >
                  {actionLoading === key.id ? 'Revoking...' : 'Revoke'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
