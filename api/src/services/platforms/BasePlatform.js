/**
 * BasePlatform - Abstract base class for all chat platform adapters
 * 
 * Each platform must implement:
 * - connect(io, options)     → Start connection (QR scan, OTP, login)
 * - disconnect()             → Disconnect cleanly
 * - verifyCredentials()      → Check if session is still valid
 * - sendText(to, text)       → Send text message
 * - sendMedia(to, type, url, options)  → Send media
 * - getFeatures()            → Return capability flags
 */
class BasePlatform {
  constructor(session) {
    if (new.target === BasePlatform) {
      throw new Error('BasePlatform is abstract');
    }
    this.session = session;
    this.sessionId = session.id;
    this.platform = session.platform;
  }

  getPlatform() { return this.platform; }

  getCredentials() {
    if (this.session.credentials) {
      try { return JSON.parse(this.session.credentials); }
      catch { return {}; }
    }
    return {};
  }

  // Must implement
  async connect(io, options = {}) { throw new Error('connect() not implemented'); }
  async disconnect() { throw new Error('disconnect() not implemented'); }
  async verifyCredentials() { throw new Error('verifyCredentials() not implemented'); }
  async sendText(to, text) { throw new Error('sendText() not implemented'); }
  async sendMedia(to, type, mediaUrl, options = {}) { throw new Error('sendMedia() not implemented'); }

  // Optional - override if supported
  async sendTemplate(to, template) { throw Object.assign(new Error('Templates not supported'), { statusCode: 400 }); }
  async sendReaction(to, messageId, emoji) { throw Object.assign(new Error('Reactions not supported'), { statusCode: 400 }); }
  async markAsRead(to, messageId) { return false; }
  async getProfile() { return null; }

  getFeatures() {
    return {
      sendText: true, sendMedia: true, sendTemplate: false, sendReaction: false,
      markAsRead: false, groups: false, broadcasts: false, typingIndicator: false,
      readReceipts: false, voiceMessages: false, stickers: false,
      qrLogin: false, pairingCode: false, phoneOtp: false, usernamePassword: false,
    };
  }
}

module.exports = BasePlatform;
