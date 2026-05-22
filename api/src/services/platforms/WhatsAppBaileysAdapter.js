/**
 * WhatsApp Non-API Adapter using Baileys
 * Connects to WhatsApp via QR Code or Pairing Code (like WhatsApp Web)
 * 
 * This provides full WhatsApp access without needing Meta Business API
 */

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, delay } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const { PrismaClient } = require('@prisma/client');
const BasePlatform = require('./BasePlatform');
const { triggerWebhook } = require('../webhook');

const prisma = new PrismaClient();

// Store active socket connections in memory
const activeSessions = new Map();

const SESSIONS_DIR = path.join(process.cwd(), 'sessions', 'whatsapp');

class WhatsAppBaileysAdapter extends BasePlatform {
  constructor(session) {
    super(session);
    this.sessionId = session.id;
    this.sessionDir = path.join(SESSIONS_DIR, session.id);
  }

  /**
   * Get active socket connection
   */
  getSocket() {
    return activeSessions.get(this.sessionId)?.sock || null;
  }

  /**
   * Start connection - generates QR code or uses pairing code
   * @param {object} io - Socket.IO instance for real-time updates
   * @param {object} options - { pairingCode: string, phoneNumber: string }
   */
  async connect(io, options = {}) {
    // Ensure session directory exists
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const logger = pino({ level: 'silent' });

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal: false,
      logger,
      browser: ['Chat Manager', 'Chrome', '120.0.0'],
      generateHighQualityLinkPreview: true,
      syncFullHistory: false,
    });

    // Store in memory
    activeSessions.set(this.sessionId, { sock, saveCreds });

    // Handle pairing code request
    if (options.usePairingCode && options.phoneNumber) {
      // Wait for socket to be ready
      await delay(3000);
      try {
        const code = await sock.requestPairingCode(options.phoneNumber);
        const pairingCode = code?.match(/.{1,4}/g)?.join('-') || code;

        await prisma.session.update({
          where: { id: this.sessionId },
          data: { pairingCode, status: 'connecting' },
        });

        if (io) {
          io.to(`session:${this.sessionId}`).emit('pairing-code', {
            sessionId: this.sessionId,
            pairingCode,
          });
        }
      } catch (err) {
        console.error(`[WhatsApp Baileys] Pairing code error for ${this.sessionId}:`, err.message);
      }
    }

    // Connection update handler
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // QR Code received
      if (qr) {
        await prisma.session.update({
          where: { id: this.sessionId },
          data: { qrCode: qr, status: 'qr_ready' },
        });

        if (io) {
          io.to(`session:${this.sessionId}`).emit('qr', {
            sessionId: this.sessionId,
            qr,
          });
        }
      }

      // Connected successfully
      if (connection === 'open') {
        const user = sock.user;
        await prisma.session.update({
          where: { id: this.sessionId },
          data: {
            status: 'connected',
            phone: user?.id?.split(':')[0] || user?.id?.split('@')[0] || null,
            username: user?.name || null,
            qrCode: null,
            pairingCode: null,
            sessionPath: this.sessionDir,
          },
        });

        if (io) {
          io.to(`session:${this.sessionId}`).emit('connected', {
            sessionId: this.sessionId,
            phone: user?.id,
            name: user?.name,
          });
          io.emit('session:status', { sessionId: this.sessionId, status: 'connected' });
        }

        triggerWebhook('session.connected', { sessionId: this.sessionId, platform: 'whatsapp' });
      }

      // Disconnected
      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error instanceof Boom)
          ? lastDisconnect.error.output.statusCode
          : 500;

        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        await prisma.session.update({
          where: { id: this.sessionId },
          data: { status: shouldReconnect ? 'connecting' : 'disconnected', qrCode: null },
        });

        if (io) {
          io.to(`session:${this.sessionId}`).emit('disconnected', {
            sessionId: this.sessionId,
            reason: statusCode,
            willReconnect: shouldReconnect,
          });
          io.emit('session:status', { sessionId: this.sessionId, status: 'disconnected' });
        }

        activeSessions.delete(this.sessionId);

        // Auto-reconnect unless logged out
        if (shouldReconnect) {
          setTimeout(() => this.connect(io, options), 5000);
        } else {
          // Logged out - clean up session files
          triggerWebhook('session.disconnected', { sessionId: this.sessionId, platform: 'whatsapp', loggedOut: true });
        }
      }
    });

    // Save credentials on update
    sock.ev.on('creds.update', saveCreds);

    // Incoming messages
    sock.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
      if (type !== 'notify') return;

      for (const msg of msgs) {
        try {
          await this._handleIncomingMessage(msg, io);
        } catch (err) {
          console.error(`[WhatsApp Baileys] Message handling error:`, err.message);
        }
      }
    });

    // Message status updates
    sock.ev.on('messages.update', async (updates) => {
      for (const update of updates) {
        try {
          await this._handleMessageUpdate(update, io);
        } catch (err) {
          console.error(`[WhatsApp Baileys] Status update error:`, err.message);
        }
      }
    });

    // Contacts updated
    sock.ev.on('contacts.update', async (contacts) => {
      for (const contact of contacts) {
        try {
          if (contact.id && contact.notify) {
            await prisma.contact.upsert({
              where: { sessionId_platformId: { sessionId: this.sessionId, platformId: contact.id } },
              update: { pushName: contact.notify, updatedAt: new Date() },
              create: { sessionId: this.sessionId, platformId: contact.id, pushName: contact.notify, phone: contact.id.split('@')[0] },
            });
          }
        } catch { /* skip */ }
      }
    });

    // Groups updated
    sock.ev.on('groups.update', async (groups) => {
      for (const group of groups) {
        try {
          await prisma.group.upsert({
            where: { sessionId_platformId: { sessionId: this.sessionId, platformId: group.id } },
            update: { name: group.subject || undefined, description: group.desc || undefined },
            create: {
              sessionId: this.sessionId,
              platformId: group.id,
              name: group.subject || 'Unknown Group',
              participants: '[]',
            },
          });
        } catch { /* skip */ }
      }
    });

    return sock;
  }

  /**
   * Disconnect the session
   */
  async disconnect() {
    const session = activeSessions.get(this.sessionId);
    if (session?.sock) {
      await session.sock.logout();
      activeSessions.delete(this.sessionId);
    }
    await prisma.session.update({
      where: { id: this.sessionId },
      data: { status: 'disconnected', qrCode: null, pairingCode: null },
    });
  }

  async verifyCredentials() {
    const sock = this.getSocket();
    if (sock && sock.user) {
      return {
        valid: true,
        info: {
          phone: sock.user.id?.split(':')[0] || sock.user.id?.split('@')[0],
          name: sock.user.name,
          platform: 'whatsapp',
        },
      };
    }
    // Check if session files exist
    if (fs.existsSync(path.join(this.sessionDir, 'creds.json'))) {
      return { valid: true, info: { note: 'Session files exist, needs reconnect' } };
    }
    return { valid: false, error: 'Not connected. Start QR scan or pairing code.' };
  }

  async sendText(to, text) {
    const sock = this.getSocket();
    if (!sock) throw Object.assign(new Error('WhatsApp not connected'), { statusCode: 503 });

    const jid = this._formatJid(to);
    const result = await sock.sendMessage(jid, { text });

    return {
      messageId: result.key.id,
      raw: result,
    };
  }

  async sendMedia(to, type, mediaUrl, options = {}) {
    const sock = this.getSocket();
    if (!sock) throw Object.assign(new Error('WhatsApp not connected'), { statusCode: 503 });

    const jid = this._formatJid(to);
    let msgContent;

    switch (type) {
      case 'image':
        msgContent = { image: { url: mediaUrl }, caption: options.caption || '' };
        break;
      case 'video':
        msgContent = { video: { url: mediaUrl }, caption: options.caption || '' };
        break;
      case 'audio':
        msgContent = { audio: { url: mediaUrl }, mimetype: options.mimeType || 'audio/mp4' };
        break;
      case 'document':
        msgContent = { document: { url: mediaUrl }, mimetype: options.mimeType || 'application/pdf', fileName: options.fileName || 'document' };
        break;
      case 'sticker':
        msgContent = { sticker: { url: mediaUrl } };
        break;
      default:
        msgContent = { document: { url: mediaUrl }, mimetype: options.mimeType || 'application/octet-stream' };
    }

    const result = await sock.sendMessage(jid, msgContent);
    return { messageId: result.key.id, raw: result };
  }

  async sendReaction(to, messageId, emoji) {
    const sock = this.getSocket();
    if (!sock) throw Object.assign(new Error('WhatsApp not connected'), { statusCode: 503 });

    const jid = this._formatJid(to);
    const result = await sock.sendMessage(jid, {
      react: { text: emoji || '', key: { remoteJid: jid, id: messageId } },
    });
    return { messageId: result?.key?.id, raw: result };
  }

  async markAsRead(to, messageIds) {
    const sock = this.getSocket();
    if (!sock) return false;

    const jid = this._formatJid(to);
    const keys = Array.isArray(messageIds)
      ? messageIds.map((id) => ({ remoteJid: jid, id }))
      : [{ remoteJid: jid, id: messageIds }];

    await sock.readMessages(keys);
    return true;
  }

  async getProfile() {
    const sock = this.getSocket();
    if (!sock) return null;
    return { user: sock.user };
  }

  async getGroupMetadata(groupJid) {
    const sock = this.getSocket();
    if (!sock) throw new Error('Not connected');
    return sock.groupMetadata(groupJid);
  }

  // ==================== PRIVATE METHODS ====================

  _formatJid(input) {
    if (input.includes('@')) return input;
    // Assume phone number, add @s.whatsapp.net
    const cleaned = input.replace(/[^0-9]/g, '');
    return `${cleaned}@s.whatsapp.net`;
  }

  async _handleIncomingMessage(msg, io) {
    if (!msg.message) return; // Skip empty/protocol messages

    const jid = msg.key.remoteJid;
    if (jid === 'status@broadcast') return; // Skip status updates

    const fromMe = msg.key.fromMe || false;
    const sender = fromMe ? 'me' : (msg.key.participant || jid);
    const pushName = msg.pushName || null;
    const timestamp = msg.messageTimestamp
      ? new Date(Number(msg.messageTimestamp) * 1000)
      : new Date();

    // Parse message content
    const parsed = this._parseMessageContent(msg.message);

    // Save to database
    const savedMessage = await prisma.message.create({
      data: {
        sessionId: this.sessionId,
        platformChatId: jid,
        senderName: pushName || sender.split('@')[0],
        content: parsed.content,
        type: parsed.type,
        mediaUrl: parsed.mediaUrl || null,
        mediaMimeType: parsed.mimeType || null,
        mediaFileName: parsed.fileName || null,
        fromMe,
        status: fromMe ? 'sent' : 'received',
        timestamp,
        externalMsgId: msg.key.id,
        quotedMsgId: msg.message?.extendedTextMessage?.contextInfo?.stanzaId || null,
        quotedContent: msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation || null,
        isForwarded: !!msg.message?.extendedTextMessage?.contextInfo?.isForwarded,
      },
    });

    // Upsert contact
    await prisma.contact.upsert({
      where: { sessionId_platformId: { sessionId: this.sessionId, platformId: jid } },
      update: {
        pushName: pushName || undefined,
        lastMessage: parsed.content.slice(0, 100),
        lastMsgTime: timestamp,
        unreadCount: fromMe ? 0 : { increment: 1 },
        isGroup: jid.endsWith('@g.us'),
      },
      create: {
        sessionId: this.sessionId,
        platformId: jid,
        pushName: pushName || null,
        phone: jid.split('@')[0],
        isGroup: jid.endsWith('@g.us'),
        lastMessage: parsed.content.slice(0, 100),
        lastMsgTime: timestamp,
        unreadCount: fromMe ? 0 : 1,
      },
    });

    // Emit via Socket.IO
    const eventData = {
      sessionId: this.sessionId,
      platform: 'whatsapp',
      message: savedMessage,
      contact: { platformId: jid, pushName, phone: jid.split('@')[0] },
    };

    if (io) {
      io.to(`session:${this.sessionId}`).emit('message', eventData);
      io.emit('inbox:message', eventData);
    }

    // Trigger webhooks
    triggerWebhook('message.received', eventData);

    // Auto-reply check
    if (!fromMe) {
      await this._checkAutoReply(jid, parsed.content);
    }
  }

  async _handleMessageUpdate(update, io) {
    if (!update.key || !update.update) return;

    const statusMap = { 2: 'sent', 3: 'delivered', 4: 'read' };
    const newStatus = statusMap[update.update.status];
    if (!newStatus) return;

    await prisma.message.updateMany({
      where: { sessionId: this.sessionId, externalMsgId: update.key.id },
      data: { status: newStatus },
    });

    if (io) {
      io.to(`session:${this.sessionId}`).emit('message-status', {
        sessionId: this.sessionId,
        messageId: update.key.id,
        status: newStatus,
      });
    }
  }

  _parseMessageContent(message) {
    if (message.conversation) {
      return { type: 'text', content: message.conversation };
    }
    if (message.extendedTextMessage) {
      return { type: 'text', content: message.extendedTextMessage.text || '' };
    }
    if (message.imageMessage) {
      return { type: 'image', content: message.imageMessage.caption || '[Image]', mediaUrl: message.imageMessage.url, mimeType: message.imageMessage.mimetype };
    }
    if (message.videoMessage) {
      return { type: 'video', content: message.videoMessage.caption || '[Video]', mediaUrl: message.videoMessage.url, mimeType: message.videoMessage.mimetype };
    }
    if (message.audioMessage) {
      return { type: message.audioMessage.ptt ? 'voice' : 'audio', content: '[Audio]', mediaUrl: message.audioMessage.url, mimeType: message.audioMessage.mimetype };
    }
    if (message.documentMessage) {
      return { type: 'document', content: message.documentMessage.fileName || '[Document]', mediaUrl: message.documentMessage.url, mimeType: message.documentMessage.mimetype, fileName: message.documentMessage.fileName };
    }
    if (message.stickerMessage) {
      return { type: 'sticker', content: '[Sticker]', mediaUrl: message.stickerMessage.url, mimeType: message.stickerMessage.mimetype };
    }
    if (message.locationMessage) {
      return { type: 'location', content: `[Location: ${message.locationMessage.degreesLatitude}, ${message.locationMessage.degreesLongitude}]` };
    }
    if (message.contactMessage) {
      return { type: 'contact', content: `[Contact: ${message.contactMessage.displayName || ''}]` };
    }
    if (message.reactionMessage) {
      return { type: 'reaction', content: message.reactionMessage.text || '' };
    }
    return { type: 'text', content: '[Unsupported message]' };
  }

  async _checkAutoReply(jid, content) {
    if (!content) return;

    const rules = await prisma.autoReply.findMany({
      where: { sessionId: this.sessionId, isActive: true },
    });

    for (const rule of rules) {
      let matched = false;
      const trigger = rule.trigger.toLowerCase();
      const msg = content.toLowerCase();

      switch (rule.matchType) {
        case 'exact': matched = msg === trigger; break;
        case 'contains': matched = msg.includes(trigger); break;
        case 'startsWith': matched = msg.startsWith(trigger); break;
        case 'regex':
          try { matched = new RegExp(rule.trigger, 'i').test(content); } catch { /* skip */ }
          break;
      }

      if (matched) {
        await delay(1000); // Small delay to seem natural
        await this.sendText(jid, rule.response);
        break; // Only first match
      }
    }
  }

  getFeatures() {
    return {
      sendText: true,
      sendMedia: true,
      sendTemplate: false,
      sendReaction: true,
      markAsRead: true,
      groups: true,
      broadcasts: true,
      typingIndicator: true,
      readReceipts: true,
      voiceMessages: true,
      stickers: true,
      qrLogin: true,
      pairingCode: true,
    };
  }
}

// ==================== MODULE EXPORTS ====================

/**
 * Get or create a Baileys adapter for a session
 */
function getBaileysAdapter(session) {
  return new WhatsAppBaileysAdapter(session);
}

/**
 * Check if a session is currently connected
 */
function isBaileysConnected(sessionId) {
  const session = activeSessions.get(sessionId);
  return !!(session?.sock?.user);
}

/**
 * Get all active Baileys sessions
 */
function getActiveBaileysSessions() {
  return Array.from(activeSessions.entries()).map(([id, { sock }]) => ({
    id,
    connected: !!sock?.user,
    phone: sock?.user?.id?.split(':')[0] || null,
    name: sock?.user?.name || null,
  }));
}

/**
 * Reconnect all stored sessions on server startup
 */
async function reconnectAllBaileysSessions(io) {
  const sessions = await prisma.session.findMany({
    where: { platform: 'whatsapp', status: { not: 'disconnected' } },
  });

  console.log(`[WhatsApp Baileys] Reconnecting ${sessions.length} sessions...`);

  for (const session of sessions) {
    if (fs.existsSync(path.join(SESSIONS_DIR, session.id, 'creds.json'))) {
      try {
        const adapter = new WhatsAppBaileysAdapter(session);
        await adapter.connect(io);
        console.log(`[WhatsApp Baileys] Reconnecting session: ${session.name} (${session.id})`);
      } catch (err) {
        console.error(`[WhatsApp Baileys] Failed to reconnect ${session.id}:`, err.message);
      }
    }
  }
}

module.exports = {
  WhatsAppBaileysAdapter,
  getBaileysAdapter,
  isBaileysConnected,
  getActiveBaileysSessions,
  reconnectAllBaileysSessions,
  activeSessions,
};
