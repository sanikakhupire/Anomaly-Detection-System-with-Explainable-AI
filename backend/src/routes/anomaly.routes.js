const express = require('express');
const router = express.Router();
const {
  detectAnomalies,
  getAnomalies,
  getAnomalyById,
  updateAnomalyStatus,
} = require('../controllers/anomaly.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

router.use(authenticate);

// Run anomaly detection pipeline
router.post('/detect', requireRole('ADMIN', 'ANALYST'), detectAnomalies);

// Paginated query with server-side filters & sorting
router.get('/', getAnomalies);

// Specific anomaly record
router.get('/:id', getAnomalyById);

// Update status, review verdict, notes
router.patch('/:id/status', requireRole('ADMIN', 'ANALYST', 'REVIEWER'), updateAnomalyStatus);

module.exports = router;
