const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Get all auto-replies for a session
router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const autoReplies = await prisma.autoReply.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(autoReplies);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create auto-reply
router.post('/', async (req, res) => {
  try {
    const { sessionId, trigger, response, matchType = 'contains' } = req.body;

    if (!sessionId || !trigger || !response) {
      return res.status(400).json({ error: 'sessionId, trigger, and response are required' });
    }

    const autoReply = await prisma.autoReply.create({
      data: { sessionId, trigger, response, matchType },
    });

    res.status(201).json(autoReply);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update auto-reply
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { trigger, response, matchType, isActive } = req.body;

    const autoReply = await prisma.autoReply.update({
      where: { id },
      data: { trigger, response, matchType, isActive },
    });

    res.json(autoReply);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete auto-reply
router.delete('/:id', async (req, res) => {
  try {
    await prisma.autoReply.delete({ where: { id: req.params.id } });
    res.json({ message: 'Auto-reply deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
