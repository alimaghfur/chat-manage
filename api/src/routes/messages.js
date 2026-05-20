const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const {
  sendTextMessage,
  sendMediaMessage,
  sendReaction,
  getSession,
  isSessionConnected,
} = require('../services/whatsapp');

const prisma = new PrismaClient();

/**
 * @swagger
 * /api/messages/text:
 *   post:
 *     summary: Send a text message
 *     description: Send a text message through a connected WhatsApp session
 *     tags: [Messages]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sessionId
 *               - to
 *               - text
 *             properties:
 *               sessionId:
 *                 type: string
 *                 description: Session ID to send from
 *               to:
 *                 type: string
 *                 description: Recipient JID (e.g., 5511999999999@s.whatsapp.net)
 *               text:
 *                 type: string
 *                 description: Message text content
 *               quotedMsgId:
 *                 type: string
 *                 description: Message ID to quote/reply to
 *     responses:
 *       200:
 *         description: Message sent successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Session not found or not connected
 */
router.post('/text', async (req, res) => {
  try {
    const { sessionId, to, text, quotedMsgId } = req.body;

    if (!sessionId || !to || !text) {
      return res.status(400).json({
        success: false,
        error: 'sessionId, to, and text are required',
      });
    }

    if (!isSessionConnected(sessionId)) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or not connected',
      });
    }

    const result = await sendTextMessage(sessionId, to, text, { quotedMsgId });

    // Save to database
    const message = await prisma.message.create({
      data: {
        sessionId,
        jid: to,
        messageId: result.key.id,
        content: text,
        type: 'text',
        fromMe: true,
        status: 'sent',
        timestamp: new Date(),
        quotedMsgId: quotedMsgId || null,
      },
    });

    res.json({ success: true, data: { message, whatsappResult: result.key } });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/messages/media:
 *   post:
 *     summary: Send a media message
 *     description: Send an image, video, document, or audio through WhatsApp
 *     tags: [Messages]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sessionId
 *               - to
 *               - type
 *               - mediaUrl
 *             properties:
 *               sessionId:
 *                 type: string
 *               to:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [image, video, document, audio]
 *               mediaUrl:
 *                 type: string
 *                 description: URL of the media file to send
 *               caption:
 *                 type: string
 *               mimeType:
 *                 type: string
 *               fileName:
 *                 type: string
 *     responses:
 *       200:
 *         description: Media message sent successfully
 *       400:
 *         description: Validation error
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

    if (!isSessionConnected(sessionId)) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or not connected',
      });
    }

    const result = await sendMediaMessage(sessionId, to, type, mediaUrl, caption, mimeType, fileName);

    // Save to database
    const message = await prisma.message.create({
      data: {
        sessionId,
        jid: to,
        messageId: result.key.id,
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

    res.json({ success: true, data: { message, whatsappResult: result.key } });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/messages/reaction:
 *   post:
 *     summary: Send a reaction
 *     description: React to a message with an emoji
 *     tags: [Messages]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sessionId
 *               - to
 *               - messageId
 *               - emoji
 *             properties:
 *               sessionId:
 *                 type: string
 *               to:
 *                 type: string
 *               messageId:
 *                 type: string
 *               emoji:
 *                 type: string
 *                 example: "👍"
 *     responses:
 *       200:
 *         description: Reaction sent
 *       400:
 *         description: Validation error
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

    if (!isSessionConnected(sessionId)) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or not connected',
      });
    }

    const result = await sendReaction(sessionId, to, messageId, emoji);

    res.json({ success: true, data: { whatsappResult: result.key } });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ success: false, error: error.message });
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

    if (!isSessionConnected(sessionId)) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or not connected',
      });
    }

    // Start sending in background
    const results = { sent: 0, failed: 0, total: recipients.length };

    // Process asynchronously
    (async () => {
      for (const recipient of recipients) {
        try {
          await sendTextMessage(sessionId, recipient, message);
          results.sent++;
        } catch (err) {
          results.failed++;
        }
        // Delay between messages to avoid rate limiting
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
