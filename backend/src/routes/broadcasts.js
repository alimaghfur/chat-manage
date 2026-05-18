const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { sendMessage, isSessionConnected } = require('../services/whatsapp');

const prisma = new PrismaClient();

// Get all broadcasts
router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const broadcasts = await prisma.broadcast.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(broadcasts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create and send broadcast
router.post('/', async (req, res) => {
  try {
    const { sessionId, name, message, recipients } = req.body;

    if (!sessionId || !name || !message || !recipients || recipients.length === 0) {
      return res.status(400).json({ error: 'sessionId, name, message, and recipients are required' });
    }

    if (!isSessionConnected(sessionId)) {
      return res.status(400).json({ error: 'Session is not connected' });
    }

    // Create broadcast record
    const broadcast = await prisma.broadcast.create({
      data: {
        sessionId,
        name,
        message,
        recipients: JSON.stringify(recipients),
        totalCount: recipients.length,
        status: 'sending',
      },
    });

    // Send messages in background
    sendBroadcastMessages(broadcast.id, sessionId, message, recipients, req.app.get('io'));

    res.status(201).json(broadcast);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function sendBroadcastMessages(broadcastId, sessionId, message, recipients, io) {
  let sentCount = 0;
  let failCount = 0;

  for (const jid of recipients) {
    try {
      await sendMessage(sessionId, jid, message);
      sentCount++;

      // Add delay to avoid being banned
      await new Promise((resolve) => setTimeout(resolve, 2000 + Math.random() * 3000));
    } catch (error) {
      failCount++;
      console.error(`Broadcast failed for ${jid}:`, error.message);
    }

    // Update progress
    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: { sentCount, failCount },
    });

    io.to(`session-${sessionId}`).emit('broadcast-progress', {
      broadcastId,
      sentCount,
      failCount,
      total: recipients.length,
    });
  }

  // Mark as completed
  await prisma.broadcast.update({
    where: { id: broadcastId },
    data: { status: sentCount > 0 ? 'completed' : 'failed', sentCount, failCount },
  });

  io.to(`session-${sessionId}`).emit('broadcast-complete', { broadcastId });
}

// Delete broadcast
router.delete('/:id', async (req, res) => {
  try {
    await prisma.broadcast.delete({ where: { id: req.params.id } });
    res.json({ message: 'Broadcast deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
