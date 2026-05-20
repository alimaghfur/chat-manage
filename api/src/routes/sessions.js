const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const {
  createSession,
  disconnectSession,
  isSessionConnected,
  getSession,
} = require('../services/whatsapp');

const prisma = new PrismaClient();

/**
 * @swagger
 * /api/sessions:
 *   get:
 *     summary: List all sessions
 *     description: Retrieve all WhatsApp sessions with their current status
 *     tags: [Sessions]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of sessions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       status:
 *                         type: string
 *                         enum: [connected, disconnected, connecting]
 *                       phone:
 *                         type: string
 */
router.get('/', async (req, res) => {
  try {
    const sessions = await prisma.session.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const data = sessions.map((session) => ({
      ...session,
      isConnected: isSessionConnected(session.id),
    }));

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/sessions/{id}:
 *   get:
 *     summary: Get session by ID
 *     description: Retrieve a single session by its unique identifier
 *     tags: [Sessions]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Session details
 *       404:
 *         description: Session not found
 */
router.get('/:id', async (req, res) => {
  try {
    const session = await prisma.session.findUnique({
      where: { id: req.params.id },
    });

    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    res.json({
      success: true,
      data: {
        ...session,
        isConnected: isSessionConnected(session.id),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/sessions:
 *   post:
 *     summary: Create a new session
 *     description: Create a new WhatsApp session entry in the database
 *     tags: [Sessions]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: "My WhatsApp"
 *               proxyUrl:
 *                 type: string
 *                 example: "socks5://user:pass@host:port"
 *               webhookUrl:
 *                 type: string
 *                 example: "https://example.com/webhook"
 *     responses:
 *       201:
 *         description: Session created
 *       400:
 *         description: Validation error
 */
router.post('/', async (req, res) => {
  try {
    const { name, proxyUrl, webhookUrl } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    const session = await prisma.session.create({
      data: {
        name,
        proxyUrl: proxyUrl || null,
        webhookUrl: webhookUrl || null,
        status: 'disconnected',
      },
    });

    res.status(201).json({ success: true, data: session });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/sessions/{id}/connect:
 *   post:
 *     summary: Connect a session
 *     description: Initiate WhatsApp connection via QR code or pairing code
 *     tags: [Sessions]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               method:
 *                 type: string
 *                 enum: [qr, pairing]
 *                 default: qr
 *               phoneNumber:
 *                 type: string
 *                 description: Required when method is 'pairing'
 *     responses:
 *       200:
 *         description: Connection initiated
 *       404:
 *         description: Session not found
 */
router.post('/:id/connect', async (req, res) => {
  try {
    const { id } = req.params;
    const { method = 'qr', phoneNumber } = req.body;

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    if (isSessionConnected(id)) {
      return res.status(400).json({ success: false, error: 'Session is already connected' });
    }

    const io = req.app.get('io');
    const usePairingCode = method === 'pairing';

    if (usePairingCode && !phoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required for pairing code method',
      });
    }

    await createSession(id, io, {
      usePairingCode,
      phoneNumber,
      proxyUrl: session.proxyUrl,
    });

    await prisma.session.update({
      where: { id },
      data: { status: 'connecting' },
    });

    res.json({
      success: true,
      message: `Connection initiated via ${method}. Listen on WebSocket for updates.`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /:id/disconnect - Disconnect session
router.post('/:id/disconnect', async (req, res) => {
  try {
    const { id } = req.params;

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    await disconnectSession(id);

    res.json({ success: true, message: 'Session disconnected' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /:id - Delete session and cleanup
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    // Disconnect if connected
    if (isSessionConnected(id)) {
      await disconnectSession(id);
    }

    // Delete from database (cascades to related records)
    await prisma.session.delete({ where: { id } });

    res.json({ success: true, message: 'Session deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /:id - Update session
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, proxyUrl, webhookUrl } = req.body;

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (proxyUrl !== undefined) updateData.proxyUrl = proxyUrl;
    if (webhookUrl !== undefined) updateData.webhookUrl = webhookUrl;

    const updated = await prisma.session.update({
      where: { id },
      data: updateData,
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /:id/status - Get real-time status
router.get('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    const connected = isSessionConnected(id);
    const activeSession = getSession(id);

    res.json({
      success: true,
      data: {
        id: session.id,
        name: session.name,
        status: connected ? 'connected' : session.status,
        isConnected: connected,
        phone: session.phone,
        user: activeSession?.sock?.user || null,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
