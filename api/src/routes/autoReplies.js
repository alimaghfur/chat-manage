const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * @swagger
 * /api/auto-replies/{sessionId}:
 *   get:
 *     summary: List auto-replies for a session
 *     description: Retrieve all auto-reply rules for a given session
 *     tags: [Auto Replies]
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
 *         description: List of auto-reply rules
 */
router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const autoReplies = await prisma.autoReply.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: autoReplies });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


/**
 * @swagger
 * /api/auto-replies:
 *   post:
 *     summary: Create an auto-reply rule
 *     description: Create a new auto-reply rule for a session
 *     tags: [Auto Replies]
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
 *               - trigger
 *               - response
 *               - matchType
 *             properties:
 *               sessionId:
 *                 type: string
 *               trigger:
 *                 type: string
 *                 example: "hello"
 *               response:
 *                 type: string
 *                 example: "Hi! How can I help you?"
 *               matchType:
 *                 type: string
 *                 enum: [exact, contains, startsWith, regex]
 *                 example: "contains"
 *     responses:
 *       201:
 *         description: Auto-reply rule created
 *       400:
 *         description: Validation error
 */
router.post('/', async (req, res) => {
  try {
    const { sessionId, trigger, response, matchType } = req.body;

    if (!sessionId || !trigger || !response || !matchType) {
      return res.status(400).json({
        success: false,
        error: 'sessionId, trigger, response, and matchType are required',
      });
    }

    const validMatchTypes = ['exact', 'contains', 'startsWith', 'regex'];
    if (!validMatchTypes.includes(matchType)) {
      return res.status(400).json({
        success: false,
        error: `matchType must be one of: ${validMatchTypes.join(', ')}`,
      });
    }

    // Verify session exists
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    const autoReply = await prisma.autoReply.create({
      data: {
        sessionId,
        trigger,
        response,
        matchType,
      },
    });

    res.status(201).json({ success: true, data: autoReply });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


// PUT /:id - Update auto-reply
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { trigger, response, matchType } = req.body;

    const autoReply = await prisma.autoReply.findUnique({ where: { id } });
    if (!autoReply) {
      return res.status(404).json({ success: false, error: 'Auto-reply not found' });
    }

    const updateData = {};
    if (trigger !== undefined) updateData.trigger = trigger;
    if (response !== undefined) updateData.response = response;
    if (matchType !== undefined) {
      const validMatchTypes = ['exact', 'contains', 'startsWith', 'regex'];
      if (!validMatchTypes.includes(matchType)) {
        return res.status(400).json({
          success: false,
          error: `matchType must be one of: ${validMatchTypes.join(', ')}`,
        });
      }
      updateData.matchType = matchType;
    }

    const updated = await prisma.autoReply.update({
      where: { id },
      data: updateData,
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /:id - Delete auto-reply
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const autoReply = await prisma.autoReply.findUnique({ where: { id } });
    if (!autoReply) {
      return res.status(404).json({ success: false, error: 'Auto-reply not found' });
    }

    await prisma.autoReply.delete({ where: { id } });

    res.json({ success: true, message: 'Auto-reply deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/auto-replies/{id}/toggle:
 *   patch:
 *     summary: Toggle auto-reply active/inactive
 *     description: Toggle the active status of an auto-reply rule
 *     tags: [Auto Replies]
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
 *         description: Auto-reply toggled
 *       404:
 *         description: Auto-reply not found
 */
router.patch('/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;

    const autoReply = await prisma.autoReply.findUnique({ where: { id } });
    if (!autoReply) {
      return res.status(404).json({ success: false, error: 'Auto-reply not found' });
    }

    const updated = await prisma.autoReply.update({
      where: { id },
      data: { isActive: !autoReply.isActive },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
