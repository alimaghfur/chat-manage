const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { triggerWebhook } = require('../services/webhook');

const prisma = new PrismaClient();

/**
 * @swagger
 * /webhook:
 *   get:
 *     summary: Webhook verification endpoint
 *     description: Meta sends a GET request to verify the webhook URL
 *     tags: [Webhook Receiver]
 */
router.get('/', async (req, res) => {
  try {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const verifyToken = process.env.WA_WEBHOOK_VERIFY_TOKEN;

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('Webhook verified successfully');
      return res.status(200).send(challenge);
    }

    // Also check per-session verify tokens
    if (mode === 'subscribe' && token) {
      const session = await prisma.session.findFirst({
        where: { webhookVerifyToken: token },
      });
      if (session) {
        console.log(`Webhook verified for session ${session.id}`);
        return res.status(200).send(challenge);
      }
    }

    console.warn('Webhook verification failed');
    return res.status(403).json({ error: 'Verification failed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



/**
 * @swagger
 * /webhook:
 *   post:
 *     summary: Receive incoming webhook events from Meta
 *     description: Handles incoming messages, status updates, etc.
 *     tags: [Webhook Receiver]
 */
router.post('/', async (req, res) => {
  try {
    const body = req.body;

    // Always respond 200 immediately to Meta
    res.status(200).json({ status: 'received' });

    // Process webhook payload asynchronously
    if (body.object !== 'whatsapp_business_account') {
      return;
    }

    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        if (change.field !== 'messages') continue;

        const value = change.value;
        if (!value) continue;

        const phoneNumberId = value.metadata?.phone_number_id;
        const displayPhone = value.metadata?.display_phone_number;

        // Find the session by phoneNumberId
        const session = await prisma.session.findFirst({
          where: { phoneNumberId },
        });

        if (!session) {
          console.warn(`No session found for phoneNumberId: ${phoneNumberId}`);
          continue;
        }

        const io = req.app.get('io');

        // Handle incoming messages
        if (value.messages && value.messages.length > 0) {
          await handleIncomingMessages(session, value.messages, value.contacts, io);
        }

        // Handle status updates
        if (value.statuses && value.statuses.length > 0) {
          await handleStatusUpdates(session, value.statuses, io);
        }
      }
    }
  } catch (error) {
    console.error('Webhook processing error:', error.message);
  }
});



/**
 * Handle incoming messages from Meta webhook
 */
async function handleIncomingMessages(session, messages, contacts, io) {
  for (const msg of messages) {
    try {
      const from = msg.from; // sender phone number
      const messageId = msg.id;
      const timestamp = msg.timestamp
        ? new Date(parseInt(msg.timestamp) * 1000)
        : new Date();
      const type = msg.type || 'text';

      let content = '';
      let mediaUrl = null;
      let mimeType = null;
      let fileName = null;

      switch (type) {
        case 'text':
          content = msg.text?.body || '';
          break;
        case 'image':
          content = msg.image?.caption || '[Image]';
          mediaUrl = msg.image?.id || null; // Media ID, needs download
          mimeType = msg.image?.mime_type || null;
          break;
        case 'video':
          content = msg.video?.caption || '[Video]';
          mediaUrl = msg.video?.id || null;
          mimeType = msg.video?.mime_type || null;
          break;
        case 'document':
          content = msg.document?.caption || '[Document]';
          fileName = msg.document?.filename || null;
          mediaUrl = msg.document?.id || null;
          mimeType = msg.document?.mime_type || null;
          break;
        case 'audio':
          content = '[Audio]';
          mediaUrl = msg.audio?.id || null;
          mimeType = msg.audio?.mime_type || null;
          break;
        case 'sticker':
          content = '[Sticker]';
          mediaUrl = msg.sticker?.id || null;
          mimeType = msg.sticker?.mime_type || null;
          break;
        case 'location':
          content = `[Location: ${msg.location?.latitude}, ${msg.location?.longitude}]`;
          break;
        case 'reaction':
          content = msg.reaction?.emoji || '';
          break;
        case 'contacts':
          content = '[Contact]';
          break;
        default:
          content = `[${type}]`;
      }

      // Get contact name from contacts array
      const contactInfo = contacts?.find((c) => c.wa_id === from);
      const pushName = contactInfo?.profile?.name || null;

      // Save message to database
      const savedMessage = await prisma.message.create({
        data: {
          sessionId: session.id,
          jid: from,
          messageId,
          content,
          type: type === 'reaction' ? 'reaction' : type,
          mediaUrl,
          mimeType,
          fileName,
          fromMe: false,
          status: 'received',
          timestamp,
          quotedMsgId: msg.context?.message_id || null,
        },
      });

      // Emit event via Socket.IO
      const eventData = {
        sessionId: session.id,
        message: savedMessage,
        raw: {
          from,
          pushName,
          timestamp: msg.timestamp,
          type,
        },
      };

      if (io) {
        io.to(`session:${session.id}`).emit('message', eventData);
      }

      // Trigger user-configured webhooks
      triggerWebhook('message', eventData);
    } catch (err) {
      console.error(`Error processing incoming message for session ${session.id}:`, err.message);
    }
  }
}



/**
 * Handle message status updates from Meta webhook
 */
async function handleStatusUpdates(session, statuses, io) {
  for (const statusUpdate of statuses) {
    try {
      const messageId = statusUpdate.id;
      const recipientId = statusUpdate.recipient_id;
      const timestamp = statusUpdate.timestamp
        ? new Date(parseInt(statusUpdate.timestamp) * 1000)
        : new Date();

      let status = null;
      switch (statusUpdate.status) {
        case 'sent':
          status = 'sent';
          break;
        case 'delivered':
          status = 'delivered';
          break;
        case 'read':
          status = 'read';
          break;
        case 'failed':
          status = 'failed';
          break;
        default:
          continue;
      }

      // Update message status in database
      await prisma.message.updateMany({
        where: {
          sessionId: session.id,
          messageId,
        },
        data: { status },
      });

      // Emit status update via Socket.IO
      const eventData = {
        sessionId: session.id,
        messageId,
        recipientId,
        status,
        timestamp,
        errors: statusUpdate.errors || null,
      };

      if (io) {
        io.to(`session:${session.id}`).emit('message-status', eventData);
      }

      // Trigger user-configured webhooks
      triggerWebhook('status', eventData);
    } catch (err) {
      console.error(`Error processing status update for session ${session.id}:`, err.message);
    }
  }
}

module.exports = router;
