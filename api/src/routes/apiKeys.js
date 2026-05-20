const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

/**
 * @swagger
 * /api/keys:
 *   get:
 *     summary: List all API keys
 *     description: Retrieve all API keys with masked values
 *     tags: [API Keys]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of API keys (masked)
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
 *                       key:
 *                         type: string
 *                         example: "wk_****abcd"
 *                       permissions:
 *                         type: string
 *                       isActive:
 *                         type: boolean
 */
router.get('/', async (req, res) => {
  try {
    const keys = await prisma.apiKey.findMany({
      orderBy: { createdAt: 'desc' },
    });

    // Mask the keys
    const data = keys.map((key) => ({
      ...key,
      key: `${key.key.substring(0, 4)}****${key.key.slice(-4)}`,
    }));

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


/**
 * @swagger
 * /api/keys:
 *   post:
 *     summary: Generate a new API key
 *     description: Create a new API key with optional permissions, CIDR whitelist, and rate limit
 *     tags: [API Keys]
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
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Production Key"
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["messages.send", "sessions.read"]
 *               cidrWhitelist:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["192.168.1.0/24"]
 *               rateLimit:
 *                 type: integer
 *                 example: 100
 *                 description: Requests per minute
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: API key created (full key shown only once)
 *       400:
 *         description: Validation error
 */
router.post('/', async (req, res) => {
  try {
    const { name, permissions, cidrWhitelist, rateLimit, expiresAt } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    // Generate a secure API key
    const key = `wk_${crypto.randomBytes(32).toString('hex')}`;

    const apiKey = await prisma.apiKey.create({
      data: {
        name,
        key,
        permissions: permissions ? JSON.stringify(permissions) : '*',
        cidrWhitelist: cidrWhitelist ? JSON.stringify(cidrWhitelist) : null,
        rateLimit: rateLimit || 100,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });

    // Return full key only on creation
    res.status(201).json({
      success: true,
      data: apiKey,
      warning: 'Store this key securely. It will not be shown in full again.',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


// DELETE /:id - Revoke API key
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const apiKey = await prisma.apiKey.findUnique({ where: { id } });
    if (!apiKey) {
      return res.status(404).json({ success: false, error: 'API key not found' });
    }

    await prisma.apiKey.update({
      where: { id },
      data: { isActive: false },
    });

    res.json({ success: true, message: 'API key revoked' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/keys/{id}:
 *   patch:
 *     summary: Update API key settings
 *     description: Update an API key's name, permissions, CIDR whitelist, or rate limit
 *     tags: [API Keys]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *               cidrWhitelist:
 *                 type: array
 *                 items:
 *                   type: string
 *               rateLimit:
 *                 type: integer
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: API key updated
 *       404:
 *         description: API key not found
 */
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, permissions, cidrWhitelist, rateLimit, isActive } = req.body;

    const apiKey = await prisma.apiKey.findUnique({ where: { id } });
    if (!apiKey) {
      return res.status(404).json({ success: false, error: 'API key not found' });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (permissions !== undefined) updateData.permissions = JSON.stringify(permissions);
    if (cidrWhitelist !== undefined) updateData.cidrWhitelist = JSON.stringify(cidrWhitelist);
    if (rateLimit !== undefined) updateData.rateLimit = rateLimit;
    if (isActive !== undefined) updateData.isActive = isActive;

    const updated = await prisma.apiKey.update({
      where: { id },
      data: updateData,
    });

    res.json({
      success: true,
      data: {
        ...updated,
        key: `${updated.key.substring(0, 4)}****${updated.key.slice(-4)}`,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
