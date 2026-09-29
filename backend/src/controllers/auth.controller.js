const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sendSuccess, sendError } = require('../utils/response');
const { logAudit } = require('../services/audit.service');

const generateToken = (user) => {
  const secret = process.env.JWT_SECRET || 'super_secret_jwt_key_for_development_change_in_production_123';
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      role: user.role,
    },
    secret,
    { expiresIn }
  );
};

/**
 * Register a new user
 * POST /api/auth/register
 */
const register = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return sendError(res, 400, 'A user with this email address already exists', {
        field: 'email',
        code: 'USER_ALREADY_EXISTS',
      });
    }

    const passwordHash = await User.hashPassword(password);
    const userRole = role && ['ADMIN', 'ANALYST', 'REVIEWER'].includes(role) ? role : 'ANALYST';

    const newUser = await User.create({
      name,
      email: email.toLowerCase(),
      passwordHash,
      role: userRole,
    });

    const token = generateToken(newUser);

    await logAudit({
      user: newUser._id,
      action: 'USER_REGISTERED',
      entity: 'User',
      entityId: newUser._id,
      metadata: { email: newUser.email, role: newUser.role },
      req,
    });

    return sendSuccess(res, 201, 'User registered successfully', {
      user: newUser,
      token,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Log in existing user
 * POST /api/auth/login
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      await logAudit({
        action: 'LOGIN_FAILED',
        entity: 'Auth',
        metadata: { email, reason: 'USER_NOT_FOUND' },
        req,
      });
      return sendError(res, 401, 'Invalid email or password', {
        code: 'INVALID_CREDENTIALS',
      });
    }

    if (!user.isActive) {
      await logAudit({
        user: user._id,
        action: 'LOGIN_BLOCKED',
        entity: 'Auth',
        metadata: { email, reason: 'ACCOUNT_DEACTIVATED' },
        req,
      });
      return sendError(res, 403, 'Account is deactivated. Contact an administrator.', {
        code: 'ACCOUNT_DEACTIVATED',
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await logAudit({
        user: user._id,
        action: 'LOGIN_FAILED',
        entity: 'Auth',
        metadata: { email, reason: 'PASSWORD_MISMATCH' },
        req,
      });
      return sendError(res, 401, 'Invalid email or password', {
        code: 'INVALID_CREDENTIALS',
      });
    }

    const token = generateToken(user);

    await logAudit({
      user: user._id,
      action: 'USER_LOGIN',
      entity: 'Auth',
      entityId: user._id,
      metadata: { email: user.email, role: user.role },
      req,
    });

    return sendSuccess(res, 200, 'Login successful', {
      user,
      token,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Log out current user (session termination & audit)
 * POST /api/auth/logout
 */
const logout = async (req, res, next) => {
  try {
    if (req.user) {
      await logAudit({
        user: req.user._id,
        action: 'USER_LOGOUT',
        entity: 'Auth',
        entityId: req.user._id,
        metadata: { email: req.user.email },
        req,
      });
    }

    return sendSuccess(res, 200, 'Logout successful', null);
  } catch (error) {
    next(error);
  }
};

/**
 * Get current authenticated user details
 * GET /api/auth/me
 */
const getMe = async (req, res, next) => {
  try {
    return sendSuccess(res, 200, 'Current user profile retrieved', {
      user: req.user,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  logout,
  getMe,
};
