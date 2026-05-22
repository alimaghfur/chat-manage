const axios = require('axios');
const BasePlatform = require('./BasePlatform');

const WA_CLOUD_API_URL = process.env.WA_CLOUD_API_URL || 'https://graph.facebook.com/v21.0';

/**
 * WhatsApp Cloud API Adapter
 * Uses Meta's Graph API for WhatsApp Business
 */
class WhatsAppAdapter extends BasePlatform {
  constructor(session) {
    super(session);
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

    return {
      messageId: result.messages?.[0]?.id || null,
      raw: result,
    };
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

    return {
      messageId: result.messages?.[0]?.id || null,
      raw: result,
    };
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

    return {
      messageId: result.messages?.[0]?.id || null,
      raw: result,
    };
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
    const result = await this._apiRequest(
      `${this.phoneNumberId}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`,
      { method: 'GET' }
    );
    return result;
  }

  async parseWebhook(body) {
    if (body.object !== 'whatsapp_business_account') return {};

    const result = { messages: [], statuses: [] };
    const entries = body.entry || [];

    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        if (change.field !== 'messages') continue;
        const value = change.value;
        if (!value) continue;

        const phoneNumberId = value.metadata?.phone_number_id;

        // Parse messages
        if (value.messages) {
          for (const msg of value.messages) {
            const contactInfo = value.contacts?.find((c) => c.wa_id === msg.from);
            result.messages.push(this._parseMessage(msg, contactInfo));
          }
        }

        // Parse statuses
        if (value.statuses) {
          for (const status of value.statuses) {
            result.statuses.push(this._parseStatus(status));
          }
        }

        result.phoneNumberId = phoneNumberId;
      }
    }

    return result;
  }

  _parseMessage(msg, contactInfo) {
    const type = msg.type || 'text';
    let content = '';
    let mediaUrl = null;
    let mimeType = null;
    let fileName = null;

    switch (type) {
      case 'text': content = msg.text?.body || ''; break;
      case 'image': content = msg.image?.caption || '[Image]'; mediaUrl = msg.image?.id; mimeType = msg.image?.mime_type; break;
      case 'video': content = msg.video?.caption || '[Video]'; mediaUrl = msg.video?.id; mimeType = msg.video?.mime_type; break;
      case 'document': content = msg.document?.caption || '[Document]'; fileName = msg.document?.filename; mediaUrl = msg.document?.id; mimeType = msg.document?.mime_type; break;
      case 'audio': content = '[Audio]'; mediaUrl = msg.audio?.id; mimeType = msg.audio?.mime_type; break;
      case 'sticker': content = '[Sticker]'; mediaUrl = msg.sticker?.id; mimeType = msg.sticker?.mime_type; break;
      case 'location': content = `[Location: ${msg.location?.latitude}, ${msg.location?.longitude}]`; break;
      case 'reaction': content = msg.reaction?.emoji || ''; break;
      default: content = `[${type}]`;
    }

    return {
      from: msg.from,
      messageId: msg.id,
      timestamp: msg.timestamp ? new Date(parseInt(msg.timestamp) * 1000) : new Date(),
      type,
      content,
      mediaUrl,
      mimeType,
      fileName,
      pushName: contactInfo?.profile?.name || null,
      quotedMsgId: msg.context?.message_id || null,
    };
  }

  _parseStatus(status) {
    return {
      messageId: status.id,
      recipientId: status.recipient_id,
      status: status.status, // sent, delivered, read, failed
      timestamp: status.timestamp ? new Date(parseInt(status.timestamp) * 1000) : new Date(),
      errors: status.errors || null,
    };
  }

  handleWebhookVerification(query) {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];
    const verifyToken = process.env.WA_WEBHOOK_VERIFY_TOKEN;

    if (mode === 'subscribe' && (token === verifyToken || token === this.session.webhookVerifyToken)) {
      return { verified: true, challenge };
    }
    return { verified: false };
  }

  getFeatures() {
    return {
      sendText: true,
      sendMedia: true,
      sendTemplate: true,
      sendReaction: true,
      markAsRead: true,
      groups: true,
      broadcasts: true,
      typingIndicator: false,
      readReceipts: true,
    };
  }
}

module.exports = WhatsAppAdapter;
