/**
 * Platform Registry - Central registry for all platform adapters
 * 
 * Usage:
 *   const { getPlatformAdapter } = require('./platforms');
 *   const adapter = await getPlatformAdapter(sessionId);
 *   await adapter.sendText('recipient', 'Hello!');
 */

const { PrismaClient } = require('@prisma/client');
const WhatsAppAdapter = require('./WhatsAppAdapter');
const TelegramAdapter = require('./TelegramAdapter');
const InstagramAdapter = require('./InstagramAdapter');
const MessengerAdapter = require('./MessengerAdapter');

const prisma = new PrismaClient();

// Platform adapter registry
const PLATFORM_ADAPTERS = {
  whatsapp: WhatsAppAdapter,
  telegram: TelegramAdapter,
  instagram: InstagramAdapter,
  messenger: MessengerAdapter,
};

/**
 * Get a platform adapter instance for a given session
 * @param {string} sessionId - Session ID
 * @returns {Promise<BasePlatform>} Platform adapter instance
 */
async function getPlatformAdapter(sessionId) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    throw Object.assign(new Error('Session not found'), { statusCode: 404 });
  }

  return createAdapterFromSession(session);
}

/**
 * Create a platform adapter from a session object (no DB query)
 * @param {object} session - Session record from database
 * @returns {BasePlatform} Platform adapter instance
 */
function createAdapterFromSession(session) {
  const platform = session.platform || 'whatsapp';
  const AdapterClass = PLATFORM_ADAPTERS[platform];

  if (!AdapterClass) {
    throw Object.assign(
      new Error(`Unsupported platform: ${platform}. Supported: ${Object.keys(PLATFORM_ADAPTERS).join(', ')}`),
      { statusCode: 400 }
    );
  }

  return new AdapterClass(session);
}

/**
 * Get the adapter class for a platform (without instantiating)
 * @param {string} platform - Platform name
 * @returns {typeof BasePlatform}
 */
function getAdapterClass(platform) {
  const AdapterClass = PLATFORM_ADAPTERS[platform];
  if (!AdapterClass) {
    throw Object.assign(
      new Error(`Unsupported platform: ${platform}`),
      { statusCode: 400 }
    );
  }
  return AdapterClass;
}

/**
 * Find the session matching an incoming webhook by platform and identifiers
 * @param {string} platform - Platform name
 * @param {object} identifiers - Platform-specific lookup fields
 * @returns {Promise<object|null>} Session or null
 */
async function findSessionForWebhook(platform, identifiers) {
  switch (platform) {
    case 'whatsapp':
      if (identifiers.phoneNumberId) {
        return prisma.session.findFirst({
          where: { platform: 'whatsapp', phoneNumberId: identifiers.phoneNumberId },
        });
      }
      break;
    case 'telegram':
      // Telegram webhooks include the bot token in the URL path
      if (identifiers.botToken) {
        return prisma.session.findFirst({
          where: {
            platform: 'telegram',
            accessToken: identifiers.botToken,
          },
        });
      }
      break;
    case 'instagram':
      if (identifiers.igUserId) {
        // Look for igUserId in credentials JSON
        const sessions = await prisma.session.findMany({
          where: { platform: 'instagram' },
        });
        return sessions.find((s) => {
          try {
            const creds = JSON.parse(s.credentials || '{}');
            return creds.igUserId === identifiers.igUserId;
          } catch { return false; }
        }) || null;
      }
      break;
    case 'messenger':
      if (identifiers.pageId) {
        const sessions = await prisma.session.findMany({
          where: { platform: 'messenger' },
        });
        return sessions.find((s) => {
          try {
            const creds = JSON.parse(s.credentials || '{}');
            return creds.pageId === identifiers.pageId;
          } catch { return false; }
        }) || null;
      }
      break;
  }
  return null;
}

/**
 * Get list of supported platforms with their info
 * @returns {Array}
 */
function getSupportedPlatforms() {
  return [
    {
      id: 'whatsapp',
      name: 'WhatsApp',
      icon: 'whatsapp',
      color: '#25D366',
      description: 'WhatsApp Business Cloud API',
      credentialFields: [
        { key: 'phoneNumberId', label: 'Phone Number ID', required: true, type: 'text' },
        { key: 'accessToken', label: 'Access Token', required: true, type: 'password' },
        { key: 'waBusinessId', label: 'Business Account ID', required: false, type: 'text' },
      ],
    },
    {
      id: 'telegram',
      name: 'Telegram',
      icon: 'telegram',
      color: '#0088CC',
      description: 'Telegram Bot API',
      credentialFields: [
        { key: 'botToken', label: 'Bot Token', required: true, type: 'password', placeholder: '123456:ABC-DEF...' },
      ],
    },
    {
      id: 'instagram',
      name: 'Instagram',
      icon: 'instagram',
      color: '#E4405F',
      description: 'Instagram Messaging API (via Meta)',
      credentialFields: [
        { key: 'accessToken', label: 'Page Access Token', required: true, type: 'password' },
        { key: 'igUserId', label: 'Instagram User ID', required: true, type: 'text' },
        { key: 'pageId', label: 'Facebook Page ID', required: true, type: 'text' },
      ],
    },
    {
      id: 'messenger',
      name: 'Messenger',
      icon: 'messenger',
      color: '#0084FF',
      description: 'Facebook Messenger Platform API',
      credentialFields: [
        { key: 'pageAccessToken', label: 'Page Access Token', required: true, type: 'password' },
        { key: 'pageId', label: 'Page ID', required: true, type: 'text' },
        { key: 'appSecret', label: 'App Secret', required: false, type: 'password' },
      ],
    },
  ];
}

module.exports = {
  getPlatformAdapter,
  createAdapterFromSession,
  getAdapterClass,
  findSessionForWebhook,
  getSupportedPlatforms,
  PLATFORM_ADAPTERS,
};
