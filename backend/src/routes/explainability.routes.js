const express = require('express');
const router = express.Router();
const {
  getExplanationByAnomalyId,
  getDatasetExplanationMetrics,
  generateBatchExplanations,
} = require('../controllers/explainability.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

router.use(authenticate);

// Get aggregate faithfulness and stability metrics for a dataset
router.get('/metrics/:datasetId', getDatasetExplanationMetrics);

// Generate explanations for top anomalies of a dataset in batch
router.post('/batch', requireRole('ADMIN', 'ANALYST'), generateBatchExplanations);

// Get or lazily generate explanation, counterfactuals, and metrics for a specific anomaly record
router.get('/:anomalyId', getExplanationByAnomalyId);

module.exports = router;
