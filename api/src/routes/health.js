const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { sessions } = require('../services/whatsapp');

const prisma = new PrismaClient();

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check
 *     description: Returns overall system health status including uptime, version, and session counts
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: System is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 uptime:
 *                   type: number
 *                   example: 12345.67
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 version:
 *                   type: string
 *                   example: "2.0.0"
 *                 sessions:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     connected:
 *                       type: integer
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
      version: '2.0.0',
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
      version: '2.0.0',
      sessions: {
        total: sessions.size,
        connected: [...sessions.values()].filter((s) => s.sock?.user).length,
      },
    });
  }
});

/**
 * @swagger
 * /api/health/ready:
 *   get:
 *     summary: Readiness probe
 *     description: Checks database connectivity. Returns 200 if ready, 503 if not.
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is ready
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ready:
 *                   type: boolean
 *                   example: true
 *                 database:
 *                   type: string
 *                   example: connected
 *       503:
 *         description: Service is not ready
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ready:
 *                   type: boolean
 *                   example: false
 *                 database:
 *                   type: string
 *                   example: disconnected
 *                 error:
 *                   type: string
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
 * Dashboard uses this to validate key before entering
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
