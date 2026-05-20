const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const { triggerWebhook } = require('./webhook');

const prisma = new PrismaClient();

const WA_CLOUD_API_URL = process.env.WA_CLOUD_API_URL || 'https://graph.facebook.com/v21.0';

/**
 * Get session configuration from database
 * @param {string} sessionId - Session ID
 * @returns {Promise<object|null>} Session config with phoneNumberId and accessToken
 */
async function getSession(sessionId) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
  });
  return session || null;
}

/**
 * Check if a session has a valid token configured (always true if token exists)
 * @param {string} sessionId - Session ID
 * @returns {Promise<boolean>}
 */
async function isSessionConnected(sessionId) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
  });
  if (!session) return false;
  return !!(session.accessToken && session.phoneNumberId);
}

/**
 * Make an authenticated request to WhatsApp Cloud API
 * @param {string} endpoint - API endpoint path
 * @param {string} accessToken - Access token
 * @param {object} options - Axios request options
 * @returns {Promise<object>} API response data
 */
async function cloudApiRequest(endpoint, accessToken, options = {}) {
  const url = `${WA_CLOUD_API_URL}/${endpoint}`;
  const response = await axios({
    url,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });
  return response.data;
}

/**
 * Send a text message via WhatsApp Cloud API
 * @param {string} sessionId - Session ID
 * @param {string} to - Recipient phone number (e.g., "15551234567")
 * @param {string} text - Message text
 * @returns {Promise<object>} API response
 */
async function sendTextMessage(sessionId, to, text) {
  const session = await getSession(sessionId);
  if (!session || !session.accessToken || !session.phoneNumberId) {
    throw Object.assign(new Error('Session not found or not configured'), { statusCode: 404 });
  }

  const data = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body: text },
  };

  const result = await cloudApiRequest(`${session.phoneNumberId}/messages`, session.accessToken, {
    method: 'POST',
    data,
  });

  triggerWebhook('message', {
    sessionId,
    direction: 'outgoing',
    to,
    type: 'text',
    text,
    waMessageId: result.messages?.[0]?.id || null,
  });

  return result;
}

/**
 * Send a media message via WhatsApp Cloud API
 * @param {string} sessionId - Session ID
 * @param {string} to - Recipient phone number
 * @param {string} type - Media type (image, video, document, audio)
 * @param {string} mediaUrl - URL of the media
 * @param {string} [caption] - Media caption
 * @param {string} [mimeType] - MIME type
 * @param {string} [fileName] - File name for documents
 * @returns {Promise<object>} API response
 */
async function sendMediaMessage(sessionId, to, type, mediaUrl, caption, mimeType, fileName) {
  const session = await getSession(sessionId);
  if (!session || !session.accessToken || !session.phoneNumberId) {
    throw Object.assign(new Error('Session not found or not configured'), { statusCode: 404 });
  }

  const mediaObject = { link: mediaUrl };
  if (caption && (type === 'image' || type === 'video' || type === 'document')) {
    mediaObject.caption = caption;
  }
  if (mimeType) {
    mediaObject.mime_type = mimeType;
  }
  if (fileName && type === 'document') {
    mediaObject.filename = fileName;
  }

  const data = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type,
    [type]: mediaObject,
  };

  const result = await cloudApiRequest(`${session.phoneNumberId}/messages`, session.accessToken, {
    method: 'POST',
    data,
  });

  triggerWebhook('message', {
    sessionId,
    direction: 'outgoing',
    to,
    type,
    mediaUrl,
    caption,
    waMessageId: result.messages?.[0]?.id || null,
  });

  return result;
}

/**
 * Send a template message via WhatsApp Cloud API
 * @param {string} sessionId - Session ID
 * @param {string} to - Recipient phone number
 * @param {string} templateName - Template name
 * @param {string} languageCode - Language code (e.g., "en_US")
 * @param {Array} [components] - Template components
 * @returns {Promise<object>} API response
 */
async function sendTemplateMessage(sessionId, to, templateName, languageCode, components) {
  const session = await getSession(sessionId);
  if (!session || !session.accessToken || !session.phoneNumberId) {
    throw Object.assign(new Error('Session not found or not configured'), { statusCode: 404 });
  }

  const template = {
    name: templateName,
    language: { code: languageCode || 'en_US' },
  };

  if (components && components.length > 0) {
    template.components = components;
  }

  const data = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template,
  };

  const result = await cloudApiRequest(`${session.phoneNumberId}/messages`, session.accessToken, {
    method: 'POST',
    data,
  });

  triggerWebhook('message', {
    sessionId,
    direction: 'outgoing',
    to,
    type: 'template',
    templateName,
    languageCode,
    waMessageId: result.messages?.[0]?.id || null,
  });

  return result;
}

/**
 * Send a reaction to a message
 * @param {string} sessionId - Session ID
 * @param {string} to - Chat phone number
 * @param {string} messageId - Message ID to react to
 * @param {string} emoji - Reaction emoji (empty string to remove)
 * @returns {Promise<object>} API response
 */
async function sendReaction(sessionId, to, messageId, emoji) {
  const session = await getSession(sessionId);
  if (!session || !session.accessToken || !session.phoneNumberId) {
    throw Object.assign(new Error('Session not found or not configured'), { statusCode: 404 });
  }

  const data = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'reaction',
    reaction: {
      message_id: messageId,
      emoji: emoji || '',
    },
  };

  const result = await cloudApiRequest(`${session.phoneNumberId}/messages`, session.accessToken, {
    method: 'POST',
    data,
  });

  return result;
}

/**
 * Mark a message as read
 * @param {string} sessionId - Session ID
 * @param {string} messageId - Message ID to mark as read
 * @returns {Promise<object>} API response
 */
async function markAsRead(sessionId, messageId) {
  const session = await getSession(sessionId);
  if (!session || !session.accessToken || !session.phoneNumberId) {
    throw Object.assign(new Error('Session not found or not configured'), { statusCode: 404 });
  }

  const data = {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  };

  const result = await cloudApiRequest(`${session.phoneNumberId}/messages`, session.accessToken, {
    method: 'POST',
    data,
  });

  return result;
}

/**
 * Get WhatsApp Business Profile info
 * @param {string} sessionId - Session ID
 * @returns {Promise<object>} Business profile data
 */
async function getBusinessProfile(sessionId) {
  const session = await getSession(sessionId);
  if (!session || !session.accessToken || !session.phoneNumberId) {
    throw Object.assign(new Error('Session not found or not configured'), { statusCode: 404 });
  }

  const result = await cloudApiRequest(
    `${session.phoneNumberId}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`,
    session.accessToken,
    { method: 'GET' }
  );

  return result;
}

/**
 * Verify that the access token and phone number ID are valid
 * @param {string} phoneNumberId - Phone Number ID
 * @param {string} accessToken - Access Token
 * @returns {Promise<object>} Phone number info
 */
async function verifyToken(phoneNumberId, accessToken) {
  const result = await cloudApiRequest(phoneNumberId, accessToken, {
    method: 'GET',
  });
  return result;
}

module.exports = {
  getSession,
  isSessionConnected,
  sendTextMessage,
  sendMediaMessage,
  sendTemplateMessage,
  sendReaction,
  markAsRead,
  getBusinessProfile,
  verifyToken,
};
