const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, makeInMemoryStore } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const sessions = new Map(); // sessionId -> { socket, store }

const SESSIONS_DIR = path.join(__dirname, '../../sessions');

// Ensure sessions directory exists
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

async function createSession(sessionId, io) {
  const sessionDir = path.join(SESSIONS_DIR, sessionId);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  const store = makeInMemoryStore({
    logger: pino({ level: 'silent' }),
  });

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: ['Chat Manager', 'Chrome', '120.0.0'],
  });

  store.bind(sock.ev);

  // Handle connection updates
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      // Generate QR code as data URL
      const qrDataUrl = await QRCode.toDataURL(qr);
      await prisma.session.update({
        where: { id: sessionId },
        data: { qrCode: qrDataUrl, status: 'connecting' },
      });
      io.to(`session-${sessionId}`).emit('qr-code', { sessionId, qr: qrDataUrl });
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      await prisma.session.update({
        where: { id: sessionId },
        data: { status: 'disconnected', qrCode: null },
      });
      io.to(`session-${sessionId}`).emit('session-status', { sessionId, status: 'disconnected' });

      if (shouldReconnect) {
        // Reconnect after a short delay
        setTimeout(() => createSession(sessionId, io), 3000);
      } else {
        // Session logged out, clean up
        sessions.delete(sessionId);
        // Remove auth files
        if (fs.existsSync(sessionDir)) {
          fs.rmSync(sessionDir, { recursive: true });
        }
      }
    }

    if (connection === 'open') {
      const user = sock.user;
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          status: 'connected',
          qrCode: null,
          phone: user?.id?.split(':')[0] || null,
        },
      });
      io.to(`session-${sessionId}`).emit('session-status', { sessionId, status: 'connected' });
      console.log(`✅ Session ${sessionId} connected as ${user?.id}`);
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
      if (jid === 'status@broadcast') continue; // Skip status updates

      const fromMe = msg.key.fromMe || false;
      const content = extractMessageContent(msg);
      const phone = jid.replace('@s.whatsapp.net', '').replace('@g.us', '');
      const pushName = msg.pushName || null;

      try {
        // Upsert contact
        let contact = await prisma.contact.upsert({
          where: { sessionId_jid: { sessionId, jid } },
          update: { pushName: pushName || undefined },
          create: {
            sessionId,
            jid,
            phone,
            pushName,
            name: pushName,
          },
        });

        // Save message
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

        // Emit to frontend
        io.to(`session-${sessionId}`).emit('new-message', {
          ...savedMsg,
          contact,
        });

        // Check auto-replies (only for incoming messages)
        if (!fromMe && content) {
          await handleAutoReply(sessionId, jid, content, sock);
        }
      } catch (error) {
        console.error('Error processing message:', error);
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
            io.to(`session-${sessionId}`).emit('message-status', {
              messageId: update.key.id,
              status,
            });
          } catch (error) {
            // Message might not exist in DB
          }
        }
      }
    }
  });

  sessions.set(sessionId, { sock, store });
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
        break; // Only send one auto-reply per message
      }
    }
  } catch (error) {
    console.error('Auto-reply error:', error);
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
    await session.sock.logout();
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
