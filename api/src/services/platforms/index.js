/**
 * Platform Registry - Central hub for all platform adapters
 * 
 * Manages adapter instantiation, session lookup, and reconnection on startup.
 */

const { PrismaClient } = require('@prisma/client');
const { WhatsAppBaileysAdapter, getBaileysAdapter, reconnectAllBaileysSessions } = require('./WhatsAppBaileysAdapter');
const { WhatsAppCloudAdapter } = require('./WhatsAppCloudAdapter');
const { TelegramUserAdapter, reconnectAllTelegramSessions } = require('./TelegramUserAdapter');
const { InstagramAdapter, reconnectAllInstagramSessions } = require('./InstagramAdapter');
const { MessengerAdapter, reconnectAllMessengerSessions } = require('./MessengerAdapter');

const prisma = new PrismaClient();

/**
 * Get the appropriate adapter for a session
 * @param {object} session - Session record from database
 * @returns {BasePlatform} Platform adapter instance
 */
function getAdapter(session) {
  switch (session.platform) {
    case 'whatsapp':
      return new WhatsAppBaileysAdapter(session);
    case 'whatsapp_api':
      return new WhatsAppCloudAdapter(session);
    case 'telegram':
      return new TelegramUserAdapter(session);
    case 'instagram':
      return new InstagramAdapter(session);
    case 'messenger':
      return new MessengerAdapter(session);
    default:
      throw Object.assign(
        new Error(`Unsupported platform: ${session.platform}`),
        { statusCode: 400 }
      );
  }
}

/**
 * Get adapter by session ID (fetches from DB)
 * @param {string} sessionId
 * @returns {Promise<BasePlatform>}
 */
async function getAdapterById(sessionId) {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session) throw Object.assign(new Error('Session not found'), { statusCode: 404 });
  return getAdapter(session);
}

/**
 * Reconnect all stored sessions on server startup
 * @param {object} io - Socket.IO instance
 */
async function reconnectAllSessions(io) {
  console.log('\n========== RECONNECTING ALL SESSIONS ==========');
  await reconnectAllBaileysSessions(io);
  await reconnectAllTelegramSessions(io);
  await reconnectAllInstagramSessions(io);
  await reconnectAllMessengerSessions(io);
  console.log('========== RECONNECTION COMPLETE ==========\n');
}

/**
 * Get supported platforms with their UI metadata
 */
function getSupportedPlatforms() {
  return [
    {
      id: 'whatsapp',
      name: 'WhatsApp',
      icon: 'whatsapp',
      color: '#25D366',
      description: 'Connect via QR code scan or pairing code (like WhatsApp Web)',
      connectionType: 'qr',
      authFields: [],
      authOptions: [
        { id: 'qr', label: 'Scan QR Code', description: 'Scan with your phone camera' },
        { id: 'pairing_code', label: 'Pairing Code', description: 'Enter your phone number to get a code', fields: [
          { key: 'phoneNumber', label: 'Phone Number', type: 'tel', placeholder: '+62812xxxxx', required: true },
        ]},
      ],
    },
    {
      id: 'whatsapp_api',
      name: 'WhatsApp Business API',
      icon: 'whatsapp',
      color: '#128C7E',
      description: 'Official Meta Cloud API (requires Business Account)',
      connectionType: 'api_token',
      authFields: [
        { key: 'phoneNumberId', label: 'Phone Number ID', type: 'text', required: true, placeholder: '123456789012345' },
        { key: 'accessToken', label: 'Access Token', type: 'password', required: true, placeholder: 'EAABx...' },
        { key: 'waBusinessId', label: 'Business Account ID', type: 'text', required: false, placeholder: '987654321098765' },
      ],
      authOptions: [],
    },
    {
      id: 'telegram',
      name: 'Telegram',
      icon: 'telegram',
      color: '#0088CC',
      description: 'Connect your Telegram account via phone number + OTP',
      connectionType: 'phone_otp',
      authFields: [
        { key: 'phoneNumber', label: 'Phone Number', type: 'tel', required: true, placeholder: '+62812xxxxx' },
      ],
      authOptions: [],
      notes: 'Requires TELEGRAM_API_ID and TELEGRAM_API_HASH in .env (get from my.telegram.org)',
    },
    {
      id: 'instagram',
      name: 'Instagram',
      icon: 'instagram',
      color: '#E4405F',
      description: 'Connect your Instagram DMs via username + password',
      connectionType: 'login',
      authFields: [
        { key: 'username', label: 'Username', type: 'text', required: true, placeholder: 'your_username' },
        { key: 'password', label: 'Password', type: 'password', required: true },
      ],
      authOptions: [],
      notes: 'May require verification code if Instagram detects new login',
    },
    {
      id: 'messenger',
      name: 'Messenger',
      icon: 'messenger',
      color: '#0084FF',
      description: 'Connect Facebook Messenger via cookies or email + password',
      connectionType: 'login',
      authFields: [
        { key: 'email', label: 'Email / Phone', type: 'text', required: false, placeholder: 'your@email.com' },
        { key: 'password', label: 'Password', type: 'password', required: false },
      ],
      authOptions: [
        { id: 'credentials', label: 'Email + Password', description: 'Standard login (may be blocked by Facebook)' },
        { id: 'cookies', label: 'Browser Cookies (Recommended)', description: 'Paste appState JSON from browser extension', fields: [
          { key: 'appState', label: 'AppState JSON', type: 'textarea', required: true, placeholder: '[{"key":"c_user","value":"..."},...]' },
        ]},
      ],
      notes: 'Cookie method is more reliable. Use c3c-ufc or similar extension to export cookies.',
    },
  ];
}

module.exports = {
  getAdapter,
  getAdapterById,
  reconnectAllSessions,
  getSupportedPlatforms,
};
