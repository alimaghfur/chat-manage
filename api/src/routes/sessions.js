/**
 * Sessions Route - Multi-platform session management
 * 
 * Handles creation, connection (QR/OTP/login), disconnection, and deletion
 * for all supported platforms.
 */

const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { getAdapter, getAdapterById, getSupportedPlatforms } = require('../services/platforms');

const prisma = new PrismaClient();

// ====================================================================
// GET /api/sessions/platforms - List supported platforms
// ====================================================================
router.get('/platforms', (req, res) => {
  res.json({ success: true, data: getSupportedPlatforms() });
});

// ====================================================================
// GET /api/sessions - List all sessions
// ====================================================================
router.get('/', async (req, res) => {
  try {
    const { platform, status } = req.query;
    const where = {};
    if (platform) where.platform = platform;
    if (status) where.status = status;

    const sessions = await prisma.session.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // Mask sensitive data
    const data = sessions.map((s) => ({
      ...s,
      accessToken: s.accessToken ? '******' : null,
      credentials: s.credentials ? '******' : null,
      qrCode: s.qrCode || null, // Keep QR for frontend display
      pairingCode: s.pairingCode || null,
    }));

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ====================================================================
// GET /api/sessions/:id - Get single session
// ====================================================================
router.get('/:id', async (req, res) => {
  try {
    const session = await prisma.session.findUnique({ where: { id: req.params.id } });
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

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

// ====================================================================
// POST /api/sessions - Create a new session
// ====================================================================
router.post('/', async (req, res) => {
  try {
    const { name, platform, credentials, connectionType } = req.body;

    if (!name || !platform) {
      return res.status(400).json({ success: false, error: 'name and platform are required' });
    }

    const supported = getSupportedPlatforms().map((p) => p.id);
    if (!supported.includes(platform)) {
      return res.status(400).json({
        success: false,
        error: `Unsupported platform. Supported: ${supported.join(', ')}`,
      });
    }

    // Determine connection type
    let connType = connectionType;
    if (!connType) {
      const platformInfo = getSupportedPlatforms().find((p) => p.id === platform);
      connType = platformInfo?.connectionType || 'login';
    }

    // Store credentials
    let credentialsJson = null;
    let phoneNumberId = null;
    let accessToken = null;
    let waBusinessId = null;

    if (credentials) {
      credentialsJson = JSON.stringify(credentials);
      // Extract legacy fields for whatsapp_api
      if (platform === 'whatsapp_api') {
        phoneNumberId = credentials.phoneNumberId || null;
        accessToken = credentials.accessToken || null;
        waBusinessId = credentials.waBusinessId || null;
      }
    }

    const session = await prisma.session.create({
      data: {
        name,
        platform,
        connectionType: connType,
        credentials: credentialsJson,
        phoneNumberId,
        accessToken,
        waBusinessId,
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

// ====================================================================
// POST /api/sessions/:id/connect - Start connection
// Triggers QR generation, OTP send, or credential verification
// ====================================================================
router.post('/:id/connect', async (req, res) => {
  try {
    const { id } = req.params;
    const { phoneNumber, usePairingCode, username, password, email, appState } = req.body;
    const io = req.app.get('io');

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

    const adapter = getAdapter(session);

    let result;

    switch (session.platform) {
      case 'whatsapp':
        // Baileys: starts QR code generation or pairing code
        result = await adapter.connect(io, { usePairingCode, phoneNumber });
        break;

      case 'whatsapp_api':
        // Cloud API: verify token
        result = await adapter.connect(io);
        break;

      case 'telegram':
        // GramJS: start phone auth (sends OTP)
        result = await adapter.connect(io, { phoneNumber });
        break;

      case 'instagram':
        // Instagram: login with credentials
        result = await adapter.connect(io, { username, password });
        break;

      case 'messenger':
        // Messenger: login with email/pass or appState
        result = await adapter.connect(io, { email, password, appState });
        break;

      default:
        return res.status(400).json({ success: false, error: `Unknown platform: ${session.platform}` });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

// ====================================================================
// POST /api/sessions/:id/verify - Submit OTP/2FA/verification code
// Used by Telegram (OTP), Instagram (challenge), Messenger (2FA)
// ====================================================================
router.post('/:id/verify', async (req, res) => {
  try {
    const { id } = req.params;
    const { code, password } = req.body;
    const io = req.app.get('io');

    if (!code) {
      return res.status(400).json({ success: false, error: 'code is required' });
    }

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

    const adapter = getAdapter(session);
    let result;

    switch (session.platform) {
      case 'telegram':
        result = await adapter.submitOTP(code, password, io);
        break;

      case 'instagram':
        result = await adapter.submitVerificationCode(code, io);
        break;

      case 'messenger':
        result = await adapter.submit2FA(code, io);
        break;

      default:
        return res.status(400).json({ success: false, error: 'This platform does not require verification codes' });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

// ====================================================================
// POST /api/sessions/:id/send-phone - Send phone number for Telegram OTP
// ====================================================================
router.post('/:id/send-phone', async (req, res) => {
  try {
    const { id } = req.params;
    const { phoneNumber } = req.body;
    const io = req.app.get('io');

    if (!phoneNumber) {
      return res.status(400).json({ success: false, error: 'phoneNumber is required' });
    }

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

    if (session.platform !== 'telegram') {
      return res.status(400).json({ success: false, error: 'Only telegram sessions use phone number OTP' });
    }

    const adapter = getAdapter(session);
    const result = await adapter.sendPhoneNumber(phoneNumber, io);

    res.json({ success: true, data: result });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

// ====================================================================
// POST /api/sessions/:id/disconnect - Disconnect session
// ====================================================================
router.post('/:id/disconnect', async (req, res) => {
  try {
    const { id } = req.params;
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

    const adapter = getAdapter(session);
    await adapter.disconnect();

    const io = req.app.get('io');
    if (io) io.emit('session:status', { sessionId: id, status: 'disconnected' });

    res.json({ success: true, message: 'Session disconnected' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ====================================================================
// DELETE /api/sessions/:id - Delete session permanently
// ====================================================================
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

    // Disconnect first
    try {
      const adapter = getAdapter(session);
      await adapter.disconnect();
    } catch { /* ignore disconnect errors */ }

    // Delete from database (cascades to contacts, messages, etc.)
    await prisma.session.delete({ where: { id } });

    // TODO: Also clean up session files from filesystem

    res.json({ success: true, message: 'Session deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ====================================================================
// PATCH /api/sessions/:id - Update session name/settings
// ====================================================================
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, webhookUrl } = req.body;

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (webhookUrl !== undefined) updateData.webhookUrl = webhookUrl;

    const updated = await prisma.session.update({ where: { id }, data: updateData });

    res.json({
      success: true,
      data: { ...updated, accessToken: '******', credentials: '******' },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ====================================================================
// GET /api/sessions/:id/status - Get session status + features
// ====================================================================
router.get('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

    const adapter = getAdapter(session);
    const verification = await adapter.verifyCredentials();
    const features = adapter.getFeatures();

    res.json({
      success: true,
      data: {
        id: session.id,
        name: session.name,
        platform: session.platform,
        connectionType: session.connectionType,
        status: session.status,
        phone: session.phone,
        username: session.username,
        avatar: session.avatar,
        credentialsValid: verification.valid,
        info: verification.info || null,
        features,
        lastSeen: session.lastSeen,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ====================================================================
// GET /api/sessions/:id/qr - Get current QR code (for WhatsApp Baileys)
// ====================================================================
router.get('/:id/qr', async (req, res) => {
  try {
    const { id } = req.params;
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

    if (session.platform !== 'whatsapp') {
      return res.status(400).json({ success: false, error: 'QR code only for WhatsApp (non-API)' });
    }

    res.json({
      success: true,
      data: {
        qr: session.qrCode || null,
        pairingCode: session.pairingCode || null,
        status: session.status,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ====================================================================
// GET /api/sessions/:id/contacts - Get contacts for a session
// ====================================================================
router.get('/:id/contacts', async (req, res) => {
  try {
    const { id } = req.params;
    const { search, group } = req.query;

    const where = { sessionId: id };
    if (group === 'true') where.isGroup = true;
    if (group === 'false') where.isGroup = false;
    if (search) {
      where.OR = [
        { pushName: { contains: search } },
        { phone: { contains: search } },
        { username: { contains: search } },
      ];
    }

    const contacts = await prisma.contact.findMany({
      where,
      orderBy: { lastMsgTime: 'desc' },
      take: 100,
    });

    res.json({ success: true, data: contacts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
