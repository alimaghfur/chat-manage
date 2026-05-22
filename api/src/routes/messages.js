/**
 * Messages Route - Unified message sending & inbox across all platforms
 */

const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { getAdapterById } = require('../services/platforms');
const { triggerWebhook } = require('../services/webhook');

const prisma = new PrismaClient();

// ====================================================================
// POST /api/messages/text - Send text message (any platform)
// ====================================================================
router.post('/text', async (req, res) => {
  try {
    const { sessionId, to, text } = req.body;

    if (!sessionId || !to || !text) {
      return res.status(400).json({ success: false, error: 'sessionId, to, and text are required' });
    }

    const adapter = await getAdapterById(sessionId);
    const result = await adapter.sendText(to, text);

    // Save to database
    const message = await prisma.message.create({
      data: {
        sessionId,
        platformChatId: to,
        content: text,
        type: 'text',
        fromMe: true,
        status: 'sent',
        timestamp: new Date(),
        externalMsgId: result.messageId || null,
      },
    });

    // Update contact last message
    await prisma.contact.upsert({
      where: { sessionId_platformId: { sessionId, platformId: to } },
      update: { lastMessage: text.slice(0, 100), lastMsgTime: new Date(), unreadCount: 0 },
      create: { sessionId, platformId: to, lastMessage: text.slice(0, 100), lastMsgTime: new Date() },
    });

    // Emit via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.to(`session:${sessionId}`).emit('message', { sessionId, message });
    }

    triggerWebhook('message.sent', { sessionId, to, text, messageId: result.messageId });

    res.json({ success: true, data: { message, externalMsgId: result.messageId } });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

// ====================================================================
// POST /api/messages/media - Send media message (any platform)
// ====================================================================
router.post('/media', async (req, res) => {
  try {
    const { sessionId, to, type, mediaUrl, caption, mimeType, fileName } = req.body;

    if (!sessionId || !to || !type || !mediaUrl) {
      return res.status(400).json({ success: false, error: 'sessionId, to, type, and mediaUrl are required' });
    }

    const adapter = await getAdapterById(sessionId);
    const result = await adapter.sendMedia(to, type, mediaUrl, { caption, mimeType, fileName });

    const message = await prisma.message.create({
      data: {
        sessionId,
        platformChatId: to,
        content: caption || `[${type}]`,
        type,
        mediaUrl,
        mediaMimeType: mimeType || null,
        mediaFileName: fileName || null,
        fromMe: true,
        status: 'sent',
        timestamp: new Date(),
        externalMsgId: result.messageId || null,
      },
    });

    await prisma.contact.upsert({
      where: { sessionId_platformId: { sessionId, platformId: to } },
      update: { lastMessage: `[${type}] ${caption || ''}`.trim().slice(0, 100), lastMsgTime: new Date(), unreadCount: 0 },
      create: { sessionId, platformId: to, lastMessage: `[${type}]`, lastMsgTime: new Date() },
    });

    res.json({ success: true, data: { message, externalMsgId: result.messageId } });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

// ====================================================================
// POST /api/messages/template - Send template (WhatsApp API only)
// ====================================================================
router.post('/template', async (req, res) => {
  try {
    const { sessionId, to, templateName, languageCode, components } = req.body;

    if (!sessionId || !to || !templateName) {
      return res.status(400).json({ success: false, error: 'sessionId, to, and templateName are required' });
    }

    const adapter = await getAdapterById(sessionId);
    const features = adapter.getFeatures();

    if (!features.sendTemplate) {
      return res.status(400).json({ success: false, error: 'Templates not supported on this platform' });
    }

    const result = await adapter.sendTemplate(to, { name: templateName, languageCode, components });

    const message = await prisma.message.create({
      data: {
        sessionId,
        platformChatId: to,
        content: `[Template: ${templateName}]`,
        type: 'template',
        fromMe: true,
        status: 'sent',
        timestamp: new Date(),
        externalMsgId: result.messageId || null,
      },
    });

    res.json({ success: true, data: { message, externalMsgId: result.messageId } });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

// ====================================================================
// POST /api/messages/reaction - Send reaction
// ====================================================================
router.post('/reaction', async (req, res) => {
  try {
    const { sessionId, to, messageId, emoji } = req.body;

    if (!sessionId || !to || !messageId || emoji === undefined) {
      return res.status(400).json({ success: false, error: 'sessionId, to, messageId, and emoji are required' });
    }

    const adapter = await getAdapterById(sessionId);
    const features = adapter.getFeatures();

    if (!features.sendReaction) {
      return res.status(400).json({ success: false, error: 'Reactions not supported on this platform' });
    }

    const result = await adapter.sendReaction(to, messageId, emoji);
    res.json({ success: true, data: result });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

// ====================================================================
// POST /api/messages/read - Mark as read
// ====================================================================
router.post('/read', async (req, res) => {
  try {
    const { sessionId, to, messageId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'sessionId is required' });
    }

    const adapter = await getAdapterById(sessionId);
    const success = await adapter.markAsRead(to || messageId, messageId);

    // Reset unread count
    if (to) {
      await prisma.contact.updateMany({
        where: { sessionId, platformId: to },
        data: { unreadCount: 0 },
      });
    }

    if (messageId) {
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

// ====================================================================
// POST /api/messages/bulk - Bulk send text
// ====================================================================
router.post('/bulk', async (req, res) => {
  try {
    const { sessionId, recipients, message, delay = 2000 } = req.body;

    if (!sessionId || !recipients || !Array.isArray(recipients) || !message) {
      return res.status(400).json({ success: false, error: 'sessionId, recipients (array), and message are required' });
    }

    const adapter = await getAdapterById(sessionId);

    // Run async - don't block response
    (async () => {
      let sent = 0, failed = 0;
      for (const recipient of recipients) {
        try {
          await adapter.sendText(recipient, message);
          sent++;
        } catch {
          failed++;
        }
        if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      }
      console.log(`[Bulk] Session ${sessionId}: ${sent} sent, ${failed} failed out of ${recipients.length}`);
    })();

    res.json({
      success: true,
      message: 'Bulk send initiated',
      data: { total: recipients.length, delay, estimatedTime: `${(recipients.length * delay) / 1000}s` },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ====================================================================
// GET /api/messages/inbox - Unified inbox (all platforms, recent first)
// ====================================================================
router.get('/inbox', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const platform = req.query.platform;
    const sessionId = req.query.sessionId;
    const skip = (page - 1) * limit;

    const where = {};

    if (sessionId) {
      where.sessionId = sessionId;
    } else if (platform) {
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
          session: { select: { id: true, name: true, platform: true, phone: true, username: true, avatar: true } },
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

// ====================================================================
// GET /api/messages/conversations - Get conversation list (contacts with last message)
// ====================================================================
router.get('/conversations', async (req, res) => {
  try {
    const { platform, sessionId } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const where = { lastMsgTime: { not: null } };

    if (sessionId) {
      where.sessionId = sessionId;
    } else if (platform) {
      const sessions = await prisma.session.findMany({ where: { platform }, select: { id: true } });
      where.sessionId = { in: sessions.map((s) => s.id) };
    }

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        orderBy: { lastMsgTime: 'desc' },
        skip,
        take: limit,
        include: {
          session: { select: { id: true, name: true, platform: true, phone: true, username: true } },
        },
      }),
      prisma.contact.count({ where }),
    ]);

    res.json({
      success: true,
      data: contacts,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ====================================================================
// GET /api/messages/:sessionId/:chatId - Get messages in a conversation
// ====================================================================
router.get('/:sessionId/:chatId', async (req, res) => {
  try {
    const { sessionId, chatId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: { sessionId, platformChatId: chatId },
        orderBy: { timestamp: 'desc' },
        skip,
        take: limit,
      }),
      prisma.message.count({ where: { sessionId, platformChatId: chatId } }),
    ]);

    // Mark as read in DB
    await prisma.contact.updateMany({
      where: { sessionId, platformId: chatId },
      data: { unreadCount: 0 },
    });

    res.json({
      success: true,
      data: messages.reverse(), // Return in chronological order
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ====================================================================
// DELETE /api/messages/:id - Delete a message from DB
// ====================================================================
router.delete('/:id', async (req, res) => {
  try {
    const message = await prisma.message.findUnique({ where: { id: req.params.id } });
    if (!message) return res.status(404).json({ success: false, error: 'Message not found' });
    await prisma.message.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Message deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ====================================================================
// POST /api/messages/star/:id - Star/unstar a message
// ====================================================================
router.post('/star/:id', async (req, res) => {
  try {
    const message = await prisma.message.findUnique({ where: { id: req.params.id } });
    if (!message) return res.status(404).json({ success: false, error: 'Message not found' });

    await prisma.message.update({
      where: { id: req.params.id },
      data: { isStarred: !message.isStarred },
    });

    res.json({ success: true, data: { starred: !message.isStarred } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ====================================================================
// GET /api/messages/starred - Get all starred messages
// ====================================================================
router.get('/starred', async (req, res) => {
  try {
    const messages = await prisma.message.findMany({
      where: { isStarred: true },
      orderBy: { timestamp: 'desc' },
      take: 100,
      include: {
        session: { select: { id: true, name: true, platform: true } },
      },
    });

    res.json({ success: true, data: messages });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
