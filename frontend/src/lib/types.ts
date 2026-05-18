export interface Session {
  id: string;
  name: string;
  phone: string | null;
  status: 'connected' | 'disconnected' | 'connecting';
  qrCode: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    contacts: number;
    messages: number;
  };
}

export interface Contact {
  id: string;
  sessionId: string;
  jid: string;
  name: string | null;
  pushName: string | null;
  phone: string;
  avatar: string | null;
  labels: string | null;
  createdAt: string;
  updatedAt: string;
  messages?: Message[];
  _count?: {
    messages: number;
  };
}

export interface Message {
  id: string;
  sessionId: string;
  contactId: string | null;
  jid: string;
  content: string;
  type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'sticker';
  mediaUrl: string | null;
  fromMe: boolean;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'received';
  timestamp: string;
  messageId: string | null;
  createdAt: string;
  contact?: Contact;
}

export interface AutoReply {
  id: string;
  sessionId: string;
  trigger: string;
  response: string;
  isActive: boolean;
  matchType: 'exact' | 'contains' | 'startsWith';
  createdAt: string;
  updatedAt: string;
}

export interface Broadcast {
  id: string;
  sessionId: string;
  name: string;
  message: string;
  recipients: string;
  status: 'pending' | 'sending' | 'completed' | 'failed';
  sentCount: number;
  failCount: number;
  totalCount: number;
  createdAt: string;
  updatedAt: string;
}
