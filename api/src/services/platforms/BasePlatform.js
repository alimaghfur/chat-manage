/**
 * BasePlatform - Abstract base class for all chat platform adapters
 * 
 * Each platform adapter must implement these methods to provide
 * a unified interface for sending/receiving messages across platforms.
 */
class BasePlatform {
  constructor(session) {
    if (new.target === BasePlatform) {
      throw new Error('BasePlatform is abstract and cannot be instantiated directly');
    }
    this.session = session;
    this.platform = session.platform;
  }

  /**
   * Get the platform identifier
   * @returns {string} Platform name (whatsapp, telegram, instagram, messenger)
   */
  getPlatform() {
    return this.platform;
  }

  /**
   * Parse credentials from session
   * @returns {object} Parsed platform-specific credentials
   */
  getCredentials() {
    if (this.session.credentials) {
      try {
        return JSON.parse(this.session.credentials);
      } catch {
        return {};
      }
    }
    return {};
  }

  /**
   * Verify that the session credentials are valid
   * @returns {Promise<{valid: boolean, info?: object, error?: string}>}
   */
  async verifyCredentials() {
    throw new Error('verifyCredentials() must be implemented by platform adapter');
  }

  /**
   * Send a text message
   * @param {string} to - Recipient identifier (phone, chat_id, etc)
   * @param {string} text - Message text
   * @returns {Promise<{messageId: string, raw?: object}>}
   */
  async sendText(to, text) {
    throw new Error('sendText() must be implemented by platform adapter');
  }

  /**
   * Send a media message (image, video, document, audio)
   * @param {string} to - Recipient identifier
   * @param {string} type - Media type (image, video, document, audio)
   * @param {string} mediaUrl - URL of the media
   * @param {object} options - { caption, mimeType, fileName }
   * @returns {Promise<{messageId: string, raw?: object}>}
   */
  async sendMedia(to, type, mediaUrl, options = {}) {
    throw new Error('sendMedia() must be implemented by platform adapter');
  }

  /**
   * Send a template/structured message (if supported)
   * @param {string} to - Recipient identifier
   * @param {object} template - Template data (platform-specific)
   * @returns {Promise<{messageId: string, raw?: object}>}
   */
  async sendTemplate(to, template) {
    throw new Error('sendTemplate() not supported on this platform');
  }

  /**
   * Mark a message as read (if supported)
   * @param {string} messageId - Platform message ID
   * @returns {Promise<boolean>}
   */
  async markAsRead(messageId) {
    // Default: not supported, return false
    return false;
  }

  /**
   * Send a reaction to a message (if supported)
   * @param {string} to - Chat identifier
   * @param {string} messageId - Message to react to
   * @param {string} emoji - Reaction emoji
   * @returns {Promise<{messageId?: string, raw?: object}>}
   */
  async sendReaction(to, messageId, emoji) {
    throw new Error('sendReaction() not supported on this platform');
  }

  /**
   * Get profile/business info for this session
   * @returns {Promise<object>}
   */
  async getProfile() {
    throw new Error('getProfile() not supported on this platform');
  }

  /**
   * Parse an incoming webhook payload into a standardized format
   * @param {object} body - Raw webhook body from the platform
   * @returns {Promise<{messages?: Array, statuses?: Array, sessionId?: string}>}
   * 
   * Standardized message format:
   * {
   *   from: string,       // sender identifier
   *   messageId: string,  // platform message ID
   *   timestamp: Date,
   *   type: string,       // text, image, video, document, audio, sticker, location, reaction
   *   content: string,    // text content or description
   *   mediaUrl?: string,  // media ID or URL
   *   mimeType?: string,
   *   fileName?: string,
   *   pushName?: string,  // sender display name
   *   quotedMsgId?: string,
   * }
   * 
   * Standardized status format:
   * {
   *   messageId: string,
   *   recipientId: string,
   *   status: string,     // sent, delivered, read, failed
   *   timestamp: Date,
   *   errors?: Array,
   * }
   */
  async parseWebhook(body) {
    throw new Error('parseWebhook() must be implemented by platform adapter');
  }

  /**
   * Verify webhook signature/authenticity (if applicable)
   * @param {object} req - Express request object
   * @returns {boolean} Whether the webhook is authentic
   */
  verifyWebhookSignature(req) {
    // Default: no verification needed
    return true;
  }

  /**
   * Handle webhook verification challenge (GET request)
   * @param {object} query - Query parameters from GET request
   * @returns {{verified: boolean, challenge?: string}}
   */
  handleWebhookVerification(query) {
    // Default: no verification needed
    return { verified: true };
  }

  /**
   * Get supported features for this platform
   * @returns {object} Feature flags
   */
  getFeatures() {
    return {
      sendText: true,
      sendMedia: true,
      sendTemplate: false,
      sendReaction: false,
      markAsRead: false,
      groups: false,
      broadcasts: false,
      typingIndicator: false,
      readReceipts: false,
    };
  }
}

module.exports = BasePlatform;
