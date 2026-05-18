const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { sendMessage, isSessionConnected } = require('../services/whatsapp');

const prisma = new PrismaClient();

// Get messages for a conversation
router.get('/:sessionId/:jid', async (req, res) => {
  try {
    const { sessionId, jid } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const messages = await prisma.message.findMany({
      where: { sessionId, jid: decodeURIComponent(jid) },
      orderBy: { timestamp: 'desc' },
      take: parseInt(limit),
      skip,
    });

    const total = await prisma.message.count({
      where: { sessionId, jid: decodeURIComponent(jid) },
    });

    res.json({
      messages: messages.reverse(),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send a message
router.post('/send', async (req, res) => {
  try {
    const { sessionId, jid, content, type = 'text' } = req.body;

    if (!sessionId || !jid || !content) {
      return res.status(400).json({ error: 'sessionId, jid, and content are required' });
    }

    if (!isSessionConnected(sessionId)) {
      return res.status(400).json({ error: 'Session is not connected' });
    }

    // Send via WhatsApp
    const result = await sendMessage(sessionId, jid, content, type);

    // Get or create contact
    const phone = jid.replace('@s.whatsapp.net', '').replace('@g.us', '');
    let contact = await prisma.contact.upsert({
      where: { sessionId_jid: { sessionId, jid } },
      update: {},
      create: { sessionId, jid, phone },
    });

    // Save to database
    const message = await prisma.message.create({
      data: {
        sessionId,
        contactId: contact.id,
        jid,
        content,
        type,
        fromMe: true,
        status: 'sent',
        timestamp: new Date(),
        messageId: result.key.id,
      },
    });

    // Emit via socket
    const io = req.app.get('io');
    io.to(`session-${sessionId}`).emit('new-message', { ...message, contact });

    res.json(message);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a message from DB
router.delete('/:id', async (req, res) => {
  try {
    await prisma.message.delete({ where: { id: req.params.id } });
    res.json({ message: 'Message deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
