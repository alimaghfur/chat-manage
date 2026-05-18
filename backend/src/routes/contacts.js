const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Get contacts for a session
router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const contacts = await prisma.contact.findMany({
      where: { sessionId },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          orderBy: { timestamp: 'desc' },
          take: 1,
        },
        _count: {
          select: { messages: true },
        },
      },
    });

    // Sort by last message time
    const sorted = contacts.sort((a, b) => {
      const aTime = a.messages[0]?.timestamp || a.createdAt;
      const bTime = b.messages[0]?.timestamp || b.createdAt;
      return new Date(bTime) - new Date(aTime);
    });

    res.json(sorted);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update contact (name, labels)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, labels } = req.body;

    const contact = await prisma.contact.update({
      where: { id },
      data: { name, labels },
    });

    res.json(contact);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete contact
router.delete('/:id', async (req, res) => {
  try {
    await prisma.contact.delete({ where: { id: req.params.id } });
    res.json({ message: 'Contact deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add contact manually
router.post('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { phone, name } = req.body;

    if (!phone) return res.status(400).json({ error: 'Phone is required' });

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const jid = `${cleanPhone}@s.whatsapp.net`;

    const contact = await prisma.contact.upsert({
      where: { sessionId_jid: { sessionId, jid } },
      update: { name },
      create: {
        sessionId,
        jid,
        phone: cleanPhone,
        name,
      },
    });

    res.status(201).json(contact);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
