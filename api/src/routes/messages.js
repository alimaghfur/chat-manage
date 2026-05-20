const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const {
  sendTextMessage,
  sendMediaMessage,
  sendTemplateMessage,
  sendReaction,
  markAsRead,
  isSessionConnected,
} = require('../services/whatsapp');

const prisma = new PrismaClient();

/**
 * @swagger
 * /api/messages/text:
 *   post:
 *     summary: Send a text message
 *     tags: [Messages]
 *     security:
 *       - ApiKeyAuth: []
 */
router.post('/text', async (req, res) => {
  try {
    const { sessionId, to, text } = req.body;

    if (!sessionId || !to || !text) {
      return res.status(400).json({
        success: false,
        error: 'sessionId, to, and text are required',
      });
    }

    const connected = await isSessionConnected(sessionId);
    if (!connected) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or not configured',
      });
    }

    const result = await sendTextMessage(sessionId, to, text);
    const waMessageId = result.messages?.[0]?.id || null;

    // Save to database
    const message = await prisma.message.create({
      data: {
        sessionId,
        jid: to,
        messageId: waMessageId,
        content: text,
        type: 'text',
        fromMe: true,
        status: 'sent',
        timestamp: new Date(),
      },
    });

    res.json({ success: true, data: { message, waMessageId } });
  } catch (error) {
    const status = error.statusCode || error.response?.status || 500;
    const msg = error.response?.data?.error?.message || error.message;
    res.status(status).json({ success: false, error: msg });
  }
});



/**
 * @swagger
 * /api/messages/media:
 *   post:
 *     summary: Send a media message
 *     tags: [Messages]
 *     security:
 *       - ApiKeyAuth: []
 */
router.post('/media', async (req, res) => {
  try {
    const { sessionId, to, type, mediaUrl, caption, mimeType, fileName } = req.body;

    if (!sessionId || !to || !type || !mediaUrl) {
      return res.status(400).json({
        success: false,
        error: 'sessionId, to, type, and mediaUrl are required',
      });
    }

    const connected = await isSessionConnected(sessionId);
    if (!connected) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or not configured',
      });
    }

    const result = await sendMediaMessage(sessionId, to, type, mediaUrl, caption, mimeType, fileName);
    const waMessageId = result.messages?.[0]?.id || null;

    // Save to database
    const message = await prisma.message.create({
      data: {
        sessionId,
        jid: to,
        messageId: waMessageId,
        content: caption || `[${type}]`,
        type,
        mediaUrl,
        mimeType: mimeType || null,
        fileName: fileName || null,
        fromMe: true,
        status: 'sent',
        timestamp: new Date(),
      },
    });

    res.json({ success: true, data: { message, waMessageId } });
  } catch (error) {
    const status = error.statusCode || error.response?.status || 500;
    const msg = error.response?.data?.error?.message || error.message;
    res.status(status).json({ success: false, error: msg });
  }
});



/**
 * @swagger
 * /api/messages/template:
 *   post:
 *     summary: Send a template message
 *     tags: [Messages]
 *     security:
 *       - ApiKeyAuth: []
 */
router.post('/template', async (req, res) => {
  try {
    const { sessionId, to, templateName, languageCode, components } = req.body;

    if (!sessionId || !to || !templateName) {
      return res.status(400).json({
        success: false,
        error: 'sessionId, to, and templateName are required',
      });
    }

    const connected = await isSessionConnected(sessionId);
    if (!connected) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or not configured',
      });
    }

    const result = await sendTemplateMessage(sessionId, to, templateName, languageCode, components);
    const waMessageId = result.messages?.[0]?.id || null;

    // Save to database
    const message = await prisma.message.create({
      data: {
        sessionId,
        jid: to,
        messageId: waMessageId,
        content: `[Template: ${templateName}]`,
        type: 'text',
        fromMe: true,
        status: 'sent',
        timestamp: new Date(),
      },
    });

    res.json({ success: true, data: { message, waMessageId } });
  } catch (error) {
    const status = error.statusCode || error.response?.status || 500;
    const msg = error.response?.data?.error?.message || error.message;
    res.status(status).json({ success: false, error: msg });
  }
});



/**
 * @swagger
 * /api/messages/reaction:
 *   post:
 *     summary: Send a reaction
 *     tags: [Messages]
 *     security:
 *       - ApiKeyAuth: []
 */
router.post('/reaction', async (req, res) => {
  try {
    const { sessionId, to, messageId, emoji } = req.body;

    if (!sessionId || !to || !messageId || emoji === undefined) {
      return res.status(400).json({
        success: false,
        error: 'sessionId, to, messageId, and emoji are required',
      });
    }

    const connected = await isSessionConnected(sessionId);
    if (!connected) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or not configured',
      });
    }

    const result = await sendReaction(sessionId, to, messageId, emoji);
    const waMessageId = result.messages?.[0]?.id || null;

    res.json({ success: true, data: { waMessageId } });
  } catch (error) {
    const status = error.statusCode || error.response?.status || 500;
    const msg = error.response?.data?.error?.message || error.message;
    res.status(status).json({ success: false, error: msg });
  }
});



/**
 * @swagger
 * /api/messages/read:
 *   post:
 *     summary: Mark a message as read
 *     tags: [Messages]
 *     security:
 *       - ApiKeyAuth: []
 */
router.post('/read', async (req, res) => {
  try {
    const { sessionId, messageId } = req.body;

    if (!sessionId || !messageId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId and messageId are required',
      });
    }

    const connected = await isSessionConnected(sessionId);
    if (!connected) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or not configured',
      });
    }

    const result = await markAsRead(sessionId, messageId);

    // Update message status in DB
    await prisma.message.updateMany({
      where: { sessionId, messageId },
      data: { status: 'read' },
    });

    res.json({ success: true, data: result });
  } catch (error) {
    const status = error.statusCode || error.response?.status || 500;
    const msg = error.response?.data?.error?.message || error.message;
    res.status(status).json({ success: false, error: msg });
  }
});



// POST /bulk - Bulk send messages
router.post('/bulk', async (req, res) => {
  try {
    const { sessionId, recipients, message, delay = 2000 } = req.body;

    if (!sessionId || !recipients || !Array.isArray(recipients) || !message) {
      return res.status(400).json({
        success: false,
        error: 'sessionId, recipients (array), and message are required',
      });
    }

    const connected = await isSessionConnected(sessionId);
    if (!connected) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or not configured',
      });
    }

    // Process asynchronously
    const results = { sent: 0, failed: 0, total: recipients.length };
    (async () => {
      for (const recipient of recipients) {
        try {
          await sendTextMessage(sessionId, recipient, message);
          results.sent++;
        } catch (err) {
          results.failed++;
        }
        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    })();

    res.json({
      success: true,
      message: 'Bulk send initiated',
      data: {
        total: recipients.length,
        delay,
        estimatedTime: `${(recipients.length * delay) / 1000}s`,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /:sessionId/:jid - Get conversation messages (paginated)
router.get('/:sessionId/:jid', async (req, res) => {
  try {
    const { sessionId, jid } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: { sessionId, jid },
        orderBy: { timestamp: 'desc' },
        skip,
        take: limit,
      }),
      prisma.message.count({ where: { sessionId, jid } }),
    ]);

    res.json({
      success: true,
      data: messages,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /:id - Delete message from DB
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const message = await prisma.message.findUnique({ where: { id } });
    if (!message) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    await prisma.message.delete({ where: { id } });

    res.json({ success: true, message: 'Message deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
