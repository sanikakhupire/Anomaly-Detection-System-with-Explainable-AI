const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sendError } = require('../utils/response');

/**
 * Authentication middleware verifying JWT Bearer tokens
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendError(res, 401, 'Authentication token missing or invalid format', {
        code: 'AUTH_TOKEN_MISSING',
      });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return sendError(res, 401, 'Authentication token not provided', {
        code: 'AUTH_TOKEN_MISSING',
      });
    }

    const secret = process.env.JWT_SECRET || 'super_secret_jwt_key_for_development_change_in_production_123';
    let decoded;
    try {
      decoded = jwt.verify(token, secret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return sendError(res, 401, 'Authentication token has expired', {
          code: 'AUTH_TOKEN_EXPIRED',
        });
      }
      return sendError(res, 401, 'Invalid authentication token', {
        code: 'AUTH_TOKEN_INVALID',
      });
    }

    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) {
      return sendError(res, 401, 'User account not found or deactivated', {
        code: 'USER_INACTIVE',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return sendError(res, 500, 'Authentication error', { message: error.message });
  }
};

/**
 * Role-check middleware enforcing RBAC
 * Usage: requireRole('ADMIN') or requireRole('ADMIN', 'ANALYST')
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 401, 'Authentication required', { code: 'UNAUTHENTICATED' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return sendError(
        res,
        403,
        `Access denied. Role '${req.user.role}' lacks permission for this resource. Required: [${allowedRoles.join(', ')}]`,
        { code: 'FORBIDDEN', requiredRoles: allowedRoles, currentRole: req.user.role }
      );
    }

    next();
  };
};

module.exports = {
  authenticate,
  requireRole,
};
