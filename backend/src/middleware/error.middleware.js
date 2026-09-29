const { sendError } = require('../utils/response');

/**
 * Central error handling middleware.
 * Ensures consistent API response format: { success, message, data, error }
 * Hides internal stack traces in production to prevent information disclosure.
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let errorDetails = null;

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation error occurred';
    errorDetails = Object.values(err.errors).map((val) => ({
      field: val.path,
      message: val.message,
    }));
  }

  // Mongoose duplicate key error (code 11000)
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `Duplicate entry for ${field}`;
    errorDetails = { field, value: err.keyValue ? err.keyValue[field] : undefined };
  }

  // Mongoose invalid ObjectId (CastError)
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid format for resource identifier: ${err.value}`;
    errorDetails = { field: err.path, value: err.value };
  }

  // JSON parse error in body
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    statusCode = 400;
    message = 'Malformed JSON payload';
  }

  // Log unexpected errors
  if (statusCode >= 500 && process.env.NODE_ENV !== 'test') {
    console.error(`[Unhandled Error] ${err.stack || err.message}`);
  }

  const payload = {
    code: err.code || 'SERVER_ERROR',
    ...(errorDetails && { details: errorDetails }),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  };

  return sendError(res, statusCode, message, payload);
};

module.exports = errorHandler;
