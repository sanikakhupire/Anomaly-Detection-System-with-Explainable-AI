const express = require('express');
const router = express.Router();
const {
  runFusion,
  getFusions,
  getFusionById,
  resolveConflict,
  deleteFusion,
} = require('../controllers/fusion.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

router.use(authenticate);

// Run data fusion and provenance conflict detection between two datasets
router.post('/run', requireRole('ADMIN', 'ANALYST'), runFusion);

// Get list of data fusion runs with pagination
router.get('/', getFusions);

// Get specific fusion details and conflicts
router.get('/:id', getFusionById);

// Resolve conflict with provenance tracking
router.patch('/:id/resolve', requireRole('ADMIN', 'ANALYST', 'REVIEWER'), resolveConflict);

// Delete fusion run
router.delete('/:id', requireRole('ADMIN'), deleteFusion);

module.exports = router;
