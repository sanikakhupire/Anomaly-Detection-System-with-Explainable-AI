const express = require('express');
const router = express.Router();
const {
  createRun,
  getRuns,
  getRunById,
  exportLatex,
} = require('../controllers/experiment.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

router.use(authenticate);

// List experiment runs
router.get('/', getRuns);

// Get single experiment run details
router.get('/:id', getRunById);

// Export publication-ready LaTeX tables
router.get('/:id/latex', exportLatex);

// Initialize a new benchmark experiment run (Admin / Analyst)
router.post('/run', requireRole('ADMIN', 'ANALYST'), createRun);

module.exports = router;
