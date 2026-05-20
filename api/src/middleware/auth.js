const { PrismaClient } = require('@prisma/client');
const net = require('net');

const prisma = new PrismaClient();

/**
 * Check if an IP address falls within a CIDR range
 * @param {string} ip - The IP address to check
 * @param {string} cidr - The CIDR notation (e.g., "192.168.1.0/24")
 * @returns {boolean}
 */
function isIpInCidr(ip, cidr) {
  const [range, bits] = cidr.split('/');
  const mask = ~(2 ** (32 - parseInt(bits, 10)) - 1);
  const ipNum = ipToNumber(ip);
  const rangeNum = ipToNumber(range);
  return (ipNum & mask) === (rangeNum & mask);
}

/**
 * Convert IP address string to a 32-bit number
 * @param {string} ip
 * @returns {number}
 */
function ipToNumber(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

/**
 * Validate IP against a CIDR whitelist
 * @param {string} ip - Client IP address
 * @param {string|null} cidrWhitelist - JSON array of CIDR strings or null
 * @returns {boolean}
 */
function validateCidr(ip, cidrWhitelist) {
  if (!cidrWhitelist) {
    return true; // No whitelist means allow all
  }

  try {
    const allowedCidrs = JSON.parse(cidrWhitelist);
    if (!Array.isArray(allowedCidrs) || allowedCidrs.length === 0) {
      return true; // Empty array means allow all
    }

    // Handle IPv6-mapped IPv4 addresses
    const normalizedIp = ip.replace(/^::ffff:/, '');

    return allowedCidrs.some((cidr) => {
      if (cidr.includes('/')) {
        return isIpInCidr(normalizedIp, cidr);
      }
      // Exact IP match
      return normalizedIp === cidr;
    });
  } catch (err) {
    console.error('Error parsing CIDR whitelist:', err.message);
    return false;
  }
}

/**
 * Authentication middleware factory
 * @param {'master'|undefined} mode - 'master' requires API_MASTER_KEY, default checks DB
 * @returns {Function} Express middleware
 */
function authMiddleware(mode) {
  return async (req, res, next) => {
    try {
      if (mode === 'master') {
        const masterKey = process.env.API_MASTER_KEY;
        if (!masterKey) {
          return res.status(401).json({
            error: 'Master key not configured on server',
            statusCode: 401,
          });
        }

        const providedKey =
          req.headers['x-api-key'] ||
          req.query.apiKey ||
          req.headers.authorization?.replace('Bearer ', '');

        if (!providedKey) {
          return res.status(401).json({
            error: 'API key is required',
            statusCode: 401,
          });
        }

        if (providedKey !== masterKey) {
          return res.status(403).json({
            error: 'Invalid master key',
            statusCode: 403,
          });
        }

        req.apiKey = { id: 'master', name: 'Master Key', permissions: '*' };
        return next();
      }

      // Default mode: validate against database
      const providedKey =
        req.headers['x-api-key'] ||
        req.query.apiKey ||
        req.headers.authorization?.replace('Bearer ', '');

      if (!providedKey) {
        return res.status(401).json({
          error: 'API key is required. Provide via x-api-key header, apiKey query param, or Bearer token.',
          statusCode: 401,
        });
      }

      const apiKey = await prisma.apiKey.findUnique({
        where: { key: providedKey },
      });

      if (!apiKey) {
        return res.status(401).json({
          error: 'Invalid API key',
          statusCode: 401,
        });
      }

      if (!apiKey.isActive) {
        return res.status(403).json({
          error: 'API key is inactive',
          statusCode: 403,
        });
      }

      // Check expiration
      if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
        return res.status(403).json({
          error: 'API key has expired',
          statusCode: 403,
        });
      }

      // Validate CIDR whitelist
      const clientIp =
        req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.connection?.remoteAddress ||
        req.ip;

      if (!validateCidr(clientIp, apiKey.cidrWhitelist)) {
        return res.status(403).json({
          error: 'IP address not allowed',
          statusCode: 403,
        });
      }

      // Update last used timestamp (non-blocking)
      prisma.apiKey
        .update({
          where: { id: apiKey.id },
          data: { lastUsedAt: new Date() },
        })
        .catch((err) => console.error('Failed to update lastUsedAt:', err.message));

      req.apiKey = apiKey;
      return next();
    } catch (err) {
      console.error('Auth middleware error:', err);
      return res.status(401).json({
        error: 'Authentication failed',
        statusCode: 401,
      });
    }
  };
}

module.exports = { authMiddleware };
