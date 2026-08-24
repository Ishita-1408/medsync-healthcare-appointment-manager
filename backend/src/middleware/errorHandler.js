/**
 * 404 Not Found Handler
 */
export function notFoundHandler(req, res, next) {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.originalUrl} not found.`,
  });
}

/**
 * Global Centralized Error Handler
 */
export function globalErrorHandler(err, req, res, next) {
  console.error('Unhandled Application Error:', err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
  });
}
