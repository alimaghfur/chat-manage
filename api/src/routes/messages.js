const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { getPlatformAdapter } = require('../services/platforms');
const { triggerWebhook } = require('../services/webhook');

const prisma = new PrismaClient();

/**
 * @swagger
 * /api/messages/text:
 *   post:
 *     summary: Send a text message (any platform)
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

    const adapter = await getPlatformAdapter(sessionId);
    const result = await adapter.sendText(to, text);

    // Save to database
    const message = await prisma.message.create({
      data: {
        sessionId,
        platformId: to,
        externalMsgId: result.messageId,
        content: text,
        type: 'text',
        fromMe: true,
        status: 'sent',
        timestamp: new Date(),
      },
    });

    // Emit via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.to(`session:${sessionId}`).emit('message', {
        sessionId,
        platform: adapter.getPlatform(),
        message,
      });
    }

    triggerWebhook('message.sent', { sessionId, platform: adapter.getPlatform(), to, text, messageId: result.messageId });

    res.json({ success: true, data: { message, externalMsgId: result.messageId } });
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
 *     summary: Send a media message (any platform)
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

    const adapter = await getPlatformAdapter(sessionId);
    const result = await adapter.sendMedia(to, type, mediaUrl, { caption, mimeType, fileName });

    const message = await prisma.message.create({
      data: {
        sessionId,
        platformId: to,
        externalMsgId: result.messageId,
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

    triggerWebhook('message.sent', { sessionId, platform: adapter.getPlatform(), to, type, mediaUrl, messageId: result.messageId });

    res.json({ success: true, data: { message, externalMsgId: result.messageId } });
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
 *     summary: Send a template message (WhatsApp/Messenger)
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

    const adapter = await getPlatformAdapter(sessionId);
    const features = adapter.getFeatures();

    if (!features.sendTemplate) {
      return res.status(400).json({
        success: false,
        error: `Template messages are not supported on ${adapter.getPlatform()}`,
      });
    }

    const result = await adapter.sendTemplate(to, { name: templateName, languageCode, components });

    const message = await prisma.message.create({
      data: {
        sessionId,
        platformId: to,
        externalMsgId: result.messageId,
        content: `[Template: ${templateName}]`,
        type: 'template',
        fromMe: true,
        status: 'sent',
        timestamp: new Date(),
      },
    });

    res.json({ success: true, data: { message, externalMsgId: result.messageId } });
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
 *     summary: Send a reaction (WhatsApp/Telegram)
 *     tags: [Messages]
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

    const adapter = await getPlatformAdapter(sessionId);
    const features = adapter.getFeatures();

    if (!features.sendReaction) {
      return res.status(400).json({
        success: false,
        error: `Reactions are not supported on ${adapter.getPlatform()}`,
      });
    }

    const result = await adapter.sendReaction(to, messageId, emoji);
    res.json({ success: true, data: result });
  } catch (error) {
    const status = error.statusCode || error.response?.status || 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/messages/read:
 *   post:
 *     summary: Mark message as read
 *     tags: [Messages]
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

    const adapter = await getPlatformAdapter(sessionId);
    const success = await adapter.markAsRead(messageId);

    if (success) {
      await prisma.message.updateMany({
        where: { sessionId, externalMsgId: messageId },
        data: { status: 'read' },
      });
    }

    res.json({ success: true, data: { marked: success } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
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

    const adapter = await getPlatformAdapter(sessionId);

    // Process asynchronously
    (async () => {
      for (const recipient of recipients) {
        try {
          await adapter.sendText(recipient, message);
        } catch (err) {
          console.error(`Bulk send to ${recipient} failed:`, err.message);
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
        platform: adapter.getPlatform(),
        total: recipients.length,
        delay,
        estimatedTime: `${(recipients.length * delay) / 1000}s`,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /inbox - Unified inbox (all messages from all sessions, recent first)
router.get('/inbox', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const platform = req.query.platform;
    const skip = (page - 1) * limit;

    const where = {};
    if (platform) {
      const sessions = await prisma.session.findMany({ where: { platform }, select: { id: true } });
      where.sessionId = { in: sessions.map((s) => s.id) };
    }

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip,
        take: limit,
        include: {
          session: { select: { id: true, name: true, platform: true, phone: true } },
        },
      }),
      prisma.message.count({ where }),
    ]);

    res.json({
      success: true,
      data: messages,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /:sessionId/:platformId - Get conversation messages
router.get('/:sessionId/:platformId', async (req, res) => {
  try {
    const { sessionId, platformId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: { sessionId, platformId },
        orderBy: { timestamp: 'desc' },
        skip,
        take: limit,
      }),
      prisma.message.count({ where: { sessionId, platformId } }),
    ]);

    res.json({
      success: true,
      data: messages,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    const message = await prisma.message.findUnique({ where: { id: req.params.id } });
    if (!message) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }
    await prisma.message.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Message deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
