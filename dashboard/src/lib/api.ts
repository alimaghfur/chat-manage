const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface FetchOptions extends RequestInit {
  params?: Record<string, string>;
}

export async function fetchApi(endpoint: string, options: FetchOptions = {}, apiKey?: string) {
  const { params, ...fetchOptions } = options;

  let url = `${API_URL}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  const response = await fetch(url, { ...fetchOptions, headers });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || error.error || `API Error: ${response.status}`);
  }

  return response.json();
}

// Platforms
export const platforms = {
  list: (apiKey?: string) => fetchApi('/sessions/platforms', {}, apiKey),
};

// Sessions
export const sessions = {
  list: (apiKey?: string, platform?: string) =>
    fetchApi('/sessions', { params: platform ? { platform } : undefined }, apiKey),
  get: (id: string, apiKey?: string) =>
    fetchApi(`/sessions/${id}`, {}, apiKey),
  create: (data: { name: string; platform: string; credentials?: Record<string, string> }, apiKey?: string) =>
    fetchApi('/sessions', { method: 'POST', body: JSON.stringify(data) }, apiKey),
  connect: (id: string, apiKey?: string, payload?: Record<string, unknown>) =>
    fetchApi(`/sessions/${id}/connect`, { method: 'POST', body: JSON.stringify(payload || {}) }, apiKey),
  verify: (id: string, apiKey?: string, payload?: { code: string; password?: string }) =>
    fetchApi(`/sessions/${id}/verify`, { method: 'POST', body: JSON.stringify(payload || {}) }, apiKey),
  sendPhone: (id: string, phoneNumber: string, apiKey?: string) =>
    fetchApi(`/sessions/${id}/send-phone`, { method: 'POST', body: JSON.stringify({ phoneNumber }) }, apiKey),
  disconnect: (id: string, apiKey?: string) =>
    fetchApi(`/sessions/${id}/disconnect`, { method: 'POST' }, apiKey),
  delete: (id: string, apiKey?: string) =>
    fetchApi(`/sessions/${id}`, { method: 'DELETE' }, apiKey),
  status: (id: string, apiKey?: string) =>
    fetchApi(`/sessions/${id}/status`, {}, apiKey),
  qr: (id: string, apiKey?: string) =>
    fetchApi(`/sessions/${id}/qr`, {}, apiKey),
  contacts: (id: string, apiKey?: string, params?: Record<string, string>) =>
    fetchApi(`/sessions/${id}/contacts`, { params }, apiKey),
};

// Messages
export const messages = {
  sendText: (data: { sessionId: string; to: string; text: string }, apiKey?: string) =>
    fetchApi('/messages/text', { method: 'POST', body: JSON.stringify(data) }, apiKey),
  sendMedia: (data: { sessionId: string; to: string; type: string; mediaUrl: string; caption?: string }, apiKey?: string) =>
    fetchApi('/messages/media', { method: 'POST', body: JSON.stringify(data) }, apiKey),
  sendTemplate: (data: { sessionId: string; to: string; templateName: string; languageCode?: string; components?: unknown[] }, apiKey?: string) =>
    fetchApi('/messages/template', { method: 'POST', body: JSON.stringify(data) }, apiKey),
  inbox: (apiKey?: string, params?: Record<string, string>) =>
    fetchApi('/messages/inbox', { params }, apiKey),
  conversations: (apiKey?: string, params?: Record<string, string>) =>
    fetchApi('/messages/conversations', { params }, apiKey),
  list: (sessionId: string, chatId: string, apiKey?: string) =>
    fetchApi(`/messages/${sessionId}/${chatId}`, {}, apiKey),
  starred: (apiKey?: string) =>
    fetchApi('/messages/starred', {}, apiKey),
  star: (id: string, apiKey?: string) =>
    fetchApi(`/messages/star/${id}`, { method: 'POST' }, apiKey),
  markRead: (data: { sessionId: string; to?: string; messageId?: string }, apiKey?: string) =>
    fetchApi('/messages/read', { method: 'POST', body: JSON.stringify(data) }, apiKey),
};

// Contacts
export const contacts = {
  list: (sessionId: string, apiKey?: string) =>
    fetchApi(`/contacts/${sessionId}`, {}, apiKey),
};

// Webhooks
export const webhooks = {
  list: (apiKey?: string) => fetchApi('/webhooks', {}, apiKey),
  create: (data: { url: string; events: string[]; secret?: string }, apiKey?: string) =>
    fetchApi('/webhooks', { method: 'POST', body: JSON.stringify(data) }, apiKey),
  delete: (id: string, apiKey?: string) =>
    fetchApi(`/webhooks/${id}`, { method: 'DELETE' }, apiKey),
  test: (id: string, apiKey?: string) =>
    fetchApi(`/webhooks/${id}/test`, { method: 'POST' }, apiKey),
};

// API Keys
export const apiKeys = {
  list: (apiKey?: string) => fetchApi('/keys', {}, apiKey),
  create: (data: { name: string; permissions?: string[]; rateLimit?: number }, apiKey?: string) =>
    fetchApi('/keys', { method: 'POST', body: JSON.stringify(data) }, apiKey),
  revoke: (id: string, apiKey?: string) =>
    fetchApi(`/keys/${id}`, { method: 'DELETE' }, apiKey),
};

// Audit Log
export const audit = {
  list: (apiKey?: string, params?: Record<string, string>) =>
    fetchApi('/audit', { params }, apiKey),
};
