const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { getPlatformAdapter, createAdapterFromSession, findSessionForWebhook } = require('../services/platforms');
const { triggerWebhook } = require('../services/webhook');

const prisma = new PrismaClient();

// ====================================================================
// WHATSAPP WEBHOOK (Meta sends to /webhook/whatsapp)
// ====================================================================

router.get('/whatsapp', async (req, res) => {
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
      where: { webhookVerifyToken: token, platform: 'whatsapp' },
    });
    if (session) return res.status(200).send(challenge);
  }

  return res.status(403).json({ error: 'Verification failed' });
});

router.post('/whatsapp', async (req, res) => {
  res.status(200).json({ status: 'received' });

  try {
    await processWebhook('whatsapp', req.body, req.app.get('io'));
  } catch (err) {
    console.error('[WhatsApp Webhook] Error:', err.message);
  }
});

// ====================================================================
// TELEGRAM WEBHOOK (Telegram sends to /webhook/telegram/:botToken)
// ====================================================================

router.post('/telegram/:botToken', async (req, res) => {
  res.status(200).json({ ok: true });

  try {
    const session = await prisma.session.findFirst({
      where: { platform: 'telegram', accessToken: req.params.botToken },
    });

    if (!session) {
      console.warn(`[Telegram] No session for botToken: ${req.params.botToken.slice(0, 10)}...`);
      return;
    }

    const adapter = createAdapterFromSession(session);
    const parsed = await adapter.parseWebhook(req.body);

    await saveIncomingMessages(session, parsed.messages, req.app.get('io'));
  } catch (err) {
    console.error('[Telegram Webhook] Error:', err.message);
  }
});

// ====================================================================
// INSTAGRAM WEBHOOK (Meta sends to /webhook/instagram)
// ====================================================================

router.get('/instagram', async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const verifyToken = process.env.IG_WEBHOOK_VERIFY_TOKEN || process.env.WA_WEBHOOK_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.status(403).json({ error: 'Verification failed' });
});

router.post('/instagram', async (req, res) => {
  res.status(200).json({ status: 'received' });

  try {
    await processWebhook('instagram', req.body, req.app.get('io'));
  } catch (err) {
    console.error('[Instagram Webhook] Error:', err.message);
  }
});

// ====================================================================
// MESSENGER WEBHOOK (Meta sends to /webhook/messenger)
// ====================================================================

router.get('/messenger', async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const verifyToken = process.env.FB_WEBHOOK_VERIFY_TOKEN || process.env.WA_WEBHOOK_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.status(403).json({ error: 'Verification failed' });
});

router.post('/messenger', async (req, res) => {
  res.status(200).json({ status: 'received' });

  try {
    await processWebhook('messenger', req.body, req.app.get('io'));
  } catch (err) {
    console.error('[Messenger Webhook] Error:', err.message);
  }
});

// ====================================================================
// LEGACY: Keep /webhook root for backward compatibility with WhatsApp
// ====================================================================

router.get('/', async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const verifyToken = process.env.WA_WEBHOOK_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === verifyToken) {
    return res.status(200).send(challenge);
  }

  if (mode === 'subscribe' && token) {
    const session = await prisma.session.findFirst({
      where: { webhookVerifyToken: token },
    });
    if (session) return res.status(200).send(challenge);
  }

  return res.status(403).json({ error: 'Verification failed' });
});

router.post('/', async (req, res) => {
  res.status(200).json({ status: 'received' });

  try {
    // Detect platform from payload
    const body = req.body;
    let platform = 'whatsapp'; // default

    if (body.object === 'whatsapp_business_account') {
      platform = 'whatsapp';
    } else if (body.object === 'instagram') {
      platform = 'instagram';
    } else if (body.object === 'page') {
      platform = 'messenger';
    } else if (body.update_id !== undefined) {
      platform = 'telegram';
    }

    await processWebhook(platform, body, req.app.get('io'));
  } catch (err) {
    console.error('[Webhook] Error:', err.message);
  }
});

// ====================================================================
// SHARED PROCESSING LOGIC
// ====================================================================

async function processWebhook(platform, body, io) {
  let session;

  // Find session based on platform
  switch (platform) {
    case 'whatsapp': {
      // Extract phoneNumberId from payload
      const phoneNumberId = body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
      if (phoneNumberId) {
        session = await prisma.session.findFirst({
          where: { platform: 'whatsapp', phoneNumberId },
        });
      }
      break;
    }
    case 'instagram': {
      const igUserId = body.entry?.[0]?.id;
      if (igUserId) {
        session = await findSessionForWebhook('instagram', { igUserId });
      }
      break;
    }
    case 'messenger': {
      const pageId = body.entry?.[0]?.id;
      if (pageId) {
        session = await findSessionForWebhook('messenger', { pageId });
      }
      break;
    }
  }

  if (!session) {
    console.warn(`[${platform}] No session found for incoming webhook`);
    return;
  }

  const adapter = createAdapterFromSession(session);
  const parsed = await adapter.parseWebhook(body);

  // Save messages
  if (parsed.messages && parsed.messages.length > 0) {
    await saveIncomingMessages(session, parsed.messages, io);
  }

  // Process status updates
  if (parsed.statuses && parsed.statuses.length > 0) {
    await processStatusUpdates(session, parsed.statuses, io);
  }
}

async function saveIncomingMessages(session, messages, io) {
  for (const msg of messages) {
    if (!msg) continue;

    try {
      // Save to DB
      const savedMessage = await prisma.message.create({
        data: {
          sessionId: session.id,
          platformId: msg.chatId || msg.from,
          externalMsgId: msg.messageId,
          content: msg.content || '',
          type: msg.type || 'text',
          mediaUrl: msg.mediaUrl || null,
          mimeType: msg.mimeType || null,
          fileName: msg.fileName || null,
          fromMe: false,
          status: 'received',
          timestamp: msg.timestamp || new Date(),
          quotedMsgId: msg.quotedMsgId || null,
        },
      });

      // Upsert contact
      const contactPlatformId = msg.from;
      await prisma.contact.upsert({
        where: {
          sessionId_platformId: { sessionId: session.id, platformId: contactPlatformId },
        },
        update: {
          pushName: msg.pushName || undefined,
          updatedAt: new Date(),
        },
        create: {
          sessionId: session.id,
          platformId: contactPlatformId,
          pushName: msg.pushName || null,
          phone: contactPlatformId,
        },
      });

      // Emit via Socket.IO
      const eventData = {
        sessionId: session.id,
        platform: session.platform,
        message: savedMessage,
        raw: { from: msg.from, pushName: msg.pushName, type: msg.type },
      };

      if (io) {
        io.to(`session:${session.id}`).emit('message', eventData);
        io.emit('inbox:message', eventData); // Global inbox event
      }

      // Trigger user webhooks
      triggerWebhook('message.received', eventData);
    } catch (err) {
      console.error(`[${session.platform}] Error saving message:`, err.message);
    }
  }
}

async function processStatusUpdates(session, statuses, io) {
  for (const status of statuses) {
    try {
      if (status.messageId) {
        await prisma.message.updateMany({
          where: { sessionId: session.id, externalMsgId: status.messageId },
          data: { status: status.status },
        });
      }

      const eventData = {
        sessionId: session.id,
        platform: session.platform,
        ...status,
      };

      if (io) {
        io.to(`session:${session.id}`).emit('message-status', eventData);
      }

      triggerWebhook('message.status', eventData);
    } catch (err) {
      console.error(`[${session.platform}] Error processing status:`, err.message);
    }
  }
}

module.exports = router;
