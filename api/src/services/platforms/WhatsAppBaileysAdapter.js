/**
 * WhatsApp Adapter using whatsapp-web.js (Puppeteer-based)
 * 
 * Connects to WhatsApp via QR Code scan - uses a real Chrome browser instance
 * which makes it more stable and less likely to be blocked than Baileys.
 * 
 * Library: whatsapp-web.js (https://github.com/pedroslopez/whatsapp-web.js)
 * Requires: Chromium/Chrome installed on the system
 */

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const BasePlatform = require('./BasePlatform');
const { triggerWebhook } = require('../webhook');

const prisma = new PrismaClient();

// Store active client connections in memory
const activeSessions = new Map();

const SESSIONS_DIR = path.join(process.cwd(), 'sessions', 'whatsapp');

class WhatsAppBaileysAdapter extends BasePlatform {
  constructor(session) {
    super(session);
    this.sessionId = session.id;
    this.sessionDir = path.join(SESSIONS_DIR, session.id);
  }

  /**
   * Get active whatsapp-web.js client
   */
  getClient() {
    return activeSessions.get(this.sessionId)?.client || null;
  }

  /**
   * Alias for backward compat
   */
  getSocket() {
    return this.getClient();
  }

  /**
   * Start connection - generates QR code for scanning
   * @param {object} io - Socket.IO instance for real-time updates
   * @param {object} options - { usePairingCode, phoneNumber }
   */
  async connect(io, options = {}) {
    // If already connected, return immediately
    const existing = activeSessions.get(this.sessionId);
    if (existing?.client?.info) {
      return { status: 'connected', message: 'Already connected' };
    }

    // Ensure session directory exists
    if (!fs.existsSync(SESSIONS_DIR)) {
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    }

    // Create whatsapp-web.js client with LocalAuth for session persistence
    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: this.sessionId,
        dataPath: SESSIONS_DIR,
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--single-process',
        ],
        executablePath: process.env.CHROMIUM_PATH || undefined,
      },
      webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/nicollysamen);/nicollys/refs/heads/main/nicollys.json',
      },
    });

    // Store in memory
    activeSessions.set(this.sessionId, { client, io });

    // Update status to connecting
    await prisma.session.update({
      where: { id: this.sessionId },
      data: { status: 'connecting', qrCode: null, pairingCode: null },
    });

    // ==================== EVENT HANDLERS ====================

    // QR Code event - fires when QR is ready to scan
    client.on('qr', async (qr) => {
      console.log(`[WhatsApp] QR generated for session: ${this.sessionId}`);

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
    });

    // Authenticated - QR scanned successfully, loading data
    client.on('authenticated', async () => {
      console.log(`[WhatsApp] Authenticated: ${this.sessionId}`);
      await prisma.session.update({
        where: { id: this.sessionId },
        data: { status: 'connecting', qrCode: null },
      });
    });

    // Ready - fully connected and ready to send/receive
    client.on('ready', async () => {
      console.log(`[WhatsApp] Ready: ${this.sessionId}`);

      const info = client.info;
      const phone = info?.wid?.user || info?.wid?._serialized?.split('@')[0] || null;
      const pushname = info?.pushname || null;

      await prisma.session.update({
        where: { id: this.sessionId },
        data: {
          status: 'connected',
          phone,
          username: pushname,
          qrCode: null,
          pairingCode: null,
          sessionPath: this.sessionDir,
          lastSeen: new Date(),
        },
      });

      if (io) {
        io.to(`session:${this.sessionId}`).emit('connected', {
          sessionId: this.sessionId,
          platform: 'whatsapp',
          phone,
          name: pushname,
        });
        io.emit('session:status', { sessionId: this.sessionId, status: 'connected' });
      }

      triggerWebhook('session.connected', { sessionId: this.sessionId, platform: 'whatsapp', phone });
    });

    // Disconnected
    client.on('disconnected', async (reason) => {
      console.log(`[WhatsApp] Disconnected: ${this.sessionId}, reason: ${reason}`);

      activeSessions.delete(this.sessionId);

      await prisma.session.update({
        where: { id: this.sessionId },
        data: { status: 'disconnected', qrCode: null },
      });

      if (io) {
        io.to(`session:${this.sessionId}`).emit('disconnected', {
          sessionId: this.sessionId,
          reason,
        });
        io.emit('session:status', { sessionId: this.sessionId, status: 'disconnected' });
      }

      triggerWebhook('session.disconnected', { sessionId: this.sessionId, platform: 'whatsapp', reason });
    });

    // Auth failure
    client.on('auth_failure', async (msg) => {
      console.error(`[WhatsApp] Auth failure: ${this.sessionId}:`, msg);

      activeSessions.delete(this.sessionId);

      await prisma.session.update({
        where: { id: this.sessionId },
        data: { status: 'disconnected', qrCode: null },
      });

      if (io) {
        io.to(`session:${this.sessionId}`).emit('auth-failure', {
          sessionId: this.sessionId,
          message: msg,
        });
      }
    });

    // ==================== MESSAGE HANDLERS ====================

    // Incoming message
    client.on('message', async (msg) => {
      try {
        await this._handleIncomingMessage(msg, io, false);
      } catch (err) {
        console.error(`[WhatsApp] Message handler error:`, err.message);
      }
    });

    // Outgoing message (sent by us from phone - NOT from API)
    client.on('message_create', async (msg) => {
      if (msg.fromMe) {
        try {
          // Skip if this message was already saved by our API (sent via dashboard/API)
          const msgId = msg.id?.id || msg.id?._serialized;
          if (msgId) {
            const existing = await prisma.message.findFirst({
              where: { sessionId: this.sessionId, externalMsgId: msgId },
            });
            if (existing) return; // Already saved by sendText/sendMedia route
          }
          await this._handleIncomingMessage(msg, io, true);
        } catch (err) {
          console.error(`[WhatsApp] Outgoing message handler error:`, err.message);
        }
      }
    });

    // Message ACK (status updates: sent, delivered, read)
    client.on('message_ack', async (msg, ack) => {
      try {
        await this._handleMessageAck(msg, ack, io);
      } catch (err) {
        console.error(`[WhatsApp] ACK handler error:`, err.message);
      }
    });

    // Group updates
    client.on('group_update', async (notification) => {
      try {
        const chat = await notification.getChat();
        if (chat.isGroup) {
          await prisma.group.upsert({
            where: { sessionId_platformId: { sessionId: this.sessionId, platformId: chat.id._serialized } },
            update: { name: chat.name, memberCount: chat.participants?.length || 0 },
            create: {
              sessionId: this.sessionId,
              platformId: chat.id._serialized,
              name: chat.name,
              participants: JSON.stringify(chat.participants?.map(p => p.id._serialized) || []),
              memberCount: chat.participants?.length || 0,
            },
          });
        }
      } catch { /* skip */ }
    });

    // ==================== INITIALIZE ====================

    // Start the client (this launches Puppeteer and WhatsApp Web)
    client.initialize().catch((err) => {
      console.error(`[WhatsApp] Initialize error for ${this.sessionId}:`, err.message);
      activeSessions.delete(this.sessionId);
      prisma.session.update({
        where: { id: this.sessionId },
        data: { status: 'disconnected' },
      }).catch(() => {});
    });

    return { status: 'connecting', message: 'WhatsApp session starting. QR code will appear shortly.' };
  }

  /**
   * Disconnect and destroy the session
   */
  async disconnect() {
    const sessionData = activeSessions.get(this.sessionId);
    if (sessionData?.client) {
      try {
        await sessionData.client.logout();
      } catch {
        try {
          await sessionData.client.destroy();
        } catch { /* ignore */ }
      }
      activeSessions.delete(this.sessionId);
    }
    await prisma.session.update({
      where: { id: this.sessionId },
      data: { status: 'disconnected', qrCode: null, pairingCode: null },
    });
  }

  async verifyCredentials() {
    const client = this.getClient();
    if (client?.info) {
      return {
        valid: true,
        info: {
          phone: client.info.wid?.user || null,
          name: client.info.pushname || null,
          platform: 'whatsapp (wwebjs)',
        },
      };
    }
    // Check if session data exists (LocalAuth stores in .wwebjs_auth)
    const authDir = path.join(SESSIONS_DIR, `session-${this.sessionId}`);
    if (fs.existsSync(authDir)) {
      return { valid: true, info: { note: 'Session data exists, needs reconnect' } };
    }
    return { valid: false, error: 'Not connected. Start QR scan.' };
  }

  async sendText(to, text) {
    const client = this.getClient();
    if (!client?.info) throw Object.assign(new Error('WhatsApp not connected'), { statusCode: 503 });

    const chatId = this._formatChatId(to);
    const msg = await client.sendMessage(chatId, text);

    return {
      messageId: msg.id?.id || msg.id?._serialized || null,
      raw: { id: msg.id, timestamp: msg.timestamp },
    };
  }

  async sendMedia(to, type, mediaUrl, options = {}) {
    const client = this.getClient();
    if (!client?.info) throw Object.assign(new Error('WhatsApp not connected'), { statusCode: 503 });

    const chatId = this._formatChatId(to);

    // Create media from URL
    const media = await MessageMedia.fromUrl(mediaUrl, { unsafeMime: true });

    const sendOptions = {};
    if (options.caption) sendOptions.caption = options.caption;
    if (type === 'document') {
      sendOptions.sendMediaAsDocument = true;
      if (options.fileName) media.filename = options.fileName;
    }
    if (type === 'sticker') sendOptions.sendMediaAsSticker = true;

    const msg = await client.sendMessage(chatId, media, sendOptions);

    return {
      messageId: msg.id?.id || msg.id?._serialized || null,
      raw: { id: msg.id, timestamp: msg.timestamp },
    };
  }

  async sendReaction(to, messageId, emoji) {
    const client = this.getClient();
    if (!client?.info) throw Object.assign(new Error('WhatsApp not connected'), { statusCode: 503 });

    // Need to get the message object to react to it
    const chatId = this._formatChatId(to);
    const chat = await client.getChatById(chatId);
    const messages = await chat.fetchMessages({ limit: 50 });
    const targetMsg = messages.find(m => (m.id?.id || m.id?._serialized) === messageId);

    if (!targetMsg) {
      throw Object.assign(new Error('Message not found for reaction'), { statusCode: 404 });
    }

    await targetMsg.react(emoji || '');
    return { messageId: null };
  }

  async markAsRead(to) {
    const client = this.getClient();
    if (!client?.info) return false;

    try {
      const chatId = this._formatChatId(to);
      const chat = await client.getChatById(chatId);
      await chat.sendSeen();
      return true;
    } catch { return false; }
  }

  async getProfile() {
    const client = this.getClient();
    if (!client?.info) return null;
    return {
      phone: client.info.wid?.user,
      name: client.info.pushname,
      platform: client.info.platform,
    };
  }

  async getGroupMetadata(groupId) {
    const client = this.getClient();
    if (!client?.info) throw new Error('Not connected');

    const chatId = this._formatChatId(groupId);
    const chat = await client.getChatById(chatId);
    if (!chat.isGroup) throw new Error('Not a group');

    return {
      id: chat.id._serialized,
      name: chat.name,
      description: chat.description,
      participants: chat.participants?.map(p => ({
        id: p.id._serialized,
        isAdmin: p.isAdmin,
        isSuperAdmin: p.isSuperAdmin,
      })) || [],
      owner: chat.owner?._serialized,
      createdAt: chat.createdAt,
    };
  }

  // ==================== PRIVATE METHODS ====================

  _formatChatId(input) {
    if (input.includes('@')) return input;
    // Clean phone number and add @c.us suffix
    const cleaned = input.replace(/[^0-9]/g, '');
    return `${cleaned}@c.us`;
  }

  async _handleIncomingMessage(msg, io, fromMe) {
    // Skip status messages and system messages
    if (msg.isStatus || msg.type === 'e2e_notification' || msg.type === 'notification_template') return;

    const chatId = msg.from || msg.to;
    if (!chatId) return;

    const contact = await msg.getContact();
    const chat = await msg.getChat();
    const pushName = contact?.pushname || contact?.name || contact?.number || chatId.split('@')[0];
    const isGroup = chat?.isGroup || chatId.endsWith('@g.us');
    const timestamp = msg.timestamp ? new Date(msg.timestamp * 1000) : new Date();

    // Parse message content
    const parsed = this._parseMessage(msg);

    // Save to database
    const savedMessage = await prisma.message.create({
      data: {
        sessionId: this.sessionId,
        platformChatId: fromMe ? (msg.to || chatId) : chatId,
        senderName: fromMe ? 'You' : pushName,
        content: parsed.content,
        type: parsed.type,
        mediaUrl: parsed.mediaUrl || null,
        mediaMimeType: parsed.mimeType || null,
        mediaFileName: parsed.fileName || null,
        fromMe: fromMe || false,
        status: fromMe ? 'sent' : 'received',
        timestamp,
        externalMsgId: msg.id?.id || msg.id?._serialized || null,
        quotedMsgId: msg.hasQuotedMsg ? (await msg.getQuotedMessage().catch(() => null))?.id?.id : null,
        isForwarded: msg.isForwarded || false,
        isStarred: msg.isStarred || false,
      },
    });

    // Upsert contact
    const contactChatId = fromMe ? (msg.to || chatId) : chatId;
    const contactName = isGroup ? (chat?.name || pushName) : pushName;

    await prisma.contact.upsert({
      where: { sessionId_platformId: { sessionId: this.sessionId, platformId: contactChatId } },
      update: {
        pushName: contactName || undefined,
        lastMessage: parsed.content.slice(0, 100),
        lastMsgTime: timestamp,
        unreadCount: fromMe ? 0 : { increment: 1 },
        isGroup,
      },
      create: {
        sessionId: this.sessionId,
        platformId: contactChatId,
        pushName: contactName || null,
        phone: contactChatId.split('@')[0],
        isGroup,
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
      contact: { platformId: contactChatId, pushName: contactName, phone: contactChatId.split('@')[0], isGroup },
    };

    if (io) {
      io.to(`session:${this.sessionId}`).emit('message', eventData);
      io.emit('inbox:message', eventData);
    }

    // Trigger webhooks (only for incoming)
    if (!fromMe) {
      triggerWebhook('message.received', eventData);

      // Check auto-reply
      await this._checkAutoReply(contactChatId, parsed.content);
    }
  }

  async _handleMessageAck(msg, ack, io) {
    // ack values: -1 = error, 0 = pending, 1 = sent, 2 = received (delivered), 3 = read, 4 = played
    const statusMap = { 1: 'sent', 2: 'delivered', 3: 'read', 4: 'read' };
    const newStatus = statusMap[ack];
    if (!newStatus) return;

    const msgId = msg.id?.id || msg.id?._serialized;
    if (!msgId) return;

    await prisma.message.updateMany({
      where: { sessionId: this.sessionId, externalMsgId: msgId },
      data: { status: newStatus },
    });

    if (io) {
      io.to(`session:${this.sessionId}`).emit('message-status', {
        sessionId: this.sessionId,
        messageId: msgId,
        status: newStatus,
        ack,
      });
    }
  }

  _parseMessage(msg) {
    const type = msg.type || 'chat';

    switch (type) {
      case 'chat':
        return { type: 'text', content: msg.body || '' };
      case 'image':
        return { type: 'image', content: msg.body || '[Image]', mediaUrl: msg.mediaKey || null, mimeType: msg.mimetype };
      case 'video':
        return { type: 'video', content: msg.body || '[Video]', mediaUrl: msg.mediaKey || null, mimeType: msg.mimetype };
      case 'audio':
      case 'ptt':
        return { type: type === 'ptt' ? 'voice' : 'audio', content: '[Audio]', mediaUrl: msg.mediaKey || null, mimeType: msg.mimetype };
      case 'document':
        return { type: 'document', content: msg.body || msg.filename || '[Document]', mediaUrl: msg.mediaKey || null, mimeType: msg.mimetype, fileName: msg.filename };
      case 'sticker':
        return { type: 'sticker', content: '[Sticker]', mediaUrl: msg.mediaKey || null, mimeType: msg.mimetype };
      case 'location':
        return { type: 'location', content: `[Location: ${msg.location?.latitude}, ${msg.location?.longitude}]` };
      case 'vcard':
      case 'multi_vcard':
        return { type: 'contact', content: `[Contact: ${msg.vCards?.[0] || msg.body || ''}]`.slice(0, 200) };
      case 'revoked':
        return { type: 'text', content: '[Message deleted]' };
      default:
        return { type: 'text', content: msg.body || `[${type}]` };
    }
  }

  async _checkAutoReply(chatId, content) {
    if (!content) return;

    const rules = await prisma.autoReply.findMany({
      where: { sessionId: this.sessionId, isActive: true },
    });

    for (const rule of rules) {
      let matched = false;
      const trigger = rule.trigger.toLowerCase();
      const msgLower = content.toLowerCase();

      switch (rule.matchType) {
        case 'exact': matched = msgLower === trigger; break;
        case 'contains': matched = msgLower.includes(trigger); break;
        case 'startsWith': matched = msgLower.startsWith(trigger); break;
        case 'regex':
          try { matched = new RegExp(rule.trigger, 'i').test(content); } catch { /* skip */ }
          break;
      }

      if (matched) {
        // Small delay to seem natural
        await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));
        await this.sendText(chatId, rule.response);
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
      pairingCode: false, // whatsapp-web.js doesn't support pairing code natively yet
    };
  }
}

// ==================== MODULE EXPORTS ====================

function getBaileysAdapter(session) {
  return new WhatsAppBaileysAdapter(session);
}

function isBaileysConnected(sessionId) {
  const sessionData = activeSessions.get(sessionId);
  return !!(sessionData?.client?.info);
}

function getActiveBaileysSessions() {
  return Array.from(activeSessions.entries()).map(([id, { client }]) => ({
    id,
    connected: !!client?.info,
    phone: client?.info?.wid?.user || null,
    name: client?.info?.pushname || null,
  }));
}

/**
 * Reconnect all stored WhatsApp sessions on server startup
 */
async function reconnectAllBaileysSessions(io) {
  const sessions = await prisma.session.findMany({
    where: { platform: 'whatsapp', status: { not: 'disconnected' } },
  });

  console.log(`[WhatsApp wwebjs] Reconnecting ${sessions.length} sessions...`);

  for (const session of sessions) {
    // Check if LocalAuth data exists
    const authDir = path.join(SESSIONS_DIR, `session-${session.id}`);
    if (fs.existsSync(authDir)) {
      try {
        const adapter = new WhatsAppBaileysAdapter(session);
        await adapter.connect(io);
        console.log(`[WhatsApp wwebjs] Reconnecting: ${session.name} (${session.id})`);
      } catch (err) {
        console.error(`[WhatsApp wwebjs] Failed to reconnect ${session.id}:`, err.message);
        await prisma.session.update({
          where: { id: session.id },
          data: { status: 'disconnected' },
        }).catch(() => {});
      }
    } else {
      // No saved session, mark as disconnected
      await prisma.session.update({
        where: { id: session.id },
        data: { status: 'disconnected' },
      }).catch(() => {});
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
