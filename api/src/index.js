require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const http = require('http');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');

const { setupSwagger } = require('./config/swagger');
const { rateLimiter } = require('./middleware/rateLimiter');
const { authMiddleware } = require('./middleware/auth');
const { auditMiddleware } = require('./middleware/audit');
const { errorHandler } = require('./middleware/errorHandler');
const { initializeSocket } = require('./socket');
const { reconnectAllSessions } = require('./services/platforms');

// Routes
const sessionRoutes = require('./routes/sessions');
const messageRoutes = require('./routes/messages');
const contactRoutes = require('./routes/contacts');
const groupRoutes = require('./routes/groups');
const labelRoutes = require('./routes/labels');
const webhookRoutes = require('./routes/webhooks');
const broadcastRoutes = require('./routes/broadcasts');
const autoReplyRoutes = require('./routes/autoReplies');
const apiKeyRoutes = require('./routes/apiKeys');
const auditRoutes = require('./routes/audit');
const healthRoutes = require('./routes/health');
const migrationRoutes = require('./routes/migration');
const webhookReceiverRoutes = require('./routes/webhook-receiver');

const app = express();
const server = http.createServer(app);
const prisma = new PrismaClient();

const io = new Server(server, {
  cors: {
    origin: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  },
});

// Global middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({
  origin: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Make io and prisma available to routes
app.set('io', io);
app.set('prisma', prisma);

// Swagger docs (no auth)
setupSwagger(app);

// Health (no auth)
app.use('/api/health', healthRoutes);

// Webhook receiver (NO auth - platforms need direct access)
app.use('/webhook', webhookReceiverRoutes);

// API routes with auth
app.use('/api/keys', authMiddleware('master'), apiKeyRoutes);
app.use('/api/sessions', authMiddleware(), rateLimiter, auditMiddleware, sessionRoutes);
app.use('/api/messages', authMiddleware(), rateLimiter, auditMiddleware, messageRoutes);
app.use('/api/contacts', authMiddleware(), rateLimiter, auditMiddleware, contactRoutes);
app.use('/api/groups', authMiddleware(), rateLimiter, auditMiddleware, groupRoutes);
app.use('/api/labels', authMiddleware(), rateLimiter, auditMiddleware, labelRoutes);
app.use('/api/webhooks', authMiddleware(), rateLimiter, auditMiddleware, webhookRoutes);
app.use('/api/broadcasts', authMiddleware(), rateLimiter, auditMiddleware, broadcastRoutes);
app.use('/api/auto-replies', authMiddleware(), rateLimiter, auditMiddleware, autoReplyRoutes);
app.use('/api/audit', authMiddleware(), auditRoutes);
app.use('/api/migration', authMiddleware('master'), migrationRoutes);

// Error handler
app.use(errorHandler);

// Socket.IO
initializeSocket(io);

const PORT = process.env.PORT || 3001;
server.listen(PORT, process.env.HOST || '0.0.0.0', async () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║       MULTI-PLATFORM CHAT MANAGER v4.0          ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Server:    http://localhost:${PORT}                ║`);
  console.log(`║  API Docs:  http://localhost:${PORT}/api-docs       ║`);
  console.log(`║  Webhook:   http://localhost:${PORT}/webhook        ║`);
  console.log('╠══════════════════════════════════════════════════╣');
  console.log('║  Platforms: WhatsApp (QR/Pairing/API)           ║');
  console.log('║             Telegram (Phone + OTP)              ║');
  console.log('║             Instagram (Login)                   ║');
  console.log('║             Messenger (Login/Cookies)           ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');

  // Reconnect all previously connected sessions
  try {
    await reconnectAllSessions(io);
  } catch (err) {
    console.error('Error reconnecting sessions:', err.message);
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await prisma.$disconnect();
  server.close();
  process.exit(0);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});
