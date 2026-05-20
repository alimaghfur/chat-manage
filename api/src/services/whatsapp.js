const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  Browsers,
  proto,
  getContentType,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const { triggerWebhook } = require('./webhook');

const prisma = new PrismaClient();
const logger = pino({ level: 'silent' });

/** @type {Map<string, { sock: any, store: any }>} */
const sessions = new Map();

const SESSIONS_DIR = path.join(__dirname, '../../sessions');

// Ensure sessions directory exists
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

/**
 * Create a new WhatsApp session using Baileys
 * @param {string} sessionId - Unique session identifier
 * @param {import('socket.io').Server} io - Socket.IO server instance
 * @param {object} options - Session options
 * @param {boolean} [options.usePairingCode] - Use pairing code instead of QR
 * @param {string} [options.phoneNumber] - Phone number for pairing code
 * @param {string} [options.proxyUrl] - Proxy URL (socks5://user:pass@host:port)
 * @returns {Promise<object>} The WASocket instance
 */
async function createSession(sessionId, io, options = {}) {
  const { usePairingCode, phoneNumber, proxyUrl } = options;
  const sessionDir = path.join(SESSIONS_DIR, sessionId);

  // Ensure session directory exists
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const socketOptions = {
    version,
    logger,
    browser: Browsers.macOS('Chrome'),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: false,
    generateHighQualityLinkPreview: true,
  };

  // Add proxy support if provided
  if (proxyUrl) {
    try {
      const { HttpsProxyAgent } = require('https-proxy-agent');
      socketOptions.agent = new HttpsProxyAgent(proxyUrl);
    } catch (err) {
      console.warn(`Proxy agent not available: ${err.message}`);
    }
  }

  const sock = makeWASocket(socketOptions);
  const store = { contacts: {}, chats: [], messages: {} };

  sessions.set(sessionId, { sock, store });

  let pairingCodeRequested = false;

  // Connection update handler
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Request pairing code after socket is connected to WA server
    if (usePairingCode && phoneNumber && !pairingCodeRequested && !sock.authState.creds.registered) {
      if (connection === 'connecting' || qr) {
        pairingCodeRequested = true;
        // Wait for socket to be ready
        setTimeout(async () => {
          try {
            const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
            console.log(`Requesting pairing code for ${cleanNumber}...`);
            const code = await sock.requestPairingCode(cleanNumber);
            console.log(`Pairing code for ${sessionId}: ${code}`);
            io.to(`session:${sessionId}`).emit('pairing-code', {
              sessionId,
              code,
            });
          } catch (err) {
            console.error(`Failed to request pairing code for ${sessionId}:`, err.message);
            io.to(`session:${sessionId}`).emit('session-error', {
              sessionId,
              error: 'Failed to generate pairing code: ' + err.message,
            });
          }
        }, 3000);
      }
    }

    if (qr && !usePairingCode) {
      // Convert QR string to data URL image
      const QRCode = require('qrcode');
      try {
        const qrDataUrl = await QRCode.toDataURL(qr);
        // Emit QR code as image for scanning
        io.to(`session:${sessionId}`).emit('qr', { sessionId, qr: qrDataUrl });

        // Update session in DB
        await prisma.session.update({
          where: { id: sessionId },
          data: { qrCode: qrDataUrl, status: 'connecting' },
        }).catch(() => {});
      } catch (err) {
        console.error(`Failed to generate QR image for ${sessionId}:`, err.message);
      }
    }

    if (connection === 'open') {
      console.log(`Session ${sessionId} connected`);

      // Update session status in DB
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          status: 'connected',
          qrCode: null,
          phone: sock.user?.id?.split(':')[0] || null,
        },
      }).catch(() => {});

      io.to(`session:${sessionId}`).emit('session-connected', { sessionId });
      triggerWebhook('connection', {
        sessionId,
        status: 'connected',
        phone: sock.user?.id,
      });
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(
        `Session ${sessionId} disconnected. Status: ${statusCode}. Reconnect: ${shouldReconnect}`
      );

      // Update session status in DB
      await prisma.session.update({
        where: { id: sessionId },
        data: { status: 'disconnected', qrCode: null },
      }).catch(() => {});

      io.to(`session:${sessionId}`).emit('session-disconnected', {
        sessionId,
        reason: statusCode,
      });

      triggerWebhook('connection', {
        sessionId,
        status: 'disconnected',
        reason: statusCode,
      });

      // Remove from sessions map
      sessions.delete(sessionId);

      // Reconnect if not logged out
      if (shouldReconnect) {
        setTimeout(() => {
          createSession(sessionId, io, options).catch((err) => {
            console.error(`Failed to reconnect session ${sessionId}:`, err.message);
          });
        }, 3000);
      } else {
        // Clean up session files on logout
        try {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        } catch (err) {
          console.error(`Failed to clean session files for ${sessionId}:`, err.message);
        }
      }
    }
  });

  // Credentials update handler
  sock.ev.on('creds.update', saveCreds);

  // Messages upsert handler
  sock.ev.on('messages.upsert', async ({ messages: newMessages, type }) => {
    if (type !== 'notify') return;

    for (const msg of newMessages) {
      try {
        const jid = msg.key.remoteJid;
        if (!jid || jid === 'status@broadcast') continue;

        const contentType = getContentType(msg.message);
        const content = extractMessageContent(msg, contentType);
        const messageType = mapContentType(contentType);

        // Save message to database
        const savedMessage = await prisma.message.create({
          data: {
            sessionId,
            jid,
            messageId: msg.key.id,
            content: content || '',
            type: messageType,
            fromMe: msg.key.fromMe || false,
            status: msg.key.fromMe ? 'sent' : 'received',
            timestamp: msg.messageTimestamp
              ? new Date(parseInt(msg.messageTimestamp) * 1000)
              : new Date(),
            quotedMsgId: msg.message?.extendedTextMessage?.contextInfo?.stanzaId || null,
            mediaUrl: null,
            mimeType: extractMimeType(msg.message, contentType),
            fileName: extractFileName(msg.message, contentType),
          },
        });

        // Emit event via Socket.IO
        const eventData = {
          sessionId,
          message: savedMessage,
          raw: {
            key: msg.key,
            pushName: msg.pushName,
            messageTimestamp: msg.messageTimestamp,
          },
        };

        io.to(`session:${sessionId}`).emit('message', eventData);

        // Trigger webhook
        triggerWebhook('message', eventData);
      } catch (err) {
        console.error(`Error processing message for session ${sessionId}:`, err.message);
      }
    }
  });

  // Messages update handler (status tracking)
  sock.ev.on('messages.update', async (updates) => {
    for (const update of updates) {
      try {
        const { key, update: msgUpdate } = update;
        if (!key.id || !key.remoteJid) continue;

        let status = null;
        if (msgUpdate.status === 2) status = 'sent';
        else if (msgUpdate.status === 3) status = 'delivered';
        else if (msgUpdate.status === 4) status = 'read';

        if (status) {
          // Update message status in database
          await prisma.message.updateMany({
            where: {
              sessionId,
              messageId: key.id,
            },
            data: { status },
          });

          // Emit status update
          const eventData = {
            sessionId,
            messageId: key.id,
            jid: key.remoteJid,
            status,
          };

          io.to(`session:${sessionId}`).emit('message-status', eventData);
          triggerWebhook('status', eventData);
        }
      } catch (err) {
        console.error(`Error updating message status for session ${sessionId}:`, err.message);
      }
    }
  });

  return sock;
}

/**
 * Extract text content from a message
 */
function extractMessageContent(msg, contentType) {
  if (!msg.message) return '';

  switch (contentType) {
    case 'conversation':
      return msg.message.conversation || '';
    case 'extendedTextMessage':
      return msg.message.extendedTextMessage?.text || '';
    case 'imageMessage':
      return msg.message.imageMessage?.caption || '[Image]';
    case 'videoMessage':
      return msg.message.videoMessage?.caption || '[Video]';
    case 'documentMessage':
      return msg.message.documentMessage?.fileName || '[Document]';
    case 'audioMessage':
      return '[Audio]';
    case 'stickerMessage':
      return '[Sticker]';
    case 'reactionMessage':
      return msg.message.reactionMessage?.text || '';
    case 'locationMessage':
      return '[Location]';
    default:
      return '';
  }
}

/**
 * Map Baileys content type to our message type
 */
function mapContentType(contentType) {
  const typeMap = {
    conversation: 'text',
    extendedTextMessage: 'text',
    imageMessage: 'image',
    videoMessage: 'video',
    documentMessage: 'document',
    audioMessage: 'audio',
    stickerMessage: 'sticker',
    reactionMessage: 'reaction',
    locationMessage: 'location',
  };
  return typeMap[contentType] || 'text';
}

/**
 * Extract MIME type from a message
 */
function extractMimeType(message, contentType) {
  if (!message) return null;
  const mediaTypes = ['imageMessage', 'videoMessage', 'documentMessage', 'audioMessage', 'stickerMessage'];
  if (mediaTypes.includes(contentType)) {
    return message[contentType]?.mimetype || null;
  }
  return null;
}

/**
 * Extract file name from a message
 */
function extractFileName(message, contentType) {
  if (!message) return null;
  if (contentType === 'documentMessage') {
    return message.documentMessage?.fileName || null;
  }
  return null;
}

/**
 * Send a text message
 * @param {string} sessionId - Session ID
 * @param {string} jid - Recipient JID
 * @param {string} text - Message text
 * @param {object} [options] - Send options
 * @param {string} [options.quotedMsgId] - Message ID to quote/reply to
 * @returns {Promise<object>} Sent message info
 */
async function sendTextMessage(sessionId, jid, text, options = {}) {
  const session = getSession(sessionId);
  if (!session) {
    throw Object.assign(new Error('Session not found or not connected'), { statusCode: 404 });
  }

  const { quotedMsgId } = options;
  const sendOptions = {};

  if (quotedMsgId) {
    sendOptions.quoted = {
      key: {
        remoteJid: jid,
        id: quotedMsgId,
      },
      message: {},
    };
  }

  const result = await session.sock.sendMessage(jid, { text }, sendOptions);
  return result;
}

/**
 * Send a media message
 * @param {string} sessionId - Session ID
 * @param {string} jid - Recipient JID
 * @param {string} type - Media type (image, video, document, audio)
 * @param {string} mediaUrl - URL of the media file
 * @param {string} [caption] - Media caption
 * @param {string} [mimeType] - MIME type of the media
 * @param {string} [fileName] - File name for documents
 * @returns {Promise<object>} Sent message info
 */
async function sendMediaMessage(sessionId, jid, type, mediaUrl, caption, mimeType, fileName) {
  const session = getSession(sessionId);
  if (!session) {
    throw Object.assign(new Error('Session not found or not connected'), { statusCode: 404 });
  }

  // Download media from URL
  const response = await axios.get(mediaUrl, { responseType: 'arraybuffer' });
  const buffer = Buffer.from(response.data);

  let messageContent = {};

  switch (type) {
    case 'image':
      messageContent = {
        image: buffer,
        caption: caption || undefined,
        mimetype: mimeType || 'image/jpeg',
      };
      break;
    case 'video':
      messageContent = {
        video: buffer,
        caption: caption || undefined,
        mimetype: mimeType || 'video/mp4',
      };
      break;
    case 'document':
      messageContent = {
        document: buffer,
        mimetype: mimeType || 'application/octet-stream',
        fileName: fileName || 'file',
        caption: caption || undefined,
      };
      break;
    case 'audio':
      messageContent = {
        audio: buffer,
        mimetype: mimeType || 'audio/mpeg',
        ptt: false,
      };
      break;
    default:
      throw Object.assign(new Error(`Unsupported media type: ${type}`), { statusCode: 400 });
  }

  const result = await session.sock.sendMessage(jid, messageContent);
  return result;
}

/**
 * Send a reaction to a message
 * @param {string} sessionId - Session ID
 * @param {string} jid - Chat JID
 * @param {string} messageId - Message ID to react to
 * @param {string} emoji - Reaction emoji (empty string to remove)
 * @returns {Promise<object>} Sent message info
 */
async function sendReaction(sessionId, jid, messageId, emoji) {
  const session = getSession(sessionId);
  if (!session) {
    throw Object.assign(new Error('Session not found or not connected'), { statusCode: 404 });
  }

  const reactionMessage = {
    react: {
      text: emoji || '', // Empty string removes reaction
      key: {
        remoteJid: jid,
        id: messageId,
      },
    },
  };

  const result = await session.sock.sendMessage(jid, reactionMessage);
  return result;
}

/**
 * Get an active session
 * @param {string} sessionId - Session ID
 * @returns {object|null} Session object { sock, store } or null
 */
function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}

/**
 * Check if a session is connected
 * @param {string} sessionId - Session ID
 * @returns {boolean}
 */
function isSessionConnected(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return false;
  return session.sock?.user ? true : false;
}

/**
 * Disconnect and remove a session
 * @param {string} sessionId - Session ID
 */
async function disconnectSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;

  try {
    await session.sock.logout();
  } catch (err) {
    console.error(`Error logging out session ${sessionId}:`, err.message);
    // Force close the connection
    try {
      session.sock.end();
    } catch (e) {
      // Ignore
    }
  }

  sessions.delete(sessionId);

  // Update database
  await prisma.session.update({
    where: { id: sessionId },
    data: { status: 'disconnected', qrCode: null },
  }).catch(() => {});

  // Clean up session files
  const sessionDir = path.join(SESSIONS_DIR, sessionId);
  try {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  } catch (err) {
    console.error(`Failed to clean session files for ${sessionId}:`, err.message);
  }
}

module.exports = {
  sessions,
  createSession,
  sendTextMessage,
  sendMediaMessage,
  sendReaction,
  getSession,
  isSessionConnected,
  disconnectSession,
};
