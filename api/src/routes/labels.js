const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * @swagger
 * /api/labels/{sessionId}:
 *   get:
 *     summary: List labels for a session
 *     description: Retrieve all labels associated with a WhatsApp session
 *     tags: [Labels]
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
 *         description: List of labels
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
 *                       color:
 *                         type: string
 *                       chatJids:
 *                         type: array
 *                         items:
 *                           type: string
 */
router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const labels = await prisma.label.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });

    const data = labels.map((label) => ({
      ...label,
      chatJids: JSON.parse(label.chatJids || '[]'),
    }));

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/labels/{sessionId}:
 *   post:
 *     summary: Create a label
 *     description: Create a new label for organizing chats
 *     tags: [Labels]
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
 *             properties:
 *               name:
 *                 type: string
 *                 example: "VIP Customers"
 *               color:
 *                 type: string
 *                 example: "#FF5733"
 *     responses:
 *       201:
 *         description: Label created
 *       400:
 *         description: Validation error
 */
router.post('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { name, color } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    // Verify session exists
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    const label = await prisma.label.create({
      data: {
        sessionId,
        name,
        color: color || '#25D366',
      },
    });

    res.status(201).json({ success: true, data: label });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /:id - Update label
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, color } = req.body;

    const label = await prisma.label.findUnique({ where: { id } });
    if (!label) {
      return res.status(404).json({ success: false, error: 'Label not found' });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (color !== undefined) updateData.color = color;

    const updated = await prisma.label.update({
      where: { id },
      data: updateData,
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /:id - Delete label
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const label = await prisma.label.findUnique({ where: { id } });
    if (!label) {
      return res.status(404).json({ success: false, error: 'Label not found' });
    }

    await prisma.label.delete({ where: { id } });

    res.json({ success: true, message: 'Label deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/labels/{id}/assign:
 *   post:
 *     summary: Assign chats to a label
 *     description: Assign one or more chat JIDs to a label
 *     tags: [Labels]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *               - jids
 *             properties:
 *               jids:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["5511999999999@s.whatsapp.net"]
 *     responses:
 *       200:
 *         description: Chats assigned to label
 *       404:
 *         description: Label not found
 */
router.post('/:id/assign', async (req, res) => {
  try {
    const { id } = req.params;
    const { jids } = req.body;

    if (!jids || !Array.isArray(jids)) {
      return res.status(400).json({ success: false, error: 'jids (array) is required' });
    }

    const label = await prisma.label.findUnique({ where: { id } });
    if (!label) {
      return res.status(404).json({ success: false, error: 'Label not found' });
    }

    // Merge existing JIDs with new ones (no duplicates)
    const existingJids = JSON.parse(label.chatJids || '[]');
    const mergedJids = [...new Set([...existingJids, ...jids])];

    const updated = await prisma.label.update({
      where: { id },
      data: { chatJids: JSON.stringify(mergedJids) },
    });

    res.json({
      success: true,
      data: {
        ...updated,
        chatJids: mergedJids,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
