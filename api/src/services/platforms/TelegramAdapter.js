const axios = require('axios');
const BasePlatform = require('./BasePlatform');

const TELEGRAM_API_URL = 'https://api.telegram.org';

/**
 * Telegram Bot API Adapter
 */
class TelegramAdapter extends BasePlatform {
  constructor(session) {
    super(session);
    const creds = this.getCredentials();
    this.botToken = creds.botToken || session.accessToken;
    this.baseUrl = `${TELEGRAM_API_URL}/bot${this.botToken}`;
  }

  async _apiRequest(method, params = {}) {
    const response = await axios.post(`${this.baseUrl}/${method}`, params, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.data.ok) {
      throw new Error(response.data.description || 'Telegram API error');
    }
    return response.data.result;
  }

  async verifyCredentials() {
    try {
      if (!this.botToken) {
        return { valid: false, error: 'Missing botToken' };
      }
      const result = await this._apiRequest('getMe');
      return {
        valid: true,
        info: {
          botId: result.id,
          botUsername: result.username,
          firstName: result.first_name,
          canJoinGroups: result.can_join_groups,
          canReadMessages: result.can_read_all_group_messages,
        },
      };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }

  async sendText(to, text) {
    const result = await this._apiRequest('sendMessage', {
      chat_id: to,
      text,
      parse_mode: 'HTML',
    });

    return {
      messageId: String(result.message_id),
      raw: result,
    };
  }

  async sendMedia(to, type, mediaUrl, options = {}) {
    let method;
    const params = { chat_id: to };

    switch (type) {
      case 'image':
        method = 'sendPhoto';
        params.photo = mediaUrl;
        if (options.caption) params.caption = options.caption;
        break;
      case 'video':
        method = 'sendVideo';
        params.video = mediaUrl;
        if (options.caption) params.caption = options.caption;
        break;
      case 'document':
        method = 'sendDocument';
        params.document = mediaUrl;
        if (options.caption) params.caption = options.caption;
        break;
      case 'audio':
        method = 'sendAudio';
        params.audio = mediaUrl;
        if (options.caption) params.caption = options.caption;
        break;
      case 'sticker':
        method = 'sendSticker';
        params.sticker = mediaUrl;
        break;
      default:
        method = 'sendDocument';
        params.document = mediaUrl;
    }

    params.parse_mode = 'HTML';
    const result = await this._apiRequest(method, params);

    return {
      messageId: String(result.message_id),
      raw: result,
    };
  }

  async markAsRead(messageId) {
    // Telegram doesn't have explicit "mark as read" for bots
    return false;
  }

  async sendReaction(to, messageId, emoji) {
    try {
      const result = await this._apiRequest('setMessageReaction', {
        chat_id: to,
        message_id: parseInt(messageId),
        reaction: emoji ? [{ type: 'emoji', emoji }] : [],
      });
      return { messageId: null, raw: result };
    } catch (err) {
      throw new Error(`Reaction failed: ${err.message}`);
    }
  }

  async getProfile() {
    const result = await this._apiRequest('getMe');
    return {
      id: result.id,
      username: result.username,
      firstName: result.first_name,
      isBot: result.is_bot,
    };
  }

  async parseWebhook(body) {
    const result = { messages: [], statuses: [] };

    // Telegram sends different update types
    if (body.message) {
      result.messages.push(this._parseMessage(body.message));
    } else if (body.edited_message) {
      result.messages.push(this._parseMessage(body.edited_message, true));
    } else if (body.channel_post) {
      result.messages.push(this._parseMessage(body.channel_post));
    }

    // Callback queries (button clicks) - treated as messages
    if (body.callback_query) {
      result.messages.push({
        from: String(body.callback_query.from.id),
        messageId: String(body.callback_query.id),
        timestamp: new Date(),
        type: 'callback',
        content: body.callback_query.data || '',
        pushName: body.callback_query.from.first_name || null,
      });
    }

    return result;
  }

  _parseMessage(msg, isEdited = false) {
    const from = String(msg.from?.id || msg.chat?.id);
    const chatId = String(msg.chat.id);
    let type = 'text';
    let content = '';
    let mediaUrl = null;
    let mimeType = null;
    let fileName = null;

    if (msg.text) {
      type = 'text';
      content = msg.text;
    } else if (msg.photo) {
      type = 'image';
      content = msg.caption || '[Image]';
      // Get the largest photo size
      const largestPhoto = msg.photo[msg.photo.length - 1];
      mediaUrl = largestPhoto.file_id;
    } else if (msg.video) {
      type = 'video';
      content = msg.caption || '[Video]';
      mediaUrl = msg.video.file_id;
      mimeType = msg.video.mime_type;
    } else if (msg.document) {
      type = 'document';
      content = msg.caption || '[Document]';
      mediaUrl = msg.document.file_id;
      mimeType = msg.document.mime_type;
      fileName = msg.document.file_name;
    } else if (msg.audio) {
      type = 'audio';
      content = msg.caption || '[Audio]';
      mediaUrl = msg.audio.file_id;
      mimeType = msg.audio.mime_type;
    } else if (msg.voice) {
      type = 'audio';
      content = '[Voice Message]';
      mediaUrl = msg.voice.file_id;
      mimeType = msg.voice.mime_type;
    } else if (msg.sticker) {
      type = 'sticker';
      content = msg.sticker.emoji || '[Sticker]';
      mediaUrl = msg.sticker.file_id;
    } else if (msg.location) {
      type = 'location';
      content = `[Location: ${msg.location.latitude}, ${msg.location.longitude}]`;
    } else if (msg.contact) {
      type = 'contact';
      content = `[Contact: ${msg.contact.first_name} ${msg.contact.phone_number || ''}]`;
    } else {
      content = '[Unsupported message type]';
    }

    return {
      from,
      chatId,
      messageId: String(msg.message_id),
      timestamp: msg.date ? new Date(msg.date * 1000) : new Date(),
      type,
      content,
      mediaUrl,
      mimeType,
      fileName,
      pushName: msg.from?.first_name || msg.from?.username || null,
      quotedMsgId: msg.reply_to_message ? String(msg.reply_to_message.message_id) : null,
      isEdited,
    };
  }

  /**
   * Set webhook URL for Telegram bot
   * @param {string} url - Webhook URL
   */
  async setWebhook(url) {
    return this._apiRequest('setWebhook', { url });
  }

  /**
   * Remove webhook for Telegram bot
   */
  async deleteWebhook() {
    return this._apiRequest('deleteWebhook');
  }

  getFeatures() {
    return {
      sendText: true,
      sendMedia: true,
      sendTemplate: false,
      sendReaction: true,
      markAsRead: false,
      groups: true,
      broadcasts: true,
      typingIndicator: true,
      readReceipts: false,
    };
  }
}

module.exports = TelegramAdapter;
