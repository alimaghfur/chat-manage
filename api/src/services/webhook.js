const axios = require('axios');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Trigger webhooks for a given event
 * Finds all active webhooks that match the event and sends POST requests
 * with HMAC-SHA256 signature verification
 *
 * @param {string} event - The event type (e.g., 'message', 'status', 'connection')
 * @param {object} data - The event payload data
 */
async function triggerWebhook(event, data) {
  try {
    // Find all active webhooks
    const webhooks = await prisma.webhook.findMany({
      where: { isActive: true },
    });

    for (const webhook of webhooks) {
      // Check if webhook is subscribed to this event
      if (!isWebhookSubscribed(webhook, event)) {
        continue;
      }

      // Send webhook with retry logic
      sendWebhookWithRetry(webhook, event, data).catch((err) => {
        console.error(`Webhook ${webhook.id} final failure:`, err.message);
      });
    }
  } catch (err) {
    console.error('Error triggering webhooks:', err.message);
  }
}

/**
 * Check if a webhook is subscribed to a specific event
 * @param {object} webhook - Webhook record
 * @param {string} event - Event type
 * @returns {boolean}
 */
function isWebhookSubscribed(webhook, event) {
  if (!webhook.events || webhook.events === '*') {
    return true;
  }

  try {
    const events = JSON.parse(webhook.events);
    if (!Array.isArray(events)) return true;
    return events.includes(event) || events.includes('*');
  } catch {
    return true;
  }
}

/**
 * Send a webhook request with retry logic
 * @param {object} webhook - Webhook record
 * @param {string} event - Event type
 * @param {object} data - Payload data
 */
async function sendWebhookWithRetry(webhook, event, data) {
  const maxRetries = webhook.retries || 3;
  let lastError = null;

  const payload = {
    event,
    data,
    timestamp: new Date().toISOString(),
    webhookId: webhook.id,
  };

  const body = JSON.stringify(payload);

  // Generate HMAC-SHA256 signature
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'WhatsApp-API-Gateway/2.0',
    'X-Webhook-Event': event,
  };

  if (webhook.secret) {
    const signature = crypto
      .createHmac('sha256', webhook.secret)
      .update(body)
      .digest('hex');
    headers['x-webhook-signature'] = signature;
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.post(webhook.url, body, {
        headers,
        timeout: 10000, // 10 second timeout
        validateStatus: (status) => status < 500, // Don't retry on 4xx
      });

      // Success - update webhook status
      await prisma.webhook.update({
        where: { id: webhook.id },
        data: {
          lastStatus: response.status,
          lastError: null,
        },
      }).catch(() => {});

      return; // Success, exit retry loop
    } catch (err) {
      lastError = err.message;

      // Wait before retrying (exponential backoff)
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // All retries failed - update webhook with error
  await prisma.webhook.update({
    where: { id: webhook.id },
    data: {
      lastStatus: 0,
      lastError: lastError || 'Request failed after all retries',
    },
  }).catch(() => {});
}

module.exports = { triggerWebhook };
