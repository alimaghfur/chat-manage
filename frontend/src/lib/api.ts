const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

async function fetchApi(endpoint: string, options?: RequestInit) {
  const res = await fetch(`${API_URL}${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }
  return res.json();
}

// Sessions
export const sessionsApi = {
  getAll: () => fetchApi('/sessions'),
  get: (id: string) => fetchApi(`/sessions/${id}`),
  create: (name: string) => fetchApi('/sessions', { method: 'POST', body: JSON.stringify({ name }) }),
  connect: (id: string) => fetchApi(`/sessions/${id}/connect`, { method: 'POST' }),
  disconnect: (id: string) => fetchApi(`/sessions/${id}/disconnect`, { method: 'POST' }),
  delete: (id: string) => fetchApi(`/sessions/${id}`, { method: 'DELETE' }),
  update: (id: string, name: string) => fetchApi(`/sessions/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
};

// Contacts
export const contactsApi = {
  getBySession: (sessionId: string) => fetchApi(`/contacts/${sessionId}`),
  add: (sessionId: string, phone: string, name: string) =>
    fetchApi(`/contacts/${sessionId}`, { method: 'POST', body: JSON.stringify({ phone, name }) }),
  update: (id: string, data: { name?: string; labels?: string }) =>
    fetchApi(`/contacts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => fetchApi(`/contacts/${id}`, { method: 'DELETE' }),
};

// Messages
export const messagesApi = {
  getConversation: (sessionId: string, jid: string, page = 1) =>
    fetchApi(`/messages/${sessionId}/${encodeURIComponent(jid)}?page=${page}`),
  send: (sessionId: string, jid: string, content: string, type = 'text') =>
    fetchApi('/messages/send', { method: 'POST', body: JSON.stringify({ sessionId, jid, content, type }) }),
  delete: (id: string) => fetchApi(`/messages/${id}`, { method: 'DELETE' }),
};

// Auto-replies
export const autoRepliesApi = {
  getBySession: (sessionId: string) => fetchApi(`/auto-replies/${sessionId}`),
  create: (data: { sessionId: string; trigger: string; response: string; matchType?: string }) =>
    fetchApi('/auto-replies', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: { trigger?: string; response?: string; matchType?: string; isActive?: boolean }) =>
    fetchApi(`/auto-replies/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => fetchApi(`/auto-replies/${id}`, { method: 'DELETE' }),
};

// Broadcasts
export const broadcastsApi = {
  getBySession: (sessionId: string) => fetchApi(`/broadcasts/${sessionId}`),
  create: (data: { sessionId: string; name: string; message: string; recipients: string[] }) =>
    fetchApi('/broadcasts', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id: string) => fetchApi(`/broadcasts/${id}`, { method: 'DELETE' }),
};
