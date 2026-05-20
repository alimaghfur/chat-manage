const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

const prisma = new PrismaClient();

/**
 * @swagger
 * /api/webhooks:
 *   get:
 *     summary: List all webhooks
 *     description: Retrieve all configured webhooks
 *     tags: [Webhooks]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of webhooks
 */
router.get('/', async (req, res) => {
  try {
    const webhooks = await prisma.webhook.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const data = webhooks.map((wh) => ({
      ...wh,
      events: JSON.parse(wh.events === '*' ? '"*"' : wh.events),
      secret: wh.secret ? '***' : null,
    }));

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


/**
 * @swagger
 * /api/webhooks:
 *   post:
 *     summary: Create a webhook
 *     description: Register a new webhook endpoint
 *     tags: [Webhooks]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *             properties:
 *               url:
 *                 type: string
 *                 example: "https://example.com/webhook"
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["message", "status", "connection"]
 *               secret:
 *                 type: string
 *                 description: HMAC secret for payload signing
 *     responses:
 *       201:
 *         description: Webhook created
 *       400:
 *         description: Validation error
 */
router.post('/', async (req, res) => {
  try {
    const { url, events, secret } = req.body;

    if (!url) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }

    const webhook = await prisma.webhook.create({
      data: {
        url,
        events: events ? JSON.stringify(events) : '*',
        secret: secret || null,
      },
    });

    res.status(201).json({ success: true, data: webhook });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


// PUT /:id - Update webhook
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { url, events, secret, isActive } = req.body;

    const webhook = await prisma.webhook.findUnique({ where: { id } });
    if (!webhook) {
      return res.status(404).json({ success: false, error: 'Webhook not found' });
    }

    const updateData = {};
    if (url !== undefined) updateData.url = url;
    if (events !== undefined) updateData.events = JSON.stringify(events);
    if (secret !== undefined) updateData.secret = secret;
    if (isActive !== undefined) updateData.isActive = isActive;

    const updated = await prisma.webhook.update({
      where: { id },
      data: updateData,
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /:id - Delete webhook
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const webhook = await prisma.webhook.findUnique({ where: { id } });
    if (!webhook) {
      return res.status(404).json({ success: false, error: 'Webhook not found' });
    }

    await prisma.webhook.delete({ where: { id } });

    res.json({ success: true, message: 'Webhook deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


/**
 * @swagger
 * /api/webhooks/{id}/test:
 *   post:
 *     summary: Test a webhook
 *     description: Send a test payload to the webhook URL
 *     tags: [Webhooks]
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
 *         description: Test result
 *       404:
 *         description: Webhook not found
 */
router.post('/:id/test', async (req, res) => {
  try {
    const { id } = req.params;

    const webhook = await prisma.webhook.findUnique({ where: { id } });
    if (!webhook) {
      return res.status(404).json({ success: false, error: 'Webhook not found' });
    }

    const testPayload = {
      event: 'test',
      timestamp: new Date().toISOString(),
      data: {
        message: 'This is a test webhook payload',
        webhookId: id,
      },
    };

    try {
      const response = await axios.post(webhook.url, testPayload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      });

      await prisma.webhook.update({
        where: { id },
        data: { lastStatus: response.status, lastError: null },
      });

      res.json({
        success: true,
        data: {
          statusCode: response.status,
          responseTime: response.headers['x-response-time'] || null,
        },
      });
    } catch (err) {
      await prisma.webhook.update({
        where: { id },
        data: {
          lastStatus: err.response?.status || null,
          lastError: err.message,
        },
      });

      res.json({
        success: false,
        error: 'Webhook test failed',
        details: {
          statusCode: err.response?.status || null,
          message: err.message,
        },
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
