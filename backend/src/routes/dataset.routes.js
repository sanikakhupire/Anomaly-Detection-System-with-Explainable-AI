const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload.middleware');
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const {
  uploadDataset,
  getDatasets,
  getDatasetById,
  deleteDataset,
} = require('../controllers/dataset.controller');

// Role-protected upload endpoint (ANALYST and ADMIN can ingest datasets)
router.post(
  '/upload',
  authenticate,
  requireRole('ADMIN', 'ANALYST'),
  upload.single('file'),
  uploadDataset
);

// Read datasets (authenticated users: ADMIN, ANALYST, REVIEWER)
router.get('/', authenticate, getDatasets);
router.get('/:id', authenticate, getDatasetById);

// Schema mapping endpoints (GET: view/infer, PUT: confirm/edit)
const { getSchemaMapping, updateSchemaMapping } = require('../controllers/feature.controller');
router.get('/:id/schema-mapping', authenticate, getSchemaMapping);
router.put(
  '/:id/schema-mapping',
  authenticate,
  requireRole('ADMIN', 'ANALYST'),
  updateSchemaMapping
);

// Delete dataset (ADMIN and ANALYST)
router.delete('/:id', authenticate, requireRole('ADMIN', 'ANALYST'), deleteDataset);

module.exports = router;
