'use client';

import { useState, useEffect, useCallback } from 'react';
import { webhooks as webhooksApi } from '@/lib/api';

interface WebhooksViewProps {
  apiKey: string;
}

interface Webhook {
  id: string;
  url: string;
  events: string[];
  secret?: string;
  active?: boolean;
  createdAt?: string;
}

const AVAILABLE_EVENTS = [
  'message.received',
  'message.sent',
  'message.delivered',
  'message.read',
  'session.connected',
  'session.disconnected',
  'group.joined',
  'group.left',
  'contact.updated',
];

export default function WebhooksView({ apiKey }: WebhooksViewProps) {
  const [webhooksList, setWebhooksList] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newSecret, setNewSecret] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchWebhooks = useCallback(async () => {
    try {
      const data = await webhooksApi.list(apiKey);
      const list = data.webhooks || data || [];
      setWebhooksList(Array.isArray(list) ? list : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load webhooks');
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

  const handleCreate = async () => {
    if (!newUrl.trim() || selectedEvents.length === 0) return;
    setActionLoading('create');
    try {
      await webhooksApi.create(
        { url: newUrl, events: selectedEvents, secret: newSecret || undefined },
        apiKey
      );
      setShowCreateForm(false);
      setNewUrl('');
      setNewSecret('');
      setSelectedEvents([]);
      setSuccess('Webhook created successfully!');
      setTimeout(() => setSuccess(null), 3000);
      await fetchWebhooks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create webhook');
    } finally {
      setActionLoading(null);
    }
  };

  const handleTest = async (id: string) => {
    setActionLoading(id);
    try {
      await webhooksApi.test(id, apiKey);
      setSuccess('Test event sent successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to test webhook');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this webhook?')) return;
    setActionLoading(id);
    try {
      await webhooksApi.delete(id, apiKey);
      await fetchWebhooks();
      setSuccess('Webhook deleted');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete webhook');
    } finally {
      setActionLoading(null);
    }
  };

  const toggleEvent = (event: string) => {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
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
        <h1 className="text-2xl font-bold text-[#E9EDEF]">Webhooks</h1>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-4 py-2 bg-[#00A884] hover:bg-[#00C49A] text-white rounded-lg text-sm font-medium transition-colors"
        >
          {showCreateForm ? 'Cancel' : '+ Create Webhook'}
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
          <h2 className="text-lg font-semibold text-[#E9EDEF] mb-4">New Webhook</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-[#8696A0] mb-1">Webhook URL *</label>
              <input
                type="url"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://example.com/webhook"
                className="w-full px-3 py-2 bg-[#2A3942] border border-[#2A3942] rounded-lg text-[#E9EDEF] placeholder-[#8696A0] focus:outline-none focus:border-[#00A884]"
              />
            </div>
            <div>
              <label className="block text-sm text-[#8696A0] mb-1">Secret (optional)</label>
              <input
                type="text"
                value={newSecret}
                onChange={(e) => setNewSecret(e.target.value)}
                placeholder="Webhook signing secret"
                className="w-full px-3 py-2 bg-[#2A3942] border border-[#2A3942] rounded-lg text-[#E9EDEF] placeholder-[#8696A0] focus:outline-none focus:border-[#00A884]"
              />
            </div>
            <div>
              <label className="block text-sm text-[#8696A0] mb-2">Events *</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {AVAILABLE_EVENTS.map((event) => (
                  <label
                    key={event}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedEvents.includes(event)}
                      onChange={() => toggleEvent(event)}
                      className="w-4 h-4 rounded border-[#2A3942] bg-[#2A3942] text-[#00A884] focus:ring-[#00A884]"
                    />
                    <span className="text-xs text-[#E9EDEF]">{event}</span>
                  </label>
                ))}
              </div>
            </div>
            <button
              onClick={handleCreate}
              disabled={!newUrl.trim() || selectedEvents.length === 0 || actionLoading === 'create'}
              className="px-4 py-2 bg-[#00A884] hover:bg-[#00C49A] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {actionLoading === 'create' ? 'Creating...' : 'Create Webhook'}
            </button>
          </div>
        </div>
      )}

      {/* Webhooks List */}
      <div className="space-y-4">
        {webhooksList.length === 0 ? (
          <div className="bg-[#202C33] border border-[#2A3942] rounded-lg p-8 text-center">
            <p className="text-[#8696A0]">No webhooks configured</p>
            <p className="text-sm text-[#8696A0] mt-1">Create a webhook to receive event notifications</p>
          </div>
        ) : (
          webhooksList.map((webhook) => (
            <div
              key={webhook.id}
              className="bg-[#202C33] border border-[#2A3942] rounded-lg p-4 animate-slide-in"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-2 h-2 rounded-full ${webhook.active !== false ? 'bg-[#00A884]' : 'bg-red-500'}`}></div>
                    <span className="text-sm font-medium text-[#E9EDEF] break-all">{webhook.url}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {webhook.events.map((event) => (
                      <span
                        key={event}
                        className="px-2 py-0.5 bg-[#2A3942] rounded text-xs text-[#8696A0]"
                      >
                        {event}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => handleTest(webhook.id)}
                    disabled={actionLoading === webhook.id}
                    className="px-3 py-1.5 bg-[#2A3942] hover:bg-[#3B4F5A] text-[#E9EDEF] rounded text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    Test
                  </button>
                  <button
                    onClick={() => handleDelete(webhook.id)}
                    disabled={actionLoading === webhook.id}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
