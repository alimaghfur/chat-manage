/**
 * Webhook Receiver
 * 
 * Only WhatsApp Cloud API uses traditional webhooks from Meta.
 * Other platforms (Baileys, Telegram, Instagram, Messenger) use real-time
 * socket/polling listeners directly in their adapters.
 */

const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { WhatsAppCloudAdapter } = require('../services/platforms/WhatsAppCloudAdapter');

const prisma = new PrismaClient();

// ====================================================================
// WHATSAPP CLOUD API WEBHOOK (Meta sends here)
// Handles: /webhook and /webhook/whatsapp
// ====================================================================

/**
 * GET /webhook - Meta webhook verification
 */
router.get('/', async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const verifyToken = process.env.WA_WEBHOOK_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === verifyToken) {
    return res.status(200).send(challenge);
  }

  // Check per-session verify tokens
  if (mode === 'subscribe' && token) {
    const session = await prisma.session.findFirst({
      where: { webhookVerifyToken: token },
    });
    if (session) return res.status(200).send(challenge);
  }

  return res.status(403).json({ error: 'Verification failed' });
});

/**
 * POST /webhook - Receive incoming events from Meta (WhatsApp Cloud API)
 */
router.post('/', async (req, res) => {
  // Always respond 200 immediately to Meta
  res.status(200).json({ status: 'received' });

  try {
    const body = req.body;

    // Only handle WhatsApp Business Account events
    if (body.object !== 'whatsapp_business_account') return;

    // Extract phoneNumberId to find the session
    const phoneNumberId = body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
    if (!phoneNumberId) return;

    const session = await prisma.session.findFirst({
      where: { platform: 'whatsapp_api', phoneNumberId },
    });

    if (!session) {
      console.warn(`[Webhook] No whatsapp_api session for phoneNumberId: ${phoneNumberId}`);
      return;
    }

    // Process via Cloud adapter
    const adapter = new WhatsAppCloudAdapter(session);
    const io = req.app.get('io');
    await adapter.processWebhook(body, io);
  } catch (err) {
    console.error('[Webhook] Processing error:', err.message);
  }
});

// Alias: /webhook/whatsapp (same as root)
router.get('/whatsapp', async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const verifyToken = process.env.WA_WEBHOOK_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.status(403).json({ error: 'Verification failed' });
});

router.post('/whatsapp', async (req, res) => {
  res.status(200).json({ status: 'received' });

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    const phoneNumberId = body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
    if (!phoneNumberId) return;

    const session = await prisma.session.findFirst({
      where: { platform: 'whatsapp_api', phoneNumberId },
    });
    if (!session) return;

    const adapter = new WhatsAppCloudAdapter(session);
    await adapter.processWebhook(body, req.app.get('io'));
  } catch (err) {
    console.error('[Webhook/WhatsApp] Error:', err.message);
  }
});

// ====================================================================
// STATUS ENDPOINT - Check webhook health
// ====================================================================

router.get('/status', (req, res) => {
  res.json({
    success: true,
    message: 'Webhook receiver is active',
    endpoints: {
      'GET /webhook': 'Meta webhook verification',
      'POST /webhook': 'WhatsApp Cloud API incoming events',
      'GET /webhook/whatsapp': 'WhatsApp verification (alias)',
      'POST /webhook/whatsapp': 'WhatsApp events (alias)',
    },
    note: 'Telegram, Instagram, and Messenger use real-time listeners (no webhooks needed)',
  });
});

module.exports = router;
