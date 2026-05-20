/**
 * Global error handler middleware
 * Catches all unhandled errors and returns a consistent JSON response
 */
function errorHandler(err, req, res, next) {
  // Log the error for debugging
  console.error('Error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  // Determine status code
  const statusCode = err.statusCode || err.status || 500;

  // Build error response
  const response = {
    error: err.message || 'Internal Server Error',
    statusCode,
  };

  // Include stack trace in development mode
  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  // Include validation errors if present
  if (err.errors) {
    response.errors = err.errors;
  }

  res.status(statusCode).json(response);
}

module.exports = { errorHandler };
