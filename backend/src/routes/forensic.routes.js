const express = require('express');
const router = express.Router();
const {
  runForensics,
  getForensicsByDataset,
  getForensicReportById,
} = require('../controllers/forensic.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

router.use(authenticate);

// Run statistical forensic battery (Benford 1st/2nd, Last digit, Digit heaping, Round number, Turnout/Vote-share)
router.post('/run', requireRole('ADMIN', 'ANALYST'), runForensics);

// Get forensic reports for a dataset
router.get('/:datasetId', getForensicsByDataset);

// Get a specific forensic report with full digit frequencies and statistics
router.get('/report/:id', getForensicReportById);

module.exports = router;
