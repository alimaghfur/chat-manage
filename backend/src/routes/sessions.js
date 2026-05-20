const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { createSession, disconnectSession, isSessionConnected, sessions } = require('../services/whatsapp');

const prisma = new PrismaClient();

// Get all sessions
router.get('/', async (req, res) => {
  try {
    const allSessions = await prisma.session.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { contacts: true, messages: true },
        },
      },
    });

    // Update real-time status
    const sessionsWithStatus = allSessions.map((s) => ({
      ...s,
      status: isSessionConnected(s.id) ? 'connected' : s.status,
    }));

    res.json(sessionsWithStatus);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single session
router.get('/:id', async (req, res) => {
  try {
    const session = await prisma.session.findUnique({
      where: { id: req.params.id },
      include: {
        _count: {
          select: { contacts: true, messages: true },
        },
      },
    });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new session
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const session = await prisma.session.create({
      data: { name },
    });

    res.status(201).json(session);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get QR code for a session (polling fallback)
router.get('/:id/qr', async (req, res) => {
  try {
    const { id } = req.params;
    const session = await prisma.session.findUnique({
      where: { id },
      select: { qrCode: true, status: true },
    });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({ qr: session.qrCode, status: session.status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Connect session via QR code (default)
router.post('/:id/connect', async (req, res) => {
  try {
    const { id } = req.params;
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const io = req.app.get('io');
    
    console.log(`🔄 Starting connection for session: ${id}`);

    // Clear existing auth state if session is disconnected
    const path = require('path');
    const fs = require('fs');
    const sessionDir = path.join(__dirname, '../../sessions', id);
    if (session.status === 'disconnected' && fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true });
      console.log(`🗑️ Cleared old auth state for session: ${id}`);
    }
    
    createSession(id, io).then(() => {
      console.log(`✅ createSession resolved for: ${id}`);
    }).catch((err) => {
      console.error(`❌ createSession error for ${id}:`, err.message);
    });

    res.json({ message: 'Session connecting, check QR code' });
  } catch (error) {
    console.error('❌ Connect error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Connect session via Pairing Code (no QR scan needed)
router.post('/:id/connect-phone', async (req, res) => {
  try {
    const { id } = req.params;
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'phoneNumber is required (e.g. 628123456789)' });
    }

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const io = req.app.get('io');
    
    console.log(`🔄 Starting pairing code connection for session: ${id}, phone: ${phoneNumber}`);

    // Clear existing auth state
    const path = require('path');
    const fs = require('fs');
    const sessionDir = path.join(__dirname, '../../sessions', id);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true });
      console.log(`🗑️ Cleared old auth state for session: ${id}`);
    }
    
    createSession(id, io, { usePairingCode: true, phoneNumber }).then(() => {
      console.log(`✅ createSession (pairing) resolved for: ${id}`);
    }).catch((err) => {
      console.error(`❌ createSession (pairing) error for ${id}:`, err.message);
    });

    res.json({ message: 'Pairing code will be sent via socket. Enter it in WhatsApp > Linked Devices > Link with phone number' });
  } catch (error) {
    console.error('❌ Connect-phone error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Disconnect session
router.post('/:id/disconnect', async (req, res) => {
  try {
    const { id } = req.params;
    await disconnectSession(id);
    await prisma.session.update({
      where: { id },
      data: { status: 'disconnected' },
    });
    res.json({ message: 'Session disconnected' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete session
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Disconnect if connected
    if (sessions.has(id)) {
      await disconnectSession(id);
    }

    await prisma.session.delete({ where: { id } });
    res.json({ message: 'Session deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update session name
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    const session = await prisma.session.update({
      where: { id },
      data: { name },
    });

    res.json(session);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
