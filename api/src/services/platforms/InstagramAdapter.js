const axios = require('axios');
const BasePlatform = require('./BasePlatform');

const GRAPH_API_URL = 'https://graph.facebook.com/v21.0';

/**
 * Instagram Messaging API Adapter (via Meta Graph API)
 */
class InstagramAdapter extends BasePlatform {
  constructor(session) {
    super(session);
    const creds = this.getCredentials();
    this.accessToken = creds.accessToken || session.accessToken;
    this.igUserId = creds.igUserId;
    this.pageId = creds.pageId;
  }

  async _apiRequest(endpoint, options = {}) {
    const url = `${GRAPH_API_URL}/${endpoint}`;
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
      if (!this.accessToken || !this.igUserId) {
        return { valid: false, error: 'Missing accessToken or igUserId' };
      }
      const result = await this._apiRequest(`${this.igUserId}?fields=name,username,profile_picture_url`, {
        method: 'GET',
      });
      return {
        valid: true,
        info: {
          igUserId: result.id,
          username: result.username,
          name: result.name,
          profilePicture: result.profile_picture_url,
        },
      };
    } catch (err) {
      return { valid: false, error: err.response?.data?.error?.message || err.message };
    }
  }

  async sendText(to, text) {
    const data = {
      recipient: { id: to },
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
    let attachment;

    switch (type) {
      case 'image':
        attachment = { type: 'image', payload: { url: mediaUrl } };
        break;
      case 'video':
        attachment = { type: 'video', payload: { url: mediaUrl } };
        break;
      case 'audio':
        attachment = { type: 'audio', payload: { url: mediaUrl } };
        break;
      default:
        attachment = { type: 'file', payload: { url: mediaUrl } };
    }

    const data = {
      recipient: { id: to },
      message: { attachment },
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

  async markAsRead(messageId) {
    // Instagram supports marking as seen
    try {
      await this._apiRequest(`${this.pageId}/messages`, {
        method: 'POST',
        data: {
          recipient: { id: messageId }, // recipientId needed, not messageId
          sender_action: 'mark_seen',
        },
      });
      return true;
    } catch { return false; }
  }

  async getProfile() {
    const result = await this._apiRequest(`${this.igUserId}?fields=name,username,profile_picture_url,biography`, {
      method: 'GET',
    });
    return result;
  }

  async parseWebhook(body) {
    const result = { messages: [], statuses: [] };

    if (body.object !== 'instagram') return result;

    const entries = body.entry || [];
    for (const entry of entries) {
      const messaging = entry.messaging || [];
      for (const event of messaging) {
        if (event.message) {
          result.messages.push(this._parseMessage(event));
        }
        if (event.read) {
          result.statuses.push({
            messageId: null,
            recipientId: event.sender?.id,
            status: 'read',
            timestamp: event.read.watermark ? new Date(event.read.watermark) : new Date(),
          });
        }
      }
      result.igUserId = entry.id;
    }

    return result;
  }

  _parseMessage(event) {
    const msg = event.message;
    const from = event.sender?.id;
    let type = 'text';
    let content = '';
    let mediaUrl = null;

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
        default: type = attachment.type; content = `[${attachment.type}]`; mediaUrl = attachment.payload?.url;
      }
    } else if (msg.is_echo) {
      return null; // Skip echo messages
    }

    return {
      from,
      messageId: msg.mid,
      timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
      type,
      content,
      mediaUrl,
      mimeType: null,
      fileName: null,
      pushName: null,
      quotedMsgId: msg.reply_to?.mid || null,
    };
  }

  handleWebhookVerification(query) {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];
    const verifyToken = process.env.IG_WEBHOOK_VERIFY_TOKEN || process.env.WA_WEBHOOK_VERIFY_TOKEN;

    if (mode === 'subscribe' && token === verifyToken) {
      return { verified: true, challenge };
    }
    return { verified: false };
  }

  getFeatures() {
    return {
      sendText: true,
      sendMedia: true,
      sendTemplate: false,
      sendReaction: false,
      markAsRead: true,
      groups: false,
      broadcasts: false,
      typingIndicator: true,
      readReceipts: true,
    };
  }
}

module.exports = InstagramAdapter;
