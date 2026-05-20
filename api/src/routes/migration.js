const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * @swagger
 * /api/migration/export:
 *   post:
 *     summary: Export all data
 *     description: Export all application data as a JSON object for backup or migration
 *     tags: [Migration]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Full data export
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     exportedAt:
 *                       type: string
 *                     version:
 *                       type: string
 *                     sessions:
 *                       type: array
 *                     contacts:
 *                       type: array
 *                     messages:
 *                       type: array
 *                     groups:
 *                       type: array
 *                     labels:
 *                       type: array
 *                     webhooks:
 *                       type: array
 *                     autoReplies:
 *                       type: array
 *                     broadcasts:
 *                       type: array
 */
router.post('/export', async (req, res) => {
  try {
    const [sessions, contacts, messages, groups, labels, webhooks, autoReplies, broadcasts] =
      await Promise.all([
        prisma.session.findMany(),
        prisma.contact.findMany(),
        prisma.message.findMany(),
        prisma.group.findMany(),
        prisma.label.findMany(),
        prisma.webhook.findMany(),
        prisma.autoReply.findMany(),
        prisma.broadcast.findMany(),
      ]);

    res.json({
      success: true,
      data: {
        exportedAt: new Date().toISOString(),
        version: '2.0.0',
        sessions,
        contacts,
        messages,
        groups,
        labels,
        webhooks,
        autoReplies,
        broadcasts,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


/**
 * @swagger
 * /api/migration/import:
 *   post:
 *     summary: Import data from JSON
 *     description: Import application data from a JSON body (overwrites existing data)
 *     tags: [Migration]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sessions:
 *                 type: array
 *               contacts:
 *                 type: array
 *               messages:
 *                 type: array
 *               groups:
 *                 type: array
 *               labels:
 *                 type: array
 *               webhooks:
 *                 type: array
 *               autoReplies:
 *                 type: array
 *               broadcasts:
 *                 type: array
 *     responses:
 *       200:
 *         description: Data imported successfully
 *       400:
 *         description: Invalid import data
 */
router.post('/import', async (req, res) => {
  try {
    const { sessions, contacts, messages, groups, labels, webhooks, autoReplies, broadcasts } =
      req.body;

    const results = { imported: {}, errors: [] };

    // Import in order (respecting foreign keys)
    if (sessions && Array.isArray(sessions)) {
      try {
        for (const session of sessions) {
          await prisma.session.upsert({
            where: { id: session.id },
            update: session,
            create: session,
          });
        }
        results.imported.sessions = sessions.length;
      } catch (err) {
        results.errors.push({ entity: 'sessions', error: err.message });
      }
    }

    if (contacts && Array.isArray(contacts)) {
      try {
        for (const contact of contacts) {
          await prisma.contact.upsert({
            where: { id: contact.id },
            update: contact,
            create: contact,
          });
        }
        results.imported.contacts = contacts.length;
      } catch (err) {
        results.errors.push({ entity: 'contacts', error: err.message });
      }
    }

    if (messages && Array.isArray(messages)) {
      try {
        for (const message of messages) {
          await prisma.message.upsert({
            where: { id: message.id },
            update: message,
            create: message,
          });
        }
        results.imported.messages = messages.length;
      } catch (err) {
        results.errors.push({ entity: 'messages', error: err.message });
      }
    }

    if (groups && Array.isArray(groups)) {
      try {
        for (const group of groups) {
          await prisma.group.upsert({
            where: { id: group.id },
            update: group,
            create: group,
          });
        }
        results.imported.groups = groups.length;
      } catch (err) {
        results.errors.push({ entity: 'groups', error: err.message });
      }
    }

    if (labels && Array.isArray(labels)) {
      try {
        for (const label of labels) {
          await prisma.label.upsert({
            where: { id: label.id },
            update: label,
            create: label,
          });
        }
        results.imported.labels = labels.length;
      } catch (err) {
        results.errors.push({ entity: 'labels', error: err.message });
      }
    }

    if (webhooks && Array.isArray(webhooks)) {
      try {
        for (const webhook of webhooks) {
          await prisma.webhook.upsert({
            where: { id: webhook.id },
            update: webhook,
            create: webhook,
          });
        }
        results.imported.webhooks = webhooks.length;
      } catch (err) {
        results.errors.push({ entity: 'webhooks', error: err.message });
      }
    }

    if (autoReplies && Array.isArray(autoReplies)) {
      try {
        for (const ar of autoReplies) {
          await prisma.autoReply.upsert({
            where: { id: ar.id },
            update: ar,
            create: ar,
          });
        }
        results.imported.autoReplies = autoReplies.length;
      } catch (err) {
        results.errors.push({ entity: 'autoReplies', error: err.message });
      }
    }

    if (broadcasts && Array.isArray(broadcasts)) {
      try {
        for (const broadcast of broadcasts) {
          await prisma.broadcast.upsert({
            where: { id: broadcast.id },
            update: broadcast,
            create: broadcast,
          });
        }
        results.imported.broadcasts = broadcasts.length;
      } catch (err) {
        results.errors.push({ entity: 'broadcasts', error: err.message });
      }
    }

    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


/**
 * @swagger
 * /api/migration/export/sessions:
 *   post:
 *     summary: Export sessions only
 *     description: Export only session data for selective migration
 *     tags: [Migration]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Sessions exported
 */
router.post('/export/sessions', async (req, res) => {
  try {
    const sessions = await prisma.session.findMany({
      include: {
        contacts: true,
        messages: { take: 100, orderBy: { timestamp: 'desc' } },
        groups: true,
        labels: true,
        autoReplies: true,
        broadcasts: true,
      },
    });

    res.json({
      success: true,
      data: {
        exportedAt: new Date().toISOString(),
        version: '2.0.0',
        sessions,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /import/sessions - Import sessions
router.post('/import/sessions', async (req, res) => {
  try {
    const { sessions } = req.body;

    if (!sessions || !Array.isArray(sessions)) {
      return res.status(400).json({
        success: false,
        error: 'sessions (array) is required in request body',
      });
    }

    const results = { imported: 0, errors: [] };

    for (const sessionData of sessions) {
      try {
        const { contacts, messages, groups, labels, autoReplies, broadcasts, ...session } =
          sessionData;

        // Import session
        await prisma.session.upsert({
          where: { id: session.id },
          update: {
            name: session.name,
            phone: session.phone,
            status: 'disconnected',
            proxyUrl: session.proxyUrl,
            webhookUrl: session.webhookUrl,
          },
          create: {
            ...session,
            status: 'disconnected',
          },
        });

        // Import related data if present
        if (contacts && Array.isArray(contacts)) {
          for (const contact of contacts) {
            await prisma.contact.upsert({
              where: { id: contact.id },
              update: contact,
              create: contact,
            }).catch(() => {});
          }
        }

        if (groups && Array.isArray(groups)) {
          for (const group of groups) {
            await prisma.group.upsert({
              where: { id: group.id },
              update: group,
              create: group,
            }).catch(() => {});
          }
        }

        if (labels && Array.isArray(labels)) {
          for (const label of labels) {
            await prisma.label.upsert({
              where: { id: label.id },
              update: label,
              create: label,
            }).catch(() => {});
          }
        }

        if (autoReplies && Array.isArray(autoReplies)) {
          for (const ar of autoReplies) {
            await prisma.autoReply.upsert({
              where: { id: ar.id },
              update: ar,
              create: ar,
            }).catch(() => {});
          }
        }

        results.imported++;
      } catch (err) {
        results.errors.push({ sessionId: sessionData.id, error: err.message });
      }
    }

    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
