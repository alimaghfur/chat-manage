/**
 * Instagram DM Adapter using instagram-private-api
 * Connects as a REAL USER via username + password login
 * 
 * Flow:
 * 1. User provides Instagram username + password
 * 2. (Optional) If challenge required, user provides verification code
 * 3. Session cookies stored for future reconnects
 * 
 * Uses: instagram-private-api library
 */

const { IgApiClient, IgCheckpointError, IgLoginTwoFactorRequiredError } = require('instagram-private-api');
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const BasePlatform = require('./BasePlatform');
const { triggerWebhook } = require('../webhook');

const prisma = new PrismaClient();

// Store active Instagram client connections in memory
const activeInstagramSessions = new Map();

const SESSIONS_DIR = path.join(process.cwd(), 'sessions', 'instagram');

class InstagramAdapter extends BasePlatform {
  constructor(session) {
    super(session);
    this.sessionId = session.id;
    this.sessionFile = path.join(SESSIONS_DIR, `${session.id}.json`);
  }

  /**
   * Get active IG client
   */
  getClient() {
    return activeInstagramSessions.get(this.sessionId)?.client || null;
  }

  /**
   * Start login process
   * @param {object} io - Socket.IO instance
   * @param {object} options - { username, password }
   */
  async connect(io, options = {}) {
    if (!fs.existsSync(SESSIONS_DIR)) {
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    }

    const ig = new IgApiClient();

    // Try to restore from saved session
    if (fs.existsSync(this.sessionFile)) {
      try {
        const savedState = JSON.parse(fs.readFileSync(this.sessionFile, 'utf8'));
        await ig.state.deserialize(savedState);
        ig.state.generateDevice(savedState.deviceString || this.sessionId);

        // Test if session is still valid
        const currentUser = await ig.account.currentUser();

        activeInstagramSessions.set(this.sessionId, { client: ig, io });
        await this._onConnected(ig, currentUser, io);
        this._startPolling(ig, io);

        return { status: 'connected' };
      } catch (err) {
        console.log(`[Instagram] Saved session invalid for ${this.sessionId}, need re-login`);
      }
    }

    // Need fresh login
    if (!options.username || !options.password) {
      await prisma.session.update({
        where: { id: this.sessionId },
        data: { status: 'connecting' },
      });
      return { status: 'awaiting_login', message: 'Provide Instagram username and password' };
    }

    return this._login(ig, options.username, options.password, io);
  }

  /**
   * Login with username and password
   */
  async _login(ig, username, password, io) {
    ig.state.generateDevice(username);

    try {
      const auth = await ig.account.login(username, password);

      // Save session state
      const serialized = await ig.state.serialize();
      delete serialized.constants; // Remove large unnecessary data
      serialized.deviceString = username;
      fs.writeFileSync(this.sessionFile, JSON.stringify(serialized), 'utf8');

      activeInstagramSessions.set(this.sessionId, { client: ig, io });
      await this._onConnected(ig, auth, io);
      this._startPolling(ig, io);

      return { status: 'connected' };
    } catch (err) {
      // Challenge required (verification code sent via email/SMS)
      if (err instanceof IgCheckpointError) {
        await ig.challenge.auto(true); // Request challenge code

        activeInstagramSessions.set(this.sessionId, { client: ig, io, challengePending: true });

        await prisma.session.update({
          where: { id: this.sessionId },
          data: { status: 'otp_required' },
        });

        if (io) {
          io.to(`session:${this.sessionId}`).emit('otp-required', {
            sessionId: this.sessionId,
            platform: 'instagram',
            message: 'Instagram sent a verification code to your email/phone. Please enter it.',
          });
        }

        return { status: 'challenge_required', message: 'Verification code sent to email/phone' };
      }

      // 2FA required
      if (err instanceof IgLoginTwoFactorRequiredError) {
        const twoFactorInfo = err.response.body.two_factor_info;
        activeInstagramSessions.set(this.sessionId, {
          client: ig,
          io,
          twoFactorId: twoFactorInfo.two_factor_identifier,
          username,
        });

        await prisma.session.update({
          where: { id: this.sessionId },
          data: { status: 'otp_required' },
        });

        if (io) {
          io.to(`session:${this.sessionId}`).emit('2fa-required', {
            sessionId: this.sessionId,
            platform: 'instagram',
            message: 'Two-factor authentication code required',
          });
        }

        return { status: '2fa_required', message: 'Enter 2FA code from authenticator app' };
      }

      throw Object.assign(new Error(`Instagram login failed: ${err.message}`), { statusCode: 401 });
    }
  }

  /**
   * Submit challenge/verification code
   */
  async submitVerificationCode(code, io) {
    const sessionData = activeInstagramSessions.get(this.sessionId);
    if (!sessionData?.client) {
      throw Object.assign(new Error('No active login session'), { statusCode: 400 });
    }

    const { client: ig, challengePending, twoFactorId, username } = sessionData;

    try {
      if (challengePending) {
        // Challenge verification
        await ig.challenge.sendSecurityCode(code);
      } else if (twoFactorId) {
        // 2FA verification
        await ig.account.twoFactorLogin({
          username,
          verificationCode: code,
          twoFactorIdentifier: twoFactorId,
          verificationMethod: '1', // SMS or Auth app
          trustThisDevice: '1',
        });
      }

      // Save session
      const serialized = await ig.state.serialize();
      delete serialized.constants;
      serialized.deviceString = username || this.sessionId;
      fs.writeFileSync(this.sessionFile, JSON.stringify(serialized), 'utf8');

      const currentUser = await ig.account.currentUser();
      activeInstagramSessions.set(this.sessionId, { client: ig, io });
      await this._onConnected(ig, currentUser, io);
      this._startPolling(ig, io);

      return { status: 'connected' };
    } catch (err) {
      throw Object.assign(new Error(`Verification failed: ${err.message}`), { statusCode: 401 });
    }
  }

  async _onConnected(ig, userInfo, io) {
    const username = userInfo.username || '';
    const fullName = userInfo.full_name || '';

    await prisma.session.update({
      where: { id: this.sessionId },
      data: {
        status: 'connected',
        username: `@${username}`,
        phone: null,
        avatar: userInfo.profile_pic_url || null,
        sessionPath: this.sessionFile,
      },
    });

    if (io) {
      io.to(`session:${this.sessionId}`).emit('connected', {
        sessionId: this.sessionId,
        platform: 'instagram',
        info: { username, fullName, profilePic: userInfo.profile_pic_url },
      });
      io.emit('session:status', { sessionId: this.sessionId, status: 'connected' });
    }

    triggerWebhook('session.connected', { sessionId: this.sessionId, platform: 'instagram' });
  }

  /**
   * Poll for new DMs (Instagram doesn't have real webhooks for unofficial API)
   */
  _startPolling(ig, io) {
    const sessionData = activeInstagramSessions.get(this.sessionId);
    if (sessionData?.pollInterval) {
      clearInterval(sessionData.pollInterval);
    }

    let lastChecked = new Date();

    const pollInterval = setInterval(async () => {
      try {
        const inbox = await ig.feed.directInbox().items();

        for (const thread of inbox) {
          if (!thread.items || thread.items.length === 0) continue;

          for (const item of thread.items) {
            const itemTime = new Date(item.timestamp / 1000); // Instagram uses microseconds
            if (itemTime <= lastChecked) continue;
            if (item.user_id?.toString() === ig.state.cookieUserId?.toString()) continue; // Skip own messages

            await this._handleIncomingDM(thread, item, io);
          }
        }

        lastChecked = new Date();
      } catch (err) {
        if (err.message?.includes('login_required') || err.message?.includes('checkpoint')) {
          console.error(`[Instagram] Session expired for ${this.sessionId}`);
          clearInterval(pollInterval);
          await prisma.session.update({
            where: { id: this.sessionId },
            data: { status: 'disconnected' },
          });
          if (io) {
            io.emit('session:status', { sessionId: this.sessionId, status: 'disconnected' });
          }
        }
      }
    }, 15000); // Poll every 15 seconds

    // Store interval reference for cleanup
    const session = activeInstagramSessions.get(this.sessionId);
    if (session) session.pollInterval = pollInterval;
  }

  async _handleIncomingDM(thread, item, io) {
    const chatId = thread.thread_id;
    const senderId = item.user_id?.toString() || '';
    const senderName = thread.users?.find((u) => u.pk?.toString() === senderId)?.username || senderId;
    const isGroup = (thread.users?.length || 0) > 1;
    const chatName = thread.thread_title || senderName;

    const parsed = this._parseDirectItem(item);
    const timestamp = new Date(item.timestamp / 1000);

    const savedMessage = await prisma.message.create({
      data: {
        sessionId: this.sessionId,
        platformChatId: chatId,
        senderName,
        content: parsed.content,
        type: parsed.type,
        mediaUrl: parsed.mediaUrl || null,
        fromMe: false,
        status: 'received',
        timestamp,
        externalMsgId: item.item_id,
      },
    });

    // Upsert contact
    await prisma.contact.upsert({
      where: { sessionId_platformId: { sessionId: this.sessionId, platformId: chatId } },
      update: {
        pushName: chatName,
        lastMessage: parsed.content.slice(0, 100),
        lastMsgTime: timestamp,
        unreadCount: { increment: 1 },
      },
      create: {
        sessionId: this.sessionId,
        platformId: chatId,
        pushName: chatName,
        username: senderName,
        isGroup,
        lastMessage: parsed.content.slice(0, 100),
        lastMsgTime: timestamp,
        unreadCount: 1,
      },
    });

    const eventData = {
      sessionId: this.sessionId,
      platform: 'instagram',
      message: savedMessage,
      contact: { platformId: chatId, pushName: chatName },
    };

    if (io) {
      io.to(`session:${this.sessionId}`).emit('message', eventData);
      io.emit('inbox:message', eventData);
    }

    triggerWebhook('message.received', eventData);
  }

  _parseDirectItem(item) {
    switch (item.item_type) {
      case 'text':
        return { type: 'text', content: item.text || '' };
      case 'media_share':
        return { type: 'image', content: '[Shared Post]', mediaUrl: item.media_share?.image_versions2?.candidates?.[0]?.url };
      case 'raven_media': // Disappearing photo/video
        return { type: 'image', content: '[Disappearing Media]', mediaUrl: item.visual_media?.media?.image_versions2?.candidates?.[0]?.url };
      case 'voice_media':
        return { type: 'voice', content: '[Voice Message]', mediaUrl: item.voice_media?.media?.audio?.audio_src };
      case 'animated_media': // GIF
        return { type: 'sticker', content: '[GIF]', mediaUrl: item.animated_media?.images?.fixed_height?.url };
      case 'clip': // Reel
        return { type: 'video', content: '[Reel]', mediaUrl: item.clip?.clip?.video_versions?.[0]?.url };
      case 'story_share':
        return { type: 'text', content: `[Story Share: ${item.story_share?.title || ''}]` };
      case 'link':
        return { type: 'text', content: item.link?.text || item.link?.link_url || '[Link]' };
      case 'like':
        return { type: 'reaction', content: item.like || '❤️' };
      case 'reel_share':
        return { type: 'video', content: `[Reel: ${item.reel_share?.text || ''}]` };
      default:
        return { type: 'text', content: item.text || `[${item.item_type || 'unknown'}]` };
    }
  }

  async disconnect() {
    const sessionData = activeInstagramSessions.get(this.sessionId);
    if (sessionData?.pollInterval) {
      clearInterval(sessionData.pollInterval);
    }
    activeInstagramSessions.delete(this.sessionId);

    await prisma.session.update({
      where: { id: this.sessionId },
      data: { status: 'disconnected' },
    });
  }

  async verifyCredentials() {
    const client = this.getClient();
    if (client) {
      try {
        const user = await client.account.currentUser();
        return { valid: true, info: { username: user.username, fullName: user.full_name } };
      } catch { /* fall through */ }
    }
    if (fs.existsSync(this.sessionFile)) {
      return { valid: true, info: { note: 'Session file exists, needs reconnect' } };
    }
    return { valid: false, error: 'Not logged in. Provide username and password.' };
  }

  async sendText(to, text) {
    const ig = this.getClient();
    if (!ig) throw Object.assign(new Error('Instagram not connected'), { statusCode: 503 });

    // `to` should be thread_id
    const thread = ig.entity.directThread(to);
    const result = await thread.broadcastText(text);

    return { messageId: result.item_id || null, raw: result };
  }

  async sendMedia(to, type, mediaUrl, options = {}) {
    const ig = this.getClient();
    if (!ig) throw Object.assign(new Error('Instagram not connected'), { statusCode: 503 });

    const thread = ig.entity.directThread(to);

    if (type === 'image') {
      // For URL-based images, we'd need to download first
      // For now, support photo sharing via URL
      const result = await thread.broadcastPhoto({ file: mediaUrl });
      return { messageId: result.item_id || null, raw: result };
    }

    // Fallback: send as link
    const result = await thread.broadcastText(`${options.caption || ''} ${mediaUrl}`.trim());
    return { messageId: result.item_id || null, raw: result };
  }

  async markAsRead(threadId) {
    const ig = this.getClient();
    if (!ig) return false;
    try {
      const thread = ig.entity.directThread(threadId);
      await thread.markItemSeen(threadId);
      return true;
    } catch { return false; }
  }

  async getProfile() {
    const ig = this.getClient();
    if (!ig) return null;
    return ig.account.currentUser();
  }

  getFeatures() {
    return {
      sendText: true,
      sendMedia: true,
      sendTemplate: false,
      sendReaction: false,
      markAsRead: true,
      groups: true, // Group DMs
      broadcasts: false,
      typingIndicator: false,
      readReceipts: true,
      voiceMessages: true,
      stickers: true,
      qrLogin: false,
      pairingCode: false,
      phoneOtp: false,
      usernamePassword: true,
    };
  }
}

// ==================== MODULE EXPORTS ====================

function getInstagramAdapter(session) {
  return new InstagramAdapter(session);
}

function isInstagramConnected(sessionId) {
  return !!activeInstagramSessions.get(sessionId)?.client;
}

async function reconnectAllInstagramSessions(io) {
  const sessions = await prisma.session.findMany({
    where: { platform: 'instagram', status: { not: 'disconnected' } },
  });

  console.log(`[Instagram] Reconnecting ${sessions.length} sessions...`);

  for (const session of sessions) {
    const sessionFile = path.join(SESSIONS_DIR, `${session.id}.json`);
    if (fs.existsSync(sessionFile)) {
      try {
        const adapter = new InstagramAdapter(session);
        await adapter.connect(io);
        console.log(`[Instagram] Reconnected: ${session.name} (${session.id})`);
      } catch (err) {
        console.error(`[Instagram] Failed to reconnect ${session.id}:`, err.message);
      }
    }
  }
}

module.exports = {
  InstagramAdapter,
  getInstagramAdapter,
  isInstagramConnected,
  reconnectAllInstagramSessions,
  activeInstagramSessions,
};
