const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check
 *     description: Returns overall system health status
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: System is healthy
 */
router.get('/', async (req, res) => {
  try {
    const totalSessions = await prisma.session.count();
    const connectedSessions = await prisma.session.count({
      where: { status: 'connected' },
    });

    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      version: '3.0.0',
      engine: 'cloud-api',
      sessions: {
        total: totalSessions,
        connected: connectedSessions,
      },
    });
  } catch (error) {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      version: '3.0.0',
      engine: 'cloud-api',
      sessions: { total: 0, connected: 0 },
    });
  }
});

/**
 * @swagger
 * /api/health/ready:
 *   get:
 *     summary: Readiness probe
 *     tags: [Health]
 */
router.get('/ready', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      ready: true,
      database: 'connected',
    });
  } catch (error) {
    res.status(503).json({
      ready: false,
      database: 'disconnected',
      error: error.message,
    });
  }
});



/**
 * Verify API key endpoint (no auth middleware required)
 */
router.post('/verify-key', async (req, res) => {
  try {
    const providedKey =
      req.headers['x-api-key'] ||
      req.query.apiKey ||
      req.body.apiKey;

    if (!providedKey) {
      return res.status(401).json({ valid: false, error: 'No key provided' });
    }

    // Check master key
    const masterKey = process.env.API_MASTER_KEY;
    if (masterKey && providedKey === masterKey) {
      return res.json({ valid: true, type: 'master', name: 'Master Key' });
    }

    // Check database key
    const apiKey = await prisma.apiKey.findUnique({
      where: { key: providedKey },
    });

    if (apiKey && apiKey.isActive) {
      return res.json({ valid: true, type: 'api-key', name: apiKey.name });
    }

    return res.status(401).json({ valid: false, error: 'Invalid API key' });
  } catch (error) {
    return res.status(500).json({ valid: false, error: error.message });
  }
});

module.exports = router;
