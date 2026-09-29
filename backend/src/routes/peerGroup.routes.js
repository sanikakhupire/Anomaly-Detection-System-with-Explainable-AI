const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const {
  buildPeerGroupsHandler,
  getPeerGroupsByDataset,
} = require('../controllers/peerGroup.controller');

// Build hierarchy-aware peer groups and compute shrunk baselines (ADMIN and ANALYST)
router.post('/build', authenticate, requireRole('ADMIN', 'ANALYST'), buildPeerGroupsHandler);

// Retrieve peer groups and baselines for dataset
router.get('/:datasetId', authenticate, getPeerGroupsByDataset);

module.exports = router;
