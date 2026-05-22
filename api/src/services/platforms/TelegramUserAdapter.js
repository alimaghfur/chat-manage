/**
 * Telegram User Adapter using GramJS (telegram library)
 * Connects as a REAL USER (not a bot) via phone number + OTP code
 * 
 * Flow:
 * 1. User provides phone number
 * 2. Telegram sends OTP code via SMS/app
 * 3. User enters OTP code to complete auth
 * 4. (Optional) 2FA password if enabled
 * 5. Session is stored for future reconnects
 * 
 * Uses: telegram (GramJS) library
 */

const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const BasePlatform = require('./BasePlatform');
const { triggerWebhook } = require('../webhook');

const prisma = new PrismaClient();

// Store active Telegram client connections in memory
const activeTelegramSessions = new Map();

// Telegram API credentials (get from https://my.telegram.org)
const API_ID = parseInt(process.env.TELEGRAM_API_ID || '0');
const API_HASH = process.env.TELEGRAM_API_HASH || '';

const SESSIONS_DIR = path.join(process.cwd(), 'sessions', 'telegram');

class TelegramUserAdapter extends BasePlatform {
  constructor(session) {
    super(session);
    this.sessionId = session.id;
    this.sessionFile = path.join(SESSIONS_DIR, `${session.id}.session`);
  }

  /**
   * Get active client connection
   */
  getClient() {
    return activeTelegramSessions.get(this.sessionId)?.client || null;
  }

  /**
   * Start login process - sends OTP to phone number
   * @param {object} io - Socket.IO instance
   * @param {object} options - { phoneNumber }
   * @returns {Promise<{status: string, phoneCodeHash?: string}>}
   */
  async connect(io, options = {}) {
    if (!API_ID || !API_HASH) {
      throw Object.assign(
        new Error('TELEGRAM_API_ID and TELEGRAM_API_HASH env vars required. Get from https://my.telegram.org'),
        { statusCode: 400 }
      );
    }

    // Ensure session directory exists
    if (!fs.existsSync(SESSIONS_DIR)) {
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    }

    // Load existing session string if available
    let sessionString = '';
    if (fs.existsSync(this.sessionFile)) {
      sessionString = fs.readFileSync(this.sessionFile, 'utf8').trim();
    }

    const stringSession = new StringSession(sessionString);

    const client = new TelegramClient(stringSession, API_ID, API_HASH, {
      connectionRetries: 5,
      useWSS: false,
    });

    // Store in memory
    activeTelegramSessions.set(this.sessionId, { client, io });

    // If already has session, try to connect directly
    if (sessionString) {
      try {
        await client.connect();
        if (await client.isUserAuthorized()) {
          await this._onConnected(client, io);
          this._setupEventHandlers(client, io);
          return { status: 'connected' };
        }
      } catch (err) {
        console.log(`[Telegram] Stored session invalid for ${this.sessionId}, need re-auth`);
      }
    }

    // Need to start auth flow
    await client.connect();

    if (options.phoneNumber) {
      return this._startPhoneAuth(client, options.phoneNumber, io);
    }

    await prisma.session.update({
      where: { id: this.sessionId },
      data: { status: 'connecting' },
    });

    return { status: 'awaiting_phone', message: 'Please provide phone number to receive OTP' };
  }

  /**
   * Start phone authentication - sends OTP
   */
  async _startPhoneAuth(client, phoneNumber, io) {
    try {
      const result = await client.invoke(
        new Api.auth.SendCode({
          phoneNumber,
          apiId: API_ID,
          apiHash: API_HASH,
          settings: new Api.CodeSettings({}),
        })
      );

      // Store phone code hash for verification
      activeTelegramSessions.get(this.sessionId).phoneCodeHash = result.phoneCodeHash;
      activeTelegramSessions.get(this.sessionId).phoneNumber = phoneNumber;

      await prisma.session.update({
        where: { id: this.sessionId },
        data: { status: 'otp_required', phone: phoneNumber },
      });

      if (io) {
        io.to(`session:${this.sessionId}`).emit('otp-required', {
          sessionId: this.sessionId,
          platform: 'telegram',
          phoneNumber,
          message: 'OTP code sent to your Telegram app or SMS',
        });
      }

      return { status: 'otp_required', phoneCodeHash: result.phoneCodeHash };
    } catch (err) {
      throw Object.assign(new Error(`Failed to send OTP: ${err.message}`), { statusCode: 400 });
    }
  }

  /**
   * Submit OTP code to complete authentication
   * @param {string} code - OTP code received by user
   * @param {string} password - 2FA password (optional, if enabled)
   */
  async submitOTP(code, password, io) {
    const sessionData = activeTelegramSessions.get(this.sessionId);
    if (!sessionData || !sessionData.client) {
      throw Object.assign(new Error('No active login session. Start connect first.'), { statusCode: 400 });
    }

    const { client, phoneCodeHash, phoneNumber } = sessionData;

    try {
      // Try to sign in with code
      await client.invoke(
        new Api.auth.SignIn({
          phoneNumber,
          phoneCodeHash,
          phoneCode: code,
        })
      );
    } catch (err) {
      // Check if 2FA is required
      if (err.message?.includes('SESSION_PASSWORD_NEEDED') || err.errorMessage === 'SESSION_PASSWORD_NEEDED') {
        if (!password) {
          await prisma.session.update({
            where: { id: this.sessionId },
            data: { status: 'otp_required' }, // reuse status, frontend shows 2FA field
          });

          if (io) {
            io.to(`session:${this.sessionId}`).emit('2fa-required', {
              sessionId: this.sessionId,
              platform: 'telegram',
              message: '2FA password required',
            });
          }

          return { status: '2fa_required', message: 'Two-factor authentication password needed' };
        }

        // Submit 2FA password
        try {
          const passwordResult = await client.invoke(new Api.account.GetPassword());
          await client.invoke(
            new Api.auth.CheckPassword({
              password: await client.computePassword(passwordResult, password),
            })
          );
        } catch (err2FA) {
          throw Object.assign(new Error(`2FA failed: ${err2FA.message}`), { statusCode: 401 });
        }
      } else {
        throw Object.assign(new Error(`OTP verification failed: ${err.message}`), { statusCode: 401 });
      }
    }

    // Authentication successful
    await this._onConnected(client, io);
    this._setupEventHandlers(client, io);

    // Save session string for future reconnects
    const savedSession = client.session.save();
    fs.writeFileSync(this.sessionFile, savedSession, 'utf8');

    return { status: 'connected' };
  }

  /**
   * Send phone number to initiate OTP
   */
  async sendPhoneNumber(phoneNumber, io) {
    const sessionData = activeTelegramSessions.get(this.sessionId);
    if (!sessionData?.client) {
      // Need to connect first
      return this.connect(io, { phoneNumber });
    }
    return this._startPhoneAuth(sessionData.client, phoneNumber, io);
  }

  async _onConnected(client, io) {
    const me = await client.getMe();

    await prisma.session.update({
      where: { id: this.sessionId },
      data: {
        status: 'connected',
        phone: me.phone || null,
        username: me.username ? `@${me.username}` : null,
        avatar: null, // Could download profile photo
        sessionPath: this.sessionFile,
      },
    });

    if (io) {
      io.to(`session:${this.sessionId}`).emit('connected', {
        sessionId: this.sessionId,
        platform: 'telegram',
        info: {
          id: me.id?.toString(),
          firstName: me.firstName,
          lastName: me.lastName,
          username: me.username,
          phone: me.phone,
        },
      });
      io.emit('session:status', { sessionId: this.sessionId, status: 'connected' });
    }

    triggerWebhook('session.connected', { sessionId: this.sessionId, platform: 'telegram' });
  }

  /**
   * Setup event handlers for incoming messages
   */
  _setupEventHandlers(client, io) {
    // New messages handler
    client.addEventHandler(async (event) => {
      try {
        await this._handleNewMessage(event, io);
      } catch (err) {
        console.error(`[Telegram] Message handler error:`, err.message);
      }
    }, new NewMessage({}));
  }

  async _handleNewMessage(event, io) {
    const message = event.message;
    if (!message) return;

    const chat = await message.getChat();
    const sender = await message.getSender();

    const chatId = chat?.id?.toString() || message.chatId?.toString();
    const senderId = sender?.id?.toString() || '';
    const fromMe = sender?.self || false;
    const pushName = sender?.firstName
      ? `${sender.firstName}${sender.lastName ? ' ' + sender.lastName : ''}`
      : sender?.username || senderId;

    const isGroup = chat?.className === 'Chat' || chat?.className === 'Channel' || !!chat?.megagroup;
    const chatName = chat?.title || pushName;

    // Parse message content
    const parsed = this._parseMessage(message);

    const timestamp = message.date ? new Date(message.date * 1000) : new Date();

    // Save to database
    const savedMessage = await prisma.message.create({
      data: {
        sessionId: this.sessionId,
        platformChatId: chatId,
        senderName: pushName,
        content: parsed.content,
        type: parsed.type,
        mediaUrl: parsed.mediaUrl || null,
        mediaMimeType: parsed.mimeType || null,
        mediaFileName: parsed.fileName || null,
        fromMe,
        status: fromMe ? 'sent' : 'received',
        timestamp,
        externalMsgId: message.id?.toString(),
        quotedMsgId: message.replyTo?.replyToMsgId?.toString() || null,
        isForwarded: !!message.fwdFrom,
      },
    });

    // Upsert contact
    await prisma.contact.upsert({
      where: { sessionId_platformId: { sessionId: this.sessionId, platformId: chatId } },
      update: {
        pushName: chatName || undefined,
        username: chat?.username || sender?.username || undefined,
        lastMessage: parsed.content.slice(0, 100),
        lastMsgTime: timestamp,
        unreadCount: fromMe ? 0 : { increment: 1 },
        isGroup,
      },
      create: {
        sessionId: this.sessionId,
        platformId: chatId,
        pushName: chatName,
        username: chat?.username || sender?.username || null,
        phone: sender?.phone || null,
        isGroup,
        lastMessage: parsed.content.slice(0, 100),
        lastMsgTime: timestamp,
        unreadCount: fromMe ? 0 : 1,
      },
    });

    // Emit via Socket.IO
    const eventData = {
      sessionId: this.sessionId,
      platform: 'telegram',
      message: savedMessage,
      contact: { platformId: chatId, pushName: chatName, isGroup },
    };

    if (io) {
      io.to(`session:${this.sessionId}`).emit('message', eventData);
      io.emit('inbox:message', eventData);
    }

    triggerWebhook('message.received', eventData);
  }

  _parseMessage(message) {
    if (message.photo) {
      return { type: 'image', content: message.message || '[Photo]', mediaUrl: `tg_photo_${message.id}` };
    }
    if (message.video) {
      return { type: 'video', content: message.message || '[Video]', mediaUrl: `tg_video_${message.id}`, mimeType: message.video?.mimeType };
    }
    if (message.voice) {
      return { type: 'voice', content: '[Voice Message]', mediaUrl: `tg_voice_${message.id}`, mimeType: message.voice?.mimeType };
    }
    if (message.audio) {
      return { type: 'audio', content: message.audio?.attributes?.[0]?.title || '[Audio]', mediaUrl: `tg_audio_${message.id}`, mimeType: message.audio?.mimeType };
    }
    if (message.document) {
      const fileName = message.document?.attributes?.find((a) => a.fileName)?.fileName || 'document';
      return { type: 'document', content: fileName, mediaUrl: `tg_doc_${message.id}`, mimeType: message.document?.mimeType, fileName };
    }
    if (message.sticker) {
      return { type: 'sticker', content: message.sticker?.attributes?.[0]?.alt || '[Sticker]', mediaUrl: `tg_sticker_${message.id}` };
    }
    if (message.geo) {
      return { type: 'location', content: `[Location: ${message.geo.lat}, ${message.geo.long}]` };
    }
    if (message.contact) {
      return { type: 'contact', content: `[Contact: ${message.contact.firstName || ''} ${message.contact.phoneNumber || ''}]` };
    }
    // Default text
    return { type: 'text', content: message.message || message.text || '' };
  }

  async disconnect() {
    const sessionData = activeTelegramSessions.get(this.sessionId);
    if (sessionData?.client) {
      try {
        await sessionData.client.disconnect();
      } catch { /* ignore */ }
      activeTelegramSessions.delete(this.sessionId);
    }
    await prisma.session.update({
      where: { id: this.sessionId },
      data: { status: 'disconnected' },
    });
  }

  async verifyCredentials() {
    const client = this.getClient();
    if (client) {
      try {
        const me = await client.getMe();
        return {
          valid: true,
          info: {
            id: me.id?.toString(),
            firstName: me.firstName,
            username: me.username,
            phone: me.phone,
          },
        };
      } catch { /* fall through */ }
    }
    if (fs.existsSync(this.sessionFile)) {
      return { valid: true, info: { note: 'Session file exists, needs reconnect' } };
    }
    return { valid: false, error: 'Not authenticated. Start login with phone number.' };
  }

  async sendText(to, text) {
    const client = this.getClient();
    if (!client) throw Object.assign(new Error('Telegram not connected'), { statusCode: 503 });

    const peer = await this._resolvePeer(to);
    const result = await client.sendMessage(peer, { message: text });

    return {
      messageId: result.id?.toString(),
      raw: { id: result.id },
    };
  }

  async sendMedia(to, type, mediaUrl, options = {}) {
    const client = this.getClient();
    if (!client) throw Object.assign(new Error('Telegram not connected'), { statusCode: 503 });

    const peer = await this._resolvePeer(to);

    // For Telegram, mediaUrl could be a URL or file path
    const result = await client.sendFile(peer, {
      file: mediaUrl,
      caption: options.caption || '',
      forceDocument: type === 'document',
    });

    return { messageId: result.id?.toString(), raw: { id: result.id } };
  }

  async sendReaction(to, messageId, emoji) {
    const client = this.getClient();
    if (!client) throw Object.assign(new Error('Telegram not connected'), { statusCode: 503 });

    const peer = await this._resolvePeer(to);
    await client.invoke(
      new Api.messages.SendReaction({
        peer,
        msgId: parseInt(messageId),
        reaction: emoji ? [new Api.ReactionEmoji({ emoticon: emoji })] : [],
      })
    );

    return { messageId: null };
  }

  async markAsRead(to) {
    const client = this.getClient();
    if (!client) return false;

    try {
      const peer = await this._resolvePeer(to);
      await client.markAsRead(peer);
      return true;
    } catch { return false; }
  }

  async getProfile() {
    const client = this.getClient();
    if (!client) return null;
    const me = await client.getMe();
    return {
      id: me.id?.toString(),
      firstName: me.firstName,
      lastName: me.lastName,
      username: me.username,
      phone: me.phone,
    };
  }

  async _resolvePeer(to) {
    const client = this.getClient();
    // Try as username
    if (to.startsWith('@')) {
      return to;
    }
    // Try as numeric ID
    if (/^\d+$/.test(to)) {
      return to;
    }
    // Otherwise pass directly (could be username without @)
    return to;
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
      qrLogin: true, // Telegram also supports QR login
      pairingCode: false,
      phoneOtp: true,
      twoFactorAuth: true,
    };
  }
}

// ==================== MODULE EXPORTS ====================

function getTelegramAdapter(session) {
  return new TelegramUserAdapter(session);
}

function isTelegramConnected(sessionId) {
  const sessionData = activeTelegramSessions.get(sessionId);
  return !!sessionData?.client?.connected;
}

/**
 * Reconnect all stored Telegram sessions on server startup
 */
async function reconnectAllTelegramSessions(io) {
  const sessions = await prisma.session.findMany({
    where: { platform: 'telegram', status: { not: 'disconnected' } },
  });

  console.log(`[Telegram] Reconnecting ${sessions.length} sessions...`);

  for (const session of sessions) {
    const sessionFile = path.join(SESSIONS_DIR, `${session.id}.session`);
    if (fs.existsSync(sessionFile)) {
      try {
        const adapter = new TelegramUserAdapter(session);
        await adapter.connect(io);
        console.log(`[Telegram] Reconnected: ${session.name} (${session.id})`);
      } catch (err) {
        console.error(`[Telegram] Failed to reconnect ${session.id}:`, err.message);
      }
    }
  }
}

module.exports = {
  TelegramUserAdapter,
  getTelegramAdapter,
  isTelegramConnected,
  reconnectAllTelegramSessions,
  activeTelegramSessions,
};
