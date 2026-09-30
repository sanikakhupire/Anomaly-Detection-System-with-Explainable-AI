const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const errorHandler = require('./middleware/error.middleware');
const { sendSuccess, sendError } = require('./utils/response');
const authRoutes = require('./routes/auth.routes');
const datasetRoutes = require('./routes/dataset.routes');
const jobRoutes = require('./routes/job.routes');
const featureRoutes = require('./routes/feature.routes');
const peerGroupRoutes = require('./routes/peerGroup.routes');
const anomalyRoutes = require('./routes/anomaly.routes');
const forensicRoutes = require('./routes/forensic.routes');
const fusionRoutes = require('./routes/fusion.routes');
const explainabilityRoutes = require('./routes/explainability.routes');
const validationRoutes = require('./routes/validation.routes');
const modelConfigRoutes = require('./routes/modelConfig.routes');

const app = express();

// Security HTTP headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// CORS configuration
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, true); // Permissive in development
    },
    credentials: true,
  })
);

// Compression
app.use(compression());

// Body parsers
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// General Rate Limiter (skip in tests)
if (process.env.NODE_ENV !== 'test') {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // limit each IP to 1000 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: 'Too many requests from this IP, please try again after 15 minutes',
      data: null,
      error: { code: 'RATE_LIMIT_EXCEEDED' },
    },
  });
  app.use('/api', limiter);
}

// Health check endpoint
app.get('/health', (req, res) => {
  return sendSuccess(res, 200, 'Statistical Anomaly Detection Backend is healthy', {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.get('/api/health', (req, res) => {
  return sendSuccess(res, 200, 'Statistical Anomaly Detection API is healthy', {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/datasets', datasetRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/features', featureRoutes);
app.use('/api/peer-groups', peerGroupRoutes);
app.use('/api/anomalies', anomalyRoutes);
app.use('/api/forensics', forensicRoutes);
app.use('/api/fusion', fusionRoutes);
app.use('/api/explanations', explainabilityRoutes);
app.use('/api/validations', validationRoutes);
app.use('/api/models', modelConfigRoutes);

// 404 Handler for undefined routes
app.use((req, res) => {
  return sendError(res, 404, `Endpoint ${req.method} ${req.originalUrl} not found`, {
    code: 'ROUTE_NOT_FOUND',
  });
});

// Central Error Handler
app.use(errorHandler);

module.exports = app;
