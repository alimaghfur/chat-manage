/**
 * WhatsApp Cloud API Adapter
 * Uses Meta's Graph API for WhatsApp Business (official API with token)
 * 
 * Requires: phoneNumberId, accessToken from Meta Business Suite
 */

const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const BasePlatform = require('./BasePlatform');
const { triggerWebhook } = require('../webhook');

const prisma = new PrismaClient();
const WA_CLOUD_API_URL = process.env.WA_CLOUD_API_URL || 'https://graph.facebook.com/v21.0';

class WhatsAppCloudAdapter extends BasePlatform {
  constructor(session) {
    super(session);
    this.sessionId = session.id;
    const creds = this.getCredentials();
    this.phoneNumberId = creds.phoneNumberId || session.phoneNumberId;
    this.accessToken = creds.accessToken || session.accessToken;
    this.waBusinessId = creds.waBusinessId || session.waBusinessId;
  }

  async _apiRequest(endpoint, options = {}) {
    const url = `${WA_CLOUD_API_URL}/${endpoint}`;
    const response = await axios({
      url,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });
    return response.data;
  }

  /**
   * Connect = verify token is valid
   */
  async connect(io) {
    const verification = await this.verifyCredentials();
    if (verification.valid) {
      await prisma.session.update({
        where: { id: this.sessionId },
        data: {
          status: 'connected',
          phone: verification.info?.phoneNumber || null,
          username: verification.info?.verifiedName || null,
        },
      });

      if (io) {
        io.to(`session:${this.sessionId}`).emit('connected', {
          sessionId: this.sessionId,
          platform: 'whatsapp_api',
          info: verification.info,
        });
        io.emit('session:status', { sessionId: this.sessionId, status: 'connected' });
      }
    }
    return verification;
  }

  async disconnect() {
    await prisma.session.update({
      where: { id: this.sessionId },
      data: { status: 'disconnected' },
    });
  }

  async verifyCredentials() {
    try {
      if (!this.phoneNumberId || !this.accessToken) {
        return { valid: false, error: 'Missing phoneNumberId or accessToken' };
      }
      const result = await this._apiRequest(this.phoneNumberId, { method: 'GET' });
      return {
        valid: true,
        info: {
          phoneNumber: result.display_phone_number,
          verifiedName: result.verified_name,
          qualityRating: result.quality_rating,
          platformVersion: result.platform_type,
        },
      };
    } catch (err) {
      return { valid: false, error: err.response?.data?.error?.message || err.message };
    }
  }

  async sendText(to, text) {
    const data = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: text },
    };

    const result = await this._apiRequest(`${this.phoneNumberId}/messages`, {
      method: 'POST',
      data,
    });

    const messageId = result.messages?.[0]?.id || null;

    triggerWebhook('message.sent', {
      sessionId: this.sessionId,
      platform: 'whatsapp_api',
      to,
      text,
      messageId,
    });

    return { messageId, raw: result };
  }

  async sendMedia(to, type, mediaUrl, options = {}) {
    const mediaObject = { link: mediaUrl };
    if (options.caption && ['image', 'video', 'document'].includes(type)) {
      mediaObject.caption = options.caption;
    }
    if (options.mimeType) mediaObject.mime_type = options.mimeType;
    if (options.fileName && type === 'document') mediaObject.filename = options.fileName;

    const data = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type,
      [type]: mediaObject,
    };

    const result = await this._apiRequest(`${this.phoneNumberId}/messages`, {
      method: 'POST',
      data,
    });

    return { messageId: result.messages?.[0]?.id || null, raw: result };
  }

  async sendTemplate(to, template) {
    const tpl = {
      name: template.name,
      language: { code: template.languageCode || 'en_US' },
    };
    if (template.components) tpl.components = template.components;

    const data = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: tpl,
    };

    const result = await this._apiRequest(`${this.phoneNumberId}/messages`, {
      method: 'POST',
      data,
    });

    return { messageId: result.messages?.[0]?.id || null, raw: result };
  }

  async markAsRead(messageId) {
    try {
      await this._apiRequest(`${this.phoneNumberId}/messages`, {
        method: 'POST',
        data: { messaging_product: 'whatsapp', status: 'read', message_id: messageId },
      });
      return true;
    } catch { return false; }
  }

  async sendReaction(to, messageId, emoji) {
    const data = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'reaction',
      reaction: { message_id: messageId, emoji: emoji || '' },
    };

    const result = await this._apiRequest(`${this.phoneNumberId}/messages`, {
      method: 'POST',
      data,
    });

    return { messageId: result.messages?.[0]?.id || null, raw: result };
  }

  async getProfile() {
    return this._apiRequest(
      `${this.phoneNumberId}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`,
      { method: 'GET' }
    );
  }

  /**
   * Process incoming webhook from Meta
   */
  async processWebhook(body, io) {
    if (body.object !== 'whatsapp_business_account') return;

    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        if (change.field !== 'messages') continue;
        const value = change.value;
        if (!value) continue;

        if (value.messages && value.messages.length > 0) {
          await this._handleIncomingMessages(value.messages, value.contacts, io);
        }

        if (value.statuses && value.statuses.length > 0) {
          await this._handleStatusUpdates(value.statuses, io);
        }
      }
    }
  }

  async _handleIncomingMessages(messages, contacts, io) {
    for (const msg of messages) {
      try {
        const from = msg.from;
        const timestamp = msg.timestamp ? new Date(parseInt(msg.timestamp) * 1000) : new Date();
        const type = msg.type || 'text';
        const contactInfo = contacts?.find((c) => c.wa_id === from);
        const pushName = contactInfo?.profile?.name || null;

        const parsed = this._parseCloudMessage(msg);

        const savedMessage = await prisma.message.create({
          data: {
            sessionId: this.sessionId,
            platformChatId: from,
            senderName: pushName || from,
            content: parsed.content,
            type: parsed.type,
            mediaUrl: parsed.mediaUrl || null,
            mediaMimeType: parsed.mimeType || null,
            mediaFileName: parsed.fileName || null,
            fromMe: false,
            status: 'received',
            timestamp,
            externalMsgId: msg.id,
            quotedMsgId: msg.context?.message_id || null,
          },
        });

        // Upsert contact
        await prisma.contact.upsert({
          where: { sessionId_platformId: { sessionId: this.sessionId, platformId: from } },
          update: { pushName, lastMessage: parsed.content.slice(0, 100), lastMsgTime: timestamp, unreadCount: { increment: 1 } },
          create: { sessionId: this.sessionId, platformId: from, pushName, phone: from, lastMessage: parsed.content.slice(0, 100), lastMsgTime: timestamp, unreadCount: 1 },
        });

        const eventData = { sessionId: this.sessionId, platform: 'whatsapp_api', message: savedMessage, contact: { platformId: from, pushName } };

        if (io) {
          io.to(`session:${this.sessionId}`).emit('message', eventData);
          io.emit('inbox:message', eventData);
        }

        triggerWebhook('message.received', eventData);
      } catch (err) {
        console.error(`[WhatsApp Cloud] Message error:`, err.message);
      }
    }
  }

  async _handleStatusUpdates(statuses, io) {
    for (const status of statuses) {
      try {
        const newStatus = status.status; // sent, delivered, read, failed
        if (!['sent', 'delivered', 'read', 'failed'].includes(newStatus)) continue;

        await prisma.message.updateMany({
          where: { sessionId: this.sessionId, externalMsgId: status.id },
          data: { status: newStatus },
        });

        if (io) {
          io.to(`session:${this.sessionId}`).emit('message-status', {
            sessionId: this.sessionId,
            messageId: status.id,
            status: newStatus,
          });
        }
      } catch (err) {
        console.error(`[WhatsApp Cloud] Status error:`, err.message);
      }
    }
  }

  _parseCloudMessage(msg) {
    const type = msg.type || 'text';
    switch (type) {
      case 'text': return { type: 'text', content: msg.text?.body || '' };
      case 'image': return { type: 'image', content: msg.image?.caption || '[Image]', mediaUrl: msg.image?.id, mimeType: msg.image?.mime_type };
      case 'video': return { type: 'video', content: msg.video?.caption || '[Video]', mediaUrl: msg.video?.id, mimeType: msg.video?.mime_type };
      case 'document': return { type: 'document', content: msg.document?.caption || '[Document]', mediaUrl: msg.document?.id, mimeType: msg.document?.mime_type, fileName: msg.document?.filename };
      case 'audio': return { type: 'audio', content: '[Audio]', mediaUrl: msg.audio?.id, mimeType: msg.audio?.mime_type };
      case 'sticker': return { type: 'sticker', content: '[Sticker]', mediaUrl: msg.sticker?.id, mimeType: msg.sticker?.mime_type };
      case 'location': return { type: 'location', content: `[Location: ${msg.location?.latitude}, ${msg.location?.longitude}]` };
      case 'reaction': return { type: 'reaction', content: msg.reaction?.emoji || '' };
      case 'contacts': return { type: 'contact', content: '[Contact]' };
      default: return { type: 'text', content: `[${type}]` };
    }
  }

  getFeatures() {
    return {
      sendText: true,
      sendMedia: true,
      sendTemplate: true,
      sendReaction: true,
      markAsRead: true,
      groups: false, // Cloud API limited group support
      broadcasts: true,
      typingIndicator: false,
      readReceipts: true,
      voiceMessages: true,
      stickers: true,
      qrLogin: false,
      pairingCode: false,
    };
  }
}

module.exports = { WhatsAppCloudAdapter };
