const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { sendTextMessage, sendMediaMessage, isSessionConnected } = require('../services/whatsapp');

const prisma = new PrismaClient();

/**
 * @swagger
 * /api/broadcasts/{sessionId}:
 *   get:
 *     summary: List broadcasts for a session
 *     description: Retrieve all broadcasts for a given session
 *     tags: [Broadcasts]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of broadcasts
 */
router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const broadcasts = await prisma.broadcast.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });

    const data = broadcasts.map((b) => ({
      ...b,
      recipients: JSON.parse(b.recipients || '[]'),
    }));

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


/**
 * @swagger
 * /api/broadcasts:
 *   post:
 *     summary: Create and start a broadcast
 *     description: Create a new broadcast campaign and begin sending messages
 *     tags: [Broadcasts]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sessionId
 *               - name
 *               - message
 *               - recipients
 *             properties:
 *               sessionId:
 *                 type: string
 *               name:
 *                 type: string
 *                 example: "Promo Campaign"
 *               message:
 *                 type: string
 *               recipients:
 *                 type: array
 *                 items:
 *                   type: string
 *               mediaUrl:
 *                 type: string
 *               delay:
 *                 type: integer
 *                 default: 2000
 *                 description: Delay between messages in ms
 *     responses:
 *       201:
 *         description: Broadcast created and started
 *       400:
 *         description: Validation error
 */
router.post('/', async (req, res) => {
  try {
    const { sessionId, name, message, recipients, mediaUrl, delay = 2000 } = req.body;

    if (!sessionId || !name || !message || !recipients || !Array.isArray(recipients)) {
      return res.status(400).json({
        success: false,
        error: 'sessionId, name, message, and recipients (array) are required',
      });
    }

    if (!isSessionConnected(sessionId)) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or not connected',
      });
    }

    // Create broadcast record
    const broadcast = await prisma.broadcast.create({
      data: {
        sessionId,
        name,
        message,
        mediaUrl: mediaUrl || null,
        recipients: JSON.stringify(recipients),
        status: 'sending',
        totalCount: recipients.length,
        delay,
      },
    });

    // Start sending in background
    (async () => {
      let sentCount = 0;
      let failCount = 0;

      for (const recipient of recipients) {
        try {
          if (mediaUrl) {
            await sendMediaMessage(sessionId, recipient, 'image', mediaUrl, message);
          } else {
            await sendTextMessage(sessionId, recipient, message);
          }
          sentCount++;
        } catch (err) {
          failCount++;
        }

        // Update progress
        await prisma.broadcast.update({
          where: { id: broadcast.id },
          data: { sentCount, failCount },
        }).catch(() => {});

        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      // Mark as completed
      await prisma.broadcast.update({
        where: { id: broadcast.id },
        data: {
          status: failCount === recipients.length ? 'failed' : 'completed',
          sentCount,
          failCount,
        },
      }).catch(() => {});
    })();

    res.status(201).json({
      success: true,
      data: {
        ...broadcast,
        recipients: JSON.parse(broadcast.recipients),
        estimatedTime: `${(recipients.length * delay) / 1000}s`,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


/**
 * @swagger
 * /api/broadcasts/{id}/status:
 *   get:
 *     summary: Get broadcast status
 *     description: Get the current status and progress of a broadcast
 *     tags: [Broadcasts]
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
 *         description: Broadcast status
 *       404:
 *         description: Broadcast not found
 */
router.get('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;

    const broadcast = await prisma.broadcast.findUnique({ where: { id } });
    if (!broadcast) {
      return res.status(404).json({ success: false, error: 'Broadcast not found' });
    }

    res.json({
      success: true,
      data: {
        id: broadcast.id,
        name: broadcast.name,
        status: broadcast.status,
        sentCount: broadcast.sentCount,
        failCount: broadcast.failCount,
        totalCount: broadcast.totalCount,
        progress: broadcast.totalCount > 0
          ? Math.round(((broadcast.sentCount + broadcast.failCount) / broadcast.totalCount) * 100)
          : 0,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /:id - Delete broadcast
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const broadcast = await prisma.broadcast.findUnique({ where: { id } });
    if (!broadcast) {
      return res.status(404).json({ success: false, error: 'Broadcast not found' });
    }

    await prisma.broadcast.delete({ where: { id } });

    res.json({ success: true, message: 'Broadcast deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
