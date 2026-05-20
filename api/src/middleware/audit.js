const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Audit logging middleware
 * Logs API requests to the AuditLog table after the response is sent
 */
function auditMiddleware(req, res, next) {
  // Capture the original end method
  const originalEnd = res.end;

  res.end = function (...args) {
    // Restore original end
    res.end = originalEnd;
    res.end(...args);

    // Log asynchronously after response is sent
    const action = `${req.method} ${req.path}`;
    const ip =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.connection?.remoteAddress ||
      req.ip;
    const userAgent = req.headers['user-agent'] || null;
    const apiKeyId = req.apiKey?.id && req.apiKey.id !== 'master' ? req.apiKey.id : null;
    const statusCode = res.statusCode;

    prisma.auditLog
      .create({
        data: {
          action,
          ip,
          userAgent,
          apiKeyId,
          statusCode,
        },
      })
      .catch((err) => {
        console.error('Failed to write audit log:', err.message);
      });
  };

  next();
}

module.exports = { auditMiddleware };
