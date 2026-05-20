const rateLimit = require('express-rate-limit');

/**
 * Dynamic rate limiter middleware
 * Uses per-key rate limits from the database if available,
 * otherwise falls back to environment variable defaults.
 */
const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
  max: (req) => {
    // Use per-key rate limit if authenticated
    if (req.apiKey && req.apiKey.rateLimit) {
      return req.apiKey.rateLimit;
    }
    return parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100;
  },
  keyGenerator: (req) => {
    // Use API key ID for rate limiting if available, otherwise use IP
    if (req.apiKey && req.apiKey.id) {
      return req.apiKey.id;
    }
    return (
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.connection?.remoteAddress ||
      req.ip
    );
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  message: {
    error: 'Too many requests, please try again later',
    statusCode: 429,
  },
  skip: (req) => {
    // Skip rate limiting for master key
    return req.apiKey && req.apiKey.id === 'master';
  },
});

module.exports = { rateLimiter };
