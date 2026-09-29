const express = require('express');
const router = express.Router();
const { register, login, logout, getMe } = require('../controllers/auth.controller');
const { validateRegister, validateLogin } = require('../validators/auth.validator');
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const { sendSuccess } = require('../utils/response');

// Public auth endpoints
router.post('/register', validateRegister, register);
router.post('/login', validateLogin, login);

// Authenticated endpoints
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);

// Role verification endpoints (used for RBAC testing and permission checks)
router.get('/admin-only', authenticate, requireRole('ADMIN'), (req, res) => {
  return sendSuccess(res, 200, 'Admin privilege confirmed', { user: req.user });
});

router.get('/analyst-only', authenticate, requireRole('ADMIN', 'ANALYST'), (req, res) => {
  return sendSuccess(res, 200, 'Analyst privilege confirmed', { user: req.user });
});

router.get('/reviewer-only', authenticate, requireRole('ADMIN', 'REVIEWER'), (req, res) => {
  return sendSuccess(res, 200, 'Reviewer privilege confirmed', { user: req.user });
});

module.exports = router;
