const axios = require('axios');
const crypto = require('crypto');
const BasePlatform = require('./BasePlatform');

const GRAPH_API_URL = 'https://graph.facebook.com/v21.0';

/**
 * Facebook Messenger Platform API Adapter
 */
class MessengerAdapter extends BasePlatform {
  constructor(session) {
    super(session);
    const creds = this.getCredentials();
    this.pageAccessToken = creds.pageAccessToken || session.accessToken;
    this.pageId = creds.pageId;
    this.appSecret = creds.appSecret;
  }

  async _apiRequest(endpoint, options = {}) {
    const url = `${GRAPH_API_URL}/${endpoint}`;
    const response = await axios({
      url,
      headers: {
        Authorization: `Bearer ${this.pageAccessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });
    return response.data;
  }

  async verifyCredentials() {
    try {
      if (!this.pageAccessToken || !this.pageId) {
        return { valid: false, error: 'Missing pageAccessToken or pageId' };
      }
      const result = await this._apiRequest(`${this.pageId}?fields=name,id,picture`, {
        method: 'GET',
      });
      return {
        valid: true,
        info: {
          pageId: result.id,
          pageName: result.name,
          picture: result.picture?.data?.url,
        },
      };
    } catch (err) {
      return { valid: false, error: err.response?.data?.error?.message || err.message };
    }
  }

  async sendText(to, text) {
    const data = {
      recipient: { id: to },
      messaging_type: 'RESPONSE',
      message: { text },
    };

    const result = await this._apiRequest(`${this.pageId}/messages`, {
      method: 'POST',
      data,
    });

    return {
      messageId: result.message_id || null,
      raw: result,
    };
  }

  async sendMedia(to, type, mediaUrl, options = {}) {
    let attachmentType;
    switch (type) {
      case 'image': attachmentType = 'image'; break;
      case 'video': attachmentType = 'video'; break;
      case 'audio': attachmentType = 'audio'; break;
      default: attachmentType = 'file';
    }

    const data = {
      recipient: { id: to },
      messaging_type: 'RESPONSE',
      message: {
        attachment: {
          type: attachmentType,
          payload: { url: mediaUrl, is_reusable: true },
        },
      },
    };

    const result = await this._apiRequest(`${this.pageId}/messages`, {
      method: 'POST',
      data,
    });

    return {
      messageId: result.message_id || null,
      raw: result,
    };
  }

  async sendTemplate(to, template) {
    // Messenger supports generic templates, buttons, etc.
    const data = {
      recipient: { id: to },
      messaging_type: 'RESPONSE',
      message: {
        attachment: {
          type: 'template',
          payload: template,
        },
      },
    };

    const result = await this._apiRequest(`${this.pageId}/messages`, {
      method: 'POST',
      data,
    });

    return {
      messageId: result.message_id || null,
      raw: result,
    };
  }

  async markAsRead(recipientId) {
    try {
      await this._apiRequest(`${this.pageId}/messages`, {
        method: 'POST',
        data: {
          recipient: { id: recipientId },
          sender_action: 'mark_seen',
        },
      });
      return true;
    } catch { return false; }
  }

  async getProfile() {
    const result = await this._apiRequest(`${this.pageId}?fields=name,id,picture,about,category`, {
      method: 'GET',
    });
    return result;
  }

  async parseWebhook(body) {
    const result = { messages: [], statuses: [] };

    if (body.object !== 'page') return result;

    const entries = body.entry || [];
    for (const entry of entries) {
      const messaging = entry.messaging || [];
      for (const event of messaging) {
        if (event.message && !event.message.is_echo) {
          const parsed = this._parseMessage(event);
          if (parsed) result.messages.push(parsed);
        }
        if (event.delivery) {
          result.statuses.push({
            messageId: event.delivery.mids?.[0] || null,
            recipientId: event.sender?.id,
            status: 'delivered',
            timestamp: event.delivery.watermark ? new Date(event.delivery.watermark) : new Date(),
          });
        }
        if (event.read) {
          result.statuses.push({
            messageId: null,
            recipientId: event.sender?.id,
            status: 'read',
            timestamp: event.read.watermark ? new Date(event.read.watermark) : new Date(),
          });
        }
        // Postback (button clicks)
        if (event.postback) {
          result.messages.push({
            from: event.sender?.id,
            messageId: `postback_${Date.now()}`,
            timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
            type: 'postback',
            content: event.postback.payload || event.postback.title || '',
            pushName: null,
          });
        }
      }
      result.pageId = entry.id;
    }

    return result;
  }

  _parseMessage(event) {
    const msg = event.message;
    const from = event.sender?.id;
    let type = 'text';
    let content = '';
    let mediaUrl = null;
    let mimeType = null;

    if (msg.text) {
      type = 'text';
      content = msg.text;
    } else if (msg.attachments) {
      const attachment = msg.attachments[0];
      switch (attachment.type) {
        case 'image': type = 'image'; content = '[Image]'; mediaUrl = attachment.payload?.url; break;
        case 'video': type = 'video'; content = '[Video]'; mediaUrl = attachment.payload?.url; break;
        case 'audio': type = 'audio'; content = '[Audio]'; mediaUrl = attachment.payload?.url; break;
        case 'file': type = 'document'; content = '[File]'; mediaUrl = attachment.payload?.url; break;
        case 'location':
          type = 'location';
          content = `[Location: ${attachment.payload?.coordinates?.lat}, ${attachment.payload?.coordinates?.long}]`;
          break;
        default:
          type = attachment.type;
          content = `[${attachment.type}]`;
          mediaUrl = attachment.payload?.url;
      }
    }

    return {
      from,
      messageId: msg.mid,
      timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
      type,
      content,
      mediaUrl,
      mimeType,
      fileName: null,
      pushName: null,
      quotedMsgId: msg.reply_to?.mid || null,
    };
  }

  verifyWebhookSignature(req) {
    if (!this.appSecret) return true; // No secret configured, skip verification

    const signature = req.headers['x-hub-signature-256'];
    if (!signature) return false;

    const body = JSON.stringify(req.body);
    const expected = 'sha256=' + crypto.createHmac('sha256', this.appSecret).update(body).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }

  handleWebhookVerification(query) {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];
    const verifyToken = process.env.FB_WEBHOOK_VERIFY_TOKEN || process.env.WA_WEBHOOK_VERIFY_TOKEN;

    if (mode === 'subscribe' && token === verifyToken) {
      return { verified: true, challenge };
    }
    return { verified: false };
  }

  getFeatures() {
    return {
      sendText: true,
      sendMedia: true,
      sendTemplate: true,
      sendReaction: false,
      markAsRead: true,
      groups: false,
      broadcasts: true,
      typingIndicator: true,
      readReceipts: true,
    };
  }
}

module.exports = MessengerAdapter;
