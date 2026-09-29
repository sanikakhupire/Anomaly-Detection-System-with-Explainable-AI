const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const { runFeatures, getFeaturesByDataset } = require('../controllers/feature.controller');

// Execute feature engineering plugins (ADMIN and ANALYST)
router.post('/run', authenticate, requireRole('ADMIN', 'ANALYST'), runFeatures);

// Retrieve features for dataset
router.get('/:datasetId', authenticate, getFeaturesByDataset);

module.exports = router;
