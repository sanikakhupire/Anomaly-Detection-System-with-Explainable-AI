const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { getJobById } = require('../controllers/dataset.controller');

// Polling endpoint for background processing jobs
router.get('/:id', authenticate, getJobById);

module.exports = router;
