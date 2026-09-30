const express = require('express');
const router = express.Router();
const {
  getWeightsConfig,
  tuneWeights,
  recalculateScores,
  resetWeights,
} = require('../controllers/modelConfig.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

router.use(authenticate);

// Get active detector weight configurations & history
router.get('/weights', getWeightsConfig);
router.get('/weights/:datasetId', getWeightsConfig);

// Manually tune detector weights or update learning parameters (Admin / Analyst)
router.post('/weights/tune', requireRole('ADMIN', 'ANALYST'), tuneWeights);
router.post('/weights/:datasetId/tune', requireRole('ADMIN', 'ANALYST'), tuneWeights);

// Recalculate anomaly ensemble scores using active adaptive weights
router.post('/weights/recalculate', requireRole('ADMIN', 'ANALYST'), recalculateScores);
router.post('/weights/:datasetId/recalculate', requireRole('ADMIN', 'ANALYST'), recalculateScores);

// Reset detector weights to system default baselines
router.post('/weights/reset', requireRole('ADMIN', 'ANALYST'), resetWeights);
router.post('/weights/:datasetId/reset', requireRole('ADMIN', 'ANALYST'), resetWeights);

module.exports = router;
