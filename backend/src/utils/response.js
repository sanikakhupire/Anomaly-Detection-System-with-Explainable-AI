/**
 * Standard API response formatter conforming to project rules:
 * { success, message, data, error }
 */
const sendSuccess = (res, statusCode = 200, message = 'Success', data = null) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    error: null,
  });
};

const sendError = (res, statusCode = 500, message = 'Internal Server Error', error = null) => {
  return res.status(statusCode).json({
    success: false,
    message,
    data: null,
    error: error || { message },
  });
};

module.exports = {
  sendSuccess,
  sendError,
};
