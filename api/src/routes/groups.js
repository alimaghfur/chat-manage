const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { getSession, isSessionConnected, sendTextMessage } = require('../services/whatsapp');

const prisma = new PrismaClient();

/**
 * @swagger
 * /api/groups/{sessionId}:
 *   get:
 *     summary: List groups for a session
 *     description: Retrieve all groups associated with a WhatsApp session
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
 *     description: Get detailed information about a specific group
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

    // Try to fetch live data from WhatsApp
    const session = getSession(sessionId);
    if (session && session.sock) {
      try {
        const metadata = await session.sock.groupMetadata(groupJid);
        // Update DB with latest info
        await prisma.group.upsert({
          where: { sessionId_jid: { sessionId, jid: groupJid } },
          update: {
            name: metadata.subject,
            description: metadata.desc || null,
            participants: JSON.stringify(metadata.participants.map((p) => p.id)),
            admins: JSON.stringify(
              metadata.participants.filter((p) => p.admin).map((p) => p.id)
            ),
            owner: metadata.owner || null,
          },
          create: {
            sessionId,
            jid: groupJid,
            name: metadata.subject,
            description: metadata.desc || null,
            participants: JSON.stringify(metadata.participants.map((p) => p.id)),
            admins: JSON.stringify(
              metadata.participants.filter((p) => p.admin).map((p) => p.id)
            ),
            owner: metadata.owner || null,
          },
        });

        return res.json({
          success: true,
          data: {
            jid: groupJid,
            name: metadata.subject,
            description: metadata.desc,
            participants: metadata.participants,
            owner: metadata.owner,
            creation: metadata.creation,
            size: metadata.size,
          },
        });
      } catch (err) {
        // Fall through to DB lookup
      }
    }

    // Fallback to DB
    const group = await prisma.group.findUnique({
      where: { sessionId_jid: { sessionId, jid: groupJid } },
    });

    if (!group) {
      return res.status(404).json({ success: false, error: 'Group not found' });
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
 *     description: Create a new WhatsApp group
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
 *                 example: ["5511999999999@s.whatsapp.net"]
 *     responses:
 *       201:
 *         description: Group created
 *       400:
 *         description: Validation error
 *       404:
 *         description: Session not connected
 */
router.post('/:sessionId/create', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { name, participants } = req.body;

    if (!name || !participants || !Array.isArray(participants)) {
      return res.status(400).json({
        success: false,
        error: 'name and participants (array) are required',
      });
    }

    const session = getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or not connected',
      });
    }

    const result = await session.sock.groupCreate(name, participants);

    // Save to database
    const group = await prisma.group.create({
      data: {
        sessionId,
        jid: result.id,
        name: result.subject || name,
        participants: JSON.stringify(participants),
        owner: result.owner || null,
      },
    });

    res.status(201).json({ success: true, data: { group, whatsappResult: result } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /:sessionId/:groupJid/add - Add participants to group
router.post('/:sessionId/:groupJid/add', async (req, res) => {
  try {
    const { sessionId, groupJid } = req.params;
    const { participants } = req.body;

    if (!participants || !Array.isArray(participants)) {
      return res.status(400).json({
        success: false,
        error: 'participants (array) is required',
      });
    }

    const session = getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or not connected',
      });
    }

    const result = await session.sock.groupParticipantsUpdate(groupJid, participants, 'add');

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /:sessionId/:groupJid/remove - Remove participants from group
router.post('/:sessionId/:groupJid/remove', async (req, res) => {
  try {
    const { sessionId, groupJid } = req.params;
    const { participants } = req.body;

    if (!participants || !Array.isArray(participants)) {
      return res.status(400).json({
        success: false,
        error: 'participants (array) is required',
      });
    }

    const session = getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or not connected',
      });
    }

    const result = await session.sock.groupParticipantsUpdate(groupJid, participants, 'remove');

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /:sessionId/:groupJid/message - Send message to group
router.post('/:sessionId/:groupJid/message', async (req, res) => {
  try {
    const { sessionId, groupJid } = req.params;
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ success: false, error: 'text is required' });
    }

    if (!isSessionConnected(sessionId)) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or not connected',
      });
    }

    const result = await sendTextMessage(sessionId, groupJid, text);

    res.json({ success: true, data: { whatsappResult: result.key } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /:sessionId/:groupJid - Update group (name, description)
router.patch('/:sessionId/:groupJid', async (req, res) => {
  try {
    const { sessionId, groupJid } = req.params;
    const { name, description } = req.body;

    const session = getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or not connected',
      });
    }

    if (name) {
      await session.sock.groupUpdateSubject(groupJid, name);
    }

    if (description !== undefined) {
      await session.sock.groupUpdateDescription(groupJid, description);
    }

    // Update in DB
    const updateData = {};
    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;

    await prisma.group.updateMany({
      where: { sessionId, jid: groupJid },
      data: updateData,
    });

    res.json({ success: true, message: 'Group updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
