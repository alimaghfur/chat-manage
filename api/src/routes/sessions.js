const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const {
  isSessionConnected,
  getSession,
  verifyToken,
  getBusinessProfile,
} = require('../services/whatsapp');

const prisma = new PrismaClient();

/**
 * @swagger
 * /api/sessions:
 *   get:
 *     summary: List all sessions
 *     description: Retrieve all WhatsApp Cloud API sessions
 *     tags: [Sessions]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of sessions
 */
router.get('/', async (req, res) => {
  try {
    const sessions = await prisma.session.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const data = await Promise.all(
      sessions.map(async (session) => ({
        ...session,
        accessToken: session.accessToken ? '••••••' : null, // mask token
        isConnected: await isSessionConnected(session.id),
      }))
    );

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
        accessToken: session.accessToken ? '••••••' : null,
        isConnected: await isSessionConnected(session.id),
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
 *     description: Create a new WhatsApp Cloud API session configuration
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
 *               - phoneNumberId
 *               - accessToken
 *             properties:
 *               name:
 *                 type: string
 *                 example: "My Business"
 *               phoneNumberId:
 *                 type: string
 *                 example: "123456789012345"
 *               accessToken:
 *                 type: string
 *                 example: "EAABx..."
 *               waBusinessId:
 *                 type: string
 *                 example: "987654321098765"
 *               webhookUrl:
 *                 type: string
 *     responses:
 *       201:
 *         description: Session created
 *       400:
 *         description: Validation error
 */
router.post('/', async (req, res) => {
  try {
    const { name, phoneNumberId, accessToken, waBusinessId, webhookUrl } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    if (!phoneNumberId || !accessToken) {
      return res.status(400).json({
        success: false,
        error: 'phoneNumberId and accessToken are required',
      });
    }

    const session = await prisma.session.create({
      data: {
        name,
        phoneNumberId,
        accessToken,
        waBusinessId: waBusinessId || null,
        webhookUrl: webhookUrl || null,
        status: 'connected', // Cloud API sessions are always "connected" if token is valid
      },
    });

    res.status(201).json({
      success: true,
      data: {
        ...session,
        accessToken: '••••••',
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/sessions/{id}/connect:
 *   post:
 *     summary: Verify and connect a session
 *     description: Verify the Cloud API token works by calling the Graph API
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
 *         description: Token verified, session connected
 *       404:
 *         description: Session not found
 */
router.post('/:id/connect', async (req, res) => {
  try {
    const { id } = req.params;

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    if (!session.phoneNumberId || !session.accessToken) {
      return res.status(400).json({
        success: false,
        error: 'Session is missing phoneNumberId or accessToken',
      });
    }

    // Verify token by calling the Graph API
    const phoneInfo = await verifyToken(session.phoneNumberId, session.accessToken);

    // Update session status and phone number
    await prisma.session.update({
      where: { id },
      data: {
        status: 'connected',
        phone: phoneInfo.display_phone_number || phoneInfo.verified_name || null,
      },
    });

    res.json({
      success: true,
      message: 'Token verified. Session is connected.',
      data: {
        phoneNumber: phoneInfo.display_phone_number || null,
        verifiedName: phoneInfo.verified_name || null,
        qualityRating: phoneInfo.quality_rating || null,
      },
    });
  } catch (error) {
    // If verification fails, mark as disconnected
    await prisma.session.update({
      where: { id: req.params.id },
      data: { status: 'disconnected' },
    }).catch(() => {});

    const status = error.response?.status || error.statusCode || 500;
    res.status(status).json({
      success: false,
      error: error.response?.data?.error?.message || error.message || 'Token verification failed',
    });
  }
});

/**
 * @swagger
 * /api/sessions/{id}/disconnect:
 *   post:
 *     summary: Disconnect a session
 *     description: Mark session as disconnected (Cloud API - just updates status)
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
 *         description: Session disconnected
 *       404:
 *         description: Session not found
 */
router.post('/:id/disconnect', async (req, res) => {
  try {
    const { id } = req.params;

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    await prisma.session.update({
      where: { id },
      data: { status: 'disconnected' },
    });

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
    const { name, phoneNumberId, accessToken, waBusinessId, webhookUrl } = req.body;

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (phoneNumberId !== undefined) updateData.phoneNumberId = phoneNumberId;
    if (accessToken !== undefined) updateData.accessToken = accessToken;
    if (waBusinessId !== undefined) updateData.waBusinessId = waBusinessId;
    if (webhookUrl !== undefined) updateData.webhookUrl = webhookUrl;

    const updated = await prisma.session.update({
      where: { id },
      data: updateData,
    });

    res.json({
      success: true,
      data: {
        ...updated,
        accessToken: updated.accessToken ? '••••••' : null,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/sessions/{id}/status:
 *   get:
 *     summary: Get session status
 *     description: Check if the session token is still valid
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
 *         description: Session status
 *       404:
 *         description: Session not found
 */
router.get('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    const connected = await isSessionConnected(id);

    let tokenValid = false;
    let phoneInfo = null;
    if (session.phoneNumberId && session.accessToken) {
      try {
        phoneInfo = await verifyToken(session.phoneNumberId, session.accessToken);
        tokenValid = true;
      } catch (err) {
        tokenValid = false;
      }
    }

    res.json({
      success: true,
      data: {
        id: session.id,
        name: session.name,
        status: connected ? 'connected' : session.status,
        isConnected: connected,
        tokenValid,
        phone: session.phone,
        phoneInfo: phoneInfo ? {
          displayPhoneNumber: phoneInfo.display_phone_number,
          verifiedName: phoneInfo.verified_name,
          qualityRating: phoneInfo.quality_rating,
        } : null,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
