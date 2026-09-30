const express = require('express');
const router = express.Router();
const {
  getReviewQueue,
  getValidationReport,
  validateAnomalyRecord,
  batchValidate,
  submitHumanReview,
} = require('../controllers/validation.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

router.use(authenticate);

// Get prioritized review queue sorted by ATPI with multi-factor filtering
router.get('/queue', getReviewQueue);

// Batch validate top unvalidated anomalies for a dataset
router.post('/batch', requireRole('ADMIN', 'ANALYST'), batchValidate);

// Submit human reviewer verdict and audit note
router.post('/:anomalyId/review', requireRole('ADMIN', 'ANALYST', 'REVIEWER'), submitHumanReview);

// Get or lazily generate validation report for an anomaly
router.get('/:anomalyId', getValidationReport);

// Trigger or re-run multi-agent validation for an anomaly
router.post('/:anomalyId', requireRole('ADMIN', 'ANALYST'), validateAnomalyRecord);

module.exports = router;
