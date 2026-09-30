const express = require('express');
const router = express.Router();
const {
  getAuditChainBlocks,
  verifyAuditChain,
  getDatasetCertificate,
  exportCertificateJson,
  exportAnomaliesCsv,
} = require('../controllers/report.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);

// Cryptographic Hash Chain verification and blocks
router.get('/audit/verify', verifyAuditChain);
router.get('/audit/chain', getAuditChainBlocks);

// Decision-Support Audit Certificate for dataset
router.get('/dataset/:datasetId', getDatasetCertificate);
router.get('/dataset/:datasetId/export/json', exportCertificateJson);
router.get('/dataset/:datasetId/export/csv', exportAnomaliesCsv);

module.exports = router;
