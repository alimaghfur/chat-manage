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

  const response = await fetch(url, {
    ...fetchOptions,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || error.error || `API Error: ${response.status}`);
  }

  return response.json();
}

// Sessions
export const sessions = {
  list: (apiKey?: string) => fetchApi('/sessions', {}, apiKey),
  get: (id: string, apiKey?: string) => fetchApi(`/sessions/${id}`, {}, apiKey),
  create: (data: { name: string; proxyUrl?: string }, apiKey?: string) =>
    fetchApi('/sessions', { method: 'POST', body: JSON.stringify(data) }, apiKey),
  connect: (id: string, method?: string, phoneNumber?: string, apiKey?: string) =>
    fetchApi(`/sessions/${id}/connect`, {
      method: 'POST',
      body: JSON.stringify({ method: method || 'qr', phoneNumber }),
    }, apiKey),
  disconnect: (id: string, apiKey?: string) =>
    fetchApi(`/sessions/${id}/disconnect`, { method: 'POST' }, apiKey),
  delete: (id: string, apiKey?: string) =>
    fetchApi(`/sessions/${id}`, { method: 'DELETE' }, apiKey),
};

// Messages
export const messages = {
  send: (sessionId: string, data: { to: string; text: string }, apiKey?: string) =>
    fetchApi(`/sessions/${sessionId}/messages/send`, {
      method: 'POST',
      body: JSON.stringify(data),
    }, apiKey),
  list: (sessionId: string, apiKey?: string) =>
    fetchApi(`/sessions/${sessionId}/messages`, {}, apiKey),
};

// Contacts
export const contacts = {
  list: (sessionId: string, apiKey?: string) =>
    fetchApi(`/contacts/${sessionId}`, {}, apiKey),
};

// Groups
export const groups = {
  list: (sessionId: string, apiKey?: string) =>
    fetchApi(`/sessions/${sessionId}/groups`, {}, apiKey),
};

// Labels
export const labels = {
  list: (sessionId: string, apiKey?: string) =>
    fetchApi(`/sessions/${sessionId}/labels`, {}, apiKey),
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

// Broadcasts
export const broadcasts = {
  list: (apiKey?: string) => fetchApi('/broadcasts', {}, apiKey),
  create: (data: { sessionId: string; recipients: string[]; message: string }, apiKey?: string) =>
    fetchApi('/broadcasts', { method: 'POST', body: JSON.stringify(data) }, apiKey),
};

// Auto-Replies
export const autoReplies = {
  list: (apiKey?: string) => fetchApi('/auto-replies', {}, apiKey),
  create: (data: { trigger: string; response: string; sessionId?: string }, apiKey?: string) =>
    fetchApi('/auto-replies', { method: 'POST', body: JSON.stringify(data) }, apiKey),
  delete: (id: string, apiKey?: string) =>
    fetchApi(`/auto-replies/${id}`, { method: 'DELETE' }, apiKey),
};

// API Keys
export const apiKeys = {
  list: (apiKey?: string) => fetchApi('/api-keys', {}, apiKey),
  create: (data: { name: string; permissions?: string[] }, apiKey?: string) =>
    fetchApi('/api-keys', { method: 'POST', body: JSON.stringify(data) }, apiKey),
  revoke: (id: string, apiKey?: string) =>
    fetchApi(`/api-keys/${id}`, { method: 'DELETE' }, apiKey),
};

// Audit Log
export const audit = {
  list: (apiKey?: string, params?: Record<string, string>) =>
    fetchApi('/audit', { params }, apiKey),
};
