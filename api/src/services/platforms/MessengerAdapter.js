/**
 * Facebook Messenger Adapter using facebook-chat-api (unofficial)
 * Connects as a REAL USER via cookies/appstate login
 * 
 * Flow:
 * 1. User provides Facebook email + password (or saved appstate cookies)
 * 2. (Optional) If 2FA required, user provides code
 * 3. Appstate (cookies) stored for future reconnects
 * 
 * Uses: facebook-chat-api (unofficial library, fca-unofficial fork)
 * Note: Facebook actively blocks unofficial access. This may require
 * manual cookie extraction from browser as a more reliable method.
 */

const login = require('facebook-chat-api');
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const BasePlatform = require('./BasePlatform');
const { triggerWebhook } = require('../webhook');

const prisma = new PrismaClient();

// Store active Messenger API instances in memory
const activeMessengerSessions = new Map();

const SESSIONS_DIR = path.join(process.cwd(), 'sessions', 'messenger');

class MessengerAdapter extends BasePlatform {
  constructor(session) {
    super(session);
    this.sessionId = session.id;
    this.sessionFile = path.join(SESSIONS_DIR, `${session.id}.json`);
  }

  /**
   * Get active Messenger API instance
   */
  getApi() {
    return activeMessengerSessions.get(this.sessionId)?.api || null;
  }

  /**
   * Start login process
   * @param {object} io - Socket.IO instance
   * @param {object} options - { email, password } or { appState } (cookies)
   */
  async connect(io, options = {}) {
    if (!fs.existsSync(SESSIONS_DIR)) {
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    }

    // Try to restore from saved appState
    if (fs.existsSync(this.sessionFile)) {
      try {
        const appState = JSON.parse(fs.readFileSync(this.sessionFile, 'utf8'));
        const api = await this._loginWithAppState(appState);

        activeMessengerSessions.set(this.sessionId, { api, io });
        await this._onConnected(api, io);
        this._setupListener(api, io);

        return { status: 'connected' };
      } catch (err) {
        console.log(`[Messenger] Saved session invalid for ${this.sessionId}: ${err.message}`);
      }
    }

    // If appState provided directly (e.g., user pasted cookies from browser)
    if (options.appState) {
      try {
        const appState = typeof options.appState === 'string'
          ? JSON.parse(options.appState)
          : options.appState;

        const api = await this._loginWithAppState(appState);

        // Save appState
        fs.writeFileSync(this.sessionFile, JSON.stringify(api.getAppState()), 'utf8');

        activeMessengerSessions.set(this.sessionId, { api, io });
        await this._onConnected(api, io);
        this._setupListener(api, io);

        return { status: 'connected' };
      } catch (err) {
        throw Object.assign(new Error(`AppState login failed: ${err.message}`), { statusCode: 401 });
      }
    }

    // Login with email/password
    if (options.email && options.password) {
      return this._loginWithCredentials(options.email, options.password, io);
    }

    await prisma.session.update({
      where: { id: this.sessionId },
      data: { status: 'connecting' },
    });

    return {
      status: 'awaiting_login',
      message: 'Provide Facebook email+password, or paste appState cookies from browser (more reliable)',
    };
  }

  /**
   * Login with appState cookies
   */
  _loginWithAppState(appState) {
    return new Promise((resolve, reject) => {
      login({ appState }, (err, api) => {
        if (err) return reject(err);
        api.setOptions({ listenEvents: true, selfListen: true, updatePresence: false });
        resolve(api);
      });
    });
  }

  /**
   * Login with email and password
   */
  async _loginWithCredentials(email, password, io) {
    return new Promise((resolve, reject) => {
      login({ email, password }, (err, api) => {
        if (err) {
          // Handle 2FA
          if (err.error === 'login-approval') {
            activeMessengerSessions.set(this.sessionId, { loginCallback: err.continue, io });

            prisma.session.update({
              where: { id: this.sessionId },
              data: { status: 'otp_required' },
            }).then(() => {
              if (io) {
                io.to(`session:${this.sessionId}`).emit('2fa-required', {
                  sessionId: this.sessionId,
                  platform: 'messenger',
                  message: 'Facebook 2FA code required. Check your authenticator app.',
                });
              }
              resolve({ status: '2fa_required', message: 'Enter 2FA code from authenticator' });
            });
            return;
          }

          reject(Object.assign(
            new Error(`Messenger login failed: ${err.error || err.message || JSON.stringify(err)}`),
            { statusCode: 401 }
          ));
          return;
        }

        api.setOptions({ listenEvents: true, selfListen: true, updatePresence: false });

        // Save appState
        fs.writeFileSync(this.sessionFile, JSON.stringify(api.getAppState()), 'utf8');

        activeMessengerSessions.set(this.sessionId, { api, io });
        this._onConnected(api, io).then(() => {
          this._setupListener(api, io);
          resolve({ status: 'connected' });
        });
      });
    });
  }

  /**
   * Submit 2FA code
   */
  async submit2FA(code, io) {
    const sessionData = activeMessengerSessions.get(this.sessionId);
    if (!sessionData?.loginCallback) {
      throw Object.assign(new Error('No pending 2FA login'), { statusCode: 400 });
    }

    return new Promise((resolve, reject) => {
      sessionData.loginCallback(code, (err, api) => {
        if (err) {
          reject(Object.assign(new Error(`2FA failed: ${err.message || err}`), { statusCode: 401 }));
          return;
        }

        api.setOptions({ listenEvents: true, selfListen: true, updatePresence: false });

        // Save appState
        fs.writeFileSync(this.sessionFile, JSON.stringify(api.getAppState()), 'utf8');

        activeMessengerSessions.set(this.sessionId, { api, io });
        this._onConnected(api, io).then(() => {
          this._setupListener(api, io);
          resolve({ status: 'connected' });
        });
      });
    });
  }

  async _onConnected(api, io) {
    const userId = api.getCurrentUserID();

    // Try to get user info
    let userName = userId;
    try {
      const info = await new Promise((resolve, reject) => {
        api.getUserInfo([userId], (err, data) => {
          if (err) reject(err);
          else resolve(data);
        });
      });
      userName = info[userId]?.name || userId;
    } catch { /* skip */ }

    await prisma.session.update({
      where: { id: this.sessionId },
      data: {
        status: 'connected',
        username: userName,
        phone: userId,
        sessionPath: this.sessionFile,
      },
    });

    if (io) {
      io.to(`session:${this.sessionId}`).emit('connected', {
        sessionId: this.sessionId,
        platform: 'messenger',
        info: { userId, name: userName },
      });
      io.emit('session:status', { sessionId: this.sessionId, status: 'connected' });
    }

    triggerWebhook('session.connected', { sessionId: this.sessionId, platform: 'messenger' });
  }

  /**
   * Setup real-time message listener
   */
  _setupListener(api, io) {
    const stopListening = api.listenMqtt(async (err, event) => {
      if (err) {
        console.error(`[Messenger] Listen error for ${this.sessionId}:`, err.message || err);
        // Try to reconnect
        if (err.error === 'Connection closed') {
          activeMessengerSessions.delete(this.sessionId);
          await prisma.session.update({
            where: { id: this.sessionId },
            data: { status: 'disconnected' },
          });
          if (io) io.emit('session:status', { sessionId: this.sessionId, status: 'disconnected' });
        }
        return;
      }

      if (event.type === 'message' || event.type === 'message_reply') {
        await this._handleIncomingMessage(api, event, io);
      }
      if (event.type === 'message_reaction') {
        await this._handleReaction(event, io);
      }
      if (event.type === 'read_receipt') {
        await this._handleReadReceipt(event, io);
      }
    });

    const sessionData = activeMessengerSessions.get(this.sessionId);
    if (sessionData) sessionData.stopListening = stopListening;
  }

  async _handleIncomingMessage(api, event, io) {
    const threadId = event.threadID;
    const senderId = event.senderID;
    const fromMe = senderId === api.getCurrentUserID();
    const timestamp = event.timestamp ? new Date(parseInt(event.timestamp)) : new Date();

    // Get sender name
    let senderName = senderId;
    try {
      const info = await new Promise((resolve, reject) => {
        api.getUserInfo([senderId], (err, data) => err ? reject(err) : resolve(data));
      });
      senderName = info[senderId]?.name || senderId;
    } catch { /* skip */ }

    // Determine if group
    const isGroup = event.isGroup || false;

    // Parse content
    const parsed = this._parseEvent(event);

    const savedMessage = await prisma.message.create({
      data: {
        sessionId: this.sessionId,
        platformChatId: threadId,
        senderName,
        content: parsed.content,
        type: parsed.type,
        mediaUrl: parsed.mediaUrl || null,
        fromMe,
        status: fromMe ? 'sent' : 'received',
        timestamp,
        externalMsgId: event.messageID,
        isForwarded: !!event.isForwarded,
      },
    });

    // Upsert contact
    await prisma.contact.upsert({
      where: { sessionId_platformId: { sessionId: this.sessionId, platformId: threadId } },
      update: {
        pushName: isGroup ? (event.threadName || senderName) : senderName,
        lastMessage: parsed.content.slice(0, 100),
        lastMsgTime: timestamp,
        unreadCount: fromMe ? 0 : { increment: 1 },
        isGroup,
      },
      create: {
        sessionId: this.sessionId,
        platformId: threadId,
        pushName: isGroup ? (event.threadName || senderName) : senderName,
        isGroup,
        lastMessage: parsed.content.slice(0, 100),
        lastMsgTime: timestamp,
        unreadCount: fromMe ? 0 : 1,
      },
    });

    const eventData = {
      sessionId: this.sessionId,
      platform: 'messenger',
      message: savedMessage,
      contact: { platformId: threadId, pushName: senderName, isGroup },
    };

    if (io) {
      io.to(`session:${this.sessionId}`).emit('message', eventData);
      io.emit('inbox:message', eventData);
    }

    triggerWebhook('message.received', eventData);
  }

  async _handleReaction(event, io) {
    // Store as a special message or update existing
    if (io) {
      io.to(`session:${this.sessionId}`).emit('reaction', {
        sessionId: this.sessionId,
        platform: 'messenger',
        messageId: event.messageID,
        reaction: event.reaction,
        senderId: event.senderID,
      });
    }
  }

  async _handleReadReceipt(event, io) {
    if (io) {
      io.to(`session:${this.sessionId}`).emit('message-status', {
        sessionId: this.sessionId,
        threadId: event.threadID,
        status: 'read',
        time: event.time,
      });
    }
  }

  _parseEvent(event) {
    if (event.body) {
      return { type: 'text', content: event.body };
    }
    if (event.attachments && event.attachments.length > 0) {
      const att = event.attachments[0];
      switch (att.type) {
        case 'photo':
          return { type: 'image', content: '[Photo]', mediaUrl: att.largePreviewUrl || att.previewUrl || att.url };
        case 'video':
          return { type: 'video', content: '[Video]', mediaUrl: att.url };
        case 'audio':
          return { type: 'audio', content: '[Audio]', mediaUrl: att.url };
        case 'file':
          return { type: 'document', content: att.filename || '[File]', mediaUrl: att.url };
        case 'animated_image':
          return { type: 'sticker', content: '[GIF]', mediaUrl: att.previewUrl || att.url };
        case 'sticker':
          return { type: 'sticker', content: '[Sticker]', mediaUrl: att.url };
        case 'share':
          return { type: 'text', content: `[Link: ${att.title || att.url || ''}]`, mediaUrl: att.url };
        default:
          return { type: 'text', content: `[${att.type || 'attachment'}]`, mediaUrl: att.url };
      }
    }
    return { type: 'text', content: event.body || '[Empty message]' };
  }

  async disconnect() {
    const sessionData = activeMessengerSessions.get(this.sessionId);
    if (sessionData?.stopListening) {
      sessionData.stopListening();
    }
    activeMessengerSessions.delete(this.sessionId);

    await prisma.session.update({
      where: { id: this.sessionId },
      data: { status: 'disconnected' },
    });
  }

  async verifyCredentials() {
    const api = this.getApi();
    if (api) {
      try {
        const userId = api.getCurrentUserID();
        return { valid: true, info: { userId } };
      } catch { /* fall through */ }
    }
    if (fs.existsSync(this.sessionFile)) {
      return { valid: true, info: { note: 'AppState file exists, needs reconnect' } };
    }
    return { valid: false, error: 'Not logged in. Provide credentials or appState cookies.' };
  }

  async sendText(to, text) {
    const api = this.getApi();
    if (!api) throw Object.assign(new Error('Messenger not connected'), { statusCode: 503 });

    return new Promise((resolve, reject) => {
      api.sendMessage(text, to, (err, info) => {
        if (err) reject(Object.assign(new Error(err.message || err), { statusCode: 500 }));
        else resolve({ messageId: info?.messageID || null, raw: info });
      });
    });
  }

  async sendMedia(to, type, mediaUrl, options = {}) {
    const api = this.getApi();
    if (!api) throw Object.assign(new Error('Messenger not connected'), { statusCode: 503 });

    // facebook-chat-api supports attachments via URL or stream
    const msg = {};
    if (options.caption) msg.body = options.caption;

    // For URL-based media, send as attachment
    if (mediaUrl.startsWith('http')) {
      msg.url = mediaUrl;
    } else {
      msg.attachment = fs.createReadStream(mediaUrl);
    }

    return new Promise((resolve, reject) => {
      api.sendMessage(msg, to, (err, info) => {
        if (err) reject(Object.assign(new Error(err.message || err), { statusCode: 500 }));
        else resolve({ messageId: info?.messageID || null, raw: info });
      });
    });
  }

  async sendReaction(to, messageId, emoji) {
    const api = this.getApi();
    if (!api) throw Object.assign(new Error('Messenger not connected'), { statusCode: 503 });

    return new Promise((resolve, reject) => {
      api.setMessageReaction(emoji || '', messageId, (err) => {
        if (err) reject(err);
        else resolve({ messageId: null });
      });
    });
  }

  async markAsRead(threadId) {
    const api = this.getApi();
    if (!api) return false;

    return new Promise((resolve) => {
      api.markAsRead(threadId, (err) => resolve(!err));
    });
  }

  async getProfile() {
    const api = this.getApi();
    if (!api) return null;

    const userId = api.getCurrentUserID();
    return new Promise((resolve) => {
      api.getUserInfo([userId], (err, data) => {
        if (err) resolve({ userId });
        else resolve({ userId, ...data[userId] });
      });
    });
  }

  getFeatures() {
    return {
      sendText: true,
      sendMedia: true,
      sendTemplate: false,
      sendReaction: true,
      markAsRead: true,
      groups: true,
      broadcasts: false,
      typingIndicator: true,
      readReceipts: true,
      voiceMessages: false,
      stickers: true,
      qrLogin: false,
      pairingCode: false,
      phoneOtp: false,
      usernamePassword: true,
      appStateCookies: true,
    };
  }
}

// ==================== MODULE EXPORTS ====================

function getMessengerAdapter(session) {
  return new MessengerAdapter(session);
}

function isMessengerConnected(sessionId) {
  return !!activeMessengerSessions.get(sessionId)?.api;
}

async function reconnectAllMessengerSessions(io) {
  const sessions = await prisma.session.findMany({
    where: { platform: 'messenger', status: { not: 'disconnected' } },
  });

  console.log(`[Messenger] Reconnecting ${sessions.length} sessions...`);

  for (const session of sessions) {
    const sessionFile = path.join(SESSIONS_DIR, `${session.id}.json`);
    if (fs.existsSync(sessionFile)) {
      try {
        const adapter = new MessengerAdapter(session);
        await adapter.connect(io);
        console.log(`[Messenger] Reconnected: ${session.name} (${session.id})`);
      } catch (err) {
        console.error(`[Messenger] Failed to reconnect ${session.id}:`, err.message);
      }
    }
  }
}

module.exports = {
  MessengerAdapter,
  getMessengerAdapter,
  isMessengerConnected,
  reconnectAllMessengerSessions,
  activeMessengerSessions,
};
