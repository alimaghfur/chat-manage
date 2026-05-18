const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const sessions = new Map(); // sessionId -> { sock }

const SESSIONS_DIR = path.join(__dirname, '../../sessions');

// Ensure sessions directory exists
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

async function createSession(sessionId, io) {
  // If session already exists, disconnect first
  if (sessions.has(sessionId)) {
    try {
      const existing = sessions.get(sessionId);
      existing.sock.ev.removeAllListeners();
      sessions.delete(sessionId);
    } catch (e) {
      // ignore
    }
  }

  const sessionDir = path.join(SESSIONS_DIR, sessionId);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  console.log(`[WA] Loading auth state for session: ${sessionId}`);
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  console.log(`[WA] Creating socket for session: ${sessionId}`);
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    logger: pino({ level: 'silent' }),
    browser: ['Chat Manager', 'Chrome', '120.0.0'],
  });

  console.log(`[WA] Socket created, registering event listeners for: ${sessionId}`);

  // Handle connection updates
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    console.log(`[WA] connection.update for ${sessionId}:`, { connection, hasQr: !!qr });

    if (qr) {
      try {
        console.log(`[WA] QR Code received for session: ${sessionId}`);
        const qrDataUrl = await QRCode.toDataURL(qr);
        
        // Save to DB
        await prisma.session.update({
          where: { id: sessionId },
          data: { qrCode: qrDataUrl, status: 'connecting' },
        });

        // Emit via socket
        io.emit('qr-code', { sessionId, qr: qrDataUrl });
        console.log(`[WA] QR Code emitted globally for session: ${sessionId}`);
      } catch (err) {
        console.error(`[WA] Error processing QR for ${sessionId}:`, err.message);
      }
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(`[WA] Connection closed for ${sessionId}, statusCode: ${statusCode}, shouldReconnect: ${shouldReconnect}`);

      try {
        await prisma.session.update({
          where: { id: sessionId },
          data: { status: 'disconnected', qrCode: null },
        });
      } catch (e) {}

      io.emit('session-status', { sessionId, status: 'disconnected' });

      if (shouldReconnect) {
        setTimeout(() => createSession(sessionId, io), 3000);
      } else {
        sessions.delete(sessionId);
        if (fs.existsSync(sessionDir)) {
          fs.rmSync(sessionDir, { recursive: true });
        }
      }
    }

    if (connection === 'open') {
      const user = sock.user;
      console.log(`[WA] ✅ Session ${sessionId} connected as ${user?.id}`);

      try {
        await prisma.session.update({
          where: { id: sessionId },
          data: {
            status: 'connected',
            qrCode: null,
            phone: user?.id?.split(':')[0] || null,
          },
        });
      } catch (e) {}

      io.emit('session-status', { sessionId, status: 'connected' });
    }
  });

  // Handle credentials update
  sock.ev.on('creds.update', saveCreds);

  // Handle incoming messages
  sock.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
    if (type !== 'notify') return;

    for (const msg of msgs) {
      if (!msg.message) continue;

      const jid = msg.key.remoteJid;
      if (jid === 'status@broadcast') continue;

      const fromMe = msg.key.fromMe || false;
      const content = extractMessageContent(msg);
      const phone = jid.replace('@s.whatsapp.net', '').replace('@g.us', '');
      const pushName = msg.pushName || null;

      try {
        let contact = await prisma.contact.upsert({
          where: { sessionId_jid: { sessionId, jid } },
          update: { pushName: pushName || undefined },
          create: { sessionId, jid, phone, pushName, name: pushName },
        });

        const savedMsg = await prisma.message.create({
          data: {
            sessionId,
            contactId: contact.id,
            jid,
            content: content || '',
            type: getMessageType(msg),
            fromMe,
            status: fromMe ? 'sent' : 'received',
            timestamp: new Date(msg.messageTimestamp * 1000),
            messageId: msg.key.id,
          },
        });

        io.emit('new-message', { ...savedMsg, contact });

        if (!fromMe && content) {
          await handleAutoReply(sessionId, jid, content, sock);
        }
      } catch (error) {
        console.error('Error processing message:', error.message);
      }
    }
  });

  // Handle message status updates
  sock.ev.on('messages.update', async (updates) => {
    for (const update of updates) {
      if (update.update.status) {
        const statusMap = { 2: 'sent', 3: 'delivered', 4: 'read' };
        const status = statusMap[update.update.status];
        if (status && update.key.id) {
          try {
            await prisma.message.updateMany({
              where: { messageId: update.key.id },
              data: { status },
            });
            io.emit('message-status', { messageId: update.key.id, status });
          } catch (error) {}
        }
      }
    }
  });

  sessions.set(sessionId, { sock });
  console.log(`[WA] Session ${sessionId} stored, waiting for QR...`);
  return sock;
}

function extractMessageContent(msg) {
  const message = msg.message;
  if (!message) return null;

  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage) return message.extendedTextMessage.text;
  if (message.imageMessage) return message.imageMessage.caption || '[Image]';
  if (message.videoMessage) return message.videoMessage.caption || '[Video]';
  if (message.documentMessage) return message.documentMessage.fileName || '[Document]';
  if (message.audioMessage) return '[Audio]';
  if (message.stickerMessage) return '[Sticker]';
  if (message.contactMessage) return '[Contact]';
  if (message.locationMessage) return '[Location]';

  return '[Unknown Message]';
}

function getMessageType(msg) {
  const message = msg.message;
  if (!message) return 'text';

  if (message.imageMessage) return 'image';
  if (message.videoMessage) return 'video';
  if (message.documentMessage) return 'document';
  if (message.audioMessage) return 'audio';
  if (message.stickerMessage) return 'sticker';

  return 'text';
}

async function handleAutoReply(sessionId, jid, content, sock) {
  try {
    const autoReplies = await prisma.autoReply.findMany({
      where: { sessionId, isActive: true },
    });

    for (const rule of autoReplies) {
      let matched = false;
      const lowerContent = content.toLowerCase();
      const lowerTrigger = rule.trigger.toLowerCase();

      switch (rule.matchType) {
        case 'exact':
          matched = lowerContent === lowerTrigger;
          break;
        case 'contains':
          matched = lowerContent.includes(lowerTrigger);
          break;
        case 'startsWith':
          matched = lowerContent.startsWith(lowerTrigger);
          break;
      }

      if (matched) {
        await sock.sendMessage(jid, { text: rule.response });
        break;
      }
    }
  } catch (error) {
    console.error('Auto-reply error:', error.message);
  }
}

async function sendMessage(sessionId, jid, content, type = 'text') {
  const session = sessions.get(sessionId);
  if (!session) throw new Error('Session not found or not connected');

  let messageContent;
  switch (type) {
    case 'text':
      messageContent = { text: content };
      break;
    case 'image':
      messageContent = { image: { url: content }, caption: '' };
      break;
    case 'document':
      messageContent = { document: { url: content } };
      break;
    default:
      messageContent = { text: content };
  }

  const result = await session.sock.sendMessage(jid, messageContent);
  return result;
}

async function disconnectSession(sessionId) {
  const session = sessions.get(sessionId);
  if (session) {
    try {
      await session.sock.logout();
    } catch (e) {}
    sessions.delete(sessionId);
  }
}

function getSession(sessionId) {
  return sessions.get(sessionId);
}

function isSessionConnected(sessionId) {
  const session = sessions.get(sessionId);
  return session?.sock?.user ? true : false;
}

module.exports = {
  createSession,
  sendMessage,
  disconnectSession,
  getSession,
  isSessionConnected,
  sessions,
};
