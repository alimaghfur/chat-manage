const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { getPlatformAdapter, createAdapterFromSession, getSupportedPlatforms } = require('../services/platforms');

const prisma = new PrismaClient();

/**
 * @swagger
 * /api/sessions/platforms:
 *   get:
 *     summary: List supported platforms
 *     tags: [Sessions]
 *     security:
 *       - ApiKeyAuth: []
 */
router.get('/platforms', async (req, res) => {
  res.json({ success: true, data: getSupportedPlatforms() });
});

/**
 * @swagger
 * /api/sessions:
 *   get:
 *     summary: List all sessions
 *     tags: [Sessions]
 *     security:
 *       - ApiKeyAuth: []
 */
router.get('/', async (req, res) => {
  try {
    const { platform } = req.query;
    const where = platform ? { platform } : {};

    const sessions = await prisma.session.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const data = sessions.map((session) => ({
      ...session,
      accessToken: session.accessToken ? '******' : null,
      credentials: session.credentials ? '******' : null,
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
 *     tags: [Sessions]
 *     security:
 *       - ApiKeyAuth: []
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
        accessToken: session.accessToken ? '******' : null,
        credentials: session.credentials ? '******' : null,
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
 *     description: Create a session for any supported platform
 *     tags: [Sessions]
 *     security:
 *       - ApiKeyAuth: []
 */
router.post('/', async (req, res) => {
  try {
    const { name, platform = 'whatsapp', credentials, phoneNumberId, accessToken, waBusinessId, webhookUrl } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    // Validate platform
    const supported = getSupportedPlatforms().map((p) => p.id);
    if (!supported.includes(platform)) {
      return res.status(400).json({
        success: false,
        error: `Unsupported platform: ${platform}. Supported: ${supported.join(', ')}`,
      });
    }

    // Build credentials JSON
    let credentialsJson = credentials ? JSON.stringify(credentials) : null;

    // Backward compat: if WhatsApp fields provided directly, build credentials
    if (platform === 'whatsapp' && !credentialsJson && (phoneNumberId || accessToken)) {
      credentialsJson = JSON.stringify({ phoneNumberId, accessToken, waBusinessId });
    }

    const session = await prisma.session.create({
      data: {
        name,
        platform,
        credentials: credentialsJson,
        // Legacy WhatsApp fields
        phoneNumberId: platform === 'whatsapp' ? (credentials?.phoneNumberId || phoneNumberId || null) : null,
        accessToken: credentials?.accessToken || credentials?.botToken || credentials?.pageAccessToken || accessToken || null,
        waBusinessId: platform === 'whatsapp' ? (credentials?.waBusinessId || waBusinessId || null) : null,
        webhookUrl: webhookUrl || null,
        status: 'disconnected',
      },
    });

    res.status(201).json({
      success: true,
      data: {
        ...session,
        accessToken: '******',
        credentials: '******',
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
 *     summary: Verify credentials and connect session
 *     tags: [Sessions]
 *     security:
 *       - ApiKeyAuth: []
 */
router.post('/:id/connect', async (req, res) => {
  try {
    const { id } = req.params;

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    // Create platform adapter and verify credentials
    const adapter = createAdapterFromSession(session);
    const verification = await adapter.verifyCredentials();

    if (!verification.valid) {
      await prisma.session.update({
        where: { id },
        data: { status: 'disconnected' },
      });
      return res.status(400).json({
        success: false,
        error: verification.error || 'Credential verification failed',
      });
    }

    // Update session status
    const updateData = { status: 'connected' };

    // Extract useful info from verification
    if (verification.info) {
      if (verification.info.phoneNumber) updateData.phone = verification.info.phoneNumber;
      if (verification.info.botUsername) updateData.phone = `@${verification.info.botUsername}`;
      if (verification.info.username) updateData.phone = `@${verification.info.username}`;
      if (verification.info.pageName) updateData.phone = verification.info.pageName;
    }

    await prisma.session.update({ where: { id }, data: updateData });

    res.json({
      success: true,
      message: `${session.platform} session verified and connected`,
      data: {
        platform: session.platform,
        features: adapter.getFeatures(),
        info: verification.info,
      },
    });
  } catch (error) {
    await prisma.session.update({
      where: { id: req.params.id },
      data: { status: 'disconnected' },
    }).catch(() => {});

    const status = error.response?.status || error.statusCode || 500;
    res.status(status).json({
      success: false,
      error: error.response?.data?.error?.message || error.message,
    });
  }
});

/**
 * @swagger
 * /api/sessions/{id}/disconnect:
 *   post:
 *     summary: Disconnect a session
 *     tags: [Sessions]
 */
router.post('/:id/disconnect', async (req, res) => {
  try {
    const { id } = req.params;
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    await prisma.session.update({ where: { id }, data: { status: 'disconnected' } });
    res.json({ success: true, message: 'Session disconnected' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    const session = await prisma.session.findUnique({ where: { id: req.params.id } });
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    await prisma.session.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Session deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /:id
router.patch('/:id', async (req, res) => {
  try {
    const session = await prisma.session.findUnique({ where: { id: req.params.id } });
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    const { name, credentials, webhookUrl } = req.body;
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (credentials !== undefined) updateData.credentials = JSON.stringify(credentials);
    if (webhookUrl !== undefined) updateData.webhookUrl = webhookUrl;

    const updated = await prisma.session.update({ where: { id: req.params.id }, data: updateData });
    res.json({
      success: true,
      data: { ...updated, accessToken: '******', credentials: '******' },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/sessions/{id}/status:
 *   get:
 *     summary: Get session status and features
 *     tags: [Sessions]
 */
router.get('/:id/status', async (req, res) => {
  try {
    const session = await prisma.session.findUnique({ where: { id: req.params.id } });
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    const adapter = createAdapterFromSession(session);
    let tokenValid = false;
    let info = null;

    try {
      const verification = await adapter.verifyCredentials();
      tokenValid = verification.valid;
      info = verification.info;
    } catch { tokenValid = false; }

    res.json({
      success: true,
      data: {
        id: session.id,
        name: session.name,
        platform: session.platform,
        status: session.status,
        tokenValid,
        phone: session.phone,
        features: adapter.getFeatures(),
        info,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
