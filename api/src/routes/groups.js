const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { isSessionConnected, sendTextMessage } = require('../services/whatsapp');

const prisma = new PrismaClient();

/**
 * @swagger
 * /api/groups/{sessionId}:
 *   get:
 *     summary: List groups for a session
 *     description: Retrieve all groups associated with a WhatsApp session (from database)
 *     tags: [Groups]
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
 *         description: List of groups
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
 *                       jid:
 *                         type: string
 *                       name:
 *                         type: string
 *                       participants:
 *                         type: string
 */
router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const groups = await prisma.group.findMany({
      where: { sessionId },
      orderBy: { updatedAt: 'desc' },
    });

    const data = groups.map((group) => ({
      ...group,
      participants: JSON.parse(group.participants || '[]'),
      admins: JSON.parse(group.admins || '[]'),
    }));

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/groups/{sessionId}/{groupJid}:
 *   get:
 *     summary: Get group info
 *     description: Get detailed information about a specific group (from database)
 *     tags: [Groups]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: groupJid
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Group details
 *       404:
 *         description: Group not found
 */
router.get('/:sessionId/:groupJid', async (req, res) => {
  try {
    const { sessionId, groupJid } = req.params;

    // Cloud API does not support direct group metadata fetching
    // We rely on database records populated via webhooks
    const group = await prisma.group.findUnique({
      where: { sessionId_jid: { sessionId, jid: groupJid } },
    });

    if (!group) {
      return res.status(404).json({ 
        success: false, 
        error: 'Group not found in database. Groups are populated via incoming webhook events.' 
      });
    }

    res.json({
      success: true,
      data: {
        ...group,
        participants: JSON.parse(group.participants || '[]'),
        admins: JSON.parse(group.admins || '[]'),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/groups/{sessionId}/create:
 *   post:
 *     summary: Create a new group
 *     description: Note - WhatsApp Cloud API does not currently support group creation via API. This endpoint is a placeholder.
 *     tags: [Groups]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - participants
 *             properties:
 *               name:
 *                 type: string
 *                 example: "My Group"
 *               participants:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["5511999999999"]
 *     responses:
 *       501:
 *         description: Not implemented - Cloud API limitation
 */
router.post('/:sessionId/create', async (req, res) => {
  // WhatsApp Cloud API does not support creating groups programmatically
  res.status(501).json({
    success: false,
    error: 'Group creation is not supported by WhatsApp Cloud API. Create groups manually via WhatsApp app.',
  });
});

// POST /:sessionId/:groupJid/add - Add participants to group
router.post('/:sessionId/:groupJid/add', async (req, res) => {
  // WhatsApp Cloud API does not support modifying group participants programmatically
  res.status(501).json({
    success: false,
    error: 'Adding group participants is not supported by WhatsApp Cloud API. Manage participants via WhatsApp app.',
  });
});

// POST /:sessionId/:groupJid/remove - Remove participants from group
router.post('/:sessionId/:groupJid/remove', async (req, res) => {
  // WhatsApp Cloud API does not support modifying group participants programmatically
  res.status(501).json({
    success: false,
    error: 'Removing group participants is not supported by WhatsApp Cloud API. Manage participants via WhatsApp app.',
  });
});

// POST /:sessionId/:groupJid/message - Send message to group
router.post('/:sessionId/:groupJid/message', async (req, res) => {
  try {
    const { sessionId, groupJid } = req.params;
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ success: false, error: 'text is required' });
    }

    if (!await isSessionConnected(sessionId)) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or not connected',
      });
    }

    // Send text message to group JID
    const result = await sendTextMessage(sessionId, groupJid, text);

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /:sessionId/:groupJid - Update group (name, description)
router.patch('/:sessionId/:groupJid', async (req, res) => {
  // WhatsApp Cloud API does not support updating group metadata programmatically
  res.status(501).json({
    success: false,
    error: 'Updating group metadata is not supported by WhatsApp Cloud API. Update via WhatsApp app.',
  });
});

module.exports = router;

module.exports = router;
